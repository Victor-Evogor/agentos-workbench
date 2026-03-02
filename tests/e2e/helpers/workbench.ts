import type { Page } from "@playwright/test";

export const SCREEN_SIZES = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1920, height: 1080 },
} as const;

export async function installDefaultApiMocks(page: Page) {
  await page.route("**/api/agentos/stream**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "event: done\ndata: {}\n\n",
    });
  });

  await page.route("**/api/agentos/models**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ models: [] }),
    });
  });

  await page.route("**/api/agentos/personas**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/agentos/workflows/definitions**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/agentos/telemetry/**", async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname.endsWith("/api/agentos/telemetry/task-outcomes")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          windows: [],
          pagination: {
            page: 1,
            limit: 6,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
            sortBy: "updated_at",
            sortDir: "desc",
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

    if (pathname.endsWith("/api/agentos/telemetry/config")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "e2e",
          tenantRouting: {
            mode: "single_tenant",
            strictOrganizationIsolation: false,
          },
          taskOutcomeTelemetry: {
            enabled: true,
            rollingWindowSize: 100,
            scope: "global",
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
            defaultToolFailureMode: "fail_open",
            allowRequestOverrides: true,
            discovery: {
              enabled: true,
              defaultToolSelectionMode: "discovered",
              recallProfile: "aggressive",
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

    if (pathname.endsWith("/api/agentos/telemetry/alerts")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alerts: [],
          pagination: {
            page: 1,
            limit: 8,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
            sortBy: "alert_timestamp",
            sortDir: "desc",
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
            sortBy: "alert_timestamp",
            sortDir: "desc",
          },
        }),
      });
      return;
    }

    if (pathname.endsWith("/api/agentos/telemetry/alerts/retention")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
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

    if (pathname.endsWith("/api/agentos/telemetry/alerts/prune")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
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
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/api/evaluation/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (method === "GET" && pathname.endsWith("/api/evaluation/runs")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (method === "GET" && pathname.endsWith("/api/evaluation/test-cases")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (method === "GET" && /\/api\/evaluation\/runs\/[^/]+\/results$/.test(pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (method === "POST" && pathname.endsWith("/api/evaluation/run")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "run-fallback",
          name: "Fallback Run",
          status: "completed",
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
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/api/planning/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (pathname.endsWith("/api/planning/plans") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (pathname.endsWith("/api/planning/plans") && method === "POST") {
      const payload = (request.postDataJSON() as { goal?: string } | null) ?? {};
      const goal = payload.goal?.trim() || "Fallback Plan";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          planId: "plan-fallback",
          goal,
          status: "executing",
          createdAt: new Date().toISOString(),
          currentStepIndex: 0,
          steps: [
            {
              stepId: "step-fallback-1",
              description: "Initialize plan",
              actionType: "reflection",
              status: "in_progress",
            },
          ],
        }),
      });
      return;
    }

    if (method === "POST" && /\/api\/planning\/plans\/[^/]+\/(pause|resume|advance|rerun)$/.test(pathname)) {
      const action = pathname.split("/").pop() ?? "resume";
      const statusByAction: Record<string, string> = {
        pause: "paused",
        resume: "executing",
        advance: "executing",
        rerun: "executing",
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          planId: "plan-fallback",
          goal: "Fallback Plan",
          status: statusByAction[action] ?? "executing",
          createdAt: new Date().toISOString(),
          currentStepIndex: 0,
          steps: [
            {
              stepId: "step-fallback-1",
              description: "Initialize plan",
              actionType: "reflection",
              status: action === "pause" ? "pending" : "in_progress",
            },
          ],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

export async function dismissTourIfVisible(page: Page) {
  const closeButton = page.getByRole("button", { name: /^Close$/i }).first();
  const visible = await closeButton.isVisible({ timeout: 500 }).catch(() => false);
  if (visible) {
    await closeButton.click({ timeout: 5_000, force: true }).catch(() => undefined);
    await page.waitForTimeout(100);
  }
}

export async function gotoWorkbench(page: Page, baseURL: string) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await dismissTourIfVisible(page);
}

export function attachConsoleErrorCollector(page: Page, consoleErrors: string[]) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    consoleErrors.push(`[pageerror] ${error.message}`);
  });
}

export function flushConsoleErrors(consoleErrors: string[]) {
  if (consoleErrors.length > 0) {
    console.log("Console errors detected:", consoleErrors);
    consoleErrors.length = 0;
  }
}
