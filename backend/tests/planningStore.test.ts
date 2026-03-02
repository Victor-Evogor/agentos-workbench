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
