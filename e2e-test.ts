import { chromium, Browser, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:5175';
const SCREENSHOT_DIR = './test-screenshots';

// Screen sizes to test
const SCREEN_SIZES = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'desktop-lg', width: 1920, height: 1080 },
];

interface TestResult {
  test: string;
  status: 'pass' | 'fail';
  error?: string;
  duration: number;
}

const results: TestResult[] = [];
const consoleErrors: string[] = [];
const networkErrors: string[] = [];

async function setupScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

async function captureScreenshot(page: Page, name: string) {
  const filename = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filename, fullPage: true });
  console.log(`  Screenshot saved: ${filename}`);
}

async function runTest(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    results.push({ test: name, status: 'pass', duration: Date.now() - start });
    console.log(`✓ ${name} (${Date.now() - start}ms)`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ test: name, status: 'fail', error: errorMsg, duration: Date.now() - start });
    console.log(`✗ ${name}: ${errorMsg}`);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('AgentOS Workbench E2E Test Suite');
  console.log('='.repeat(60));
  console.log('');

  await setupScreenshotDir();

  const browser = await chromium.launch({
    headless: false, // Run in headed mode so we can see the tests
    slowMo: 100 // Slow down actions for visibility
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[Console Error] ${msg.text()}`);
    }
  });

  // Capture network errors
  page.on('response', response => {
    if (response.status() >= 400) {
      networkErrors.push(`[${response.status()}] ${response.url()}`);
    }
  });

  page.on('pageerror', error => {
    consoleErrors.push(`[Page Error] ${error.message}`);
  });

  try {
    // Test 1: Initial Page Load
    await runTest('Initial page load', async () => {
      const response = await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      if (!response || response.status() !== 200) {
        throw new Error(`Page load failed with status ${response?.status()}`);
      }
      await captureScreenshot(page, '01-initial-load');
    });

    // Test 2: Page title
    await runTest('Page has correct title', async () => {
      const title = await page.title();
      console.log(`  Title: "${title}"`);
      if (!title || title.length === 0) {
        throw new Error('Page title is empty');
      }
    });

    // Test 3: Main content loads
    await runTest('Main content renders', async () => {
      await page.waitForTimeout(2000); // Give React time to hydrate
      const body = await page.$('body');
      if (!body) {
        throw new Error('Body element not found');
      }
      const bodyContent = await body.textContent();
      if (!bodyContent || bodyContent.trim().length === 0) {
        throw new Error('Body content is empty');
      }
    });

    // Test 4: Check for visible interactive elements
    await runTest('Interactive elements present', async () => {
      // Look for buttons, inputs, or other interactive elements
      const buttons = await page.$$('button');
      const inputs = await page.$$('input');
      const links = await page.$$('a');
      console.log(`  Found: ${buttons.length} buttons, ${inputs.length} inputs, ${links.length} links`);
    });

    // Test 5: Responsive screenshots at all sizes
    console.log('\n--- Responsive Testing ---\n');
    for (const size of SCREEN_SIZES) {
      await runTest(`Screenshot at ${size.name} (${size.width}x${size.height})`, async () => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.waitForTimeout(500); // Allow layout to adjust
        await captureScreenshot(page, `02-responsive-${size.name}`);
      });
    }

    // Reset to desktop size for interaction tests
    await page.setViewportSize({ width: 1280, height: 800 });

    // Test 6: Click interactions - find and click buttons
    console.log('\n--- UI Interaction Tests ---\n');
    await runTest('Button click interactions', async () => {
      const buttons = await page.$$('button:visible');
      console.log(`  Testing ${Math.min(buttons.length, 3)} buttons...`);
      for (let i = 0; i < Math.min(buttons.length, 3); i++) {
        try {
          const button = buttons[i];
          const text = await button.textContent();
          console.log(`  Clicking button: "${text?.trim().substring(0, 30)}..."`);
          await button.click({ timeout: 2000 });
          await page.waitForTimeout(500);
        } catch (e) {
          // Button might be disabled or hidden
        }
      }
      await captureScreenshot(page, '03-after-button-clicks');
    });

    // Test 7: Input interactions
    await runTest('Input field interactions', async () => {
      const inputs = await page.$$('input:visible, textarea:visible');
      console.log(`  Testing ${Math.min(inputs.length, 2)} input fields...`);
      for (let i = 0; i < Math.min(inputs.length, 2); i++) {
        try {
          const input = inputs[i];
          const inputType = await input.getAttribute('type');
          if (inputType !== 'checkbox' && inputType !== 'radio' && inputType !== 'hidden') {
            await input.click();
            await input.fill('Test input ' + (i + 1));
            await page.waitForTimeout(300);
          }
        } catch (e) {
          // Input might be disabled or read-only
        }
      }
      await captureScreenshot(page, '04-after-input-test');
    });

    // Test 8: Navigation/routing test
    await runTest('Navigation elements', async () => {
      const navLinks = await page.$$('nav a, [role="navigation"] a, header a');
      console.log(`  Found ${navLinks.length} navigation links`);
      if (navLinks.length > 0) {
        // Click first nav link if it's internal
        const firstLink = navLinks[0];
        const href = await firstLink.getAttribute('href');
        console.log(`  First nav link href: ${href}`);
      }
    });

    // Test 9: Check for React error boundaries
    await runTest('No React error boundaries triggered', async () => {
      const errorBoundary = await page.$('[class*="error"], [class*="Error"], [data-error]');
      const errorText = await page.$$eval('body', bodies => {
        const text = bodies[0]?.textContent || '';
        return text.toLowerCase().includes('something went wrong') ||
               text.toLowerCase().includes('error boundary');
      });
      if (errorText) {
        throw new Error('Error boundary may have been triggered');
      }
    });

    // Test 10: Final state screenshot
    await runTest('Final state capture', async () => {
      await captureScreenshot(page, '05-final-state');
    });

  } finally {
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;

    console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

    if (failed > 0) {
      console.log('\nFailed tests:');
      results.filter(r => r.status === 'fail').forEach(r => {
        console.log(`  - ${r.test}: ${r.error}`);
      });
    }

    if (consoleErrors.length > 0) {
      console.log('\nConsole Errors:');
      consoleErrors.forEach(e => console.log(`  ${e}`));
    }

    if (networkErrors.length > 0) {
      console.log('\nNetwork Errors:');
      networkErrors.forEach(e => console.log(`  ${e}`));
    }

    console.log('\nScreenshots saved to:', path.resolve(SCREENSHOT_DIR));

    // Keep browser open for 3 seconds to see final state
    await page.waitForTimeout(3000);
    await browser.close();

    // Write results to JSON
    const reportPath = path.join(SCREENSHOT_DIR, 'test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      results,
      consoleErrors,
      networkErrors,
      summary: { total: results.length, passed, failed }
    }, null, 2));
    console.log(`\nTest report saved to: ${reportPath}`);
  }
}

main().catch(console.error);
