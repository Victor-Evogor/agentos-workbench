#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildBundleSummary,
  formatBytes,
  parsePositiveIntegerEnv,
  readBundleReport,
} from './bundleMetrics.mjs';

export function buildBudgetThresholds(env = process.env) {
  return {
    totalBytes: parsePositiveIntegerEnv('WORKBENCH_BUNDLE_MAX_TOTAL_BYTES', 2_000_000, env),
    totalGzipBytes: parsePositiveIntegerEnv('WORKBENCH_BUNDLE_MAX_TOTAL_GZIP_BYTES', 560_000, env),
    largestJsBytes: parsePositiveIntegerEnv('WORKBENCH_BUNDLE_MAX_LARGEST_JS_BYTES', 425_000, env),
    entryJsBytes: parsePositiveIntegerEnv('WORKBENCH_BUNDLE_MAX_ENTRY_JS_BYTES', 170_000, env),
    cssBytes: parsePositiveIntegerEnv('WORKBENCH_BUNDLE_MAX_CSS_BYTES', 125_000, env),
  };
}

function createBudgetCheck(label, actual, budget, subject) {
  return {
    label,
    actual,
    budget,
    subject,
    exceededBytes: Math.max(actual - budget, 0),
    passes: actual <= budget,
  };
}

export function buildBundleBudgetChecks(summary, budgets = buildBudgetThresholds()) {
  return [
    createBudgetCheck('Total raw bundle size', summary.totalBytes, budgets.totalBytes, 'all emitted assets'),
    createBudgetCheck(
      'Total gzip bundle size',
      summary.totalGzipBytes,
      budgets.totalGzipBytes,
      'all emitted assets (gzip)',
    ),
    createBudgetCheck(
      'Largest JavaScript asset',
      summary.largestJsBytes,
      budgets.largestJsBytes,
      summary.largestJsAsset?.fileName ?? 'n/a',
    ),
    createBudgetCheck(
      'Entry JavaScript asset',
      summary.entryJsBytes,
      budgets.entryJsBytes,
      summary.entryAsset?.fileName ?? 'n/a',
    ),
    createBudgetCheck('Largest CSS asset', summary.cssBytes, budgets.cssBytes, summary.cssAsset?.fileName ?? 'n/a'),
  ];
}

export function evaluateBundleBudgets(summary, budgets = buildBudgetThresholds()) {
  const checks = buildBundleBudgetChecks(summary, budgets);
  const failures = checks.filter((check) => !check.passes);
  const summaryMessage = failures.length > 0
    ? failures
        .map((failure) => `${failure.label} exceeded by ${formatBytes(failure.exceededBytes)}`)
        .join('; ')
    : null;

  return {
    checks,
    failures,
    summaryMessage,
  };
}

export function formatBudgetCheck(check) {
  const status = check.passes ? 'PASS' : 'FAIL';
  return `- [${status}] ${check.label}: ${formatBytes(check.actual)} / ${formatBytes(check.budget)} (${check.subject})`;
}

async function main() {
  const report = await readBundleReport();
  const summary = buildBundleSummary(report);
  const budgets = buildBudgetThresholds();
  const { checks, summaryMessage } = evaluateBundleBudgets(summary, budgets);

  console.log('AgentOS Workbench bundle budgets');
  for (const check of checks) {
    console.log(formatBudgetCheck(check));
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
