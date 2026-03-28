import type { RuntimeStatusResponse } from '@/lib/agentosClient';

export type WorkbenchDataMode = 'runtime' | 'mixed' | 'demo' | 'local';

export interface WorkbenchSurfaceStatus {
  label: string;
  mode: WorkbenchDataMode;
  description: string;
}

export interface WorkbenchWorkspaceStatus {
  label: string;
  tone: WorkbenchDataMode | 'neutral';
  detail: string;
  counts: Record<WorkbenchDataMode, number>;
}

export const DATA_MODE_LABELS: Record<WorkbenchDataMode, string> = {
  runtime: 'Runtime-backed',
  mixed: 'Mixed',
  demo: 'Demo-backed',
  local: 'Local-only',
};

const FALLBACK_SURFACE_STATUS: WorkbenchSurfaceStatus = {
  label: 'Workbench surface',
  mode: 'mixed',
  description: 'This surface blends local UI state with backend capabilities.',
};

export const WORKBENCH_SURFACE_STATUS_BY_KEY: Record<string, WorkbenchSurfaceStatus> = {
  home: {
    label: 'Home dashboard',
    mode: 'mixed',
    description:
      'Combines live session/runtime signals with demo spend trend visuals and setup shortcuts.',
  },
  playground: {
    label: 'Agent playground',
    mode: 'mixed',
    description:
      'Runs through the backend when available, but still depends on local workbench session state.',
  },
  'prompt-workspace': {
    label: 'Prompt workspace',
    mode: 'local',
    description:
      'Prompt drafting, compare, and editing are local workspace flows rather than runtime state.',
  },
  compose: {
    label: 'Compose',
    mode: 'runtime',
    description:
      'Primary compose and streaming chat flows are backed by the connected AgentOS runtime.',
  },
  personas: {
    label: 'Personas',
    mode: 'runtime',
    description:
      'Persona catalog and remote persona loading come from the backend runtime and registry data.',
  },
  agency: {
    label: 'Agency',
    mode: 'mixed',
    description:
      'Agency execution is runtime-backed, but authoring and local session state still live in the workbench.',
  },
  workflows: {
    label: 'Workflows',
    mode: 'mixed',
    description:
      'Workflow definitions and snapshots are partially runtime-backed, but visual authoring is not graph-native yet.',
  },
  evaluation: {
    label: 'Evaluation',
    mode: 'mixed',
    description:
      'Evaluation UX is present, but deeper benchmarking and judge-driven flows are not fully wired end to end.',
  },
  planning: {
    label: 'Planning',
    mode: 'runtime',
    description:
      'Planning snapshots, runtime runs, and checkpoint inspection are backed by stored runtime records.',
  },
  memory: {
    label: 'Memory',
    mode: 'mixed',
    description:
      'Memory inspection uses live backend data where available, but the workbench still presents it through local views.',
  },
  voice: {
    label: 'Voice pipeline',
    mode: 'mixed',
    description:
      'Provider setup is live, but active sessions and deeper telephony flows are only partially connected.',
  },
  strategy: {
    label: 'Strategy',
    mode: 'local',
    description: 'Strategy planning is a local workbench authoring surface.',
  },
  resources: {
    label: 'Resources',
    mode: 'local',
    description:
      'Resource controls are configuration-oriented UI rather than a runtime-backed operational console.',
  },
  schema: {
    label: 'Schema builder',
    mode: 'local',
    description: 'Structured output authoring is a local design workspace.',
  },
  rag: {
    label: 'RAG workspace',
    mode: 'mixed',
    description:
      'This workspace now combines local RAG configuration, runtime-backed retrieval query and ingestion, and a mixed document library that still retains some demo-backed fallbacks.',
  },
  hitl: {
    label: 'HITL queue',
    mode: 'runtime',
    description:
      'Approval queue polling and decision actions are backed by live backend endpoints.',
  },
  capabilities: {
    label: 'Capability browser',
    mode: 'mixed',
    description:
      'Searches a lightweight workbench catalog, not the full semantic discovery engine described in the core docs.',
  },
  marketplace: {
    label: 'Marketplace',
    mode: 'demo',
    description:
      'Marketplace browsing and install flows are currently backed by mock catalog and install responses.',
  },
  'graph-builder': {
    label: 'Graph builder',
    mode: 'mixed',
    description:
      'Graph authoring still uses the workflow bridge and local checkpoints, but persisted runtime runs and runtime checkpoint controls are now exposed.',
  },
  'tool-forge': {
    label: 'Tool forge',
    mode: 'demo',
    description:
      'Tool generation and judge verdicts are currently synthetic stub flows rather than live forged-tool review.',
  },
  channels: {
    label: 'Channels',
    mode: 'mixed',
    description:
      'Channel connections and broadcast state are still demo-backed, but the webhook tester performs real outbound requests through the backend.',
  },
  social: {
    label: 'Social',
    mode: 'demo',
    description: 'Publishing and scheduling currently operate on an in-memory workbench store.',
  },
  'call-monitor': {
    label: 'Call monitor',
    mode: 'mixed',
    description:
      'Provider availability is live, but historical calls and transcripts are still demo-backed.',
  },
  'guardrail-eval': {
    label: 'Guardrail eval',
    mode: 'mixed',
    description:
      'Guardrail configuration is exposed, but evaluation depth and persistence are still partial.',
  },
  observability: {
    label: 'Observability',
    mode: 'demo',
    description:
      'Metrics, errors, and spans are synthetic workbench data rather than a real telemetry backend.',
  },
};

