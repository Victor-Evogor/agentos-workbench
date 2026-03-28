import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import discoveryRoutes, { WORKBENCH_DISCOVERY_MODE_HEADER } from '../src/routes/discovery';

test('discovery routes expose explicit mixed mode metadata for capability search results', async () => {
  const app = Fastify();
  await app.register(discoveryRoutes, { prefix: '/api/agency' });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/agency/capabilities?limit=10',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers[WORKBENCH_DISCOVERY_MODE_HEADER.toLowerCase()], 'mixed');

    const payload = response.json();
    assert.equal(payload.mode, 'mixed');
    assert.ok(Array.isArray(payload.capabilities));
    assert.equal(typeof payload.total, 'number');
  } finally {
    await app.close();
  }
});
