import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import ragRoutes, { WORKBENCH_RAG_MODE_HEADER } from '../src/routes/rag';

test('rag routes expose explicit demo mode metadata for list and search responses', async () => {
  const app = Fastify();
  await app.register(ragRoutes, { prefix: '/api/rag' });

  try {
    const documentsResponse = await app.inject({
      method: 'GET',
      url: '/api/rag/documents',
    });
    assert.equal(documentsResponse.statusCode, 200);
    assert.equal(documentsResponse.headers[WORKBENCH_RAG_MODE_HEADER.toLowerCase()], 'demo');

    const documentsPayload = documentsResponse.json();
    assert.equal(documentsPayload.mode, 'demo');
    assert.ok(Array.isArray(documentsPayload.documents));
    assert.ok(Array.isArray(documentsPayload.collections));
    assert.ok(documentsPayload.documents.length > 0);
    assert.ok(documentsPayload.collections.length > 0);
    assert.ok(
      documentsPayload.documents.every((document: { mode?: string }) => document.mode === 'demo')
    );
    assert.ok(
      documentsPayload.collections.every(
        (collection: { mode?: string }) => collection.mode === 'demo'
      )
    );

    const searchResponse = await app.inject({
      method: 'POST',
      url: '/api/rag/search',
      payload: {
        query: 'voice pipeline',
        rerank: true,
      },
    });
    assert.equal(searchResponse.statusCode, 200);
    assert.equal(searchResponse.headers[WORKBENCH_RAG_MODE_HEADER.toLowerCase()], 'demo');

    const searchPayload = searchResponse.json();
    assert.equal(searchPayload.mode, 'demo');
    assert.ok(Array.isArray(searchPayload.results));
    assert.ok(searchPayload.results.length > 0);
    assert.ok(searchPayload.results.every((result: { mode?: string }) => result.mode === 'demo'));
  } finally {
    await app.close();
  }
});

test('rag upload, collection, chunk, and delete routes preserve explicit demo mode metadata', async () => {
  const app = Fastify();
  await app.register(ragRoutes, { prefix: '/api/rag' });

  let collectionId: string | null = null;
  let documentId: string | null = null;

  try {
    const createCollectionResponse = await app.inject({
      method: 'POST',
      url: '/api/rag/collections',
      payload: {
        name: 'Contract Coverage Collection',
      },
    });
    assert.equal(createCollectionResponse.statusCode, 200);
    assert.equal(createCollectionResponse.headers[WORKBENCH_RAG_MODE_HEADER.toLowerCase()], 'demo');

    const createCollectionPayload = createCollectionResponse.json();
    assert.equal(createCollectionPayload.mode, 'demo');
    assert.equal(createCollectionPayload.collection.mode, 'demo');
    collectionId = createCollectionPayload.collection.id;

    const uploadResponse = await app.inject({
      method: 'POST',
      url: '/api/rag/upload',
      payload: {
        name: 'Contract-Coverage.md',
        sizeBytes: 2048,
        contentType: 'text/markdown',
        collectionId,
      },
    });
    assert.equal(uploadResponse.statusCode, 200);
    assert.equal(uploadResponse.headers[WORKBENCH_RAG_MODE_HEADER.toLowerCase()], 'demo');

    const uploadPayload = uploadResponse.json();
    assert.equal(uploadPayload.mode, 'demo');
    assert.equal(uploadPayload.document.mode, 'demo');
    documentId = uploadPayload.document.id;
    assert.deepEqual(uploadPayload.document.collectionIds, [collectionId]);

    const chunksResponse = await app.inject({
      method: 'GET',
      url: `/api/rag/documents/${encodeURIComponent(documentId)}/chunks`,
    });
    assert.equal(chunksResponse.statusCode, 200);
    assert.equal(chunksResponse.headers[WORKBENCH_RAG_MODE_HEADER.toLowerCase()], 'demo');

    const chunksPayload = chunksResponse.json();
    assert.equal(chunksPayload.mode, 'demo');
    assert.ok(Array.isArray(chunksPayload.chunks));
    assert.ok(chunksPayload.chunks.length > 0);

    const deleteDocumentResponse = await app.inject({
      method: 'DELETE',
      url: `/api/rag/documents/${encodeURIComponent(documentId)}`,
    });
    assert.equal(deleteDocumentResponse.statusCode, 200);
    assert.equal(deleteDocumentResponse.headers[WORKBENCH_RAG_MODE_HEADER.toLowerCase()], 'demo');
    assert.equal(deleteDocumentResponse.json().mode, 'demo');
    documentId = null;

    const deleteCollectionResponse = await app.inject({
      method: 'DELETE',
      url: `/api/rag/collections/${encodeURIComponent(collectionId)}`,
    });
    assert.equal(deleteCollectionResponse.statusCode, 200);
    assert.equal(deleteCollectionResponse.headers[WORKBENCH_RAG_MODE_HEADER.toLowerCase()], 'demo');
    assert.equal(deleteCollectionResponse.json().mode, 'demo');
    collectionId = null;
  } finally {
    if (documentId) {
      await app.inject({
        method: 'DELETE',
        url: `/api/rag/documents/${encodeURIComponent(documentId)}`,
      });
    }

    if (collectionId) {
      await app.inject({
        method: 'DELETE',
        url: `/api/rag/collections/${encodeURIComponent(collectionId)}`,
      });
    }

    await app.close();
  }
});
