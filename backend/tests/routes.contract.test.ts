import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';

async function createServer(): Promise<{
  app: FastifyInstance;
  cleanup: () => void;
}> {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'agentos-routes-contract-'));
  process.env.AGENTOS_WORKBENCH_EVALUATION_STORE_PATH = path.join(tempDir, 'evaluation.json');
  process.env.AGENTOS_WORKBENCH_PLANNING_STORE_PATH = path.join(tempDir, 'planning.json');

  const [{ default: evaluationRoutes }, { default: planningRoutes }] = await Promise.all([
    import('../src/routes/evaluation'),
    import('../src/routes/planning'),
  ]);

  const app = Fastify();
  await app.register(evaluationRoutes, { prefix: '/api/evaluation' });
  await app.register(planningRoutes, { prefix: '/api/planning' });

  const cleanup = () => {
    rmSync(tempDir, { recursive: true, force: true });
  };

  return { app, cleanup };
}

test('evaluation routes expose expected run/result/test-case contracts', async () => {
  const { app, cleanup } = await createServer();
  try {
    const runsResponse = await app.inject({ method: 'GET', url: '/api/evaluation/runs' });
    assert.equal(runsResponse.statusCode, 200);
    const runs = runsResponse.json();
    assert.ok(Array.isArray(runs));
    assert.ok(runs.length >= 2);
    assert.equal(typeof runs[0].id, 'string');

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/evaluation/run',
      payload: { name: 'Contract Run', testCaseIds: ['tc-001'] },
    });
    assert.equal(createResponse.statusCode, 200);
    const createdRun = createResponse.json();
    assert.equal(createdRun.name, 'Contract Run');
    assert.equal(createdRun.totalTests, 1);

    const resultsResponse = await app.inject({
      method: 'GET',
      url: `/api/evaluation/runs/${encodeURIComponent(createdRun.id)}/results`,
    });
    assert.equal(resultsResponse.statusCode, 200);
    const results = resultsResponse.json();
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 1);
    assert.equal(typeof results[0].testCaseId, 'string');
  } finally {
    await app.close();
    cleanup();
  }
});

test('planning routes support lifecycle contract operations', async () => {
  const { app, cleanup } = await createServer();
  try {
    const { planningStore } = await import('../src/services/planningStore');
    const plansResponse = await app.inject({ method: 'GET', url: '/api/planning/plans' });
    assert.equal(plansResponse.statusCode, 200);
    const initialPlans = plansResponse.json();
    assert.ok(Array.isArray(initialPlans));

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/planning/plans',
      payload: { goal: 'Contract Planning Goal' },
    });
    assert.equal(createResponse.statusCode, 200);
    const plan = createResponse.json();
    assert.equal(plan.goal, 'Contract Planning Goal');
    assert.equal(plan.status, 'executing');
    assert.ok(Array.isArray(plan.steps));

    const pauseResponse = await app.inject({
      method: 'POST',
      url: `/api/planning/plans/${encodeURIComponent(plan.planId)}/pause`,
    });
    assert.equal(pauseResponse.statusCode, 200);
    assert.equal(pauseResponse.json().status, 'paused');

    const resumeResponse = await app.inject({
      method: 'POST',
      url: `/api/planning/plans/${encodeURIComponent(plan.planId)}/resume`,
    });
    assert.equal(resumeResponse.statusCode, 200);
    assert.equal(resumeResponse.json().status, 'executing');

    const advanceResponse = await app.inject({
      method: 'POST',
      url: `/api/planning/plans/${encodeURIComponent(plan.planId)}/advance`,
    });
    assert.equal(advanceResponse.statusCode, 200);
    const advancedPlan = advanceResponse.json();
    assert.ok(['executing', 'completed'].includes(advancedPlan.status));
    assert.ok(Array.isArray(advancedPlan.checkpoints));
    assert.ok(advancedPlan.checkpoints.length >= 2);

    const createdCheckpoint = advancedPlan.checkpoints.find((checkpoint: { reason?: string }) => checkpoint.reason === 'created');
    assert.ok(createdCheckpoint);

    const restoreResponse = await app.inject({
      method: 'POST',
      url: `/api/planning/plans/${encodeURIComponent(plan.planId)}/checkpoints/${encodeURIComponent(createdCheckpoint.checkpointId)}/restore`,
    });
    assert.equal(restoreResponse.statusCode, 200);
    assert.equal(restoreResponse.json().readOnly, false);

    const rerunResponse = await app.inject({
      method: 'POST',
      url: `/api/planning/plans/${encodeURIComponent(plan.planId)}/rerun`,
    });
    assert.equal(rerunResponse.statusCode, 200);
    const rerunPlan = rerunResponse.json();
    assert.notEqual(rerunPlan.planId, plan.planId);
    assert.equal(rerunPlan.status, 'executing');

    const notFoundResponse = await app.inject({
      method: 'POST',
      url: '/api/planning/plans/plan-does-not-exist/pause',
    });
    assert.equal(notFoundResponse.statusCode, 404);
    assert.equal(notFoundResponse.json().message, 'Plan not found');

    const runtimePlan = planningStore.syncRuntimePlan({
      planId: 'runtime-contract-plan',
      goal: 'Runtime contract plan',
      status: 'executing',
      steps: [
        {
          stepId: 'runtime-step-1',
          description: 'Collect runtime signals',
          actionType: 'gmi_action',
          status: 'in_progress',
        },
      ],
    });
    const runtimeCheckpointId = runtimePlan.checkpoints?.[0]?.checkpointId;
    assert.ok(runtimeCheckpointId);

    const forkResponse = await app.inject({
      method: 'POST',
      url: `/api/planning/plans/${encodeURIComponent(runtimePlan.planId)}/checkpoints/${encodeURIComponent(runtimeCheckpointId)}/fork`,
    });
    assert.equal(forkResponse.statusCode, 200);
    assert.equal(forkResponse.json().readOnly, false);
  } finally {
    await app.close();
    cleanup();
  }
});
