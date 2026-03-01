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
}

type PlanFilter = 'all' | 'executing' | 'paused' | 'completed' | 'failed';
type PlanAction = 'pause' | 'resume' | 'advance' | 'rerun';

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
  onPause,
  onResume,
  onAdvance,
  onRerun,
}: {
  plan: ExecutionPlan;
  isBusy: boolean;
  onPause: (planId: string) => void;
  onResume: (planId: string) => void;
  onAdvance: (planId: string) => void;
  onRerun: (planId: string) => void;
}) {
  const completedSteps = plan.steps.filter((step) => step.status === 'completed').length;
  const progress = plan.steps.length > 0 ? (completedSteps / plan.steps.length) * 100 : 0;

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg">{plan.goal}</h3>
            <Badge variant={getPlanStatusVariant(plan.status)}>{formatStatus(plan.status)}</Badge>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Plan ID: {plan.planId} • Created {new Date(plan.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {plan.status === 'executing' && (
            <>
              <Button variant="outline" size="sm" disabled={isBusy} onClick={() => onPause(plan.planId)}>
                <Pause className="w-4 h-4 mr-1" /> Pause
              </Button>
              <Button variant="outline" size="sm" disabled={isBusy} onClick={() => onAdvance(plan.planId)}>
                <SkipForward className="w-4 h-4 mr-1" /> Advance
              </Button>
            </>
          )}
          {plan.status === 'paused' && (
            <Button variant="outline" size="sm" disabled={isBusy} onClick={() => onResume(plan.planId)}>
              <Play className="w-4 h-4 mr-1" /> Resume
            </Button>
          )}
          {(plan.status === 'failed' || plan.status === 'completed' || plan.status === 'paused') && (
            <Button variant="outline" size="sm" disabled={isBusy} onClick={() => onRerun(plan.planId)}>
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

export function PlanningDashboard({ apiEndpoint = DEFAULT_PLANNING_API_ENDPOINT }: PlanningDashboardProps) {
  const [plans, setPlans] = useState<ExecutionPlan[]>([]);
  const [filter, setFilter] = useState<PlanFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newGoal, setNewGoal] = useState('');
  const [creating, setCreating] = useState(false);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
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
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint]);

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

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
      setNewGoal('');
      setError(null);
    } catch (createError) {
      console.error('Failed to create plan:', createError);
      setError('Unable to create plan right now.');
    } finally {
      setCreating(false);
    }
  }, [apiEndpoint, newGoal]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planning Engine</h1>
          <p className="text-[var(--color-text-muted)]">Create and manage execution plans for experiments.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <input
            value={newGoal}
            onChange={(event) => setNewGoal(event.target.value)}
            placeholder="Define a new experiment goal..."
            className="min-w-[16rem] rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
          />
          <Button variant="outline" onClick={() => void fetchPlans()} disabled={loading || creating}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button onClick={() => void handleCreatePlan()} disabled={creating}>
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

      <div className="space-y-4">
        {loading ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">Loading planning data...</p>
          </Card>
        ) : filteredPlans.length === 0 ? (
          <Card className="p-8 text-center">
            <Target className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-muted)]" />
            <h3 className="font-medium mb-2">No plans found</h3>
            <p className="text-sm text-[var(--color-text-muted)]">
              Create a new plan to start running experiments.
            </p>
          </Card>
        ) : (
          filteredPlans.map((plan) => (
            <PlanCard
              key={plan.planId}
              plan={plan}
              isBusy={activePlanId === plan.planId}
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
            />
          ))
        )}
      </div>
    </div>
  );
}
