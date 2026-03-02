import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EvaluationStore } from '../src/services/evaluationStore';

function createTempStorePath(prefix: string): { dir: string; storePath: string } {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  return {
    dir,
    storePath: path.join(dir, 'store.json'),
  };
}

test('EvaluationStore persists runs across restarts', () => {
  const { dir, storePath } = createTempStorePath('agentos-eval-store-');
  try {
    const firstStore = new EvaluationStore(undefined, storePath);
    const baselineCount = firstStore.listRuns().length;
    assert.ok(baselineCount >= 2, 'seed runs should be created');

    const createdRun = firstStore.startRun({
      name: 'Persisted QA Run',
      testCaseIds: ['tc-001'],
    });
    assert.equal(createdRun.name, 'Persisted QA Run');
    assert.equal(createdRun.totalTests, 1);

    const secondStore = new EvaluationStore(undefined, storePath);
    const reloadedRuns = secondStore.listRuns();
    assert.ok(
      reloadedRuns.some((run) => run.id === createdRun.id),
      'created run should exist after reload'
    );
    assert.equal(reloadedRuns.length, baselineCount + 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('EvaluationStore exposes results for generated runs', () => {
  const { dir, storePath } = createTempStorePath('agentos-eval-results-');
  try {
    const store = new EvaluationStore(undefined, storePath);
    const run = store.startRun({ testCaseIds: ['tc-001', 'tc-002'] });

    const results = store.getRunResults(run.id);
    assert.equal(results.length, 2);
    assert.ok(results.every((result) => typeof result.score === 'number'));
    assert.ok(results.every((result) => Array.isArray(result.metrics)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
