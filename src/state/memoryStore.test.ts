import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMemoryStatsDelta,
  describeMemoryLoadedAtAriaLabel,
  describeMemoryLoadedAt,
  describeMemoryLoadedAtTitle,
  describeMemoryError,
  describeMemorySuccess,
  deriveMemoryLoadingState,
  deriveMemorySurfaceTone,
  MEMORY_FRESHNESS_WINDOW_MS,
  removeEntryFromCollections,
  resolveMemoryDataMode,
  restoreEntryInCollections,
  shouldFetchMemoryData,
  updatePendingDeleteIds,
  useMemoryStore,
} from './memoryStore';

test('resolveMemoryDataMode prefers explicit backend mode over connected fallback', () => {
  assert.equal(resolveMemoryDataMode('runtime', false), 'runtime');
  assert.equal(resolveMemoryDataMode('demo', true), 'demo');
});

test('resolveMemoryDataMode falls back to connected when backend mode is absent', () => {
  assert.equal(resolveMemoryDataMode(undefined, true), 'runtime');
  assert.equal(resolveMemoryDataMode(undefined, false), 'demo');
  assert.equal(resolveMemoryDataMode(undefined, null), null);
});

test('deriveMemorySurfaceTone returns neutral when no connectivity signals have loaded', () => {
  assert.equal(deriveMemorySurfaceTone([null, undefined]), 'neutral');
});

test('deriveMemorySurfaceTone returns runtime when all known signals are live', () => {
  assert.equal(deriveMemorySurfaceTone([true, true, null]), 'runtime');
});

test('deriveMemorySurfaceTone returns demo when all known signals are fallback-backed', () => {
  assert.equal(deriveMemorySurfaceTone([false, null, false]), 'demo');
});

test('deriveMemorySurfaceTone returns mixed when live and fallback signals are both present', () => {
  assert.equal(deriveMemorySurfaceTone([true, false, null]), 'mixed');
});

test('deriveMemorySurfaceTone respects explicit mode values', () => {
  assert.equal(deriveMemorySurfaceTone(['runtime', 'runtime', null]), 'runtime');
  assert.equal(deriveMemorySurfaceTone(['runtime', 'demo', null]), 'mixed');
  assert.equal(deriveMemorySurfaceTone(['local', null]), 'local');
});

test('deriveMemoryLoadingState reports true when any request is in flight', () => {
  assert.equal(deriveMemoryLoadingState({ statsLoading: false, workingLoading: false }), false);
  assert.equal(deriveMemoryLoadingState({ timelineLoading: true }), true);
  assert.equal(deriveMemoryLoadingState({ entriesLoading: false, workingLoading: true }), true);
});

test('shouldFetchMemoryData skips recent automatic reloads but allows force refresh', () => {
  const now = Date.now();
  assert.equal(
    shouldFetchMemoryData({
      lastLoadedAt: now - (MEMORY_FRESHNESS_WINDOW_MS - 1000),
      loading: false,
    }),
    false
  );
  assert.equal(
    shouldFetchMemoryData({
      lastLoadedAt: now - (MEMORY_FRESHNESS_WINDOW_MS - 1000),
      loading: false,
      force: true,
    }),
    true
  );
});

test('shouldFetchMemoryData skips concurrent loads and allows stale data reloads', () => {
  assert.equal(shouldFetchMemoryData({ lastLoadedAt: null, loading: true }), false);
  assert.equal(
    shouldFetchMemoryData({
      lastLoadedAt: Date.now() - (MEMORY_FRESHNESS_WINDOW_MS + 1000),
      loading: false,
    }),
    true
  );
});

test('describeMemoryLoadedAt formats missing, recent, and older timestamps', () => {
  assert.equal(describeMemoryLoadedAt(null), 'Not loaded yet');
  assert.equal(describeMemoryLoadedAt(Date.now() - 2000), 'Updated just now');
  assert.equal(describeMemoryLoadedAt(Date.now() - 65_000), 'Updated 1 min ago');
  assert.equal(describeMemoryLoadedAt(Date.now() - 3_600_000), 'Updated 1h ago');
});

test('describeMemoryLoadedAtTitle formats exact timestamps for hover copy', () => {
  assert.equal(describeMemoryLoadedAtTitle(null), 'Load time unavailable');
  assert.equal(
    describeMemoryLoadedAtTitle(Date.UTC(2026, 2, 26, 12, 34, 56)),
    'Loaded at 2026-03-26T12:34:56.000Z'
  );
});

test('describeMemoryLoadedAtAriaLabel combines relative and exact load timing', () => {
  const timestamp = Date.UTC(2026, 2, 26, 12, 34, 56);
  const originalNow = Date.now;
  Date.now = () => timestamp;
  try {
    assert.equal(
      describeMemoryLoadedAtAriaLabel(timestamp),
      'Last updated status. Updated just now. Loaded at 2026-03-26T12:34:56.000Z.'
    );
  } finally {
    Date.now = originalNow;
  }
});

