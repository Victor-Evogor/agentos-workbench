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

    fs.mkdirSync(this.config.outputDir, { recursive: true });
    fs.mkdirSync(path.join(this.config.outputDir, '../processed'), { recursive: true });
    fs.mkdirSync(path.join(this.config.outputDir, '../thumbnails'), { recursive: true });
  }

  async initialize(): Promise<Page> {
    console.log(`[Recorder] Initializing browser at ${this.config.width}x${this.config.height}`);

    this.browser = await chromium.launch({
      headless: false,
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
      colorScheme: 'dark',
    });

    this.page = await this.context.newPage();

    // Use addInitScript so it re-runs on every navigation (no white flash, persistent captions)
    await this.page.addInitScript(() => {
      // --- Prevent white flash ---
      document.documentElement.style.backgroundColor = '#08080f';
      document.documentElement.style.margin = '0';
      document.documentElement.style.padding = '0';
      if (document.body) document.body.style.backgroundColor = '#08080f';

      const injectOverlay = () => {
        if (document.getElementById('demo-caption-overlay')) return;
        if (document.body) document.body.style.backgroundColor = '#08080f';

        // --- Caption CSS ---
        const style = document.createElement('style');
        style.id = 'demo-caption-styles';
        style.textContent = `
          @keyframes dcSlideIn {
            0% { opacity: 0; transform: translate(-50%, 16px); }
            100% { opacity: 1; transform: translate(-50%, 0); }
          }
          @keyframes dcSlideOut {
            0% { opacity: 1; transform: translate(-50%, 0); }
            100% { opacity: 0; transform: translate(-50%, 10px); }
          }

          #demo-caption-overlay {
            position: fixed;
            bottom: 48px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 999999;
            pointer-events: none;
            max-width: 80vw;
            opacity: 0;
          }
          #demo-caption-overlay.dc-visible {
            animation: dcSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          #demo-caption-overlay.dc-hiding {
            animation: dcSlideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
          }
          /* When positioned top */
          #demo-caption-overlay.dc-top {
            bottom: auto;
            top: 48px;
          }
          #demo-caption-overlay.dc-center {
            bottom: auto;
            top: 50%;
            transform: translate(-50%, -50%);
          }
          #demo-caption-overlay.dc-center.dc-visible {
            animation: none;
            opacity: 1;
            transform: translate(-50%, -50%);
          }

          /* --- Base caption pill --- */
          .dc-pill {
            background: rgba(8, 8, 16, 0.88);
            backdrop-filter: blur(24px) saturate(180%);
            -webkit-backdrop-filter: blur(24px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 16px 32px;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            font-size: 20px;
            font-weight: 500;
            letter-spacing: -0.01em;
            line-height: 1.4;
            color: rgba(248, 250, 252, 0.95);
            box-shadow:
              0 8px 32px rgba(0, 0, 0, 0.4),
              0 2px 8px rgba(0, 0, 0, 0.2),
              inset 0 1px 0 rgba(255, 255, 255, 0.04);
            white-space: nowrap;
            text-align: center;
          }

          /* --- Variants (accent via left border + glow) --- */
          .dc-pill.dc-highlight {
            border-left: 3px solid #8b5cf6;
            box-shadow:
              0 8px 32px rgba(0, 0, 0, 0.4),
              0 0 20px rgba(139, 92, 246, 0.15),
              inset 0 1px 0 rgba(255, 255, 255, 0.04);
            font-weight: 600;
          }

          .dc-pill.dc-code {
            font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
            font-size: 17px;
            font-weight: 500;
            color: rgba(34, 211, 238, 0.95);
            border: 1px solid rgba(34, 211, 238, 0.15);
            box-shadow:
              0 8px 32px rgba(0, 0, 0, 0.4),
              0 0 16px rgba(34, 211, 238, 0.08),
              inset 0 1px 0 rgba(255, 255, 255, 0.04);
          }

          .dc-pill.dc-success {
            border-left: 3px solid #10b981;
            box-shadow:
              0 8px 32px rgba(0, 0, 0, 0.4),
              0 0 20px rgba(16, 185, 129, 0.12),
              inset 0 1px 0 rgba(255, 255, 255, 0.04);
            font-weight: 600;
          }

          .dc-pill.dc-warning {
            border-left: 3px solid #f59e0b;
            box-shadow:
              0 8px 32px rgba(0, 0, 0, 0.4),
              0 0 20px rgba(245, 158, 11, 0.12),
              inset 0 1px 0 rgba(255, 255, 255, 0.04);
            font-weight: 600;
          }
        `;
        document.head.appendChild(style);

        // --- Overlay element ---
        const overlay = document.createElement('div');
        overlay.id = 'demo-caption-overlay';
        const pill = document.createElement('div');
        pill.className = 'dc-pill';
        overlay.appendChild(pill);
        document.body.appendChild(overlay);
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectOverlay);
      } else {
        injectOverlay();
      }
    });

    return this.page;
  }

  async showCaption(config: CaptionConfig): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    const { text, duration, position = 'bottom', style = 'default' } = config;

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

        const pill = overlay.querySelector('.dc-pill') as HTMLElement;
        if (!pill) return;

        // Reset animation
        overlay.classList.remove('dc-visible', 'dc-hiding', 'dc-top', 'dc-center');
        void overlay.offsetWidth; // force reflow

        // Position
        if (position === 'top') overlay.classList.add('dc-top');
        else if (position === 'center') overlay.classList.add('dc-center');

        // Style variant
        pill.className = 'dc-pill';
        if (style !== 'default') pill.classList.add(`dc-${style}`);
        pill.textContent = text;

        // Show
        overlay.classList.add('dc-visible');
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

    try {
      await this.page.evaluate(() => {
        const overlay = document.getElementById('demo-caption-overlay');
        if (overlay) {
          overlay.classList.remove('dc-visible');
          overlay.classList.add('dc-hiding');
          setTimeout(() => {
            overlay.classList.remove('dc-hiding');
          }, 300);
        }
      });
    } catch {
      // Page may have been closed
    }
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

    const video = this.page.video();
    if (!video) {
      throw new Error('No video recorded');
    }

    // Close context to flush video to disk (this also closes all pages)
    await this.context.close();
    this.page = null;
    this.context = null;

    const videoPath = await video.path();
    const finalPath = path.join(this.config.outputDir, `${demoId}.webm`);

    await this.safeRenameWithRetry(videoPath, finalPath);
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
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  getPage(): Page {
    if (!this.page) throw new Error('Page not initialized');
    return this.page;
  }
}

export default DemoRecorder;
