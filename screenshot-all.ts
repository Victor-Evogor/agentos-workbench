import { chromium } from '@playwright/test';
import path from 'path';

const BASE = 'http://localhost:5175';
const LANDING = 'http://localhost:3012';
const OUT = path.resolve('screenshots-e2e');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  async function closeAnyDialog() {
    // Close any open modal dialog
    for (let i = 0; i < 3; i++) {
      try {
        const dialog = page.locator('[role="dialog"]').first();
        if (await dialog.isVisible({ timeout: 300 })) {
          const closeBtn = dialog.getByRole('button', { name: /close/i }).first();
          if (await closeBtn.isVisible({ timeout: 300 })) {
            await closeBtn.click({ force: true });
            await page.waitForTimeout(200);
          } else {
            // Press Escape
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
          }
        }
      } catch {}
    }
  }

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

  async function clickTab(name: string) {
    await closeAnyDialog();
    const tab = page.getByRole('tab', { name }).first();
    if (await tab.isVisible({ timeout: 2000 })) {
      await tab.click({ force: true });
      await page.waitForTimeout(600);
    }
  }

  // ── WORKBENCH ──────────────────────────────────────────
  console.log('Opening workbench...');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await dismissTour();
  await page.waitForTimeout(500);

  // 1. Compose tab
  console.log('1. Compose tab');
  await clickTab('Compose');
  await page.screenshot({ path: `${OUT}/01-compose-tab.png` });

  // 2. Personas tab
  console.log('2. Personas tab');
  await clickTab('Personas');
  await page.screenshot({ path: `${OUT}/02-personas-tab.png` });

  // 3. Agency tab
  console.log('3. Agency tab');
  await clickTab('Agency');
  await page.screenshot({ path: `${OUT}/03-agency-tab.png` });

  // 4. Workflows tab
  console.log('4. Workflows tab');
  await clickTab('Workflows');
  await page.screenshot({ path: `${OUT}/04-workflows-tab.png` });

  // 5. Evaluation tab
  console.log('5. Evaluation tab');
  await clickTab('Evaluation');
  await page.screenshot({ path: `${OUT}/05-evaluation-tab.png` });

  // 6. Planning tab
  console.log('6. Planning tab');
  await clickTab('Planning');
  await page.screenshot({ path: `${OUT}/06-planning-tab.png` });

  // 7. Settings panel
  console.log('7. Settings panel');
  try {
    const settingsBtn = page.getByRole('button', { name: /settings/i }).first();
    if (await settingsBtn.isVisible({ timeout: 1000 })) {
      await settingsBtn.click({ force: true });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/07-settings-panel.png` });
      await closeAnyDialog();
    }
  } catch { console.log('  (settings not found)'); }

  // 8. About panel
  console.log('8. About panel');
  try {
    const aboutBtn = page.getByRole('button', { name: /about/i }).first();
    if (await aboutBtn.isVisible({ timeout: 1000 })) {
      await aboutBtn.click({ force: true });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/08-about-panel.png` });
      await closeAnyDialog();
    }
  } catch { console.log('  (about not found)'); }

  // 9. Theme panel
  console.log('9. Theme panel');
  try {
    const themeBtn = page.getByRole('button', { name: /theme/i }).first();
    if (await themeBtn.isVisible({ timeout: 1000 })) {
      await themeBtn.click({ force: true });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/09-theme-panel.png` });
      await closeAnyDialog();
    }
  } catch { console.log('  (theme not found)'); }

  // 10. Import panel
  console.log('10. Import panel');
  try {
    const importBtn = page.getByRole('button', { name: /import/i }).first();
    if (await importBtn.isVisible({ timeout: 1000 })) {
      await importBtn.click({ force: true });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/10-import-panel.png` });
      await closeAnyDialog();
    }
  } catch { console.log('  (import not found)'); }

  // 11. Persona wizard
  console.log('11. Persona wizard');
  await clickTab('Personas');
  await page.waitForTimeout(300);
  try {
    const wizardArea = page.locator('text=Quick add').first();
    if (await wizardArea.isVisible({ timeout: 1000 })) {
      await wizardArea.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/11-persona-wizard.png` });
    }
  } catch { console.log('  (wizard not found)'); }

  // 12. Dark mode - compose
  console.log('12. Dark mode compose');
  await closeAnyDialog();
  // Use the header theme toggle
  try {
    const headerTheme = page.locator('header button:has-text("Theme"), header [aria-label*="theme" i]').first();
    if (await headerTheme.isVisible({ timeout: 1000 })) {
      await headerTheme.click({ force: true });
      await page.waitForTimeout(400);
    }
  } catch {}
  await clickTab('Compose');
  await page.screenshot({ path: `${OUT}/12-dark-compose.png` });

  // 13. Dark mode - personas
  console.log('13. Dark mode personas');
  await clickTab('Personas');
  await page.screenshot({ path: `${OUT}/13-dark-personas.png` });

  // Switch back to light
  try {
    const headerTheme = page.locator('header button:has-text("Theme"), header [aria-label*="theme" i]').first();
    if (await headerTheme.isVisible({ timeout: 1000 })) {
      await headerTheme.click({ force: true });
      await page.waitForTimeout(400);
    }
  } catch {}

  // ── LANDING PAGE ───────────────────────────────────────
  console.log('14. Landing hero');
  await page.goto(LANDING, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/14-landing-hero.png` });

  // 15. Scroll to features section
  console.log('15. Landing features');
  await page.evaluate(() => window.scrollBy(0, 800));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/15-landing-features.png` });

  // 16. Scroll further to stats
  console.log('16. Landing stats');
  await page.evaluate(() => window.scrollBy(0, 800));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/16-landing-stats.png` });

  // 17. Scroll to catalog
  console.log('17. Landing catalog');
  await page.evaluate(() => window.scrollBy(0, 800));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/17-landing-catalog.png` });

  // 18. More catalog
  console.log('18. Landing catalog continued');
  await page.evaluate(() => window.scrollBy(0, 800));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/18-landing-catalog2.png` });

  // 19. Full landing page
  console.log('19. Landing full page');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/19-landing-fullpage.png`, fullPage: true });

  // ── MOBILE ─────────────────────────────────────────────
  console.log('20. Mobile workbench');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await dismissTour();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/20-mobile-workbench.png` });

  console.log('21. Mobile landing');
  await page.goto(LANDING, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/21-mobile-landing.png` });

  await browser.close();
  console.log(`\nDone! ${await (await import('fs')).promises.readdir(OUT).then(f => f.length)} screenshots saved to ${OUT}/`);
}

main().catch(console.error);
