import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import observabilityRoutes, {
  WORKBENCH_OBSERVABILITY_MODE_HEADER,
} from '../src/routes/observability';

test('observability routes expose explicit demo mode metadata', async () => {
  const app = Fastify();
  await app.register(observabilityRoutes, { prefix: '/api/observability' });

  try {
    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/api/observability/summary',
    });
    assert.equal(summaryResponse.statusCode, 200);
    assert.equal(
      summaryResponse.headers[WORKBENCH_OBSERVABILITY_MODE_HEADER.toLowerCase()],
      'demo'
    );

    const summaryPayload = summaryResponse.json();
    assert.equal(summaryPayload.mode, 'demo');
    assert.equal(typeof summaryPayload.totalTokens, 'number');
    assert.ok(Array.isArray(summaryPayload.providerCosts));
    assert.ok(Array.isArray(summaryPayload.providerHealth));

    const errorsResponse = await app.inject({
      method: 'GET',
      url: '/api/observability/errors',
    });
    assert.equal(errorsResponse.statusCode, 200);
    assert.equal(errorsResponse.headers[WORKBENCH_OBSERVABILITY_MODE_HEADER.toLowerCase()], 'demo');

    const errorsPayload = errorsResponse.json();
    assert.equal(errorsPayload.mode, 'demo');
    assert.ok(Array.isArray(errorsPayload.errors));

    const spansResponse = await app.inject({
      method: 'GET',
      url: '/api/observability/spans',
    });
    assert.equal(spansResponse.statusCode, 200);
    assert.equal(spansResponse.headers[WORKBENCH_OBSERVABILITY_MODE_HEADER.toLowerCase()], 'demo');

    const spansPayload = spansResponse.json();
    assert.equal(spansPayload.mode, 'demo');
    assert.ok(Array.isArray(spansPayload.spans));
  } finally {
    await app.close();
  }
});
