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
- Dark, neon-drenched UI that matches the Frame.dev production command centre

## Scripts

```bash
pnpm dev       # launch Vite dev server on http://localhost:5175
pnpm build     # production build (emits dist/)
pnpm preview   # preview the built app
pnpm lint      # eslint
pnpm typecheck
```

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
- `POST /api/agentos/workflows/start` — start a workflow
- `GET  /api/evaluation/runs` — list persisted evaluation runs
- `POST /api/evaluation/run` — start a new evaluation run
- `GET  /api/planning/plans` — list persisted plans
- `POST /api/planning/plans` — create a new plan

See `docs/BACKEND_API.md` for complete request/response shapes and examples.

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
