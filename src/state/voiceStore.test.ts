import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { useVoiceStore } from './voiceStore';

const originalFetch = globalThis.fetch;

afterEach(() => {
  useVoiceStore.setState(useVoiceStore.getInitialState());
  globalThis.fetch = originalFetch;
});

test('voice store preserves backend-supplied mixed status mode', async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        mode: 'mixed',
        providers: {
          stt: [{ id: 'deepgram', name: 'Deepgram', configured: true, envVar: 'DEEPGRAM_API_KEY' }],
          tts: [
            { id: 'openai-tts', name: 'OpenAI TTS', configured: true, envVar: 'OPENAI_API_KEY' },
          ],
          telephony: [
            { id: 'twilio', name: 'Twilio', configured: false, envVar: 'TWILIO_ACCOUNT_SID' },
          ],
        },
        sessions: [],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )) as typeof fetch;

  await useVoiceStore.getState().fetchStatus();

  const state = useVoiceStore.getState();
  assert.equal(state.dataMode, 'mixed');
  assert.equal(
    state.providers.stt.find((provider) => provider.id === 'deepgram')?.configured,
    true
  );
  assert.equal(
    state.providers.tts.find((provider) => provider.id === 'openai-tts')?.configured,
    true
  );
});
