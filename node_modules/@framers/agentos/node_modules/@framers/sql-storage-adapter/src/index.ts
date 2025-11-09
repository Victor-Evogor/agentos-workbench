// Public type surface -------------------------------------------------------
export * from './types';

// Core runtime APIs ---------------------------------------------------------
export * from './core/database';
export * from './core/resolver';

// Adapter implementations ----------------------------------------------------
export * from './adapters/betterSqliteAdapter';
export * from './adapters/sqlJsAdapter';
export * from './adapters/indexedDbAdapter';
export * from './adapters/capacitorSqliteAdapter';
export * from './adapters/postgresAdapter';
export * from './adapters/supabase';
export * from './adapters/baseStorageAdapter';

// Feature modules ------------------------------------------------------------
export * from './features/backup/cloudBackup';
export * from './features/migrations/dataExport';
export * from './features/migrations/dataImport';
export * from './features/migrations/migration';
export * from './features/sync/syncManager';

// Shared utilities -----------------------------------------------------------
export * from './shared/parameterUtils';
