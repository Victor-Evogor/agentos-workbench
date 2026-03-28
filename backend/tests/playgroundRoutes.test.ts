import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPlaygroundRuntimeMode,
  resolvePlaygroundRuntime,
} from '../src/routes/playground';

test('resolvePlaygroundRuntime awaits the runtime getter result', async () => {
  const runtime = {
    async *streamText() {
      yield { type: 'text_delta', text: 'hello' };
    },
  };

  const resolved = await resolvePlaygroundRuntime(async () => runtime);

  assert.equal(resolved, runtime);
});

test('resolvePlaygroundRuntime returns null when runtime loading fails', async () => {
  const resolved = await resolvePlaygroundRuntime(async () => {
    throw new Error('runtime unavailable');
  });

  assert.equal(resolved, null);
});

test('getPlaygroundRuntimeMode reports live only when the required method exists', () => {
  assert.equal(getPlaygroundRuntimeMode({ streamText() {} }, 'streamText'), 'live');
  assert.equal(getPlaygroundRuntimeMode({ generateText() {} }, 'generateText'), 'live');
  assert.equal(getPlaygroundRuntimeMode({}, 'streamText'), 'stub');
  assert.equal(getPlaygroundRuntimeMode(null, 'generateText'), 'stub');
});
