/**
 * ragDocStore — Zustand store for the RagDocumentManager panel.
 *
 * Manages the indexed document list, search results, chunk viewer, collection
 * management, and embedding cost running total.
 *
 * Backend endpoints:
 *   POST /api/rag/upload
 *   GET  /api/rag/documents
 *   POST /api/rag/search
 *   GET  /api/rag/documents/:id/chunks
 */

import { create } from 'zustand';
import {
  agentosClient,
  resolveWorkbenchApiBaseUrl,
  type RuntimeRagHealthResponse,
} from '@/lib/agentosClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single document that has been indexed into the vector store.
 */
export interface RagDocument {
  id: string;
  name: string;
  /** "markdown" | "pdf" | "text" | "url" */
  type: 'markdown' | 'pdf' | 'text' | 'url';
  /** Number of chunks this document was split into. */
  chunkCount: number;
  /** ISO-8601 of last indexing run. */
  indexedAt: string;
  /** Size in bytes, undefined for URL sources. */
  sizeBytes?: number;
  /** Collection(s) this document belongs to. */
  collectionIds: string[];
  /** Whether the record comes from the runtime mirror or the demo library. */
  mode?: 'runtime' | 'demo';
  /** Runtime data source id when available. */
  dataSourceId?: string;
}

/**
 * A retrieved chunk returned by a RAG search query.
 */
export interface SearchResult {
  chunkId?: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  /** Chunk text. */
  text: string;
  /** Cosine similarity score 0–1. */
  score: number;
  /** Reranker score 0–1, present when reranking is on. */
  rerankScore?: number;
  /** Whether this result came from the live runtime or the demo index. */
  mode?: 'runtime' | 'demo';
  /** Optional data source / collection label. */
  sourceLabel?: string;
}

/**
 * A single chunk as returned by the chunk viewer endpoint.
 */
export interface DocumentChunk {
  index: number;
  text: string;
  /** Approximate token count. */
  tokenCount: number;
  /** Number of tokens shared with adjacent chunks. */
  overlapTokens: number;
  /** Stable key for preview-only runtime chunks when chunk indexes collide. */
  previewKey?: string;
  /** Optional UI label when the chunk is coming from a preview context. */
  displayLabel?: string;
}

/**
 * A named collection grouping documents.
 */
export interface RagCollection {
  id: string;
  name: string;
  documentIds: string[];
  /** ISO-8601 creation time. */
  createdAt: string;
  /** Whether the collection comes from the runtime mirror or the demo library. */
  mode?: 'runtime' | 'demo';
}

type WorkbenchRagMode = 'runtime' | 'demo';

export type RagSubTab = 'upload' | 'documents' | 'search' | 'chunks' | 'collections';
export type ChunkViewOrigin =
  | 'manual-document'
  | 'search-result'
  | 'runtime-result'
  | 'runtime-note';

interface RuntimePreviewChunkInput {
  chunkId?: string | null;
  chunkIndex?: number | null;
  text: string;
}

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

interface RagDocState {
  documents: RagDocument[];
  activeSubTab: RagSubTab;
  searchQuery: string;
  searchCollectionId: string | null;
  uploadCollectionId: string | null;
  searchResults: SearchResult[];
  rerankEnabled: boolean;
  /** Currently opened document's chunks. */
  selectedDocChunks: DocumentChunk[];
  selectedDocId: string | null;
  selectedDocMode: 'runtime' | 'demo' | null;
  selectedDocNameOverride: string | null;
  selectedDocPreviewMode: 'runtime-result-preview' | null;
  selectedDocPreviewSourceLabel: string | null;
  selectedDocPreviewCheckedAt: string | null;
  highlightedChunkIndex: number | null;
  highlightedChunkPreviewKey: string | null;
  highlightedChunkRequestId: number;
  chunkViewOrigin: ChunkViewOrigin | null;
  collections: RagCollection[];
  /** Running total of embedding API call cost in USD. */
  embeddingCostUsd: number;
  /** Number of embedding API calls made this session. */
  embeddingCallCount: number;
  runtimeHealth: RuntimeRagHealthResponse | null;
  runtimeStatus: 'checking' | 'ready' | 'disabled' | 'degraded';
  runtimeDataSources: string[];
  runtimeMessage: string | null;
  lastSearchMode: 'runtime' | 'demo' | null;
  lastUploadMode: 'runtime' | 'demo' | null;
  uploadNotice: string | null;
  loading: boolean;
  uploading: boolean;
  searching: boolean;
  chunksLoading: boolean;
  error: string | null;

