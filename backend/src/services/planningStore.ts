import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type PlanActionType =
  | 'tool_call'
  | 'gmi_action'
  | 'human_input'
  | 'sub_plan'
  | 'reflection'
  | 'communication';

export type PlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
export type PlanStatus = 'draft' | 'executing' | 'paused' | 'completed' | 'failed';

export interface PlanStepRecord {
  stepId: string;
  description: string;
  actionType: PlanActionType;
  toolId?: string;
  status: PlanStepStatus;
  dependsOn?: string[];
  estimatedTokens?: number;
  confidence?: number;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

export interface PlanRecord {
  planId: string;
  goal: string;
  steps: PlanStepRecord[];
  estimatedTokens?: number;
  confidenceScore?: number;
  createdAt: string;
  updatedAt?: string;
  status: PlanStatus;
  currentStepIndex: number;
}

export interface CreatePlanInput {
  goal?: string;
  steps?: Array<{
    description: string;
    actionType?: PlanActionType;
    toolId?: string;
    dependsOn?: string[];
    estimatedTokens?: number;
    confidence?: number;
  }>;
}

type PersistedPlanningState = {
  version: number;
  planCounter: number;
  stepCounter: number;
  plans: PlanRecord[];
};

const STORE_VERSION = 1;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveStorePath(): string {
  const configuredPath = process.env.AGENTOS_WORKBENCH_PLANNING_STORE_PATH?.trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  return path.resolve(__dirname, '../../../.data/planning-store.json');
}

function isPlanRecord(value: unknown): value is PlanRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as PlanRecord;
  return (
    typeof candidate.planId === 'string' &&
    typeof candidate.goal === 'string' &&
    Array.isArray(candidate.steps) &&
    typeof candidate.status === 'string'
  );
}

function normalizeState(
  raw: unknown
): { planCounter: number; stepCounter: number; plans: PlanRecord[] } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Partial<PersistedPlanningState>;
  if (!Array.isArray(candidate.plans)) {
    return null;
  }
  const plans = candidate.plans.filter((plan) => isPlanRecord(plan));
  const planCounter =
    typeof candidate.planCounter === 'number' && Number.isFinite(candidate.planCounter)
      ? candidate.planCounter
      : plans.length;
  const stepCounter =
    typeof candidate.stepCounter === 'number' && Number.isFinite(candidate.stepCounter)
      ? candidate.stepCounter
      : plans.reduce((count, plan) => count + plan.steps.length, 0);
  return {
    planCounter,
    stepCounter,
    plans: deepClone(plans),
  };
}

function normalizeGoal(goal?: string): string {
  const value = goal?.trim();
  if (!value) {
    return 'New autonomous plan';
  }
  return value;
}

export class PlanningStore {
  private readonly storePath: string;
  private plans: PlanRecord[];
  private planCounter: number;
  private stepCounter: number;

  constructor(storePath = resolveStorePath()) {
    this.storePath = storePath;
    const persisted = this.loadState();
    if (persisted) {
      this.plans = persisted.plans;
      this.planCounter = persisted.planCounter;
      this.stepCounter = persisted.stepCounter;
      return;
    }

    this.plans = [];
    this.planCounter = 0;
    this.stepCounter = 0;

    this.createPlan({
      goal: 'Research and summarize AI agent frameworks',
      steps: [
        {
          description: 'Search for recent AI agent framework releases',
          actionType: 'tool_call',
          toolId: 'web-search',
          confidence: 0.9,
        },
        {
          description: 'Analyze key features of each framework',
          actionType: 'reflection',
          confidence: 0.85,
        },
        {
          description: 'Compare frameworks against AgentOS',
          actionType: 'gmi_action',
          confidence: 0.8,
        },
        {
          description: 'Generate summary report',
          actionType: 'gmi_action',
          confidence: 0.9,
        },
      ],
    });
  }

  listPlans(): PlanRecord[] {
    return deepClone(this.plans);
  }

  createPlan(input: CreatePlanInput): PlanRecord {
    const nowIso = new Date().toISOString();
    const goal = normalizeGoal(input.goal);
    const planId = `plan-${String(++this.planCounter).padStart(4, '0')}`;
    const steps = this.buildSteps(goal, input.steps);
    const firstStep = steps.findIndex((step) => step.status === 'in_progress');

    const confidenceScore =
      steps.length > 0
        ? Number(
            (
              steps.reduce((sum, step) => sum + (step.confidence ?? 0.75), 0) / steps.length
            ).toFixed(2)
          )
        : 0.75;
    const estimatedTokens = steps.reduce((sum, step) => sum + (step.estimatedTokens ?? 600), 0);

    const plan: PlanRecord = {
      planId,
      goal,
      steps,
      estimatedTokens,
      confidenceScore,
      createdAt: nowIso,
      updatedAt: nowIso,
      status: steps.length > 0 ? 'executing' : 'draft',
      currentStepIndex: firstStep >= 0 ? firstStep : 0,
    };

    this.plans.unshift(plan);
    this.persistState();
    return deepClone(plan);
  }

