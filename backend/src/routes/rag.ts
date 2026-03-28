/**
 * RAG document management routes.
 *
 * Exposes:
 *   GET  /api/rag/documents              — list indexed documents
 *   POST /api/rag/upload                 — index a file or URL
 *   POST /api/rag/search                 — semantic search over documents
 *   GET  /api/rag/documents/:id/chunks   — list chunks for a specific document
 *   DELETE /api/rag/documents/:id        — delete an indexed document
 *   POST /api/rag/collections            — create a collection
 *   DELETE /api/rag/collections/:id      — delete a collection
 *   POST /api/rag/collections/:id/documents — assign a document to a collection
 *
 * All responses return demo data in the workbench context since no live
 * vector store is guaranteed to be present.  A production deployment
 * would delegate to the AgentOS RetrievalAugmentor service.
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// In-memory document store for the demo session
// ---------------------------------------------------------------------------

interface RagDocument {
  id: string;
  name: string;
  type: 'markdown' | 'pdf' | 'text' | 'url';
  chunkCount: number;
  indexedAt: string;
  sizeBytes?: number;
  collectionIds: string[];
}

interface DocumentChunk {
  index: number;
  text: string;
  tokenCount: number;
  overlapTokens: number;
}

interface SearchResult {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  text: string;
  score: number;
  rerankScore?: number;
}

interface RagCollection {
  id: string;
  name: string;
  documentIds: string[];
  createdAt: string;
}

type RagWorkbenchMode = 'demo';

const RAG_WORKBENCH_MODE: RagWorkbenchMode = 'demo';
export const WORKBENCH_RAG_MODE_HEADER = 'X-AgentOS-Workbench-Mode';

function markDemoReply(reply: FastifyReply): void {
  reply.header(WORKBENCH_RAG_MODE_HEADER, RAG_WORKBENCH_MODE);
}

function withDemoMode<T extends object>(value: T): T & { mode: RagWorkbenchMode } {
  return {
    ...value,
    mode: RAG_WORKBENCH_MODE,
  };
}

function getCollectionDocumentIds(collectionId?: string): Set<string> | null {
  if (!collectionId) {
    return null;
  }
  const collection = collectionStore.find((item) => item.id === collectionId);
  if (!collection) {
    return null;
  }
  return new Set(collection.documentIds);
}

// Seed the in-memory store with demo documents.
const docStore: RagDocument[] = [
  {
    id: 'doc-001',
    name: 'AgentOS Architecture.md',
    type: 'markdown',
    chunkCount: 24,
    indexedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    sizeBytes: 18_432,
    collectionIds: ['col-001'],
  },
  {
    id: 'doc-002',
    name: 'Voice Pipeline Runbook.pdf',
    type: 'pdf',
    chunkCount: 41,
    indexedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    sizeBytes: 124_288,
    collectionIds: ['col-001'],
  },
  {
    id: 'doc-003',
    name: 'https://agentos.sh/docs',
    type: 'url',
    chunkCount: 12,
    indexedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    collectionIds: [],
  },
  {
    id: 'doc-004',
    name: 'Guardrail Configuration.md',
    type: 'markdown',
    chunkCount: 8,
    indexedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    sizeBytes: 6_144,
    collectionIds: ['col-002'],
  },
];

const collectionStore: RagCollection[] = [
  {
    id: 'col-001',
    name: 'Technical Docs',
    documentIds: ['doc-001', 'doc-002'],
    createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  },
  {
    id: 'col-002',
    name: 'Security',
    documentIds: ['doc-004'],
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
];

function removeDocumentFromCollections(documentId: string): void {
  for (const collection of collectionStore) {
    collection.documentIds = collection.documentIds.filter((id) => id !== documentId);
  }
}

function attachDocumentToCollection(documentId: string, collectionId: string): void {
  const document = docStore.find((item) => item.id === documentId);
  const collection = collectionStore.find((item) => item.id === collectionId);
  if (!document || !collection) {
    return;
  }
  if (!document.collectionIds.includes(collectionId)) {
    document.collectionIds.push(collectionId);
  }
  if (!collection.documentIds.includes(documentId)) {
    collection.documentIds.push(documentId);
  }
}

function inferDocumentType(input: { name?: string; contentType?: string }): RagDocument['type'] {
  const name = input.name?.toLowerCase() ?? '';
  const contentType = input.contentType?.toLowerCase() ?? '';
  if (contentType.includes('pdf') || name.endsWith('.pdf')) {
    return 'pdf';
  }
  if (contentType.includes('markdown') || name.endsWith('.md')) {
    return 'markdown';
  }
  if (contentType.includes('text') || name.endsWith('.txt')) {
    return 'text';
  }
  return 'markdown';
}

/**
 * Generate realistic-looking demo chunks for any document id.
 *
 * @param doc - The document to generate chunks for.
 * @returns An array of demo DocumentChunk objects.
 */
