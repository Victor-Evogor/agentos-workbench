import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { useForgeStore } from './forgeStore';

afterEach(() => {
  useForgeStore.setState(useForgeStore.getInitialState());
});

test('forge store preserves backend-supplied mode metadata when applying backend tools', () => {
  useForgeStore.getState().applyBackendTools(
    [
      {
        id: 'forge-demo',
        name: 'Demo Tool',
        description: 'A demo-forged tool.',
        tier: 'session',
        callCount: 0,
        successRate: 100,
        avgLatencyMs: 0,
        createdAt: Date.now(),
      },
    ],
    'demo'
  );

  const state = useForgeStore.getState();
  assert.equal(state.dataMode, 'demo');
  assert.equal(state.tools.length, 1);
  assert.equal(state.tools[0]?.name, 'Demo Tool');
});
