import { expect, type Page } from '@playwright/test';

export const SCREEN_SIZES = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1920, height: 1080 },
} as const;

const DEFAULT_RUNTIME_STATUS = {
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
      modelProviderManager: false,
      retrievalAugmentor: false,
    },
    providers: {
      configured: [],
      defaultProvider: null,
    },
    capabilities: {
      processRequest: false,
      listAvailablePersonas: true,
      listWorkflowDefinitions: true,
      getConversationHistory: false,
    },
    gmis: {
      activeCount: 0,
      items: [],
    },
    extensions: {
      loadedPacks: [],
      toolCount: 0,
      workflowCount: 0,
      guardrailCount: 0,
    },
  },
  workbenchIntegration: {
    workflowDefinitions: false,
    workflowExecution: false,
    agencyExecution: false,
    planningDashboardBackedByRuntime: false,
    graphRunRecords: false,
    graphInspectionUi: false,
    checkpointResumeUi: false,
  },
} as const;

const DEFAULT_GUARDRAIL_CONFIG = {
  tier: 'balanced',
  packs: [
    {
      id: 'pii-redaction',
      package: '@framers/guardrails-pii-redaction',
      name: 'PII Redaction',
      description: 'Detect and redact personal data.',
      installed: true,
      enabled: true,
      verified: true,
    },
    {
      id: 'code-safety',
      package: '@framers/guardrails-code-safety',
      name: 'Code Safety',
      description: 'Scan generated code for unsafe patterns.',
      installed: true,
      enabled: true,
      verified: true,
    },
  ],
} as const;

