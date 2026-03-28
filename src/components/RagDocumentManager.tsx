/**
 * RagDocumentManager — document upload, index browser, search tester, and
 * collection manager for the AgentOS RAG stack.
 *
 * Sub-tabs:
 *   Upload     — drag-and-drop file area + URL input.
 *   Documents  — indexed document table with delete action.
 *   Search     — query input, rerank toggle, results with relevance scores.
 *   Chunks     — per-document chunk viewer with token counts.
 *   Collections — create/delete named collections, assign documents.
 *
 * All state lives in {@link useRagDocStore}.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText,
  Globe,
  Search,
  Layers,
  Folder,
  Upload,
  Trash2,
  RefreshCw,
  Link,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from 'lucide-react';
import { DataSourceBadge } from '@/components/DataSourceBadge';
import { groupResultsByDocumentId } from '@/lib/resultGroups';
import {
  useRagDocStore,
  type RagDocument,
  type SearchResult,
  type DocumentChunk,
  type RagSubTab,
  type ChunkViewOrigin,
} from '@/state/ragDocStore';
import { HelpTooltip } from '@/components/ui/HelpTooltip';

const SUB_TABS: Array<{ key: RagSubTab; label: string }> = [
  { key: 'upload',      label: 'Upload'      },
  { key: 'documents',   label: 'Documents'   },
  { key: 'search',      label: 'Search'      },
  { key: 'chunks',      label: 'Chunks'      },
  { key: 'collections', label: 'Collections' },
];

// ---------------------------------------------------------------------------
// Document type icon + badge
// ---------------------------------------------------------------------------

const DOC_TYPE_ICON: Record<RagDocument['type'], LucideIcon> = {
  markdown: FileText,
  pdf:      FileText,
  text:     FileText,
  url:      Globe,
};

const DOC_TYPE_COLOR: Record<RagDocument['type'], string> = {
  markdown: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  pdf:      'border-rose-500/30 bg-rose-500/10 text-rose-400',
  text:     'border-violet-500/30 bg-violet-500/10 text-violet-400',
  url:      'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
};

function DocTypeBadge({ type }: { type: RagDocument['type'] }) {
  return (
    <span className={`rounded-sm border px-1.5 py-px text-[9px] font-medium uppercase ${DOC_TYPE_COLOR[type]}`}>
      {type}
    </span>
  );
}

function formatBytes(bytes?: number): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMirrorCheckedAt(timestamp: string | null): string | null {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

const CHUNK_VIEW_ORIGIN_META: Record<ChunkViewOrigin, {
  tone: 'runtime' | 'demo' | 'neutral';
  label: string;
  description: string;
}> = {
  'manual-document': {
    tone: 'neutral',
    label: 'Manual Open',
    description: 'Opened from the document list.',
  },
  'search-result': {
    tone: 'demo',
    label: 'Search Result',
    description: 'Jumped here from a document-manager search result.',
  },
  'runtime-result': {
    tone: 'runtime',
    label: 'Runtime Result',
    description: 'Jumped here from a live runtime retrieval result.',
  },
  'runtime-note': {
    tone: 'runtime',
    label: 'Runtime Note',
    description: 'Opened from the last live runtime note ingest.',
  },
};

// ---------------------------------------------------------------------------
// Drag-and-drop upload area
// ---------------------------------------------------------------------------

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  uploading: boolean;
}

function DropZone({ onFiles, uploading }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors',
        dragOver ? 'border-sky-500/60 bg-sky-500/10' : 'theme-border theme-bg-primary',
      ].join(' ')}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      role="button"
      tabIndex={0}
      aria-label="Drop files here or click to browse"
    >
      <Upload size={24} className={dragOver ? 'text-sky-400' : 'theme-text-muted'} aria-hidden="true" />
      <div className="text-center">
        <p className="text-xs font-medium theme-text-primary">
          {uploading ? 'Uploading…' : 'Drop files here, or click to browse'}
        </p>
        <p className="mt-0.5 text-[10px] theme-text-muted">
          Supports .md, .txt, .pdf files
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".md,.txt,.pdf,text/plain,text/markdown,application/pdf"
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          e.target.value = '';
        }}
        aria-hidden="true"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// URL input row
// ---------------------------------------------------------------------------

interface UrlInputRowProps {
  onSubmit: (url: string) => void;
  uploading: boolean;
}

function UrlInputRow({ onSubmit, uploading }: UrlInputRowProps) {
  const [value, setValue] = useState('');
  const handle = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Link size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 theme-text-muted" aria-hidden="true" />
        <input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handle(); }}
          placeholder="https://example.com/docs"
          className="w-full rounded-md border theme-border theme-bg-primary py-1.5 pl-7 pr-3 text-xs theme-text-primary placeholder:theme-text-muted focus:border-sky-500 focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={handle}
        disabled={!value.trim() || uploading}
        className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {uploading ? <RefreshCw size={11} className="animate-spin" aria-hidden="true" /> : 'Index URL'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document table row
// ---------------------------------------------------------------------------

interface DocRowProps {
  doc: RagDocument;
  onDelete: () => void;
  onViewChunks: () => void;
}

function DocRow({ doc, onDelete, onViewChunks }: DocRowProps) {
  const Icon = DOC_TYPE_ICON[doc.type];
  return (
    <li className="flex items-center gap-2 rounded-lg border theme-border theme-bg-primary px-3 py-2 text-[10px]">
      <Icon size={12} className="shrink-0 theme-text-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium theme-text-primary">{doc.name}</p>
        <p className="theme-text-muted">
          {doc.chunkCount} chunks · {formatBytes(doc.sizeBytes)} ·{' '}
          {new Date(doc.indexedAt).toLocaleDateString()}
        </p>
      </div>
      <DocTypeBadge type={doc.type} />
      <DataSourceBadge
        tone={doc.mode === 'runtime' ? 'runtime' : 'demo'}
        label={doc.mode === 'runtime' ? 'Runtime' : 'Demo'}
        className="px-1.5 py-0.5 text-[8px]"
      />
      <button
        type="button"
        onClick={onViewChunks}
        className="shrink-0 rounded-full border theme-border bg-[color:var(--color-background-secondary)] px-2 py-0.5 text-[9px] theme-text-secondary hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        title="View chunks"
      >
        Chunks
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[9px] text-rose-400 hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        title="Delete document from index"
      >
        <Trash2 size={9} aria-hidden="true" />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Search result card
// ---------------------------------------------------------------------------

function SearchResultCard({
  result,
  rank,
  onOpenChunk,
  openChunkLabel = 'Open Chunk',
  chunkActionNote,
}: {
  result: SearchResult;
  rank: number;
  onOpenChunk?: () => void;
  openChunkLabel?: string;
  chunkActionNote?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const resultTone = result.mode === 'runtime' ? 'runtime' : 'demo';
  const resultLabel = result.mode === 'runtime' ? 'Runtime' : 'Demo';
  const canOpenChunk = Boolean(onOpenChunk);

  return (
    <li className="rounded-lg border theme-border theme-bg-primary px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="font-mono text-sky-400">#{rank}</span>
            <span className="font-medium theme-text-primary truncate">{result.documentName}</span>
            <span className="theme-text-muted shrink-0">chunk {result.chunkIndex}</span>
            <DataSourceBadge tone={resultTone} label={resultLabel} className="px-1.5 py-0.5 text-[8px]" />
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[10px] theme-text-secondary">
            <span>
              Score: <span className="font-mono font-semibold theme-text-primary">{result.score.toFixed(3)}</span>
            </span>
            {result.sourceLabel && (
              <span>
                Source: <span className="font-mono font-semibold theme-text-primary">{result.sourceLabel}</span>
              </span>
            )}
            {result.rerankScore != null && (
              <span>
                Rerank: <span className="font-mono font-semibold text-emerald-400">{result.rerankScore.toFixed(3)}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onOpenChunk}
            disabled={!canOpenChunk}
            className="rounded-full border theme-border bg-[color:var(--color-background-secondary)] px-2 py-0.5 text-[9px] theme-text-secondary hover:opacity-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title={chunkActionNote ?? 'Open this exact chunk in the chunk viewer'}
          >
            {canOpenChunk ? openChunkLabel : 'No Mirror'}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full border theme-border bg-[color:var(--color-background-secondary)] p-1 theme-text-secondary hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title={expanded ? 'Collapse' : 'Expand'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp size={11} aria-hidden="true" /> : <ChevronDown size={11} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {chunkActionNote && (
        <p className="mt-2 text-[10px] text-amber-300">
          {chunkActionNote}
        </p>
      )}
      {expanded && (
        <pre className="mt-2 whitespace-pre-wrap break-all rounded-md border theme-border bg-[color:var(--color-background-tertiary,theme(colors.slate.900))] p-2 text-[10px] theme-text-secondary max-h-40 overflow-y-auto">
          {result.text}
        </pre>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Chunk viewer card
// ---------------------------------------------------------------------------

function ChunkCard({
  chunk,
  highlighted = false,
  highlightRequestId = 0,
}: {
  chunk: DocumentChunk;
  highlighted?: boolean;
  highlightRequestId?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const chunkRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!highlighted) {
      return;
    }
    setExpanded(true);
    chunkRef.current?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    });
  }, [highlightRequestId, highlighted]);

  return (
    <li
      ref={chunkRef}
      className={[
        'rounded-lg border px-3 py-2',
        highlighted
          ? 'border-sky-500/50 bg-sky-500/10 shadow-[0_0_0_1px_rgba(14,165,233,0.18)]'
          : 'theme-border theme-bg-primary',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="font-mono text-sky-400">{chunk.displayLabel ?? `#${chunk.index}`}</span>
          <span className="theme-text-secondary">{chunk.tokenCount} tokens</span>
          {chunk.overlapTokens > 0 && (
            <span className="theme-text-muted">{chunk.overlapTokens} overlap</span>
          )}
          {highlighted && (
            <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.2em] text-sky-300">
              Match
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-full border theme-border bg-[color:var(--color-background-secondary)] px-2 py-0.5 text-[9px] theme-text-secondary hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-expanded={expanded}
        >
          {expanded ? 'Hide' : 'View'}
        </button>
      </div>
      {expanded && (
        <pre className="mt-2 whitespace-pre-wrap break-all rounded-md border theme-border bg-[color:var(--color-background-tertiary,theme(colors.slate.900))] p-2 text-[10px] theme-text-secondary max-h-40 overflow-y-auto">
          {chunk.text}
        </pre>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * RagDocumentManager — full document lifecycle management for the AgentOS RAG stack.
 *
 * Upload files or URLs, browse indexed documents, test semantic search queries,
 * inspect how documents were chunked, and manage named collections.
 */
