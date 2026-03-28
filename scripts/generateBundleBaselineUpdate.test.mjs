import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { buildBaselineUpdateArtifacts } from './generateBundleBaselineUpdate.mjs';
import {
  createBundleReportFixture,
  createCurrentBundleBaselineFixture,
  createPreviousBundleBaselineFixture,
  writeJsonFixture,
} from './bundleTestFixtures.mjs';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
let artifactsDir;
let applyScriptPath;
let branchNamePath;
let patchPath;
let prBodyPath;
let baselineFixtureRepoPath;
let baselineFixturePath;
let reportFixturePath;

before(() => {
  artifactsDir = createTempDir('agentos-workbench-generated-artifacts-');
  applyScriptPath = path.join(artifactsDir, 'bundle-baseline-apply.sh');
  branchNamePath = path.join(artifactsDir, 'bundle-baseline-branch-name.txt');
  patchPath = path.join(artifactsDir, 'bundle-baseline.patch');
  prBodyPath = path.join(artifactsDir, 'bundle-baseline-pr-body.md');
  baselineFixtureRepoPath = createTempDir('agentos-workbench-baseline-fixture-');
  baselineFixturePath = path.join(baselineFixtureRepoPath, 'bundle-baseline.json');
  reportFixturePath = path.join(baselineFixtureRepoPath, 'bundle-report.json');

  initGitRepo(baselineFixtureRepoPath);
  writeJsonFixture(baselineFixturePath, createPreviousBundleBaselineFixture());
  execFileSync('git', ['add', 'bundle-baseline.json'], { cwd: baselineFixtureRepoPath, stdio: 'pipe' });
  execFileSync('git', ['commit', '-qm', 'seed baseline fixture'], { cwd: baselineFixtureRepoPath, stdio: 'pipe' });

  writeJsonFixture(baselineFixturePath, createCurrentBundleBaselineFixture());
  writeJsonFixture(reportFixturePath, createBundleReportFixture());
  runGenerator('Automated artifact coverage');
});

after(() => {
  if (artifactsDir) {
    rmSync(artifactsDir, { recursive: true, force: true });
  }
  if (baselineFixtureRepoPath) {
    rmSync(baselineFixtureRepoPath, { recursive: true, force: true });
  }
});

