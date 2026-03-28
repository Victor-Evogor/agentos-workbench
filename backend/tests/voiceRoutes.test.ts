import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import voiceRoutes from '../src/routes/voice';

test('voice routes expose mixed status metadata and demo call history metadata', async () => {
  const app = Fastify();
  await app.register(voiceRoutes, { prefix: '/api/voice' });

  try {
    const statusResponse = await app.inject({
      method: 'GET',
      url: '/api/voice/status',
    });
    assert.equal(statusResponse.statusCode, 200);
    assert.equal(statusResponse.headers['x-agentos-workbench-mode'], 'mixed');

    const statusPayload = statusResponse.json();
    assert.equal(statusPayload.mode, 'mixed');
    assert.ok(Array.isArray(statusPayload.providers.stt));
    assert.ok(Array.isArray(statusPayload.providers.tts));
    assert.ok(Array.isArray(statusPayload.providers.telephony));
    assert.ok(Array.isArray(statusPayload.sessions));

    const callsResponse = await app.inject({
      method: 'GET',
      url: '/api/voice/calls',
    });
    assert.equal(callsResponse.statusCode, 200);
    assert.equal(callsResponse.headers['x-agentos-workbench-mode'], 'demo');

    const callsPayload = callsResponse.json();
    assert.equal(callsPayload.mode, 'demo');
    assert.ok(Array.isArray(callsPayload.calls));
    assert.ok(callsPayload.calls.length > 0);

    const transcriptResponse = await app.inject({
      method: 'GET',
      url: `/api/voice/calls/${encodeURIComponent(callsPayload.calls[0].id)}/transcript`,
    });
    assert.equal(transcriptResponse.statusCode, 200);
    assert.equal(transcriptResponse.headers['x-agentos-workbench-mode'], 'demo');

    const transcriptPayload = transcriptResponse.json();
    assert.equal(transcriptPayload.mode, 'demo');
    assert.ok(Array.isArray(transcriptPayload.transcript));
    assert.ok(transcriptPayload.transcript.length > 0);
  } finally {
    await app.close();
  }
});
