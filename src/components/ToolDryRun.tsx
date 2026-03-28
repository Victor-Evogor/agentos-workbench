/**
 * @file ToolDryRun.tsx
 * @description Standalone panel for testing tool execution with JSON input.
 *
 * Renders a JSON textarea pre-populated from the tool's input schema,
 * executes via {@link agentosClient.executeTool}, and displays results with
 * special rendering for widget and document outputs.
 *
 * Special output handling:
 * - `generate_widget` tools with `html` in output -> renders WidgetEmbed
 * - `document_export` tools with `format` in output -> renders DocumentCard
 * - All other outputs -> raw JSON in `<pre>` block
 */

import React, { useState, useMemo } from 'react';
import { agentosClient } from '@/lib/agentosClient';
import { unwrapToolExecutionResult } from '@/lib/toolExecutionResult';
import { AlertCircle, CheckCircle, Play, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ToolDryRunProps {
  /** Tool identifier for the executeTool API call. */
  toolId: string;
  /** Human-readable tool name, used for output rendering logic. */
  toolName: string;
  /** JSON schema for the tool's input parameters. */
  inputSchema?: Record<string, unknown>;
  /** Callback to close/dismiss the panel. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate an example JSON string from a JSON schema object.
 * Produces simple placeholder values for common types.
 */
function generateExampleFromSchema(schema?: Record<string, unknown>): string {
  if (!schema) return '{}';

  try {
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (!properties) return '{}';

    const example: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(properties)) {
      const propType = prop.type as string | undefined;
      const propDefault = prop.default;
      const propExample = prop.example ?? prop.examples?.[0];

      if (propDefault !== undefined) {
        example[key] = propDefault;
      } else if (propExample !== undefined) {
        example[key] = propExample;
      } else if (propType === 'string') {
        example[key] = prop.enum ? (prop.enum as string[])[0] : '';
      } else if (propType === 'number' || propType === 'integer') {
        example[key] = 0;
      } else if (propType === 'boolean') {
        example[key] = false;
      } else if (propType === 'array') {
        example[key] = [];
      } else if (propType === 'object') {
        example[key] = {};
      } else {
        example[key] = null;
      }
    }
    return JSON.stringify(example, null, 2);
  } catch {
    return '{}';
  }
}

// ---------------------------------------------------------------------------
// Optional widget/document renderers.
// These components are created in a parallel task. When they exist, they are
// imported statically. Until then, the build will succeed and the panel
// falls back to raw JSON rendering.
// ---------------------------------------------------------------------------

/**
 * Renders widget HTML output inside a sandboxed iframe.
 * Falls back to raw JSON when the WidgetEmbed component is not yet available.
 */
function WidgetEmbedFallback({ html }: { html: string }) {
  return (
    <div className="rounded-lg border border-sky-500/20 bg-slate-900 p-3">
      <p className="mb-2 text-[9px] uppercase tracking-widest text-sky-400">Widget Preview</p>
      <iframe
        srcDoc={html}
        sandbox="allow-scripts"
        className="w-full h-48 rounded border border-slate-700 bg-white"
        title="Widget preview"
      />
    </div>
  );
}

/**
 * Renders document export output with format indicator.
 * Falls back to raw JSON when the DocumentCard component is not yet available.
 */
function DocumentCardFallback({ format, content, title }: { format: string; content: string; title?: string }) {
  return (
    <div className="rounded-lg border border-emerald-500/20 bg-slate-900 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-400">
          {format}
        </span>
        {title && <span className="text-xs font-medium text-slate-300">{title}</span>}
      </div>
      <pre className="overflow-auto rounded border border-slate-700 bg-slate-950 p-2 font-mono text-[10px] text-slate-400 max-h-48">
        {content}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ToolDryRun provides an interactive testing panel for executing AgentOS tools.
 *
 * Users can edit JSON input, execute the tool against the backend, and inspect
 * the result with specialized renderers for widget and document outputs.
 *
 * @param props - {@link ToolDryRunProps}
 */
export const ToolDryRun: React.FC<ToolDryRunProps> = ({
  toolId,
  toolName,
  inputSchema,
  onClose,
}) => {
  const defaultInput = useMemo(() => generateExampleFromSchema(inputSchema), [inputSchema]);
  const [input, setInput] = useState(defaultInput);
  const [output, setOutput] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [success, setSuccess] = useState(false);

  /** Execute the tool with current JSON input. */
  const handleExecute = async () => {
    setError(null);
    setOutput(null);
    setSuccess(false);
    setExecuting(true);

    try {
      const parsed = JSON.parse(input);
      const result = await agentosClient.executeTool(toolId, parsed);
      setOutput(result);
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('JSON')) {
        setError(`Invalid JSON input: ${message}`);
      } else {
        setError(message);
      }
    } finally {
      setExecuting(false);
    }
  };

  /** Render the output with special handling for widget and document results. */
  const renderOutput = () => {
    if (!output) return null;

    const effectiveOutput = unwrapToolExecutionResult(output);
    const outputObj =
      effectiveOutput && typeof effectiveOutput === 'object'
        ? (effectiveOutput as Record<string, unknown>)
        : null;

    // Widget output: render embedded HTML preview
    if (toolName === 'generate_widget' && outputObj?.html) {
      return <WidgetEmbedFallback html={outputObj.html as string} />;
    }

    // Document output: render document card
    if (toolName === 'document_export' && outputObj?.format) {
      return (
        <DocumentCardFallback
          format={outputObj.format as string}
          content={JSON.stringify(outputObj, null, 2)}
          title={outputObj.filename as string | undefined}
        />
      );
    }

    // Default: raw JSON
    return (
      <pre className="overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-xs text-slate-300 max-h-64">
        {JSON.stringify(output, null, 2)}
      </pre>
    );
  };

  return (
    <div className="mt-3 rounded-xl border theme-border theme-bg-secondary-soft p-4 transition-theme">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Play size={14} className="text-sky-400" />
          <h4 className="text-sm font-semibold theme-text-primary">
            Dry Run: <span className="font-mono text-sky-400">{toolName}</span>
          </h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close the dry-run panel."
          className="rounded-full border theme-border bg-[color:var(--color-background-secondary)] p-1 theme-text-secondary transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={14} />
        </button>
      </div>

      {/* Input schema hint */}
      {inputSchema && (
        <div className="mb-2">
          <p className="text-[9px] uppercase tracking-[0.35em] theme-text-muted mb-1">
            Input Schema
          </p>
          <pre className="overflow-auto rounded border theme-border theme-bg-primary px-2 py-1.5 font-mono text-[9px] theme-text-secondary max-h-24">
            {JSON.stringify(inputSchema, null, 2)}
          </pre>
        </div>
      )}

      {/* JSON input textarea */}
      <div className="mb-3">
        <label className="block text-[10px] uppercase tracking-[0.35em] theme-text-muted mb-1">
          Input JSON
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter JSON input..."
          className="w-full h-28 rounded-lg border theme-border theme-bg-primary p-2.5 font-mono text-xs theme-text-primary resize-y focus:border-sky-500 focus:outline-none"
        />
      </div>

      {/* Execute button */}
      <button
        type="button"
        onClick={handleExecute}
        disabled={executing}
        title="Execute the tool with the provided JSON input."
        className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/15 px-4 py-1.5 text-xs font-semibold text-sky-400 transition hover:bg-sky-500/25 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        <Play size={12} />
        {executing ? 'Executing...' : 'Execute'}
      </button>

      {/* Success indicator */}
      {success && !error && (
        <div className="mt-3 flex items-center gap-1.5 text-emerald-400 text-xs">
          <CheckCircle size={14} />
          <span className="font-medium">Success</span>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Output display */}
      {output !== null && (
        <div className="mt-3">
          <p className="text-[9px] uppercase tracking-[0.35em] theme-text-muted mb-1">
            Output
          </p>
          {renderOutput()}
        </div>
      )}
    </div>
  );
};
