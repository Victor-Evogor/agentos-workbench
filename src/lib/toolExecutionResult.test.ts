import test from 'node:test';
import assert from 'node:assert/strict';

import { unwrapToolExecutionResult } from './toolExecutionResult';

test('unwrapToolExecutionResult returns nested result payloads', () => {
  const input = {
    result: { html: '<html><title>Widget</title></html>' },
    toolId: 'generate_widget',
    mode: 'connected',
    isError: false,
  };

  assert.deepEqual(unwrapToolExecutionResult(input), {
    html: '<html><title>Widget</title></html>',
  });
});

test('unwrapToolExecutionResult leaves raw payloads unchanged', () => {
  const input = { format: 'pdf', filename: 'report.pdf' };

  assert.deepEqual(unwrapToolExecutionResult(input), input);
  assert.equal(unwrapToolExecutionResult('plain text'), 'plain text');
});
