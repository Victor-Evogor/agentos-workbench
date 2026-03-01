import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type EvaluationRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface EvaluationRunStats {
  averageScore: number;
  duration: number;
  totals: number;
  passed: number;
  failed: number;
}

export interface EvaluationRunRecord {
  id: string;
  name: string;
  status: EvaluationRunStatus;
  startedAt: string;
  completedAt?: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageScore: number;
  duration?: number;
  stats: EvaluationRunStats;
}

export interface EvaluationTestCase {
  id: string;
  name: string;
  input: string;
  expectedOutput: string;
  category: string;
}

export interface EvaluationMetric {
  name: string;
  score: number;
  threshold: number;
  passed: boolean;
}

export interface EvaluationRunResult {
  testCaseId: string;
  testCaseName: string;
  passed: boolean;
  score: number;
  actualOutput?: string;
  error?: string;
  duration: number;
  metrics: EvaluationMetric[];
}

export interface StartEvaluationRunInput {
  agentId?: string;
  name?: string;
  testCaseIds?: string[];
}

type StoredRun = {
  run: EvaluationRunRecord;
  results: EvaluationRunResult[];
};

type PersistedEvaluationState = {
  version: number;
  runCounter: number;
  testCases: EvaluationTestCase[];
  runs: StoredRun[];
};

const STORE_VERSION = 1;
const BASE_TIME_MS = Date.parse('2026-01-15T09:00:00.000Z');

const DEFAULT_TEST_CASES: EvaluationTestCase[] = [
  {
    id: 'tc-001',
    name: 'Simple Question Answering',
    input: 'What is the capital of France?',
    expectedOutput: 'Paris',
    category: 'factual',
  },
  {
    id: 'tc-002',
    name: 'Multi-step Reasoning',
    input: 'If John has 5 apples and gives 2 to Mary, how many does he have?',
    expectedOutput: '3',
    category: 'reasoning',
  },
  {
    id: 'tc-003',
    name: 'Code Generation',
    input: 'Write a function to calculate Fibonacci numbers in Python.',
    expectedOutput: 'def fibonacci(n): ...',
    category: 'code',
  },
  {
    id: 'tc-004',
    name: 'Summarization Quality',
    input: 'Summarize the article on climate adaptation in 3 bullets.',
    expectedOutput: 'A concise 3-bullet summary.',
    category: 'summarization',
  },
];

function toFixedScore(score: number): number {
  return Number(score.toFixed(2));
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, toFixedScore(score)));
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveStorePath(): string {
  const configuredPath = process.env.AGENTOS_WORKBENCH_EVALUATION_STORE_PATH?.trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  return path.resolve(__dirname, '../../../.data/evaluation-store.json');
}

function isStoredRun(value: unknown): value is StoredRun {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as StoredRun;
  return Boolean(
    candidate.run &&
      typeof candidate.run === 'object' &&
      typeof candidate.run.id === 'string' &&
      Array.isArray(candidate.results)
  );
}

function normalizePersistedState(
  raw: unknown
): { runCounter: number; testCases: EvaluationTestCase[]; runs: StoredRun[] } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Partial<PersistedEvaluationState>;
  if (!Array.isArray(candidate.testCases) || !Array.isArray(candidate.runs)) {
    return null;
  }
  const runs = candidate.runs.filter((item) => isStoredRun(item));
  const runCounter =
    typeof candidate.runCounter === 'number' && Number.isFinite(candidate.runCounter)
      ? candidate.runCounter
      : runs.length;
  return {
    runCounter,
    testCases: deepClone(candidate.testCases),
    runs: deepClone(runs),
  };
}

export class EvaluationStore {
  private readonly storePath: string;
  private testCases: EvaluationTestCase[];
  private runs: StoredRun[];
  private runCounter: number;

  constructor(testCases: EvaluationTestCase[] = DEFAULT_TEST_CASES, storePath = resolveStorePath()) {
    this.storePath = storePath;
    const persisted = this.loadState();
    if (persisted) {
      this.testCases = persisted.testCases;
      this.runs = persisted.runs;
      this.runCounter = persisted.runCounter;
      return;
    }

    this.testCases = deepClone(testCases);
    this.runs = [];
    this.runCounter = 0;

    this.startRun({
      name: 'Baseline Regression',
      testCaseIds: this.testCases.map((testCase) => testCase.id),
    });
    this.startRun({
      name: 'Reasoning Focus Suite',
      testCaseIds: ['tc-001', 'tc-002', 'tc-004'],
    });
  }

  listRuns(): EvaluationRunRecord[] {
    return this.runs.map(({ run }) => ({ ...run, stats: { ...run.stats } }));
  }

