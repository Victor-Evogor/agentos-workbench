import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import marketplaceRoutes, { WORKBENCH_MARKETPLACE_MODE_HEADER } from '../src/routes/marketplace';

test('marketplace routes expose explicit demo mode metadata and return installable items in a consistent envelope', async () => {
  const app = Fastify();
  await app.register(marketplaceRoutes, { prefix: '/api/marketplace' });

  try {
    const searchResponse = await app.inject({
      method: 'GET',
      url: '/api/marketplace/search?query=Creative&type=agent&category=productivity',
    });
    assert.equal(searchResponse.statusCode, 200);
    assert.equal(searchResponse.headers[WORKBENCH_MARKETPLACE_MODE_HEADER.toLowerCase()], 'demo');

    const searchPayload = searchResponse.json();
    assert.equal(searchPayload.mode, 'demo');
    assert.ok(Array.isArray(searchPayload.items));
    assert.ok(searchPayload.items.length > 0);
    assert.equal(searchPayload.items[0].type, 'agent');

    const installResponse = await app.inject({
      method: 'POST',
      url: '/api/marketplace/install',
      payload: {
        itemId: searchPayload.items[0].id,
      },
    });
    assert.equal(installResponse.statusCode, 200);
    assert.equal(installResponse.headers[WORKBENCH_MARKETPLACE_MODE_HEADER.toLowerCase()], 'demo');

    const installPayload = installResponse.json();
    assert.equal(installPayload.mode, 'demo');
    assert.equal(installPayload.success, true);
    assert.ok(installPayload.installation.installationId);
    assert.equal(installPayload.installation.item.id, searchPayload.items[0].id);

    const installedResponse = await app.inject({
      method: 'GET',
      url: '/api/marketplace/installed',
    });
    assert.equal(installedResponse.statusCode, 200);
    assert.equal(
      installedResponse.headers[WORKBENCH_MARKETPLACE_MODE_HEADER.toLowerCase()],
      'demo'
    );

    const installedPayload = installedResponse.json();
    assert.equal(installedPayload.mode, 'demo');
    assert.ok(Array.isArray(installedPayload.items));
    assert.ok(installedPayload.items.length > 0);
    assert.equal(installedPayload.items[0].item.id, searchPayload.items[0].id);

    const uninstallResponse = await app.inject({
      method: 'DELETE',
      url: `/api/marketplace/uninstall/${encodeURIComponent(
        installPayload.installation.installationId
      )}`,
    });
    assert.equal(uninstallResponse.statusCode, 200);
    assert.equal(
      uninstallResponse.headers[WORKBENCH_MARKETPLACE_MODE_HEADER.toLowerCase()],
      'demo'
    );

    const uninstallPayload = uninstallResponse.json();
    assert.equal(uninstallPayload.mode, 'demo');
    assert.equal(uninstallPayload.success, true);
  } finally {
    await app.close();
  }
});
