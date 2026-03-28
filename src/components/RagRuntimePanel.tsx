import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Database, RefreshCw, Search, Upload } from 'lucide-react';
import {
  agentosClient,
  type RuntimeRagChunk,
  type RuntimeRagHealthResponse,
} from '@/lib/agentosClient';
import { DataSourceBadge } from '@/components/DataSourceBadge';
import { groupResultsByDocumentId } from '@/lib/resultGroups';
import { useRagDocStore, type ChunkViewOrigin } from '@/state/ragDocStore';
import { HelpTooltip } from '@/components/ui/HelpTooltip';

function getStatusTone(status: RuntimeRagHealthResponse['status'] | 'checking' | undefined) {
  if (status === 'ready') return 'runtime' as const;
  if (status === 'degraded') return 'mixed' as const;
  if (status === 'checking') return 'neutral' as const;
  return 'demo' as const;
}

function getStatusLabel(status: RuntimeRagHealthResponse['status'] | 'checking' | undefined) {
  if (status === 'ready') return 'Runtime Ready';
  if (status === 'degraded') return 'Runtime Degraded';
  if (status === 'checking') return 'Checking Runtime';
  return 'Runtime Disabled';
}

function QueryResultCard({
  chunk,
  rank,
  onInspect,
  inspecting,
  displayName,
  actionLabel,
  actionNote,
}: {
  chunk: RuntimeRagChunk;
  rank: number;
  onInspect?: () => void;
  inspecting?: boolean;
  displayName: string;
  actionLabel?: string;
  actionNote?: string | null;
}) {
  const canInspect = Boolean(onInspect);
  return (
    <li className="rounded-lg border theme-border theme-bg-primary px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="font-mono text-emerald-400">#{rank}</span>
            <span className="truncate font-medium theme-text-primary">{displayName}</span>
            {chunk.chunkIndex != null && (
              <span className="shrink-0 theme-text-muted">chunk {chunk.chunkIndex}</span>
            )}
            <DataSourceBadge tone="runtime" label="Runtime" className="px-1.5 py-0.5 text-[8px]" />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] theme-text-secondary">
            <span>
              Score: <span className="font-mono theme-text-primary">{chunk.score.toFixed(3)}</span>
            </span>
            <span>
              Doc ID: <span className="font-mono theme-text-primary">{chunk.documentId}</span>
            </span>
            {chunk.dataSourceId && (
              <span>source: <span className="font-mono theme-text-primary">{chunk.dataSourceId}</span></span>
            )}
            {chunk.source && (
              <span className="truncate">origin: {chunk.source}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onInspect}
          disabled={!canInspect || inspecting}
          className="shrink-0 rounded-full border theme-border bg-[color:var(--color-background-secondary)] px-2 py-0.5 text-[9px] theme-text-secondary hover:opacity-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          title={actionNote ?? 'Open this runtime document in the chunk viewer'}
        >
          {!canInspect ? 'No Mirror' : inspecting ? 'Opening…' : actionLabel ?? (chunk.chunkIndex != null ? 'Open Chunk' : 'Chunks')}
        </button>
      </div>
      {actionNote && (
        <p className="mt-2 text-[10px] text-amber-300">
          {actionNote}
        </p>
      )}
      <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded-md border theme-border bg-[color:var(--color-background-tertiary,theme(colors.slate.900))] p-2 text-[10px] theme-text-secondary">
        {chunk.content}
      </pre>
    </li>
  );
}

