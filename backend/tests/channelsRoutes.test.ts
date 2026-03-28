import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

import Fastify from 'fastify';

import channelRoutes, { WORKBENCH_CHANNELS_MODE_HEADER } from '../src/routes/channels';

function listen(server: http.Server): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Expected an AddressInfo from webhook test server.'));
        return;
      }
      resolve(address);
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

test('channels routes expose demo state for channel management and mixed mode for webhook delivery', async () => {
  const app = Fastify();
  await app.register(channelRoutes, { prefix: '/api/channels' });

  const webhookServer = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      response.writeHead(202, { 'Content-Type': 'text/plain' });
      response.end(`received:${body}`);
    });
  });

  const webhookAddress = await listen(webhookServer);
  const webhookUrl = `http://127.0.0.1:${webhookAddress.port}/hook`;

  try {
    const statusResponse = await app.inject({
      method: 'GET',
      url: '/api/channels/status',
    });
    assert.equal(statusResponse.statusCode, 200);
    assert.equal(statusResponse.headers[WORKBENCH_CHANNELS_MODE_HEADER.toLowerCase()], 'demo');
    assert.equal(statusResponse.json().mode, 'demo');

    const connectResponse = await app.inject({
      method: 'POST',
      url: '/api/channels/twitter/connect',
      payload: {
        credentials: {
          apiKey: 'demo-key',
        },
      },
    });
    assert.equal(connectResponse.statusCode, 200);
    assert.equal(connectResponse.headers[WORKBENCH_CHANNELS_MODE_HEADER.toLowerCase()], 'demo');

    const connectPayload = connectResponse.json();
    assert.equal(connectPayload.mode, 'demo');
    assert.equal(connectPayload.status, 'connected');

    const broadcastResponse = await app.inject({
      method: 'POST',
      url: '/api/channels/broadcast',
      payload: {
        text: 'Ship the channels update.',
        channelIds: ['twitter'],
      },
    });
    assert.equal(broadcastResponse.statusCode, 200);
    assert.equal(broadcastResponse.headers[WORKBENCH_CHANNELS_MODE_HEADER.toLowerCase()], 'demo');

    const broadcastPayload = broadcastResponse.json();
    assert.equal(broadcastPayload.mode, 'demo');
    assert.equal(broadcastPayload.results.twitter, 'sent');

    const webhookResponse = await app.inject({
      method: 'POST',
      url: '/api/channels/test-webhook',
      payload: {
        url: webhookUrl,
        payload: JSON.stringify({ event: 'channel.test', ok: true }),
      },
    });
    assert.equal(webhookResponse.statusCode, 200);
    assert.equal(webhookResponse.headers[WORKBENCH_CHANNELS_MODE_HEADER.toLowerCase()], 'mixed');

    const webhookPayload = webhookResponse.json();
    assert.equal(webhookPayload.mode, 'mixed');
    assert.equal(webhookPayload.status, 202);
    assert.match(webhookPayload.body, /channel\.test/);
  } finally {
    await app.close();
    await close(webhookServer);
  }
});