export function RagDocumentManager() {
  const documents       = useRagDocStore((s) => s.documents);
  const activeSubTab    = useRagDocStore((s) => s.activeSubTab);
  const searchResults   = useRagDocStore((s) => s.searchResults);
  const searchCollectionId = useRagDocStore((s) => s.searchCollectionId);
  const uploadCollectionId = useRagDocStore((s) => s.uploadCollectionId);
  const rerankEnabled   = useRagDocStore((s) => s.rerankEnabled);
  const selectedDocChunks = useRagDocStore((s) => s.selectedDocChunks);
  const selectedDocId   = useRagDocStore((s) => s.selectedDocId);
  const selectedDocMode = useRagDocStore((s) => s.selectedDocMode);
  const selectedDocNameOverride = useRagDocStore((s) => s.selectedDocNameOverride);
  const selectedDocPreviewMode = useRagDocStore((s) => s.selectedDocPreviewMode);
  const selectedDocPreviewSourceLabel = useRagDocStore((s) => s.selectedDocPreviewSourceLabel);
  const selectedDocPreviewCheckedAt = useRagDocStore((s) => s.selectedDocPreviewCheckedAt);
  const highlightedChunkIndex = useRagDocStore((s) => s.highlightedChunkIndex);
  const highlightedChunkPreviewKey = useRagDocStore((s) => s.highlightedChunkPreviewKey);
  const highlightedChunkRequestId = useRagDocStore((s) => s.highlightedChunkRequestId);
  const chunkViewOrigin = useRagDocStore((s) => s.chunkViewOrigin);
  const collections     = useRagDocStore((s) => s.collections);
  const embeddingCostUsd = useRagDocStore((s) => s.embeddingCostUsd);
  const embeddingCallCount = useRagDocStore((s) => s.embeddingCallCount);
  const runtimeStatus   = useRagDocStore((s) => s.runtimeStatus);
  const runtimeDataSources = useRagDocStore((s) => s.runtimeDataSources);
  const runtimeMessage  = useRagDocStore((s) => s.runtimeMessage);
  const lastSearchMode  = useRagDocStore((s) => s.lastSearchMode);
  const lastUploadMode  = useRagDocStore((s) => s.lastUploadMode);
  const uploadNotice    = useRagDocStore((s) => s.uploadNotice);
  const loading         = useRagDocStore((s) => s.loading);
  const uploading       = useRagDocStore((s) => s.uploading);
  const searching       = useRagDocStore((s) => s.searching);
  const chunksLoading   = useRagDocStore((s) => s.chunksLoading);
  const error           = useRagDocStore((s) => s.error);
  const refreshRuntimeAvailability = useRagDocStore((s) => s.refreshRuntimeAvailability);
  const fetchDocuments  = useRagDocStore((s) => s.fetchDocuments);
  const uploadFile      = useRagDocStore((s) => s.uploadFile);
  const uploadUrl       = useRagDocStore((s) => s.uploadUrl);
  const search          = useRagDocStore((s) => s.search);
  const setActiveSubTab = useRagDocStore((s) => s.setActiveSubTab);
  const setSearchCollectionFilter = useRagDocStore((s) => s.setSearchCollectionFilter);
  const setUploadCollectionId = useRagDocStore((s) => s.setUploadCollectionId);
  const setRerankEnabled = useRagDocStore((s) => s.setRerankEnabled);
  const viewDocumentChunks = useRagDocStore((s) => s.viewDocumentChunks);
  const openDocumentChunks = useRagDocStore((s) => s.openDocumentChunks);
  const previewRuntimeResultChunk = useRagDocStore((s) => s.previewRuntimeResultChunk);
  const createCollection = useRagDocStore((s) => s.createCollection);
  const deleteCollection = useRagDocStore((s) => s.deleteCollection);
  const assignToCollection = useRagDocStore((s) => s.assignToCollection);
  const deleteDocument  = useRagDocStore((s) => s.deleteDocument);
  const refreshRuntimeDocumentMirror = useRagDocStore((s) => s.refreshRuntimeDocumentMirror);

  const [searchQuery, setSearchQuery]     = useState('');
  const [newColName, setNewColName]       = useState('');
  const [newCollectionMode, setNewCollectionMode] = useState<'runtime' | 'demo'>('demo');
  const [refreshingPreviewMirror, setRefreshingPreviewMirror] = useState(false);

  useEffect(() => {
    void fetchDocuments();
    void refreshRuntimeAvailability();
  }, [fetchDocuments, refreshRuntimeAvailability]);

  const handleFiles = useCallback(
    (files: File[]) => {
      files.forEach((f) => void uploadFile(f));
    },
    [uploadFile],
  );

  const handleSearch = () => {
    if (searchQuery.trim()) void search(searchQuery.trim());
  };

  const selectedDocName = selectedDocNameOverride ?? documents.find((d) => d.id === selectedDocId)?.name ?? 'Unknown';
  const selectedSearchCollection = collections.find((collection) => collection.id === searchCollectionId) ?? null;
  const selectedUploadCollection = collections.find((collection) => collection.id === uploadCollectionId) ?? null;
  const chunkViewOriginMeta = chunkViewOrigin ? CHUNK_VIEW_ORIGIN_META[chunkViewOrigin] : null;
  const documentIds = new Set(documents.map((document) => document.id));
  const runtimePreviewMatchesByDocumentId = groupResultsByDocumentId(
    searchResults.filter((result) => result.mode === 'runtime' && !documentIds.has(result.documentId)),
  );
  const selectedRuntimeDocument = selectedDocId
    ? documents.find((document) => document.id === selectedDocId && document.mode === 'runtime') ?? null
    : null;
  const selectedDocSourceMode = selectedDocMode ?? documents.find((document) => document.id === selectedDocId)?.mode ?? null;
  const previewMirrorAvailable = Boolean(
    selectedDocPreviewMode === 'runtime-result-preview' &&
    selectedDocId &&
    documentIds.has(selectedDocId),
  );
  const previewMirrorTone = previewMirrorAvailable ? 'runtime' : 'mixed';
  const previewMirrorLabel = previewMirrorAvailable ? 'Mirror Ready' : 'Mirror Pending';
  const previewMirrorCheckedLabel = formatMirrorCheckedAt(selectedDocPreviewCheckedAt);
  const previewRuntimeChunkCount = selectedDocPreviewMode === 'runtime-result-preview' ? selectedDocChunks.length : 0;
  const previewRuntimeChunkLabel =
    previewRuntimeChunkCount === 1 ? '1 Preview Hit' : `${previewRuntimeChunkCount} Preview Hits`;
  const highlightedPreviewChunkLabel =
    highlightedChunkPreviewKey
      ? selectedDocChunks.find((chunk) => chunk.previewKey === highlightedChunkPreviewKey)?.displayLabel ?? null
      : null;
  const selectedRuntimeSourceLabel = selectedRuntimeDocument?.dataSourceId ?? selectedDocPreviewSourceLabel;
  const runtimeTone =
    runtimeStatus === 'ready'
      ? 'runtime'
      : runtimeStatus === 'degraded'
        ? 'mixed'
        : runtimeStatus === 'checking'
          ? 'neutral'
          : 'demo';
  const runtimeLabel =
    runtimeStatus === 'ready'
      ? 'Runtime Ready'
      : runtimeStatus === 'degraded'
        ? 'Runtime Degraded'
        : runtimeStatus === 'checking'
          ? 'Checking Runtime'
          : 'Runtime Disabled';
  const searchModeTone =
    lastSearchMode === 'runtime'
      ? 'runtime'
      : lastSearchMode === 'demo'
        ? 'demo'
        : runtimeStatus === 'ready'
          ? 'runtime'
          : 'demo';
  const searchModeLabel =
    lastSearchMode === 'runtime'
      ? 'Live Search'
      : lastSearchMode === 'demo'
        ? 'Demo Search'
        : runtimeStatus === 'ready'
          ? 'Search Defaults To Runtime'
          : 'Search Defaults To Demo';

  return (
    <section className="rounded-xl border theme-border theme-bg-secondary-soft p-3 transition-theme">
      {/* Header */}
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">RAG</p>
            <h3 className="text-sm font-semibold theme-text-primary">Document Manager</h3>
          </div>
          <HelpTooltip label="Explain RAG document manager" side="bottom">
            Upload documents into the vector store, browse indexed content, test semantic search,
            inspect chunk splits, and organise documents into named collections. Runtime-ingested
            documents are mirrored here alongside the older demo-backed library.
          </HelpTooltip>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge tone={runtimeTone} label={runtimeLabel} />
          {/* Embedding cost badge */}
          <span
            className="rounded-full border theme-border bg-[color:var(--color-background-secondary)] px-2 py-0.5 text-[9px] theme-text-muted"
            title={`${embeddingCallCount} embedding API calls this session`}
          >
            embed: ${embeddingCostUsd.toFixed(4)}
          </span>
          <button
            type="button"
            onClick={() => void fetchDocuments()}
            disabled={loading}
            title="Refresh document list"
            className="inline-flex items-center gap-1.5 rounded-full border theme-border bg-[color:var(--color-background-secondary)] px-2.5 py-1 text-[10px] theme-text-secondary transition hover:opacity-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {/* Sub-tab strip */}
      <div className="mb-4 flex gap-0.5 overflow-x-auto rounded-lg border theme-border theme-bg-primary p-0.5">
        {SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveSubTab(key)}
            title={`Open ${label} section`}
            className={[
              'shrink-0 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              activeSubTab === key
                ? 'bg-sky-500 text-white'
                : 'theme-text-secondary hover:theme-text-primary hover:bg-white/5',
            ].join(' ')}
          >
            {label}
            {key === 'documents' && documents.length > 0 && (
              <span className="ml-1 rounded-full bg-sky-500/30 px-1 text-[9px]">{documents.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Upload tab                                                           */}
      {/* ------------------------------------------------------------------ */}
      {activeSubTab === 'upload' && (
        <div className="space-y-4">
          <div className="rounded-lg border theme-border theme-bg-primary px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {lastUploadMode && (
                <DataSourceBadge
                  tone={lastUploadMode === 'runtime' ? 'runtime' : 'demo'}
                  label={lastUploadMode === 'runtime' ? 'Last Upload: Runtime' : 'Last Upload: Demo'}
                />
              )}
              {runtimeStatus === 'ready' ? (
                <>
                  <DataSourceBadge tone="runtime" label="Text + Markdown + URL + PDF -> Runtime" />
                  <DataSourceBadge tone="mixed" label="Fallback -> Demo" />
                </>
              ) : (
                <DataSourceBadge tone="demo" label="Uploads -> Demo Library" />
              )}
            </div>
            <p className="mt-2 text-[10px] theme-text-secondary">
              {uploadNotice ?? runtimeMessage ?? 'Upload routing information will appear here after the runtime status loads.'}
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-[0.35em] theme-text-muted">Assign On Ingest</p>
            <select
              value={uploadCollectionId ?? ''}
              onChange={(e) => setUploadCollectionId(e.target.value || null)}
              className="w-full rounded-md border theme-border theme-bg-primary px-2 py-1.5 text-xs theme-text-primary focus:border-sky-500 focus:outline-none"
              title="Attach new uploads to a specific collection as they are ingested"
            >
              <option value="">No collection</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name} ({collection.mode === 'runtime' ? 'Runtime' : 'Demo'})
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[10px] theme-text-muted">
              {selectedUploadCollection
                ? selectedUploadCollection.mode === 'runtime'
                  ? `New uploads will target the live runtime store and attach to "${selectedUploadCollection.name}".`
                  : `New uploads will stay on the demo document library and attach to "${selectedUploadCollection.name}".`
                : 'Choose an optional collection to attach documents or URLs as they are indexed.'}
            </p>
          </div>
          <DropZone onFiles={handleFiles} uploading={uploading} />
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-[0.35em] theme-text-muted">Index a URL</p>
            <UrlInputRow onSubmit={(url) => void uploadUrl(url)} uploading={uploading} />
          </div>
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] text-rose-300">
              {error}
            </div>
          )}
          <p className="text-[10px] theme-text-muted">
            Text, markdown, fetchable URLs, and PDFs can be pushed into the live runtime retrieval
            store when it is available. PDF extraction depends on `pdftotext` being installed on
            the backend, and any failed live ingest falls back to the demo document library.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Documents tab                                                        */}
      {/* ------------------------------------------------------------------ */}
      {activeSubTab === 'documents' && (
        <div className="space-y-2">
          {documents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border theme-border theme-bg-primary py-8 text-center">
              <FileText size={20} className="theme-text-muted" aria-hidden="true" />
              <p className="text-xs theme-text-secondary">No documents indexed yet.</p>
              <p className="text-[10px] theme-text-muted">Upload files or index URLs in the Upload tab.</p>
            </div>
          ) : (
            <ul className="space-y-1.5" aria-label="Indexed documents">
              {documents.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  onDelete={() => { void deleteDocument(doc.id); }}
                  onViewChunks={() => { void viewDocumentChunks(doc.id, 'manual-document', doc.mode ?? null); }}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Search tab                                                           */}
      {/* ------------------------------------------------------------------ */}
      {activeSubTab === 'search' && (
        <div className="space-y-3">
          <div className="rounded-lg border theme-border theme-bg-primary px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <DataSourceBadge tone={searchModeTone} label={searchModeLabel} />
              {runtimeDataSources.length > 0 && (
                <span className="text-[10px] theme-text-secondary">
                  {runtimeDataSources.length} runtime data source{runtimeDataSources.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <p className="mt-2 text-[10px] theme-text-secondary">
              {lastSearchMode === 'runtime'
                ? 'These results came from the live AgentOS retrieval runtime.'
                : lastSearchMode === 'demo'
                  ? 'These results came from the demo workbench search index.'
                  : runtimeStatus === 'ready'
                    ? 'This search will use the live AgentOS retrieval runtime when you run it.'
                    : 'This search will use the demo workbench index until the runtime retrieval path is ready.'}
            </p>
            {selectedSearchCollection && (
              <p className="mt-1 text-[10px] theme-text-muted">
                Search scope: <span className="font-medium theme-text-primary">{selectedSearchCollection.name}</span>{' '}
                ({selectedSearchCollection.mode === 'runtime' ? 'runtime collection' : 'demo collection'})
              </p>
            )}
          </div>

          {/* Query + rerank */}
          <div className="flex gap-2">
            <select
              value={searchCollectionId ?? ''}
              onChange={(e) => setSearchCollectionFilter(e.target.value || null)}
              className="w-40 rounded-md border theme-border theme-bg-primary px-2 py-1.5 text-xs theme-text-primary focus:border-sky-500 focus:outline-none"
              title="Scope search to a specific collection"
            >
              <option value="">All documents</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name} ({collection.mode === 'runtime' ? 'Runtime' : 'Demo'})
                </option>
              ))}
            </select>
            <div className="relative flex-1">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 theme-text-muted" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="Search documents…"
                className="w-full rounded-md border theme-border theme-bg-primary py-1.5 pl-7 pr-3 text-xs theme-text-primary placeholder:theme-text-muted focus:border-sky-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={!searchQuery.trim() || searching}
              className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {searching ? <RefreshCw size={11} className="animate-spin" aria-hidden="true" /> : 'Search'}
            </button>
          </div>

          {/* Rerank toggle */}
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border theme-border theme-bg-primary px-3 py-2 text-xs">
            <input
              type="checkbox"
              checked={rerankEnabled}
              onChange={(e) => setRerankEnabled(e.target.checked)}
              className="shrink-0 accent-sky-500"
            />
            <div>
              <span className="font-semibold theme-text-primary">Enable Reranking</span>
              <p className="mt-0.5 text-[10px] theme-text-secondary">
                Apply a cross-encoder reranker after initial vector retrieval.
              </p>
            </div>
          </label>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] text-rose-300">
              {error}
            </div>
          )}

          {/* Results */}
          {searchResults.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border theme-border theme-bg-primary py-6 text-center">
              <Search size={18} className="theme-text-muted" aria-hidden="true" />
              <p className="text-[10px] theme-text-muted">Run a search query above to see retrieved chunks.</p>
            </div>
          ) : (
            <ul className="space-y-1.5" aria-label="Search results">
              {searchResults.map((result, i) => (
                (() => {
                  const runtimePreviewMatches =
                    result.mode === 'runtime' && !documentIds.has(result.documentId)
                      ? runtimePreviewMatchesByDocumentId.get(result.documentId) ?? []
                      : [];
                  const previewMatchCount = runtimePreviewMatches.length;
                  const previewUsesMatchGroup = previewMatchCount > 1;

                  return (
                    <SearchResultCard
                      key={`${result.documentId}-${result.chunkId ?? result.chunkIndex}-${i}`}
                      result={result}
                      rank={i + 1}
                      openChunkLabel={
                        result.mode === 'runtime' && !documentIds.has(result.documentId)
                          ? previewUsesMatchGroup ? `Preview ${previewMatchCount} Hits` : 'Preview'
                          : 'Open Chunk'
                      }
                      chunkActionNote={
                        result.mode === 'runtime' && !documentIds.has(result.documentId)
                          ? previewUsesMatchGroup
                            ? `This live result is not mirrored into the workbench document list yet, so this opens ${previewMatchCount} retrieved runtime chunks for this document from the current search result set instead of the full document.`
                            : 'This live result is not mirrored into the workbench document list yet, so this opens a one-chunk preview instead of the full document.'
                          : null
                      }
                      onOpenChunk={() => {
                        if (result.mode === 'runtime' && !documentIds.has(result.documentId)) {
                          previewRuntimeResultChunk({
                            documentId: result.documentId,
                            documentName: result.documentName,
                            chunkId: result.chunkId ?? null,
                            chunkIndex: result.chunkIndex,
                            text: result.text,
                            sourceLabel: result.sourceLabel,
                            chunks: runtimePreviewMatches.map((match) => ({
                              chunkId: match.chunkId ?? null,
                              chunkIndex: match.chunkIndex,
                              text: match.text,
                            })),
                          });
                          return;
                        }

                        void openDocumentChunks(
                          result.documentId,
                          result.chunkIndex,
                          result.mode === 'runtime' ? 'runtime-result' : 'search-result',
                          result.mode ?? null,
                        );
                      }}
                    />
                  );
                })()
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Chunks tab                                                           */}
      {/* ------------------------------------------------------------------ */}
      {activeSubTab === 'chunks' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">
                {selectedDocId ? `Chunks — ${selectedDocName}` : 'Chunks'}
              </p>
              {selectedDocId && chunkViewOriginMeta && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {selectedDocSourceMode && (
                    <DataSourceBadge
                      tone={selectedDocSourceMode === 'runtime' ? 'runtime' : 'demo'}
                      label={selectedDocSourceMode === 'runtime' ? 'Runtime Doc' : 'Demo Doc'}
                      className="px-1.5 py-0.5 text-[8px]"
                    />
                  )}
                  {selectedDocPreviewMode === 'runtime-result-preview' && (
                    <DataSourceBadge
                      tone="mixed"
                      label="Preview Only"
                      className="px-1.5 py-0.5 text-[8px]"
                    />
                  )}
                  {selectedDocPreviewMode === 'runtime-result-preview' && previewRuntimeChunkCount > 1 && (
                    <DataSourceBadge
                      tone="mixed"
                      label={previewRuntimeChunkLabel}
                      className="px-1.5 py-0.5 text-[8px]"
                    />
                  )}
                  {selectedDocPreviewMode === 'runtime-result-preview' && (
                    <DataSourceBadge
                      tone={previewMirrorTone}
                      label={previewMirrorLabel}
                      className="px-1.5 py-0.5 text-[8px]"
                    />
                  )}
                  <DataSourceBadge
                    tone={chunkViewOriginMeta.tone}
                    label={chunkViewOriginMeta.label}
                    className="px-1.5 py-0.5 text-[8px]"
                  />
                  <span className="text-[10px] theme-text-secondary">
                    {chunkViewOriginMeta.description}
                  </span>
                  {selectedDocPreviewMode === 'runtime-result-preview' && (
                    <span className="text-[10px] text-amber-300">
                      {previewMirrorAvailable
                        ? 'A mirrored runtime document is now available. Load the full document to replace this one-chunk preview.'
                        : previewMirrorCheckedLabel
                          ? previewRuntimeChunkCount > 1
                            ? `Checked ${previewMirrorCheckedLabel}. Showing ${previewRuntimeChunkCount} retrieved runtime chunks from the current result set because the full document is still not mirrored into the workbench yet.`
                            : `Checked ${previewMirrorCheckedLabel}. This result is still preview-only because the full document is not mirrored into the workbench yet.`
                          : previewRuntimeChunkCount > 1
                            ? `Showing ${previewRuntimeChunkCount} retrieved runtime chunks from the current result set because the full document is not mirrored into the workbench yet.`
                            : 'Showing only the retrieved runtime chunk because the full document is not mirrored into the workbench yet.'}
                    </span>
                  )}
                  {selectedDocSourceMode === 'runtime' && selectedDocId && (
                    <span className="text-[10px] theme-text-muted">
                      Doc ID: <span className="font-mono theme-text-primary">{selectedDocId}</span>
                    </span>
                  )}
                  {selectedRuntimeSourceLabel && (
                    <span className="text-[10px] theme-text-muted">
                      Source: <span className="font-mono theme-text-primary">{selectedRuntimeSourceLabel}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedDocPreviewMode === 'runtime-result-preview' && !previewMirrorAvailable && (
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedDocId || refreshingPreviewMirror) {
                      return;
                    }
                    setRefreshingPreviewMirror(true);
                    void refreshRuntimeDocumentMirror(selectedDocId).finally(() => {
                      setRefreshingPreviewMirror(false);
                    });
                  }}
                  disabled={refreshingPreviewMirror || chunksLoading}
                  className="rounded-full border theme-border bg-[color:var(--color-background-secondary)] px-2 py-0.5 text-[9px] theme-text-secondary hover:opacity-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  title="Check whether this specific runtime document is now mirrored into the workbench registry"
                >
                  {refreshingPreviewMirror ? 'Checking…' : 'Refresh Mirror'}
                </button>
              )}
              {previewMirrorAvailable && selectedDocId && (
                <button
                  type="button"
                  onClick={() => {
                    void openDocumentChunks(
                      selectedDocId,
                      highlightedChunkIndex,
                      'runtime-result',
                      'runtime',
                    );
                  }}
                  disabled={chunksLoading}
                  className="rounded-full border theme-border bg-[color:var(--color-background-secondary)] px-2 py-0.5 text-[9px] theme-text-secondary hover:opacity-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  title="Replace this preview with the full mirrored runtime document"
                >
                  Load Full Doc
                </button>
              )}
              {highlightedChunkIndex != null && !chunksLoading && (
                <span className="text-[10px] font-medium text-sky-300">
                  Highlighting {highlightedPreviewChunkLabel ?? `chunk ${highlightedChunkIndex}`}
                </span>
              )}
              {chunksLoading && (
                <RefreshCw size={11} className="animate-spin theme-text-muted" aria-hidden="true" />
              )}
            </div>
          </div>

          {!selectedDocId ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border theme-border theme-bg-primary py-8 text-center">
              <Layers size={20} className="theme-text-muted" aria-hidden="true" />
              <p className="text-xs theme-text-secondary">No document selected.</p>
              <p className="text-[10px] theme-text-muted">
                Click &ldquo;Chunks&rdquo; on any document in the Documents tab.
              </p>
            </div>
          ) : chunksLoading && selectedDocChunks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border theme-border theme-bg-primary py-8 text-center">
              <RefreshCw size={18} className="animate-spin theme-text-muted" aria-hidden="true" />
              <p className="text-xs theme-text-secondary">Loading chunks…</p>
              <p className="text-[10px] theme-text-muted">
                Fetching chunk data for {selectedDocName}.
              </p>
            </div>
          ) : selectedDocChunks.length === 0 && !chunksLoading ? (
            <p className="text-[10px] theme-text-muted">No chunks found for this document.</p>
          ) : (
            <ul className="space-y-1.5" aria-label="Document chunks">
              {selectedDocChunks.map((chunk) => (
                <ChunkCard
                  key={chunk.previewKey ?? chunk.index}
                  chunk={chunk}
                  highlighted={
                    chunk.previewKey
                      ? chunk.previewKey === highlightedChunkPreviewKey
                      : chunk.index === highlightedChunkIndex
                  }
                  highlightRequestId={
                    (chunk.previewKey && chunk.previewKey === highlightedChunkPreviewKey) ||
                    (!chunk.previewKey && chunk.index === highlightedChunkIndex)
                      ? highlightedChunkRequestId
                      : 0
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Collections tab                                                      */}
      {/* ------------------------------------------------------------------ */}
      {activeSubTab === 'collections' && (
        <div className="space-y-4">
          {/* Create collection */}
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-[0.35em] theme-text-muted">New Collection</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    newColName.trim() &&
                    (newCollectionMode !== 'runtime' || runtimeStatus === 'ready')
                  ) {
                    void createCollection(newColName.trim(), newCollectionMode);
                    setNewColName('');
                  }
                }}
                placeholder="Collection name…"
                className="flex-1 rounded-md border theme-border theme-bg-primary px-2 py-1.5 text-xs theme-text-primary placeholder:theme-text-muted focus:border-sky-500 focus:outline-none"
              />
              <select
                value={newCollectionMode}
                onChange={(e) => setNewCollectionMode(e.target.value as 'runtime' | 'demo')}
                className="rounded-md border theme-border theme-bg-primary px-2 py-1.5 text-xs theme-text-primary focus:border-sky-500 focus:outline-none"
                title="Choose whether to create this collection in the runtime store or the demo library"
              >
                <option value="demo">Demo</option>
                <option value="runtime" disabled={runtimeStatus !== 'ready'}>Runtime</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  if (newColName.trim()) {
                    void createCollection(newColName.trim(), newCollectionMode);
                    setNewColName('');
                  }
                }}
                disabled={!newColName.trim() || (newCollectionMode === 'runtime' && runtimeStatus !== 'ready')}
                className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Create
              </button>
            </div>
          </div>

          {/* Collections list */}
          {collections.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border theme-border theme-bg-primary py-6 text-center">
              <Folder size={18} className="theme-text-muted" aria-hidden="true" />
              <p className="text-[10px] theme-text-muted">No collections yet. Create one above.</p>
            </div>
          ) : (
            <ul className="space-y-2" aria-label="Collections">
              {collections.map((col) => (
                <li key={col.id} className="rounded-lg border theme-border theme-bg-primary px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <Folder size={11} className="theme-text-muted shrink-0" aria-hidden="true" />
                      <span className="font-medium theme-text-primary">{col.name}</span>
                      <span className="theme-text-muted">{col.documentIds.length} docs</span>
                      <DataSourceBadge
                        tone={col.mode === 'runtime' ? 'runtime' : 'demo'}
                        label={col.mode === 'runtime' ? 'Runtime' : 'Demo'}
                        className="px-1.5 py-0.5 text-[8px]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => { void deleteCollection(col.id); }}
                      className="shrink-0 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[9px] text-rose-400 hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      title="Delete collection"
                    >
                      <Trash2 size={9} aria-hidden="true" />
                    </button>
                  </div>

                  {/* Assign document dropdown */}
                  {documents.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            void assignToCollection(e.target.value, col.id);
                            e.target.value = '';
                          }
                        }}
                        className="flex-1 rounded-md border theme-border bg-[color:var(--color-background-secondary)] px-2 py-1 text-[10px] theme-text-primary focus:border-sky-500 focus:outline-none"
                        title="Assign a document to this collection"
                      >
                        <option value="" disabled>Assign document…</option>
                        {documents
                          .filter((d) => (d.mode ?? 'demo') === (col.mode ?? 'demo') && !d.collectionIds.includes(col.id))
                          .map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                      </select>
                    </div>
                  )}

                  {/* Assigned docs */}
                  {col.documentIds.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {col.documentIds.map((docId) => {
                        const doc = documents.find((d) => d.id === docId);
                        if (!doc) return null;
                        return (
                          <li key={docId} className="flex items-center gap-1.5 text-[9px] theme-text-secondary">
                            <FileText size={9} className="theme-text-muted shrink-0" aria-hidden="true" />
                            <span className="truncate">{doc.name}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
