import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import memoryRoutes, {
  WORKBENCH_MEMORY_MODE_HEADER,
  deleteMemoryEntryById,
} from '../src/routes/memory';

test('memory routes expose explicit demo mode metadata when runtime memory is unavailable', async () => {
  const app = Fastify();
  await app.register(memoryRoutes, {
    prefix: '/api',
    runtimeGetter: async () => null,
  });

  try {
    const statsResponse = await app.inject({
      method: 'GET',
      url: '/api/memory/stats',
    });
    assert.equal(statsResponse.statusCode, 200);
    assert.equal(statsResponse.headers[WORKBENCH_MEMORY_MODE_HEADER.toLowerCase()], 'demo');
    assert.equal(statsResponse.json().mode, 'demo');

    const timelineResponse = await app.inject({
      method: 'GET',
      url: '/api/memory/timeline',
    });
    assert.equal(timelineResponse.statusCode, 200);
    assert.equal(timelineResponse.headers[WORKBENCH_MEMORY_MODE_HEADER.toLowerCase()], 'demo');
    assert.equal(timelineResponse.json().mode, 'demo');

    const entriesResponse = await app.inject({
      method: 'GET',
      url: '/api/memory/entries',
    });
    assert.equal(entriesResponse.statusCode, 200);
    assert.equal(entriesResponse.headers[WORKBENCH_MEMORY_MODE_HEADER.toLowerCase()], 'demo');
    assert.equal(entriesResponse.json().mode, 'demo');

    const workingResponse = await app.inject({
      method: 'GET',
      url: '/api/memory/working',
    });
    assert.equal(workingResponse.statusCode, 200);
    assert.equal(workingResponse.headers[WORKBENCH_MEMORY_MODE_HEADER.toLowerCase()], 'demo');
    assert.equal(workingResponse.json().mode, 'demo');

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/api/memory/entries/not-a-real-memory-id',
    });
    assert.equal(deleteResponse.statusCode, 404);
    assert.equal(deleteResponse.headers[WORKBENCH_MEMORY_MODE_HEADER.toLowerCase()], 'demo');
    assert.equal(deleteResponse.json().mode, 'demo');
  } finally {
    await app.close();
  }
});

test('deleteMemoryEntryById does not fall through to demo deletion when a live runtime is present', async () => {
  const demoStore = {
    episodic: [{ id: 'ep-1' }],
    semantic: [],
    procedural: [],
  };

  let softDeletedId: string | null = null;
  const runtime = {
    liveManagers: [
      {
        manager: {
          getStore: () => ({
            getTrace: () => undefined,
            softDelete: (id: string) => {
              softDeletedId = id;
            },
          }),
        },
      },
    ],
  };

  const result = await deleteMemoryEntryById('ep-1', runtime, demoStore);

  assert.deepEqual(result, {
    ok: false,
    mode: 'runtime',
    error: 'Memory entry not found',
  });
  assert.equal(softDeletedId, null);
  assert.equal(demoStore.episodic.length, 1);
  assert.equal(demoStore.episodic[0].id, 'ep-1');
});

test('memory delete route reports runtime mode on a live miss instead of deleting demo state', async () => {
  const app = Fastify();
  await app.register(memoryRoutes, {
    prefix: '/api',
    runtimeGetter: async () => ({
      conversations: [],
      liveManagers: [
        {
          gmiId: 'gmi-1',
          sessionIds: [],
          manager: {
            getStore: () => ({
              getTrace: () => undefined,
              softDelete: () => {
                throw new Error('softDelete should not be called on a live miss');
              },
            }),
          },
        },
      ],
    }),
  });

  try {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/memory/entries/ep-1',
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.headers[WORKBENCH_MEMORY_MODE_HEADER.toLowerCase()], 'runtime');
    assert.equal(response.json().mode, 'runtime');
    assert.equal(response.json().error, 'Memory entry not found');
  } finally {
    await app.close();
  }
});
