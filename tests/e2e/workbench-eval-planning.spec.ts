import { expect, test } from "@playwright/test";
import {
  attachConsoleErrorCollector,
  dismissTourIfVisible,
  flushConsoleErrors,
  gotoWorkbench,
  installDefaultApiMocks,
} from "./helpers/workbench";

const consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  await installDefaultApiMocks(page);
  attachConsoleErrorCollector(page, consoleErrors);
});

test.afterEach(async () => {
  flushConsoleErrors(consoleErrors);
});

test.describe("AgentOS Workbench - Evaluation and Planning E2E Tests", () => {
  test.describe("Evaluation Tab", () => {
    test("can open evaluation tab and start an evaluation run", async ({ page, baseURL }) => {
      let runEndpointHit = false;

      await page.route("**/api/evaluation/runs", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "run-seeded",
              name: "Seeded Run",
              status: "completed",
              startedAt: new Date(Date.now() - 60_000).toISOString(),
              completedAt: new Date(Date.now() - 30_000).toISOString(),
              totalTests: 2,
              passedTests: 1,
              failedTests: 1,
              averageScore: 0.74,
              duration: 4500,
            },
          ]),
        });
      });

      await page.route("**/api/evaluation/test-cases", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "tc-e2e-1",
              name: "E2E Case",
              input: "test input",
              expectedOutput: "test output",
              category: "smoke",
            },
          ]),
        });
      });

      await page.route("**/api/evaluation/runs/run-e2e/results", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              testCaseId: "tc-e2e-1",
              testCaseName: "E2E Case",
              passed: true,
              score: 0.92,
              duration: 1400,
              metrics: [{ name: "accuracy", score: 0.92, threshold: 0.8, passed: true }],
            },
          ]),
        });
      });

      await page.route("**/api/evaluation/run", async (route) => {
        runEndpointHit = true;
        const payload = route.request().postDataJSON() as { testCaseIds?: string[] };
        expect(payload.testCaseIds?.length ?? 0).toBeGreaterThan(0);

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "run-e2e",
            name: "E2E Triggered Run",
            status: "completed",
            startedAt: new Date().toISOString(),
            completedAt: new Date(Date.now() + 2000).toISOString(),
            totalTests: 1,
            passedTests: 1,
            failedTests: 0,
            averageScore: 0.92,
            duration: 2000,
          }),
        });
      });

      await gotoWorkbench(page, baseURL!);
      await page.waitForLoadState("networkidle");

      await page.getByRole("tab", { name: /Evaluation/i }).click();
      await dismissTourIfVisible(page);
      await expect(page.getByRole("heading", { name: /Evaluation Dashboard/i })).toBeVisible();

      await dismissTourIfVisible(page);
      await page.getByRole("button", { name: /Run Evaluation/i }).click({ force: true });
      await expect.poll(() => runEndpointHit).toBeTruthy();
      await expect(page.getByRole("heading", { name: "E2E Triggered Run" }).first()).toBeVisible();
    });
  });

  test.describe("Planning Tab", () => {
    test("loads planning data and can create a plan", async ({ page, baseURL }) => {
      let createEndpointHit = false;

      await page.route("**/api/planning/plans", async (route) => {
        const method = route.request().method();
        if (method === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([
              {
                planId: "plan-seeded",
                goal: "Seeded Planning Run",
                status: "executing",
                createdAt: new Date(Date.now() - 120_000).toISOString(),
                currentStepIndex: 0,
                steps: [
                  {
                    stepId: "step-seeded-1",
                    description: "Gather context",
                    actionType: "tool_call",
                    status: "in_progress",
                  },
                ],
              },
            ]),
          });
          return;
        }

        createEndpointHit = true;
        const payload = route.request().postDataJSON() as { goal?: string };
        expect(payload.goal?.length ?? 0).toBeGreaterThan(0);

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            planId: "plan-created",
            goal: payload.goal,
            status: "executing",
            createdAt: new Date().toISOString(),
            currentStepIndex: 0,
            steps: [
              {
                stepId: "step-created-1",
                description: "Draft approach",
                actionType: "reflection",
                status: "in_progress",
              },
            ],
          }),
        });
      });

      await gotoWorkbench(page, baseURL!);
      await page.waitForLoadState("networkidle");

      await page.getByRole("tab", { name: /Planning/i }).click();
      await dismissTourIfVisible(page);
      await expect(page.getByRole("heading", { name: /Planning Engine/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Seeded Planning Run" }).first()).toBeVisible();

      await page.getByPlaceholder(/Define a new experiment goal/i).fill("E2E Planning Goal");
      await dismissTourIfVisible(page);
      await page.getByRole("button", { name: /New Plan/i }).click({ force: true });
      await expect.poll(() => createEndpointHit).toBeTruthy();
      await expect(page.getByRole("heading", { name: "E2E Planning Goal" }).first()).toBeVisible();
    });
  });
});
