import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.resolve(__dirname, '..');
export const defaultBundleReportPath = path.join(projectRoot, 'output', 'bundle-report.json');
export const defaultBundleBaselinePath = path.join(projectRoot, 'bundle-baseline.json');

export function resolveProjectPath(targetPath) {
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(projectRoot, targetPath);
}

export function getBundleReportPath(env = process.env) {
  const override = env.WORKBENCH_BUNDLE_REPORT_PATH;
  if (!override) {
    return defaultBundleReportPath;
  }

  return resolveProjectPath(override);
}

export function formatBytes(bytes) {
  if (bytes >= 1000 * 1000) {
    return `${(bytes / (1000 * 1000)).toFixed(2)} MB`;
  }
  if (bytes >= 1000) {
    return `${(bytes / 1000).toFixed(2)} kB`;
  }
  return `${bytes} B`;
}

export function parsePositiveIntegerEnv(name, fallback, env = process.env) {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name}: "${raw}". Expected a non-negative byte count.`);
  }

  return parsed;
}

export function getBundleBaselinePath(env = process.env) {
  const override = env.WORKBENCH_BUNDLE_BASELINE_PATH;
  if (!override) {
    return defaultBundleBaselinePath;
  }

  return resolveProjectPath(override);
}

export async function readJsonFile(filePath, instructions) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read ${filePath}. ${instructions} (${detail})`);
  }
}

export async function readBundleReport(env = process.env) {
  const reportPath = getBundleReportPath(env);
  return readJsonFile(reportPath, 'Run "pnpm bundle:report" first.');
}

export async function readBundleBaseline(env = process.env) {
  const baselinePath = getBundleBaselinePath(env);
  return readJsonFile(
    baselinePath,
    'Run "pnpm bundle:baseline" to refresh the tracked baseline, or set WORKBENCH_BUNDLE_BASELINE_PATH.',
  );
}

export function normalizeAssetLabel(fileName) {
  const extension = path.extname(fileName);
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  return `${baseName.replace(/-[A-Za-z0-9_]{8,}$/, '')}${extension}`;
}

export function findLargestCategoryAsset(assets, category) {
  return assets
    .filter((asset) => asset.category === category)
    .sort((left, right) => right.bytes - left.bytes)[0] ?? null;
}

export function buildBundleSummary(report) {
  const assets = Array.isArray(report.assets) ? report.assets : [];
  const largestJsAsset = Array.isArray(report.topJsAssets) && report.topJsAssets.length > 0
    ? report.topJsAssets[0]
    : [...assets]
        .filter((asset) => asset.extension === '.js')
        .sort((left, right) => right.bytes - left.bytes)[0] ?? null;
  const entryAsset = findLargestCategoryAsset(assets, 'entry');
  const largestCssAsset = findLargestCategoryAsset(assets, 'css');

  return {
    totalBytes: report.totals?.bytes ?? 0,
    totalGzipBytes: report.totals?.gzipBytes ?? 0,
    largestJsBytes: largestJsAsset?.bytes ?? 0,
    entryJsBytes: entryAsset?.bytes ?? 0,
    cssBytes: largestCssAsset?.bytes ?? 0,
    largestJsAsset: largestJsAsset
      ? {
          fileName: largestJsAsset.fileName,
          label: normalizeAssetLabel(largestJsAsset.fileName),
          bytes: largestJsAsset.bytes,
          gzipBytes: largestJsAsset.gzipBytes ?? 0,
        }
      : null,
    entryAsset: entryAsset
      ? {
          fileName: entryAsset.fileName,
          label: normalizeAssetLabel(entryAsset.fileName),
          bytes: entryAsset.bytes,
          gzipBytes: entryAsset.gzipBytes ?? 0,
        }
      : null,
    cssAsset: largestCssAsset
      ? {
          fileName: largestCssAsset.fileName,
          label: normalizeAssetLabel(largestCssAsset.fileName),
          bytes: largestCssAsset.bytes,
          gzipBytes: largestCssAsset.gzipBytes ?? 0,
        }
      : null,
  };
}
