<div align="center">

# AgentOS Workbench

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../logos/agentos-primary-no-tagline-dark-2x.png">
  <source media="(prefers-color-scheme: light)" srcset="../../logos/agentos-primary-no-tagline-light-2x.png">
  <img src="../../logos/agentos-primary-no-tagline-transparent-2x.png" alt="AgentOS" width="260">
</picture>

### An AgentOS product by <a href="https://frame.dev">Frame.dev</a>

</div>

React + Vite dashboard for inspecting AgentOS sessions locally. The goal is to give builders a zero-config cockpit that mirrors how Frame.dev debugs adaptive agents.

## GMIs, Agents, and Agency

- GMIs (Generalised Mind Instances) package persona prompts, memory policies, tool permissions, language preferences, and guardrail hooks into reusable minds.
- Agents wrap GMIs for product surfaces (labels, icons, availability) while preserving the GMI’s cognition and policy.
- Agencies coordinate multiple GMIs (and humans) via workflows; the workbench visualises `WORKFLOW_UPDATE` and `AGENCY_UPDATE` events in the timeline.

Benefits:
- Cohesive cognition: one unit to version, export, and reuse across apps
- Guardrail-first: policy decisions are streamed and auditable
- Portable: same GMI across cloud/desktop/mobile/browser (capability-aware)

## Highlights

- Sidebar session switcher backed by a lightweight zustand store
- Timeline inspector that renders streaming @framers/agentos chunks with color-coded context
- Request composer for prototyping turns or replaying transcripts (wire it to your backend when ready)
- Adaptive execution dashboard (task-outcome KPI, fail-open overrides, tool-exposure recovery state)
- Multi-tenant telemetry slices (scope + routing mode visibility for single-tenant and multi-tenant runs)
- Discovery telemetry visibility (default tool-selection mode + recall profile from runtime config/stream payload)
- Runtime inspector for the latest high-level and orchestration exports (`generateText`, `generateImage`, `AgentGraph`, `workflow()`, `mission()`)
- Dark, neon-drenched UI that matches the Frame.dev production command centre

## Current orchestration status

- The workbench can inspect whether the installed `@framers/agentos` package exports the new unified orchestration APIs.
- The main compose stream path now forwards `workflowRequest`, `agencyRequest`, and preferred model selection into AgentOS through `/api/agentos/stream`.
- The backend `/api/agentos/agency/stream` route now forwards real agency requests into AgentOS instead of emitting a timer-based fake stream.
- The demo `/api/agentos/agency/workflow/start` + `/stream` pair now boot a real AgentOS-backed run, but they still emit demo-shaped UI events rather than exposing raw graph/checkpoint data.
- The timeline can render legacy `WORKFLOW_UPDATE` and `AGENCY_UPDATE` chunks from the backend.
- The Planning panel now reflects runtime-backed workflow and agency snapshots through the workbench planning store, including checkpoint history for inspection.
- The plan inspector now supports restoring manual checkpoints and forking runtime-backed checkpoint snapshots into editable manual plans.
- The backend now persists graph-run records for streamed workflow and agency executions, and the Planning panel includes a Runtime Runs browser plus recent runtime event traces for selected runtime-backed plans.
- Runtime-run checkpoints can now be restored directly inside the persisted graph-run record and forked into new editable manual plans, even when there is no mirrored runtime plan row yet.
- The workbench still lacks graph-native authoring and true GraphRuntime pause/resume controls.

## Scripts

```bash
pnpm dev       # launch Vite dev server on http://localhost:5175
pnpm build     # production build (emits dist/)
pnpm bundle:report  # summarize dist/assets into output/bundle-report.{json,md}
pnpm bundle:baseline  # refresh bundle-baseline.json from the current report
pnpm bundle:check   # fail if the current bundle exceeds the workbench budgets
pnpm bundle:compare # fail if the current bundle regresses too far from bundle-baseline.json
pnpm build:check    # build, generate the bundle report, then enforce budgets
pnpm build:report   # build, then generate the bundle report
pnpm preview   # preview the built app
pnpm lint      # eslint
pnpm typecheck
pnpm e2e       # all Playwright suites (including smoke + screenshots)
pnpm e2e:chromium
pnpm e2e:firefox
pnpm e2e:workbench      # split workbench suites only
pnpm e2e:workbench:cross-browser  # chromium + firefox + serial webkit
pnpm e2e:workbench:chromium
pnpm e2e:workbench:firefox
pnpm e2e:workbench:webkit         # serialized for WebKit stability
pnpm e2e:core           # tabs/composer/personas/agency/header
pnpm e2e:eval-planning  # evaluation + planning flows
pnpm e2e:quality        # responsive/a11y/console scans
pnpm e2e:screenshots    # screenshot matrix
pnpm e2e:webkit         # full suite on WebKit, serialized
pnpm e2e:smoke:pw       # smoke.spec.ts via Playwright
pnpm e2e:smoke          # legacy smoke script (tsx e2e-test.ts)
```

The workbench WebKit run is currently serialized on purpose. The browser passes cleanly with one worker, but startup/navigation becomes flaky under the default parallelism used by Chromium and Firefox.

The CI workflow now uploads the generated bundle report as an artifact from the `Typecheck + Build + Tests` job, and it enforces both explicit bundle budgets and checked-in baseline deltas before the browser matrix starts. The current defaults cap total raw size, total gzip size, largest JS asset, entry JS, and largest CSS asset, and they also limit how far those metrics can drift above [`bundle-baseline.json`](./bundle-baseline.json). Both sets of thresholds can be overridden with `WORKBENCH_BUNDLE_MAX_*` and `WORKBENCH_BUNDLE_BASELINE_MAX_*` environment variables when needed.

