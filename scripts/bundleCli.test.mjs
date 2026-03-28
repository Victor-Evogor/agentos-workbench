import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createAsset,
  createBundleReportFixture,
  createCoreBundleAssets,
  createCurrentBundleBaselineFixture,
  writeJsonFixture,
} from './bundleTestFixtures.mjs';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

function createTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function writeAsset(dirPath, fileName, contents) {
  writeFileSync(path.join(dirPath, fileName), contents);
}

function runNodeScript(scriptPath, env) {
  return spawnSync('node', [scriptPath], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

test('generateBundleReport CLI writes report artifacts using env override paths', () => {
  const tempRoot = createTempDir('agentos-workbench-bundle-cli-');
  const distAssetsDir = path.join(tempRoot, 'dist', 'assets');
  const outputDir = path.join(tempRoot, 'output');

  try {
    mkdirSync(distAssetsDir, { recursive: true });
    writeAsset(distAssetsDir, 'index-BX12AB34.js', 'console.log("entry");\n');
    writeAsset(distAssetsDir, 'vendor-polyfills-CoFUuYbz.js', 'console.log("vendor");\n'.repeat(40));
    writeAsset(distAssetsDir, 'graph-builder-QWER1234.js', 'console.log("lazy");\n'.repeat(20));
    writeAsset(distAssetsDir, 'index-CD56EF78.css', 'body{color:#123456;}\n'.repeat(20));
    writeAsset(distAssetsDir, 'logo.svg', '<svg viewBox="0 0 10 10"></svg>\n');

    execFileSync('node', ['scripts/generateBundleReport.mjs'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        WORKBENCH_BUNDLE_DIST_ASSETS_DIR: distAssetsDir,
        WORKBENCH_BUNDLE_OUTPUT_DIR: outputDir,
      },
      stdio: 'pipe',
      encoding: 'utf8',
    });

    const jsonReport = JSON.parse(readFileSync(path.join(outputDir, 'bundle-report.json'), 'utf8'));
    const markdownReport = readFileSync(path.join(outputDir, 'bundle-report.md'), 'utf8');

    assert.equal(jsonReport.distAssetsDir, 'dist/assets');
    assert.equal(jsonReport.totals.assetCount, 5);
    assert.equal(jsonReport.topJsAssets[0].fileName, 'vendor-polyfills-CoFUuYbz.js');
    assert.match(markdownReport, /# AgentOS Workbench Bundle Report/);
    assert.match(markdownReport, /## Largest Assets Overall/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('generateBundleReport CLI reports a helpful error when the overridden dist path is missing', () => {
  const tempRoot = createTempDir('agentos-workbench-bundle-cli-missing-dist-');
  const missingDistAssetsDir = path.join(tempRoot, 'dist', 'assets');
  const outputDir = path.join(tempRoot, 'output');

  try {
    const result = runNodeScript('scripts/generateBundleReport.mjs', {
      WORKBENCH_BUNDLE_DIST_ASSETS_DIR: missingDistAssetsDir,
      WORKBENCH_BUNDLE_OUTPUT_DIR: outputDir,
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`Could not read built assets from ${missingDistAssetsDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(result.stderr, /Run "pnpm build" first/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('updateBundleBaseline CLI reads overridden report path and writes overridden baseline path', () => {
  const tempRoot = createTempDir('agentos-workbench-bundle-baseline-cli-');
  const reportPath = path.join(tempRoot, 'bundle-report.json');
  const baselinePath = path.join(tempRoot, 'bundle-baseline.json');

  try {
    writeFileSync(
      reportPath,
      `${JSON.stringify(createBundleReportFixture(), null, 2)}\n`,
      'utf8',
    );

    execFileSync('node', ['scripts/updateBundleBaseline.mjs'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        WORKBENCH_BUNDLE_REPORT_PATH: reportPath,
        WORKBENCH_BUNDLE_BASELINE_PATH: baselinePath,
      },
      stdio: 'pipe',
      encoding: 'utf8',
    });

    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    assert.equal(baseline.sourceReportGeneratedAt, '2026-03-26T12:00:00.000Z');
    assert.equal(baseline.metrics.totalBytes, 662570);
    assert.equal(baseline.assets.largestJs.label, 'vendor-polyfills.js');
    assert.equal(baseline.assets.entryJs.label, 'index.js');
    assert.equal(baseline.assets.css.label, 'index.css');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('updateBundleBaseline CLI reports a helpful error when the overridden report path is missing', () => {
  const tempRoot = createTempDir('agentos-workbench-bundle-baseline-cli-missing-report-');
  const reportPath = path.join(tempRoot, 'missing-bundle-report.json');
  const baselinePath = path.join(tempRoot, 'bundle-baseline.json');

  try {
    const result = runNodeScript('scripts/updateBundleBaseline.mjs', {
      WORKBENCH_BUNDLE_REPORT_PATH: reportPath,
      WORKBENCH_BUNDLE_BASELINE_PATH: baselinePath,
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`Could not read ${reportPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(result.stderr, /Run "pnpm bundle:report" first/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('generateBundleBaselineUpdate CLI writes review artifacts from overridden report, baseline, and output paths', () => {
  const tempRoot = createTempDir('agentos-workbench-bundle-update-cli-');
  const reportPath = path.join(tempRoot, 'bundle-report.json');
  const baselinePath = path.join(tempRoot, 'bundle-baseline.json');
  const outputDir = path.join(tempRoot, 'artifacts');

  try {
    writeJsonFixture(reportPath, createBundleReportFixture());
    writeFileSync(
      baselinePath,
      `${JSON.stringify({
        generatedAt: '2026-03-26T12:05:00.000Z',
        metrics: {
          totalBytes: 662570,
          totalGzipBytes: 186700,
          largestJsBytes: 395470,
          entryJsBytes: 155450,
          cssBytes: 111650,
        },
        assets: {
          largestJs: { label: 'vendor-polyfills.js' },
          entryJs: { label: 'index.js' },
          css: { label: 'index.css' },
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const result = runNodeScript('scripts/generateBundleBaselineUpdate.mjs', {
      BASELINE_REASON: 'Fixture baseline update coverage',
      WORKBENCH_BUNDLE_REPORT_PATH: reportPath,
      WORKBENCH_BUNDLE_BASELINE_PATH: baselinePath,
      WORKBENCH_BUNDLE_OUTPUT_DIR: outputDir,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Wrote artifacts\/bundle-baseline-update\.md/);

    const markdown = readFileSync(path.join(outputDir, 'bundle-baseline-update.md'), 'utf8');
    const commitMessage = readFileSync(path.join(outputDir, 'bundle-baseline-commit-message.txt'), 'utf8');
    const patch = readFileSync(path.join(outputDir, 'bundle-baseline.patch'), 'utf8');
    const applyScript = readFileSync(path.join(outputDir, 'bundle-baseline-apply.sh'), 'utf8');

    assert.match(markdown, /Reason: Fixture baseline update coverage/);
    assert.match(markdown, /Bundle report: `bundle-report\.json`/);
    assert.match(commitMessage, /Fixture baseline update coverage/);
    assert.match(patch, /bundle-baseline\.json/);
    assert.match(applyScript, /BASELINE_PATH="bundle-baseline\.json"/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('checkBundleBudget CLI reads overridden report path and passes within configured thresholds', () => {
  const tempRoot = createTempDir('agentos-workbench-bundle-budget-pass-');
  const reportPath = path.join(tempRoot, 'bundle-report.json');

  try {
    writeJsonFixture(reportPath, createBundleReportFixture());

    const result = runNodeScript('scripts/checkBundleBudget.mjs', {
      WORKBENCH_BUNDLE_REPORT_PATH: reportPath,
      WORKBENCH_BUNDLE_MAX_TOTAL_BYTES: '700000',
      WORKBENCH_BUNDLE_MAX_TOTAL_GZIP_BYTES: '190000',
      WORKBENCH_BUNDLE_MAX_LARGEST_JS_BYTES: '400000',
      WORKBENCH_BUNDLE_MAX_ENTRY_JS_BYTES: '160000',
      WORKBENCH_BUNDLE_MAX_CSS_BYTES: '120000',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /AgentOS Workbench bundle budgets/);
    assert.match(result.stdout, /\[PASS\] Largest JavaScript asset: 395\.47 kB \/ 400\.00 kB/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('checkBundleBudget CLI rejects invalid override values before reading the report', () => {
  const result = runNodeScript('scripts/checkBundleBudget.mjs', {
    WORKBENCH_BUNDLE_MAX_TOTAL_BYTES: 'not-a-number',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid WORKBENCH_BUNDLE_MAX_TOTAL_BYTES: "not-a-number"/);
});

test('checkBundleBudget CLI reports failures from overridden thresholds', () => {
  const tempRoot = createTempDir('agentos-workbench-bundle-budget-fail-');
  const reportPath = path.join(tempRoot, 'bundle-report.json');

  try {
    writeJsonFixture(reportPath, createBundleReportFixture({ includeTopJsAssets: false }));

    const result = runNodeScript('scripts/checkBundleBudget.mjs', {
      WORKBENCH_BUNDLE_REPORT_PATH: reportPath,
      WORKBENCH_BUNDLE_MAX_TOTAL_BYTES: '600000',
      WORKBENCH_BUNDLE_MAX_CSS_BYTES: '100000',
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[FAIL\] Total raw bundle size: 662\.57 kB \/ 600\.00 kB/);
    assert.match(result.stdout, /\[FAIL\] Largest CSS asset: 111\.65 kB \/ 100\.00 kB/);
    assert.match(result.stderr, /Total raw bundle size exceeded by 62\.57 kB/);
    assert.match(result.stderr, /Largest CSS asset exceeded by 11\.65 kB/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('checkBundleRegression CLI reads overridden report and baseline paths and passes within allowances', () => {
  const tempRoot = createTempDir('agentos-workbench-bundle-regression-pass-');
  const reportPath = path.join(tempRoot, 'bundle-report.json');
  const baselinePath = path.join(tempRoot, 'bundle-baseline.json');

  try {
    writeJsonFixture(reportPath, createBundleReportFixture({
      assets: Object.values(createCoreBundleAssets()).map((asset) =>
        asset.category === 'vendor'
          ? { ...asset, bytes: 395_470, gzipBytes: 121_000 }
          : asset
      ),
      totals: {
        bytes: 1_880_000,
        gzipBytes: 531_250,
      },
    }));
    writeJsonFixture(baselinePath, createCurrentBundleBaselineFixture({
      metrics: {
        totalBytes: 1_820_000,
        totalGzipBytes: 520_000,
        largestJsBytes: 382_000,
        entryJsBytes: 149_000,
        cssBytes: 109_000,
      },
    }));

    const result = runNodeScript('scripts/checkBundleRegression.mjs', {
      WORKBENCH_BUNDLE_REPORT_PATH: reportPath,
      WORKBENCH_BUNDLE_BASELINE_PATH: baselinePath,
      WORKBENCH_BUNDLE_BASELINE_MAX_TOTAL_BYTES_DELTA: '70000',
      WORKBENCH_BUNDLE_BASELINE_MAX_TOTAL_GZIP_BYTES_DELTA: '12000',
      WORKBENCH_BUNDLE_BASELINE_MAX_LARGEST_JS_BYTES_DELTA: '14000',
      WORKBENCH_BUNDLE_BASELINE_MAX_ENTRY_JS_BYTES_DELTA: '7000',
      WORKBENCH_BUNDLE_BASELINE_MAX_CSS_BYTES_DELTA: '3000',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /AgentOS Workbench bundle baseline comparison/);
    assert.match(result.stdout, /\[PASS\] Total raw bundle size: 1\.88 MB vs baseline 1\.82 MB/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('checkBundleRegression CLI reports failures from overridden allowance paths', () => {
  const tempRoot = createTempDir('agentos-workbench-bundle-regression-fail-');
  const reportPath = path.join(tempRoot, 'bundle-report.json');
  const baselinePath = path.join(tempRoot, 'bundle-baseline.json');

  try {
    writeJsonFixture(reportPath, createBundleReportFixture({
      assets: [
        createAsset('runtime-heavy-QWER1234.js', 450_000, 130_000, 'vendor'),
        createCoreBundleAssets().entryJs,
        createCoreBundleAssets().css,
      ],
      totals: {
        bytes: 1_880_000,
        gzipBytes: 531_250,
      },
    }));
    writeJsonFixture(baselinePath, createCurrentBundleBaselineFixture({
      metrics: {
        totalBytes: 1_820_000,
        totalGzipBytes: 520_000,
        largestJsBytes: 382_000,
        entryJsBytes: 149_000,
        cssBytes: 109_000,
      },
    }));

    const result = runNodeScript('scripts/checkBundleRegression.mjs', {
      WORKBENCH_BUNDLE_REPORT_PATH: reportPath,
      WORKBENCH_BUNDLE_BASELINE_PATH: baselinePath,
      WORKBENCH_BUNDLE_BASELINE_MAX_LARGEST_JS_BYTES_DELTA: '10000',
    });

    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      /\[FAIL\] Largest JavaScript asset: 450\.00 kB vs baseline 382\.00 kB \(\+68\.00 kB, allowance 10\.00 kB, vendor-polyfills\.js -> runtime-heavy\.js\)/,
    );
    assert.match(result.stderr, /Largest JavaScript asset exceeded baseline allowance by 58\.00 kB/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('checkBundleRegression CLI reports a helpful error when the overridden baseline path is missing', () => {
  const tempRoot = createTempDir('agentos-workbench-bundle-regression-missing-baseline-');
  const reportPath = path.join(tempRoot, 'bundle-report.json');
  const baselinePath = path.join(tempRoot, 'missing-bundle-baseline.json');

  try {
    writeJsonFixture(reportPath, createBundleReportFixture({
      assets: Object.values(createCoreBundleAssets()),
    }));

    const result = runNodeScript('scripts/checkBundleRegression.mjs', {
      WORKBENCH_BUNDLE_REPORT_PATH: reportPath,
      WORKBENCH_BUNDLE_BASELINE_PATH: baselinePath,
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`Could not read ${baselinePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(result.stderr, /Run "pnpm bundle:baseline" to refresh the tracked baseline, or set WORKBENCH_BUNDLE_BASELINE_PATH/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
