/**
 * Normalize the workbench execute-tool response for UI consumers.
 *
 * The backend returns an envelope:
 * `{ result, toolId, mode, isError, echoedInput }`.
 * Widget/document renderers need the inner `result` payload.
 */
export function unwrapToolExecutionResult(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const envelope = payload as Record<string, unknown>;
  return 'result' in envelope ? envelope.result : payload;
}
