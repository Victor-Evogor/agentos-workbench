import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import ffmpegStatic from 'ffmpeg-static';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface ProcessingConfig {
  inputDir: string;
  outputDir: string;
  thumbnailDir: string;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  burnCaptions: boolean;
}

const DEFAULT_CONFIG: ProcessingConfig = {
  inputDir: path.join(__dirname, '../output/raw'),
  outputDir: path.join(__dirname, '../output/processed'),
  thumbnailDir: path.join(__dirname, '../output/thumbnails'),
  width: 1920,
  height: 1080,
  fps: 60,
  bitrate: 8000000,
  burnCaptions: true,
};

export class VideoProcessor {
  private config: ProcessingConfig;

  constructor(config: Partial<ProcessingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Ensure directories exist
    fs.mkdirSync(this.config.outputDir, { recursive: true });
    fs.mkdirSync(this.config.thumbnailDir, { recursive: true });
  }

  async processVideo(demoId: string): Promise<{ videoPath: string; thumbnailPath: string }> {
    const inputPath = path.join(this.config.inputDir, `${demoId}.webm`);
    const srtPath = path.join(this.config.inputDir, `${demoId}.srt`);
    const outputPath = path.join(this.config.outputDir, `${demoId}.mp4`);
    const thumbnailPath = path.join(this.config.thumbnailDir, `${demoId}-thumb.jpg`);

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input video not found: ${inputPath}`);
    }

    console.log(`[VideoProcessor] Processing: ${demoId}`);

    // Build FFmpeg command
    const ffmpegBin = this.getFfmpegBin();
    const args: string[] = ['-y', '-i', inputPath];

    // Add subtitle filter if SRT exists and burning is enabled
    if (this.config.burnCaptions && fs.existsSync(srtPath)) {
      // Escape path for FFmpeg filter
      const escapedSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      args.push(
        '-vf',
        `subtitles='${escapedSrtPath}':force_style='FontName=Inter,FontSize=32,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=3,Shadow=2,Alignment=2,MarginV=80'`
      );
    }

    // Video encoding settings
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '18',
      '-b:v',
      `${this.config.bitrate}`,
      '-maxrate',
      `${Math.floor(this.config.bitrate * 1.5)}`,
      '-bufsize',
      `${this.config.bitrate * 2}`,
      '-pix_fmt',
      'yuv420p'
    );

    // Audio encoding
    args.push('-c:a', 'aac', '-b:a', '192k');

    // Output optimization
    args.push('-movflags', '+faststart', outputPath); // Web optimization

    console.log(`[VideoProcessor] Running: ${ffmpegBin} ${args.join(' ')}`);

    try {
      const { stderr } = await execFileAsync(ffmpegBin, args, { maxBuffer: 50 * 1024 * 1024 });
      if (stderr) console.log(`[VideoProcessor] FFmpeg output: ${String(stderr).slice(-500)}`);
    } catch (error: any) {
      console.error(`[VideoProcessor] FFmpeg error:`, error.message);
      throw error;
    }

    // Generate thumbnail
    await this.generateThumbnail(outputPath, thumbnailPath);

    // Get file sizes for logging
    const inputSize = fs.statSync(inputPath).size;
    const outputSize = fs.statSync(outputPath).size;
    console.log(`[VideoProcessor] Converted: ${(inputSize / 1024 / 1024).toFixed(2)} MB → ${(outputSize / 1024 / 1024).toFixed(2)} MB`);

    return { videoPath: outputPath, thumbnailPath };
  }

  private async generateThumbnail(videoPath: string, thumbnailPath: string): Promise<void> {
    // Extract frame at 2 seconds
    const ffmpegBin = this.getFfmpegBin();
    const args = ['-y', '-i', videoPath, '-ss', '00:00:02', '-vframes', '1', '-q:v', '2', thumbnailPath];

    try {
      await execFileAsync(ffmpegBin, args);
      console.log(`[VideoProcessor] Thumbnail generated: ${thumbnailPath}`);
    } catch (error: any) {
      console.error(`[VideoProcessor] Thumbnail error:`, error.message);
    }
  }

  async processAll(): Promise<void> {
    const files = fs.readdirSync(this.config.inputDir).filter(f => f.endsWith('.webm'));
    
    console.log(`[VideoProcessor] Processing ${files.length} videos...`);
    
    for (const file of files) {
      const demoId = path.basename(file, '.webm');
      try {
        await this.processVideo(demoId);
      } catch (error) {
        console.error(`[VideoProcessor] Failed to process ${demoId}:`, error);
      }
    }

    // Generate manifest
    await this.generateManifest();
  }

  private async generateManifest(): Promise<void> {
    const manifestPath = path.join(this.config.outputDir, 'manifest.json');
    const videos: any[] = [];

    const files = fs.readdirSync(this.config.outputDir).filter(f => f.endsWith('.mp4'));

    for (const file of files) {
      const demoId = path.basename(file, '.mp4');
      const videoPath = path.join(this.config.outputDir, file);
      
      // Get video duration using FFprobe
      let duration = 0;
      try {
        const { stdout } = await execAsync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
        );
        duration = Math.floor(parseFloat(stdout.trim()));
      } catch {
        // Fallback duration
        duration = 120;
      }

      videos.push({
        id: demoId,
        src: `/videos/${file}`,
        thumbnail: `/videos/${demoId}-thumb.jpg`,
        duration,
      });
    }

    const manifest = { videos, generatedAt: new Date().toISOString() };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`[VideoProcessor] Manifest generated: ${manifestPath}`);
  }

  async copyToLandingPage(landingPageDir: string): Promise<void> {
    const videosDir = path.join(landingPageDir, 'public/videos');
    fs.mkdirSync(videosDir, { recursive: true });

    // Copy processed videos
    const videos = fs.readdirSync(this.config.outputDir).filter(f => f.endsWith('.mp4') || f.endsWith('.json'));
    for (const file of videos) {
      const src = path.join(this.config.outputDir, file);
      const dest = path.join(videosDir, file);
      fs.copyFileSync(src, dest);
      console.log(`[VideoProcessor] Copied: ${file}`);
    }

    // Copy thumbnails
    const thumbs = fs.readdirSync(this.config.thumbnailDir).filter(f => f.endsWith('.jpg'));
    for (const file of thumbs) {
      const src = path.join(this.config.thumbnailDir, file);
      const dest = path.join(videosDir, file);
      fs.copyFileSync(src, dest);
      console.log(`[VideoProcessor] Copied: ${file}`);
    }

    console.log(`[VideoProcessor] All files copied to: ${videosDir}`);
  }

  private getFfmpegBin(): string {
    const candidates = [
      ffmpegStatic as string,
      path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
      'ffmpeg',
    ].filter(Boolean) as string[];

    for (const bin of candidates) {
      if (bin && fs.existsSync(bin)) {
        return bin;
      }
    }

    throw new Error('FFmpeg binary not found. Please ensure ffmpeg-static is installed.');
  }
}

export default VideoProcessor;

