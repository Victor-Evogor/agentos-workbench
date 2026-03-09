import { chromium } from '@playwright/test';
import path from 'path';

const BASE = 'http://localhost:5175';
const OUT = path.resolve('screenshots-e2e');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Dismiss tour
  async function dismissTour() {
    try {
      const btn = page.getByRole('button', { name: /Don.t show again/i }).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click({ timeout: 3000, force: true });
        await page.waitForTimeout(300);
      }
    } catch {}
    try {
      const close = page.getByRole('button', { name: /^Close$/i }).first();
      if (await close.isVisible({ timeout: 500 })) {
        await close.click({ timeout: 2000, force: true });
        await page.waitForTimeout(300);
      }
    } catch {}
  }

  console.log('Opening workbench...');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await dismissTour();
  await page.waitForTimeout(500);

  // Make sure we're on the Compose tab
  const composeTab = page.getByRole('tab', { name: 'Compose' }).first();
  if (await composeTab.isVisible({ timeout: 2000 })) {
    await composeTab.click({ force: true });
    await page.waitForTimeout(600);
  }

  // Screenshot before sending
  await page.screenshot({ path: `${OUT}/chat-01-before-send.png` });
  console.log('1. Captured compose tab before send');

  // Type a message into the textarea
  const textarea = page.locator('textarea').first();
  await textarea.click();
  await textarea.fill('List the 7 layers of the OSI model with examples');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/chat-02-typed-message.png` });
  console.log('2. Typed message');

  // Click Send to AgentOS button
  const sendBtn = page.getByRole('button', { name: /Send to AgentOS/i }).first();
  if (await sendBtn.isVisible({ timeout: 2000 })) {
    await sendBtn.click({ force: true });
    console.log('3. Clicked Send to AgentOS');
  } else {
    // Try any submit button
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click({ force: true });
    console.log('3. Clicked submit button');
  }

  // Wait for streaming to start — capture at intervals
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/chat-03-streaming-2s.png` });
  console.log('4. Screenshot at 2s');

  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/chat-04-streaming-5s.png` });
  console.log('5. Screenshot at 5s');

  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/chat-05-streaming-10s.png` });
  console.log('6. Screenshot at 10s');

  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/chat-06-streaming-15s.png` });
  console.log('7. Screenshot at 15s');

  await page.waitForTimeout(10000);
  await page.screenshot({ path: `${OUT}/chat-07-final-25s.png` });
  console.log('8. Final screenshot at 25s');

  await browser.close();
  console.log('Done!');
}

main().catch(console.error);