export async function installDefaultApiMocks(page: Page) {
  await page.route('**/api/agentos/stream**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'event: done\ndata: {}\n\n',
    });
  });

  await page.route('**/api/agentos/models**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: [] }),
    });
  });

  await page.route('**/api/agentos/runtime', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DEFAULT_RUNTIME_STATUS),
    });
  });

  await page.route('**/api/agentos/personas**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/agentos/workflows/definitions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/agentos/graph-runs/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route('**/api/agentos/graph-runs', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/agentos/guardrails/configure', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route('**/api/agentos/guardrails', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DEFAULT_GUARDRAIL_CONFIG),
    });
  });

  await page.route('**/api/agentos/extensions/tools', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/agentos/extensions/install', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        installed: true,
        mode: 'standalone',
        message: 'Mock extension install completed.',
      }),
    });
  });

  await page.route('**/api/agentos/extensions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/agentos/conversations/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversation: null,
        connected: false,
      }),
    });
  });

  await page.route('**/api/events', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'event: message\ndata: {"event":"__connected__","data":{}}\n\n',
    });
  });

  await page.route('**/api/agency/approvals', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [],
      }),
    });
  });

  await page.route('**/api/agency/approvals/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
      }),
    });
  });

  await page.route('**/api/agentos/telemetry/**', async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname.endsWith('/api/agentos/telemetry/task-outcomes')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          windows: [],
          pagination: {
            page: 1,
            limit: 6,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
            sortBy: 'updated_at',
            sortDir: 'desc',
          },
          totals: {
            windowCount: 0,
            returnedWindowCount: 0,
            sampleCount: 0,
            successCount: 0,
            partialCount: 0,
            failedCount: 0,
            successRate: 0,
            averageScore: 0,
            weightedSuccessRate: 0,
          },
          filters: {
            scopeMode: null,
            organizationId: null,
            personaId: null,
            scopeContains: null,
            limit: 6,
            includeEntries: false,
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/api/agentos/telemetry/config')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'e2e',
          tenantRouting: {
            mode: 'single_tenant',
            strictOrganizationIsolation: false,
          },
          taskOutcomeTelemetry: {
            enabled: true,
            rollingWindowSize: 100,
            scope: 'global',
            emitAlerts: false,
            alertBelowWeightedSuccessRate: 0.55,
            alertMinSamples: 10,
            alertCooldownMs: 60_000,
          },
          adaptiveExecution: {
            enabled: false,
            minSamples: 10,
            minWeightedSuccessRate: 0.55,
            forceAllToolsWhenDegraded: false,
          },
          turnPlanning: {
            enabled: true,
            defaultToolFailureMode: 'fail_open',
            allowRequestOverrides: true,
            discovery: {
              enabled: true,
              defaultToolSelectionMode: 'discovered',
              recallProfile: 'aggressive',
              onlyAvailable: true,
              includePromptContext: true,
              maxRetries: 2,
              retryBackoffMs: 250,
            },
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/api/agentos/telemetry/alerts')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          alerts: [],
          pagination: {
            page: 1,
            limit: 8,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
            sortBy: 'alert_timestamp',
            sortDir: 'desc',
          },
          totals: {
            alertCount: 0,
            acknowledgedCount: 0,
            unacknowledgedCount: 0,
            criticalCount: 0,
          },
          filters: {
            scopeMode: null,
            organizationId: null,
            personaId: null,
            scopeContains: null,
            severity: null,
            acknowledged: null,
            limit: 8,
            page: 1,
            sortBy: 'alert_timestamp',
            sortDir: 'desc',
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/api/agentos/telemetry/alerts/retention')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: {
            enabled: true,
            retentionDays: 30,
            maxRows: 5000,
            pruneIntervalMs: 3_600_000,
          },
          lastPruneAt: null,
          pruneInFlight: false,
          lastSummary: null,
        }),
      });
      return;
    }

    if (pathname.endsWith('/api/agentos/telemetry/alerts/prune')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: {
            config: {
              enabled: true,
              retentionDays: 30,
              maxRows: 5000,
              pruneIntervalMs: 3_600_000,
            },
            deletedByAge: 0,
            deletedByOverflow: 0,
            totalDeleted: 0,
            remainingRows: 0,
            prunedAt: new Date().toISOString(),
          },
          status: {
            config: {
              enabled: true,
              retentionDays: 30,
              maxRows: 5000,
              pruneIntervalMs: 3_600_000,
            },
            lastPruneAt: new Date().toISOString(),
            pruneInFlight: false,
            lastSummary: null,
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.route('**/api/evaluation/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (method === 'GET' && pathname.endsWith('/api/evaluation/runs')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (method === 'GET' && pathname.endsWith('/api/evaluation/test-cases')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (method === 'GET' && /\/api\/evaluation\/runs\/[^/]+\/results$/.test(pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (method === 'POST' && pathname.endsWith('/api/evaluation/run')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'run-fallback',
          name: 'Fallback Run',
          status: 'completed',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          averageScore: 0,
          duration: 0,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.route('**/api/planning/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (pathname.endsWith('/api/planning/plans') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (pathname.endsWith('/api/planning/plans') && method === 'POST') {
      const payload = (request.postDataJSON() as { goal?: string } | null) ?? {};
      const goal = payload.goal?.trim() || 'Fallback Plan';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          planId: 'plan-fallback',
          goal,
          status: 'executing',
          createdAt: new Date().toISOString(),
          currentStepIndex: 0,
          steps: [
            {
              stepId: 'step-fallback-1',
              description: 'Initialize plan',
              actionType: 'reflection',
              status: 'in_progress',
            },
          ],
        }),
      });
      return;
    }

    if (
      method === 'POST' &&
      /\/api\/planning\/plans\/[^/]+\/(pause|resume|advance|rerun)$/.test(pathname)
    ) {
      const action = pathname.split('/').pop() ?? 'resume';
      const statusByAction: Record<string, string> = {
        pause: 'paused',
        resume: 'executing',
        advance: 'executing',
        rerun: 'executing',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          planId: 'plan-fallback',
          goal: 'Fallback Plan',
          status: statusByAction[action] ?? 'executing',
          createdAt: new Date().toISOString(),
          currentStepIndex: 0,
          steps: [
            {
              stepId: 'step-fallback-1',
              description: 'Initialize plan',
              actionType: 'reflection',
              status: action === 'pause' ? 'pending' : 'in_progress',
            },
          ],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

export async function installMemoryInspectorApiMocks(page: Page) {
  const memoryEntries = {
    episodic: [
      {
        id: 'ep-1',
        content: 'User asked about deployment state for the memory inspector.',
        confidence: 0.94,
        timestamp: Date.UTC(2026, 2, 26, 12, 0, 0),
        source: 'conversation',
        tags: ['deployment', 'memory'],
      },
      {
        id: 'ep-2',
        content: 'Inspector focus should move to the next visible row after delete.',
        confidence: 0.91,
        timestamp: Date.UTC(2026, 2, 26, 12, 5, 0),
        source: 'conversation',
        tags: ['accessibility', 'focus'],
      },
    ],
    semantic: [],
    procedural: [],
  };

  await page.route('**/api/agentos/memory/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'demo',
        connected: false,
        episodic: {
          count: memoryEntries.episodic.length,
          newest: memoryEntries.episodic[0]?.timestamp ?? null,
        },
        semantic: { count: memoryEntries.semantic.length },
        procedural: { count: memoryEntries.procedural.length },
        working: {
          tokens: 240,
          maxTokens: 2048,
          activeSessions: 1,
        },
      }),
    });
  });

  await page.route('**/api/agentos/memory/working', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'demo',
        connected: false,
        tokens: 240,
        maxTokens: 2048,
        rollingSummary: 'Working memory tracks the current accessibility cleanup.',
        activeSessions: 1,
        slotCount: 3,
        slotCapacity: 8,
        strategy: 'rolling-summary',
      }),
    });
  });

  await page.route('**/api/agentos/memory/entries', async (route) => {
    const url = new URL(route.request().url());
    const type = url.searchParams.get('type');
    if (type === 'working') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'demo',
          connected: false,
          tokens: 240,
          maxTokens: 2048,
          rollingSummary: 'Working memory tracks the current accessibility cleanup.',
          activeSessions: 1,
          slotCount: 3,
          slotCapacity: 8,
          strategy: 'rolling-summary',
        }),
      });
      return;
    }

    if (type === 'episodic' || type === 'semantic' || type === 'procedural') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(memoryEntries[type]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'demo',
        connected: false,
        episodic: memoryEntries.episodic,
        semantic: memoryEntries.semantic,
        procedural: memoryEntries.procedural,
      }),
    });
  });

  await page.route('**/api/agentos/memory/timeline', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'demo',
        connected: false,
        timeline: [],
      }),
    });
  });

  await page.route('**/api/agentos/memory/entries/*', async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.fallback();
      return;
    }

    const entryId = route.request().url().split('/').pop() ?? '';
    const episodicIndex = memoryEntries.episodic.findIndex((entry) => entry.id === entryId);
    if (episodicIndex >= 0) {
      memoryEntries.episodic.splice(episodicIndex, 1);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'demo',
          ok: true,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'demo',
        error: `Memory entry ${entryId} not found`,
      }),
    });
  });
}

export async function dismissTourIfVisible(page: Page) {
  const closeButton = page.getByRole('button', { name: /^Close$/i }).first();
  const visible = await closeButton.isVisible({ timeout: 500 }).catch(() => false);
  if (visible) {
    await closeButton.click({ timeout: 5_000, force: true }).catch(() => undefined);
    await page.waitForTimeout(100);
  }
}

export async function gotoWorkbench(page: Page, baseURL: string) {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await dismissTourIfVisible(page);
}

export async function waitForWorkbenchReady(page: Page) {
  await expect(page.getByRole('tablist', { name: /left panel tabs/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Home$/i })).toBeVisible();
}

export function attachConsoleErrorCollector(page: Page, consoleErrors: string[]) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', (error) => {
    consoleErrors.push(`[pageerror] ${error.message}`);
  });
}

export function flushConsoleErrors(consoleErrors: string[]) {
  if (consoleErrors.length > 0) {
    console.log('Console errors detected:', consoleErrors);
    consoleErrors.length = 0;
  }
}
