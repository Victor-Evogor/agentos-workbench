import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { useVoiceCallStore } from './voiceCallStore';

const originalFetch = globalThis.fetch;

afterEach(() => {
  useVoiceCallStore.setState(useVoiceCallStore.getInitialState());
  globalThis.fetch = originalFetch;
});

test('voice call store preserves backend-supplied demo mode metadata', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/api/voice/calls')) {
      return new Response(
        JSON.stringify({
          mode: 'demo',
          calls: [
            {
              id: 'call-demo-1',
              callerId: '+1 (555) 010-1111',
              startedAt: '2026-03-26T06:00:00.000Z',
              durationSeconds: 64,
              turnCount: 3,
              transcriptPreview: 'Demo call preview',
              hasRecording: false,
              sttProvider: 'deepgram',
              ttsProvider: 'openai-tts',
              providerChain: ['deepgram'],
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (url.endsWith('/api/voice/calls/call-demo-1/transcript')) {
      return new Response(
        JSON.stringify({
          mode: 'demo',
          transcript: [
            {
              speaker: 'Caller',
              text: 'Hello from the demo transcript.',
              timestamp: '2026-03-26T06:00:02.000Z',
            },
          ],
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

  await useVoiceCallStore.getState().fetchCalls();
  assert.equal(useVoiceCallStore.getState().dataMode, 'demo');
  assert.equal(useVoiceCallStore.getState().calls[0]?.id, 'call-demo-1');

  await useVoiceCallStore.getState().fetchTranscript('call-demo-1');
  assert.equal(useVoiceCallStore.getState().dataMode, 'demo');
  assert.equal(
    useVoiceCallStore.getState().activeCallTranscript[0]?.text,
    'Hello from the demo transcript.'
  );
});
