import { chromium } from '@playwright/test';
import path from 'path';

const BASE = 'http://localhost:5175';
const LANDING = 'http://localhost:3012';
const OUT = path.resolve('screenshots-e2e');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  async function dismissDialogs() {
    for (let i = 0; i < 3; i++) {
      const count = await page.locator('[role="dialog"]').count();
      if (count === 0) break;
      try {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } catch {}
    }
  }

  async function dismissTour() {
    try {
      const btn = page.getByRole('button', { name: /Don.t show again/i }).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click({ force: true });
        await page.waitForTimeout(300);
      }
    } catch {}
    await dismissDialogs();
  }

  async function clickTab(name: string) {
    await dismissDialogs();
    const tab = page.getByRole('tab', { name }).first();
    await tab.click({ force: true });
    await page.waitForTimeout(600);
  }

  let n = 0;
  async function shot(label: string, opts?: { fullPage?: boolean }) {
    n++;
    const num = String(n).padStart(2, '0');
    const filename = `${num}-${label}.png`;
    console.log(`${num}. ${label}`);
    await page.screenshot({ path: `${OUT}/${filename}`, fullPage: opts?.fullPage });
  }

  // ══════════════════════════════════════════════════════
  // WORKBENCH — ALL TABS
  // ══════════════════════════════════════════════════════
  console.log('=== WORKBENCH TABS ===');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  await dismissTour();
  await page.waitForTimeout(500);

  await clickTab('Compose');
  await shot('compose-tab');

  await clickTab('Personas');
  await shot('personas-tab');

  await clickTab('Agency');
  await shot('agency-tab');

  await clickTab('Workflows');
  await shot('workflows-tab');

  await clickTab('Evaluation');
  await shot('evaluation-tab');

  await clickTab('Planning');
  await shot('planning-tab');

  // ══════════════════════════════════════════════════════
  // WORKBENCH — SETTINGS / ABOUT / THEME / IMPORT
  // ══════════════════════════════════════════════════════
  console.log('\n=== DIALOGS ===');

  const dialogButtons = ['Settings', 'About', 'Theme', 'Import'];
  for (const name of dialogButtons) {
    try {
      await dismissDialogs();
      const btn = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first();
      if (await btn.isVisible({ timeout: 1000 })) {
        await btn.click({ force: true });
        await page.waitForTimeout(600);
        await shot(`${name.toLowerCase()}-panel`);
        await dismissDialogs();
      }
    } catch { console.log(`  (${name} not found)`); }
  }

  // ══════════════════════════════════════════════════════
  // LIVE CHAT — SEND, STREAM, COMPLETE, INSPECT
  // ══════════════════════════════════════════════════════
  console.log('\n=== LIVE CHAT (gpt-4o) ===');
  // Fresh page load to clear any lingering dialogs
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  await dismissTour();
  await clickTab('Compose');
  await page.waitForTimeout(500);

  const textarea = page.locator('textarea').first();
  await textarea.waitFor({ state: 'visible', timeout: 5000 });
  await textarea.fill('List the 7 layers of the OSI model. Keep it brief — one sentence per layer.');
  await page.waitForTimeout(200);
  await shot('chat-message-typed');

  // Click Send
  const sendBtn = page.getByRole('button', { name: /Send to AgentOS/i }).first();
  await sendBtn.click({ force: true });
  console.log('  Message sent, streaming...');

  // Capture streaming in progress
  await page.waitForTimeout(2500);
  await shot('chat-streaming');

  // Wait for completion
  let completed = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const body = await page.textContent('body');
    if (body?.includes('Completed turn')) {
      console.log(`  Response completed after ~${i + 3}s`);
      completed = true;
      break;
    }
  }
  if (!completed) console.log('  (timed out waiting for completion)');

  await page.waitForTimeout(500);
  await shot('chat-completed');

  // Click the session entry in sidebar to open inspector
  try {
    const sessionEl = page.locator('text=Completed turn').first();
    if (await sessionEl.isVisible({ timeout: 1000 })) {
      await sessionEl.click({ force: true });
      await page.waitForTimeout(800);
    }
  } catch {}
  await shot('session-inspector');

  // Click "All data" tab in session inspector if it exists
  try {
    for (const tabName of ['All data', 'Transcript', 'Raw', 'Stream debug']) {
      const tab = page.locator('button').filter({ hasText: new RegExp(tabName, 'i') }).first();
      if (await tab.isVisible({ timeout: 500 })) {
        await tab.click({ force: true });
        await page.waitForTimeout(500);
        await shot(`session-${tabName.toLowerCase().replace(/\s/g, '-')}`);
        break;
      }
    }
  } catch {}

  // ══════════════════════════════════════════════════════
  // DARK MODE
  // ══════════════════════════════════════════════════════
  console.log('\n=== DARK MODE ===');
  await dismissDialogs();

  // Open theme panel and click Dark
  try {
    const themeBtn = page.getByRole('button', { name: /^Theme$/i }).first();
    await themeBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Click the Dark button/pill
    const darkOption = page.locator('button').filter({ hasText: /^Dark$/ }).first();
    if (await darkOption.isVisible({ timeout: 1000 })) {
      await darkOption.click({ force: true });
      await page.waitForTimeout(500);
    }
    await dismissDialogs();
  } catch { console.log('  (dark mode switch failed)'); }

  await page.waitForTimeout(300);
  await clickTab('Compose');
  await shot('dark-compose');

  await clickTab('Personas');
  await shot('dark-personas');

  await clickTab('Agency');
  await shot('dark-agency');

  // Switch back to light
  try {
    const themeBtn = page.getByRole('button', { name: /^Theme$/i }).first();
    await themeBtn.click({ force: true });
    await page.waitForTimeout(500);
    const lightOption = page.locator('button').filter({ hasText: /^Light$/ }).first();
    if (await lightOption.isVisible({ timeout: 1000 })) {
      await lightOption.click({ force: true });
      await page.waitForTimeout(300);
    }
    await dismissDialogs();
  } catch {}

  // ══════════════════════════════════════════════════════
  // LANDING PAGE — SCROLL THROUGH EVERYTHING
  // ══════════════════════════════════════════════════════
  console.log('\n=== LANDING PAGE ===');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LANDING, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot('landing-hero');

  // Scroll in increments to capture each section
  const scrollSteps = [
    'landing-stats',
    'landing-demo',
    'landing-features',
    'landing-usecases',
    'landing-channels',
    'landing-presets',
    'landing-ecosystem',
    'landing-footer',
  ];
  for (const label of scrollSteps) {
    await page.evaluate(() => window.scrollBy(0, 900));
    await page.waitForTimeout(600);
    await shot(label);
  }

  // Full page
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await shot('landing-fullpage', { fullPage: true });

  // ══════════════════════════════════════════════════════
  // MOBILE
  // ══════════════════════════════════════════════════════
  console.log('\n=== MOBILE (390×844) ===');
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1000);
  await dismissTour();
  await page.waitForTimeout(300);
  await shot('mobile-workbench');

  await page.goto(LANDING, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot('mobile-landing');

  await browser.close();
  const files = await (await import('fs')).promises.readdir(OUT);
  console.log(`\n✓ ${files.length} screenshots → ${OUT}/`);
}

main().catch(console.error);
