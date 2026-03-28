import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useRagDocStore } from './ragDocStore';

const originalFetch = globalThis.fetch;

afterEach(() => {
  useRagDocStore.setState(useRagDocStore.getInitialState());
  globalThis.fetch = originalFetch;
});

test('previewRuntimeResultChunk opens a runtime preview in the chunk viewer', () => {
  useRagDocStore.getState().previewRuntimeResultChunk({
    documentId: 'runtime-doc-1',
    documentName: 'Runtime Preview Doc',
    chunkIndex: 7,
    text: 'Preview chunk body for a runtime-only result.',
    sourceLabel: 'runtime-source-a',
  });

  const state = useRagDocStore.getState();
  assert.equal(state.activeSubTab, 'chunks');
  assert.equal(state.selectedDocId, 'runtime-doc-1');
  assert.equal(state.selectedDocMode, 'runtime');
  assert.equal(state.selectedDocNameOverride, 'Runtime Preview Doc');
  assert.equal(state.selectedDocPreviewMode, 'runtime-result-preview');
  assert.equal(state.selectedDocPreviewSourceLabel, 'runtime-source-a');
  assert.equal(state.selectedDocPreviewCheckedAt, null);
  assert.equal(state.highlightedChunkIndex, 7);
  assert.equal(state.highlightedChunkPreviewKey, 'preview-runtime-doc-1-0');
  assert.equal(state.chunkViewOrigin, 'runtime-result');
  assert.equal(state.selectedDocChunks.length, 1);
  assert.equal(state.selectedDocChunks[0]?.index, 7);
  assert.equal(state.selectedDocChunks[0]?.displayLabel, 'chunk 7');
  assert.equal(state.selectedDocChunks[0]?.text, 'Preview chunk body for a runtime-only result.');
  assert.ok((state.selectedDocChunks[0]?.tokenCount ?? 0) > 0);
});

test('previewRuntimeResultChunk can group multiple runtime hits for the same unmirrored document', () => {
  useRagDocStore.getState().previewRuntimeResultChunk({
    documentId: 'runtime-doc-grouped',
    documentName: 'Grouped Runtime Preview',
    chunkId: 'hit-b',
    chunkIndex: 0,
    text: 'Focused grouped preview chunk.',
    sourceLabel: 'runtime-source-grouped',
    chunks: [
      {
        chunkId: 'hit-a',
        chunkIndex: 0,
        text: 'First grouped preview chunk.',
      },
      {
        chunkId: 'hit-b',
        chunkIndex: 0,
        text: 'Focused grouped preview chunk.',
      },
      {
        chunkId: 'hit-c',
        chunkIndex: 5,
        text: 'Third grouped preview chunk.',
      },
    ],
  });

  const state = useRagDocStore.getState();
  assert.equal(state.selectedDocId, 'runtime-doc-grouped');
  assert.equal(state.selectedDocPreviewMode, 'runtime-result-preview');
  assert.equal(state.selectedDocChunks.length, 3);
  assert.equal(state.highlightedChunkIndex, 0);
  assert.equal(state.highlightedChunkPreviewKey, 'hit-b');
  assert.equal(state.selectedDocChunks[0]?.previewKey, 'hit-b');
  assert.equal(state.selectedDocChunks[0]?.displayLabel, 'chunk 0 (match 1)');
  assert.equal(state.selectedDocChunks[1]?.previewKey, 'hit-a');
  assert.equal(state.selectedDocChunks[1]?.displayLabel, 'chunk 0 (match 2)');
  assert.equal(state.selectedDocChunks[2]?.displayLabel, 'chunk 5');
});

test('setActiveSubTab preserves active chunk preview context', () => {
  useRagDocStore.getState().previewRuntimeResultChunk({
    documentId: 'runtime-doc-1',
    documentName: 'Runtime Preview Doc',
    chunkIndex: 3,
    text: 'Sticky preview chunk.',
    sourceLabel: 'runtime-source-b',
  });

  useRagDocStore.getState().setActiveSubTab('search');

  const state = useRagDocStore.getState();
  assert.equal(state.activeSubTab, 'search');
  assert.equal(state.selectedDocId, 'runtime-doc-1');
  assert.equal(state.selectedDocPreviewMode, 'runtime-result-preview');
  assert.equal(state.highlightedChunkIndex, 3);
  assert.equal(state.chunkViewOrigin, 'runtime-result');
  assert.equal(state.selectedDocChunks[0]?.text, 'Sticky preview chunk.');
});

