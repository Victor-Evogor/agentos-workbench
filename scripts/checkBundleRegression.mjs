#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildBundleSummary,
  formatBytes,
  parsePositiveIntegerEnv,
  readBundleBaseline,
  readBundleReport,
} from './bundleMetrics.mjs';

function createCheck(label, current, baseline, allowance, currentAsset, baselineAsset) {
  return {
    label,
    current,
    baseline,
    allowance,
    allowed: baseline + allowance,
    currentAsset,
    baselineAsset,
    delta: current - baseline,
    exceededBytes: Math.max(current - (baseline + allowance), 0),
    passes: current <= baseline + allowance,
  };
}

export function buildRegressionAllowances(env = process.env) {
  return {
    totalBytes: parsePositiveIntegerEnv('WORKBENCH_BUNDLE_BASELINE_MAX_TOTAL_BYTES_DELTA', 120_000, env),
    totalGzipBytes: parsePositiveIntegerEnv('WORKBENCH_BUNDLE_BASELINE_MAX_TOTAL_GZIP_BYTES_DELTA', 28_000, env),
    largestJsBytes: parsePositiveIntegerEnv('WORKBENCH_BUNDLE_BASELINE_MAX_LARGEST_JS_BYTES_DELTA', 29_000, env),
    entryJsBytes: parsePositiveIntegerEnv('WORKBENCH_BUNDLE_BASELINE_MAX_ENTRY_JS_BYTES_DELTA', 14_000, env),
    cssBytes: parsePositiveIntegerEnv('WORKBENCH_BUNDLE_BASELINE_MAX_CSS_BYTES_DELTA', 13_000, env),
  };
}

export function buildBundleRegressionChecks(summary, baseline, allowances = buildRegressionAllowances()) {
  return [
    createCheck(
      'Total raw bundle size',
      summary.totalBytes,
      baseline.metrics?.totalBytes ?? 0,
      allowances.totalBytes,
      'all emitted assets',
      'all emitted assets',
    ),
    createCheck(
      'Total gzip bundle size',
      summary.totalGzipBytes,
      baseline.metrics?.totalGzipBytes ?? 0,
      allowances.totalGzipBytes,
      'all emitted assets (gzip)',
      'all emitted assets (gzip)',
    ),
    createCheck(
      'Largest JavaScript asset',
      summary.largestJsBytes,
      baseline.metrics?.largestJsBytes ?? 0,
      allowances.largestJsBytes,
      summary.largestJsAsset?.label ?? 'n/a',
      baseline.assets?.largestJs?.label ?? 'n/a',
    ),
    createCheck(
      'Entry JavaScript asset',
      summary.entryJsBytes,
      baseline.metrics?.entryJsBytes ?? 0,
      allowances.entryJsBytes,
      summary.entryAsset?.label ?? 'n/a',
      baseline.assets?.entryJs?.label ?? 'n/a',
    ),
    createCheck(
      'Largest CSS asset',
      summary.cssBytes,
      baseline.metrics?.cssBytes ?? 0,
      allowances.cssBytes,
      summary.cssAsset?.label ?? 'n/a',
      baseline.assets?.css?.label ?? 'n/a',
    ),
  ];
}

export function evaluateBundleRegression(summary, baseline, allowances = buildRegressionAllowances()) {
  const checks = buildBundleRegressionChecks(summary, baseline, allowances);
  const failures = checks.filter((check) => !check.passes);
  const summaryMessage = failures.length > 0
    ? failures
        .map((failure) => `${failure.label} exceeded baseline allowance by ${formatBytes(failure.exceededBytes)}`)
        .join('; ')
    : null;

  return {
    checks,
    failures,
    summaryMessage,
  };
}

export function formatRegressionCheck(check) {
  const status = check.passes ? 'PASS' : 'FAIL';
  const baselineSubject = check.baselineAsset === check.currentAsset
    ? check.currentAsset
    : `${check.baselineAsset} -> ${check.currentAsset}`;
  const deltaLabel = check.delta >= 0 ? `+${formatBytes(check.delta)}` : `-${formatBytes(Math.abs(check.delta))}`;
  return `- [${status}] ${check.label}: ${formatBytes(check.current)} vs baseline ${formatBytes(check.baseline)} (${deltaLabel}, allowance ${formatBytes(check.allowance)}, ${baselineSubject})`;
}

async function main() {
  const report = await readBundleReport();
  const baseline = await readBundleBaseline();
  const summary = buildBundleSummary(report);
  const allowances = buildRegressionAllowances();
  const { checks, summaryMessage } = evaluateBundleRegression(summary, baseline, allowances);

  console.log('AgentOS Workbench bundle baseline comparison');
  for (const check of checks) {
    console.log(formatRegressionCheck(check));
  }

  if (summaryMessage) {
    throw new Error(summaryMessage);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
