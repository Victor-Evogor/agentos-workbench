import { FastifyInstance } from 'fastify';
import {
  planningStore,
  type CreatePlanInput,
  type PlanActionType,
  type PlanStatus,
  type PlanStepStatus,
} from '../services/planningStore';

const STEP_ACTION_TYPES: PlanActionType[] = [
  'tool_call',
  'gmi_action',
  'human_input',
  'sub_plan',
  'reflection',
  'communication',
];

const STEP_STATUS_TYPES: PlanStepStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'skipped',
];

const PLAN_STATUS_TYPES: PlanStatus[] = ['draft', 'executing', 'paused', 'completed', 'failed'];

const planStepSchema = {
  type: 'object',
  properties: {
    stepId: { type: 'string' },
    description: { type: 'string' },
    actionType: { type: 'string', enum: STEP_ACTION_TYPES },
    toolId: { type: 'string' },
    status: { type: 'string', enum: STEP_STATUS_TYPES },
    dependsOn: { type: 'array', items: { type: 'string' } },
    estimatedTokens: { type: 'number' },
    confidence: { type: 'number' },
    output: {},
    error: { type: 'string' },
    durationMs: { type: 'number' },
  },
} as const;

const checkpointSchema = {
  type: 'object',
  properties: {
    checkpointId: { type: 'string' },
    timestamp: { type: 'string' },
    reason: { type: 'string' },
    status: { type: 'string', enum: PLAN_STATUS_TYPES },
    currentStepIndex: { type: 'number' },
    steps: {
      type: 'array',
      items: planStepSchema,
    },
  },
} as const;

const planSchema = {
  type: 'object',
  properties: {
    planId: { type: 'string' },
    goal: { type: 'string' },
    steps: {
      type: 'array',
      items: planStepSchema,
    },
    estimatedTokens: { type: 'number' },
    confidenceScore: { type: 'number' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    status: { type: 'string', enum: PLAN_STATUS_TYPES },
    currentStepIndex: { type: 'number' },
    source: { type: 'string', enum: ['manual', 'runtime'] },
    readOnly: { type: 'boolean' },
    conversationId: { type: 'string' },
    workflowId: { type: 'string' },
    checkpoints: {
      type: 'array',
      items: checkpointSchema,
    },
  },
} as const;

export default async function planningRoutes(fastify: FastifyInstance) {
  fastify.get('/plans', {
    schema: {
      description: 'List all planning records',
      tags: ['Planning'],
      response: {
        200: {
          type: 'array',
          items: planSchema,
        },
      },
    },
  }, async () => {
    return planningStore.listPlans();
  });

  fastify.post<{ Body: CreatePlanInput }>('/plans', {
    schema: {
      description: 'Create a new plan',
      tags: ['Planning'],
      body: {
        type: 'object',
        properties: {
          goal: { type: 'string' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                actionType: { type: 'string', enum: STEP_ACTION_TYPES },
                toolId: { type: 'string' },
                dependsOn: { type: 'array', items: { type: 'string' } },
                estimatedTokens: { type: 'number' },
                confidence: { type: 'number' },
              },
              required: ['description'],
            },
          },
        },
      },
      response: {
        200: planSchema,
      },
    },
  }, async (request) => {
    return planningStore.createPlan(request.body ?? {});
  });

  fastify.post<{ Params: { planId: string } }>('/plans/:planId/pause', {
    schema: {
      description: 'Pause an executing plan',
      tags: ['Planning'],
      params: {
        type: 'object',
        properties: {
          planId: { type: 'string' },
        },
        required: ['planId'],
      },
      response: {
        200: planSchema,
        404: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const plan = planningStore.pausePlan(request.params.planId);
    if (!plan) {
      return reply.status(404).send({ message: 'Plan not found' });
    }
    return plan;
  });

  fastify.post<{ Params: { planId: string } }>('/plans/:planId/resume', {
    schema: {
      description: 'Resume a paused plan',
      tags: ['Planning'],
      params: {
        type: 'object',
        properties: {
          planId: { type: 'string' },
        },
        required: ['planId'],
      },
      response: {
        200: planSchema,
        404: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const plan = planningStore.resumePlan(request.params.planId);
    if (!plan) {
      return reply.status(404).send({ message: 'Plan not found' });
    }
    return plan;
  });

  fastify.post<{ Params: { planId: string } }>('/plans/:planId/advance', {
    schema: {
      description: 'Advance the current step in an executing plan',
      tags: ['Planning'],
      params: {
        type: 'object',
        properties: {
          planId: { type: 'string' },
        },
        required: ['planId'],
      },
      response: {
        200: planSchema,
        404: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const plan = planningStore.advancePlan(request.params.planId);
    if (!plan) {
      return reply.status(404).send({ message: 'Plan not found' });
    }
    return plan;
  });

  fastify.post<{ Params: { planId: string } }>('/plans/:planId/rerun', {
    schema: {
      description: 'Create a rerun of an existing plan',
      tags: ['Planning'],
      params: {
        type: 'object',
        properties: {
          planId: { type: 'string' },
        },
        required: ['planId'],
      },
      response: {
        200: planSchema,
        404: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const plan = planningStore.rerunPlan(request.params.planId);
    if (!plan) {
      return reply.status(404).send({ message: 'Plan not found' });
    }
    return plan;
  });

  fastify.post<{ Params: { planId: string; checkpointId: string } }>('/plans/:planId/checkpoints/:checkpointId/restore', {
    schema: {
      description: 'Restore a manual plan to a recorded checkpoint snapshot',
      tags: ['Planning'],
      params: {
        type: 'object',
        properties: {
          planId: { type: 'string' },
          checkpointId: { type: 'string' },
        },
        required: ['planId', 'checkpointId'],
      },
      response: {
        200: planSchema,
        404: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        409: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const existing = planningStore.getPlan(request.params.planId);
    if (!existing) {
      return reply.status(404).send({ message: 'Plan not found' });
    }
    if (!(existing.checkpoints ?? []).some((checkpoint) => checkpoint.checkpointId === request.params.checkpointId)) {
      return reply.status(404).send({ message: 'Checkpoint not found' });
    }
    if (existing.readOnly) {
      return reply.status(409).send({
        message: 'Runtime-backed plans are read-only. Fork the checkpoint into a manual plan instead.',
      });
    }
    const plan = planningStore.restoreCheckpoint(request.params.planId, request.params.checkpointId);
    if (!plan) {
      return reply.status(404).send({ message: 'Checkpoint not found' });
    }
    return plan;
  });

  fastify.post<{ Params: { planId: string; checkpointId: string } }>('/plans/:planId/checkpoints/:checkpointId/fork', {
    schema: {
      description: 'Fork a checkpoint snapshot into a new editable manual plan',
      tags: ['Planning'],
      params: {
        type: 'object',
        properties: {
          planId: { type: 'string' },
          checkpointId: { type: 'string' },
        },
        required: ['planId', 'checkpointId'],
      },
      response: {
        200: planSchema,
        404: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const existing = planningStore.getPlan(request.params.planId);
    if (!existing) {
      return reply.status(404).send({ message: 'Plan not found' });
    }
    if (!(existing.checkpoints ?? []).some((checkpoint) => checkpoint.checkpointId === request.params.checkpointId)) {
      return reply.status(404).send({ message: 'Checkpoint not found' });
    }
    const plan = planningStore.forkCheckpoint(request.params.planId, request.params.checkpointId);
    if (!plan) {
      return reply.status(404).send({ message: 'Checkpoint not found' });
    }
    return plan;
  });
}
