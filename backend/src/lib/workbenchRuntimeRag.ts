import path from 'node:path';

export const WORKBENCH_RUNTIME_RAG_PROVIDER_ID = 'workbench-rag-memory';
export const WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID = 'workbench-runtime-rag';
export const WORKBENCH_RUNTIME_RAG_CHUNK_SIZE = 1200;
export const WORKBENCH_RUNTIME_RAG_CHUNK_OVERLAP = 120;
export const WORKBENCH_RUNTIME_RAG_VECTOR_PERSIST_PATH = path.resolve(
  __dirname,
  '../../data/runtime-rag-vectors.json',
);
export const WORKBENCH_RUNTIME_RAG_DOCUMENT_PERSIST_PATH = path.resolve(
  __dirname,
  '../../data/runtime-rag-documents.json',
);

export interface WorkbenchRuntimeRagChunk {
  chunkId: string;
  index: number;
  text: string;
  tokenCount: number;
  overlapTokens: number;
}

function estimateTokenCount(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }
  return normalized.split(/\s+/).length;
}

export function buildWorkbenchRuntimeRagChunks(
  documentId: string,
  content: string,
): WorkbenchRuntimeRagChunk[] {
  if (!content) {
    return [
      {
        chunkId: `${documentId}_chunk_0`,
        index: 0,
        text: '',
        tokenCount: 0,
        overlapTokens: 0,
      },
    ];
  }

  const chunks: WorkbenchRuntimeRagChunk[] = [];
  let cursor = 0;
  let index = 0;

  while (cursor < content.length) {
    const end = Math.min(cursor + WORKBENCH_RUNTIME_RAG_CHUNK_SIZE, content.length);
    const text = content.slice(cursor, end);
    chunks.push({
      chunkId: `${documentId}_chunk_${index}`,
      index,
      text,
      tokenCount: estimateTokenCount(text),
      overlapTokens: index === 0 ? 0 : estimateTokenCount(content.slice(cursor, Math.min(cursor + WORKBENCH_RUNTIME_RAG_CHUNK_OVERLAP, end))),
    });
    index += 1;
    if (end >= content.length) {
      break;
    }
    cursor += WORKBENCH_RUNTIME_RAG_CHUNK_SIZE - WORKBENCH_RUNTIME_RAG_CHUNK_OVERLAP;
  }

  return chunks;
}

export function inferWorkbenchRuntimeDocumentType(name: string): 'markdown' | 'pdf' | 'text' | 'url' {
  const normalized = name.trim().toLowerCase();
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return 'url';
  }
  if (normalized.endsWith('.pdf')) {
    return 'pdf';
  }
  if (normalized.endsWith('.md') || normalized.endsWith('.markdown')) {
    return 'markdown';
  }
  return 'text';
}
