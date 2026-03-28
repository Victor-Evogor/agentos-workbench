import fs from 'node:fs';
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const configDir = __dirname;
const workspaceRoot = path.resolve(configDir, '../..');

function extractSemverPrefix(candidate: string): [number, number, number] {
  const match = candidate.match(/^vite@(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return [0, 0, 0];
  }

  return match.slice(1).map((part) => Number(part)) as [number, number, number];
}

function resolveViteRuntime(): { bin: string; nodePath: string } {
  const directCandidate = path.join(configDir, 'node_modules', 'vite', 'bin', 'vite.js');
  if (fs.existsSync(directCandidate)) {
    return {
      bin: directCandidate,
      nodePath: [
        path.join(configDir, 'node_modules', 'vite', 'bin', 'node_modules'),
        path.join(configDir, 'node_modules', 'vite', 'node_modules'),
        path.join(configDir, 'node_modules'),
      ].join(path.delimiter),
    };
  }

  const pnpmStoreDir = path.join(workspaceRoot, 'node_modules', '.pnpm');
  const storeEntries = fs.existsSync(pnpmStoreDir) ? fs.readdirSync(pnpmStoreDir) : [];
  const viteCandidates = storeEntries
    .filter((entry) => entry.startsWith('vite@'))
    .map((entry) => ({
      entry,
      version: extractSemverPrefix(entry),
      candidate: path.join(pnpmStoreDir, entry, 'node_modules', 'vite', 'bin', 'vite.js'),
    }))
    .filter(({ candidate }) => fs.existsSync(candidate))
    .sort((left, right) => {
      for (let index = 0; index < left.version.length; index += 1) {
        const delta = right.version[index] - left.version[index];
        if (delta !== 0) {
          return delta;
        }
      }

      return left.entry.localeCompare(right.entry);
    });

  const preferredVite5Candidate = viteCandidates.find(({ version }) => version[0] === 5);
  if (preferredVite5Candidate) {
    const vitePackageDir = path.dirname(path.dirname(preferredVite5Candidate.candidate));
    const storeNodeModulesDir = path.dirname(vitePackageDir);

    return {
      bin: preferredVite5Candidate.candidate,
      nodePath: [
        path.join(vitePackageDir, 'bin', 'node_modules'),
        path.join(vitePackageDir, 'node_modules'),
        storeNodeModulesDir,
        path.join(workspaceRoot, 'node_modules', '.pnpm', 'node_modules'),
      ].join(path.delimiter),
    };
  }

  if (viteCandidates[0]) {
    const vitePackageDir = path.dirname(path.dirname(viteCandidates[0].candidate));
    const storeNodeModulesDir = path.dirname(vitePackageDir);

    return {
      bin: viteCandidates[0].candidate,
      nodePath: [
        path.join(vitePackageDir, 'bin', 'node_modules'),
        path.join(vitePackageDir, 'node_modules'),
        storeNodeModulesDir,
        path.join(workspaceRoot, 'node_modules', '.pnpm', 'node_modules'),
      ].join(path.delimiter),
    };
  }

  throw new Error('Unable to locate a valid vite/bin/vite.js for Playwright webServer startup.');
}

const e2eHost = process.env.E2E_HOST || '127.0.0.1';
const e2ePort = process.env.E2E_PORT || '5175';
const e2eBaseUrl = process.env.E2E_BASE_URL || `http://${e2eHost}:${e2ePort}`;
const parsedWorkers = Number(process.env.PLAYWRIGHT_WORKERS);
const playwrightWorkers =
  Number.isFinite(parsedWorkers) && parsedWorkers > 0 ? parsedWorkers : undefined;
const artifactProfile = process.env.PLAYWRIGHT_ARTIFACT_PROFILE || 'default';
const useLightArtifacts = artifactProfile === 'light';
const playwrightTraceMode =
  process.env.PLAYWRIGHT_TRACE_MODE || (useLightArtifacts ? 'off' : 'on-first-retry');
const playwrightScreenshotMode =
  process.env.PLAYWRIGHT_SCREENSHOT_MODE || (useLightArtifacts ? 'off' : 'only-on-failure');
const playwrightOutputDir =
  process.env.PLAYWRIGHT_OUTPUT_DIR ||
  (useLightArtifacts ? '/tmp/agentos-workbench-playwright' : 'test-results');
const viteRuntime = resolveViteRuntime();

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: playwrightOutputDir,
  timeout: 60_000,
  fullyParallel: true,
  workers: playwrightWorkers,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: e2eBaseUrl,
    trace: playwrightTraceMode as
      | 'off'
      | 'on'
      | 'retain-on-failure'
      | 'on-first-retry'
      | 'on-all-retries'
      | 'retain-on-first-failure',
    screenshot: playwrightScreenshotMode as 'off' | 'on' | 'only-on-failure',
  },
  webServer: {
    command: `VITE_E2E_MODE=true NODE_PATH=${JSON.stringify(viteRuntime.nodePath)} ${process.execPath} ${JSON.stringify(viteRuntime.bin)} --host ${e2eHost} --port ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
