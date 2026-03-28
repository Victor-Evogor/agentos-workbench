/**
 * @file PlanningDashboard.tsx
 * @description Dashboard for visualizing and managing execution plans.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Clock,
  Target,
  Zap,
  GitBranch,
  Activity,
  RefreshCw,
  SkipForward,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Progress } from './ui/Progress';
import { HelpTooltip } from './ui/HelpTooltip';
import { agentosClient, type GraphRunRecord } from '../lib/agentosClient';

const DEFAULT_PLANNING_API_ENDPOINT = (() => {
  const configuredBaseUrl = import.meta.env.VITE_API_URL?.trim();
  if (!configuredBaseUrl) {
    return '/api/planning';
  }
  return `${configuredBaseUrl.replace(/\/+$/, '')}/api/planning`;
})();

interface PlanStep {
  stepId: string;
  description: string;
  actionType: 'tool_call' | 'gmi_action' | 'human_input' | 'sub_plan' | 'reflection' | 'communication';
  toolId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  dependsOn?: string[];
  estimatedTokens?: number;
  confidence?: number;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

interface PlanCheckpoint {
  checkpointId: string;
  timestamp: string;
  reason: string;
  status: 'draft' | 'executing' | 'paused' | 'completed' | 'failed';
  currentStepIndex: number;
  steps: PlanStep[];
}

interface ExecutionPlan {
  planId: string;
  goal: string;
  steps: PlanStep[];
  estimatedTokens?: number;
  confidenceScore?: number;
  createdAt: string;
  updatedAt?: string;
  status: 'draft' | 'executing' | 'paused' | 'completed' | 'failed';
  currentStepIndex: number;
  source?: 'manual' | 'runtime';
  readOnly?: boolean;
  conversationId?: string;
  workflowId?: string;
  checkpoints?: PlanCheckpoint[];
}

type PlanFilter = 'all' | 'executing' | 'paused' | 'completed' | 'failed';
type PlanAction = 'pause' | 'resume' | 'advance' | 'rerun';
type CheckpointAction = 'restore' | 'fork';

interface PlanningDashboardProps {
  apiEndpoint?: string;
}

function formatStatus(status: ExecutionPlan['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
}

function formatFilterLabel(filter: PlanFilter): string {
  if (filter === 'all') {
    return 'All';
  }
  return formatStatus(filter);
}

function formatCheckpointReason(reason: string): string {
  return reason
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDateTime(value?: string): string {
  if (!value) {
    return 'Unknown';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function normalizeRuntimeStatus(status: GraphRunRecord['status']): ExecutionPlan['status'] {
  return status === 'running' ? 'executing' : status;
}

function toPlanStepStatus(status: string): PlanStep['status'] {
  const normalized = status.toLowerCase();
  if (normalized === 'running') return 'in_progress';
  if (normalized === 'complete') return 'completed';
  if (normalized === 'error' || normalized === 'errored') return 'failed';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'skipped';
  if (
    normalized === 'pending' ||
    normalized === 'in_progress' ||
    normalized === 'completed' ||
    normalized === 'failed' ||
    normalized === 'skipped'
  ) {
    return normalized;
  }
  return 'pending';
}

function formatOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function getActionIcon(actionType: PlanStep['actionType']) {
  switch (actionType) {
    case 'tool_call':
      return <Zap className="w-4 h-4" />;
    case 'gmi_action':
      return <Activity className="w-4 h-4" />;
    case 'human_input':
      return <Target className="w-4 h-4" />;
    case 'sub_plan':
      return <GitBranch className="w-4 h-4" />;
    case 'reflection':
      return <RotateCcw className="w-4 h-4" />;
    case 'communication':
      return <Activity className="w-4 h-4" />;
    default:
      return <Circle className="w-4 h-4" />;
  }
}

function getStepStatusIcon(status: PlanStep['status']) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'in_progress':
      return <Clock className="w-4 h-4 text-blue-500 animate-pulse" />;
    case 'failed':
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    case 'skipped':
      return <Circle className="w-4 h-4 text-gray-400" />;
    default:
      return <Circle className="w-4 h-4 text-gray-300" />;
  }
}

function getPlanStatusVariant(status: ExecutionPlan['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'executing':
      return 'default';
    case 'completed':
      return 'secondary';
    case 'failed':
      return 'destructive';
    default:
      return 'outline';
  }
}

function PlanStepItem({ step, index }: { step: PlanStep; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border rounded-lg p-3 transition-colors ${
        step.status === 'in_progress' ? 'border-blue-500 bg-blue-500/5' : 'border-[var(--color-border)]'
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="p-1 hover:bg-[var(--color-bg-secondary)] rounded"
          aria-label={expanded ? 'Collapse step details' : 'Expand step details'}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <span className="text-sm text-[var(--color-text-muted)] w-6">{index + 1}</span>
        {getStepStatusIcon(step.status)}
        <div className="flex items-center gap-2">
          {getActionIcon(step.actionType)}
          <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
            {step.actionType.replace('_', ' ')}
          </span>
        </div>
        <span className="flex-1 text-sm">{step.description}</span>
        {typeof step.confidence === 'number' && (
          <span className="text-xs text-[var(--color-text-muted)]">{Math.round(step.confidence * 100)}% conf</span>
        )}
        {typeof step.durationMs === 'number' && (
          <span className="text-xs text-[var(--color-text-muted)]">{(step.durationMs / 1000).toFixed(1)}s</span>
        )}
      </div>
      {expanded && (
        <div className="mt-3 pl-12 space-y-2 text-sm">
          {step.toolId && (
            <div className="flex gap-2">
              <span className="text-[var(--color-text-muted)]">Tool:</span>
              <code className="px-1 bg-[var(--color-bg-secondary)] rounded">{step.toolId}</code>
            </div>
          )}
          {step.dependsOn && step.dependsOn.length > 0 && (
            <div className="flex gap-2">
              <span className="text-[var(--color-text-muted)]">Depends on:</span>
              <span>{step.dependsOn.join(', ')}</span>
            </div>
          )}
          {step.error && <div className="text-red-500 p-2 bg-red-500/10 rounded">{step.error}</div>}
          {step.output !== undefined && step.output !== null && (
            <div className="p-2 bg-[var(--color-bg-secondary)] rounded">
              <pre className="text-xs overflow-auto max-h-32">{formatOutput(step.output)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  isBusy,
  isSelected,
  onPause,
  onResume,
  onAdvance,
  onRerun,
  onInspect,
}: {
  plan: ExecutionPlan;
  isBusy: boolean;
  isSelected: boolean;
  onPause: (planId: string) => void;
  onResume: (planId: string) => void;
  onAdvance: (planId: string) => void;
  onRerun: (planId: string) => void;
  onInspect: (planId: string) => void;
}) {
  const completedSteps = plan.steps.filter((step) => step.status === 'completed').length;
  const progress = plan.steps.length > 0 ? (completedSteps / plan.steps.length) * 100 : 0;
  const isRuntimePlan = plan.source === 'runtime' || plan.readOnly;

  return (
    <Card
      className={`p-4 transition-colors ${
        isSelected ? 'border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]' : ''
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg">{plan.goal}</h3>
            <Badge variant={getPlanStatusVariant(plan.status)}>{formatStatus(plan.status)}</Badge>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Plan ID: {plan.planId} • Created {formatDateTime(plan.createdAt)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline">{plan.source === 'runtime' ? 'Runtime-backed' : 'Manual plan'}</Badge>
            {plan.workflowId ? <Badge variant="outline">Workflow {plan.workflowId}</Badge> : null}
            {plan.conversationId ? <Badge variant="outline">Conversation {plan.conversationId}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={isSelected ? 'default' : 'outline'} size="sm" onClick={() => onInspect(plan.planId)}>
            Inspect
          </Button>
          {plan.status === 'executing' && !isRuntimePlan && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                title="Pause this manual plan at its current step without discarding progress."
                onClick={() => onPause(plan.planId)}
              >
                <Pause className="w-4 h-4 mr-1" /> Pause
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                title="Mark the current manual step complete and move the plan to the next pending step."
                onClick={() => onAdvance(plan.planId)}
              >
                <SkipForward className="w-4 h-4 mr-1" /> Advance
              </Button>
            </>
          )}
          {plan.status === 'paused' && !isRuntimePlan && (
            <Button
              variant="outline"
              size="sm"
              disabled={isBusy}
              title="Resume this manual plan from its current checkpoint."
              onClick={() => onResume(plan.planId)}
            >
              <Play className="w-4 h-4 mr-1" /> Resume
            </Button>
          )}
          {(plan.status === 'failed' || plan.status === 'completed' || plan.status === 'paused') && !isRuntimePlan && (
            <Button
              variant="outline"
              size="sm"
              disabled={isBusy}
              title="Create a new editable manual plan using this plan as the template."
              onClick={() => onRerun(plan.planId)}
            >
              <RotateCcw className="w-4 h-4 mr-1" /> Re-run
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>
            Progress: {completedSteps}/{plan.steps.length} steps
          </span>
          <span>{typeof plan.confidenceScore === 'number' ? `${Math.round(plan.confidenceScore * 100)}% confidence` : ''}</span>
        </div>
        <Progress value={progress} className="h-2" />
        {isRuntimePlan && (
          <p className="text-xs text-[var(--color-text-muted)]">
            Synced from live workflow/agency execution. Control actions stay disabled because the workbench is reflecting runtime state rather than driving it directly.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="font-medium text-sm text-[var(--color-text-muted)]">Execution Steps</h4>
        {plan.steps.map((step, index) => (
          <PlanStepItem key={step.stepId} step={step} index={index} />
        ))}
      </div>
    </Card>
  );
}

function PlanInspector({
  plan,
  busy,
  graphRun,
  onRestoreCheckpoint,
  onForkCheckpoint,
  onRestoreGraphRunCheckpoint,
  onForkGraphRunCheckpoint,
}: {
  plan: ExecutionPlan | null;
  busy: boolean;
  graphRun: GraphRunRecord | null;
  onRestoreCheckpoint: (planId: string, checkpointId: string) => void;
  onForkCheckpoint: (planId: string, checkpointId: string) => void;
  onRestoreGraphRunCheckpoint: (runId: string, checkpointId: string) => void;
  onForkGraphRunCheckpoint: (runId: string, checkpointId: string) => void;
}) {
  const checkpoints = plan?.checkpoints ?? [];
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(checkpoints[0]?.checkpointId ?? null);
  const runtimeCheckpoints = graphRun?.checkpoints ?? [];
  const [selectedRuntimeCheckpointId, setSelectedRuntimeCheckpointId] = useState<string | null>(
    runtimeCheckpoints[0]?.checkpointId ?? null
  );

  useEffect(() => {
    setSelectedCheckpointId((current) => {
      if (current && checkpoints.some((checkpoint) => checkpoint.checkpointId === current)) {
        return current;
      }
      return checkpoints[0]?.checkpointId ?? null;
    });
  }, [plan?.planId, checkpoints]);

  useEffect(() => {
    setSelectedRuntimeCheckpointId((current) => {
      if (current && runtimeCheckpoints.some((checkpoint) => checkpoint.checkpointId === current)) {
        return current;
      }
      return runtimeCheckpoints[0]?.checkpointId ?? null;
    });
  }, [graphRun?.runId, runtimeCheckpoints]);

  const selectedCheckpoint = useMemo(
    () => checkpoints.find((checkpoint) => checkpoint.checkpointId === selectedCheckpointId) ?? checkpoints[0] ?? null,
    [checkpoints, selectedCheckpointId]
  );
  const selectedRuntimeCheckpoint = useMemo(
    () =>
      runtimeCheckpoints.find((checkpoint) => checkpoint.checkpointId === selectedRuntimeCheckpointId) ??
      runtimeCheckpoints[0] ??
      null,
    [runtimeCheckpoints, selectedRuntimeCheckpointId]
  );

  if (!plan && !graphRun) {
    return (
      <Card className="p-5">
        <h3 className="text-base font-semibold">Plan Inspector</h3>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Select a plan or runtime run to inspect workflow metadata, checkpoint history, and the latest execution snapshot.
        </p>
      </Card>
    );
  }

  if (!plan && graphRun) {
    const snapshotTasks = selectedRuntimeCheckpoint?.tasks ?? graphRun.tasks;
    return (
      <Card className="p-5 xl:sticky xl:top-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Runtime Run Inspector</h3>
              <HelpTooltip label="Explain runtime run inspector">
                Inspect persisted workflow and agency runs mirrored from live AgentOS streams. Runtime checkpoints let you
                restore the stored run snapshot or fork it into a new editable manual plan.
              </HelpTooltip>
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{graphRun.goal}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={getPlanStatusVariant(normalizeRuntimeStatus(graphRun.status))}>
              {formatStatus(normalizeRuntimeStatus(graphRun.status))}
            </Badge>
            <Badge variant="outline">Source {graphRun.source}</Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-[var(--color-bg-secondary)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Identifiers</p>
            <div className="mt-2 space-y-2 text-sm">
              <div>
                <span className="text-[var(--color-text-muted)]">Run:</span> {graphRun.runId}
              </div>
              {graphRun.workflowId ? (
                <div>
                  <span className="text-[var(--color-text-muted)]">Workflow:</span> {graphRun.workflowId}
                </div>
              ) : null}
              {graphRun.conversationId ? (
                <div>
                  <span className="text-[var(--color-text-muted)]">Conversation:</span> {graphRun.conversationId}
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-lg bg-[var(--color-bg-secondary)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Timing</p>
            <div className="mt-2 space-y-2 text-sm">
              <div>
                <span className="text-[var(--color-text-muted)]">Created:</span> {formatDateTime(graphRun.createdAt)}
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">Updated:</span> {formatDateTime(graphRun.updatedAt)}
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">Checkpoints:</span> {graphRun.checkpoints.length}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-[var(--color-text-muted)]">Checkpoint History</h4>
            <Badge variant="outline">
              <RefreshCw className="mr-1 h-3 w-3" />
              Graph run
            </Badge>
          </div>
          {runtimeCheckpoints.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No graph-run checkpoints recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {runtimeCheckpoints.map((checkpoint) => {
                const active = checkpoint.checkpointId === selectedRuntimeCheckpoint?.checkpointId;
                return (
                  <button
                    key={checkpoint.checkpointId}
                    type="button"
                    onClick={() => setSelectedRuntimeCheckpointId(checkpoint.checkpointId)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? 'border-blue-500 bg-blue-500/5'
                        : 'border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={active ? 'default' : 'outline'}>
                          {formatStatus(normalizeRuntimeStatus(checkpoint.status))}
                        </Badge>
                        <Badge variant="outline">
                          {checkpoint.completedTaskCount}/{checkpoint.totalTaskCount} complete
                        </Badge>
                      </div>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {formatDateTime(checkpoint.timestamp)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedRuntimeCheckpoint ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              title="Replace the persisted runtime run snapshot with the selected checkpoint. This updates the stored run record and any mirrored runtime plan."
              onClick={() => onRestoreGraphRunCheckpoint(graphRun.runId, selectedRuntimeCheckpoint.checkpointId)}
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              Restore runtime checkpoint
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              title="Create a new editable manual plan from the selected runtime checkpoint without changing the stored run."
              onClick={() => onForkGraphRunCheckpoint(graphRun.runId, selectedRuntimeCheckpoint.checkpointId)}
            >
              <GitBranch className="mr-1 h-4 w-4" />
              Fork to manual plan
            </Button>
          </div>
        ) : null}

        <div className="mt-5">
          <h4 className="mb-2 text-sm font-medium text-[var(--color-text-muted)]">Runtime Event Trace</h4>
          <div className="space-y-2">
            {graphRun.events.slice(0, 8).map((event) => (
              <div key={event.eventId} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline" size="xs">{event.type}</Badge>
                  <span className="text-xs text-[var(--color-text-muted)]">{formatDateTime(event.timestamp)}</span>
                </div>
                <p className="mt-2 text-sm">{event.summary}</p>
              </div>
            ))}
            {graphRun.events.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">No runtime events recorded yet.</p>
            ) : null}
          </div>
        </div>

        <div className="mt-5">
          <h4 className="mb-2 text-sm font-medium text-[var(--color-text-muted)]">
            {selectedRuntimeCheckpoint ? 'Selected Runtime Snapshot' : 'Latest Runtime Snapshot'}
          </h4>
          <div className="space-y-2">
            {snapshotTasks.map((task, index) => (
              <div key={`${graphRun.runId}-${task.taskId}`} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="flex items-start gap-3">
                  {getStepStatusIcon(toPlanStepStatus(task.status))}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{index + 1}. {task.description}</span>
                      <Badge variant="outline" size="xs">{task.assignedRoleId ?? task.assignedExecutorId ?? 'unassigned'}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]">
                      <span>ID: {task.taskId}</span>
                      <span>Status: {task.status}</span>
                    </div>
                    {task.error ? (
                      <div className="mt-2 rounded bg-red-500/10 p-2 text-xs text-red-500">{task.error}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {snapshotTasks.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">Waiting for workflow task snapshots.</p>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }

  const snapshotSteps = selectedCheckpoint?.steps ?? plan.steps;
  const completedSteps = snapshotSteps.filter((step) => step.status === 'completed').length;
  const failedSteps = snapshotSteps.filter((step) => step.status === 'failed').length;
  const pendingSteps = snapshotSteps.filter((step) => step.status === 'pending').length;
  const progress = snapshotSteps.length > 0 ? (completedSteps / snapshotSteps.length) * 100 : 0;

  return (
    <Card className="p-5 xl:sticky xl:top-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Plan Inspector</h3>
            <HelpTooltip label="Explain plan inspector">
              Manual plans are editable simulations inside the workbench. Runtime-backed plans are mirrored snapshots from
              live workflow or agency execution and stay read-only unless you fork them into a manual plan.
            </HelpTooltip>
          </div>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{plan.goal}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={getPlanStatusVariant(plan.status)}>{formatStatus(plan.status)}</Badge>
          <Badge variant="outline">{plan.source === 'runtime' ? 'Runtime-backed' : 'Manual'}</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-[var(--color-bg-secondary)] p-3">
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Identifiers</p>
          <div className="mt-2 space-y-2 text-sm">
            <div>
              <span className="text-[var(--color-text-muted)]">Plan:</span> {plan.planId}
            </div>
            {plan.workflowId ? (
              <div>
                <span className="text-[var(--color-text-muted)]">Workflow:</span> {plan.workflowId}
              </div>
            ) : null}
            {plan.conversationId ? (
              <div>
                <span className="text-[var(--color-text-muted)]">Conversation:</span> {plan.conversationId}
              </div>
            ) : null}
          </div>
        </div>
        <div className="rounded-lg bg-[var(--color-bg-secondary)] p-3">
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Timing</p>
          <div className="mt-2 space-y-2 text-sm">
            <div>
              <span className="text-[var(--color-text-muted)]">Created:</span> {formatDateTime(plan.createdAt)}
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">Updated:</span> {formatDateTime(plan.updatedAt)}
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">Checkpoints:</span> {checkpoints.length}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span>
            Snapshot Progress: {completedSteps}/{snapshotSteps.length}
          </span>
          <span className="text-[var(--color-text-muted)]">
            {failedSteps} failed • {pendingSteps} pending
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-medium text-[var(--color-text-muted)]">Checkpoint History</h4>
          {plan.source === 'runtime' ? (
            <Badge variant="outline">
              <RefreshCw className="mr-1 h-3 w-3" />
              Live sync
            </Badge>
          ) : null}
        </div>
        {checkpoints.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No checkpoints recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {checkpoints.map((checkpoint) => {
              const active = checkpoint.checkpointId === selectedCheckpoint?.checkpointId;
              return (
                <button
                  key={checkpoint.checkpointId}
                  type="button"
                  onClick={() => setSelectedCheckpointId(checkpoint.checkpointId)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    active
                      ? 'border-blue-500 bg-blue-500/5'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={active ? 'default' : 'outline'}>{formatCheckpointReason(checkpoint.reason)}</Badge>
                      <Badge variant={getPlanStatusVariant(checkpoint.status)}>{formatStatus(checkpoint.status)}</Badge>
                    </div>
                    <span className="text-xs text-[var(--color-text-muted)]">{formatDateTime(checkpoint.timestamp)}</span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    Step pointer: {Math.min(checkpoint.currentStepIndex + 1, Math.max(checkpoint.steps.length, 1))}/
                    {checkpoint.steps.length}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedCheckpoint ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {!plan.readOnly ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              title="Restore this manual plan to the selected checkpoint snapshot."
              onClick={() => onRestoreCheckpoint(plan.planId, selectedCheckpoint.checkpointId)}
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              Restore checkpoint
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            title="Create a new editable manual plan from the selected checkpoint snapshot."
            onClick={() => onForkCheckpoint(plan.planId, selectedCheckpoint.checkpointId)}
          >
            <GitBranch className="mr-1 h-4 w-4" />
            Fork to manual plan
          </Button>
        </div>
      ) : null}

      {plan.source === 'runtime' ? (
        <div className="mt-5">
          <h4 className="mb-2 text-sm font-medium text-[var(--color-text-muted)]">Runtime Event Trace</h4>
          {graphRun ? (
            <div className="space-y-2">
              <div className="rounded-lg bg-[var(--color-bg-secondary)] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Source {graphRun.source}</Badge>
                  <Badge variant={graphRun.status === 'failed' ? 'destructive' : graphRun.status === 'completed' ? 'secondary' : 'default'}>
                    {formatStatus(graphRun.status === 'running' ? 'executing' : graphRun.status)}
                  </Badge>
                  <span className="text-[var(--color-text-muted)]">
                    {graphRun.tasks.length} tasks • {graphRun.events.length} events
                  </span>
                </div>
              </div>
              {graphRun.events.slice(0, 5).map((event) => (
                <div key={event.eventId} className="rounded-lg border border-[var(--color-border)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="outline" size="xs">{event.type}</Badge>
                    <span className="text-xs text-[var(--color-text-muted)]">{formatDateTime(event.timestamp)}</span>
                  </div>
                  <p className="mt-2 text-sm">{event.summary}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              Waiting for a persisted runtime graph-run record for this execution.
            </p>
          )}
        </div>
      ) : null}

      {plan.source === 'runtime' && graphRun ? (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-[var(--color-text-muted)]">Runtime Checkpoints</h4>
            <Badge variant="outline">
              <RefreshCw className="mr-1 h-3 w-3" />
              Persisted graph run
            </Badge>
          </div>
          {runtimeCheckpoints.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No persisted runtime checkpoints recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {runtimeCheckpoints.slice(0, 6).map((checkpoint) => {
                const active = checkpoint.checkpointId === selectedRuntimeCheckpoint?.checkpointId;
                return (
                  <button
                    key={checkpoint.checkpointId}
                    type="button"
                    onClick={() => setSelectedRuntimeCheckpointId(checkpoint.checkpointId)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? 'border-blue-500 bg-blue-500/5'
                        : 'border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={active ? 'default' : 'outline'}>
                          {formatStatus(normalizeRuntimeStatus(checkpoint.status))}
                        </Badge>
                        <Badge variant="outline">
                          {checkpoint.completedTaskCount}/{checkpoint.totalTaskCount} complete
                        </Badge>
                      </div>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {formatDateTime(checkpoint.timestamp)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {selectedRuntimeCheckpoint ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                title="Replace the persisted runtime run snapshot with the selected graph-run checkpoint."
                onClick={() => onRestoreGraphRunCheckpoint(graphRun.runId, selectedRuntimeCheckpoint.checkpointId)}
              >
                <RotateCcw className="mr-1 h-4 w-4" />
                Restore runtime checkpoint
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                title="Create a new editable manual plan from the selected graph-run checkpoint without altering the stored runtime run."
                onClick={() => onForkGraphRunCheckpoint(graphRun.runId, selectedRuntimeCheckpoint.checkpointId)}
              >
                <GitBranch className="mr-1 h-4 w-4" />
                Fork runtime checkpoint
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5">
        <h4 className="mb-2 text-sm font-medium text-[var(--color-text-muted)]">
          {selectedCheckpoint ? 'Selected Snapshot' : 'Current Step Graph'}
        </h4>
        <div className="space-y-2">
          {snapshotSteps.map((step, index) => (
            <div key={`${selectedCheckpoint?.checkpointId ?? plan.planId}-${step.stepId}`} className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="flex items-start gap-3">
                {getStepStatusIcon(step.status)}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{index + 1}. {step.description}</span>
                    <Badge variant="outline" size="xs">{step.actionType.replace('_', ' ')}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]">
                    <span>ID: {step.stepId}</span>
                    {step.toolId ? <span>Tool: {step.toolId}</span> : null}
                    {typeof step.durationMs === 'number' ? <span>{(step.durationMs / 1000).toFixed(1)}s</span> : null}
                  </div>
                  {step.dependsOn && step.dependsOn.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {step.dependsOn.map((dependency) => (
                        <Badge key={dependency} variant="outline" size="xs">
                          depends on {dependency}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {step.error ? (
                    <div className="mt-2 rounded bg-red-500/10 p-2 text-xs text-red-500">{step.error}</div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function PlanningDashboard({ apiEndpoint = DEFAULT_PLANNING_API_ENDPOINT }: PlanningDashboardProps) {
  const [plans, setPlans] = useState<ExecutionPlan[]>([]);
  const [graphRuns, setGraphRuns] = useState<GraphRunRecord[]>([]);
  const [filter, setFilter] = useState<PlanFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newGoal, setNewGoal] = useState('');
  const [creating, setCreating] = useState(false);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedRuntimeRunId, setSelectedRuntimeRunId] = useState<string | null>(null);

  const fetchPlans = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const response = await fetch(`${apiEndpoint}/plans`);
      if (!response.ok) {
        throw new Error(`Failed to fetch plans (${response.status})`);
      }
      const data = await response.json();
      setPlans(Array.isArray(data) ? data : []);
      setError(null);
    } catch (fetchError) {
      console.error('Failed to fetch plans:', fetchError);
      setError('Planning backend unavailable. Start backend and retry.');
      if (!options?.silent) {
        setPlans([]);
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [apiEndpoint]);

  const fetchGraphRuns = useCallback(async () => {
    try {
      const data = await agentosClient.listGraphRuns();
      setGraphRuns(Array.isArray(data) ? data : []);
    } catch {
      setGraphRuns([]);
    }
  }, []);

  useEffect(() => {
    void fetchPlans();
    void fetchGraphRuns();
  }, [fetchGraphRuns, fetchPlans]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchPlans({ silent: true });
      void fetchGraphRuns();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchGraphRuns, fetchPlans]);

  const filteredPlans = useMemo(
    () =>
      plans.filter((plan) => {
        if (filter === 'all') {
          return true;
        }
        return plan.status === filter;
      }),
    [filter, plans]
  );

  const stats = useMemo(
    () => ({
      total: plans.length,
      executing: plans.filter((plan) => plan.status === 'executing').length,
      completed: plans.filter((plan) => plan.status === 'completed').length,
      failed: plans.filter((plan) => plan.status === 'failed').length,
    }),
    [plans]
  );

  const selectedPlan = useMemo(() => {
    if (selectedPlanId) {
      return plans.find((plan) => plan.planId === selectedPlanId) ?? null;
    }
    if (selectedRuntimeRunId) {
      return plans.find((plan) => plan.planId === selectedRuntimeRunId) ?? null;
    }
    return plans.find((plan) => plan.source === 'runtime' || plan.readOnly) ?? plans[0] ?? null;
  }, [plans, selectedPlanId, selectedRuntimeRunId]);

  const selectedRuntimeRun = useMemo(() => {
    if (selectedRuntimeRunId) {
      return graphRuns.find((run) => run.runId === selectedRuntimeRunId) ?? null;
    }
    if (selectedPlan?.source === 'runtime') {
      return graphRuns.find((run) => run.runId === selectedPlan.planId) ?? null;
    }
    if (!selectedPlan) {
      return graphRuns[0] ?? null;
    }
    return null;
  }, [graphRuns, selectedPlan, selectedRuntimeRunId]);

  useEffect(() => {
    if (plans.length === 0) {
      if (selectedPlanId !== null) {
        setSelectedPlanId(null);
      }
      return;
    }

    if (selectedRuntimeRunId && !plans.some((plan) => plan.planId === selectedRuntimeRunId)) {
      return;
    }

    if (selectedPlanId && plans.some((plan) => plan.planId === selectedPlanId)) {
      return;
    }

    const preferred = plans.find((plan) => plan.source === 'runtime' || plan.readOnly) ?? plans[0];
    if (preferred) {
      setSelectedPlanId(preferred.planId);
    }
  }, [plans, selectedPlanId, selectedRuntimeRunId]);

  useEffect(() => {
    if (selectedPlan?.source === 'runtime') {
      setSelectedRuntimeRunId(selectedPlan.planId);
      return;
    }
    if (selectedRuntimeRunId && !graphRuns.some((run) => run.runId === selectedRuntimeRunId)) {
      setSelectedRuntimeRunId(null);
    }
  }, [graphRuns, selectedPlan, selectedRuntimeRunId]);

  useEffect(() => {
    if (filter !== 'all' && filteredPlans.length === 0) {
      if (selectedPlanId !== null) {
        setSelectedPlanId(null);
      }
      return;
    }
    if (filter === 'all') {
      return;
    }
    if (selectedRuntimeRunId && !filteredPlans.some((plan) => plan.planId === selectedRuntimeRunId)) {
      return;
    }
    if (selectedPlanId && filteredPlans.some((plan) => plan.planId === selectedPlanId)) {
      return;
    }
    setSelectedPlanId(filteredPlans[0].planId);
  }, [filter, filteredPlans, selectedPlanId, selectedRuntimeRunId]);

  const upsertPlan = useCallback((nextPlan: ExecutionPlan) => {
    setPlans((previous) => {
      const index = previous.findIndex((plan) => plan.planId === nextPlan.planId);
      if (index < 0) {
        return [nextPlan, ...previous];
      }
      const copy = [...previous];
      copy[index] = nextPlan;
      return copy;
    });
  }, []);

  const performPlanAction = useCallback(
    async (planId: string, action: PlanAction) => {
      setActivePlanId(planId);
      try {
        const response = await fetch(`${apiEndpoint}/plans/${encodeURIComponent(planId)}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
          throw new Error(`Failed to ${action} plan (${response.status})`);
        }
        const updatedPlan = (await response.json()) as ExecutionPlan;
        upsertPlan(updatedPlan);
        setError(null);
      } catch (actionError) {
        console.error(`Failed to ${action} plan:`, actionError);
        setError(`Unable to ${action} plan right now.`);
      } finally {
        setActivePlanId(null);
      }
    },
    [apiEndpoint, upsertPlan]
  );

  const performCheckpointAction = useCallback(
    async (planId: string, checkpointId: string, action: CheckpointAction) => {
      setActivePlanId(planId);
      try {
        const response = await fetch(
          `${apiEndpoint}/plans/${encodeURIComponent(planId)}/checkpoints/${encodeURIComponent(checkpointId)}/${action}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }
        );
        if (!response.ok) {
          const failure = await response.json().catch(() => null);
          throw new Error(
            typeof failure?.message === 'string'
              ? failure.message
              : `Failed to ${action} checkpoint (${response.status})`
          );
        }
        const updatedPlan = (await response.json()) as ExecutionPlan;
        upsertPlan(updatedPlan);
        setSelectedPlanId(updatedPlan.planId);
        setError(null);
      } catch (actionError) {
        console.error(`Failed to ${action} checkpoint:`, actionError);
        setError(actionError instanceof Error ? actionError.message : `Unable to ${action} checkpoint right now.`);
      } finally {
        setActivePlanId(null);
      }
    },
    [apiEndpoint, upsertPlan]
  );

  const performGraphRunCheckpointAction = useCallback(
    async (runId: string, checkpointId: string, action: CheckpointAction) => {
      setActivePlanId(runId);
      try {
        if (action === 'restore') {
          const restoredRun = await agentosClient.restoreGraphRunCheckpoint(runId, checkpointId);
          setGraphRuns((previous) => {
            const index = previous.findIndex((run) => run.runId === restoredRun.runId);
            if (index < 0) {
              return [restoredRun, ...previous];
            }
            const next = [...previous];
            next[index] = restoredRun;
            return next;
          });
          await fetchPlans({ silent: true });
          setSelectedRuntimeRunId(restoredRun.runId);
        } else {
          const forkedPlan = await agentosClient.forkGraphRunCheckpoint(runId, checkpointId);
          const createdPlan = forkedPlan as unknown as ExecutionPlan;
          upsertPlan(createdPlan);
          setSelectedPlanId(createdPlan.planId);
          setSelectedRuntimeRunId(null);
        }
        setError(null);
      } catch (actionError) {
        console.error(`Failed to ${action} graph-run checkpoint:`, actionError);
        setError(
          actionError instanceof Error
            ? actionError.message
            : `Unable to ${action} graph-run checkpoint right now.`
        );
      } finally {
        setActivePlanId(null);
      }
    },
    [fetchPlans, upsertPlan]
  );

  const handleCreatePlan = useCallback(async () => {
    const goal = newGoal.trim();
    if (!goal) {
      setError('Enter a goal before creating a plan.');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(`${apiEndpoint}/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      if (!response.ok) {
        throw new Error(`Failed to create plan (${response.status})`);
      }
      const createdPlan = (await response.json()) as ExecutionPlan;
      setPlans((previous) => [createdPlan, ...previous]);
      setSelectedPlanId(createdPlan.planId);
      setSelectedRuntimeRunId(null);
      setNewGoal('');
      setError(null);
    } catch (createError) {
      console.error('Failed to create plan:', createError);
      setError('Unable to create plan right now.');
    } finally {
      setCreating(false);
    }
  }, [apiEndpoint, newGoal]);

  const handleRefresh = useCallback(async () => {
    await Promise.allSettled([fetchPlans(), fetchGraphRuns()]);
  }, [fetchGraphRuns, fetchPlans]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Planning Engine</h1>
            <HelpTooltip label="Explain planning engine">
              Use manual plans to simulate and edit execution step by step. Use Runtime Runs to inspect persisted workflow
              and agency executions mirrored from the backend. Fork any useful checkpoint into a manual plan when you want
              to iterate locally.
            </HelpTooltip>
          </div>
          <p className="text-[var(--color-text-muted)]">Create and manage execution plans for experiments.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <input
            value={newGoal}
            onChange={(event) => setNewGoal(event.target.value)}
            placeholder="Define a new experiment goal..."
            className="min-w-[16rem] rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
          />
          <Button
            variant="outline"
            title="Reload both manual plans and persisted runtime runs from the backend."
            onClick={() => void handleRefresh()}
            disabled={loading || creating}
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button
            title="Create a new editable manual plan inside the workbench."
            onClick={() => void handleCreatePlan()}
            disabled={creating}
          >
            <Target className="w-4 h-4 mr-2" />
            {creating ? 'Creating...' : 'New Plan'}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-3 border-red-500/30 bg-red-500/10">
          <p className="text-sm text-red-500">{error}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Activity className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-[var(--color-text-muted)]">Total Plans</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Clock className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.executing}</p>
              <p className="text-sm text-[var(--color-text-muted)]">Executing</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-sm text-[var(--color-text-muted)]">Completed</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.failed}</p>
              <p className="text-sm text-[var(--color-text-muted)]">Failed</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'executing', 'paused', 'completed', 'failed'] as const).map((currentFilter) => (
          <Button
            key={currentFilter}
            variant={filter === currentFilter ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(currentFilter)}
          >
            {formatFilterLabel(currentFilter)}
          </Button>
        ))}
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Runtime Runs</h3>
              <HelpTooltip label="Explain runtime runs" side="bottom">
                These are persisted records mirrored from live workflow and agency streams. Select one to inspect runtime
                events and checkpoints even if the workbench has not yet created a mirrored runtime plan snapshot.
              </HelpTooltip>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              Persisted workflow and agency run records mirrored from live AgentOS streams.
            </p>
          </div>
          <Badge variant="outline">{graphRuns.length} tracked</Badge>
        </div>
        {graphRuns.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            No runtime runs have been recorded yet.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {graphRuns.slice(0, 6).map((run) => {
              const active = selectedRuntimeRun?.runId === run.runId;
              const linkedPlan = plans.find((plan) => plan.planId === run.runId) ?? null;
              return (
                <button
                  key={run.runId}
                  type="button"
                  onClick={() => {
                    setSelectedRuntimeRunId(run.runId);
                    if (linkedPlan) {
                      setSelectedPlanId(linkedPlan.planId);
                    } else {
                      setSelectedPlanId(null);
                    }
                  }}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    active ? 'border-blue-500 bg-blue-500/5' : 'border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="outline" size="xs">{run.source}</Badge>
                    <Badge variant={getPlanStatusVariant(normalizeRuntimeStatus(run.status))} size="xs">
                      {formatStatus(normalizeRuntimeStatus(run.status))}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium">{run.goal}</p>
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    {run.tasks.length} tasks • {run.events.length} events • updated {formatDateTime(run.updatedAt)}
                  </p>
                  {!linkedPlan ? (
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                      Waiting for a mirrored planning snapshot.
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(22rem,0.9fr)]">
        <div className="space-y-4">
          {loading ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">Loading planning data...</p>
            </Card>
          ) : filteredPlans.length === 0 ? (
            <Card className="p-8 text-center">
              <Target className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-muted)]" />
              <h3 className="font-medium mb-2">
                {graphRuns.length > 0 ? 'No plans match this filter' : 'No plans found'}
              </h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                {graphRuns.length > 0
                  ? 'Runtime runs are still available above, or change the filter to inspect mirrored plan snapshots.'
                  : 'Create a new plan to start running experiments.'}
              </p>
            </Card>
          ) : (
            filteredPlans.map((plan) => (
              <PlanCard
                key={plan.planId}
                plan={plan}
                isBusy={activePlanId === plan.planId}
                isSelected={selectedPlan?.planId === plan.planId}
                onPause={(planId) => {
                  void performPlanAction(planId, 'pause');
                }}
                onResume={(planId) => {
                  void performPlanAction(planId, 'resume');
                }}
                onAdvance={(planId) => {
                  void performPlanAction(planId, 'advance');
                }}
                onRerun={(planId) => {
                  void performPlanAction(planId, 'rerun');
                }}
                onInspect={(planId) => {
                  setSelectedPlanId(planId);
                  const inspectedPlan = plans.find((plan) => plan.planId === planId);
                  if (inspectedPlan?.source === 'runtime') {
                    setSelectedRuntimeRunId(planId);
                  } else {
                    setSelectedRuntimeRunId(null);
                  }
                }}
              />
            ))
          )}
        </div>
        <PlanInspector
          plan={selectedPlan}
          busy={activePlanId !== null}
          graphRun={selectedRuntimeRun}
          onRestoreCheckpoint={(planId, checkpointId) => {
            void performCheckpointAction(planId, checkpointId, 'restore');
          }}
          onForkCheckpoint={(planId, checkpointId) => {
            void performCheckpointAction(planId, checkpointId, 'fork');
          }}
          onRestoreGraphRunCheckpoint={(runId, checkpointId) => {
            void performGraphRunCheckpointAction(runId, checkpointId, 'restore');
          }}
          onForkGraphRunCheckpoint={(runId, checkpointId) => {
            void performGraphRunCheckpointAction(runId, checkpointId, 'fork');
          }}
        />
      </div>
    </div>
  );
}
