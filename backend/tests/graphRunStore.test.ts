import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { GraphRunStore } from '../src/services/graphRunStore';

function createTempStorePath(prefix: string): { dir: string; storePath: string } {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  return {
    dir,
    storePath: path.join(dir, 'graph-runs.json'),
  };
}

test('GraphRunStore persists workflow snapshots, checkpoints, and events', () => {
  const { dir, storePath } = createTempStorePath('agentos-graph-run-store-');
  try {
    const store = new GraphRunStore(storePath);
    store.beginRun({
      runId: 'run-001',
      source: 'workflow',
      goal: 'Research quantum computing',
      workflowId: 'local.research-and-publish',
      conversationId: 'conv-001',
    });

    const synced = store.syncWorkflowSnapshot({
      runId: 'run-001',
      source: 'workflow',
      goal: 'Research quantum computing',
      workflowId: 'local.research-and-publish',
      conversationId: 'conv-001',
      workflow: {
        status: 'running',
        tasks: {
          search: {
            status: 'in_progress',
            assignedRoleId: 'signals_researcher',
            metadata: { displayName: 'Search web' },
          },
        },
      },
    });

    assert.equal(synced.status, 'running');
    assert.equal(synced.tasks.length, 1);
    assert.equal(synced.checkpoints.length, 1);
    const firstCheckpointId = synced.checkpoints[0]?.checkpointId;
    assert.ok(firstCheckpointId);

    const secondSync = store.syncWorkflowSnapshot({
      runId: 'run-001',
      source: 'workflow',
      goal: 'Research quantum computing',
      workflowId: 'local.research-and-publish',
      conversationId: 'conv-001',
      workflow: {
        status: 'running',
        tasks: {
          search: {
            status: 'completed',
            assignedRoleId: 'signals_researcher',
            metadata: { displayName: 'Search web' },
            output: { urls: ['https://example.com'] },
          },
          summarize: {
            status: 'in_progress',
            assignedRoleId: 'writer',
            metadata: { displayName: 'Summarize findings' },
          },
        },
      },
    });

    assert.equal(secondSync.tasks.length, 2);
    assert.ok(secondSync.checkpoints.length >= 2);

    const restored = store.restoreCheckpoint('run-001', firstCheckpointId);
    assert.ok(restored);
    assert.equal(restored.tasks.length, 1);
    assert.equal(restored.tasks[0]?.status, 'in_progress');
    assert.ok(restored.events.some((event) => event.type === 'checkpoint_restored'));

    const withEvent = store.appendEvent('run-001', {
      type: 'tool_call_request',
      summary: 'Calling webSearch',
      payload: { toolName: 'webSearch' },
    });
    assert.ok(withEvent);
    assert.equal(withEvent.events.length, 3);

    const completed = store.completeRun('run-001');
    assert.ok(completed);
    assert.equal(completed.status, 'completed');
    assert.ok(completed.checkpoints.length >= 2);

    const reloaded = new GraphRunStore(storePath);
    const run = reloaded.getRun('run-001');
    assert.ok(run);
    assert.equal(run.status, 'completed');
    assert.ok(run.events.length >= 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