  pausePlan(planId: string): PlanRecord | null {
    const plan = this.findPlan(planId);
    if (!plan) {
      return null;
    }
    if (plan.status === 'executing') {
      plan.status = 'paused';
      plan.updatedAt = new Date().toISOString();
      this.persistState();
    }
    return deepClone(plan);
  }

  resumePlan(planId: string): PlanRecord | null {
    const plan = this.findPlan(planId);
    if (!plan) {
      return null;
    }
    if (plan.status === 'paused' || plan.status === 'draft') {
      plan.status = 'executing';
      if (!plan.steps.some((step) => step.status === 'in_progress')) {
        const pendingIndex = plan.steps.findIndex((step) => step.status === 'pending');
        if (pendingIndex >= 0) {
          plan.steps[pendingIndex].status = 'in_progress';
          plan.currentStepIndex = pendingIndex;
        }
      }
      plan.updatedAt = new Date().toISOString();
      this.persistState();
    }
    return deepClone(plan);
  }

  advancePlan(planId: string): PlanRecord | null {
    const plan = this.findPlan(planId);
    if (!plan || plan.status !== 'executing') {
      return plan ? deepClone(plan) : null;
    }

    let currentIndex = plan.steps.findIndex((step) => step.status === 'in_progress');
    if (currentIndex < 0) {
      currentIndex = plan.steps.findIndex((step) => step.status === 'pending');
      if (currentIndex >= 0) {
        plan.steps[currentIndex].status = 'in_progress';
      }
    }
    if (currentIndex < 0) {
      plan.status = 'completed';
      plan.updatedAt = new Date().toISOString();
      this.persistState();
      return deepClone(plan);
    }

    const currentStep = plan.steps[currentIndex];
    currentStep.status = 'completed';
    currentStep.durationMs = currentStep.durationMs ?? (900 + currentIndex * 175);
    currentStep.output = currentStep.output ?? `Completed: ${currentStep.description}`;

    const nextIndex = plan.steps.findIndex(
      (step, index) => index > currentIndex && step.status === 'pending'
    );
    if (nextIndex >= 0) {
      plan.steps[nextIndex].status = 'in_progress';
      plan.currentStepIndex = nextIndex;
    } else {
      plan.currentStepIndex = plan.steps.length - 1;
      plan.status = 'completed';
    }
    plan.updatedAt = new Date().toISOString();
    this.persistState();
    return deepClone(plan);
  }

  rerunPlan(planId: string): PlanRecord | null {
    const existing = this.findPlan(planId);
    if (!existing) {
      return null;
    }
    const steps = existing.steps.map((step) => ({
      description: step.description,
      actionType: step.actionType,
      toolId: step.toolId,
      dependsOn: step.dependsOn,
      estimatedTokens: step.estimatedTokens,
      confidence: step.confidence,
    }));
    return this.createPlan({
      goal: `${existing.goal} (rerun)`,
      steps,
    });
  }

  private buildSteps(
    goal: string,
    customSteps?: CreatePlanInput['steps']
  ): PlanStepRecord[] {
    const stepSpecs =
      customSteps && customSteps.length > 0
        ? customSteps
        : [
            {
              description: `Clarify objective and success criteria for "${goal}"`,
              actionType: 'reflection' as const,
              confidence: 0.86,
            },
            {
              description: 'Gather supporting context from available tools',
              actionType: 'tool_call' as const,
              toolId: 'web-search',
              confidence: 0.81,
            },
            {
              description: 'Synthesize findings and draft recommended actions',
              actionType: 'gmi_action' as const,
              confidence: 0.84,
            },
          ];

    const steps = stepSpecs.map((step, index) => {
      const stepId = `step-${String(++this.stepCounter).padStart(5, '0')}`;
      return {
        stepId,
        description: step.description,
        actionType: step.actionType ?? 'gmi_action',
        toolId: step.toolId,
        status: index === 0 ? 'in_progress' : 'pending',
        dependsOn: step.dependsOn,
        estimatedTokens: step.estimatedTokens ?? 450 + index * 150,
        confidence: step.confidence ?? 0.8,
      } satisfies PlanStepRecord;
    });

    return steps;
  }

  private findPlan(planId: string): PlanRecord | undefined {
    return this.plans.find((plan) => plan.planId === planId);
  }

  private loadState(): { planCounter: number; stepCounter: number; plans: PlanRecord[] } | null {
    try {
      if (!existsSync(this.storePath)) {
        return null;
      }
      const raw = readFileSync(this.storePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedPlanningState;
      if (!parsed || parsed.version !== STORE_VERSION) {
        return null;
      }
      return normalizeState(parsed);
    } catch (error) {
      console.warn('[PlanningStore] Failed to load persisted state:', error);
      return null;
    }
  }

  private persistState(): void {
    const payload: PersistedPlanningState = {
      version: STORE_VERSION,
      planCounter: this.planCounter,
      stepCounter: this.stepCounter,
      plans: this.plans,
    };

    const directory = path.dirname(this.storePath);
    mkdirSync(directory, { recursive: true });
    const tempPath = `${this.storePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf-8');
    renameSync(tempPath, this.storePath);
  }
}

export const planningStore = new PlanningStore();
