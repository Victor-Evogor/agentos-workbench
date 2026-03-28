import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type GraphRunStatus = 'draft' | 'running' | 'completed' | 'failed';

export interface GraphRunTaskRecord {
  taskId: string;
  description: string;
  status: string;
  assignedRoleId?: string;
  assignedExecutorId?: string;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface GraphRunEventRecord {
  eventId: string;
  timestamp: string;
  type: string;
  summary: string;
  payload?: Record<string, unknown>;
}

export interface GraphRunCheckpointRecord {
  checkpointId: string;
  timestamp: string;
  status: GraphRunStatus;
  completedTaskCount: number;
  totalTaskCount: number;
  tasks: GraphRunTaskRecord[];
}

export interface GraphRunRecord {
  runId: string;
  source: 'compose' | 'agency' | 'workflow';
  goal: string;
  workflowId?: string;
  conversationId?: string;
  status: GraphRunStatus;
  createdAt: string;
  updatedAt: string;
  tasks: GraphRunTaskRecord[];
  checkpoints: GraphRunCheckpointRecord[];
  events: GraphRunEventRecord[];
}

export interface BeginGraphRunInput {
  runId: string;
  source: GraphRunRecord['source'];
  goal: string;
  workflowId?: string;
  conversationId?: string;
}

export interface SyncGraphWorkflowInput {
  runId: string;
  source: GraphRunRecord['source'];
  goal: string;
  workflowId?: string;
  conversationId?: string;
  workflow: {
    status?: string;
    tasks?: Record<string, {
      status?: string;
      assignedRoleId?: string;
      assignedExecutorId?: string;
      output?: unknown;
      error?: { message?: string };
      metadata?: Record<string, unknown>;
    }>;
  };
}

type PersistedGraphRunState = {
  version: number;
  runs: GraphRunRecord[];
};

const STORE_VERSION = 1;
const MAX_EVENTS_PER_RUN = 200;
const MAX_CHECKPOINTS_PER_RUN = 50;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveStorePath(): string {
  const configuredPath = process.env.AGENTOS_WORKBENCH_GRAPH_RUN_STORE_PATH?.trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  return path.resolve(__dirname, '../../../.data/graph-run-store.json');
}

function normalizeStatus(status: unknown): GraphRunStatus {
  const normalized = typeof status === 'string' ? status.toLowerCase() : 'running';
  if (normalized === 'completed' || normalized === 'complete') {
    return 'completed';
  }
  if (normalized === 'failed' || normalized === 'error' || normalized === 'errored') {
    return 'failed';
  }
  if (normalized === 'draft') {
    return 'draft';
  }
  return 'running';
}

function isGraphRunRecord(value: unknown): value is GraphRunRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as GraphRunRecord;
  return (
    typeof candidate.runId === 'string' &&
    typeof candidate.goal === 'string' &&
    typeof candidate.status === 'string' &&
    Array.isArray(candidate.tasks) &&
    Array.isArray(candidate.events) &&
    Array.isArray(candidate.checkpoints)
  );
}

function mapWorkflowTasks(
  tasks: SyncGraphWorkflowInput['workflow']['tasks']
): GraphRunTaskRecord[] {
  return Object.entries(tasks ?? {}).map(([taskId, taskSnapshot]) => ({
    taskId,
    description:
      typeof taskSnapshot.metadata?.displayName === 'string'
        ? taskSnapshot.metadata.displayName
        : taskId,
    status: typeof taskSnapshot.status === 'string' ? taskSnapshot.status : 'pending',
    assignedRoleId: taskSnapshot.assignedRoleId,
    assignedExecutorId: taskSnapshot.assignedExecutorId,
    output: taskSnapshot.output,
    error: taskSnapshot.error?.message,
    metadata: taskSnapshot.metadata,
  }));
}

export class GraphRunStore {
  private readonly storePath: string;
  private runs: GraphRunRecord[];

  constructor(storePath = resolveStorePath()) {
    this.storePath = storePath;
    this.runs = this.loadState();
  }

  listRuns(): GraphRunRecord[] {
    return deepClone(this.runs);
  }

  getRun(runId: string): GraphRunRecord | null {
    const run = this.findRun(runId);
    return run ? deepClone(run) : null;
  }

  getCheckpoint(runId: string, checkpointId: string): GraphRunCheckpointRecord | null {
    const run = this.findRun(runId);
    if (!run) {
      return null;
    }
    const checkpoint = this.findCheckpoint(run, checkpointId);
    return checkpoint ? deepClone(checkpoint) : null;
  }

  beginRun(input: BeginGraphRunInput): GraphRunRecord {
    const existing = this.findRun(input.runId);
    if (existing) {
      return deepClone(existing);
    }
    const nowIso = new Date().toISOString();
    const run: GraphRunRecord = {
      runId: input.runId,
      source: input.source,
      goal: input.goal,
      workflowId: input.workflowId,
      conversationId: input.conversationId,
      status: 'running',
      createdAt: nowIso,
      updatedAt: nowIso,
      tasks: [],
      checkpoints: [],
      events: [],
    };
    this.runs.unshift(run);
    this.recordEvent(run, 'run_started', 'Run started', {
      source: run.source,
      workflowId: run.workflowId,
      conversationId: run.conversationId,
    });
    this.persistState();
    return deepClone(run);
  }

