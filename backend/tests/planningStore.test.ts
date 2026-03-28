import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PlanningStore } from '../src/services/planningStore';

function createTempStorePath(prefix: string): { dir: string; storePath: string } {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  return {
    dir,
    storePath: path.join(dir, 'store.json'),
  };
}

test('PlanningStore persists plans across restarts', () => {
  const { dir, storePath } = createTempStorePath('agentos-planning-store-');
  try {
    const firstStore = new PlanningStore(storePath);
    const baselineCount = firstStore.listPlans().length;
    assert.ok(baselineCount >= 1, 'seed plan should exist');

    const createdPlan = firstStore.createPlan({
      goal: 'Persisted planning goal',
    });
    assert.equal(createdPlan.goal, 'Persisted planning goal');
    assert.equal(createdPlan.status, 'executing');

    const secondStore = new PlanningStore(storePath);
    const reloadedPlans = secondStore.listPlans();
    assert.ok(
      reloadedPlans.some((plan) => plan.planId === createdPlan.planId),
      'created plan should exist after reload'
    );
    assert.equal(reloadedPlans.length, baselineCount + 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PlanningStore supports pause, resume, advance, and rerun', () => {
  const { dir, storePath } = createTempStorePath('agentos-planning-actions-');
  try {
    const store = new PlanningStore(storePath);
    const plan = store.createPlan({ goal: 'Action test goal' });

    const paused = store.pausePlan(plan.planId);
    assert.ok(paused);
    assert.equal(paused.status, 'paused');

    const resumed = store.resumePlan(plan.planId);
    assert.ok(resumed);
    assert.equal(resumed.status, 'executing');

    const advanced = store.advancePlan(plan.planId);
    assert.ok(advanced);
    assert.ok(
      ['executing', 'completed'].includes(advanced.status),
      'advance should keep plan executing or complete it'
    );

    const rerun = store.rerunPlan(plan.planId);
    assert.ok(rerun);
    assert.notEqual(rerun.planId, plan.planId);
    assert.equal(rerun.status, 'executing');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PlanningStore syncs runtime-backed plans as read-only records', () => {
  const { dir, storePath } = createTempStorePath('agentos-planning-runtime-');
  try {
    const store = new PlanningStore(storePath);
    const synced = store.syncRuntimePlan({
      planId: 'workflow-exec-123',
      goal: 'Runtime workflow execution',
      status: 'executing',
      workflowId: 'local.research-and-publish',
      conversationId: 'conv-123',
      steps: [
        {
          stepId: 'gather-signals',
          description: 'Gather signals',
          actionType: 'gmi_action',
          status: 'in_progress',
        },
      ],
    });

    assert.equal(synced.planId, 'workflow-exec-123');
    assert.equal(synced.source, 'runtime');
    assert.equal(synced.readOnly, true);
    assert.equal(synced.workflowId, 'local.research-and-publish');
    assert.equal(synced.conversationId, 'conv-123');
    assert.equal(Array.isArray(synced.checkpoints), true);
    assert.equal(synced.checkpoints?.length, 1);

    assert.equal(store.pausePlan('workflow-exec-123')?.status, 'executing');
    assert.equal(store.resumePlan('workflow-exec-123')?.status, 'executing');
    assert.equal(store.advancePlan('workflow-exec-123')?.status, 'executing');
    assert.equal(store.rerunPlan('workflow-exec-123')?.planId, 'workflow-exec-123');

    const updated = store.syncRuntimePlan({
      planId: 'workflow-exec-123',
      goal: 'Runtime workflow execution',
      status: 'completed',
      workflowId: 'local.research-and-publish',
      conversationId: 'conv-123',
      steps: [
        {
          stepId: 'gather-signals',
          description: 'Gather signals',
          actionType: 'gmi_action',
          status: 'completed',
          output: 'done',
        },
      ],
    });

    assert.equal(updated.status, 'completed');
    assert.equal(updated.checkpoints?.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PlanningStore can restore manual checkpoints and fork runtime checkpoints', () => {
  const { dir, storePath } = createTempStorePath('agentos-planning-checkpoints-');
  try {
    const store = new PlanningStore(storePath);
    const manual = store.createPlan({ goal: 'Manual restore goal' });
    const advanced = store.advancePlan(manual.planId);
    assert.ok(advanced);
    assert.ok((advanced.checkpoints?.length ?? 0) >= 2);
    const createdCheckpointId = advanced.checkpoints?.find((checkpoint) => checkpoint.reason === 'created')?.checkpointId;
    assert.ok(createdCheckpointId);

    const restored = store.restoreCheckpoint(manual.planId, createdCheckpointId!);
    assert.ok(restored);
    assert.equal(restored.readOnly, false);
    assert.equal(restored.currentStepIndex, 0);
    assert.equal(restored.steps[0]?.status, 'in_progress');
    assert.ok((restored.checkpoints?.length ?? 0) >= 3);

    const runtime = store.syncRuntimePlan({
      planId: 'runtime-plan-fork-source',
      goal: 'Runtime source plan',
      status: 'executing',
      workflowId: 'local.research-and-publish',
      conversationId: 'conv-runtime',
      steps: [
        {
          stepId: 'runtime-step-1',
          description: 'Gather signals',
          actionType: 'gmi_action',
          status: 'completed',
          output: 'gathered',
        },
        {
          stepId: 'runtime-step-2',
          description: 'Draft update',
          actionType: 'gmi_action',
          status: 'in_progress',
        },
      ],
    });
    const runtimeCheckpointId = runtime.checkpoints?.[0]?.checkpointId;
    assert.ok(runtimeCheckpointId);

    const forked = store.forkCheckpoint(runtime.planId, runtimeCheckpointId!);
    assert.ok(forked);
    assert.notEqual(forked.planId, runtime.planId);
    assert.equal(forked.readOnly, false);
    assert.equal(forked.source, 'manual');
    assert.equal(forked.steps[0]?.status, 'completed');
    assert.equal(forked.steps[1]?.status, 'in_progress');
    assert.ok((forked.checkpoints?.length ?? 0) >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