export function RagRuntimePanel() {
  const runtimeHealth = useRagDocStore((s) => s.runtimeHealth);
  const runtimeStatus = useRagDocStore((s) => s.runtimeStatus);
  const runtimeMessage = useRagDocStore((s) => s.runtimeMessage);
  const documents = useRagDocStore((s) => s.documents);
  const collections = useRagDocStore((s) => s.collections);
  const refreshRuntimeAvailability = useRagDocStore((s) => s.refreshRuntimeAvailability);
  const fetchDocuments = useRagDocStore((s) => s.fetchDocuments);
  const viewDocumentChunks = useRagDocStore((s) => s.viewDocumentChunks);
  const openDocumentChunks = useRagDocStore((s) => s.openDocumentChunks);
  const previewRuntimeResultChunk = useRagDocStore((s) => s.previewRuntimeResultChunk);
  const [healthLoading, setHealthLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [queryCollectionId, setQueryCollectionId] = useState('');
  const [strategy, setStrategy] = useState<'similarity' | 'mmr' | 'hybrid'>('similarity');
  const [topK, setTopK] = useState(5);
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryResults, setQueryResults] = useState<RuntimeRagChunk[]>([]);
  const [querySummary, setQuerySummary] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [ingestCollectionId, setIngestCollectionId] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [inspectingDocumentId, setInspectingDocumentId] = useState<string | null>(null);
  const [lastIngestedDocumentId, setLastIngestedDocumentId] = useState<string | null>(null);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const runtimeCollections = collections.filter((collection) => collection.mode === 'runtime');
  const runtimeDocumentsById = new Map(
    documents
      .filter((document) => document.mode === 'runtime')
      .map((document) => [document.id, document]),
  );
  const runtimePreviewMatchesByDocumentId = groupResultsByDocumentId(
    queryResults.filter((chunk) => !runtimeDocumentsById.has(chunk.documentId)),
  );

  const loadRuntimeState = useCallback(async () => {
    setHealthLoading(true);
    try {
      await Promise.all([
        refreshRuntimeAvailability(),
        fetchDocuments(),
      ]);
    } finally {
      setHealthLoading(false);
    }
  }, [fetchDocuments, refreshRuntimeAvailability]);

  useEffect(() => {
    void loadRuntimeState();
  }, [loadRuntimeState]);

  useEffect(() => {
    const runtimeCollectionIds = new Set(runtimeCollections.map((collection) => collection.id));
    if (queryCollectionId && !runtimeCollectionIds.has(queryCollectionId)) {
      setQueryCollectionId('');
    }
    if (ingestCollectionId && !runtimeCollectionIds.has(ingestCollectionId)) {
      setIngestCollectionId('');
    }
  }, [ingestCollectionId, queryCollectionId, runtimeCollections]);

  const inspectRuntimeDocument = useCallback(async (
    documentId: string,
    origin: ChunkViewOrigin,
    chunkIndex?: number | null,
  ) => {
    setInspectingDocumentId(documentId);
    try {
      if (chunkIndex == null) {
        await viewDocumentChunks(documentId, origin, 'runtime');
      } else {
        await openDocumentChunks(documentId, chunkIndex, origin, 'runtime');
      }
    } finally {
      setInspectingDocumentId((current) => (current === documentId ? null : current));
    }
  }, [openDocumentChunks, viewDocumentChunks]);

  const runQuery = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setQuerying(true);
    setQueryError(null);
    setQuerySummary(null);
    try {
      const selectedCollection = runtimeCollections.find((collection) => collection.id === queryCollectionId) ?? null;
      const data = await agentosClient.queryRuntimeRag({
        query: trimmed,
        topK,
        strategy,
        collectionId: queryCollectionId || undefined,
      });
      setQueryResults(data.chunks);
      setQuerySummary(
        data.chunks.length > 0
          ? `${data.chunks.length} runtime chunks retrieved${selectedCollection ? ` from "${selectedCollection.name}"` : ''}.`
          : `The runtime query completed but returned no chunks${selectedCollection ? ` in "${selectedCollection.name}"` : ''}.`
      );
    } catch (error) {
      setQueryResults([]);
      setQueryError(error instanceof Error ? error.message : 'Runtime query failed.');
    } finally {
      setQuerying(false);
    }
  }, [query, queryCollectionId, runtimeCollections, strategy, topK]);

  const ingestNote = useCallback(async () => {
    const trimmed = noteContent.trim();
    if (!trimmed) return;
    setIngesting(true);
    setIngestError(null);
    setIngestMessage(null);
    setLastIngestedDocumentId(null);
    try {
      const selectedCollection = runtimeCollections.find((collection) => collection.id === ingestCollectionId) ?? null;
      const data = await agentosClient.ingestRuntimeRag({
        title: noteTitle.trim() || undefined,
        content: trimmed,
        collectionId: ingestCollectionId || undefined,
      });
      setLastIngestedDocumentId(data.document?.id ?? data.documentId);
      setIngestMessage(
        `Ingested ${data.processedCount} document into ${data.effectiveDataSourceIds.join(', ') || 'the runtime store'}${selectedCollection ? ` and attached it to "${selectedCollection.name}"` : ''}.`
      );
      setNoteTitle('');
      setNoteContent('');
      await loadRuntimeState();
    } catch (error) {
      setIngestError(error instanceof Error ? error.message : 'Runtime ingestion failed.');
    } finally {
      setIngesting(false);
    }
  }, [ingestCollectionId, loadRuntimeState, noteContent, noteTitle, runtimeCollections]);

  const statusTone =
    healthLoading && !runtimeHealth && runtimeStatus === 'checking'
      ? 'neutral'
      : getStatusTone(runtimeStatus);
  const statusLabel =
    healthLoading && !runtimeHealth && runtimeStatus === 'checking'
      ? 'Checking Runtime'
      : getStatusLabel(runtimeStatus);

  return (
    <section className="rounded-xl border theme-border theme-bg-secondary-soft p-3 transition-theme">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">Runtime</p>
            <h3 className="text-sm font-semibold theme-text-primary">Runtime Retrieval</h3>
          </div>
          <HelpTooltip label="Explain runtime retrieval panel" side="bottom">
            This panel talks to the live AgentOS retrieval runtime for health checks, query testing,
            and direct ingestion. The document library beside it now mixes runtime-backed and
            demo-backed workbench records.
          </HelpTooltip>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge tone={statusTone} label={statusLabel} />
          <button
            type="button"
            onClick={() => void loadRuntimeState()}
            disabled={healthLoading}
            className="inline-flex items-center gap-1.5 rounded-full border theme-border bg-[color:var(--color-background-secondary)] px-2.5 py-1 text-[10px] theme-text-secondary transition hover:opacity-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RefreshCw size={10} className={healthLoading ? 'animate-spin' : ''} aria-hidden="true" />
            {healthLoading ? 'Checking…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="rounded-lg border theme-border theme-bg-primary px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] theme-text-muted">
          <Database size={11} aria-hidden="true" />
          Runtime Status
        </div>
        <p className="mt-2 text-xs theme-text-primary">
          {runtimeMessage ?? runtimeHealth?.message ?? 'Loading runtime retrieval status…'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] theme-text-secondary">
          <span>provider: <span className="font-mono theme-text-primary">{runtimeHealth?.defaultProviderId ?? 'none'}</span></span>
          <span>data sources: <span className="font-mono theme-text-primary">{runtimeHealth?.dataSources.length ?? 0}</span></span>
          <span>vector store: <span className="font-mono theme-text-primary">{runtimeHealth?.vectorStoreConnected ? 'connected' : 'not ready'}</span></span>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div className="rounded-lg border theme-border theme-bg-primary p-3">
          <div className="mb-3 flex items-center gap-2">
            <Search size={12} className="theme-text-muted" aria-hidden="true" />
            <p className="text-[10px] uppercase tracking-[0.3em] theme-text-muted">Query Runtime</p>
          </div>

          <div className="flex gap-2">
            <select
              value={queryCollectionId}
              onChange={(event) => setQueryCollectionId(event.target.value)}
              className="rounded-md border theme-border theme-bg-secondary-soft px-2 py-1.5 text-xs theme-text-primary focus:border-emerald-500 focus:outline-none"
              title="Scope runtime search to a specific runtime collection"
            >
              <option value="">All runtime docs</option>
              {runtimeCollections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void runQuery();
                }
              }}
              placeholder="Ask the runtime retrieval store…"
              className="flex-1 rounded-md border theme-border theme-bg-secondary-soft px-3 py-1.5 text-xs theme-text-primary placeholder:theme-text-muted focus:border-emerald-500 focus:outline-none"
            />
            <select
              value={strategy}
              onChange={(event) => setStrategy(event.target.value as 'similarity' | 'mmr' | 'hybrid')}
              className="rounded-md border theme-border theme-bg-secondary-soft px-2 py-1.5 text-xs theme-text-primary focus:border-emerald-500 focus:outline-none"
            >
              <option value="similarity">Similarity</option>
              <option value="hybrid">Hybrid</option>
              <option value="mmr">MMR</option>
            </select>
            <select
              value={String(topK)}
              onChange={(event) => setTopK(Number(event.target.value))}
              className="rounded-md border theme-border theme-bg-secondary-soft px-2 py-1.5 text-xs theme-text-primary focus:border-emerald-500 focus:outline-none"
            >
              <option value="3">Top 3</option>
              <option value="5">Top 5</option>
              <option value="8">Top 8</option>
            </select>
            <button
              type="button"
              onClick={() => void runQuery()}
              disabled={!query.trim() || querying}
              className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {querying ? 'Running…' : 'Query'}
            </button>
          </div>

          {queryError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] text-rose-300">
              <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{queryError}</span>
            </div>
          )}

          {!queryError && querySummary && (
            <p className="mt-3 text-[10px] theme-text-secondary">{querySummary}</p>
          )}

          {queryResults.length > 0 && (
            <ul className="mt-3 space-y-2" aria-label="Runtime query results">
              {queryResults.map((chunk, index) => (
                (() => {
                  const previewMatches = !runtimeDocumentsById.has(chunk.documentId)
                    ? runtimePreviewMatchesByDocumentId.get(chunk.documentId) ?? []
                    : [];
                  const previewMatchCount = previewMatches.length;
                  const previewUsesMatchGroup = previewMatchCount > 1;

                  return (
                    <QueryResultCard
                      key={chunk.chunkId}
                      chunk={chunk}
                      rank={index + 1}
                      displayName={chunk.documentName || runtimeDocumentsById.get(chunk.documentId)?.name || chunk.documentId}
                      actionLabel={
                        runtimeDocumentsById.has(chunk.documentId)
                          ? undefined
                          : previewUsesMatchGroup ? `Preview ${previewMatchCount} Hits` : 'Preview'
                      }
                      actionNote={
                        runtimeDocumentsById.has(chunk.documentId)
                          ? null
                          : previewUsesMatchGroup
                            ? `This result came from the live runtime without a mirrored document record, so this opens ${previewMatchCount} retrieved runtime chunks for this document from the current query result set instead of the full document.`
                            : 'This result came from the live runtime without a mirrored document record, so this opens a one-chunk preview instead of the full document.'
                      }
                      onInspect={() => {
                        if (runtimeDocumentsById.has(chunk.documentId)) {
                          void inspectRuntimeDocument(chunk.documentId, 'runtime-result', chunk.chunkIndex);
                          return;
                        }

                        previewRuntimeResultChunk({
                          documentId: chunk.documentId,
                          documentName: chunk.documentName,
                          chunkId: chunk.chunkId,
                          chunkIndex: chunk.chunkIndex,
                          text: chunk.content,
                          sourceLabel: chunk.dataSourceId,
                          chunks: previewMatches.map((match) => ({
                            chunkId: match.chunkId,
                            chunkIndex: match.chunkIndex,
                            text: match.content,
                          })),
                        });
                      }}
                      inspecting={inspectingDocumentId === chunk.documentId}
                    />
                  );
                })()
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border theme-border theme-bg-primary p-3">
          <div className="mb-3 flex items-center gap-2">
            <Upload size={12} className="theme-text-muted" aria-hidden="true" />
            <p className="text-[10px] uppercase tracking-[0.3em] theme-text-muted">Ingest Note</p>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
              placeholder="Optional title"
              className="w-full rounded-md border theme-border theme-bg-secondary-soft px-3 py-1.5 text-xs theme-text-primary placeholder:theme-text-muted focus:border-emerald-500 focus:outline-none"
            />
            <select
              value={ingestCollectionId}
              onChange={(event) => setIngestCollectionId(event.target.value)}
              className="w-full rounded-md border theme-border theme-bg-secondary-soft px-3 py-1.5 text-xs theme-text-primary focus:border-emerald-500 focus:outline-none"
              title="Attach this note to a specific runtime collection during ingest"
            >
              <option value="">No runtime collection</option>
              {runtimeCollections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
            <textarea
              value={noteContent}
              onChange={(event) => setNoteContent(event.target.value)}
              placeholder="Paste a note, runbook excerpt, or working context to embed into the live runtime store."
              rows={5}
              className="w-full rounded-md border theme-border theme-bg-secondary-soft px-3 py-2 text-xs theme-text-primary placeholder:theme-text-muted focus:border-emerald-500 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] theme-text-muted">
                This writes into the runtime RAG data source, not the demo document list.
                {ingestCollectionId ? ' The note will also be attached to the selected runtime collection.' : ''}
              </p>
              <button
                type="button"
                onClick={() => void ingestNote()}
                disabled={!noteContent.trim() || ingesting}
                className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {ingesting ? 'Ingesting…' : 'Ingest Text'}
              </button>
            </div>
          </div>

          {ingestError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] text-rose-300">
              <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{ingestError}</span>
            </div>
          )}

          {!ingestError && ingestMessage && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-[10px] text-emerald-300">{ingestMessage}</p>
              {lastIngestedDocumentId && (
                <button
                  type="button"
                  onClick={() => { void inspectRuntimeDocument(lastIngestedDocumentId, 'runtime-note'); }}
                  disabled={inspectingDocumentId === lastIngestedDocumentId}
                  className="shrink-0 rounded-full border theme-border bg-[color:var(--color-background-secondary)] px-2 py-0.5 text-[9px] theme-text-secondary hover:opacity-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {inspectingDocumentId === lastIngestedDocumentId ? 'Opening…' : 'Inspect Chunks'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