  syncWorkflowSnapshot(input: SyncGraphWorkflowInput): GraphRunRecord {
    const nowIso = new Date().toISOString();
    const tasks = mapWorkflowTasks(input.workflow.tasks);
    const nextStatus = normalizeStatus(input.workflow.status);
    const existing = this.findRun(input.runId);

    if (existing) {
      const previousSignature = JSON.stringify({
        status: existing.status,
        tasks: existing.tasks.map((task) => ({
          taskId: task.taskId,
          status: task.status,
          output: task.output ?? null,
          error: task.error ?? null,
        })),
      });
      existing.goal = input.goal;
      existing.workflowId = input.workflowId;
      existing.conversationId = input.conversationId;
      existing.source = input.source;
      existing.status = nextStatus;
      existing.tasks = deepClone(tasks);
      existing.updatedAt = nowIso;
      const nextSignature = JSON.stringify({
        status: existing.status,
        tasks: existing.tasks.map((task) => ({
          taskId: task.taskId,
          status: task.status,
          output: task.output ?? null,
          error: task.error ?? null,
        })),
      });
      if (previousSignature !== nextSignature) {
        this.recordCheckpoint(existing);
      }
      this.persistState();
      return deepClone(existing);
    }

    const run = this.beginRun({
      runId: input.runId,
      source: input.source,
      goal: input.goal,
      workflowId: input.workflowId,
      conversationId: input.conversationId,
    });
    const liveRun = this.findRun(run.runId)!;
    liveRun.status = nextStatus;
    liveRun.tasks = deepClone(tasks);
    liveRun.updatedAt = nowIso;
    this.recordCheckpoint(liveRun);
    this.persistState();
    return deepClone(liveRun);
  }

  appendEvent(
    runId: string,
    event: Omit<GraphRunEventRecord, 'eventId' | 'timestamp'>
  ): GraphRunRecord | null {
    const run = this.findRun(runId);
    if (!run) {
      return null;
    }
    this.recordEvent(run, event.type, event.summary, event.payload);
    this.persistState();
    return deepClone(run);
  }

  completeRun(runId: string): GraphRunRecord | null {
    return this.finishRun(runId, 'completed', 'Run completed');
  }

  failRun(runId: string, message: string): GraphRunRecord | null {
    return this.finishRun(runId, 'failed', message);
  }

  restoreCheckpoint(runId: string, checkpointId: string): GraphRunRecord | null {
    const run = this.findRun(runId);
    if (!run) {
      return null;
    }
    const checkpoint = this.findCheckpoint(run, checkpointId);
    if (!checkpoint) {
      return null;
    }

    run.status = checkpoint.status;
    run.tasks = deepClone(checkpoint.tasks);
    run.updatedAt = new Date().toISOString();
    this.recordEvent(run, 'checkpoint_restored', `Restored checkpoint ${checkpointId}`, {
      checkpointId,
      status: checkpoint.status,
    });
    this.recordCheckpoint(run);
    this.persistState();
    return deepClone(run);
  }

  private finishRun(runId: string, status: GraphRunStatus, summary: string): GraphRunRecord | null {
    const run = this.findRun(runId);
    if (!run) {
      return null;
    }
    run.status = status;
    run.updatedAt = new Date().toISOString();
    this.recordEvent(run, status === 'completed' ? 'run_completed' : 'run_failed', summary);
    this.recordCheckpoint(run);
    this.persistState();
    return deepClone(run);
  }

  private findRun(runId: string): GraphRunRecord | undefined {
    return this.runs.find((run) => run.runId === runId);
  }

  private findCheckpoint(
    run: GraphRunRecord,
    checkpointId: string
  ): GraphRunCheckpointRecord | undefined {
    return run.checkpoints.find((checkpoint) => checkpoint.checkpointId === checkpointId);
  }

  private recordCheckpoint(run: GraphRunRecord): void {
    const completedTaskCount = run.tasks.filter((task) => {
      const normalized = task.status.toLowerCase();
      return normalized === 'completed' || normalized === 'complete';
    }).length;
    const checkpoint: GraphRunCheckpointRecord = {
      checkpointId: `${run.runId}-cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      status: run.status,
      completedTaskCount,
      totalTaskCount: run.tasks.length,
      tasks: deepClone(run.tasks),
    };
    run.checkpoints = [checkpoint, ...run.checkpoints].slice(0, MAX_CHECKPOINTS_PER_RUN);
  }

  private recordEvent(
    run: GraphRunRecord,
    type: string,
    summary: string,
    payload?: Record<string, unknown>
  ): void {
    const event: GraphRunEventRecord = {
      eventId: `${run.runId}-evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      type,
      summary,
      payload,
    };
    run.events = [event, ...run.events].slice(0, MAX_EVENTS_PER_RUN);
    run.updatedAt = event.timestamp;
  }

  private loadState(): GraphRunRecord[] {
    try {
      if (!existsSync(this.storePath)) {
        return [];
      }
      const raw = readFileSync(this.storePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedGraphRunState;
      if (!parsed || parsed.version !== STORE_VERSION || !Array.isArray(parsed.runs)) {
        return [];
      }
      return deepClone(parsed.runs.filter((run) => isGraphRunRecord(run)));
    } catch (error) {
      console.warn('[GraphRunStore] Failed to load persisted state:', error);
      return [];
    }
  }

  private persistState(): void {
    const payload: PersistedGraphRunState = {
      version: STORE_VERSION,
      runs: this.runs,
    };
    const directory = path.dirname(this.storePath);
    mkdirSync(directory, { recursive: true });
    const tempPath = `${this.storePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf-8');
    renameSync(tempPath, this.storePath);
  }
}

export const graphRunStore = new GraphRunStore();
