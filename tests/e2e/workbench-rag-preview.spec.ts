import { expect, test, type Page } from '@playwright/test';
import {
  attachConsoleErrorCollector,
  flushConsoleErrors,
  gotoWorkbench,
  installDefaultApiMocks,
  waitForWorkbenchReady,
} from './helpers/workbench';

const consoleErrors: string[] = [];
const RUNTIME_DOCUMENT_ID = 'runtime-doc-grouped';
const RUNTIME_DOCUMENT_NAME = 'Grouped Runtime Preview';
const MIRRORED_RUNTIME_DOCUMENT = {
  id: RUNTIME_DOCUMENT_ID,
  name: RUNTIME_DOCUMENT_NAME,
  type: 'markdown',
  chunkCount: 2,
  indexedAt: '2026-03-26T12:00:00.000Z',
  collectionIds: [],
  dataSourceId: 'workbench-runtime-rag',
  mode: 'runtime',
} as const;
const MIRRORED_RUNTIME_CHUNKS = [
  {
    index: 0,
    text: 'Full mirrored runtime chunk.',
    tokenCount: 12,
    overlapTokens: 0,
  },
  {
    index: 1,
    text: 'Secondary runtime chunk.',
    tokenCount: 10,
    overlapTokens: 2,
  },
] as const;

async function installRagPreviewMocks(page: Page) {
  await page.route('**/api/agentos/runtime', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        modernApi: {
          generateText: true,
          streamText: true,
          generateImage: false,
          agentFactory: true,
        },
        orchestrationApi: {
          agentGraph: true,
          workflowBuilder: true,
          missionBuilder: true,
          graphRuntime: true,
          checkpointStore: true,
        },
        catalogs: {
          skills: 0,
          extensions: 0,
          installedExtensions: 0,
          tools: 0,
          guardrailPacksInstalled: 0,
        },
        runtime: {
          connected: false,
          mode: 'standalone',
          services: {
            conversationManager: false,
            extensionManager: false,
            toolOrchestrator: false,
            modelProviderManager: true,
            retrievalAugmentor: true,
          },
        },
        workbenchIntegration: {
          workflowDefinitions: false,
          workflowExecution: false,
          agencyExecution: false,
          planningDashboardBackedByRuntime: false,
          graphInspectionUi: false,
          checkpointResumeUi: false,
        },
      }),
    });
  });

  await page.route('**/api/rag/documents', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        documents: [],
        collections: [],
      }),
    });
  });

  await page.route('**/api/agentos/rag/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ready',
        runtimeConnected: true,
        runtimeReportsRetrieval: true,
        providerAvailable: true,
        defaultProviderId: 'openai',
        dataSources: ['workbench-runtime-rag'],
        vectorStoreConnected: true,
        message: 'Runtime retrieval is ready for query and ingestion.',
      }),
    });
  });

  await page.route('**/api/agentos/rag/documents', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        documents: [],
      }),
    });
  });

  await page.route('**/api/agentos/rag/collections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        collections: [],
      }),
    });
  });

  await page.route(
    `**/api/agentos/rag/documents/${RUNTIME_DOCUMENT_ID}/mirror-status`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          documentId: RUNTIME_DOCUMENT_ID,
          mirrored: true,
          checkedAt: '2026-03-26T12:05:00.000Z',
          sourceLabel: 'workbench-runtime-rag',
          document: MIRRORED_RUNTIME_DOCUMENT,
        }),
      });
    }
  );

  await page.route(`**/api/agentos/rag/documents/${RUNTIME_DOCUMENT_ID}/chunks`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        chunks: MIRRORED_RUNTIME_CHUNKS,
      }),
    });
  });

  await page.route('**/api/agentos/rag/query', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        mode: 'runtime',
        query: 'incident timeline',
        chunks: [
          {
            chunkId: 'hit-a',
            chunkIndex: 0,
            documentId: RUNTIME_DOCUMENT_ID,
            documentName: RUNTIME_DOCUMENT_NAME,
            content: 'First grouped preview chunk.',
            score: 0.91,
            dataSourceId: 'workbench-runtime-rag',
          },
          {
            chunkId: 'hit-b',
            chunkIndex: 0,
            documentId: RUNTIME_DOCUMENT_ID,
            documentName: RUNTIME_DOCUMENT_NAME,
            content: 'Focused grouped preview chunk.',
            score: 0.97,
            dataSourceId: 'workbench-runtime-rag',
          },
          {
            chunkId: 'hit-c',
            chunkIndex: 5,
            documentId: RUNTIME_DOCUMENT_ID,
            documentName: RUNTIME_DOCUMENT_NAME,
            content: 'Third grouped preview chunk.',
            score: 0.82,
            dataSourceId: 'workbench-runtime-rag',
          },
        ],
      }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await installDefaultApiMocks(page);
  await installRagPreviewMocks(page);
  attachConsoleErrorCollector(page, consoleErrors);
});