test('updatePendingDeleteIds adds and removes ids without duplicating them', () => {
  const added = updatePendingDeleteIds([], 'ep-1', true);
  assert.deepEqual(added, ['ep-1']);
  assert.deepEqual(updatePendingDeleteIds(added, 'ep-1', true), ['ep-1']);
  assert.deepEqual(updatePendingDeleteIds(added, 'ep-1', false), []);
});

test('removeEntryFromCollections returns the removed entry snapshot and filtered entries', () => {
  const result = removeEntryFromCollections(
    {
      episodic: [
        {
          id: 'ep-1',
          content: 'one',
          confidence: 1,
          timestamp: 1,
          source: 'conversation',
          tags: [],
        },
        {
          id: 'ep-2',
          content: 'two',
          confidence: 1,
          timestamp: 2,
          source: 'conversation',
          tags: [],
        },
      ],
      semantic: [],
    },
    'ep-1'
  );

  assert.equal(result.entries.episodic.length, 1);
  assert.equal(result.entries.episodic[0].id, 'ep-2');
  assert.deepEqual(result.removed, {
    category: 'episodic',
    index: 0,
    entry: {
      id: 'ep-1',
      content: 'one',
      confidence: 1,
      timestamp: 1,
      source: 'conversation',
      tags: [],
    },
  });
});

test('restoreEntryInCollections reinserts a removed entry at its original position', () => {
  const restored = restoreEntryInCollections(
    {
      episodic: [
        {
          id: 'ep-2',
          content: 'two',
          confidence: 1,
          timestamp: 2,
          source: 'conversation',
          tags: [],
        },
      ],
    },
    {
      category: 'episodic',
      index: 0,
      entry: {
        id: 'ep-1',
        content: 'one',
        confidence: 1,
        timestamp: 1,
        source: 'conversation',
        tags: [],
      },
    }
  );

  assert.deepEqual(
    restored.episodic.map((entry) => entry.id),
    ['ep-1', 'ep-2']
  );
});

test('applyMemoryStatsDelta adjusts the matching long-term count only', () => {
  const stats = {
    mode: 'runtime' as const,
    connected: true,
    episodic: { count: 3, newest: 100 },
    semantic: { count: 2 },
    procedural: { count: 1 },
    working: { tokens: 10, maxTokens: 100 },
  };

  const next = applyMemoryStatsDelta(
    stats,
    {
      category: 'semantic',
      index: 0,
      entry: { id: 'sem-1', content: 'fact', confidence: 1, timestamp: 1, source: 'rag', tags: [] },
    },
    -1
  );

  assert.equal(next?.episodic.count, 3);
  assert.equal(next?.semantic.count, 1);
  assert.equal(next?.procedural.count, 1);
});

test('clearError resets the visible memory error state', () => {
  useMemoryStore.setState({
    error: 'Delete failed.',
    errorState: { kind: 'delete-entry', message: 'Delete failed.', entryId: 'ep-1' },
  });
  useMemoryStore.getState().clearError();
  assert.equal(useMemoryStore.getState().error, null);
  assert.equal(useMemoryStore.getState().errorState, null);
});

test('clearSuccessNotice resets the visible memory success state', () => {
  useMemoryStore.setState({
    successNotice: 'Deleted memory entry ep-1.',
    successState: {
      kind: 'delete-entry',
      message: 'Deleted memory entry ep-1.',
      entryId: 'ep-1',
    },
  });
  useMemoryStore.getState().clearSuccessNotice();
  assert.equal(useMemoryStore.getState().successNotice, null);
  assert.equal(useMemoryStore.getState().successState, null);
});

test('describeMemoryError formats delete failures with the entry id', () => {
  assert.deepEqual(
    describeMemoryError({
      kind: 'delete-entry',
      entryId: 'ep-42',
      message: 'Memory entry not found',
    }),
    {
      title: 'Delete Failed: ep-42',
      detail: 'Memory entry not found',
    }
  );
});

test('describeMemoryError formats fetch failures by source', () => {
  assert.deepEqual(
    describeMemoryError({
      kind: 'fetch-timeline',
      message: 'Request timed out',
    }),
    {
      title: 'Timeline Load Failed',
      detail: 'Request timed out',
    }
  );
});

test('describeMemorySuccess formats delete completions with the entry id', () => {
  assert.deepEqual(
    describeMemorySuccess({
      kind: 'delete-entry',
      entryId: 'ep-42',
      message: 'Deleted memory entry ep-42.',
    }),
    {
      title: 'Delete Complete: ep-42',
      detail: 'Deleted memory entry ep-42.',
    }
  );
});
