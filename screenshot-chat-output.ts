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

  // Click Compose tab
  const composeTab = page.getByRole('tab', { name: 'Compose' }).first();
  if (await composeTab.isVisible({ timeout: 2000 })) {
    await composeTab.click({ force: true });
    await page.waitForTimeout(600);
  }

  // Type and send
  const textarea = page.locator('textarea').first();
  await textarea.click();
  await textarea.fill('List the 7 layers of the OSI model with a brief description of each');
  await page.waitForTimeout(300);

  const sendBtn = page.getByRole('button', { name: /Send to AgentOS/i }).first();
  await sendBtn.click({ force: true });
  console.log('Sent message, waiting for response...');

  // Wait for streaming to complete (watch for IDLE status or Completed turn)
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const pageText = await page.textContent('body');
    if (pageText?.includes('Completed turn')) {
      console.log(`Response completed after ${i+1}s`);
      break;
    }
    if (i % 5 === 0) console.log(`  waiting... ${i}s`);
  }

  await page.waitForTimeout(1000);

  // Screenshot the full workbench with response
  await page.screenshot({ path: `${OUT}/output-01-completed.png` });
  console.log('1. Full workbench after completion');

  // Now click on the session in the sidebar to see the transcript
  try {
    const sessionItem = page.locator('.session-item, [class*="session"], [class*="Session"]').first();
    if (await sessionItem.isVisible({ timeout: 1000 })) {
      await sessionItem.click({ force: true });
      await page.waitForTimeout(500);
    }
  } catch {}

  // Try to find and expand the response/transcript area
  // Look for the session inspector or transcript viewer
  try {
    const transcriptBtn = page.locator('button:has-text("Transcript"), button:has-text("transcript"), [aria-label*="transcript" i]').first();
    if (await transcriptBtn.isVisible({ timeout: 1000 })) {
      await transcriptBtn.click({ force: true });
      await page.waitForTimeout(500);
    }
  } catch {}

  await page.screenshot({ path: `${OUT}/output-02-session-detail.png` });
  console.log('2. Session detail view');

  // Scroll down in the main content area to see response text
  await page.evaluate(() => {
    const main = document.querySelector('main') || document.querySelector('[class*="content"]') || document.body;
    main.scrollTop = main.scrollHeight;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/output-03-scrolled.png` });
  console.log('3. Scrolled to bottom');

  // Try to find the session inspector panel with response content
  // Look for elements containing the actual LLM response text
  const responseText = await page.evaluate(() => {
    const allText = document.body.innerText;
    // Find text that looks like OSI model content
    const match = allText.match(/(Layer|Physical|Data Link|Network|Transport|Session|Presentation|Application)[\s\S]{0,2000}/);
    return match ? match[0].substring(0, 500) : 'Response text not found in DOM';
  });
  console.log('Response content found:', responseText.substring(0, 200));

  // Take a tall screenshot to capture everything
  await page.screenshot({ path: `${OUT}/output-04-fullpage.png`, fullPage: true });
  console.log('4. Full page screenshot');

  // Also try clicking the session entry in sidebar to see inspector
  try {
    const entry = page.locator('text=atlas-systems-architect').first();
    if (await entry.isVisible({ timeout: 1000 })) {
      await entry.click({ force: true });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/output-05-inspector.png` });
      console.log('5. Session inspector view');
    }
  } catch {}

  await browser.close();
  console.log('Done!');
}

main().catch(console.error);
