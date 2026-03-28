#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildBundleSummary,
  defaultBundleReportPath,
  defaultBundleBaselinePath,
  formatBytes,
  getBundleBaselinePath,
  getBundleReportPath,
  projectRoot,
  readBundleBaseline,
  readBundleReport,
  resolveProjectPath,
} from './bundleMetrics.mjs';

const defaultBaselineDisplayPath = path.relative(projectRoot, defaultBundleBaselinePath);

function toDisplayLabel(baseDir, targetPath) {
  const relativePath = path.relative(baseDir, targetPath);
  if (!relativePath || relativePath === '') {
    return path.basename(targetPath);
  }

  return relativePath.startsWith('..') ? path.basename(targetPath) : relativePath;
}

export function resolveBaselineUpdatePaths(env = process.env) {
  const reportPath = getBundleReportPath(env);
  const baselinePath = getBundleBaselinePath(env);
  const outputDir = env.WORKBENCH_BUNDLE_OUTPUT_DIR
    ? resolveProjectPath(env.WORKBENCH_BUNDLE_OUTPUT_DIR)
    : path.dirname(reportPath);
  const baselineRepoDir = path.dirname(baselinePath);
  const baselineGitPath = path.basename(baselinePath);

  return {
    reportPath,
    baselinePath,
    outputDir,
    baselineRepoDir,
    baselineGitPath,
    baselineDisplayPath: baselinePath === defaultBundleBaselinePath
      ? defaultBaselineDisplayPath
      : toDisplayLabel(projectRoot, baselinePath),
    patchPath: path.join(outputDir, 'bundle-baseline.patch'),
    markdownPath: path.join(outputDir, 'bundle-baseline-update.md'),
    commitMessagePath: path.join(outputDir, 'bundle-baseline-commit-message.txt'),
    branchNamePath: path.join(outputDir, 'bundle-baseline-branch-name.txt'),
    prBodyPath: path.join(outputDir, 'bundle-baseline-pr-body.md'),
    applyScriptPath: path.join(outputDir, 'bundle-baseline-apply.sh'),
  };
}

