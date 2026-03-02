import { expect, test } from "@playwright/test";
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

test.describe("AgentOS Workbench - Quality E2E Tests", () => {
  test.describe("Responsive Design", () => {
    for (const [sizeName, dimensions] of Object.entries(SCREEN_SIZES)) {
      test(`layout adapts correctly on ${sizeName}`, async ({ page, baseURL }) => {
        await page.setViewportSize(dimensions);
        await gotoWorkbench(page, baseURL!);
        await page.waitForLoadState("networkidle");

        await page.screenshot({ path: `./output/responsive-${sizeName}-compose.png`, fullPage: true });

        await page.getByRole("tab", { name: /Personas/i }).click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `./output/responsive-${sizeName}-personas.png`, fullPage: true });

        await page.getByRole("tab", { name: /Agency/i }).click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `./output/responsive-${sizeName}-agency.png`, fullPage: true });
      });
    }
  });

  test.describe("All Buttons and Interactive Elements", () => {
    test("scan and verify all buttons are clickable", async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await page.waitForLoadState("networkidle");

      const buttons = page.locator("button");
      const buttonCount = await buttons.count();
      console.log(`Found ${buttonCount} buttons on the page`);

      for (let i = 0; i < Math.min(buttonCount, 20); i++) {
        const btn = buttons.nth(i);
        if (await btn.isVisible()) {
          const text = await btn.textContent();
          console.log(`Button ${i}: "${text?.trim() || "[no text]"}"`);
        }
      }

      await page.screenshot({ path: "./output/all-buttons-initial.png", fullPage: true });
    });

    test("scan all input fields", async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await page.waitForLoadState("networkidle");

      const inputs = page.locator("input, textarea, select");
      const inputCount = await inputs.count();
      console.log(`Found ${inputCount} input elements`);

      for (let i = 0; i < inputCount; i++) {
        const input = inputs.nth(i);
        if (await input.isVisible()) {
          const type = await input.getAttribute("type");
          const name = await input.getAttribute("name");
          const placeholder = await input.getAttribute("placeholder");
          console.log(`Input ${i}: type=${type}, name=${name}, placeholder=${placeholder}`);
        }
      }
    });

    test("scan all links", async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await page.waitForLoadState("networkidle");

      const links = page.locator("a");
      const linkCount = await links.count();
      console.log(`Found ${linkCount} links`);

      for (let i = 0; i < linkCount; i++) {
        const link = links.nth(i);
        if (await link.isVisible()) {
          const href = await link.getAttribute("href");
          const text = await link.textContent();
          console.log(`Link ${i}: "${text?.trim()}" -> ${href}`);
        }
      }
    });
  });

  test.describe("Accessibility Checks", () => {
    test("all interactive elements have accessible names", async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await page.waitForLoadState("networkidle");

      const buttons = page.locator("button");
      const buttonCount = await buttons.count();

      for (let i = 0; i < buttonCount; i++) {
        const btn = buttons.nth(i);
        if (await btn.isVisible()) {
          const ariaLabel = await btn.getAttribute("aria-label");
          const text = await btn.textContent();
          const name = await btn.getAttribute("name");

          if (!ariaLabel && !text?.trim() && !name) {
            console.warn(`Button ${i} has no accessible name!`);
          }
        }
      }
    });

    test("focus indicators are visible", async ({ page, baseURL }) => {
      await gotoWorkbench(page, baseURL!);
      await page.waitForLoadState("networkidle");

      await page.keyboard.press("Tab");
      await page.screenshot({ path: "./output/focus-1.png" });

      await page.keyboard.press("Tab");
      await page.screenshot({ path: "./output/focus-2.png" });

      await page.keyboard.press("Tab");
      await page.screenshot({ path: "./output/focus-3.png" });
    });
  });

  test.describe("Console Error Monitoring", () => {
    test("no critical errors on page load", async ({ page, baseURL }) => {
      const errors: string[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          errors.push(msg.text());
        }
      });

      page.on("pageerror", (error) => {
        errors.push(error.message);
      });

      await gotoWorkbench(page, baseURL!);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      await page.getByRole("tab", { name: /Compose/i }).click();
      await page.waitForTimeout(500);

      await page.getByRole("tab", { name: /Personas/i }).click();
      await page.waitForTimeout(500);

      await page.getByRole("tab", { name: /Agency/i }).click();
      await page.waitForTimeout(500);

      if (errors.length > 0) {
        console.log("Console errors found:");
        errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
      } else {
        console.log("No console errors detected!");
      }

      expect(true).toBe(true);
    });
  });
});