function buildChunks(doc: RagDocument): DocumentChunk[] {
  return Array.from({ length: Math.min(doc.chunkCount, 6) }, (_, i) => ({
    index: i,
    text: `[Demo chunk ${i} of "${doc.name}"]\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.`,
    tokenCount: 110 + i * 8,
    overlapTokens: i === 0 ? 0 : 20,
  }));
}

/**
 * Generate demo search results for a query.
 *
 * @param query   - The search query string.
 * @param rerank  - Whether reranking was requested (adds rerankScore).
 * @returns An array of demo SearchResult objects.
 */
function buildSearchResults(
  query: string,
  rerank: boolean,
  documents: RagDocument[] = docStore
): SearchResult[] {
  return documents.slice(0, 3).map((doc, i) => ({
    documentId: doc.id,
    documentName: doc.name,
    chunkIndex: i,
    text: `[Demo result ${i + 1} for "${query}"]\n\nThis chunk is from "${doc.name}" and contains relevant content about: ${query}.`,
    score: parseFloat((0.95 - i * 0.07).toFixed(3)),
    rerankScore: rerank ? parseFloat((0.97 - i * 0.05).toFixed(3)) : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Registers RAG document management routes on the provided Fastify instance.
 * Intended to be mounted at `/api/rag` in the main server.
 *
 * @param fastify - Fastify server instance.
 */
export default async function ragRoutes(fastify: FastifyInstance): Promise<void> {
  /** GET /api/rag/documents */
  fastify.get(
    '/documents',
    {
      schema: {
        description: 'List all indexed RAG documents',
        tags: ['RAG'],
        response: {
          200: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              documents: { type: 'array', items: { type: 'object', additionalProperties: true } },
              collections: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      markDemoReply(reply);
      return {
        mode: RAG_WORKBENCH_MODE,
        documents: docStore.map((document) => withDemoMode(document)),
        collections: collectionStore.map((collection) => withDemoMode(collection)),
      };
    }
  );

  /** POST /api/rag/upload */
  fastify.post<{
    Body: {
      url?: string;
      name?: string;
      sizeBytes?: number;
      contentType?: string;
      collectionId?: string;
    };
  }>(
    '/upload',
    {
      schema: {
        description: 'Upload a file or URL for indexing into the vector store',
        tags: ['RAG'],
        body: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            name: { type: 'string' },
            sizeBytes: { type: 'number' },
            contentType: { type: 'string' },
            collectionId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as
        | {
            url?: string;
            name?: string;
            sizeBytes?: number;
            contentType?: string;
            collectionId?: string;
          }
        | undefined;
      const requestedCollectionId = body?.collectionId?.trim() || undefined;

      if (
        requestedCollectionId &&
        !collectionStore.some((collection) => collection.id === requestedCollectionId)
      ) {
        markDemoReply(reply);
        return reply.status(404).send({
          success: false,
          message: 'Demo RAG collection not found.',
          mode: RAG_WORKBENCH_MODE,
        });
      }

      // URL-based ingestion.
      if (body?.url) {
        const doc: RagDocument = {
          id: crypto.randomUUID(),
          name: body.url,
          type: 'url',
          chunkCount: 10,
          indexedAt: new Date().toISOString(),
          collectionIds: [],
        };
        docStore.unshift(doc);
        if (requestedCollectionId) {
          attachDocumentToCollection(doc.id, requestedCollectionId);
        }
        markDemoReply(reply);
        return {
          mode: RAG_WORKBENCH_MODE,
          document: withDemoMode(doc),
          costUsd: 0.0002,
          callCount: doc.chunkCount,
        };
      }

      // File upload metadata path for the workbench UI.
      if (body?.name) {
        const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : 4_096;
        const doc: RagDocument = {
          id: crypto.randomUUID(),
          name: body.name,
          type: inferDocumentType({ name: body.name, contentType: body.contentType }),
          chunkCount: Math.max(1, Math.ceil(sizeBytes / 512)),
          indexedAt: new Date().toISOString(),
          sizeBytes,
          collectionIds: [],
        };
        docStore.unshift(doc);
        if (requestedCollectionId) {
          attachDocumentToCollection(doc.id, requestedCollectionId);
        }
        markDemoReply(reply);
        return {
          mode: RAG_WORKBENCH_MODE,
          document: withDemoMode(doc),
          costUsd: Number((doc.chunkCount * 0.00005).toFixed(4)),
          callCount: doc.chunkCount,
        };
      }

      // Generic fallback when no file metadata was provided.
      const doc: RagDocument = {
        id: crypto.randomUUID(),
        name: 'uploaded-document.md',
        type: 'markdown',
        chunkCount: 8,
        indexedAt: new Date().toISOString(),
        sizeBytes: 4_096,
        collectionIds: [],
      };
      docStore.unshift(doc);
      if (requestedCollectionId) {
        attachDocumentToCollection(doc.id, requestedCollectionId);
      }
      markDemoReply(reply);
      return {
        mode: RAG_WORKBENCH_MODE,
        document: withDemoMode(doc),
        costUsd: 0.0004,
        callCount: doc.chunkCount,
      };
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/documents/:id',
    {
      schema: {
        description: 'Delete an indexed document from the demo RAG store',
        tags: ['RAG'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              success: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const index = docStore.findIndex((doc) => doc.id === request.params.id);
      if (index >= 0) {
        docStore.splice(index, 1);
        removeDocumentFromCollections(request.params.id);
      }
      markDemoReply(reply);
      return { success: true, mode: RAG_WORKBENCH_MODE };
    }
  );

  /** POST /api/rag/search */
  fastify.post<{ Body: { query: string; rerank?: boolean; collectionId?: string } }>(
    '/search',
    {
      schema: {
        description: 'Perform a semantic search over indexed documents',
        tags: ['RAG'],
        body: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string' },
            rerank: { type: 'boolean' },
            collectionId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              results: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { query, rerank = false, collectionId } = request.body;
      const scopedDocumentIds = getCollectionDocumentIds(collectionId);
      if (collectionId && !scopedDocumentIds) {
        markDemoReply(reply);
        return reply.status(404).send({
          success: false,
          message: 'Demo RAG collection not found.',
          mode: RAG_WORKBENCH_MODE,
        });
      }

      const scopedDocs = scopedDocumentIds
        ? docStore.filter((document) => scopedDocumentIds.has(document.id))
        : docStore;
      const results = buildSearchResults(query, rerank, scopedDocs);
      markDemoReply(reply);
      return {
        mode: RAG_WORKBENCH_MODE,
        results: results.map((result) => withDemoMode(result)),
      };
    }
  );

  /** GET /api/rag/documents/:id/chunks */
  fastify.get<{ Params: { id: string } }>(
    '/documents/:id/chunks',
    {
      schema: {
        description: 'Return the chunk list for a specific indexed document',
        tags: ['RAG'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              chunks: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const doc = docStore.find((d) => d.id === request.params.id);
      if (!doc) {
        markDemoReply(reply);
        return { mode: RAG_WORKBENCH_MODE, chunks: [] };
      }
      markDemoReply(reply);
      return { mode: RAG_WORKBENCH_MODE, chunks: buildChunks(doc) };
    }
  );

  fastify.post<{ Body: { name: string } }>(
    '/collections',
    {
      schema: {
        description: 'Create a named RAG collection in the demo store',
        tags: ['RAG'],
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              collection: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const collection: RagCollection = {
        id: `col-${crypto.randomUUID()}`,
        name: request.body.name.trim(),
        documentIds: [],
        createdAt: new Date().toISOString(),
      };
      collectionStore.push(collection);
      markDemoReply(reply);
      return { mode: RAG_WORKBENCH_MODE, collection: withDemoMode(collection) };
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/collections/:id',
    {
      schema: {
        description: 'Delete a named RAG collection from the demo store',
        tags: ['RAG'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              success: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const collectionId = request.params.id;
      const index = collectionStore.findIndex((collection) => collection.id === collectionId);
      if (index >= 0) {
        collectionStore.splice(index, 1);
        for (const document of docStore) {
          document.collectionIds = document.collectionIds.filter((id) => id !== collectionId);
        }
      }
      markDemoReply(reply);
      return { success: true, mode: RAG_WORKBENCH_MODE };
    }
  );

  fastify.post<{ Params: { id: string }; Body: { documentId: string } }>(
    '/collections/:id/documents',
    {
      schema: {
        description: 'Assign an indexed document to a named RAG collection',
        tags: ['RAG'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          required: ['documentId'],
          properties: {
            documentId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              success: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      attachDocumentToCollection(request.body.documentId, request.params.id);
      markDemoReply(reply);
      return { success: true, mode: RAG_WORKBENCH_MODE };
    }
  );
}