  getRunResults(runId: string): EvaluationRunResult[] {
    const match = this.runs.find((item) => item.run.id === runId);
    if (!match) {
      return [];
    }
    return match.results.map((result) => ({
      ...result,
      metrics: result.metrics.map((metric) => ({ ...metric })),
    }));
  }

  listTestCases(): EvaluationTestCase[] {
    return this.testCases.map((testCase) => ({ ...testCase }));
  }

  startRun(input: StartEvaluationRunInput = {}): EvaluationRunRecord {
    const selectedCases = this.resolveTestCases(input.testCaseIds);
    const runIndex = ++this.runCounter;
    const runName = input.name?.trim() || `Evaluation Run #${runIndex}`;

    const results = selectedCases.map((testCase, index) =>
      this.buildResult(testCase, runIndex, index)
    );

    const totalTests = results.length;
    const passedTests = results.filter((result) => result.passed).length;
    const failedTests = totalTests - passedTests;
    const averageScore =
      totalTests === 0
        ? 0
        : toFixedScore(
            results.reduce((sum, result) => sum + result.score, 0) / totalTests
          );
    const duration = results.reduce((sum, result) => sum + result.duration, 0);
    const startedAtMs = BASE_TIME_MS + runIndex * 17 * 60 * 1000;
    const completedAtMs = startedAtMs + duration;

    const run: EvaluationRunRecord = {
      id: `run-${String(runIndex).padStart(4, '0')}`,
      name: runName,
      status: 'completed',
      startedAt: new Date(startedAtMs).toISOString(),
      completedAt: new Date(completedAtMs).toISOString(),
      totalTests,
      passedTests,
      failedTests,
      averageScore,
      duration,
      stats: {
        averageScore,
        duration,
        totals: totalTests,
        passed: passedTests,
        failed: failedTests,
      },
    };

    this.runs.unshift({
      run,
      results,
    });
    this.persistState();

    return { ...run, stats: { ...run.stats } };
  }

  private resolveTestCases(testCaseIds?: string[]): EvaluationTestCase[] {
    if (!Array.isArray(testCaseIds) || testCaseIds.length === 0) {
      return [...this.testCases];
    }

    const requested = new Set(testCaseIds);
    const matched = this.testCases.filter((testCase) => requested.has(testCase.id));
    return matched.length > 0 ? matched : [...this.testCases];
  }

  private buildResult(
    testCase: EvaluationTestCase,
    runIndex: number,
    caseIndex: number
  ): EvaluationRunResult {
    const rawScoreSeed = (runIndex * 17 + caseIndex * 13) % 39;
    const score = clampScore(0.56 + rawScoreSeed / 100);
    const consistencyScore = clampScore(score - 0.06 + ((runIndex + caseIndex) % 3) * 0.03);
    const relevanceScore = clampScore(score - 0.04 + ((runIndex + caseIndex) % 2) * 0.02);
    const duration = 850 + ((runIndex * 191 + caseIndex * 283) % 2400);
    const passThreshold = 0.75;
    const passed = score >= passThreshold;

    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      passed,
      score,
      actualOutput: passed ? `Synthetic output for ${testCase.name}` : undefined,
      error: passed ? undefined : `Score ${score} below threshold ${passThreshold}`,
      duration,
      metrics: [
        {
          name: 'accuracy',
          score,
          threshold: passThreshold,
          passed,
        },
        {
          name: 'consistency',
          score: consistencyScore,
          threshold: 0.7,
          passed: consistencyScore >= 0.7,
        },
        {
          name: 'relevance',
          score: relevanceScore,
          threshold: 0.68,
          passed: relevanceScore >= 0.68,
        },
      ],
    };
  }

  private loadState(): { runCounter: number; testCases: EvaluationTestCase[]; runs: StoredRun[] } | null {
    try {
      if (!existsSync(this.storePath)) {
        return null;
      }

      const raw = readFileSync(this.storePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedEvaluationState;
      if (!parsed || parsed.version !== STORE_VERSION) {
        return null;
      }
      return normalizePersistedState(parsed);
    } catch (error) {
      console.warn('[EvaluationStore] Failed to load persisted state:', error);
      return null;
    }
  }

  private persistState(): void {
    const payload: PersistedEvaluationState = {
      version: STORE_VERSION,
      runCounter: this.runCounter,
      testCases: this.testCases,
      runs: this.runs,
    };

    const directory = path.dirname(this.storePath);
    mkdirSync(directory, { recursive: true });
    const tempPath = `${this.storePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf-8');
    renameSync(tempPath, this.storePath);
  }
}

export const evaluationStore = new EvaluationStore();
