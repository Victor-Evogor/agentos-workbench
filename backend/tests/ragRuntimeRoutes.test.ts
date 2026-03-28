import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID } from '../src/lib/workbenchRuntimeRag';

test('runtime rag mirror-status route reports missing and mirrored document state', async () => {
  const { runtimeRagDocumentStore } = await import('../src/services/runtimeRagDocumentStore');
  const { default: ragRuntimeRoutes } = await import('../src/routes/ragRuntime');
  const app = Fastify();
  await app.register(ragRuntimeRoutes, { prefix: '/api/agentos' });

  const documentId = `runtime-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const missingDocumentId = `${documentId}-missing`;
  const collection = runtimeRagDocumentStore.createCollection(`Mirror Status ${documentId}`);

  runtimeRagDocumentStore.upsertDocument({
    id: documentId,
    name: 'Mirror Status Note.md',
    content: 'AgentOS workbench runtime mirror status content for contract coverage.',
    dataSourceId: WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID,
    type: 'markdown',
  });
  runtimeRagDocumentStore.assignDocumentToCollection(documentId, collection.id);

  try {
    const missingResponse = await app.inject({
      method: 'GET',
      url: `/api/agentos/rag/documents/${encodeURIComponent(missingDocumentId)}/mirror-status`,
    });
    assert.equal(missingResponse.statusCode, 200);
    const missingPayload = missingResponse.json();
    assert.equal(missingPayload.success, true);
    assert.equal(missingPayload.documentId, missingDocumentId);
    assert.equal(missingPayload.mirrored, false);
    assert.equal(missingPayload.sourceLabel, null);
    assert.equal(missingPayload.document, null);
    assert.match(missingPayload.checkedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    const mirroredResponse = await app.inject({
      method: 'GET',
      url: `/api/agentos/rag/documents/${encodeURIComponent(documentId)}/mirror-status`,
    });
    assert.equal(mirroredResponse.statusCode, 200);
    const mirroredPayload = mirroredResponse.json();
    assert.equal(mirroredPayload.success, true);
    assert.equal(mirroredPayload.documentId, documentId);
    assert.equal(mirroredPayload.mirrored, true);
    assert.equal(mirroredPayload.sourceLabel, WORKBENCH_RUNTIME_RAG_DATA_SOURCE_ID);
    assert.ok(mirroredPayload.document);
    assert.equal(mirroredPayload.document.id, documentId);
    assert.equal(mirroredPayload.document.name, 'Mirror Status Note.md');
    assert.equal(mirroredPayload.document.mode, 'runtime');
    assert.equal(mirroredPayload.document.type, 'markdown');
    assert.ok(mirroredPayload.document.chunkCount >= 1);
    assert.deepEqual(mirroredPayload.document.collectionIds, [collection.id]);
    assert.ok(!('chunks' in mirroredPayload.document));
    assert.match(mirroredPayload.checkedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  } finally {
    runtimeRagDocumentStore.deleteDocument(documentId);
    runtimeRagDocumentStore.deleteCollection(collection.id);
    await app.close();
  }
});