function runGenerator(reason) {
  execFileSync('node', ['scripts/generateBundleBaselineUpdate.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BASELINE_REASON: reason,
      WORKBENCH_BUNDLE_OUTPUT_DIR: artifactsDir,
      WORKBENCH_BUNDLE_REPORT_PATH: reportFixturePath,
      WORKBENCH_BUNDLE_BASELINE_PATH: baselineFixturePath,
    },
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

function initGitRepo(repoPath) {
  execFileSync('git', ['init', '-q'], { cwd: repoPath, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Bundle Bot'], { cwd: repoPath, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'bundle-bot@example.com'], { cwd: repoPath, stdio: 'pipe' });
  writeFileSync(path.join(repoPath, '.gitkeep'), '');
  execFileSync('git', ['add', '.gitkeep'], { cwd: repoPath, stdio: 'pipe' });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: repoPath, stdio: 'pipe' });
}

function runApplyScript(targetPath) {
  return spawnSync(applyScriptPath, [targetPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function runApplyScriptAt(scriptPath, targetPath) {
  return spawnSync(scriptPath, [targetPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function createTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function seedPreviousBaseline(repoPath) {
  writeJsonFixture(path.join(repoPath, 'bundle-baseline.json'), createPreviousBundleBaselineFixture());
  execFileSync('git', ['add', 'bundle-baseline.json'], { cwd: repoPath, stdio: 'pipe' });
  execFileSync('git', ['commit', '-qm', 'seed target baseline'], { cwd: repoPath, stdio: 'pipe' });
}

test('bundle baseline update emits actionable review artifacts', () => {
  const branchName = readFileSync(branchNamePath, 'utf8').trim();
  const prBody = readFileSync(prBodyPath, 'utf8');
  const applyScript = readFileSync(applyScriptPath, 'utf8');
  const patchSummary = readFileSync(path.join(artifactsDir, 'bundle-baseline-update.md'), 'utf8');

  assert.match(branchName, /^chore\/agentos-workbench-bundle-baseline-\d{8}$/);
  assert.match(prBody, /## Summary/);
  assert.match(prBody, /Review the attached baseline patch and bundle report before merging\./);
  assert.match(applyScript, /TARGET_REPO_ROOT/);
  assert.match(applyScript, /Working tree is not clean/);
  assert.match(applyScript, /git apply --check/);
  assert.match(patchSummary, /- `bundle-baseline\.json`/);
  assert.match(patchSummary, /- Patch: `bundle-baseline\.patch`/);
  assert.match(patchSummary, /- Bundle report: `bundle-report\.json`/);
  assert.doesNotMatch(patchSummary, /\.\.\/\.\.\//);
});

test('baseline update artifacts include tracked-baseline deltas when previous metrics exist', () => {
  const artifacts = buildBaselineUpdateArtifacts({
    reason: 'Tracked baseline regression coverage',
    previousSummary: {
      totalBytes: 1000,
      totalGzipBytes: 500,
      largestJsBytes: 400,
      entryJsBytes: 300,
      cssBytes: 200,
    },
    currentSummary: {
      totalBytes: 1300,
      totalGzipBytes: 650,
      largestJsBytes: 450,
      entryJsBytes: 325,
      cssBytes: 210,
    },
    suggestedTitle: 'chore(agentos-workbench): refresh bundle baseline',
    suggestedBranchName: 'chore/agentos-workbench-bundle-baseline-20260326',
    largestJsLabel: 'vendor-polyfills.js',
    entryJsLabel: 'index.js',
    cssLabel: 'index.css',
  });

  assert.doesNotMatch(artifacts.markdown, /No tracked `HEAD` baseline/);
  assert.match(artifacts.markdown, /\| Total raw \| 1\.00 kB \| 1\.30 kB \| \+300 B \|/);
  assert.match(artifacts.prBody, /\| Largest JS \| 400 B \| 450 B \| \+50 B \|/);
  assert.match(artifacts.commitMessage, /Total raw: 1\.00 kB -> 1\.30 kB/);
  assert.match(artifacts.applyScript, /Expected file not found: \$TARGET_REPO_ROOT\/\$BASELINE_PATH/);
});

test('generated apply script applies in a standalone workbench repo and blocks reruns', () => {
  const repoPath = createTempDir('agentos-workbench-root-');
  try {
    initGitRepo(repoPath);
    seedPreviousBaseline(repoPath);

    const firstRun = runApplyScript(repoPath);
    assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);
    assert.match(firstRun.stdout, /Applied bundle baseline update on branch:/);
    assert.equal(
      execFileSync('git', ['branch', '--show-current'], { cwd: repoPath, encoding: 'utf8' }).trim(),
      readFileSync(branchNamePath, 'utf8').trim(),
    );
    assert.equal(
      execFileSync('git', ['log', '--pretty=%s', '-1'], { cwd: repoPath, encoding: 'utf8' }).trim(),
      'chore(agentos-workbench): refresh bundle baseline',
    );
    assert.equal(
      execFileSync('git', ['ls-files', '--', 'bundle-baseline.json'], { cwd: repoPath, encoding: 'utf8' }).trim(),
      'bundle-baseline.json',
    );

    const secondRun = runApplyScript(repoPath);
    assert.equal(secondRun.status, 1);
    assert.match(secondRun.stderr, /Branch already exists:/);
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});

test('generated apply script applies from a monorepo root into nested agentos-workbench repo', () => {
  const monorepoRoot = createTempDir('agentos-monorepo-root-');
  const nestedRepoPath = path.join(monorepoRoot, 'apps', 'agentos-workbench');
  try {
    mkdirSync(nestedRepoPath, { recursive: true });
    initGitRepo(nestedRepoPath);
    seedPreviousBaseline(nestedRepoPath);

    const result = runApplyScript(monorepoRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, new RegExp(`Target repo: ${nestedRepoPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.equal(
      execFileSync('git', ['ls-files', '--', 'bundle-baseline.json'], { cwd: nestedRepoPath, encoding: 'utf8' }).trim(),
      'bundle-baseline.json',
    );
  } finally {
    rmSync(monorepoRoot, { recursive: true, force: true });
  }
});

test('generated apply script rejects stale patch targets with a clear message', () => {
  const repoPath = createTempDir('agentos-workbench-stale-');
  try {
    initGitRepo(repoPath);
    writeFileSync(path.join(repoPath, 'bundle-baseline.json'), '{"stale":true}\n');
    execFileSync('git', ['add', 'bundle-baseline.json'], { cwd: repoPath, stdio: 'pipe' });
    execFileSync('git', ['commit', '-qm', 'add stale baseline'], { cwd: repoPath, stdio: 'pipe' });

    const result = runApplyScript(repoPath);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Patch no longer applies cleanly/);
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});

test('generated apply script rejects dirty repos with a clear message', () => {
  const repoPath = createTempDir('agentos-workbench-dirty-');
  try {
    initGitRepo(repoPath);
    seedPreviousBaseline(repoPath);
    writeFileSync(path.join(repoPath, 'dirty.txt'), 'dirty\n');

    const result = runApplyScript(repoPath);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Working tree is not clean/);
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});

test('generated apply script rejects non-repo targets with a clear message', () => {
  const targetPath = createTempDir('agentos-workbench-nonrepo-');
  try {
    const result = runApplyScript(targetPath);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Target directory is neither a git repo nor a monorepo root containing apps\/agentos-workbench/);
  } finally {
    rmSync(targetPath, { recursive: true, force: true });
  }
});

test('generated apply script rejects missing artifact files with a clear message', () => {
  const artifactDir = createTempDir('agentos-workbench-artifacts-');
  const repoPath = createTempDir('agentos-workbench-missing-artifact-');
  const copiedScriptPath = path.join(artifactDir, 'bundle-baseline-apply.sh');

  try {
    copyFileSync(applyScriptPath, copiedScriptPath);
    copyFileSync(patchPath, path.join(artifactDir, 'bundle-baseline.patch'));
    copyFileSync(branchNamePath, path.join(artifactDir, 'bundle-baseline-branch-name.txt'));
    mkdirSync(repoPath, { recursive: true });

    const result = runApplyScriptAt(copiedScriptPath, repoPath);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing required artifact: .*bundle-baseline-commit-message\.txt/);
  } finally {
    rmSync(artifactDir, { recursive: true, force: true });
    rmSync(repoPath, { recursive: true, force: true });
  }
});
