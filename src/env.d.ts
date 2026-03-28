/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_BACKEND_PORT?: string;
  readonly VITE_BACKEND_HOST?: string;
  readonly VITE_BACKEND_PROTOCOL?: string;
  readonly VITE_AGENTOS_BASE_URL?: string;
  readonly VITE_AGENTOS_STREAM_PATH?: string;
  readonly VITE_AGENTOS_WORKFLOW_DEFINITIONS_PATH?: string;
  readonly VITE_AGENTOS_PERSONAS_PATH?: string;
  readonly VITE_AGENTOS_WITH_CREDENTIALS?: string;
  readonly VITE_AGENTOS_WORKBENCH_USER_ID?: string;
  readonly VITE_E2E_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "@framers/sql-storage-adapter/adapters/indexedDbAdapter" {
  import type {
    StorageAdapter,
    StorageCapability,
    StorageOpenOptions,
    StorageParameters,
    StorageRunResult
  } from "@framers/sql-storage-adapter/types";

  export interface IndexedDbAdapterOptions {
    dbName?: string;
    storeName?: string;
    autoSave?: boolean;
    saveIntervalMs?: number;
    sqlJsConfig?: unknown;
  }

  export class IndexedDbAdapter implements StorageAdapter {
    readonly kind: string;
    readonly capabilities: ReadonlySet<StorageCapability>;
    constructor(options?: IndexedDbAdapterOptions);
    open(options?: StorageOpenOptions): Promise<void>;
    run(statement: string, parameters?: StorageParameters): Promise<StorageRunResult>;
    get<T = unknown>(statement: string, parameters?: StorageParameters): Promise<T | null>;
    all<T = unknown>(statement: string, parameters?: StorageParameters): Promise<T[]>;
    exec(script: string): Promise<void>;
    transaction<T>(fn: (trx: StorageAdapter) => Promise<T>): Promise<T>;
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    close(): Promise<void>;
  }
}
