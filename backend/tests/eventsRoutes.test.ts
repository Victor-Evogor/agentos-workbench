import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import eventsRoutes, { eventBroadcaster } from '../src/routes/events';

test('events emit route preserves explicit source metadata in broadcast payloads', async () => {
  const app = Fastify();
  await app.register(eventsRoutes, { prefix: '/api' });

  const writes: string[] = [];
  const removeClient = eventBroadcaster.addClient('test-client', {
    raw: {
      write(chunk: string) {
        writes.push(String(chunk));
      },
    },
  } as any);

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/events/emit',
      payload: {
        event: 'channel:message',
        data: {
          channel: 'slack',
          text: 'Synthetic contract coverage event',
        },
        sourceMode: 'demo',
        synthetic: true,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['x-agentos-workbench-mode'], 'mixed');

    const payload = response.json();
    assert.equal(payload.mode, 'mixed');
    assert.equal(payload.ok, true);
    assert.ok(payload.clients >= 1);

    assert.ok(writes.length > 0);
    const rawFrame = writes[writes.length - 1] ?? '';
    assert.ok(rawFrame.startsWith('data: '));

    const envelope = JSON.parse(rawFrame.slice('data: '.length).trim()) as {
      event: string;
      data: Record<string, unknown>;
    };
    assert.equal(envelope.event, 'channel:message');
    assert.equal(envelope.data.channel, 'slack');
    assert.equal(envelope.data.sourceMode, 'demo');
    assert.equal(envelope.data.synthetic, true);
  } finally {
    removeClient();
    await app.close();
  }
});
