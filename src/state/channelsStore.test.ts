import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { useChannelsStore } from './channelsStore';

afterEach(() => {
  useChannelsStore.setState(useChannelsStore.getInitialState());
});

test('channels store preserves backend-supplied mode metadata when applying a snapshot', () => {
  const [firstChannel] = useChannelsStore.getState().channels;

  useChannelsStore.getState().applyBackendSnapshot(
    [
      {
        ...firstChannel,
        status: 'connected',
      },
    ],
    'mixed'
  );

  const state = useChannelsStore.getState();
  assert.equal(state.dataMode, 'mixed');
  assert.equal(state.channels.length, 1);
  assert.equal(state.channels[0]?.status, 'connected');
});