For local fixture testing or ad hoc bundle analysis, the bundle scripts also support path overrides:
- `WORKBENCH_BUNDLE_DIST_ASSETS_DIR` redirects `bundle:report` input away from the default `dist/assets`.
- `WORKBENCH_BUNDLE_OUTPUT_DIR` redirects the generated `bundle-report.{json,md}` files and the `bundle:baseline:update` review artifacts.
- `WORKBENCH_BUNDLE_REPORT_PATH` tells `bundle:baseline`, `bundle:check`, `bundle:compare`, and `bundle:baseline:update` which report JSON to read.
- `WORKBENCH_BUNDLE_BASELINE_PATH` tells `bundle:baseline`, `bundle:compare`, and `bundle:baseline:update` which baseline JSON to write/read.

If a deliberate size increase is accepted, run the `Refresh AgentOS Workbench Bundle Baseline` workflow from GitHub Actions. It rebuilds the workbench, regenerates [`bundle-baseline.json`](./bundle-baseline.json), and uploads the refreshed baseline plus a patch, branch-name hint, PR body, apply script, summary, and suggested commit message as artifacts so the new snapshot can be reviewed and committed intentionally. The generated apply script now refuses to run unless the target repo is clean, the branch name is unused, and the patch still applies cleanly, and it accepts either the monorepo root or the nested `apps/agentos-workbench` repo root.

## Workbench data modes

- The workbench now exposes whether a surface is `runtime`, `demo`, or `mixed` instead of implying every panel is live.
- The RAG workspace specifically can combine live retrieval with demo-backed document-library fallbacks.
- The RAG upload flow also lets you choose a collection up front, and that choice now determines whether the ingest lands in the live runtime store or the demo library.
- See [`RAG_RUNTIME_MODES.md`](./RAG_RUNTIME_MODES.md) for the current ingestion/search matrix and runtime setup requirements.

## Storage, export, and import

- Data is stored locally in your browser using IndexedDB (no server writes).
- Stored: personas (remote + local), agencies, and sessions (timeline events).
- Export per-session from the timeline header: "Export session", "Export agency", "Export workflow".
- Export everything from Settings → Data → "Export all" (also available in the timeline).
- Import from Settings → Data → "Import…" (schema: `agentos-workbench-export-v1`).
- Clear local data from Settings → Data → "Clear storage" (export first if needed).

See [`docs/CLIENT_STORAGE_AND_EXPORTS.md`](../../docs/CLIENT_STORAGE_AND_EXPORTS.md) for details.

## Wiring it up

1. Copy `.env.example` → `.env.local` (or set env vars in your shell) and point the workbench at your backend:

   ```ini
   # Option A: explicit API base URL
   VITE_API_URL=http://localhost:3001

   # Option B: same-origin `/api/*` with dev proxy target
   VITE_BACKEND_PORT=3001
   VITE_BACKEND_HOST=localhost
   VITE_BACKEND_PROTOCOL=http
   ```

   `VITE_AGENTOS_*` overrides are still supported for specialized stream/persona/workflow path tuning.
2. In the backend, ensure provider keys are set and configure runtime if needed:

   ```ini
   AGENTOS_WORKBENCH_BACKEND_PORT=3001
   AGENTOS_WORKBENCH_BACKEND_HOST=0.0.0.0
   AGENTOS_WORKBENCH_EVALUATION_STORE_PATH=../.data/evaluation-store.json
   AGENTOS_WORKBENCH_PLANNING_STORE_PATH=../.data/planning-store.json
   ```

3. Start the backend (`pnpm --filter backend dev`) and then run the workbench (`pnpm --filter @framersai/agentos-workbench dev`).
4. Use Compose for turns, Evaluation for benchmark runs, and Planning for plan lifecycle experiments.

The client mirrors the streaming contracts from `@framers/agentos`, so backend responses flow straight into the UI with no reshaping.

### Onboarding

- A first-run guided tour highlights tabs and controls. You can "Remind me later" or "Don't show again" (saved locally).

## AgentOS HTTP endpoints (quick list)

- `POST /api/agentos/chat` — send a turn (messages, mode, optional workflow)
- `GET  /api/agentos/stream` — SSE stream for incremental updates
- `GET  /api/agentos/personas` — list personas (filters: capability, tier, search)
- `GET  /api/agentos/workflows/definitions` — list workflow definitions
- `POST /api/agentos/agency/workflow/start` — start the legacy agency workflow demo route
- `GET  /api/agentos/graph-runs` — list persisted runtime graph-run records mirrored from live workflow/agency streams
- `GET  /api/agentos/graph-runs/:runId` — inspect a single persisted runtime graph-run record
- `GET  /api/evaluation/runs` — list persisted evaluation runs
- `POST /api/evaluation/run` — start a new evaluation run
- `GET  /api/planning/plans` — list persisted plans
- `POST /api/planning/plans` — create a new plan

See `backend/docs/index.html` for the generated backend route docs.

## Licensing

- AgentOS core (`@framers/agentos`) — Apache 2.0
- Marketplace and site components — MIT (vca.chat is the public marketplace we operate)

## Links

- Website: https://agentos.sh
- Frame: https://frame.dev
- Marketplace: https://vca.chat
- GitHub: https://github.com/framersai/agentos
- NPM: https://www.npmjs.com/package/@framers/agentos, https://www.npmjs.com/package/@framers/sql-storage-adapter

---

<p align="center">
  <a href="https://frame.dev">
    <img src="../../logos/frame-logo-green-transparent-4x.png" alt="Frame.dev" height="40" />
  </a>
  <br />
  <sub>AgentOS product by <a href="https://frame.dev">Frame.dev</a></sub>
</p>
