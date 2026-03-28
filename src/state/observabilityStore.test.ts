import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { useObservabilityStore } from './observabilityStore';

const originalFetch = globalThis.fetch;

afterEach(() => {
  useObservabilityStore.setState(useObservabilityStore.getInitialState());
  globalThis.fetch = originalFetch;
});

test('observability store preserves backend-supplied mode metadata', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/api/observability/summary')) {
      return new Response(
        JSON.stringify({
          mode: 'runtime',
          totalTokens: 42,
          totalCostUsd: 0.12,
          totalRequests: 3,
          avgLatencyMs: 180,
          errorRate: 0,
          p50Ms: 120,
          p95Ms: 240,
          p99Ms: 360,
          computedAt: '2026-03-26T05:00:00.000Z',
          monthlyBudgetUsd: 10,
          monthSpentUsd: 0.12,
          dailyTokens: [1, 2, 3, 4, 5, 6, 7],
          providerCosts: [],
          providerHealth: [],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (url.endsWith('/api/observability/errors')) {
      return new Response(
        JSON.stringify({
          mode: 'runtime',
          errors: [],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (url.endsWith('/api/observability/spans')) {
      return new Response(
        JSON.stringify({
          mode: 'runtime',
          spans: [],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  await useObservabilityStore.getState().fetchAll();
  assert.equal(useObservabilityStore.getState().dataMode, 'runtime');
  assert.equal(useObservabilityStore.getState().summary?.totalTokens, 42);

  await useObservabilityStore.getState().fetchErrors();
  assert.equal(useObservabilityStore.getState().dataMode, 'runtime');

  await useObservabilityStore.getState().fetchSpans();
  assert.equal(useObservabilityStore.getState().dataMode, 'runtime');
});
