import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildWorkbenchRuntimeRagChunks,
  inferWorkbenchRuntimeDocumentType,
  type WorkbenchRuntimeRagChunk,
} from '../lib/workbenchRuntimeRag';

export interface RuntimeRagDocumentRecord {
  id: string;
  name: string;
  type: 'markdown' | 'pdf' | 'text' | 'url';
  chunkCount: number;
  indexedAt: string;
  sizeBytes?: number;
  collectionIds: string[];
  dataSourceId: string;
  mode: 'runtime';
  chunks: WorkbenchRuntimeRagChunk[];
}

export interface RuntimeRagCollectionRecord {
  id: string;
  name: string;
  documentIds: string[];
  createdAt: string;
  mode: 'runtime';
}

class RuntimeRagDocumentStore {
  private readonly documents = new Map<string, RuntimeRagDocumentRecord>();
  private readonly collections = new Map<string, RuntimeRagCollectionRecord>();
  private persistPath: string | null = null;

  async initialize(persistPath?: string): Promise<void> {
    this.persistPath = persistPath ?? null;
    if (!this.persistPath) {
      return;
    }

    try {
      const raw = await fs.readFile(this.persistPath, 'utf8');
      const parsed = JSON.parse(raw) as {
        documents?: RuntimeRagDocumentRecord[];
        collections?: RuntimeRagCollectionRecord[];
      };
      this.documents.clear();
      this.collections.clear();
      for (const document of parsed.documents ?? []) {
        this.documents.set(document.id, {
          ...document,
          collectionIds: [...(document.collectionIds ?? [])],
          chunks: (document.chunks ?? []).map((chunk) => ({ ...chunk })),
        });
      }
      for (const collection of parsed.collections ?? []) {
        this.collections.set(collection.id, {
          ...collection,
          documentIds: [...(collection.documentIds ?? [])],
          mode: 'runtime',
        });
      }
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.warn(`RuntimeRagDocumentStore: failed to load persisted documents: ${String(error?.message ?? error)}`);
      }
    }
  }

  upsertDocument(input: {
    id: string;
    name: string;
    content: string;
    dataSourceId: string;
    indexedAt?: string;
    sizeBytes?: number;
    type?: 'markdown' | 'pdf' | 'text' | 'url';
  }): RuntimeRagDocumentRecord {
    const indexedAt = input.indexedAt ?? new Date().toISOString();
    const chunks = buildWorkbenchRuntimeRagChunks(input.id, input.content);
    const record: RuntimeRagDocumentRecord = {
      id: input.id,
      name: input.name,
      type: input.type ?? inferWorkbenchRuntimeDocumentType(input.name),
      chunkCount: chunks.length,
      indexedAt,
      sizeBytes: input.sizeBytes ?? Buffer.byteLength(input.content, 'utf8'),
      collectionIds: [],
      dataSourceId: input.dataSourceId,
      mode: 'runtime',
      chunks,
    };
    this.documents.set(record.id, record);
    void this.persist();
    return this.cloneDocument(record);
  }

  listDocuments(): RuntimeRagDocumentRecord[] {
    return Array.from(this.documents.values())
      .sort((a, b) => b.indexedAt.localeCompare(a.indexedAt))
      .map((document) => this.cloneDocument(document));
  }

  getDocument(id: string): RuntimeRagDocumentRecord | null {
    const record = this.documents.get(id);
    return record ? this.cloneDocument(record) : null;
  }

  getChunks(id: string): WorkbenchRuntimeRagChunk[] {
    const record = this.documents.get(id);
    return record ? record.chunks.map((chunk) => ({ ...chunk })) : [];
  }

  findChunk(documentId: string, chunkId: string): WorkbenchRuntimeRagChunk | null {
    const record = this.documents.get(documentId);
    const chunk = record?.chunks.find((item) => item.chunkId === chunkId);
    return chunk ? { ...chunk } : null;
  }

  deleteDocument(id: string): RuntimeRagDocumentRecord | null {
    const record = this.documents.get(id);
    if (!record) {
      return null;
    }
    this.documents.delete(id);
    for (const collection of this.collections.values()) {
      collection.documentIds = collection.documentIds.filter((documentId) => documentId !== id);
    }
    void this.persist();
    return this.cloneDocument(record);
  }

  listCollections(): RuntimeRagCollectionRecord[] {
    return Array.from(this.collections.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((collection) => this.cloneCollection(collection));
  }

  getCollection(id: string): RuntimeRagCollectionRecord | null {
    const record = this.collections.get(id);
    return record ? this.cloneCollection(record) : null;
  }

  createCollection(name: string): RuntimeRagCollectionRecord {
    const collection: RuntimeRagCollectionRecord = {
      id: `runtime-col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      documentIds: [],
      createdAt: new Date().toISOString(),
      mode: 'runtime',
    };
    this.collections.set(collection.id, collection);
    void this.persist();
    return this.cloneCollection(collection);
  }

  deleteCollection(id: string): RuntimeRagCollectionRecord | null {
    const collection = this.collections.get(id);
    if (!collection) {
      return null;
    }
    this.collections.delete(id);
    for (const document of this.documents.values()) {
      document.collectionIds = document.collectionIds.filter((collectionId) => collectionId !== id);
    }
    void this.persist();
    return this.cloneCollection(collection);
  }

  assignDocumentToCollection(documentId: string, collectionId: string): {
    document: RuntimeRagDocumentRecord;
    collection: RuntimeRagCollectionRecord;
  } | null {
    const document = this.documents.get(documentId);
    const collection = this.collections.get(collectionId);
    if (!document || !collection) {
      return null;
    }

    if (!document.collectionIds.includes(collectionId)) {
      document.collectionIds.push(collectionId);
    }
    if (!collection.documentIds.includes(documentId)) {
      collection.documentIds.push(documentId);
    }

    void this.persist();
    return {
      document: this.cloneDocument(document),
      collection: this.cloneCollection(collection),
    };
  }

  async persist(): Promise<void> {
    if (!this.persistPath) {
      return;
    }
    await fs.mkdir(path.dirname(this.persistPath), { recursive: true });
    await fs.writeFile(
      this.persistPath,
      JSON.stringify(
        {
          documents: this.listDocuments(),
          collections: this.listCollections(),
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  private cloneDocument(record: RuntimeRagDocumentRecord): RuntimeRagDocumentRecord {
    return {
      ...record,
      collectionIds: [...record.collectionIds],
      chunks: record.chunks.map((chunk) => ({ ...chunk })),
    };
  }

  private cloneCollection(record: RuntimeRagCollectionRecord): RuntimeRagCollectionRecord {
    return {
      ...record,
      documentIds: [...record.documentIds],
    };
  }
}

export const runtimeRagDocumentStore = new RuntimeRagDocumentStore();
