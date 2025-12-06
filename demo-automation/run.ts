#!/usr/bin/env npx ts-node

import { DemoRecorder } from './lib/recorder';
import { BrowserAgent, DEMO_SCRIPTS } from './lib/browser-agent';
import { VideoProcessor } from './lib/video-processor';
import * as path from 'path';

interface RunConfig {
  demos: string[];
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  processVideos: boolean;
  copyToLanding: boolean;
}

const DEFAULT_RUN_CONFIG: RunConfig = {
  demos: Object.keys(DEMO_SCRIPTS),
  width: 1920,
  height: 1080,
  fps: 60,
  bitrate: 8000000,
  processVideos: true,
  copyToLanding: true,
};

function parseArgs(): Partial<RunConfig> {
  const args = process.argv.slice(2);
  const config: Partial<RunConfig> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--demo':
      case '-d':
        config.demos = [args[++i]];
        break;
      case '--width':
      case '-w':
        config.width = parseInt(args[++i], 10);
        break;
      case '--height':
      case '-h':
        config.height = parseInt(args[++i], 10);
        break;
      case '--fps':
        config.fps = parseInt(args[++i], 10);
        break;
      case '--bitrate':
      case '-b':
        config.bitrate = parseInt(args[++i], 10);
        break;
      case '--no-process':
        config.processVideos = false;
        break;
      case '--no-copy':
        config.copyToLanding = false;
        break;
      case '--all':
        config.demos = Object.keys(DEMO_SCRIPTS);
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
AgentOS Demo Recording System

Usage: npx ts-node run.ts [options]

Options:
  --demo, -d <id>     Record specific demo (can be repeated)
  --all               Record all demos (default)
  --width, -w <px>    Video width (default: 1920)
  --height, -h <px>   Video height (default: 1080)
  --fps <fps>         Frame rate (default: 60)
  --bitrate, -b <bps> Video bitrate (default: 8000000)
  --no-process        Skip video post-processing
  --no-copy           Skip copying to landing page
  --help              Show this help

Available demos:
${Object.entries(DEMO_SCRIPTS)
  .map(([id, script]) => `  - ${id}: ${script.title}`)
  .join('\n')}

Examples:
  npx ts-node run.ts                    # Record all demos
  npx ts-node run.ts --demo agent-creation
  npx ts-node run.ts --width 2560 --height 1440
  npx ts-node run.ts --demo multi-agent --no-process
`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const config: RunConfig = { ...DEFAULT_RUN_CONFIG, ...args };

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         AgentOS Demo Recording System                          ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Resolution: ${config.width}x${config.height} @ ${config.fps}fps`);
  console.log(`Bitrate: ${(config.bitrate / 1000000).toFixed(1)} Mbps`);
  console.log(`Demos to record: ${config.demos.join(', ')}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check if workbench is running
  try {
    const response = await fetch('http://localhost:5175');
    if (!response.ok) throw new Error('Workbench not responding');
  } catch {
    console.error('ERROR: AgentOS Workbench is not running!');
    console.error('Start it with: cd apps/agentos-workbench && pnpm dev');
    process.exit(1);
  }

  const recordedVideos: string[] = [];

  // Record each demo
  for (const demoId of config.demos) {
    const script = DEMO_SCRIPTS[demoId];
    if (!script) {
      console.warn(`Unknown demo: ${demoId}, skipping...`);
      continue;
    }

    console.log(`\n▶ Recording: ${script.title}`);
    console.log('─'.repeat(60));

    const recorder = new DemoRecorder({
      width: config.width,
      height: config.height,
      fps: config.fps,
      bitrate: config.bitrate,
    });

    const agent = new BrowserAgent(recorder);

    try {
      await agent.initialize();
      const videoPath = await agent.executeScript(script);
      recordedVideos.push(videoPath);
      console.log(`✓ Recorded: ${videoPath}`);
    } catch (error) {
      console.error(`✗ Failed to record ${demoId}:`, error);
    } finally {
      await agent.cleanup();
    }

    // Brief pause between recordings
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Post-process videos
  if (config.processVideos && recordedVideos.length > 0) {
    console.log('\n▶ Processing videos...');
    console.log('─'.repeat(60));

    const processor = new VideoProcessor({
      width: config.width,
      height: config.height,
      fps: config.fps,
      bitrate: config.bitrate,
    });

    await processor.processAll();

    // Copy to landing page
    if (config.copyToLanding) {
      const landingPageDir = path.join(__dirname, '../../agentos.sh');
      await processor.copyToLandingPage(landingPageDir);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✓ Demo recording complete!');
  console.log(`  Recorded: ${recordedVideos.length} videos`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);





