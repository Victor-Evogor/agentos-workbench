import { execFile as execFileCallback } from 'node:child_process';
import crypto from 'crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { FastifyInstance } from 'fastify';
import { getAgentOSRagRuntime, persistAgentOSRuntimeRag } from '../lib/agentos';
import { WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID } from '../lib/workbenchRuntimeRag';
import { runtimeRagDocumentStore } from '../services/runtimeRagDocumentStore';

const execFile = promisify(execFileCallback);

type RuntimeRagQueryBody = {
  query: string;
  topK?: number;
  strategy?: 'similarity' | 'mmr' | 'hybrid';
  targetDataSourceIds?: string[];
  collectionId?: string;
  includeAudit?: boolean;
  rerank?: boolean;
};

type RuntimeRagIngestBody = {
  content: string;
  documentId?: string;
  title?: string;
  source?: string;
  dataSourceId?: string;
  collectionId?: string;
  metadata?: Record<string, string | number | boolean | string[] | number[]>;
};

type RuntimeRagIngestUrlBody = {
  url: string;
  title?: string;
  dataSourceId?: string;
  collectionId?: string;
};

const URL_RUNTIME_INGEST_CHAR_LIMIT = 120_000;
const PDF_RUNTIME_INGEST_CHAR_LIMIT = 180_000;
const PDF_RUNTIME_UPLOAD_MAX_BYTES = 18 * 1024 * 1024;
const PDF_RUNTIME_BODY_LIMIT = 25 * 1024 * 1024;
const PDFTOTEXT_BIN = process.env.PDFTOTEXT_BIN?.trim() || 'pdftotext';

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, rawCodePoint: string) => String.fromCodePoint(Number(rawCodePoint)))
    .replace(/&#x([0-9a-f]+);/gi, (_, rawCodePoint: string) => String.fromCodePoint(parseInt(rawCodePoint, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&(apos|#39);/gi, "'");
}

function normalizeExtractedText(input: string): string {
  return input
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTextFromHtml(html: string): string {
  const withoutHiddenContent = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const withLineBreaks = withoutHiddenContent.replace(
    /<\/?(?:article|aside|blockquote|br|div|figcaption|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|th|thead|tr|ul)[^>]*>/gi,
    '\n',
  );
  const stripped = withLineBreaks.replace(/<[^>]+>/g, ' ');
  return normalizeExtractedText(decodeHtmlEntities(stripped));
}

function extractUrlDocumentTitle(html: string, url: string): string {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch?.[1] ? normalizeExtractedText(decodeHtmlEntities(titleMatch[1])) : '';
  if (rawTitle) {
    return rawTitle.slice(0, 160);
  }

  try {
    const parsed = new URL(url);
    const pathLabel = parsed.pathname.replace(/\/$/, '') || '/';
    return `${parsed.hostname}${pathLabel === '/' ? '' : pathLabel}`;
  } catch {
    return url;
  }
}

function isSupportedRuntimeUrlContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes('text/html') ||
    normalized.includes('application/xhtml+xml') ||
    normalized.startsWith('text/') ||
    normalized.includes('application/json') ||
    normalized.includes('application/xml') ||
    normalized.includes('text/xml')
  );
}

function inferRuntimeUploadFileType(
  fileName: string,
  mimetype?: string,
): 'markdown' | 'pdf' | 'text' | null {
  const normalizedName = fileName.trim().toLowerCase();
  const normalizedMime = mimetype?.trim().toLowerCase() ?? '';

  if (normalizedMime.includes('pdf') || normalizedName.endsWith('.pdf')) {
    return 'pdf';
  }
  if (
    normalizedMime.includes('markdown') ||
    normalizedName.endsWith('.md') ||
    normalizedName.endsWith('.markdown')
  ) {
    return 'markdown';
  }
  if (normalizedMime.startsWith('text/') || normalizedName.endsWith('.txt')) {
    return 'text';
  }
  return null;
}

