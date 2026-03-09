import { Page } from 'playwright';
import OpenAI from 'openai';
import { DemoRecorder, CaptionConfig } from './recorder';

const HIGHLIGHT_STYLE = `
  outline: 3px solid #7c3aed;
  outline-offset: 2px;
  box-shadow: 0 0 0 6px rgba(124,58,237,0.35);
  transition: outline 0.15s ease, box-shadow 0.15s ease;
`;

export interface DemoStep {
  action: 'navigate' | 'click' | 'fill' | 'hover' | 'wait' | 'caption' | 'screenshot' | 'scroll' | 'select-tab' | 'zoom';
  selector?: string;
  value?: string;
  timeout?: number;
  caption?: CaptionConfig;
}

export interface DemoScript {
  id: string;
  title: string;
  description: string;
  steps: DemoStep[];
}

export class BrowserAgent {
  private recorder: DemoRecorder;
  private page: Page | null = null;
  private openai: OpenAI | null = null;
  private baseUrl: string;
  private currentDemoId: string | null = null;

  constructor(recorder: DemoRecorder, baseUrl = 'http://localhost:5175') {
    this.recorder = recorder;
    this.baseUrl = baseUrl;

    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  async initialize(demoId?: string): Promise<void> {
    if (demoId) this.currentDemoId = demoId;
    this.page = await this.recorder.initialize();

    await this.page.goto(this.baseUrl);
    await this.page.waitForLoadState('networkidle');

    // Dismiss any tour/intro overlays
    await this.dismissOverlays();

    // Switch to dark mode for best visuals
    try {
      await this.page.click('button[name="Switch to dark mode"]', { timeout: 1500 });
    } catch {
      // Already in dark mode
    }

    // Wait for UI to settle
    await this.page.waitForTimeout(300);
  }

  private async dismissOverlays(): Promise<void> {
    if (!this.page) return;

    const dismissSelectors = [
      'button:has-text("Don\'t show again")',
      'button:has-text("Skip")',
      'button:has-text("Close")',
      'button:has-text("Got it")',
      'button:has-text("Dismiss")',
      '[data-testid="tour-close"]',
      '[aria-label="Close tour"]',
      '[aria-label="Dismiss"]',
    ];

    for (const selector of dismissSelectors) {
      try {
        const btn = await this.page.$(selector);
        if (btn) {
          await btn.click();
          await this.page.waitForTimeout(200);
        }
      } catch {
        // Button not found or not clickable
      }
    }
  }

  async executeScript(script: DemoScript): Promise<string> {
    if (!this.page) throw new Error('Agent not initialized');

    this.currentDemoId = script.id;

    console.log(`[Agent] Executing demo: ${script.title}`);

    await this.recorder.startRecording(script.id);

    // Initial pause for viewer orientation
    await this.page.waitForTimeout(300);

    for (const step of script.steps) {
      await this.executeStep(step);
    }

    // Final pause before stopping
    await this.page.waitForTimeout(2000);

    return await this.recorder.stopRecording(script.id);
  }

  private async executeStep(step: DemoStep): Promise<void> {
    if (!this.page) throw new Error('Page not available');

    console.log(`[Agent] Executing step: ${step.action}`, step.selector || step.value || step.caption?.text || '');

    switch (step.action) {
      case 'navigate':
        if (step.selector) {
          await this.highlight(step.selector);
          await this.page.click(step.selector);
          await this.page.waitForTimeout(200);
        } else if (step.value) {
          await this.page.goto(step.value);
        }
        await this.page.waitForLoadState('networkidle');
        break;

      case 'click':
        if (!step.selector) throw new Error('Click requires selector');
        try {
          await this.highlight(step.selector);
          await this.page.click(step.selector, { timeout: step.timeout ?? 5000 });
        } catch (err: any) {
          console.warn(`[Agent] Click failed for "${step.selector}": ${err.message?.split('\n')[0]}`);
        }
        await this.page.waitForTimeout(250);
        break;

      case 'fill':
        if (!step.selector || !step.value) throw new Error('Fill requires selector and value');
        await this.page.click(step.selector);
        await this.page.waitForTimeout(80);
        await this.page.fill(step.selector, '');
        await this.page.type(step.selector, step.value, { delay: 10 });
        await this.page.waitForTimeout(100);
        break;

      case 'hover':
        if (!step.selector) throw new Error('Hover requires selector');
        await this.highlight(step.selector);
        await this.page.hover(step.selector);
        await this.page.waitForTimeout(step.timeout || 500);
        break;

      case 'wait':
        if (step.selector) {
          await this.page.waitForSelector(step.selector, { timeout: step.timeout || 30000 });
        } else {
          await this.page.waitForTimeout(step.timeout || 1000);
        }
        break;

      case 'caption':
        if (!step.caption) throw new Error('Caption step requires caption config');
        await this.recorder.showCaption(step.caption);
        await this.page.waitForTimeout(step.caption.duration + 300);
        break;

      case 'screenshot': {
        const screenshotPath = `./output/debug-${Date.now()}.png`;
        await this.page.screenshot({ path: screenshotPath });
        console.log(`[Agent] Screenshot saved: ${screenshotPath}`);
        break;
      }

      case 'scroll':
        if (!step.selector) throw new Error('Scroll requires selector');
        {
          const scrollAmount = parseInt(step.value || '300', 10);
          await this.page.$eval(
            step.selector,
            (el: Element, amount: number) => {
              el.scrollTop += amount;
            },
            scrollAmount,
          );
        }
        await this.page.waitForTimeout(step.timeout ?? 300);
        break;

      case 'select-tab':
        if (!step.value) throw new Error('select-tab requires value (tab name)');
        {
          const tabSelector = `role=tab[name=/${step.value}/i]`;
          await this.highlight(tabSelector);
          await this.page.getByRole('tab', { name: new RegExp(step.value, 'i') }).click();
        }
        await this.page.waitForTimeout(step.timeout ?? 300);
        break;

      case 'zoom': {
        const level = parseFloat(step.value || '1');
        // Smooth defaults: 1200ms zoom-in, 900ms zoom-out
        const duration = step.timeout ?? (level === 1 ? 900 : 1200);
        // Gentle easing — slow start, smooth deceleration
        const easing = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

        if (level === 1) {
          // Zoom out — reset
          await this.page.evaluate(({ ms, ease }: { ms: number; ease: string }) => {
            const el = document.documentElement;
            el.style.transition = `transform ${ms}ms ${ease}`;
            el.style.transformOrigin = 'center center';
            el.style.transform = 'scale(1)';
          }, { ms: duration, ease: easing });
        } else if (step.selector) {
          // Zoom toward a specific element
          try {
            const box = await this.page.locator(step.selector).first().boundingBox();
            const vp = this.page.viewportSize();
            if (box && vp) {
              const cx = box.x + box.width / 2;
              const cy = box.y + box.height / 2;
              const ox = (cx / vp.width) * 100;
              const oy = (cy / vp.height) * 100;
              await this.page.evaluate(
                ({ l, oxx, oyy, ms, ease }: { l: number; oxx: number; oyy: number; ms: number; ease: string }) => {
                  const el = document.documentElement;
                  el.style.transition = `transform ${ms}ms ${ease}`;
                  el.style.transformOrigin = `${oxx}% ${oyy}%`;
                  el.style.transform = `scale(${l})`;
                },
                { l: level, oxx: ox, oyy: oy, ms: duration, ease: easing },
              );
            }
          } catch (err: any) {
            console.warn(`[Agent] Zoom target not found: ${step.selector}`);
          }
        } else {
          // Zoom center
          await this.page.evaluate(
            ({ l, ms, ease }: { l: number; ms: number; ease: string }) => {
              const el = document.documentElement;
              el.style.transition = `transform ${ms}ms ${ease}`;
              el.style.transformOrigin = 'center center';
              el.style.transform = `scale(${l})`;
            },
            { l: level, ms: duration, ease: easing },
          );
        }
        await this.page.waitForTimeout(duration + 200);
        break;
      }
    }
  }

  async cleanup(): Promise<void> {
    await this.recorder.cleanup();
  }

  private async highlight(selector: string): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.$eval(
        selector,
        (el, style) => {
          const node = el as HTMLElement;
          if (!node) return;
          const original = node.getAttribute('style') || '';
          node.setAttribute('style', `${original}; ${style}`);
          setTimeout(() => {
            node.setAttribute('style', original);
          }, 1200);
        },
        HIGHLIGHT_STYLE
      );
    } catch {
      // Element not found — skip highlight
    }
  }
}

