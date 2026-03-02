import { test } from "@playwright/test";
import {
  attachConsoleErrorCollector,
  flushConsoleErrors,
  gotoWorkbench,
  installDefaultApiMocks,
  SCREEN_SIZES,
} from "./helpers/workbench";

const consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  await installDefaultApiMocks(page);
  attachConsoleErrorCollector(page, consoleErrors);
});

test.afterEach(async () => {
  flushConsoleErrors(consoleErrors);
});

test.describe("Screenshot Suite", () => {
  test("capture all screens at all sizes", async ({ page, baseURL }) => {
    for (const [sizeName, dimensions] of Object.entries(SCREEN_SIZES)) {
      await page.setViewportSize(dimensions);

      await gotoWorkbench(page, baseURL!);
      await page.waitForLoadState("networkidle");

      await page.getByRole("tab", { name: /Compose/i }).click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `./output/screenshot-${sizeName}-compose-light.png`,
        fullPage: true,
      });

      await page.getByRole("tab", { name: /Personas/i }).click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `./output/screenshot-${sizeName}-personas-light.png`,
        fullPage: true,
      });

      await page.getByRole("tab", { name: /Agency/i }).click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `./output/screenshot-${sizeName}-agency-light.png`,
        fullPage: true,
      });

      const themeToggle = page.locator('button[name*="dark"], button[aria-label*="dark"]').first();
      if (await themeToggle.isVisible()) {
        await themeToggle.click();
        await page.waitForTimeout(300);

        await page.getByRole("tab", { name: /Compose/i }).click();
        await page.waitForTimeout(300);
        await page.screenshot({
          path: `./output/screenshot-${sizeName}-compose-dark.png`,
          fullPage: true,
        });

        await page.getByRole("tab", { name: /Personas/i }).click();
        await page.waitForTimeout(300);
        await page.screenshot({
          path: `./output/screenshot-${sizeName}-personas-dark.png`,
          fullPage: true,
        });

        await page.getByRole("tab", { name: /Agency/i }).click();
        await page.waitForTimeout(300);
        await page.screenshot({
          path: `./output/screenshot-${sizeName}-agency-dark.png`,
          fullPage: true,
        });
      }
    }
  });
});
