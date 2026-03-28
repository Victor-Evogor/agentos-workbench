import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import socialRoutes, { WORKBENCH_SOCIAL_MODE_HEADER } from '../src/routes/social';

test('social routes expose explicit demo mode metadata for compose, schedule, and history', async () => {
  const app = Fastify();
  await app.register(socialRoutes, { prefix: '/api/social' });

  try {
    const composeResponse = await app.inject({
      method: 'POST',
      url: '/api/social/compose',
      payload: {
        text: 'Launching the AgentOS memory update today.',
        platforms: ['twitter', 'linkedin'],
      },
    });
    assert.equal(composeResponse.statusCode, 200);
    assert.equal(composeResponse.headers[WORKBENCH_SOCIAL_MODE_HEADER.toLowerCase()], 'demo');

    const composePayload = composeResponse.json();
    assert.equal(composePayload.mode, 'demo');
    assert.equal(composePayload.ok, true);
    assert.equal(composePayload.status, 'published');

    const scheduleResponse = await app.inject({
      method: 'POST',
      url: '/api/social/schedule',
      payload: {
        text: 'Scheduling the follow-up post for tomorrow.',
        platforms: ['twitter'],
        scheduledAt: Date.now() + 60_000,
      },
    });
    assert.equal(scheduleResponse.statusCode, 200);
    assert.equal(scheduleResponse.headers[WORKBENCH_SOCIAL_MODE_HEADER.toLowerCase()], 'demo');

    const schedulePayload = scheduleResponse.json();
    assert.equal(schedulePayload.mode, 'demo');
    assert.equal(schedulePayload.ok, true);
    assert.equal(schedulePayload.status, 'scheduled');

    const postsResponse = await app.inject({
      method: 'GET',
      url: '/api/social/posts',
    });
    assert.equal(postsResponse.statusCode, 200);
    assert.equal(postsResponse.headers[WORKBENCH_SOCIAL_MODE_HEADER.toLowerCase()], 'demo');

    const postsPayload = postsResponse.json();
    assert.equal(postsPayload.mode, 'demo');
    assert.ok(Array.isArray(postsPayload.posts));
    assert.equal(typeof postsPayload.total, 'number');
    assert.ok(postsPayload.total >= 2);
  } finally {
    await app.close();
  }
});