test('refreshRuntimeDocumentMirror merges a mirrored runtime document into local state', async () => {
  useRagDocStore.setState((state) => ({
    collections: [
      ...state.collections,
      {
        id: 'runtime-col-1',
        name: 'Runtime Ops',
        documentIds: [],
        createdAt: '2026-03-26T00:00:00.000Z',
        mode: 'runtime',
      },
    ],
  }));

  useRagDocStore.getState().previewRuntimeResultChunk({
    documentId: 'runtime-doc-1',
    documentName: 'Runtime Preview Doc',
    chunkIndex: 1,
    text: 'Preview chunk body for a runtime-only result.',
    sourceLabel: 'runtime-source-a',
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.match(url, /\/api\/agentos\/rag\/documents\/runtime-doc-1\/mirror-status$/);
    return new Response(
      JSON.stringify({
        success: true,
        documentId: 'runtime-doc-1',
        mirrored: true,
        checkedAt: '2026-03-26T01:23:45.000Z',
        sourceLabel: 'runtime-source-a',
        document: {
          id: 'runtime-doc-1',
          name: 'Runtime Mirrored Doc',
          type: 'text',
          chunkCount: 4,
          indexedAt: '2026-03-26T01:20:00.000Z',
          sizeBytes: 1280,
          collectionIds: ['runtime-col-1'],
          dataSourceId: 'runtime-source-a',
          mode: 'runtime',
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }) as typeof fetch;

  const mirrored = await useRagDocStore.getState().refreshRuntimeDocumentMirror('runtime-doc-1');

  assert.equal(mirrored, true);
  const state = useRagDocStore.getState();
  const mirroredDoc = state.documents.find((document) => document.id === 'runtime-doc-1');
  const mirroredCollection = state.collections.find(
    (collection) => collection.id === 'runtime-col-1'
  );
  assert.ok(mirroredDoc);
  assert.equal(mirroredDoc?.mode, 'runtime');
  assert.equal(mirroredDoc?.name, 'Runtime Mirrored Doc');
  assert.deepEqual(mirroredDoc?.collectionIds, ['runtime-col-1']);
  assert.equal(state.selectedDocPreviewCheckedAt, '2026-03-26T01:23:45.000Z');
  assert.ok(mirroredCollection);
  assert.deepEqual(mirroredCollection?.documentIds, ['runtime-doc-1']);
});

test('refreshRuntimeDocumentMirror records a targeted check even when the runtime doc is still unmirrored', async () => {
  useRagDocStore.getState().previewRuntimeResultChunk({
    documentId: 'runtime-doc-unmirrored',
    documentName: 'Runtime Preview Doc',
    chunkIndex: 2,
    text: 'Preview chunk body for an unmirrored runtime result.',
    sourceLabel: null,
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.match(url, /\/api\/agentos\/rag\/documents\/runtime-doc-unmirrored\/mirror-status$/);
    return new Response(
      JSON.stringify({
        success: true,
        documentId: 'runtime-doc-unmirrored',
        mirrored: false,
        checkedAt: '2026-03-26T02:34:56.000Z',
        sourceLabel: 'runtime-source-b',
        document: null,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }) as typeof fetch;

  const mirrored = await useRagDocStore
    .getState()
    .refreshRuntimeDocumentMirror('runtime-doc-unmirrored');

  assert.equal(mirrored, false);
  const state = useRagDocStore.getState();
  assert.equal(state.selectedDocId, 'runtime-doc-unmirrored');
  assert.equal(state.selectedDocPreviewMode, 'runtime-result-preview');
  assert.equal(state.selectedDocPreviewCheckedAt, '2026-03-26T02:34:56.000Z');
  assert.equal(state.selectedDocPreviewSourceLabel, 'runtime-source-b');
  assert.equal(state.highlightedChunkPreviewKey, 'preview-runtime-doc-unmirrored-0');
  assert.equal(
    state.documents.some((document) => document.id === 'runtime-doc-unmirrored'),
    false
  );
});

test('fetchDocuments preserves backend-supplied mode metadata instead of forcing demo mode', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/api/rag/documents')) {
      return new Response(
        JSON.stringify({
          mode: 'demo',
          documents: [
            {
              id: 'doc-backend-runtime',
              name: 'Backend Runtime Mirror',
              type: 'markdown',
              chunkCount: 2,
              indexedAt: '2026-03-26T03:00:00.000Z',
              sizeBytes: 2048,
              collectionIds: ['col-backend-runtime'],
              mode: 'runtime',
            },
          ],
          collections: [
            {
              id: 'col-backend-runtime',
              name: 'Backend Runtime Collection',
              documentIds: ['doc-backend-runtime'],
              createdAt: '2026-03-26T02:59:00.000Z',
              mode: 'runtime',
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

  await useRagDocStore.getState().fetchDocuments();

  const state = useRagDocStore.getState();
  const backendDocument = state.documents.find((document) => document.id === 'doc-backend-runtime');
  const backendCollection = state.collections.find(
    (collection) => collection.id === 'col-backend-runtime'
  );

  assert.ok(backendDocument);
  assert.equal(backendDocument?.mode, 'runtime');
  assert.ok(backendCollection);
  assert.equal(backendCollection?.mode, 'runtime');
});