  // --- Actions ---
  refreshRuntimeAvailability: () => Promise<void>;
  fetchDocuments: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  uploadUrl: (url: string) => Promise<void>;
  search: (query: string) => Promise<void>;
  setActiveSubTab: (tab: RagSubTab) => void;
  setSearchCollectionFilter: (collectionId: string | null) => void;
  setUploadCollectionId: (collectionId: string | null) => void;
  setRerankEnabled: (enabled: boolean) => void;
  fetchChunks: (docId: string, modeHint?: 'runtime' | 'demo' | null) => Promise<void>;
  viewDocumentChunks: (
    docId: string,
    origin?: ChunkViewOrigin,
    modeHint?: 'runtime' | 'demo' | null
  ) => Promise<void>;
  openDocumentChunks: (
    docId: string,
    chunkIndex?: number | null,
    origin?: ChunkViewOrigin,
    modeHint?: 'runtime' | 'demo' | null
  ) => Promise<void>;
  refreshRuntimeDocumentMirror: (docId: string) => Promise<boolean>;
  previewRuntimeResultChunk: (input: {
    documentId: string;
    documentName?: string | null;
    chunkId?: string | null;
    chunkIndex?: number | null;
    text: string;
    sourceLabel?: string | null;
    chunks?: RuntimePreviewChunkInput[];
  }) => void;
  createCollection: (name: string, mode?: 'runtime' | 'demo') => Promise<void>;
  deleteCollection: (collectionId: string) => Promise<void>;
  assignToCollection: (docId: string, collectionId: string) => Promise<void>;
  deleteDocument: (docId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_DOCS: RagDocument[] = [
  {
    id: 'doc-001',
    name: 'AgentOS Architecture.md',
    type: 'markdown',
    chunkCount: 24,
    indexedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    sizeBytes: 18_432,
    collectionIds: ['col-001'],
    mode: 'demo',
  },
  {
    id: 'doc-002',
    name: 'Voice Pipeline Runbook.pdf',
    type: 'pdf',
    chunkCount: 41,
    indexedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    sizeBytes: 124_288,
    collectionIds: ['col-001'],
    mode: 'demo',
  },
  {
    id: 'doc-003',
    name: 'https://agentos.sh/docs',
    type: 'url',
    chunkCount: 12,
    indexedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    collectionIds: [],
    mode: 'demo',
  },
  {
    id: 'doc-004',
    name: 'Guardrail Configuration.md',
    type: 'markdown',
    chunkCount: 8,
    indexedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    sizeBytes: 6_144,
    collectionIds: ['col-002'],
    mode: 'demo',
  },
  {
    id: 'doc-005',
    name: 'Social Broadcast Skill.txt',
    type: 'text',
    chunkCount: 6,
    indexedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    sizeBytes: 3_072,
    collectionIds: [],
    mode: 'demo',
  },
];

const DEMO_COLLECTIONS: RagCollection[] = [
  {
    id: 'col-001',
    name: 'Technical Docs',
    documentIds: ['doc-001', 'doc-002'],
    createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    mode: 'demo',
  },
  {
    id: 'col-002',
    name: 'Security',
    documentIds: ['doc-004'],
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    mode: 'demo',
  },
];

const DEMO_SEARCH_RESULTS: SearchResult[] = [
  {
    documentId: 'doc-001',
    documentName: 'AgentOS Architecture.md',
    chunkIndex: 3,
    text: '## Capability Discovery Engine\n\nThe discovery engine uses tiered semantic matching to surface relevant tools and skills at runtime without embedding the full catalog into every prompt...',
    score: 0.94,
    rerankScore: 0.97,
    mode: 'demo',
  },
  {
    documentId: 'doc-002',
    documentName: 'Voice Pipeline Runbook.pdf',
    chunkIndex: 8,
    text: 'The voice pipeline state machine transitions: IDLE → LISTENING on VAD trigger, LISTENING → PROCESSING on endpoint detection, PROCESSING → SPEAKING on TTS generation...',
    score: 0.81,
    rerankScore: 0.88,
    mode: 'demo',
  },
  {
    documentId: 'doc-003',
    documentName: 'https://agentos.sh/docs',
    chunkIndex: 1,
    text: 'AgentOS is an open-source multi-agent runtime with first-class voice, RAG, and guardrail support. Installation via npm install -g @agentos/cli...',
    score: 0.72,
    rerankScore: 0.74,
    mode: 'demo',
  },
];

const DEMO_CHUNKS: DocumentChunk[] = [
  {
    index: 0,
    text: '# AgentOS Architecture Overview\n\nAgentOS is a modular multi-agent orchestration runtime built on TypeScript...',
    tokenCount: 128,
    overlapTokens: 0,
  },
  {
    index: 1,
    text: '## Core Components\n\nThe runtime is composed of five primary subsystems: ToolOrchestrator, CapabilityDiscoveryEngine, ConversationManager, ExtensionManager, and ModelProviderManager...',
    tokenCount: 142,
    overlapTokens: 20,
  },
  {
    index: 2,
    text: '## ToolOrchestrator\n\nThe ToolOrchestrator maintains a registry of ITool implementations and routes incoming tool-call requests to the appropriate executor...',
    tokenCount: 136,
    overlapTokens: 20,
  },
  {
    index: 3,
    text: '## Capability Discovery Engine\n\nThe discovery engine uses tiered semantic matching to surface relevant tools and skills at runtime without embedding the full catalog into every prompt...',
    tokenCount: 155,
    overlapTokens: 18,
  },
];

function canIngestFileIntoRuntime(file: File): boolean {
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  return (
    fileType.startsWith('text/') ||
    fileType.includes('markdown') ||
    fileName.endsWith('.md') ||
    fileName.endsWith('.markdown') ||
    fileName.endsWith('.txt')
  );
}

function isPdfRuntimeFile(file: File): boolean {
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  return fileType.includes('pdf') || fileName.endsWith('.pdf');
}

function applyRuntimeHealth(health: RuntimeRagHealthResponse | null): Partial<RagDocState> {
  if (!health) {
    return {
      runtimeHealth: null,
    };
  }
  return {
    runtimeHealth: health,
    runtimeStatus: health.status,
    runtimeDataSources: health.dataSources ?? [],
    runtimeMessage: health.message,
  };
}

function normalizeDocumentMode(document: RagDocument, fallbackMode: WorkbenchRagMode): RagDocument {
  return {
    ...document,
    mode: document.mode ?? fallbackMode,
  };
}

function normalizeCollectionMode(
  collection: RagCollection,
  fallbackMode: WorkbenchRagMode
): RagCollection {
  return {
    ...collection,
    mode: collection.mode ?? fallbackMode,
  };
}

function normalizeSearchResultMode(
  result: SearchResult,
  fallbackMode: WorkbenchRagMode
): SearchResult {
  return {
    ...result,
    mode: result.mode ?? fallbackMode,
  };
}

function toSearchResults(
  results: SearchResult[] | undefined,
  fallbackMode: WorkbenchRagMode
): SearchResult[] {
  return (results ?? DEMO_SEARCH_RESULTS).map((result) =>
    normalizeSearchResultMode(result, fallbackMode)
  );
}

function mergeDocuments(
  runtimeDocuments: RagDocument[],
  demoDocuments: RagDocument[]
): RagDocument[] {
  const merged = new Map<string, RagDocument>();
  for (const document of demoDocuments) {
    merged.set(document.id, { ...document, mode: document.mode ?? 'demo' });
  }
  for (const document of runtimeDocuments) {
    merged.set(document.id, { ...document, mode: 'runtime' });
  }
  return Array.from(merged.values()).sort((a, b) => b.indexedAt.localeCompare(a.indexedAt));
}

function mergeCollections(
  runtimeCollections: RagCollection[],
  demoCollections: RagCollection[]
): RagCollection[] {
  const merged = new Map<string, RagCollection>();
  for (const collection of demoCollections) {
    merged.set(collection.id, { ...collection, mode: collection.mode ?? 'demo' });
  }
  for (const collection of runtimeCollections) {
    merged.set(collection.id, { ...collection, mode: 'runtime' });
  }
  return Array.from(merged.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function filterResultsByCollection(
  results: SearchResult[],
  documents: RagDocument[],
  collectionId: string | null
): SearchResult[] {
  if (!collectionId) {
    return results;
  }

  const allowedDocumentIds = new Set(
    documents
      .filter((document) => document.collectionIds.includes(collectionId))
      .map((document) => document.id)
  );

  return results.filter((result) => allowedDocumentIds.has(result.documentId));
}

function addDocumentIdToCollectionState(
  collections: RagCollection[],
  collectionId: string | null | undefined,
  documentId: string
): RagCollection[] {
  if (!collectionId) {
    return collections;
  }

  return collections.map((collection) =>
    collection.id === collectionId && !collection.documentIds.includes(documentId)
      ? { ...collection, documentIds: [...collection.documentIds, documentId] }
      : collection
  );
}

function estimateTokenCount(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }
  return Math.max(1, Math.round(normalized.length / 4));
}

function buildRuntimePreviewChunks(
  documentId: string,
  chunks: RuntimePreviewChunkInput[]
): DocumentChunk[] {
  const duplicateChunkIndexCounts = new Map<number, number>();
  for (const chunk of chunks) {
    if (chunk.chunkIndex == null) {
      continue;
    }
    duplicateChunkIndexCounts.set(
      chunk.chunkIndex,
      (duplicateChunkIndexCounts.get(chunk.chunkIndex) ?? 0) + 1
    );
  }

  const duplicateChunkIndexOffsets = new Map<number, number>();
  return chunks.map((chunk, index) => {
    const chunkIndex = chunk.chunkIndex ?? index;
    const previewKey = chunk.chunkId?.trim() || `preview-${documentId}-${index}`;
    let displayLabel =
      chunk.chunkIndex != null ? `chunk ${chunk.chunkIndex}` : `match ${index + 1}`;

    if (chunk.chunkIndex != null && (duplicateChunkIndexCounts.get(chunk.chunkIndex) ?? 0) > 1) {
      const duplicateIndexOffset = (duplicateChunkIndexOffsets.get(chunk.chunkIndex) ?? 0) + 1;
      duplicateChunkIndexOffsets.set(chunk.chunkIndex, duplicateIndexOffset);
      displayLabel = `chunk ${chunk.chunkIndex} (match ${duplicateIndexOffset})`;
    }

    return {
      index: chunkIndex,
      text: chunk.text,
      tokenCount: estimateTokenCount(chunk.text),
      overlapTokens: 0,
      previewKey,
      displayLabel,
    };
  });
}

function reorderRuntimePreviewChunksForFocus(
  chunks: RuntimePreviewChunkInput[],
  input: {
    chunkId?: string | null;
    chunkIndex?: number | null;
    text: string;
  }
): RuntimePreviewChunkInput[] {
  if (chunks.length <= 1) {
    return chunks;
  }

  const normalizedChunkId = input.chunkId?.trim() || null;
  const focusedIndex = chunks.findIndex((chunk) =>
    normalizedChunkId
      ? chunk.chunkId?.trim() === normalizedChunkId
      : chunk.chunkIndex === input.chunkIndex && chunk.text === input.text
  );

  if (focusedIndex <= 0) {
    return chunks;
  }

  const reordered = [...chunks];
  const [focusedChunk] = reordered.splice(focusedIndex, 1);
  reordered.unshift(focusedChunk);
  return reordered;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useRagDocStore = create<RagDocState>()((set, get) => ({
  documents: DEMO_DOCS,
  activeSubTab: 'upload',
  searchQuery: '',
  searchCollectionId: null,
  uploadCollectionId: null,
  searchResults: [],
  rerankEnabled: true,
  selectedDocChunks: [],
  selectedDocId: null,
  selectedDocMode: null,
  selectedDocNameOverride: null,
  selectedDocPreviewMode: null,
  selectedDocPreviewSourceLabel: null,
  selectedDocPreviewCheckedAt: null,
  highlightedChunkIndex: null,
  highlightedChunkPreviewKey: null,
  highlightedChunkRequestId: 0,
  chunkViewOrigin: null,
  collections: DEMO_COLLECTIONS,
  embeddingCostUsd: 0.0042,
  embeddingCallCount: 91,
  runtimeHealth: null,
  runtimeStatus: 'checking',
  runtimeDataSources: [],
  runtimeMessage: null,
  lastSearchMode: null,
  lastUploadMode: null,
  uploadNotice: null,
  loading: false,
  uploading: false,
  searching: false,
  chunksLoading: false,
  error: null,

  refreshRuntimeAvailability: async () => {
    try {
      const health = await agentosClient.getRuntimeRagHealth();
      set(applyRuntimeHealth(health));
    } catch {
      set((state) =>
        state.runtimeStatus === 'checking'
          ? {
              runtimeHealth: null,
              runtimeStatus: 'disabled',
              runtimeDataSources: [],
              runtimeMessage:
                'Runtime retrieval is unavailable here, so this manager will use demo-backed flows.',
            }
          : {}
      );
    }
  },

  fetchDocuments: async () => {
    set({ loading: true, error: null });
    let demoDocuments = DEMO_DOCS;
    let demoCollections = DEMO_COLLECTIONS;
    let runtimeDocuments: RagDocument[] = [];
    let runtimeCollections: RagCollection[] = [];

    try {
      const base = resolveWorkbenchApiBaseUrl();
      const res = await fetch(`${base}/api/rag/documents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        mode?: WorkbenchRagMode;
        documents: RagDocument[];
        collections?: RagCollection[];
      };
      const fallbackMode = data.mode ?? 'demo';
      demoDocuments = (data.documents ?? DEMO_DOCS).map((document) =>
        normalizeDocumentMode(document, fallbackMode)
      );
      demoCollections = (data.collections ?? DEMO_COLLECTIONS).map((collection) =>
        normalizeCollectionMode(collection, fallbackMode)
      );
    } catch {
      demoDocuments = DEMO_DOCS;
      demoCollections = DEMO_COLLECTIONS;
    }

    try {
      runtimeDocuments = await agentosClient.listRuntimeRagDocuments();
    } catch {
      runtimeDocuments = [];
    }

    try {
      runtimeCollections = await agentosClient.listRuntimeRagCollections();
    } catch {
      runtimeCollections = [];
    }

    set((state) => {
      const documents = mergeDocuments(runtimeDocuments, demoDocuments);
      const collections = mergeCollections(runtimeCollections, demoCollections);
      const collectionIds = new Set(collections.map((collection) => collection.id));
      const documentIds = new Set(documents.map((document) => document.id));
      const hasSelectedDocument =
        state.selectedDocPreviewMode !== null ||
        (state.selectedDocId ? documentIds.has(state.selectedDocId) : false);
      return {
        loading: false,
        documents,
        collections,
        selectedDocId: hasSelectedDocument ? state.selectedDocId : null,
        selectedDocMode: hasSelectedDocument ? state.selectedDocMode : null,
        selectedDocNameOverride: hasSelectedDocument ? state.selectedDocNameOverride : null,
        selectedDocPreviewMode: hasSelectedDocument ? state.selectedDocPreviewMode : null,
        selectedDocPreviewSourceLabel: hasSelectedDocument
          ? state.selectedDocPreviewSourceLabel
          : null,
        selectedDocPreviewCheckedAt: hasSelectedDocument ? state.selectedDocPreviewCheckedAt : null,
        selectedDocChunks: hasSelectedDocument ? state.selectedDocChunks : [],
        highlightedChunkIndex: hasSelectedDocument ? state.highlightedChunkIndex : null,
        highlightedChunkPreviewKey: hasSelectedDocument ? state.highlightedChunkPreviewKey : null,
        highlightedChunkRequestId: hasSelectedDocument ? state.highlightedChunkRequestId : 0,
        chunkViewOrigin: hasSelectedDocument ? state.chunkViewOrigin : null,
        searchCollectionId:
          state.searchCollectionId && collectionIds.has(state.searchCollectionId)
            ? state.searchCollectionId
            : null,
        uploadCollectionId:
          state.uploadCollectionId && collectionIds.has(state.uploadCollectionId)
            ? state.uploadCollectionId
            : null,
      };
    });
  },

  uploadFile: async (file) => {
    set({ uploading: true, error: null, uploadNotice: null });

    let runtimeHealth: RuntimeRagHealthResponse | null = null;
    try {
      runtimeHealth = await agentosClient.getRuntimeRagHealth();
      set(applyRuntimeHealth(runtimeHealth));
    } catch {
      // Preserve existing runtime state; the upload can still fall back to the demo path.
    }

    const selectedUploadCollection =
      get().collections.find((collection) => collection.id === get().uploadCollectionId) ?? null;
    const runtimeCollectionId =
      selectedUploadCollection?.mode === 'runtime' ? selectedUploadCollection.id : undefined;
    const demoCollectionId =
      selectedUploadCollection?.mode === 'demo' ? selectedUploadCollection.id : undefined;
    const supportsRuntimeFileIngest = canIngestFileIntoRuntime(file) || isPdfRuntimeFile(file);
    const shouldUseRuntime =
      selectedUploadCollection?.mode === 'runtime' ||
      (!selectedUploadCollection && runtimeHealth?.status === 'ready' && supportsRuntimeFileIngest);

    if (runtimeCollectionId && runtimeHealth?.status !== 'ready') {
      set({
        uploading: false,
        lastUploadMode: 'runtime',
        error: `Runtime collection "${selectedUploadCollection?.name}" is selected, but live runtime retrieval is not ready.`,
      });
      return;
    }

    if (runtimeCollectionId && !supportsRuntimeFileIngest) {
      set({
        uploading: false,
        lastUploadMode: 'runtime',
        error: `${file.name} cannot be added to runtime collection "${selectedUploadCollection?.name}" yet because this file type is not wired for live ingestion.`,
      });
      return;
    }

    let runtimeFallbackNotice: string | null = null;
    if (shouldUseRuntime && runtimeHealth?.status === 'ready') {
      try {
        const data = await agentosClient.ingestRuntimeRagFile({
          file,
          ...(runtimeCollectionId ? { collectionId: runtimeCollectionId } : {}),
        });
        const runtimeDocumentType = data.document?.type;
        set((s) => ({
          uploading: false,
          documents: data.document
            ? mergeDocuments(
                [data.document, ...s.documents.filter((document) => document.mode === 'runtime')],
                s.documents.filter((document) => document.mode !== 'runtime')
              )
            : s.documents,
          collections: data.document
            ? addDocumentIdToCollectionState(s.collections, runtimeCollectionId, data.document.id)
            : s.collections,
          lastUploadMode: 'runtime',
          uploadNotice:
            `${file.name} was ${
              runtimeDocumentType === 'pdf' && data.parser
                ? `extracted with ${data.parser} and ingested`
                : 'ingested'
            } into the live runtime retrieval store` +
            `${data.effectiveDataSourceIds.length > 0 ? ` (${data.effectiveDataSourceIds.join(', ')})` : ''}. ` +
            'It is queryable immediately and now appears in the runtime-backed document list.' +
            (selectedUploadCollection?.mode === 'runtime'
              ? ` It was added to runtime collection "${selectedUploadCollection.name}".`
              : ''),
          embeddingCallCount: s.embeddingCallCount + Math.max(data.processedCount, 1),
        }));
        return;
      } catch (error) {
        if (!runtimeCollectionId && isPdfRuntimeFile(file)) {
          runtimeFallbackNotice =
            error instanceof Error
              ? `Live PDF ingestion failed (${error.message}), so ${file.name} was added to the demo document library instead.`
              : `Live PDF ingestion failed, so ${file.name} was added to the demo document library instead.`;
        } else {
          set({
            uploading: false,
            lastUploadMode: 'runtime',
            error: error instanceof Error ? error.message : 'Runtime ingestion failed.',
          });
          return;
        }
      }
    }

    try {
      const base = resolveWorkbenchApiBaseUrl();
      const res = await fetch(`${base}/api/rag/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          sizeBytes: file.size,
          contentType: file.type || undefined,
          collectionId: demoCollectionId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        mode?: WorkbenchRagMode;
        document: RagDocument;
        costUsd: number;
        callCount: number;
      };
      const responseMode = data.document?.mode ?? data.mode ?? 'demo';
      set((s) => ({
        uploading: false,
        documents: [normalizeDocumentMode(data.document, responseMode), ...s.documents],
        collections: addDocumentIdToCollectionState(
          s.collections,
          demoCollectionId,
          data.document.id
        ),
        embeddingCostUsd: s.embeddingCostUsd + (data.costUsd ?? 0),
        embeddingCallCount: s.embeddingCallCount + (data.callCount ?? 1),
        lastUploadMode: responseMode,
        uploadNotice:
          runtimeFallbackNotice ??
          (selectedUploadCollection?.mode === 'demo'
            ? `${file.name} was added to demo collection "${selectedUploadCollection.name}".`
            : runtimeHealth?.status === 'ready' && !supportsRuntimeFileIngest
              ? `${file.name} stayed on the demo document library because this file type is not wired for live ingestion right now.`
              : runtimeHealth?.status && runtimeHealth.status !== 'ready'
                ? `${file.name} was added to the demo document library because runtime retrieval is not ready.`
                : null),
      }));
    } catch {
      // Simulate adding the doc locally in demo mode.
      const doc: RagDocument = {
        id: `doc-${Date.now()}`,
        name: file.name,
        type: file.name.endsWith('.pdf') ? 'pdf' : file.name.endsWith('.md') ? 'markdown' : 'text',
        chunkCount: Math.ceil(file.size / 512),
        indexedAt: new Date().toISOString(),
        sizeBytes: file.size,
        collectionIds: demoCollectionId ? [demoCollectionId] : [],
        mode: 'demo',
      };
      set((s) => ({
        uploading: false,
        documents: [doc, ...s.documents],
        collections: addDocumentIdToCollectionState(s.collections, demoCollectionId, doc.id),
        embeddingCostUsd: s.embeddingCostUsd + 0.0004,
        embeddingCallCount: s.embeddingCallCount + doc.chunkCount,
        lastUploadMode: 'demo',
        uploadNotice:
          runtimeFallbackNotice ??
          (selectedUploadCollection?.mode === 'demo'
            ? `${file.name} was added to demo collection "${selectedUploadCollection.name}".`
            : runtimeHealth?.status === 'ready' && !supportsRuntimeFileIngest
              ? `${file.name} stayed on the demo document library because this file type is not wired for live ingestion right now.`
              : runtimeHealth?.status && runtimeHealth.status !== 'ready'
                ? `${file.name} was added to the demo document library because runtime retrieval is not ready.`
                : null),
      }));
    }
  },

  uploadUrl: async (url) => {
    set({ uploading: true, error: null, uploadNotice: null });

    let runtimeHealth: RuntimeRagHealthResponse | null = null;
    try {
      runtimeHealth = await agentosClient.getRuntimeRagHealth();
      set(applyRuntimeHealth(runtimeHealth));
    } catch {
      // Preserve existing runtime state; the upload can still fall back to the demo path.
    }

    const selectedUploadCollection =
      get().collections.find((collection) => collection.id === get().uploadCollectionId) ?? null;
    const runtimeCollectionId =
      selectedUploadCollection?.mode === 'runtime' ? selectedUploadCollection.id : undefined;
    const demoCollectionId =
      selectedUploadCollection?.mode === 'demo' ? selectedUploadCollection.id : undefined;
    const shouldUseRuntime =
      selectedUploadCollection?.mode === 'runtime' ||
      (!selectedUploadCollection && runtimeHealth?.status === 'ready');

    if (runtimeCollectionId && runtimeHealth?.status !== 'ready') {
      set({
        uploading: false,
        lastUploadMode: 'runtime',
        error: `Runtime collection "${selectedUploadCollection?.name}" is selected, but live runtime retrieval is not ready.`,
      });
      return;
    }

    let runtimeFallbackNotice: string | null = null;
    if (shouldUseRuntime && runtimeHealth?.status === 'ready') {
      try {
        const data = await agentosClient.ingestRuntimeRagUrl({
          url,
          ...(runtimeCollectionId ? { collectionId: runtimeCollectionId } : {}),
        });
        set((s) => ({
          uploading: false,
          documents: data.document
            ? mergeDocuments(
                [data.document, ...s.documents.filter((document) => document.mode === 'runtime')],
                s.documents.filter((document) => document.mode !== 'runtime')
              )
            : s.documents,
          collections: data.document
            ? addDocumentIdToCollectionState(s.collections, runtimeCollectionId, data.document.id)
            : s.collections,
          lastUploadMode: 'runtime',
          uploadNotice:
            `${data.fetchedUrl} was fetched and ingested into the live runtime retrieval store` +
            `${data.effectiveDataSourceIds.length > 0 ? ` (${data.effectiveDataSourceIds.join(', ')})` : ''}. ` +
            'It is queryable immediately and now appears in the runtime-backed document list.' +
            (selectedUploadCollection?.mode === 'runtime'
              ? ` It was added to runtime collection "${selectedUploadCollection.name}".`
              : ''),
          embeddingCallCount: s.embeddingCallCount + Math.max(data.processedCount, 1),
        }));
        return;
      } catch (error) {
        if (!runtimeCollectionId) {
          runtimeFallbackNotice =
            error instanceof Error
              ? `Live URL ingestion failed (${error.message}), so the URL was added to the demo document library instead.`
              : 'Live URL ingestion failed, so the URL was added to the demo document library instead.';
        } else {
          set({
            uploading: false,
            lastUploadMode: 'runtime',
            error: error instanceof Error ? error.message : 'Runtime URL ingestion failed.',
          });
          return;
        }
      }
    }

    try {
      const base = resolveWorkbenchApiBaseUrl();
      const res = await fetch(`${base}/api/rag/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          collectionId: demoCollectionId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        mode?: WorkbenchRagMode;
        document: RagDocument;
        costUsd: number;
        callCount: number;
      };
      const responseMode = data.document?.mode ?? data.mode ?? 'demo';
      set((s) => ({
        uploading: false,
        documents: [normalizeDocumentMode(data.document, responseMode), ...s.documents],
        collections: addDocumentIdToCollectionState(
          s.collections,
          demoCollectionId,
          data.document.id
        ),
        embeddingCostUsd: s.embeddingCostUsd + (data.costUsd ?? 0),
        embeddingCallCount: s.embeddingCallCount + (data.callCount ?? 1),
        lastUploadMode: responseMode,
        uploadNotice:
          runtimeFallbackNotice ??
          (selectedUploadCollection?.mode === 'demo'
            ? `${url} was added to demo collection "${selectedUploadCollection.name}".`
            : runtimeHealth?.status && runtimeHealth.status !== 'ready'
              ? `${url} was added to the demo document library because runtime retrieval is not ready.`
              : 'URL indexing used the demo-backed document library.'),
      }));
    } catch {
      const doc: RagDocument = {
        id: `doc-${Date.now()}`,
        name: url,
        type: 'url',
        chunkCount: 10,
        indexedAt: new Date().toISOString(),
        collectionIds: demoCollectionId ? [demoCollectionId] : [],
        mode: 'demo',
      };
      set((s) => ({
        uploading: false,
        documents: [doc, ...s.documents],
        collections: addDocumentIdToCollectionState(s.collections, demoCollectionId, doc.id),
        embeddingCostUsd: s.embeddingCostUsd + 0.0002,
        embeddingCallCount: s.embeddingCallCount + 10,
        lastUploadMode: 'demo',
        uploadNotice:
          runtimeFallbackNotice ??
          (selectedUploadCollection?.mode === 'demo'
            ? `${url} was added to demo collection "${selectedUploadCollection.name}".`
            : runtimeHealth?.status && runtimeHealth.status !== 'ready'
              ? `${url} was added to the demo document library because runtime retrieval is not ready.`
              : 'URL indexing used the demo-backed document library.'),
      }));
    }
  },

  search: async (query) => {
    set({ searching: true, searchQuery: query, error: null });

    let runtimeHealth: RuntimeRagHealthResponse | null = null;
    try {
      runtimeHealth = await agentosClient.getRuntimeRagHealth();
      set(applyRuntimeHealth(runtimeHealth));
    } catch {
      // Preserve existing runtime state; the search can still use the demo endpoint.
    }

    const { collections, documents, rerankEnabled, runtimeStatus, searchCollectionId } = get();
    const selectedCollection =
      collections.find((collection) => collection.id === searchCollectionId) ?? null;
    const effectiveRuntimeStatus = runtimeHealth?.status ?? runtimeStatus;
    const shouldUseRuntime =
      effectiveRuntimeStatus === 'ready' &&
      (!selectedCollection || selectedCollection.mode === 'runtime');

    if (selectedCollection?.mode === 'runtime' && effectiveRuntimeStatus !== 'ready') {
      set({
        searching: false,
        searchResults: [],
        lastSearchMode: null,
        error: `The "${selectedCollection.name}" collection is runtime-backed, but runtime retrieval is not ready.`,
      });
      return;
    }

    if (shouldUseRuntime) {
      try {
        const data = await agentosClient.queryRuntimeRag({
          query,
          topK: searchCollectionId ? 20 : 5,
          collectionId:
            selectedCollection?.mode === 'runtime' ? (searchCollectionId ?? undefined) : undefined,
          rerank: rerankEnabled,
        });
        const results: SearchResult[] = data.chunks.map((chunk, index) => ({
          chunkId: chunk.chunkId,
          documentId: chunk.documentId,
          documentName: chunk.documentName || chunk.source || chunk.documentId,
          chunkIndex: chunk.chunkIndex ?? index,
          text: chunk.content,
          score: chunk.score,
          mode: 'runtime',
          sourceLabel: chunk.dataSourceId,
        }));
        set({
          searching: false,
          searchResults: results,
          lastSearchMode: 'runtime',
        });
        return;
      } catch (error) {
        if (selectedCollection?.mode === 'runtime') {
          set({
            searching: false,
            searchResults: [],
            lastSearchMode: null,
            error: error instanceof Error ? error.message : 'Runtime search failed.',
          });
          return;
        }

        const message =
          error instanceof Error
            ? `${error.message} Showing demo search results instead.`
            : 'Runtime search failed. Showing demo search results instead.';
        set({ error: message });
      }
    }

    try {
      const base = resolveWorkbenchApiBaseUrl();
      const res = await fetch(`${base}/api/rag/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          rerank: rerankEnabled,
          collectionId:
            selectedCollection?.mode === 'demo' ? (searchCollectionId ?? undefined) : undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { mode?: WorkbenchRagMode; results: SearchResult[] };
      const responseMode = data.mode ?? 'demo';
      set({
        searching: false,
        searchResults: toSearchResults(data.results, responseMode),
        lastSearchMode: responseMode,
      });
    } catch {
      set({
        searching: false,
        searchResults: filterResultsByCollection(
          DEMO_SEARCH_RESULTS,
          documents,
          searchCollectionId
        ),
        lastSearchMode: 'demo',
      });
    }
  },

  setActiveSubTab: (tab) =>
    set({
      activeSubTab: tab,
    }),

  setSearchCollectionFilter: (collectionId) => set({ searchCollectionId: collectionId }),

  setUploadCollectionId: (collectionId) => set({ uploadCollectionId: collectionId }),

  setRerankEnabled: (enabled) => set({ rerankEnabled: enabled }),

  fetchChunks: async (docId, modeHint = null) => {
    const document = get().documents.find((item) => item.id === docId);
    const effectiveMode = modeHint ?? document?.mode ?? null;
    set((state) => ({
      chunksLoading: true,
      selectedDocId: docId,
      selectedDocMode: effectiveMode,
      selectedDocNameOverride: document?.name ?? null,
      selectedDocPreviewMode: null,
      selectedDocPreviewSourceLabel: null,
      selectedDocPreviewCheckedAt: null,
      selectedDocChunks: state.selectedDocId === docId ? state.selectedDocChunks : [],
      highlightedChunkPreviewKey: null,
    }));
    if (effectiveMode === 'runtime') {
      try {
        const chunks = await agentosClient.getRuntimeRagDocumentChunks(docId);
        set({ chunksLoading: false, selectedDocChunks: chunks });
        return;
      } catch {
        set({ chunksLoading: false, selectedDocChunks: [] });
        return;
      }
    }

    try {
      const base = resolveWorkbenchApiBaseUrl();
      const res = await fetch(`${base}/api/rag/documents/${docId}/chunks`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { chunks: DocumentChunk[] };
      set({ chunksLoading: false, selectedDocChunks: data.chunks ?? DEMO_CHUNKS });
    } catch {
      set({ chunksLoading: false, selectedDocChunks: DEMO_CHUNKS });
    }
  },

  viewDocumentChunks: async (docId, origin = 'manual-document', modeHint = null) => {
    set({
      activeSubTab: 'chunks',
      highlightedChunkIndex: null,
      highlightedChunkPreviewKey: null,
      highlightedChunkRequestId: 0,
      chunkViewOrigin: origin,
    });
    await get().fetchChunks(docId, modeHint);
  },

  openDocumentChunks: async (
    docId,
    chunkIndex = null,
    origin = 'search-result',
    modeHint = null
  ) => {
    set((state) => ({
      activeSubTab: 'chunks',
      highlightedChunkIndex: chunkIndex,
      highlightedChunkPreviewKey: null,
      highlightedChunkRequestId: state.highlightedChunkRequestId + 1,
      chunkViewOrigin: origin,
    }));
    await get().fetchChunks(docId, modeHint);
  },

  refreshRuntimeDocumentMirror: async (docId) => {
    try {
      const status = await agentosClient.getRuntimeRagDocumentMirrorStatus(docId);
      const checkedAt = status.checkedAt ?? new Date().toISOString();
      if (!status.mirrored || !status.document) {
        set((state) =>
          state.selectedDocId === docId
            ? {
                selectedDocPreviewCheckedAt: checkedAt,
                selectedDocPreviewSourceLabel:
                  state.selectedDocPreviewSourceLabel ?? status.sourceLabel ?? null,
              }
            : {}
        );
        return false;
      }

      set((state) => ({
        documents: mergeDocuments(
          [
            status.document,
            ...state.documents.filter(
              (document) => document.mode === 'runtime' && document.id !== status.document!.id
            ),
          ],
          state.documents.filter((document) => document.mode !== 'runtime')
        ),
        collections: state.collections.map((collection) =>
          collection.mode === 'runtime' &&
          status.document!.collectionIds.includes(collection.id) &&
          !collection.documentIds.includes(status.document!.id)
            ? { ...collection, documentIds: [...collection.documentIds, status.document!.id] }
            : collection
        ),
        selectedDocPreviewCheckedAt:
          state.selectedDocId === docId ? checkedAt : state.selectedDocPreviewCheckedAt,
        selectedDocPreviewSourceLabel:
          state.selectedDocId === docId
            ? (state.selectedDocPreviewSourceLabel ?? status.sourceLabel ?? null)
            : state.selectedDocPreviewSourceLabel,
      }));
      return true;
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to refresh runtime document mirror status.',
      });
      return false;
    }
  },

  previewRuntimeResultChunk: ({
    documentId,
    documentName,
    chunkId = null,
    chunkIndex = null,
    text,
    sourceLabel,
    chunks,
  }) => {
    const previewSourceChunks = reorderRuntimePreviewChunksForFocus(
      chunks && chunks.length > 0
        ? chunks
        : [
            {
              chunkId,
              chunkIndex,
              text,
            },
          ],
      {
        chunkId,
        chunkIndex,
        text,
      }
    );
    const previewChunks = buildRuntimePreviewChunks(documentId, previewSourceChunks);
    const resolvedChunkIndex = chunkIndex ?? previewSourceChunks[0]?.chunkIndex ?? 0;
    const resolvedPreviewKey =
      chunkId?.trim() ||
      previewChunks.find((chunk) => chunk.index === resolvedChunkIndex)?.previewKey ||
      previewChunks[0]?.previewKey ||
      null;
    set((state) => ({
      activeSubTab: 'chunks',
      chunksLoading: false,
      selectedDocId: documentId,
      selectedDocMode: 'runtime',
      selectedDocNameOverride: documentName?.trim() || documentId,
      selectedDocPreviewMode: 'runtime-result-preview',
      selectedDocPreviewSourceLabel: sourceLabel ?? null,
      selectedDocPreviewCheckedAt: null,
      selectedDocChunks: previewChunks,
      highlightedChunkIndex: resolvedChunkIndex,
      highlightedChunkPreviewKey: resolvedPreviewKey,
      highlightedChunkRequestId: state.highlightedChunkRequestId + 1,
      chunkViewOrigin: 'runtime-result',
    }));
  },

  createCollection: async (name, mode = 'demo') => {
    if (mode === 'runtime') {
      try {
        const collection = await agentosClient.createRuntimeRagCollection(name);
        set((s) => ({
          collections: mergeCollections(
            [collection, ...s.collections.filter((item) => item.mode === 'runtime')],
            s.collections.filter((item) => item.mode !== 'runtime')
          ),
        }));
        return;
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : 'Failed to create runtime RAG collection.',
        });
        return;
      }
    }

    try {
      const base = resolveWorkbenchApiBaseUrl();
      const res = await fetch(`${base}/api/rag/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { mode?: WorkbenchRagMode; collection?: RagCollection };
      if (data.collection) {
        set((s) => ({
          collections: [
            ...s.collections,
            normalizeCollectionMode(data.collection!, data.mode ?? 'demo'),
          ],
        }));
        return;
      }
    } catch {
      // Fall back to local demo state below.
    }

    const col: RagCollection = {
      id: `col-${Date.now()}`,
      name,
      documentIds: [],
      createdAt: new Date().toISOString(),
      mode: 'demo',
    };
    set((s) => ({ collections: [...s.collections, col] }));
  },

  deleteCollection: async (collectionId) => {
    const collection = get().collections.find((item) => item.id === collectionId);
    if (collection?.mode === 'runtime') {
      try {
        await agentosClient.deleteRuntimeRagCollection(collectionId);
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : 'Failed to delete runtime RAG collection.',
        });
        return;
      }

      set((s) => ({
        collections: s.collections.filter((c) => c.id !== collectionId),
        documents: s.documents.map((d) => ({
          ...d,
          collectionIds: d.collectionIds.filter((id) => id !== collectionId),
        })),
        searchCollectionId: s.searchCollectionId === collectionId ? null : s.searchCollectionId,
        uploadCollectionId: s.uploadCollectionId === collectionId ? null : s.uploadCollectionId,
      }));
      return;
    }

    try {
      const base = resolveWorkbenchApiBaseUrl();
      await fetch(`${base}/api/rag/collections/${collectionId}`, {
        method: 'DELETE',
      });
    } catch {
      // Fall back to local demo state below.
    }

    set((s) => ({
      collections: s.collections.filter((c) => c.id !== collectionId),
      documents: s.documents.map((d) => ({
        ...d,
        collectionIds: d.collectionIds.filter((id) => id !== collectionId),
      })),
      searchCollectionId: s.searchCollectionId === collectionId ? null : s.searchCollectionId,
      uploadCollectionId: s.uploadCollectionId === collectionId ? null : s.uploadCollectionId,
    }));
  },

  assignToCollection: async (docId, collectionId) => {
    const collection = get().collections.find((item) => item.id === collectionId);
    const document = get().documents.find((item) => item.id === docId);
    if (collection?.mode === 'runtime') {
      if (document?.mode !== 'runtime') {
        set({ error: 'Only runtime documents can be assigned to runtime collections.' });
        return;
      }

      try {
        await agentosClient.assignRuntimeRagDocumentToCollection(docId, collectionId);
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to assign runtime RAG document to collection.',
        });
        return;
      }

      set((s) => ({
        documents: s.documents.map((d) =>
          d.id === docId && !d.collectionIds.includes(collectionId)
            ? { ...d, collectionIds: [...d.collectionIds, collectionId] }
            : d
        ),
        collections: s.collections.map((c) =>
          c.id === collectionId && !c.documentIds.includes(docId)
            ? { ...c, documentIds: [...c.documentIds, docId] }
            : c
        ),
      }));
      return;
    }

    try {
      const base = resolveWorkbenchApiBaseUrl();
      await fetch(`${base}/api/rag/collections/${collectionId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId }),
      });
    } catch {
      // Fall back to local demo state below.
    }

    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === docId && !d.collectionIds.includes(collectionId)
          ? { ...d, collectionIds: [...d.collectionIds, collectionId] }
          : d
      ),
      collections: s.collections.map((c) =>
        c.id === collectionId && !c.documentIds.includes(docId)
          ? { ...c, documentIds: [...c.documentIds, docId] }
          : c
      ),
    }));
  },

  deleteDocument: async (docId) => {
    const document = get().documents.find((item) => item.id === docId);
    if (document?.mode === 'runtime') {
      try {
        await agentosClient.deleteRuntimeRagDocument(docId);
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to delete runtime RAG document.',
        });
        return;
      }

      set((s) => ({
        documents: s.documents.filter((d) => d.id !== docId),
        collections: s.collections.map((c) => ({
          ...c,
          documentIds: c.documentIds.filter((id) => id !== docId),
        })),
        selectedDocId: s.selectedDocId === docId ? null : s.selectedDocId,
        selectedDocMode: s.selectedDocId === docId ? null : s.selectedDocMode,
        selectedDocNameOverride: s.selectedDocId === docId ? null : s.selectedDocNameOverride,
        selectedDocPreviewMode: s.selectedDocId === docId ? null : s.selectedDocPreviewMode,
        selectedDocPreviewSourceLabel:
          s.selectedDocId === docId ? null : s.selectedDocPreviewSourceLabel,
        selectedDocPreviewCheckedAt:
          s.selectedDocId === docId ? null : s.selectedDocPreviewCheckedAt,
        selectedDocChunks: s.selectedDocId === docId ? [] : s.selectedDocChunks,
        highlightedChunkIndex: s.selectedDocId === docId ? null : s.highlightedChunkIndex,
        highlightedChunkPreviewKey: s.selectedDocId === docId ? null : s.highlightedChunkPreviewKey,
        highlightedChunkRequestId: s.selectedDocId === docId ? 0 : s.highlightedChunkRequestId,
        chunkViewOrigin: s.selectedDocId === docId ? null : s.chunkViewOrigin,
      }));
      return;
    }

    try {
      const base = resolveWorkbenchApiBaseUrl();
      await fetch(`${base}/api/rag/documents/${docId}`, {
        method: 'DELETE',
      });
    } catch {
      // Fall back to local demo state below.
    }

    set((s) => ({
      documents: s.documents.filter((d) => d.id !== docId),
      collections: s.collections.map((c) => ({
        ...c,
        documentIds: c.documentIds.filter((id) => id !== docId),
      })),
      selectedDocId: s.selectedDocId === docId ? null : s.selectedDocId,
      selectedDocMode: s.selectedDocId === docId ? null : s.selectedDocMode,
      selectedDocNameOverride: s.selectedDocId === docId ? null : s.selectedDocNameOverride,
      selectedDocPreviewMode: s.selectedDocId === docId ? null : s.selectedDocPreviewMode,
      selectedDocPreviewSourceLabel:
        s.selectedDocId === docId ? null : s.selectedDocPreviewSourceLabel,
      selectedDocPreviewCheckedAt: s.selectedDocId === docId ? null : s.selectedDocPreviewCheckedAt,
      selectedDocChunks: s.selectedDocId === docId ? [] : s.selectedDocChunks,
      highlightedChunkIndex: s.selectedDocId === docId ? null : s.highlightedChunkIndex,
      highlightedChunkPreviewKey: s.selectedDocId === docId ? null : s.highlightedChunkPreviewKey,
      highlightedChunkRequestId: s.selectedDocId === docId ? 0 : s.highlightedChunkRequestId,
      chunkViewOrigin: s.selectedDocId === docId ? null : s.chunkViewOrigin,
    }));
  },
}));
