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
  action: 'navigate' | 'click' | 'fill' | 'hover' | 'wait' | 'caption' | 'screenshot';
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

  constructor(recorder: DemoRecorder, baseUrl = 'http://localhost:5175') {
    this.recorder = recorder;
    this.baseUrl = baseUrl;

    // Initialize OpenAI if API key available (for dynamic demos)
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  async initialize(): Promise<void> {
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
    
    // Wait a beat for UI to settle
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

    console.log(`[Agent] Executing demo: ${script.title}`);
    
    // Start recording
    await this.recorder.startRecording(script.id);
    
    // Initial pause for viewer orientation
    await this.page.waitForTimeout(300);

    for (const step of script.steps) {
      await this.executeStep(step);
    }

    // Final pause before stopping
    await this.page.waitForTimeout(2000);

    // Stop recording and return video path
    return await this.recorder.stopRecording(script.id);
  }

  private async executeStep(step: DemoStep): Promise<void> {
    if (!this.page) throw new Error('Page not available');

    console.log(`[Agent] Executing step: ${step.action}`, step.selector || step.caption?.text || '');

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
        await this.highlight(step.selector);
        await this.page.click(step.selector);
        await this.page.waitForTimeout(step.timeout ?? 250);
        break;

      case 'fill':
        if (!step.selector || !step.value) throw new Error('Fill requires selector and value');
        await this.page.click(step.selector);
        await this.page.waitForTimeout(80);
        // Type briskly for tighter timing
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

      case 'screenshot':
        // Take a screenshot (for debugging, not included in video)
        const screenshotPath = `./output/debug-${Date.now()}.png`;
        await this.page.screenshot({ path: screenshotPath });
        console.log(`[Agent] Screenshot saved: ${screenshotPath}`);
        break;
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
      // If element isn't found, skip highlighting silently
    }
  }
}

// Pre-defined demo scripts
export const DEMO_SCRIPTS: Record<string, DemoScript> = {
  'agent-creation': {
    id: 'agent-creation',
    title: 'Creating an AI Agent',
    description: 'Build a custom AI persona from scratch',
    steps: [
      { action: 'caption', caption: { text: 'Create AI Agent', duration: 2000, position: 'top', style: 'highlight' } },
      { action: 'wait', timeout: 400 },
      { action: 'click', selector: 'button[role="tab"]:has-text("Persona")' },
      { action: 'wait', timeout: 300 },
      { action: 'caption', caption: { text: 'Choose template or start fresh', duration: 2500, position: 'bottom' } },
      { action: 'hover', selector: 'button:has-text("Wizard")', timeout: 500 },
      { action: 'click', selector: 'button:has-text("Wizard")' },
      { action: 'wait', timeout: 400 },
      { action: 'caption', caption: { text: 'Configure personality & style', duration: 2500, position: 'bottom' } },
      { action: 'wait', timeout: 1200 },
      { action: 'caption', caption: { text: 'Add tools, memory, guardrails', duration: 2500, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 1500 },
      { action: 'caption', caption: { text: '✓ Ready to deploy', duration: 1800, position: 'center', style: 'success' } },
      { action: 'wait', timeout: 1000 },
    ],
  },

  'multi-agent': {
    id: 'multi-agent',
    title: 'Multi-Agent Collaboration',
    description: 'Orchestrate multiple agents working together',
    steps: [
      { action: 'caption', caption: { text: 'Multi-Agent System', duration: 2000, position: 'top', style: 'highlight' } },
      { action: 'wait', timeout: 400 },
      { action: 'click', selector: 'button[role="tab"]:has-text("Agency")' },
      { action: 'wait', timeout: 300 },
      { action: 'caption', caption: { text: 'Building 3-agent team', duration: 2000, position: 'bottom' } },
      { action: 'wait', timeout: 1200 },
      { action: 'caption', caption: { text: 'Researcher → Analyst → Writer', duration: 2500, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 1500 },
      { action: 'caption', caption: { text: 'Message bus coordination', duration: 2000, position: 'bottom' } },
      { action: 'wait', timeout: 1200 },
      { action: 'caption', caption: { text: '✓ Collaborative task complete', duration: 1800, position: 'center', style: 'success' } },
      { action: 'wait', timeout: 1000 },
    ],
  },

  'rag-memory': {
    id: 'rag-memory',
    title: 'RAG Memory System',
    description: 'Semantic memory retrieval in action',
    steps: [
      { action: 'caption', caption: { text: 'RAG Memory', duration: 2000, position: 'top', style: 'highlight' } },
      { action: 'wait', timeout: 400 },
      { action: 'caption', caption: { text: 'Upload → Chunk → Embed', duration: 2500, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 1500 },
      { action: 'caption', caption: { text: '"What are the key findings?"', duration: 2200, position: 'bottom' } },
      { action: 'wait', timeout: 1400 },
      { action: 'caption', caption: { text: 'Semantic search retrieval', duration: 2000, position: 'bottom' } },
      { action: 'wait', timeout: 1200 },
      { action: 'caption', caption: { text: '✓ Context injected', duration: 1800, position: 'center', style: 'success' } },
      { action: 'wait', timeout: 1000 },
    ],
  },

  'planning-engine': {
    id: 'planning-engine',
    title: 'Planning Engine',
    description: 'Multi-step task decomposition and execution',
    steps: [
      { action: 'caption', caption: { text: 'Planning Engine', duration: 2000, position: 'top', style: 'highlight' } },
      { action: 'wait', timeout: 400 },
      { action: 'click', selector: 'button[role="tab"]:has-text("Workflow")' },
      { action: 'wait', timeout: 300 },
      { action: 'caption', caption: { text: 'Goal: Deploy feature to prod', duration: 2500, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 1200 },
      { action: 'caption', caption: { text: '1. Test → 2. CI/CD → 3. Review', duration: 2200, position: 'bottom' } },
      { action: 'wait', timeout: 1400 },
      { action: 'caption', caption: { text: '4. Stage → 5. Monitor', duration: 2000, position: 'bottom' } },
      { action: 'wait', timeout: 1200 },
      { action: 'caption', caption: { text: '✓ Plan executed', duration: 1800, position: 'center', style: 'success' } },
      { action: 'wait', timeout: 1000 },
    ],
  },

  'streaming': {
    id: 'streaming',
    title: 'Real-time Streaming',
    description: 'Token-level response streaming',
    steps: [
      { action: 'caption', caption: { text: 'Real-time Streaming', duration: 1800, position: 'top', style: 'highlight' } },
      { action: 'wait', timeout: 300 },
      { action: 'click', selector: 'button[role="tab"]:has-text("Compose")', timeout: 100 },
      { action: 'wait', timeout: 200 },
      { action: 'fill', selector: 'textarea[name="input"]', value: 'Explain token streaming in 2 sentences.' },
      { action: 'wait', timeout: 100 },
      { action: 'caption', caption: { text: 'Sending request...', duration: 800, position: 'bottom' } },
      { action: 'click', selector: 'button[type="submit"]', timeout: 100 },
      { action: 'wait', timeout: 500 },
      { action: 'caption', caption: { text: 'stream.on("token", render)', duration: 2000, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 2200 },
      { action: 'caption', caption: { text: '< 50ms latency per token', duration: 1500, position: 'bottom' } },
      { action: 'wait', timeout: 1800 },
      { action: 'caption', caption: { text: '✓ Complete', duration: 1200, position: 'center', style: 'success' } },
      { action: 'wait', timeout: 800 },
    ],
  },
};

export default BrowserAgent;