test.afterEach(async () => {
  flushConsoleErrors(consoleErrors);
});

test.describe('AgentOS Workbench - RAG Preview E2E Tests', () => {
  test('grouped runtime preview promotes the clicked unmirrored hit into the chunk viewer', async ({
    page,
    baseURL,
  }) => {
    await gotoWorkbench(page, baseURL!);
    await waitForWorkbenchReady(page);

    await page.getByRole('tab', { name: /^RAG$/ }).click();
    await expect(page.getByRole('heading', { name: 'Runtime Retrieval' })).toBeVisible();

    await page.getByPlaceholder('Ask the runtime retrieval store…').fill('incident timeline');
    await page.getByRole('button', { name: /^Query$/ }).click();

    const runtimeResults = page.getByRole('list', { name: 'Runtime query results' });
    await expect(runtimeResults).toBeVisible();

    const focusedResult = runtimeResults
      .locator('li')
      .filter({
        hasText: 'Focused grouped preview chunk.',
      })
      .first();
    await focusedResult.getByRole('button', { name: 'Preview 3 Hits' }).click();

    await expect(page.getByText('Chunks — Grouped Runtime Preview')).toBeVisible();
    await expect(
      page.getByText(
        'Showing 3 retrieved runtime chunks from the current result set because the full document is not mirrored into the workbench yet.'
      )
    ).toBeVisible();

    const chunkList = page.getByRole('list', { name: 'Document chunks' });
    const chunkItems = chunkList.locator('li');
    await expect(chunkItems).toHaveCount(3);
    await expect(chunkItems.nth(0)).toContainText('chunk 0 (match 1)');
    await expect(chunkItems.nth(0)).toContainText('Focused grouped preview chunk.');
    await expect(chunkItems.nth(1)).toContainText('chunk 0 (match 2)');
    await expect(chunkItems.nth(2)).toContainText('chunk 5');
    await expect(page.getByText('Highlighting chunk 0 (match 1)')).toBeVisible();
  });

  test('refresh mirror upgrades a preview-only runtime result into the mirrored full document on demand', async ({
    page,
    baseURL,
  }) => {
    await gotoWorkbench(page, baseURL!);
    await waitForWorkbenchReady(page);

    await page.getByRole('tab', { name: /^RAG$/ }).click();
    await expect(page.getByRole('heading', { name: 'Runtime Retrieval' })).toBeVisible();

    await page.getByPlaceholder('Ask the runtime retrieval store…').fill('incident timeline');
    await page.getByRole('button', { name: /^Query$/ }).click();

    const runtimeResults = page.getByRole('list', { name: 'Runtime query results' });
    const focusedResult = runtimeResults
      .locator('li')
      .filter({
        hasText: 'Focused grouped preview chunk.',
      })
      .first();

    await focusedResult.getByRole('button', { name: 'Preview 3 Hits' }).click();

    await expect(page.getByText('Preview Only')).toBeVisible();
    await expect(page.getByText('Mirror Pending')).toBeVisible();

    await page.getByRole('button', { name: 'Refresh Mirror' }).click();

    await expect(page.getByText('Mirror Ready')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load Full Doc' })).toBeVisible();
    await expect(
      page.getByText(
        'A mirrored runtime document is now available. Load the full document to replace this one-chunk preview.'
      )
    ).toBeVisible();

    await page.getByRole('button', { name: 'Load Full Doc' }).click();

    const chunkList = page.getByRole('list', { name: 'Document chunks' });
    const chunkItems = chunkList.locator('li');
    await expect(chunkItems).toHaveCount(2);
    await expect(chunkItems.nth(0)).toContainText('#0');
    await expect(chunkItems.nth(0)).toContainText('Full mirrored runtime chunk.');
    await expect(chunkItems.nth(1)).toContainText('#1');
    await chunkItems.nth(1).getByRole('button', { name: 'View' }).click();
    await expect(chunkItems.nth(1)).toContainText('Secondary runtime chunk.');
    await expect(page.getByText('Highlighting chunk 0')).toBeVisible();
    await expect(page.getByText('Preview Only')).toHaveCount(0);
    await expect(page.getByText('Mirror Ready')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Load Full Doc' })).toHaveCount(0);
  });
});
