/**
 * SSE Mock — Pre-scripted SSE chunk sequences for demo recording.
 *
 * The workbench SSE client expects:
 *   - `data: {JSON}\n\n` for each chunk
 *   - `event: done\ndata: {}\n\n` to terminate the stream
 *   - GET `/api/agentos/stream?userId=...&mode=...&conversationId=...&messages=...`
 *
 * Each chunk conforms to the AgentOSBaseChunk shape plus type-specific fields.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SSEChunkDef {
  /** Delay in ms before emitting this chunk (used for documentation; not enforced in Playwright). */
  delay: number;
  /** The chunk data object. */
  chunk: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const STREAM_ID = 'demo-stream-001';
const GMI_INSTANCE_ID = 'gmi-demo-001';
const PERSONA_ID = 'v_concierge';

function ts(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function baseChunk(
  type: string,
  overrides: Record<string, unknown> = {},
  delayMs = 0,
): Record<string, unknown> {
  return {
    type,
    streamId: STREAM_ID,
    gmiInstanceId: GMI_INSTANCE_ID,
    personaId: PERSONA_ID,
    isFinal: false,
    timestamp: ts(delayMs),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const STREAMING_FULL_TEXT = `Here's what I found about quantum computing breakthroughs in 2026.

Recent breakthroughs include:

1. **Error-corrected logical qubits** — IBM and Google jointly demonstrated a 1,000-qubit processor running surface-code error correction with a logical error rate below 10\u207B\u2076. This milestone proves that fault-tolerant quantum computing is achievable at scale, opening the door to practical cryptographic and optimization workloads.

2. **Topological quantum computing** — Microsoft unveiled its first topological qubit array using Majorana zero modes in indium arsenide nanowires. The approach offers inherent noise protection at the hardware level, reducing the overhead for error correction by an order of magnitude compared to superconducting architectures.

3. **Quantum advantage in drug discovery** — Insilico Medicine and IonQ published results showing a 40x speedup in molecular docking simulations for a novel KRAS inhibitor. The hybrid classical-quantum pipeline identified three candidate compounds that entered Phase I clinical trials, marking the first commercial drug discovery workflow powered by quantum hardware.`;

const streamingScenario: SSEChunkDef[] = [
  {
    delay: 0,
    chunk: baseChunk('text_delta', {
      textDelta: "Here's what I found about quantum computing breakthroughs",
    }),
  },
  {
    delay: 200,
    chunk: baseChunk('text_delta', {
      textDelta: ' in 2026.\n\n',
    }, 200),
  },
  {
    delay: 400,
    chunk: baseChunk('tool_call_request', {
      toolCalls: [
        {
          id: 'tc_001',
          name: 'web_search',
          arguments: { query: 'quantum computing 2026 breakthroughs' },
        },
      ],
    }, 400),
  },
  {
    delay: 1200,
    chunk: baseChunk('tool_result_emission', {
      toolCallId: 'tc_001',
      toolName: 'web_search',
      toolResult: {
        results: 5,
        topResult: 'Error-corrected logical qubits achieved at scale',
      },
      isSuccess: true,
    }, 1200),
  },
  {
    delay: 1500,
    chunk: baseChunk('text_delta', {
      textDelta: 'Recent breakthroughs include:\n\n1. **Error-corrected logical qubits** — ',
    }, 1500),
  },
  {
    delay: 1800,
    chunk: baseChunk('text_delta', {
      textDelta: 'IBM and Google jointly demonstrated a 1,000-qubit processor running surface-code error correction with a logical error rate below 10\u207B\u2076. This milestone proves that fault-tolerant quantum computing is achievable at scale, opening the door to practical cryptographic and optimization workloads.\n\n',
    }, 1800),
  },
  {
    delay: 2100,
    chunk: baseChunk('text_delta', {
      textDelta: "2. **Topological quantum computing** — Microsoft unveiled its first topological qubit array using Majorana zero modes in indium arsenide nanowires. The approach offers inherent noise protection at the hardware level, reducing the overhead for error correction by an order of magnitude compared to superconducting architectures.\n\n",
    }, 2100),
  },
  {
    delay: 2400,
    chunk: baseChunk('text_delta', {
      textDelta: '3. **Quantum advantage in drug discovery** — Insilico Medicine and IonQ published results showing a 40x speedup in molecular docking simulations for a novel KRAS inhibitor. The hybrid classical-quantum pipeline identified three candidate compounds that entered Phase I clinical trials, marking the first commercial drug discovery workflow powered by quantum hardware.',
    }, 2400),
  },
  {
    delay: 2800,
    chunk: baseChunk('metadata_update', {
      updates: {
        taskOutcome: {
          status: 'success',
          score: 0.94,
          source: 'heuristic',
        },
        taskOutcomeKpi: {
          scopeKey: 'global',
          scopeMode: 'global',
          windowSize: 100,
          sampleCount: 47,
          successCount: 44,
          partialCount: 2,
          failedCount: 1,
          successRate: 0.94,
          averageScore: 0.91,
          weightedSuccessRate: 0.92,
          timestamp: ts(2800),
        },
      },
    }, 2800),
  },
  {
    delay: 3200,
    chunk: baseChunk('final_response', {
      isFinal: true,
      finalResponseText: STREAMING_FULL_TEXT,
      usage: {
        promptTokens: 245,
        completionTokens: 482,
        totalTokens: 727,
      },
    }, 3200),
  },
];

const agencyScenario: SSEChunkDef[] = [
  {
    delay: 0,
    chunk: baseChunk('agency_update', {
      agency: {
        agencyId: 'agency-demo-001',
        workflowId: 'wf-demo-001',
        metadata: {
          status: 'delegating',
          delegationTarget: 'research-analyst',
        },
        seats: [],
      },
    }),
  },
  {
    delay: 300,
    chunk: baseChunk('agency_update', {
      agency: {
        agencyId: 'agency-demo-001',
        workflowId: 'wf-demo-001',
        seats: [
          {
            roleId: 'research-analyst',
            gmiInstanceId: 'gmi-research-001',
            personaId: 'v_researcher',
            metadata: { status: 'running' },
          },
        ],
      },
    }, 300),
  },
  {
    delay: 600,
    chunk: baseChunk('text_delta', {
      textDelta: 'Based on a survey of 23 recent papers, the most effective RAG architectures combine dense passage retrieval with learned re-ranking. Key findings: (1) ColBERT-v2 multi-vector retrieval outperforms single-vector by 12% on BEIR, (2) chunk sizes between 256\u2013512 tokens yield optimal recall, (3) hybrid sparse+dense retrieval closes the gap on long-tail queries.',
    }, 600),
  },
  {
    delay: 1200,
    chunk: baseChunk('agency_update', {
      agency: {
        agencyId: 'agency-demo-001',
        workflowId: 'wf-demo-001',
        metadata: {
          delegationTarget: 'code-architect',
          status: 'delegating',
        },
        seats: [
          {
            roleId: 'research-analyst',
            gmiInstanceId: 'gmi-research-001',
            personaId: 'v_researcher',
            metadata: { status: 'complete' },
          },
        ],
      },
    }, 1200),
  },
  {
    delay: 1500,
    chunk: baseChunk('agency_update', {
      agency: {
        agencyId: 'agency-demo-001',
        workflowId: 'wf-demo-001',
        seats: [
          {
            roleId: 'research-analyst',
            gmiInstanceId: 'gmi-research-001',
            personaId: 'v_researcher',
            metadata: { status: 'complete' },
          },
          {
            roleId: 'code-architect',
            gmiInstanceId: 'gmi-code-001',
            personaId: 'v_code_reviewer',
            metadata: { status: 'running' },
          },
        ],
      },
    }, 1500),
  },
  {
    delay: 1800,
    chunk: baseChunk('text_delta', {
      textDelta: 'Pipeline design: Vector store \u2192 Retriever \u2192 Reranker \u2192 Generator',
    }, 1800),
  },
  {
    delay: 2400,
    chunk: baseChunk('agency_update', {
      agency: {
        agencyId: 'agency-demo-001',
        workflowId: 'wf-demo-001',
        seats: [
          {
            roleId: 'research-analyst',
            gmiInstanceId: 'gmi-research-001',
            personaId: 'v_researcher',
            metadata: { status: 'complete' },
          },
          {
            roleId: 'code-architect',
            gmiInstanceId: 'gmi-code-001',
            personaId: 'v_code_reviewer',
            metadata: { status: 'complete' },
          },
        ],
      },
    }, 2400),
  },
  {
    delay: 2700,
    chunk: baseChunk('final_response', {
      isFinal: true,
      finalResponseText: 'Agency completed',
      usage: {
        promptTokens: 890,
        completionTokens: 1240,
        totalTokens: 2130,
      },
    }, 2700),
  },
];

/**
 * Telemetry scenario — reuses the streaming scenario and appends a KPI alert
 * metadata_update chunk after the final_response for D5 demo coverage.
 */
const telemetryScenario: SSEChunkDef[] = [
  ...streamingScenario,
  {
    delay: 3500,
    chunk: baseChunk('metadata_update', {
      updates: {
        taskOutcomeAlert: {
          scopeKey: 'global',
          severity: 'warning',
          reason: 'Latency threshold exceeded',
          threshold: 2.0,
          value: 2.4,
          sampleCount: 47,
          timestamp: ts(3500),
        },
      },
    }, 3500),
  },
];

/** Pre-scripted streaming scenarios keyed by demo ID. */
export const STREAM_SCENARIOS: Record<string, SSEChunkDef[]> = {
  streaming: streamingScenario,
  agency: agencyScenario,
  telemetry: telemetryScenario,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a chunk sequence into an SSE response body string.
 *
 * Each chunk is emitted as `data: <JSON>\n\n`. The stream is terminated with
 * `event: done\ndata: {}\n\n`.
 */
export function buildSSEResponseBody(scenario: SSEChunkDef[]): string {
  const lines: string[] = [];

  for (const def of scenario) {
    lines.push(`data: ${JSON.stringify(def.chunk)}\n\n`);
  }

  // Terminate the stream
  lines.push('event: done\ndata: {}\n\n');

  return lines.join('');
}

/**
 * Create a Playwright route handler that streams chunks with timed delays.
 *
 * Since Playwright `route.fulfill()` cannot drip-feed chunks, the entire SSE
 * body is emitted at once. The workbench parses `data:` frames sequentially,
 * so the UI still renders chunks one-by-one as fast as it can parse them.
 */
export function createSSERouteHandler(scenarioId: string) {
  return async (route: { fulfill: (options: Record<string, unknown>) => Promise<void> }) => {
    const scenario = STREAM_SCENARIOS[scenarioId] || STREAM_SCENARIOS['streaming'];
    const body = buildSSEResponseBody(scenario);

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      body,
    });
  };
}
