import { FastifyInstance } from 'fastify';
import { evaluationStore, type StartEvaluationRunInput } from '../services/evaluationStore';

/**
 * Registers Evaluation routes.
 * @param fastify The Fastify instance.
 */
export default async function evaluationRoutes(fastify: FastifyInstance) {
  const metricSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      score: { type: 'number' },
      threshold: { type: 'number' },
      passed: { type: 'boolean' },
    },
  } as const;

  const resultSchema = {
    type: 'object',
    properties: {
      testCaseId: { type: 'string' },
      testCaseName: { type: 'string' },
      passed: { type: 'boolean' },
      score: { type: 'number' },
      actualOutput: { type: 'string' },
      error: { type: 'string' },
      duration: { type: 'number' },
      metrics: {
        type: 'array',
        items: metricSchema,
      },
    },
  } as const;

  const testCaseSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      input: { type: 'string' },
      expectedOutput: { type: 'string' },
      category: { type: 'string' },
    },
  } as const;

  const runSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
      startedAt: { type: 'string' },
      completedAt: { type: 'string' },
      totalTests: { type: 'number' },
      passedTests: { type: 'number' },
      failedTests: { type: 'number' },
      averageScore: { type: 'number' },
      duration: { type: 'number' },
      stats: {
        type: 'object',
        properties: {
          averageScore: { type: 'number' },
          duration: { type: 'number' },
          totals: { type: 'number' },
          passed: { type: 'number' },
          failed: { type: 'number' },
        },
      },
    },
  } as const;

  /**
   * Get evaluation runs.
   */
  fastify.get('/runs', {
    schema: {
      description: 'List all evaluation runs',
      tags: ['Evaluation'],
      response: {
        200: {
          type: 'array',
          items: runSchema,
        }
      }
    }
  }, async () => {
    return evaluationStore.listRuns();
  });

  /**
   * Get specific run results.
   */
  fastify.get<{ Params: { runId: string } }>('/runs/:runId/results', {
    schema: {
      description: 'Get detailed results for a specific evaluation run',
      tags: ['Evaluation'],
      params: {
        type: 'object',
        properties: {
          runId: { type: 'string' }
        },
        required: ['runId']
      },
      response: {
        200: {
          type: 'array',
          items: resultSchema,
        }
      }
    }
  }, async (request) => {
    return evaluationStore.getRunResults(request.params.runId);
  });

  /**
   * Get test cases.
   */
  fastify.get('/test-cases', {
    schema: {
      description: 'List all available test cases',
      tags: ['Evaluation'],
      response: {
        200: {
          type: 'array',
          items: testCaseSchema,
        }
      }
    }
  }, async () => {
    return evaluationStore.listTestCases();
  });

  /**
   * Start a run.
   */
  fastify.post('/run', {
    schema: {
      description: 'Start a new evaluation run',
      tags: ['Evaluation'],
      body: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          name: { type: 'string' },
          testCaseIds: { type: 'array', items: { type: 'string' } }
        }
      },
      response: {
        200: {
          ...runSchema,
        }
      }
    }
  }, async (request) => {
    const payload = (request.body ?? {}) as StartEvaluationRunInput;
    return evaluationStore.startRun(payload);
  });
}