function readHeadBaseline(paths) {
  try {
    const raw = execFileSync('git', ['show', `HEAD:${paths.baselineGitPath}`], {
      cwd: paths.baselineRepoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readBaselinePatch(paths, previousBaselineExists) {
  try {
    if (!previousBaselineExists) {
      return execFileSync('git', ['diff', '--no-index', '--', '/dev/null', paths.baselineGitPath], {
        cwd: paths.baselineRepoDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }

    return execFileSync('git', ['diff', '--', paths.baselineGitPath], {
      cwd: paths.baselineRepoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (
      !previousBaselineExists &&
      error &&
      typeof error === 'object' &&
      'stdout' in error &&
      typeof error.stdout === 'string' &&
      error.stdout.length > 0
    ) {
      return error.stdout;
    }

    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not generate git diff for ${paths.baselineGitPath}. (${detail})`);
  }
}

export function buildMetricRows(previous, current) {
  const rows = [
    ['Total raw', previous?.totalBytes ?? 0, current.totalBytes],
    ['Total gzip', previous?.totalGzipBytes ?? 0, current.totalGzipBytes],
    ['Largest JS', previous?.largestJsBytes ?? 0, current.largestJsBytes],
    ['Entry JS', previous?.entryJsBytes ?? 0, current.entryJsBytes],
    ['Largest CSS', previous?.cssBytes ?? 0, current.cssBytes],
  ];

  return rows.map(([label, previousBytes, currentBytes]) => {
    if (previous == null) {
      return `| ${label} | n/a | ${formatBytes(currentBytes)} | n/a |`;
    }

    const delta = currentBytes - previousBytes;
    const deltaLabel = delta === 0 ? '0 B' : `${delta > 0 ? '+' : '-'}${formatBytes(Math.abs(delta))}`;
    return `| ${label} | ${formatBytes(previousBytes)} | ${formatBytes(currentBytes)} | ${deltaLabel} |`;
  });
}

export function buildBranchName(timestamp) {
  const branchDate = timestamp.slice(0, 10).replace(/-/g, '');
  return `chore/agentos-workbench-bundle-baseline-${branchDate}`;
}

export function buildBaselineUpdateArtifacts({
  reason,
  previousSummary,
  currentSummary,
  suggestedTitle,
  suggestedBranchName,
  largestJsLabel,
  entryJsLabel,
  cssLabel,
  baselineDisplayPath = defaultBaselineDisplayPath,
  patchLabel = path.relative(path.dirname(defaultBundleBaselinePath), path.join(path.dirname(defaultBundleReportPath), 'bundle-baseline.patch')),
  branchNameLabel = path.relative(path.dirname(defaultBundleBaselinePath), path.join(path.dirname(defaultBundleReportPath), 'bundle-baseline-branch-name.txt')),
  prBodyLabel = path.relative(path.dirname(defaultBundleBaselinePath), path.join(path.dirname(defaultBundleReportPath), 'bundle-baseline-pr-body.md')),
  applyScriptLabel = path.relative(path.dirname(defaultBundleBaselinePath), path.join(path.dirname(defaultBundleReportPath), 'bundle-baseline-apply.sh')),
  commitMessageLabel = path.relative(path.dirname(defaultBundleBaselinePath), path.join(path.dirname(defaultBundleReportPath), 'bundle-baseline-commit-message.txt')),
  reportLabel = path.relative(path.dirname(defaultBundleBaselinePath), defaultBundleReportPath),
  baselineFileName = path.basename(defaultBundleBaselinePath),
}) {
  const commitMessage = [
    suggestedTitle,
    '',
    `Reason: ${reason}`,
    '',
    `Total raw: ${previousSummary ? formatBytes(previousSummary.totalBytes) : 'n/a'} -> ${formatBytes(currentSummary.totalBytes)}`,
    `Total gzip: ${previousSummary ? formatBytes(previousSummary.totalGzipBytes) : 'n/a'} -> ${formatBytes(currentSummary.totalGzipBytes)}`,
    `Largest JS: ${previousSummary ? formatBytes(previousSummary.largestJsBytes) : 'n/a'} -> ${formatBytes(currentSummary.largestJsBytes)} (${largestJsLabel})`,
    `Entry JS: ${previousSummary ? formatBytes(previousSummary.entryJsBytes) : 'n/a'} -> ${formatBytes(currentSummary.entryJsBytes)} (${entryJsLabel})`,
    `Largest CSS: ${previousSummary ? formatBytes(previousSummary.cssBytes) : 'n/a'} -> ${formatBytes(currentSummary.cssBytes)} (${cssLabel})`,
  ].join('\n');

  const markdown = [
    '# AgentOS Workbench Bundle Baseline Update',
    '',
    `Reason: ${reason}`,
    '',
    `Suggested branch name: \`${suggestedBranchName}\``,
    '',
    `Suggested commit title: \`${suggestedTitle}\``,
    '',
    'Files to review and commit:',
    '',
    `- \`${baselineDisplayPath}\``,
    '',
    '## Metrics',
    '',
    ...(previousSummary == null
      ? ['No tracked `HEAD` baseline was available in the current git checkout. Current values are still captured below.', '']
      : []),
    '| Metric | Previous | Current | Delta |',
    '| --- | ---: | ---: | ---: |',
    ...buildMetricRows(previousSummary, currentSummary),
    '',
    '## Asset Labels',
    '',
    `- Largest JS: \`${largestJsLabel}\``,
    `- Entry JS: \`${entryJsLabel}\``,
    `- Largest CSS: \`${cssLabel}\``,
    '',
    '## Review Artifacts',
    '',
    `- Patch: \`${patchLabel}\``,
    `- Branch name: \`${branchNameLabel}\``,
    `- PR body: \`${prBodyLabel}\``,
    `- Apply script: \`${applyScriptLabel}\``,
    `- Commit message: \`${commitMessageLabel}\``,
    `- Bundle report: \`${reportLabel}\``,
    '',
    'The generated apply script expects a clean git working tree and an unused target branch name before it will apply the baseline patch.',
    'It accepts either the monorepo root or the nested `apps/agentos-workbench` repo root as its target argument.',
    '',
  ].join('\n');

  const prBody = [
    '## Summary',
    '',
    '- Refresh the AgentOS workbench bundle baseline after an accepted size change.',
    `- Reason: ${reason}`,
    '',
    '## Bundle Metrics',
    '',
    '| Metric | Previous | Current | Delta |',
    '| --- | ---: | ---: | ---: |',
    ...buildMetricRows(previousSummary, currentSummary),
    '',
    '## Notes',
    '',
    `- Largest JS: \`${largestJsLabel}\``,
    `- Entry JS: \`${entryJsLabel}\``,
    `- Largest CSS: \`${cssLabel}\``,
    '',
    'Review the attached baseline patch and bundle report before merging.',
    '',
  ].join('\n');

  const applyScript = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    'ARTIFACT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'REPO_ROOT="${1:-$(pwd)}"',
    `BRANCH_NAME="$(cat "$ARTIFACT_DIR/${path.basename(branchNameLabel)}")"`,
    'TARGET_REPO_ROOT=""',
    `BASELINE_PATH=${JSON.stringify(baselineFileName)}`,
    'REQUIRED_FILES=(',
    '  "bundle-baseline.patch"',
    '  "bundle-baseline-commit-message.txt"',
    '  "bundle-baseline-branch-name.txt"',
    ')',
    '',
    'for required_file in "${REQUIRED_FILES[@]}"; do',
    '  if [[ ! -f "$ARTIFACT_DIR/$required_file" ]]; then',
    '    echo "Missing required artifact: $ARTIFACT_DIR/$required_file" >&2',
    '    exit 1',
    '  fi',
    'done',
    '',
    'if [[ ! -s "$ARTIFACT_DIR/bundle-baseline.patch" ]]; then',
    '  echo "bundle-baseline.patch is empty; nothing to apply." >&2',
    '  exit 1',
    'fi',
    '',
    'cd "$REPO_ROOT"',
    '',
    'if [[ -d "$REPO_ROOT/apps/agentos-workbench/.git" ]]; then',
    '  TARGET_REPO_ROOT="$REPO_ROOT/apps/agentos-workbench"',
    'elif [[ -d "$REPO_ROOT/.git" ]]; then',
    '  TARGET_REPO_ROOT="$REPO_ROOT"',
    'else',
    '  echo "Target directory is neither a git repo nor a monorepo root containing apps/agentos-workbench: $REPO_ROOT" >&2',
    '  exit 1',
    'fi',
    '',
    'cd "$TARGET_REPO_ROOT"',
    '',
    'if ! git rev-parse --show-toplevel >/dev/null 2>&1; then',
    '  echo "Resolved target is not a git repository: $TARGET_REPO_ROOT" >&2',
    '  exit 1',
    'fi',
    '',
    ...(previousSummary != null
      ? [
          'if [[ ! -f "$BASELINE_PATH" ]]; then',
          '  echo "Expected file not found: $TARGET_REPO_ROOT/$BASELINE_PATH" >&2',
          '  exit 1',
          'fi',
          '',
        ]
      : []),
    '',
    'if [[ -n "$(git status --short)" ]]; then',
    '  echo "Working tree is not clean. Commit or stash changes before applying the baseline patch." >&2',
    '  exit 1',
    'fi',
    '',
    'if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then',
    '  echo "Branch already exists: $BRANCH_NAME" >&2',
    '  exit 1',
    'fi',
    '',
    'if ! git apply --check "$ARTIFACT_DIR/bundle-baseline.patch"; then',
    '  echo "Patch no longer applies cleanly. Regenerate the baseline artifacts." >&2',
    '  exit 1',
    'fi',
    '',
    'git switch -c "$BRANCH_NAME" >/dev/null 2>&1 || git checkout -b "$BRANCH_NAME"',
    'git apply --index "$ARTIFACT_DIR/bundle-baseline.patch"',
    'git add "$BASELINE_PATH"',
    `git commit -F "$ARTIFACT_DIR/${path.basename(commitMessageLabel)}"`,
    '',
    'echo "Applied bundle baseline update on branch: $BRANCH_NAME"',
    'echo "Target repo: $TARGET_REPO_ROOT"',
  ].join('\n');

  return {
    commitMessage,
    markdown,
    prBody,
    applyScript,
  };
}

async function main() {
  const paths = resolveBaselineUpdatePaths();
  const [report, currentBaseline] = await Promise.all([readBundleReport(), readBundleBaseline()]);
  const previousBaseline = readHeadBaseline(paths);
  const previousSummary = previousBaseline
    ? {
        totalBytes: previousBaseline.metrics?.totalBytes ?? 0,
        totalGzipBytes: previousBaseline.metrics?.totalGzipBytes ?? 0,
        largestJsBytes: previousBaseline.metrics?.largestJsBytes ?? 0,
        entryJsBytes: previousBaseline.metrics?.entryJsBytes ?? 0,
        cssBytes: previousBaseline.metrics?.cssBytes ?? 0,
      }
    : null;
  const currentSummary = buildBundleSummary(report);
  const patch = readBaselinePatch(paths, previousBaseline != null);
  const reason = process.env.BASELINE_REASON?.trim() || 'Not provided';
  const suggestedTitle = 'chore(agentos-workbench): refresh bundle baseline';
  const suggestedBranchName = buildBranchName(currentBaseline.generatedAt ?? report.generatedAt ?? new Date().toISOString());
  const largestJsLabel = currentBaseline.assets?.largestJs?.label ?? currentSummary.largestJsAsset?.label ?? 'n/a';
  const entryJsLabel = currentBaseline.assets?.entryJs?.label ?? currentSummary.entryAsset?.label ?? 'n/a';
  const cssLabel = currentBaseline.assets?.css?.label ?? currentSummary.cssAsset?.label ?? 'n/a';
  const artifacts = buildBaselineUpdateArtifacts({
    reason,
    previousSummary,
    currentSummary,
    suggestedTitle,
    suggestedBranchName,
    largestJsLabel,
    entryJsLabel,
    cssLabel,
    baselineDisplayPath: paths.baselineDisplayPath,
    patchLabel: toDisplayLabel(paths.baselineRepoDir, paths.patchPath),
    branchNameLabel: toDisplayLabel(paths.baselineRepoDir, paths.branchNamePath),
    prBodyLabel: toDisplayLabel(paths.baselineRepoDir, paths.prBodyPath),
    applyScriptLabel: toDisplayLabel(paths.baselineRepoDir, paths.applyScriptPath),
    commitMessageLabel: toDisplayLabel(paths.baselineRepoDir, paths.commitMessagePath),
    reportLabel: toDisplayLabel(paths.baselineRepoDir, paths.reportPath),
    baselineFileName: paths.baselineGitPath,
  });

  await mkdir(paths.outputDir, { recursive: true });
  await writeFile(paths.patchPath, patch, 'utf8');
  await writeFile(paths.commitMessagePath, `${artifacts.commitMessage}\n`, 'utf8');
  await writeFile(paths.branchNamePath, `${suggestedBranchName}\n`, 'utf8');
  await writeFile(paths.markdownPath, `${artifacts.markdown}\n`, 'utf8');
  await writeFile(paths.prBodyPath, `${artifacts.prBody}\n`, 'utf8');
  await writeFile(paths.applyScriptPath, `${artifacts.applyScript}\n`, { encoding: 'utf8', mode: 0o755 });

  console.log(`Wrote ${path.relative(paths.baselineRepoDir, paths.markdownPath)}`);
  console.log(`Wrote ${path.relative(paths.baselineRepoDir, paths.commitMessagePath)}`);
  console.log(`Wrote ${path.relative(paths.baselineRepoDir, paths.branchNamePath)}`);
  console.log(`Wrote ${path.relative(paths.baselineRepoDir, paths.prBodyPath)}`);
  console.log(`Wrote ${path.relative(paths.baselineRepoDir, paths.applyScriptPath)}`);
  console.log(`Wrote ${path.relative(paths.baselineRepoDir, paths.patchPath)}`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (entryPath === modulePath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