function normalizeRuntimeFileText(buffer: Buffer<ArrayBufferLike>): string {
  return buffer.toString('utf8').replace(/\r\n/g, '\n').trim();
}

function normalizeOptionalString(input: string | null | undefined): string | undefined {
  const value = input?.trim();
  return value || undefined;
}

function ensurePdfHeader(pdfBuffer: Buffer): boolean {
  return pdfBuffer.subarray(0, 4).toString('utf8') === '%PDF';
}

async function extractTextFromPdfBuffer(pdfBuffer: Buffer): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-workbench-pdf-'));
  const tempPdfPath = path.join(tempDir, 'document.pdf');

  try {
    await fs.writeFile(tempPdfPath, pdfBuffer);
    const result = await execFile(
      PDFTOTEXT_BIN,
      ['-q', '-layout', '-nopgbrk', '-enc', 'UTF-8', tempPdfPath, '-'],
      {
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    return normalizeExtractedText(result.stdout);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Unknown error';
}

function buildCollectionDocumentIdSet(documentIds: string[]): Set<string> {
  return new Set(documentIds);
}

function readMultipartFieldString(
  fields: Record<string, any> | undefined,
  fieldName: string,
): string | undefined {
  const field = fields?.[fieldName];
  const candidate = Array.isArray(field) ? field[0] : field;
  if (!candidate || candidate.type !== 'field' || typeof candidate.value !== 'string') {
    return undefined;
  }
  const value = candidate.value.trim();
  return value || undefined;
}

export default async function ragRuntimeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/rag/documents', {
    schema: {
      description: 'List runtime-ingested RAG documents mirrored by the workbench backend',
      tags: ['AgentOS', 'RAG'],
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async () => {
    return {
      success: true,
      documents: runtimeRagDocumentStore.listDocuments().map((document) => ({
        ...document,
        chunks: undefined,
      })),
    };
  });

  fastify.get<{ Params: { id: string } }>('/rag/documents/:id/mirror-status', {
    schema: {
      description: 'Check whether a runtime RAG document has been mirrored into the workbench registry',
      tags: ['AgentOS', 'RAG'],
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
          additionalProperties: true,
        },
      },
    },
  }, async (request) => {
    const document = runtimeRagDocumentStore.getDocument(request.params.id);

    return {
      success: true,
      documentId: request.params.id,
      mirrored: Boolean(document),
      checkedAt: new Date().toISOString(),
      sourceLabel: document?.dataSourceId ?? null,
      document: document
        ? {
            ...document,
            chunks: undefined,
          }
        : null,
    };
  });

  fastify.get('/rag/collections', {
    schema: {
      description: 'List runtime-backed RAG collections mirrored by the workbench backend',
      tags: ['AgentOS', 'RAG'],
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async () => {
    return {
      success: true,
      collections: runtimeRagDocumentStore.listCollections(),
    };
  });

  fastify.get('/rag/health', {
    schema: {
      description: 'Inspect runtime-backed AgentOS retrieval availability for the workbench',
      tags: ['AgentOS', 'RAG'],
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async () => {
    const {
      agentos,
      retrievalAugmentor,
      vectorStoreManager,
      modelProviderManager,
    } = await getAgentOSRagRuntime();

    const runtimeSnapshot = typeof agentos.getRuntimeSnapshot === 'function'
      ? (await agentos.getRuntimeSnapshot().catch(() => null) as any)
      : null;
    const defaultProvider = modelProviderManager?.getDefaultProvider?.() as { providerId?: string } | undefined;
    const providerAvailable = Boolean(defaultProvider?.providerId);
    const dataSources = vectorStoreManager?.listDataSourceIds?.() ?? [];

    const retrievalHealth = retrievalAugmentor?.checkHealth
      ? await retrievalAugmentor.checkHealth().catch((error) => ({
        isHealthy: false,
        details: { message: getErrorMessage(error) },
      }))
      : null;

    const vectorStoreHealth = vectorStoreManager?.checkHealth
      ? await vectorStoreManager.checkHealth().catch((error) => ({
        isOverallHealthy: false,
        managerDetails: { message: getErrorMessage(error) },
      }))
      : null;

    const runtimeConnected = Boolean(runtimeSnapshot);
    const runtimeReportsRetrieval = Boolean(runtimeSnapshot?.services?.retrievalAugmentor && retrievalAugmentor);
    const ready =
      runtimeConnected &&
      runtimeReportsRetrieval &&
      providerAvailable &&
      retrievalHealth &&
      (retrievalHealth as any).isHealthy === true &&
      (!vectorStoreHealth || (vectorStoreHealth as any).isOverallHealthy !== false);

    const degraded = Boolean(
      retrievalAugmentor &&
      (!providerAvailable || (retrievalHealth && (retrievalHealth as any).isHealthy === false))
    );

    const status = ready ? 'ready' : degraded ? 'degraded' : 'disabled';
    const message = ready
      ? 'Runtime retrieval is ready for query and ingestion.'
      : degraded
        ? 'Runtime retrieval was initialized, but the embedding provider or vector store is not currently healthy.'
        : 'Runtime retrieval is not enabled for this workbench backend.';

    return {
      status,
      runtimeConnected,
      runtimeReportsRetrieval,
      providerAvailable,
      defaultProviderId: defaultProvider?.providerId ?? null,
      dataSources,
      vectorStoreConnected: Boolean((vectorStoreHealth as any)?.isOverallHealthy ?? dataSources.length > 0),
      message,
      details: {
        retrievalHealth,
        vectorStoreHealth,
      },
    };
  });

  fastify.get<{ Params: { id: string } }>('/rag/documents/:id/chunks', {
    schema: {
      description: 'List chunk previews for a runtime-ingested RAG document',
      tags: ['AgentOS', 'RAG'],
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
          additionalProperties: true,
        },
        404: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async (request, reply) => {
    const document = runtimeRagDocumentStore.getDocument(request.params.id);
    if (!document) {
      return reply.status(404).send({
        success: false,
        message: 'Runtime RAG document not found.',
      });
    }

    return {
      success: true,
      chunks: document.chunks.map((chunk) => ({
        index: chunk.index,
        text: chunk.text,
        tokenCount: chunk.tokenCount,
        overlapTokens: chunk.overlapTokens,
      })),
    };
  });

  fastify.post<{ Body: { name: string } }>('/rag/collections', {
    schema: {
      description: 'Create a runtime-backed RAG collection',
      tags: ['AgentOS', 'RAG'],
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
          additionalProperties: true,
        },
        404: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async (request, reply) => {
    const name = request.body.name.trim();
    if (!name) {
      return reply.status(400).send({
        success: false,
        message: 'Collection name is required.',
      });
    }

    const collection = runtimeRagDocumentStore.createCollection(name);
    await runtimeRagDocumentStore.persist();
    return {
      success: true,
      collection,
    };
  });

  fastify.delete<{ Params: { id: string } }>('/rag/collections/:id', {
    schema: {
      description: 'Delete a runtime-backed RAG collection',
      tags: ['AgentOS', 'RAG'],
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
          additionalProperties: true,
        },
        404: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async (request, reply) => {
    const collection = runtimeRagDocumentStore.deleteCollection(request.params.id);
    if (!collection) {
      return reply.status(404).send({
        success: false,
        message: 'Runtime RAG collection not found.',
      });
    }

    await runtimeRagDocumentStore.persist();
    return {
      success: true,
    };
  });

  fastify.post<{ Params: { id: string }; Body: { documentId: string } }>('/rag/collections/:id/documents', {
    schema: {
      description: 'Assign a runtime-backed RAG document to a runtime-backed collection',
      tags: ['AgentOS', 'RAG'],
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
          additionalProperties: true,
        },
        404: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async (request, reply) => {
    const result = runtimeRagDocumentStore.assignDocumentToCollection(
      request.body.documentId,
      request.params.id,
    );

    if (!result) {
      return reply.status(404).send({
        success: false,
        message: 'Runtime RAG document or collection not found.',
      });
    }

    await runtimeRagDocumentStore.persist();
    return {
      success: true,
      collection: result.collection,
      document: {
        ...result.document,
        chunks: undefined,
      },
    };
  });

  fastify.post<{ Body: RuntimeRagQueryBody }>('/rag/query', {
    schema: {
      description: 'Execute a runtime-backed AgentOS retrieval query',
      tags: ['AgentOS', 'RAG'],
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          topK: { type: 'number' },
          strategy: { type: 'string', enum: ['similarity', 'mmr', 'hybrid'] },
          targetDataSourceIds: { type: 'array', items: { type: 'string' } },
          collectionId: { type: 'string' },
          includeAudit: { type: 'boolean' },
          rerank: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
        },
        404: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async (request, reply) => {
    const {
      retrievalAugmentor,
      modelProviderManager,
    } = await getAgentOSRagRuntime();
    const defaultProvider = modelProviderManager?.getDefaultProvider?.() as { providerId?: string } | undefined;

    if (!retrievalAugmentor?.retrieveContext) {
      return reply.status(503).send({
        success: false,
        message: 'Runtime retrieval is not enabled on this backend.',
      });
    }

    if (!defaultProvider?.providerId) {
      return reply.status(503).send({
        success: false,
        message: 'No initialized embedding provider is available for runtime retrieval.',
      });
    }

    const requestedTopK = Math.max(1, request.body.topK ?? 5);
    const scopedCollection = request.body.collectionId
      ? runtimeRagDocumentStore.getCollection(request.body.collectionId)
      : null;
    if (request.body.collectionId && !scopedCollection) {
      return reply.status(404).send({
        success: false,
        message: 'Runtime RAG collection not found.',
      });
    }
    const scopedDocumentIds = scopedCollection
      ? buildCollectionDocumentIdSet(scopedCollection.documentIds)
      : null;

    try {
      const result = await retrievalAugmentor.retrieveContext(request.body.query, {
        topK: scopedCollection ? Math.max(requestedTopK, 25) : requestedTopK,
        strategy: request.body.strategy,
        targetDataSourceIds: request.body.targetDataSourceIds,
        includeAudit: request.body.includeAudit,
        rerankerConfig: request.body.rerank ? { enabled: true } : undefined,
      }) as {
        queryText: string;
        augmentedContext: string;
        diagnostics?: Record<string, unknown>;
        auditTrail?: unknown;
        retrievedChunks?: Array<{
          id: string;
          originalDocumentId: string;
          content: string;
          relevanceScore?: number;
          source?: string;
          dataSourceId?: string;
          metadata?: Record<string, unknown>;
        }>;
      };

      return {
        success: true,
        mode: 'runtime',
        query: result.queryText,
        augmentedContext: result.augmentedContext,
        diagnostics: result.diagnostics ?? null,
        auditTrail: result.auditTrail ?? null,
        chunks: (result.retrievedChunks ?? [])
          .filter((chunk) => !scopedDocumentIds || scopedDocumentIds.has(chunk.originalDocumentId))
          .slice(0, requestedTopK)
          .map((chunk) => ({
            documentName:
              runtimeRagDocumentStore.getDocument(chunk.originalDocumentId)?.name ??
              chunk.source ??
              chunk.originalDocumentId,
            chunkId: chunk.id,
            chunkIndex:
              runtimeRagDocumentStore.findChunk(chunk.originalDocumentId, chunk.id)?.index ?? 0,
            documentId: chunk.originalDocumentId,
            content: chunk.content,
            score: chunk.relevanceScore ?? 0,
            source: chunk.source,
            dataSourceId: chunk.dataSourceId,
            metadata: chunk.metadata,
          })),
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        message: getErrorMessage(error),
      });
    }
  });

  fastify.post<{ Body: RuntimeRagIngestBody }>('/rag/ingest', {
    schema: {
      description: 'Ingest plain text into the runtime-backed AgentOS retrieval store',
      tags: ['AgentOS', 'RAG'],
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string' },
          documentId: { type: 'string' },
          title: { type: 'string' },
          source: { type: 'string' },
          dataSourceId: { type: 'string' },
          collectionId: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async (request, reply) => {
    const {
      retrievalAugmentor,
      modelProviderManager,
    } = await getAgentOSRagRuntime();
    const defaultProvider = modelProviderManager?.getDefaultProvider?.() as { providerId?: string } | undefined;
    const requestedCollectionId = normalizeOptionalString(request.body.collectionId);
    const requestedCollection = requestedCollectionId
      ? runtimeRagDocumentStore.getCollection(requestedCollectionId)
      : null;

    if (!retrievalAugmentor?.ingestDocuments) {
      return reply.status(503).send({
        success: false,
        message: 'Runtime retrieval is not enabled on this backend.',
      });
    }

    if (!defaultProvider?.providerId) {
      return reply.status(503).send({
        success: false,
        message: 'No initialized embedding provider is available for runtime ingestion.',
      });
    }

    if (requestedCollectionId && !requestedCollection) {
      return reply.status(404).send({
        success: false,
        message: 'Runtime RAG collection not found.',
      });
    }

    const documentId = request.body.documentId?.trim() || `workbench-runtime-${crypto.randomUUID()}`;
    const documentName = request.body.title?.trim() || request.body.source?.trim() || documentId;
    const metadata = {
      ...(request.body.metadata ?? {}),
      ...(request.body.title ? { title: request.body.title } : {}),
      source: request.body.source ?? request.body.title ?? 'AgentOS Workbench',
      ingestedFrom: 'agentos-workbench',
    };

    try {
      const result = await retrievalAugmentor.ingestDocuments(
        {
          id: documentId,
          content: request.body.content,
          dataSourceId: request.body.dataSourceId ?? WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID,
          source: request.body.source ?? request.body.title ?? 'AgentOS Workbench',
          metadata,
        },
        {
          targetDataSourceId: request.body.dataSourceId ?? WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID,
        },
      ) as {
        processedCount: number;
        failedCount: number;
        ingestedIds?: string[];
        effectiveDataSourceIds?: string[];
        errors?: Array<Record<string, unknown>>;
      };

      runtimeRagDocumentStore.upsertDocument({
        id: documentId,
        name: documentName,
        content: request.body.content,
        dataSourceId: result.effectiveDataSourceIds?.[0] ?? request.body.dataSourceId ?? WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID,
      });
      if (requestedCollection) {
        runtimeRagDocumentStore.assignDocumentToCollection(documentId, requestedCollection.id);
      }
      const document = runtimeRagDocumentStore.getDocument(documentId);
      await runtimeRagDocumentStore.persist();
      await persistAgentOSRuntimeRag();

      return {
        success: true,
        mode: 'runtime',
        documentId,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        ingestedIds: result.ingestedIds ?? [documentId],
        effectiveDataSourceIds: result.effectiveDataSourceIds ?? [],
        errors: result.errors ?? [],
        document: document
          ? {
              ...document,
              chunks: undefined,
            }
          : undefined,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        message: getErrorMessage(error),
      });
    }
  });

  fastify.post<{ Body: RuntimeRagIngestUrlBody }>('/rag/ingest-url', {
    schema: {
      description: 'Fetch a URL and ingest extracted text into the runtime-backed AgentOS retrieval store',
      tags: ['AgentOS', 'RAG'],
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string' },
          title: { type: 'string' },
          dataSourceId: { type: 'string' },
          collectionId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async (request, reply) => {
    const {
      retrievalAugmentor,
      modelProviderManager,
    } = await getAgentOSRagRuntime();
    const defaultProvider = modelProviderManager?.getDefaultProvider?.() as { providerId?: string } | undefined;
    const requestedCollectionId = normalizeOptionalString(request.body.collectionId);
    const requestedCollection = requestedCollectionId
      ? runtimeRagDocumentStore.getCollection(requestedCollectionId)
      : null;

    if (!retrievalAugmentor?.ingestDocuments) {
      return reply.status(503).send({
        success: false,
        message: 'Runtime retrieval is not enabled on this backend.',
      });
    }

    if (!defaultProvider?.providerId) {
      return reply.status(503).send({
        success: false,
        message: 'No initialized embedding provider is available for runtime URL ingestion.',
      });
    }

    if (requestedCollectionId && !requestedCollection) {
      return reply.status(404).send({
        success: false,
        message: 'Runtime RAG collection not found.',
      });
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(request.body.url);
    } catch {
      return reply.status(400).send({
        success: false,
        message: 'A valid absolute URL is required.',
      });
    }

    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      return reply.status(400).send({
        success: false,
        message: 'Only http:// and https:// URLs can be ingested.',
      });
    }

    let response: Response;
    try {
      response = await fetch(targetUrl.toString(), {
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
        headers: {
          'User-Agent': 'AgentOS-Workbench/1.0 (+runtime-rag-url-ingest)',
          Accept: 'text/html, text/plain, application/xhtml+xml, application/json, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.1',
        },
      });
    } catch (error) {
      return reply.status(502).send({
        success: false,
        message: `Failed to fetch URL for runtime ingestion: ${getErrorMessage(error)}`,
      });
    }

    if (!response.ok) {
      return reply.status(502).send({
        success: false,
        message: `Failed to fetch URL for runtime ingestion: HTTP ${response.status}`,
      });
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !isSupportedRuntimeUrlContentType(contentType)) {
      return reply.status(415).send({
        success: false,
        message: `Runtime URL ingestion does not support ${contentType} yet.`,
      });
    }

    const rawBody = await response.text();
    const extractedContent = contentType.toLowerCase().includes('html')
      ? extractTextFromHtml(rawBody)
      : normalizeExtractedText(rawBody);
    const content = extractedContent.slice(0, URL_RUNTIME_INGEST_CHAR_LIMIT).trim();

    if (!content) {
      return reply.status(422).send({
        success: false,
        message: 'No indexable text could be extracted from that URL.',
      });
    }

    const documentId = `workbench-runtime-url-${crypto.randomUUID()}`;
    const documentName = request.body.title?.trim() || extractUrlDocumentTitle(rawBody, targetUrl.toString());
    const metadata = {
      fetchedUrl: targetUrl.toString(),
      contentType: contentType || 'unknown',
      ingestedFrom: 'agentos-workbench-url',
      source: targetUrl.toString(),
    };

    try {
      const result = await retrievalAugmentor.ingestDocuments(
        {
          id: documentId,
          content,
          dataSourceId: request.body.dataSourceId ?? WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID,
          source: targetUrl.toString(),
          metadata,
        },
        {
          targetDataSourceId: request.body.dataSourceId ?? WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID,
        },
      ) as {
        processedCount: number;
        failedCount: number;
        ingestedIds?: string[];
        effectiveDataSourceIds?: string[];
        errors?: Array<Record<string, unknown>>;
      };

      runtimeRagDocumentStore.upsertDocument({
        id: documentId,
        name: documentName,
        content,
        dataSourceId: result.effectiveDataSourceIds?.[0] ?? request.body.dataSourceId ?? WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID,
        type: 'url',
      });
      if (requestedCollection) {
        runtimeRagDocumentStore.assignDocumentToCollection(documentId, requestedCollection.id);
      }
      const document = runtimeRagDocumentStore.getDocument(documentId);
      await runtimeRagDocumentStore.persist();
      await persistAgentOSRuntimeRag();

      return {
        success: true,
        mode: 'runtime',
        fetchedUrl: targetUrl.toString(),
        contentType: contentType || null,
        documentId,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        ingestedIds: result.ingestedIds ?? [documentId],
        effectiveDataSourceIds: result.effectiveDataSourceIds ?? [],
        errors: result.errors ?? [],
        document: document
          ? {
              ...document,
              chunks: undefined,
            }
          : undefined,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        message: getErrorMessage(error),
      });
    }
  });

  fastify.post('/rag/ingest-file', {
    bodyLimit: PDF_RUNTIME_BODY_LIMIT,
    schema: {
      description: 'Upload a text, markdown, or PDF file and ingest it into the runtime-backed AgentOS retrieval store',
      tags: ['AgentOS', 'RAG'],
      body: {
        type: 'object',
        additionalProperties: true,
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
        },
        400: {
          type: 'object',
          additionalProperties: true,
        },
        404: {
          type: 'object',
          additionalProperties: true,
        },
        413: {
          type: 'object',
          additionalProperties: true,
        },
        415: {
          type: 'object',
          additionalProperties: true,
        },
        422: {
          type: 'object',
          additionalProperties: true,
        },
        500: {
          type: 'object',
          additionalProperties: true,
        },
        501: {
          type: 'object',
          additionalProperties: true,
        },
        503: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async (request, reply) => {
    const {
      retrievalAugmentor,
      modelProviderManager,
    } = await getAgentOSRagRuntime();
    const defaultProvider = modelProviderManager?.getDefaultProvider?.() as { providerId?: string } | undefined;

    if (!retrievalAugmentor?.ingestDocuments) {
      return reply.status(503).send({
        success: false,
        message: 'Runtime retrieval is not enabled on this backend.',
      });
    }

    if (!defaultProvider?.providerId) {
      return reply.status(503).send({
        success: false,
        message: 'No initialized embedding provider is available for runtime file ingestion.',
      });
    }

    if (!request.isMultipart()) {
      return reply.status(400).send({
        success: false,
        message: 'Runtime file ingestion requires a multipart upload.',
      });
    }

    const filePart = await request.file({
      limits: {
        fileSize: PDF_RUNTIME_UPLOAD_MAX_BYTES,
        files: 1,
        parts: 10,
      },
    });

    if (!filePart) {
      return reply.status(400).send({
        success: false,
        message: 'No file was provided for runtime ingestion.',
      });
    }

    const fileName = filePart.filename.trim();
    const requestedDataSourceId = readMultipartFieldString(filePart.fields, 'dataSourceId');
    const requestedCollectionId = readMultipartFieldString(filePart.fields, 'collectionId');
    const fileType = inferRuntimeUploadFileType(fileName, filePart.mimetype);
    const requestedCollection = requestedCollectionId
      ? runtimeRagDocumentStore.getCollection(requestedCollectionId)
      : null;

    if (!fileType) {
      return reply.status(415).send({
        success: false,
        message: 'Runtime file ingestion currently supports markdown, text, and PDF files only.',
      });
    }

    if (requestedCollectionId && !requestedCollection) {
      return reply.status(404).send({
        success: false,
        message: 'Runtime RAG collection not found.',
      });
    }

    let fileBuffer: Buffer<ArrayBufferLike>;
    try {
      fileBuffer = await filePart.toBuffer();
    } catch (error: any) {
      if (error?.code === 'FST_REQ_FILE_TOO_LARGE' || /too large/i.test(String(error?.message ?? ''))) {
        return reply.status(413).send({
          success: false,
          message: `Runtime file ingestion is limited to ${Math.floor(PDF_RUNTIME_UPLOAD_MAX_BYTES / (1024 * 1024))} MB files.`,
        });
      }

      return reply.status(422).send({
        success: false,
        message: `Failed to read uploaded file: ${getErrorMessage(error)}`,
      });
    }

    let content = '';
    let parser: 'pdftotext' | undefined;
    let extractedCharacters: number | undefined;

    if (fileType === 'pdf') {
      if (!ensurePdfHeader(fileBuffer)) {
        return reply.status(400).send({
          success: false,
          message: 'The uploaded file does not look like a valid PDF.',
        });
      }

      try {
        content = (await extractTextFromPdfBuffer(fileBuffer)).slice(0, PDF_RUNTIME_INGEST_CHAR_LIMIT).trim();
        parser = 'pdftotext';
        extractedCharacters = content.length;
      } catch (error: any) {
        if (error?.code === 'ENOENT') {
          return reply.status(501).send({
            success: false,
            message: 'Runtime PDF ingestion requires pdftotext to be installed on the backend host.',
          });
        }

        return reply.status(422).send({
          success: false,
          message: `Failed to extract text from PDF: ${getErrorMessage(error)}`,
        });
      }
    } else {
      content = normalizeRuntimeFileText(fileBuffer);
    }

    if (!content) {
      return reply.status(422).send({
        success: false,
        message: 'No indexable text could be extracted from that file.',
      });
    }

    const documentId = `workbench-runtime-file-${crypto.randomUUID()}`;
    const metadata = {
      source: fileName,
      fileName,
      contentType: filePart.mimetype || 'unknown',
      ...(parser ? { parser } : {}),
      ingestedFrom: 'agentos-workbench-file',
    };

    try {
      const result = await retrievalAugmentor.ingestDocuments(
        {
          id: documentId,
          content,
          dataSourceId: requestedDataSourceId ?? WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID,
          source: fileName,
          metadata,
        },
        {
          targetDataSourceId: requestedDataSourceId ?? WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID,
        },
      ) as {
        processedCount: number;
        failedCount: number;
        ingestedIds?: string[];
        effectiveDataSourceIds?: string[];
        errors?: Array<Record<string, unknown>>;
      };

      runtimeRagDocumentStore.upsertDocument({
        id: documentId,
        name: fileName,
        content,
        dataSourceId: result.effectiveDataSourceIds?.[0] ?? requestedDataSourceId ?? WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID,
        sizeBytes: fileBuffer.byteLength,
        type: fileType,
      });
      if (requestedCollection) {
        runtimeRagDocumentStore.assignDocumentToCollection(documentId, requestedCollection.id);
      }
      const document = runtimeRagDocumentStore.getDocument(documentId);
      await runtimeRagDocumentStore.persist();
      await persistAgentOSRuntimeRag();

      return {
        success: true,
        mode: 'runtime',
        documentId,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        ingestedIds: result.ingestedIds ?? [documentId],
        effectiveDataSourceIds: result.effectiveDataSourceIds ?? [],
        errors: result.errors ?? [],
        ...(parser ? { parser } : {}),
        ...(typeof extractedCharacters === 'number' ? { extractedCharacters } : {}),
        document: document
          ? {
              ...document,
              chunks: undefined,
            }
          : undefined,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        message: getErrorMessage(error),
      });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/rag/documents/:id', {
    schema: {
      description: 'Delete a runtime-ingested RAG document from the retrieval store',
      tags: ['AgentOS', 'RAG'],
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
          additionalProperties: true,
        },
        404: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async (request, reply) => {
    const document = runtimeRagDocumentStore.getDocument(request.params.id);
    if (!document) {
      return reply.status(404).send({
        success: false,
        message: 'Runtime RAG document not found.',
      });
    }

    const { retrievalAugmentor } = await getAgentOSRagRuntime();
    if (!retrievalAugmentor?.deleteDocuments) {
      return reply.status(503).send({
        success: false,
        message: 'Runtime retrieval is not enabled on this backend.',
      });
    }

    try {
      const deletion = await retrievalAugmentor.deleteDocuments(
        document.chunks.map((chunk) => chunk.chunkId),
        document.dataSourceId,
      ) as {
        successCount: number;
        failureCount: number;
        errors?: Array<Record<string, unknown>>;
      };

      if (deletion.failureCount > 0) {
        return reply.status(500).send({
          success: false,
          message: 'One or more runtime RAG chunks could not be deleted.',
          details: deletion,
        });
      }

      runtimeRagDocumentStore.deleteDocument(request.params.id);
      await runtimeRagDocumentStore.persist();
      await persistAgentOSRuntimeRag();
      return {
        success: true,
        deletedChunkCount: deletion.successCount,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        message: getErrorMessage(error),
      });
    }
  });
}
