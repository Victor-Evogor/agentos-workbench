import { chromium } from '@playwright/test';
import path from 'path';

const BASE = 'http://localhost:5175';
const OUT = path.resolve('screenshots-e2e');

async function main() {
  const browser = await chromium.launch({ headless: true });
  // Wider viewport to see the session inspector on the right
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();

  async function dismissTour() {
    try {
      const btn = page.getByRole('button', { name: /Don.t show again/i }).first();
      if (await btn.isVisible({ timeout: 1500 })) await btn.click({ force: true });
    } catch {}
    try {
      const close = page.getByRole('button', { name: /^Close$/i }).first();
      if (await close.isVisible({ timeout: 500 })) await close.click({ force: true });
    } catch {}
  }

  let n = 29; // continue from existing screenshots
  async function shot(label: string, opts?: { fullPage?: boolean }) {
    n++;
    const num = String(n).padStart(2, '0');
    console.log(`${num}. ${label}`);
    await page.screenshot({ path: `${OUT}/${num}-${label}.png`, fullPage: opts?.fullPage });
  }

  // Load workbench
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await dismissTour();
  await page.waitForTimeout(500);

  // Click Compose tab
  const composeTab = page.getByRole('tab', { name: 'Compose' }).first();
  await composeTab.click({ force: true });
  await page.waitForTimeout(500);

  // Type a message
  const textarea = page.locator('textarea').first();
  await textarea.waitFor({ state: 'visible', timeout: 5000 });
  await textarea.fill('Explain what AgentOS is and list its 4 main features in bullet points.');
  await page.waitForTimeout(200);

  // Send
  const sendBtn = page.getByRole('button', { name: /Send to AgentOS/i }).first();
  await sendBtn.click({ force: true });
  console.log('Message sent...');

  // Capture during streaming at different points
  await page.waitForTimeout(3000);
  await shot('output-streaming-3s');

  await page.waitForTimeout(3000);
  await shot('output-streaming-6s');

  // Wait for completion
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const body = await page.textContent('body');
    if (body?.includes('Completed turn')) break;
  }
  await page.waitForTimeout(1000);
  await shot('output-completed');

  // Now scroll the session inspector panel to show the full response
  // The inspector is in the right column
  try {
    await page.evaluate(() => {
      // Find the session inspector container and scroll it
      const inspectors = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
      inspectors.forEach(el => {
        if (el.scrollHeight > 500) {
          el.scrollTop = 0; // scroll to top first
        }
      });
    });
    await page.waitForTimeout(300);
    await shot('output-inspector-top');

    // Scroll down to see more
    await page.evaluate(() => {
      const inspectors = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
      inspectors.forEach(el => {
        if (el.scrollHeight > 500) {
          el.scrollTop = el.scrollHeight / 2;
        }
      });
    });
    await page.waitForTimeout(300);
    await shot('output-inspector-mid');

    await page.evaluate(() => {
      const inspectors = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
      inspectors.forEach(el => {
        if (el.scrollHeight > 500) {
          el.scrollTop = el.scrollHeight;
        }
      });
    });
    await page.waitForTimeout(300);
    await shot('output-inspector-bottom');
  } catch (e) {
    console.log('Inspector scroll error:', e);
  }

  // Also try full page to capture everything
  await shot('output-fullpage', { fullPage: true });

  // Print the actual response text found on page
  const responseText = await page.evaluate(() => {
    // Look for markdown-rendered content in prose containers
    const proseEls = document.querySelectorAll('.prose');
    let text = '';
    proseEls.forEach(el => { text += el.textContent + '\n'; });
    return text.trim() || 'No prose content found';
  });
  console.log('\n--- RESPONSE TEXT ---');
  console.log(responseText.substring(0, 500));
  console.log('---');

  await browser.close();
  console.log('Done!');
}

main().catch(console.error);
