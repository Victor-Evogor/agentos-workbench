import { expect, test } from '@playwright/test';
import {
  attachConsoleErrorCollector,
  flushConsoleErrors,
  gotoWorkbench,
  installDefaultApiMocks,
  installMemoryInspectorApiMocks,
  waitForWorkbenchReady,
} from './helpers/workbench';

const consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  await installDefaultApiMocks(page);
  await installMemoryInspectorApiMocks(page);
  attachConsoleErrorCollector(page, consoleErrors);
});

test.afterEach(async () => {
  flushConsoleErrors(consoleErrors);
});

test.describe('AgentOS Workbench - Memory Inspector', () => {
  test('delete flow preserves keyboard focus within the inspector', async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      window.confirm = () => true;
    });

    await gotoWorkbench(page, baseURL!);
    await waitForWorkbenchReady(page);

    await page.getByRole('tab', { name: /^Memory$/i }).click();
    await page.getByRole('tab', { name: /^Inspector$/i }).click();

    const firstEntryToggle = page.locator('#memory-entry-toggle-ep-1');
    const secondEntryToggle = page.locator('#memory-entry-toggle-ep-2');
    const episodicSectionToggle = page.locator('#memory-section-toggle-episodic');

    await expect(firstEntryToggle).toBeVisible();
    await expect(page.getByLabel('Search memory entries')).toBeVisible();

    await firstEntryToggle.focus();
    await expect(firstEntryToggle).toBeFocused();
    await firstEntryToggle.press('Enter');

    const firstDeleteButton = page.getByRole('button', {
      name: /delete memory entry ep-1/i,
    });
    await expect(firstDeleteButton).toBeVisible();
    await firstDeleteButton.click();

    await expect(firstEntryToggle).toHaveCount(0);
    await expect(secondEntryToggle).toBeFocused();

    await secondEntryToggle.press('Enter');
    const secondDeleteButton = page.getByRole('button', {
      name: /delete memory entry ep-2/i,
    });
    await expect(secondDeleteButton).toBeVisible();
    await secondDeleteButton.click();

    await expect(secondEntryToggle).toHaveCount(0);
    await expect(episodicSectionToggle).toBeFocused();
    await expect(page.getByText('Delete Complete: ep-2', { exact: false })).toBeVisible();
  });
});