// ---------------------------------------------------------------------------
// Pre-defined demo scripts — 8 workbench recordings with zoom effects
// ---------------------------------------------------------------------------
export const DEMO_SCRIPTS: Record<string, DemoScript> = {

  // D1: Streaming Session Inspector (~28s)
  'streaming': {
    id: 'streaming',
    title: 'Streaming Session Inspector',
    description: 'Watch every SSE chunk arrive, color-coded by type, with live telemetry',
    steps: [
      { action: 'caption', caption: { text: 'Streaming Session Inspector', duration: 2000, position: 'bottom', style: 'highlight' } },
      { action: 'wait', timeout: 500 },
      { action: 'select-tab', value: 'Compose' },
      { action: 'caption', caption: { text: 'Type your prompt in the Compose panel', duration: 2500, position: 'bottom' } },
      { action: 'fill', selector: 'textarea', value: 'What are the latest breakthroughs in quantum computing?' },
      { action: 'wait', timeout: 600 },
      { action: 'caption', caption: { text: 'Hit Send to start streaming', duration: 1500, position: 'bottom' } },
      { action: 'click', selector: 'button[type="submit"]' },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: 'Watch every chunk arrive in real-time', duration: 3000, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 8000 },
      { action: 'caption', caption: { text: 'Color-coded by type: text, tools, metadata', duration: 2500, position: 'bottom' } },
      { action: 'wait', timeout: 3000 },
      { action: 'caption', caption: { text: 'Full telemetry tracked in the bottom bar', duration: 2000, position: 'bottom', style: 'success' } },
      { action: 'wait', timeout: 1500 },
    ],
  },

  // D2: Multi-Agent Orchestration (~28s)
  'agency': {
    id: 'agency',
    title: 'Multi-Agent Orchestration',
    description: 'Configure an agency with specialized roles and execute tasks in parallel',
    steps: [
      { action: 'caption', caption: { text: 'Multi-Agent Orchestration', duration: 2000, position: 'bottom', style: 'highlight' } },
      { action: 'wait', timeout: 500 },
      { action: 'select-tab', value: 'Agency' },
      { action: 'wait', timeout: 400 },
      { action: 'caption', caption: { text: 'Configure an agency with specialized roles', duration: 2500, position: 'bottom' } },
      { action: 'wait', timeout: 1500 },
      { action: 'caption', caption: { text: 'Assign tasks using delegation syntax', duration: 2500, position: 'bottom', style: 'code' } },
      { action: 'fill', selector: 'textarea', value: '[Research Analyst] Survey recent advances in RAG architectures\n[Code Architect] Design the retrieval pipeline' },
      { action: 'wait', timeout: 800 },
      { action: 'caption', caption: { text: 'Execute the agency', duration: 1500, position: 'bottom' } },
      { action: 'click', selector: 'button[type="submit"]', timeout: 300 },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: 'Watch agents execute tasks in parallel', duration: 3000, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 8000 },
      { action: 'caption', caption: { text: 'Aggregated results from all agents', duration: 2000, position: 'bottom', style: 'success' } },
      { action: 'wait', timeout: 2000 },
    ],
  },

  // D3: Persona Catalog & Wizard — Full End-to-End (~50s)
  'personas': {
    id: 'personas',
    title: 'Persona Catalog & Wizard',
    description: 'Browse the catalog, then create a persona step-by-step through the full wizard',
    steps: [
      { action: 'caption', caption: { text: 'Persona Catalog & Wizard', duration: 2000, position: 'bottom', style: 'highlight' } },
      { action: 'wait', timeout: 500 },
      { action: 'select-tab', value: 'Personas' },
      { action: 'wait', timeout: 800 },
      { action: 'caption', caption: { text: 'Browse the persona catalog', duration: 2500, position: 'bottom' } },
      { action: 'wait', timeout: 2500 },

      // Open the wizard
      { action: 'caption', caption: { text: 'Open the creation wizard', duration: 2000, position: 'bottom' } },
      { action: 'click', selector: 'button:has-text("Wizard"), button:has-text("Create"), button:has-text("New")', timeout: 2000 },
      { action: 'wait', timeout: 800 },

      // STEP 1: Basics
      { action: 'caption', caption: { text: 'Step 1 — Name, description, tags, and traits', duration: 2500, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 500 },
      { action: 'fill', selector: 'input[placeholder="Research Assistant"]', value: 'Market Intelligence Analyst' },
      { action: 'wait', timeout: 400 },
      { action: 'fill', selector: 'textarea[placeholder*="Expert at gathering"]', value: 'Expert at market research, competitive analysis, and trend forecasting with deep domain knowledge.' },
      { action: 'wait', timeout: 400 },
      { action: 'fill', selector: 'input[placeholder="research, analysis, web-search"]', value: 'research, finance, competitive-intel, trends' },
      { action: 'wait', timeout: 400 },
      { action: 'fill', selector: 'input[placeholder="analytical, thorough, curious"]', value: 'analytical, data-driven, strategic, concise' },
      { action: 'wait', timeout: 800 },

      // Click Next
      { action: 'click', selector: 'button:has-text("Next")' },
      { action: 'wait', timeout: 600 },

      // STEP 2: Config
      { action: 'caption', caption: { text: 'Step 2 — System prompt, model, and cost strategy', duration: 2500, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 500 },
      { action: 'fill', selector: 'textarea[placeholder*="You are a helpful"]', value: 'You are a senior market intelligence analyst. Provide data-backed insights, cite sources, and quantify trends when possible. Focus on actionable intelligence.' },
      { action: 'wait', timeout: 600 },
      { action: 'click', selector: 'option[value="claude-3-5-sonnet"]', timeout: 500 },
      { action: 'wait', timeout: 400 },
      { action: 'fill', selector: 'input[placeholder="8192"]', value: '16384' },
      { action: 'wait', timeout: 800 },

      // Click Next
      { action: 'click', selector: 'button:has-text("Next")' },
      { action: 'wait', timeout: 600 },

      // STEP 3: Guardrails
      { action: 'caption', caption: { text: 'Step 3 — Safety guardrails and compliance', duration: 2500, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 500 },
      { action: 'click', selector: 'label:has-text("PII Protection") input[type="checkbox"]', timeout: 500 },
      { action: 'wait', timeout: 400 },
      { action: 'click', selector: 'label:has-text("Cost Ceiling") input[type="checkbox"]', timeout: 500 },
      { action: 'wait', timeout: 800 },
      { action: 'caption', caption: { text: '2 guardrails enabled — PII Protection & Cost Ceiling', duration: 2000, position: 'bottom', style: 'success' } },
      { action: 'wait', timeout: 800 },

      // Click Next
      { action: 'click', selector: 'button:has-text("Next")' },
      { action: 'wait', timeout: 600 },

      // STEP 4: Extensions
      { action: 'caption', caption: { text: 'Step 4 — Attach tools and integrations', duration: 2500, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 500 },
      { action: 'click', selector: 'label:has-text("Web Search") input[type="checkbox"]', timeout: 500 },
      { action: 'wait', timeout: 400 },
      { action: 'click', selector: 'label:has-text("Code Executor") input[type="checkbox"]', timeout: 500 },
      { action: 'wait', timeout: 600 },
      { action: 'caption', caption: { text: 'Web Search + Code Executor enabled', duration: 2000, position: 'bottom', style: 'success' } },
      { action: 'wait', timeout: 800 },

      // Create the persona
      { action: 'caption', caption: { text: 'Finalize and create the persona', duration: 2000, position: 'bottom', style: 'highlight' } },
      { action: 'click', selector: 'button:has-text("Create Persona")' },
      { action: 'wait', timeout: 1000 },
      { action: 'caption', caption: { text: 'Market Intelligence Analyst — ready for sessions', duration: 2500, position: 'bottom', style: 'success' } },
      { action: 'wait', timeout: 2000 },

      // USE THE PERSONA — switch to Compose and interact
      { action: 'select-tab', value: 'Compose' },
      { action: 'wait', timeout: 800 },
      { action: 'caption', caption: { text: 'Now use the persona — ask it a question', duration: 2000, position: 'bottom' } },
      { action: 'fill', selector: 'textarea', value: 'What are the top 3 emerging market trends in AI infrastructure for 2026?' },
      { action: 'wait', timeout: 600 },
      { action: 'click', selector: 'button[type="submit"]' },
      { action: 'wait', timeout: 8000 },
      { action: 'caption', caption: { text: 'Streaming response from Market Intelligence Analyst', duration: 3000, position: 'bottom', style: 'success' } },
      { action: 'wait', timeout: 3000 },
    ],
  },

  // D4: Workflow Execution & Planning (~28s)
  'workflows': {
    id: 'workflows',
    title: 'Workflow Execution & Planning',
    description: 'Browse workflows by status, inspect timelines, and control execution',
    steps: [
      { action: 'caption', caption: { text: 'Workflow Execution & Planning', duration: 2000, position: 'bottom', style: 'highlight' } },
      { action: 'wait', timeout: 500 },
      { action: 'select-tab', value: 'Workflow' },
      { action: 'wait', timeout: 500 },
      { action: 'caption', caption: { text: 'Browse workflows by status', duration: 2500, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: 'Inspect the execution timeline', duration: 2500, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      { action: 'select-tab', value: 'Planning' },
      { action: 'wait', timeout: 500 },
      { action: 'caption', caption: { text: 'Planning view with confidence scores', duration: 2500, position: 'bottom', style: 'code' } },
      // Zoom into planning steps
      { action: 'zoom', selector: 'main#main-content', value: '1.3' },
      { action: 'wait', timeout: 2500 },
      { action: 'zoom', value: '1' },
      { action: 'caption', caption: { text: 'Control execution — pause, resume, advance', duration: 2000, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: 'Visual step-by-step execution', duration: 1800, position: 'bottom', style: 'success' } },
      { action: 'wait', timeout: 1200 },
    ],
  },

  // D5: Telemetry & Health (~22s)
  'telemetry': {
    id: 'telemetry',
    title: 'Telemetry & Health Dashboard',
    description: 'Real-time token tracking, cost analytics, and KPI monitoring',
    steps: [
      { action: 'caption', caption: { text: 'Telemetry & Health Dashboard', duration: 2000, position: 'bottom', style: 'highlight' } },
      { action: 'wait', timeout: 500 },
      { action: 'select-tab', value: 'Compose' },
      { action: 'fill', selector: 'textarea', value: 'Analyze the cost breakdown of this session.' },
      { action: 'click', selector: 'button[type="submit"]', timeout: 200 },
      { action: 'wait', timeout: 4000 },
      { action: 'caption', caption: { text: 'Real-time token and cost tracking', duration: 2500, position: 'bottom', style: 'code' } },
      // Zoom into telemetry counters in the main content
      { action: 'zoom', selector: 'main#main-content', value: '1.3' },
      { action: 'wait', timeout: 6000 },
      { action: 'zoom', value: '1' },
      { action: 'caption', caption: { text: 'Model analytics with pricing breakdown', duration: 2500, position: 'bottom' } },
      { action: 'wait', timeout: 2500 },
      { action: 'caption', caption: { text: 'Task outcome KPIs and alert thresholds', duration: 2500, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: 'Real-time monitoring', duration: 1800, position: 'bottom', style: 'success' } },
      { action: 'wait', timeout: 1200 },
    ],
  },

  // D6: Theme & Customization (~18s)
  'themes': {
    id: 'themes',
    title: 'Theme & Customization',
    description: 'Switch palettes, densities, and light/dark modes',
    steps: [
      { action: 'caption', caption: { text: 'Theme & Customization', duration: 2000, position: 'bottom', style: 'highlight' } },
      { action: 'wait', timeout: 500 },
      // Zoom into the theme toggle button
      { action: 'zoom', selector: 'button[title="Switch to light mode"]', value: '1.35' },
      { action: 'wait', timeout: 800 },
      { action: 'click', selector: 'button[title="Switch to light mode"]', timeout: 2000 },
      { action: 'wait', timeout: 400 },
      { action: 'zoom', value: '1' },
      { action: 'caption', caption: { text: 'Switch between Light, Dark, and System modes', duration: 2500, position: 'bottom' } },
      { action: 'wait', timeout: 1500 },
      // Toggle back to dark
      { action: 'click', selector: 'button[title="Switch to dark mode"]', timeout: 2000 },
      { action: 'wait', timeout: 1000 },
      { action: 'caption', caption: { text: '9 palettes, 3 densities', duration: 2000, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: 'Fully customizable appearance', duration: 1800, position: 'bottom', style: 'success' } },
      { action: 'wait', timeout: 1200 },
    ],
  },

  // D7: Evaluation Runner (~22s)
  'evaluation': {
    id: 'evaluation',
    title: 'Evaluation Runner',
    description: 'Run evaluations, watch tests resolve, and review detailed metrics',
    steps: [
      { action: 'caption', caption: { text: 'Evaluation Runner', duration: 2000, position: 'bottom', style: 'highlight' } },
      { action: 'wait', timeout: 500 },
      { action: 'select-tab', value: 'Evaluation' },
      { action: 'wait', timeout: 500 },
      { action: 'caption', caption: { text: 'Browse past evaluation runs', duration: 2500, position: 'bottom' } },
      // Zoom into evaluation runs list
      { action: 'zoom', selector: 'main#main-content', value: '1.3' },
      { action: 'wait', timeout: 2000 },
      { action: 'zoom', value: '1' },
      { action: 'caption', caption: { text: 'Start a new evaluation', duration: 2000, position: 'bottom' } },
      { action: 'click', selector: 'button:has-text("Run"), button:has-text("New"), button:has-text("Start")', timeout: 500 },
      { action: 'wait', timeout: 1000 },
      { action: 'caption', caption: { text: 'Watch tests resolve pass/fail', duration: 2500, position: 'bottom', style: 'code' } },
      // Zoom into test results
      { action: 'zoom', selector: 'main#main-content', value: '1.25' },
      { action: 'wait', timeout: 2500 },
      { action: 'zoom', value: '1' },
      { action: 'caption', caption: { text: 'Detailed metrics per test case', duration: 2000, position: 'bottom', style: 'success' } },
      { action: 'wait', timeout: 1500 },
    ],
  },

  // D8: Export/Import & Sessions (~20s)
  'export-import': {
    id: 'export-import',
    title: 'Export, Import & Session Management',
    description: 'Manage sessions, export data as JSON, and import configurations',
    steps: [
      { action: 'caption', caption: { text: 'Export, Import & Session Management', duration: 2000, position: 'bottom', style: 'highlight' } },
      { action: 'wait', timeout: 500 },
      // Trigger a stream so we have session data
      { action: 'select-tab', value: 'Compose' },
      { action: 'fill', selector: 'textarea', value: 'Summarize this session for export.' },
      { action: 'click', selector: 'button[type="submit"]', timeout: 300 },
      { action: 'wait', timeout: 6000 },
      { action: 'caption', caption: { text: 'Manage sessions from the sidebar', duration: 2500, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: 'Export session data as JSON', duration: 2500, position: 'bottom', style: 'code' } },
      // Zoom into the export dropdown
      { action: 'zoom', selector: 'select[aria-label="Export"]', value: '1.35' },
      { action: 'click', selector: 'select[aria-label="Export"]', timeout: 2000 },
      { action: 'wait', timeout: 1500 },
      { action: 'zoom', value: '1' },
      { action: 'caption', caption: { text: 'Session, agency, workflow, and full export options', duration: 2500, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      // Open settings
      { action: 'click', selector: 'button:has-text("Settings")', timeout: 2000 },
      { action: 'wait', timeout: 500 },
      { action: 'caption', caption: { text: 'Configure providers and storage', duration: 2000, position: 'bottom' } },
      // Zoom into settings panel
      { action: 'zoom', selector: 'div[role="dialog"]', value: '1.25' },
      { action: 'wait', timeout: 1500 },
      { action: 'zoom', value: '1' },
      { action: 'caption', caption: { text: 'Full data portability', duration: 1800, position: 'bottom', style: 'success' } },
      { action: 'wait', timeout: 1200 },
    ],
  },
};

export default BrowserAgent;
