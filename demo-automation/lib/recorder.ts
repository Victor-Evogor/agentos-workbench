import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

export interface RecorderConfig {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  outputDir: string;
}

export interface CaptionConfig {
  text: string;
  duration: number;
  position?: 'top' | 'center' | 'bottom';
  style?: 'default' | 'highlight' | 'code' | 'warning' | 'success';
}

const DEFAULT_CONFIG: RecorderConfig = {
  width: 1920,
  height: 1080,
  fps: 60,
  bitrate: 8000000,
  outputDir: path.join(__dirname, '../output/raw'),
};

export class DemoRecorder {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: RecorderConfig;
  private isRecording = false;
  private captionQueue: Array<{ caption: CaptionConfig; timestamp: number }> = [];
  private recordingStartTime = 0;

  constructor(config: Partial<RecorderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Ensure output directory exists
    fs.mkdirSync(this.config.outputDir, { recursive: true });
    fs.mkdirSync(path.join(this.config.outputDir, '../processed'), { recursive: true });
    fs.mkdirSync(path.join(this.config.outputDir, '../thumbnails'), { recursive: true });
  }

  async initialize(): Promise<Page> {
    console.log(`[Recorder] Initializing browser at ${this.config.width}x${this.config.height}`);
    
    this.browser = await chromium.launch({
      headless: false, // Need visible browser for recording
      args: [
        `--window-size=${this.config.width},${this.config.height}`,
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: {
        width: this.config.width,
        height: this.config.height,
      },
      recordVideo: {
        dir: this.config.outputDir,
        size: {
          width: this.config.width,
          height: this.config.height,
        },
      },
      deviceScaleFactor: 1,
      colorScheme: 'dark', // AgentOS looks best in dark mode
    });

    this.page = await this.context.newPage();
    
    // Inject caption overlay system
    await this.injectCaptionSystem();
    
    return this.page;
  }

  private async injectCaptionSystem(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.addStyleTag({
      content: `
        @keyframes captionSlideIn {
          0% { opacity: 0; transform: translateY(12px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes captionSlideOut {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-8px) scale(0.98); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 4px 24px rgba(139, 92, 246, 0.3); }
          50% { box-shadow: 0 4px 32px rgba(139, 92, 246, 0.5); }
        }
        
        #demo-caption-overlay {
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          z-index: 999999;
          pointer-events: none;
          opacity: 0;
        }
        #demo-caption-overlay.visible {
          animation: captionSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        #demo-caption-overlay.hiding {
          animation: captionSlideOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        #demo-caption-overlay.top { top: 60px; }
        #demo-caption-overlay.center { top: 50%; transform: translate(-50%, -50%); }
        #demo-caption-overlay.bottom { bottom: 60px; }
        
        .caption-default {
          background: rgba(10, 10, 15, 0.88);
          color: #f8fafc;
          padding: 14px 28px;
          border-radius: 14px;
          font-family: 'Inter', -apple-system, system-ui, sans-serif;
          font-size: 22px;
          font-weight: 500;
          letter-spacing: -0.01em;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.06);
          backdrop-filter: blur(16px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .caption-highlight {
          background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #06b6d4 100%);
          background-size: 200% auto;
          color: white;
          padding: 14px 28px;
          border-radius: 14px;
          font-family: 'Inter', -apple-system, system-ui, sans-serif;
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.01em;
          box-shadow: 0 4px 24px rgba(139, 92, 246, 0.4);
          animation: pulse 2s ease-in-out infinite;
        }
        .caption-code {
          background: rgba(2, 6, 23, 0.92);
          color: #22d3ee;
          padding: 12px 24px;
          border-radius: 10px;
          font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
          font-size: 18px;
          font-weight: 500;
          letter-spacing: -0.02em;
          border: 1px solid rgba(34, 211, 238, 0.2);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(34, 211, 238, 0.1);
          backdrop-filter: blur(12px);
        }
        .caption-warning {
          background: linear-gradient(135deg, #f59e0b, #fbbf24);
          color: #1c1917;
          padding: 14px 28px;
          border-radius: 14px;
          font-family: 'Inter', -apple-system, system-ui, sans-serif;
          font-size: 22px;
          font-weight: 600;
          box-shadow: 0 4px 24px rgba(245, 158, 11, 0.35);
        }
        .caption-success {
          background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          color: white;
          padding: 14px 28px;
          border-radius: 14px;
          font-family: 'Inter', -apple-system, system-ui, sans-serif;
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.01em;
          box-shadow: 0 4px 24px rgba(16, 185, 129, 0.35);
        }
      `,
    });

    await this.page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.id = 'demo-caption-overlay';
      overlay.className = 'bottom';
      overlay.innerHTML = '<div class="caption-default"></div>';
      document.body.appendChild(overlay);
    });
  }

  async showCaption(config: CaptionConfig): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    const { text, duration, position = 'bottom', style = 'default' } = config;
    
    // Track caption for SRT generation
    if (this.isRecording) {
      this.captionQueue.push({
        caption: config,
        timestamp: Date.now() - this.recordingStartTime,
      });
    }

    await this.page.evaluate(
      ({ text, position, style }) => {
        const overlay = document.getElementById('demo-caption-overlay');
        if (!overlay) return;
        
        const content = overlay.querySelector('div');
        if (!content) return;
        
        // Update position
        overlay.className = position;
        
        // Update style
        content.className = `caption-${style}`;
        content.textContent = text;
        
        // Show
        overlay.classList.add('visible');
      },
      { text, position, style }
    );

    // Schedule hide
    setTimeout(async () => {
      await this.hideCaption();
    }, duration);
  }

  async hideCaption(): Promise<void> {
    if (!this.page) return;
    
    await this.page.evaluate(() => {
      const overlay = document.getElementById('demo-caption-overlay');
      if (overlay) {
        overlay.classList.remove('visible');
        overlay.classList.add('hiding');
        setTimeout(() => overlay.classList.remove('hiding'), 200);
      }
    });
  }

  async startRecording(demoId: string): Promise<void> {
    console.log(`[Recorder] Starting recording for demo: ${demoId}`);
    this.isRecording = true;
    this.recordingStartTime = Date.now();
    this.captionQueue = [];
  }

  async stopRecording(demoId: string): Promise<string> {
    console.log(`[Recorder] Stopping recording for demo: ${demoId}`);
    this.isRecording = false;
    
    if (!this.page || !this.context) {
      throw new Error('Recording not initialized');
    }

    // Capture video reference before closing
    const video = this.page.video();
    if (!video) {
      throw new Error('No video recorded');
    }

    // Close context to flush video to disk
    await this.context.close();
    await this.page.close();

    const videoPath = await video.path();
    const finalPath = path.join(this.config.outputDir, `${demoId}.webm`);

    // Safe rename with retries (Windows file locks)
    await this.safeRenameWithRetry(videoPath, finalPath);
    
    // Generate SRT file
    await this.generateSRT(demoId);
    
    console.log(`[Recorder] Video saved to: ${finalPath}`);
    return finalPath;
  }

  private async safeRenameWithRetry(src: string, dest: string, attempts = 5, delayMs = 500): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      try {
        fs.renameSync(src, dest);
        return;
      } catch (error: any) {
        if (i === attempts - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  private async generateSRT(demoId: string): Promise<void> {
    const srtPath = path.join(this.config.outputDir, `${demoId}.srt`);
    
    let srtContent = '';
    this.captionQueue.forEach((item, index) => {
      const startTime = this.formatSRTTime(item.timestamp);
      const endTime = this.formatSRTTime(item.timestamp + item.caption.duration);
      
      srtContent += `${index + 1}\n`;
      srtContent += `${startTime} --> ${endTime}\n`;
      srtContent += `${item.caption.text}\n\n`;
    });
    
    fs.writeFileSync(srtPath, srtContent, 'utf-8');
    console.log(`[Recorder] SRT saved to: ${srtPath}`);
  }

  private formatSRTTime(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }

  async cleanup(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }

  getPage(): Page {
    if (!this.page) throw new Error('Page not initialized');
    return this.page;
  }
}

export default DemoRecorder;

