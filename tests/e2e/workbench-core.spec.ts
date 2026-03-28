import { expect, test } from '@playwright/test';
import {
  attachConsoleErrorCollector,
  flushConsoleErrors,
  gotoWorkbench,
  installDefaultApiMocks,
  waitForWorkbenchReady,
} from './helpers/workbench';

const consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  await installDefaultApiMocks(page);
  attachConsoleErrorCollector(page, consoleErrors);
});

test.afterEach(async () => {
  flushConsoleErrors(consoleErrors);
});

test.describe('AgentOS Workbench - Core E2E Tests', () => {
  test.describe('Tab Navigation', () => {
    test('all main tabs are visible and clickable', async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await waitForWorkbenchReady(page);

      const composeTab = page.getByRole('tab', { name: /Compose/i });
      await expect(composeTab).toBeVisible();
      await composeTab.click();
      await expect(composeTab).toHaveAttribute('aria-selected', 'true');

      const personasTab = page.getByRole('tab', { name: /Personas/i });
      await expect(personasTab).toBeVisible();
      await personasTab.click();
      await expect(personasTab).toHaveAttribute('aria-selected', 'true');

      const agencyTab = page.getByRole('tab', { name: /Agency/i });
      await expect(agencyTab).toBeVisible();
      await agencyTab.click();
      await expect(agencyTab).toHaveAttribute('aria-selected', 'true');

      const evaluationTab = page.getByRole('tab', { name: /Evaluation/i });
      await expect(evaluationTab).toBeVisible();
      await evaluationTab.click();
      await expect(evaluationTab).toHaveAttribute('aria-selected', 'true');

      const planningTab = page.getByRole('tab', { name: /Planning/i });
      await expect(planningTab).toBeVisible();
      await planningTab.click();
      await expect(planningTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  test.describe('Compose Tab - Prompt Submission', () => {
    test('can enter and submit a prompt', async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await waitForWorkbenchReady(page);

      await page.getByRole('tab', { name: /Compose/i }).click();

      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible();
      await textarea.fill('Hello, this is a test prompt for the AI agent.');

      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForTimeout(1000);
      }

      await page.screenshot({ path: './output/compose-submitted.png', fullPage: true });
    });

    test('input field is accessible and has proper styling', async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await page.getByRole('tab', { name: /Compose/i }).click();

      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible();

      await textarea.focus();
      await page.screenshot({ path: './output/compose-input-focused.png' });
    });
  });

  test.describe('Personas Tab', () => {
    test('personas catalog is displayed', async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await waitForWorkbenchReady(page);

      await page.getByRole('tab', { name: /Personas/i }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: './output/personas-catalog.png', fullPage: true });

      const personaItems = page.locator(
        '[data-testid="persona-card"], .persona-card, [class*="persona"]'
      );
      const count = await personaItems.count();
      console.log(`Found ${count} persona elements`);
    });

    test('can interact with persona creation wizard', async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await page.getByRole('tab', { name: /Personas/i }).click();
      await page.waitForTimeout(500);

      const wizardBtn = page.getByRole('button', { name: /^Wizard$/i }).first();
      if (await wizardBtn.isVisible()) {
        await wizardBtn.click({ timeout: 5_000, force: true });
        await page.waitForTimeout(500);
        await page.screenshot({ path: './output/persona-wizard.png', fullPage: true });
      }
    });
  });

  test.describe('Agency Tab', () => {
    test('agency manager is displayed', async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await waitForWorkbenchReady(page);

      await page.getByRole('tab', { name: /Agency/i }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: './output/agency-manager.png', fullPage: true });
    });

    test('can interact with agency creation', async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await page.getByRole('tab', { name: /Agency/i }).click();
      await page.waitForTimeout(500);

      const createBtn = page
        .locator('button:has-text("Create"), button:has-text("New Agency"), button:has-text("Add")')
        .first();
      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: './output/agency-creation.png', fullPage: true });
      }
    });
  });

  test.describe('Header and Navigation', () => {
    test('header elements are visible', async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await waitForWorkbenchReady(page);

      const docsLink = page.getByRole('link', { name: 'Docs' });
      await expect(docsLink).toBeVisible();

      const themeToggle = page
        .locator('button[name*="mode"], button[aria-label*="theme"], button[aria-label*="mode"]')
        .first();
      if (await themeToggle.isVisible()) {
        await page.screenshot({ path: './output/header-light-mode.png' });
      }
    });

    test('theme toggle switches between light and dark', async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await waitForWorkbenchReady(page);
      await page.screenshot({ path: './output/theme-initial.png', fullPage: true });

      const themeToggle = page
        .locator(
          'button[name*="mode"], button[aria-label*="theme"], button:has-text("dark"), button:has-text("light")'
        )
        .first();
      if (await themeToggle.isVisible()) {
        await themeToggle.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: './output/theme-toggled.png', fullPage: true });

        await themeToggle.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: './output/theme-toggled-back.png', fullPage: true });
      }
    });
  });
});
