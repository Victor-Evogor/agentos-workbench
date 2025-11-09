<!-- BRANDING-LOGOS -->
<p align="center">
  <a href="https://agentos.sh"><img src="logos/agentos-primary-no-tagline.svg" alt="AgentOS" height="64" /></a>
</p>
<p align="center">
  <a href="https://frame.dev"><img src="logos/frame-wordmark.svg" alt="Frame" height="28" /></a>
</p>

# SQL Storage Adapter

<p align="center">
  <a href="https://frame.dev" target="_blank" rel="noopener">
    <img src="https://avatars.githubusercontent.com/u/184314983?s=400&u=02bc60d3f02d586a9ed526e394162651192670c1&v=4" alt="Frame.dev" width="120" style="border-radius: 12px;">
  </a>
  <br>
  <small>by <a href="https://frame.dev" target="_blank" rel="noopener">Frame.dev</a></small>
</p>

[![npm version](https://img.shields.io/npm/v/@framers/sql-storage-adapter.svg?logo=npm&label=npm)](https://www.npmjs.com/package/@framers/sql-storage-adapter)
[![CI](https://github.com/framersai/sql-storage-adapter/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/framersai/sql-storage-adapter/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/framersai/sql-storage-adapter/branch/master/graph/badge.svg)](https://codecov.io/gh/framersai/sql-storage-adapter)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/@framers/sql-storage-adapter.svg)](./LICENSE)

> Cross-platform SQL access for Node.js, web, and native runtimes with automatic adapter selection and consistent APIs.

The SQL Storage Adapter provides a single, ergonomic interface over SQLite (native and WASM), PostgreSQL, Capacitor, IndexedDB, and in-memory stores. It handles adapter discovery, capability detection, and advanced features like cloud backups so you can focus on your application logic.

**🆕 NEW:** Full IndexedDB support for browser-native, offline-first web apps!

---

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Adapter Matrix](#adapter-matrix)
- [Configuration & Resolution](#configuration--resolution)
- [Platform Strategy](#platform-strategy)
- [CI, Releases, and Badges](#ci-releases-and-badges)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Auto-detected adapters** – `createDatabase()` inspects environment signals and picks the best backend (native SQLite, PostgreSQL, Capacitor, sql.js, **IndexedDB**, memory, etc.).
- **Capability-aware API** – consistent CRUD, transactions, batching, and event hooks across adapters with runtime capability introspection.
- **🆕 IndexedDB** – sql.js + IndexedDB persistence wrapper for browser-native, offline-first web apps (uses sql.js for SQL execution, IndexedDB for storage).
- **Cloud backups & migrations** – built-in backup manager with compression, retention policies, and restore helpers plus migration utilities.
- **Portable packaging** – optional native dependencies; falls back to pure TypeScript/WASM adapters when native modules are unavailable.
- **Browser-friendly** – Dynamic imports prevent bundlers from including server-only dependencies (`pg`, `path`) in browser builds.
- **CI-first design** – Vitest coverage, Codecov integration, and GitHub Actions workflows for linting, testing, releasing, and npm publish/tag automation.

## Installation

```bash
# Core package
npm install @framers/sql-storage-adapter

# Install only the adapters you plan to use
npm install better-sqlite3            # Native SQLite for Node/Electron
npm install pg                        # PostgreSQL
npm install @capacitor-community/sqlite  # Capacitor / mobile
npm install sql.js                    # WASM SQLite (auto-included for IndexedDB)
# IndexedDB uses sql.js (no extra install needed)
```

> Windows users: ensure the Visual Studio Build Tools (C++ workload) are installed before adding `better-sqlite3`. On Linux, install `python3`, `build-essential`, and `libssl-dev` prior to `npm install`.

> Note: If `better-sqlite3` cannot be required, install native build tools before `npm install`, ensure your Node version matches available prebuilt binaries, or fall back to `sql.js` or `indexeddb` by setting `STORAGE_ADAPTER=sqljs` or `STORAGE_ADAPTER=indexeddb`.

## Quick Start

```typescript
import { createDatabase } from '@framers/sql-storage-adapter';

async function main() {
  // Automatically selects the best adapter for the current runtime
  const db = await createDatabase();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY,
      task TEXT NOT NULL,
      done INTEGER DEFAULT 0
    )
  `);

  await db.run('INSERT INTO todos (task) VALUES (?)', ['Ship cross-platform builds']);
  const items = await db.all<{ id: number; task: string; done: number }>('SELECT * FROM todos');
  console.log(items);

  await db.close();
}

main().catch((error) => {
  console.error('Database bootstrap failed', error);
  process.exit(1);
});
```

## Platform-Specific Examples

```typescript
import { createDatabase, IndexedDbAdapter } from '@framers/sql-storage-adapter';

// Web (Browser): Uses IndexedDB
const webDb = await createDatabase({ priority: ['indexeddb', 'sqljs'] });

// Desktop (Electron): Uses better-sqlite3
const desktopDb = await createDatabase({ priority: ['better-sqlite3', 'sqljs'] });

// Mobile (Capacitor): Uses native SQLite
const mobileDb = await createDatabase({ priority: ['capacitor', 'indexeddb'] });

// Cloud (Node): Uses PostgreSQL
const cloudDb = await createDatabase({ 
  postgres: { connectionString: process.env.DATABASE_URL }
});
```

See [Platform Strategy Guide](./PLATFORM_STRATEGY.md) for detailed pros/cons and architecture.

## Adapter Matrix

| Adapter | Package | Ideal for | Pros | Considerations |
| --- | --- | --- | --- | --- |
| **🆕 `indexeddb`** | bundled (sql.js) | **Browsers, PWAs** | sql.js + IndexedDB persistence wrapper, browser-native storage, 50MB-1GB+ quota, offline-first | IndexedDB quotas vary, WASM overhead (sql.js), not a separate SQL engine |
| `better-sqlite3` | `better-sqlite3` | Node/Electron, CLI, CI | Native performance, transactional semantics, WAL support | Needs native toolchain; version must match Node ABI |
| `postgres` | `pg` | Hosted or on-prem PostgreSQL | Connection pooling, rich SQL features, cloud friendly | Requires `DATABASE_URL`/credentials |
| `sqljs` | bundled | Browsers, serverless edge, native fallback | Pure WASM SQLite, no native deps, optional filesystem persistence | Write performance limited vs native, in-memory by default |
| `capacitor` | `@capacitor-community/sqlite` | Mobile (iOS/Android, Capacitor) | Native SQLite on mobile, encryption | Requires Capacitor runtime |
| `memory` | built-in | Unit tests, storybooks, constrained sandboxes | Zero dependencies, instant startup | Non-durable, single-process only |

### Platform Priorities

| Platform | Primary Adapter | Fallback | Use Case |
|----------|----------------|----------|----------|
| **Web (Browser)** | IndexedDB | sql.js | PWAs, offline-first web apps |
| **Electron (Desktop)** | better-sqlite3 | sql.js | Desktop apps, dev tools |
| **Capacitor (Mobile)** | capacitor | IndexedDB | iOS/Android native apps |
| **Node.js** | better-sqlite3 | Postgres, sql.js | CLI tools, local servers |
| **Cloud (Serverless)** | Postgres | better-sqlite3 | Multi-tenant SaaS, APIs |

## Configuration & Resolution

- `resolveStorageAdapter` inspects:
  - explicit options (`priority`, `type`, adapter configs),
  - environment variables (`STORAGE_ADAPTER`, `DATABASE_URL`),
  - runtime hints (Capacitor detection, browser globals, IndexedDB availability).
- Adapters are attempted in priority order until one opens successfully; a `StorageResolutionError` includes the full failure chain.
- Provide `priority: ['indexeddb', 'sqljs']` for browser bundles or tests where native modules shouldn't load.
- Use `createCloudBackupManager` for S3-compatible backups with gzip compression and retention limits.

### IndexedDB-Specific Config

```typescript
import { IndexedDbAdapter } from '@framers/sql-storage-adapter';

const adapter = new IndexedDbAdapter({
  dbName: 'my-app-db',       // IndexedDB database name
  storeName: 'sqliteDb',     // Object store name
  autoSave: true,            // Auto-save to IndexedDB after writes
  saveIntervalMs: 5000,      // Batch writes every 5s
});

await adapter.open();
```

**Key Features:**
- ✅ SQL execution via sql.js (WASM SQLite)
- ✅ **Automatic persistence** via IndexedDB (stores SQLite database file as blob)
- ✅ JSON support (SQLite JSON1 extension: json_extract, json_object, json_array, etc.)
- ✅ Prepared statements for performance and security
- ✅ Export/import (Uint8Array SQLite file format)
- ✅ Auto-save with batching (reduce IDB overhead)

**Why IndexedDB Adapter vs sql.js Adapter?**

| Feature | IndexedDB Adapter | sql.js Adapter |
|---------|------------------|----------------|
| **SQL Engine** | sql.js (WASM) | sql.js (WASM) |
| **Persistence** | ✅ **Automatic** (saves to IndexedDB after writes) | ⚠️ **Manual** (you must call `db.export()` and save yourself) |
| **Data survives refresh** | ✅ Yes | ❌ No (unless you manually saved) |
| **Use Case** | Production PWAs, offline-first apps | Edge functions, temporary data, prototyping |

**Is IndexedDB Adapter Necessary?**

**✅ YES, if you need:**
- Data to survive page refreshes (production apps)
- Offline-first functionality (PWAs)
- Privacy-first apps (data never leaves browser)
- Zero manual save logic (just works)

**❌ NO, if you:**
- Only need temporary/in-memory data (edge functions, Cloudflare Workers)
- Are prototyping and don't care about persistence
- Want to manually control when data is saved
- Don't need data to survive refreshes

**The Value:** IndexedDB adapter provides **automatic persistence** that sql.js doesn't have. With sql.js alone, your data is lost on page refresh unless you manually export and save it. IndexedDB adapter does this automatically, making it production-ready for persistent client-side storage.

**Alternative:** You could use sql.js directly and manually save to IndexedDB yourself, but you'd lose:
- Automatic batched saves (performance)
- Reliable persistence (easy to forget manual saves)
- Consistent API across platforms
- Production-ready defaults

**Bottom line:** IndexedDB adapter is **necessary for production web apps** that need persistence. For prototypes or edge functions, sql.js alone is fine.

**Note:** IndexedDB adapter is a wrapper around sql.js that adds IndexedDB persistence. It's not a separate SQL engine—it uses sql.js for all SQL operations and IndexedDB only for storing the database file. Since sql.js is full SQLite WASM, it supports all SQLite features including JSON functions, BLOBs, and full-text search.

## Platform Strategy

See [**PLATFORM_STRATEGY.md**](./PLATFORM_STRATEGY.md) for a comprehensive guide on:
- Graceful degradation patterns
- Platform-specific pros/cons
- Performance benchmarks
- Offline-first architectures
- Browser-friendly bundling (dynamic imports prevent server-only dependencies from being bundled)

**TL;DR:** Use IndexedDB for web, better-sqlite3 for desktop, capacitor for mobile, Postgres for cloud.

## CI, Releases, and Badges

- GitHub Actions workflows:
  - `ci.yml` runs lint, tests, and coverage on every branch.
  - `release.yml` publishes new versions to npm, tags the commit (`vX.Y.Z`), and creates/updates the GitHub Release when `CHANGELOG.md` and `package.json` bump the version.
- Check badge health whenever builds fail:
  - CI badge should be green for `master`.
  - Codecov badge updates after coverage reports upload.
  - npm badge reflects the latest published version.
- Manual verification commands:
  ```bash
  npm info @framers/sql-storage-adapter version
  pnpm --filter sql-storage-adapter test
  pnpm --filter sql-storage-adapter build
  ```
- See [RELEASING.md](./RELEASING.md) for the automated release flow, required secrets (`NPM_TOKEN`), and manual fallback steps.

 

## Contributing

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) for coding standards, lint/test commands, and pull request guidelines.
- Architecture notes live in [ARCHITECTURE.md](./ARCHITECTURE.md); API docs can be regenerated with `pnpm --filter sql-storage-adapter run docs`.

## License

[MIT](./LICENSE)

---

<p align="center">
  Built and maintained by <a href="https://frame.dev" target="_blank" rel="noopener"><strong>Frame.dev</strong></a>
</p>

## Links
- Website: https://frame.dev
- AgentOS: https://agentos.sh
- Marketplace: https://vca.chat
- GitHub: https://github.com/framersai/sql-storage-adapter
- npm: https://www.npmjs.com/package/@framers/sql-storage-adapter
## Contributing & Security
- Contributing: ./\.github/CONTRIBUTING.md
- Code of Conduct: ./\.github/CODE_OF_CONDUCT.md
- Security Policy: ./\.github/SECURITY.md