function countSurfaceModes(): Record<WorkbenchDataMode, number> {
  return Object.values(WORKBENCH_SURFACE_STATUS_BY_KEY).reduce<Record<WorkbenchDataMode, number>>(
    (acc, surface) => {
      acc[surface.mode] += 1;
      return acc;
    },
    {
      runtime: 0,
      mixed: 0,
      demo: 0,
      local: 0,
    }
  );
}

export function getWorkbenchSurfaceStatus(key: string): WorkbenchSurfaceStatus {
  return WORKBENCH_SURFACE_STATUS_BY_KEY[key] ?? FALLBACK_SURFACE_STATUS;
}

export function getWorkbenchWorkspaceStatus(
  runtimeStatus: RuntimeStatusResponse | null | undefined
): WorkbenchWorkspaceStatus {
  const counts = countSurfaceModes();

  if (typeof runtimeStatus === 'undefined') {
    return {
      label: 'Checking',
      tone: 'neutral',
      detail: 'Loading runtime status from the backend.',
      counts,
    };
  }

  if (runtimeStatus === null) {
    return {
      label: 'Unavailable',
      tone: 'demo',
      detail:
        'The workbench could not load runtime status from the backend, so panel health should be treated as unknown.',
      counts,
    };
  }

  if (!runtimeStatus.runtime.connected) {
    return {
      label: 'Standalone',
      tone: 'demo',
      detail:
        'The workbench backend is not fully connected to an AgentOS runtime, so runtime-backed screens can fall back to local or sample data.',
      counts,
    };
  }

  if (counts.demo > 0 || counts.mixed > 0) {
    return {
      label: 'Mixed',
      tone: 'mixed',
      detail:
        'The AgentOS runtime is connected, but several workbench surfaces are still partial, demo-backed, or locally simulated.',
      counts,
    };
  }

  if (counts.local > 0) {
    return {
      label: 'Runtime + Local',
      tone: 'local',
      detail:
        'The AgentOS runtime is connected; some workbench surfaces are intentionally local configuration workspaces.',
      counts,
    };
  }

  return {
    label: 'Live',
    tone: 'runtime',
    detail: 'Audited workbench surfaces are runtime-backed end to end.',
    counts,
  };
}
