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
    
    // Close any tour overlays
    try {
      await this.page.click('button:has-text("Close")', { timeout: 2000 });
    } catch {
      // No tour overlay
    }
    
    // Switch to dark mode for best visuals
    try {
      await this.page.click('button[name="Switch to dark mode"]', { timeout: 2000 });
    } catch {
      // Already in dark mode
    }
  }

  async executeScript(script: DemoScript): Promise<string> {
    if (!this.page) throw new Error('Agent not initialized');

    console.log(`[Agent] Executing demo: ${script.title}`);
    
    // Start recording
    await this.recorder.startRecording(script.id);
    
    // Initial pause for viewer orientation
    await this.page.waitForTimeout(500);

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
          await this.page.waitForTimeout(300);
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
        await this.page.waitForTimeout(120);
        // Type briskly for tighter timing
        await this.page.fill(step.selector, '');
        await this.page.type(step.selector, step.value, { delay: 10 });
        await this.page.waitForTimeout(150);
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
      { action: 'caption', caption: { text: '◆ Creating a new AI Agent', duration: 3000, position: 'top', style: 'highlight' } },
      { action: 'wait', timeout: 1000 },
      { action: 'click', selector: 'button[role="tab"]:has-text("Persona")' },
      { action: 'wait', timeout: 500 },
      { action: 'caption', caption: { text: 'Select a persona template or start from scratch', duration: 4000, position: 'bottom' } },
      { action: 'hover', selector: 'button:has-text("Wizard")', timeout: 800 },
      { action: 'click', selector: 'button:has-text("Wizard")' },
      { action: 'wait', timeout: 1000 },
      { action: 'caption', caption: { text: '→ Configure personality traits and communication style', duration: 4000, position: 'bottom' } },
      { action: 'wait', timeout: 1500 },
      { action: 'caption', caption: { text: 'Define capabilities: tools, memory, guardrails', duration: 4000, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: '✓ Agent ready for deployment', duration: 3000, position: 'center', style: 'highlight' } },
      { action: 'wait', timeout: 2000 },
    ],
  },

  'multi-agent': {
    id: 'multi-agent',
    title: 'Multi-Agent Collaboration',
    description: 'Orchestrate multiple agents working together',
    steps: [
      { action: 'caption', caption: { text: '◆ Multi-Agent Agency Setup', duration: 3000, position: 'top', style: 'highlight' } },
      { action: 'wait', timeout: 1000 },
      { action: 'click', selector: 'button[role="tab"]:has-text("Agency")' },
      { action: 'wait', timeout: 500 },
      { action: 'caption', caption: { text: 'Creating an agency with 3 specialized agents', duration: 4000, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: '→ Researcher: Gathers information from sources', duration: 4000, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: '→ Analyst: Processes and synthesizes data', duration: 4000, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: '→ Writer: Generates final output', duration: 4000, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: 'Agents communicate via message bus', duration: 4000, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: '✓ Task completed collaboratively', duration: 3000, position: 'center', style: 'highlight' } },
      { action: 'wait', timeout: 2000 },
    ],
  },

  'rag-memory': {
    id: 'rag-memory',
    title: 'RAG Memory System',
    description: 'Semantic memory retrieval in action',
    steps: [
      { action: 'caption', caption: { text: '◆ RAG Memory Dashboard', duration: 3000, position: 'top', style: 'highlight' } },
      { action: 'wait', timeout: 1000 },
      { action: 'caption', caption: { text: 'Uploading documents to vector store', duration: 4000, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: 'Automatic chunking and embedding generation', duration: 4000, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: '→ Querying: "What are the key findings?"', duration: 4000, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: 'Semantic search retrieves relevant chunks', duration: 4000, position: 'bottom' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: '✓ Context injected into agent prompt', duration: 3000, position: 'center', style: 'highlight' } },
      { action: 'wait', timeout: 2000 },
    ],
  },

  'planning-engine': {
    id: 'planning-engine',
    title: 'Planning Engine',
    description: 'Multi-step task decomposition and execution',
    steps: [
      { action: 'caption', caption: { text: '◆ Planning Engine Demo', duration: 3000, position: 'top', style: 'highlight' } },
      { action: 'wait', timeout: 1000 },
      { action: 'click', selector: 'button[role="tab"]:has-text("Workflow")' },
      { action: 'wait', timeout: 500 },
      { action: 'caption', caption: { text: 'Goal: "Deploy a new feature to production"', duration: 4000, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 2000 },
      { action: 'caption', caption: { text: '→ Step 1: Write unit tests', duration: 3000, position: 'bottom' } },
      { action: 'wait', timeout: 1500 },
      { action: 'caption', caption: { text: '→ Step 2: Run CI/CD pipeline', duration: 3000, position: 'bottom' } },
      { action: 'wait', timeout: 1500 },
      { action: 'caption', caption: { text: '→ Step 3: Review and approve', duration: 3000, position: 'bottom' } },
      { action: 'wait', timeout: 1500 },
      { action: 'caption', caption: { text: '→ Step 4: Deploy to staging', duration: 3000, position: 'bottom' } },
      { action: 'wait', timeout: 1500 },
      { action: 'caption', caption: { text: '→ Step 5: Monitor and verify', duration: 3000, position: 'bottom' } },
      { action: 'wait', timeout: 1500 },
      { action: 'caption', caption: { text: '✓ Plan executed successfully', duration: 3000, position: 'center', style: 'highlight' } },
      { action: 'wait', timeout: 2000 },
    ],
  },

  'streaming': {
    id: 'streaming',
    title: 'Real-time Streaming',
    description: 'Token-level response streaming',
    steps: [
      { action: 'caption', caption: { text: '◆ Streaming Response Demo', duration: 2000, position: 'top', style: 'highlight' } },
      { action: 'wait', timeout: 400 },
      { action: 'click', selector: 'button[role="tab"]:has-text("Compose")', timeout: 200 },
      { action: 'wait', timeout: 200 },
      { action: 'caption', caption: { text: 'Sending request to agent...', duration: 1200, position: 'bottom' } },
      { action: 'wait', timeout: 150 },
      { action: 'fill', selector: 'textarea[name="input"]', value: 'Stream a short response about the AgentOS streaming demo.' },
      { action: 'wait', timeout: 120 },
      { action: 'click', selector: 'button[type="submit"]', timeout: 200 },
      { action: 'wait', timeout: 600 },
      { action: 'caption', caption: { text: '→ Tokens streaming in real-time', duration: 2500, position: 'bottom', style: 'code' } },
      { action: 'wait', timeout: 2200 },
      { action: 'caption', caption: { text: 'Latency: <50ms per token', duration: 1800, position: 'bottom' } },
      { action: 'wait', timeout: 1500 },
      { action: 'caption', caption: { text: '✓ Response complete', duration: 2000, position: 'center', style: 'highlight' } },
      { action: 'wait', timeout: 1000 },
    ],
  },
};

export default BrowserAgent;

