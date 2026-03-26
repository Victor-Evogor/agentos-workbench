/**
 * ResourceControlsPanel — configure resource limits for the agency() call.
 *
 * Exposes number inputs for token/cost/time/call budgets, a radio group for
 * the on-limit-reached behaviour, and a live usage bar when session data is
 * available from the Zustand telemetry store.
 *
 * All state flows up via {@link onConfigChange} so the parent can include it
 * in the agency request payload.
 */

import { useState } from 'react';
import { useSessionStore } from '@/state/sessionStore';
import { useTelemetryStore } from '@/state/telemetryStore';
import { HelpTooltip } from '@/components/ui/HelpTooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OnLimitReachedBehaviour = 'stop' | 'warn' | 'error';

export interface ResourceLimitsConfig {
  maxTotalTokens: number | null;
  maxCostUSD: number | null;
  /** Wall-clock limit in seconds. */
  maxDurationSec: number | null;
  maxAgentCalls: number | null;
  maxStepsPerAgent: number | null;
  onLimitReached: OnLimitReachedBehaviour;
}

export interface ResourceControlsPanelProps {
  value?: ResourceLimitsConfig;
  onConfigChange?: (config: ResourceLimitsConfig) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ResourceLimitsConfig = {
  maxTotalTokens: null,
  maxCostUSD: null,
  maxDurationSec: null,
  maxAgentCalls: null,
  maxStepsPerAgent: null,
  onLimitReached: 'warn',
};

const ON_LIMIT_OPTIONS: Array<{ value: OnLimitReachedBehaviour; label: string; description: string }> = [
  { value: 'stop', label: 'Stop', description: 'Halt execution gracefully when a limit is reached.' },
  { value: 'warn', label: 'Warn', description: 'Log a warning but allow the run to continue.' },
  { value: 'error', label: 'Error', description: 'Throw an error and abort the current step.' },
];

/**
 * Renders a progress bar capped at 100 %.
 * Fills sky-blue up to 80 %, amber 80–95 %, rose above.
 */
function UsageBar({ used, max, label }: { used: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(1, used / max) : 0;
  const barColor =
    pct >= 0.95 ? 'bg-rose-500' : pct >= 0.8 ? 'bg-amber-400' : 'bg-sky-500';
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[10px]">
        <span className="theme-text-muted">{label}</span>
        <span className="theme-text-secondary font-semibold">
          {used.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full theme-bg-primary border theme-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.round(pct * 100)}%` }}
          aria-valuenow={used}
          aria-valuemax={max}
          role="progressbar"
          aria-label={label}
        />
      </div>
      <p className="mt-0.5 text-right text-[9px] theme-text-muted">
        {Math.round((1 - pct) * max).toLocaleString()} remaining
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Number input with optional placeholder
// ---------------------------------------------------------------------------

function LimitInput({
  label,
  value,
  placeholder,
  min,
  step,
  onChange,
  title,
}: {
  label: string;
  value: number | null;
  placeholder: string;
  min?: number;
  step?: number;
  onChange: (v: number | null) => void;
  title: string;
}) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[10px] theme-text-muted">{label}</span>
      <input
        type="number"
        min={min ?? 0}
        step={step ?? 1}
        value={value ?? ''}
        placeholder={placeholder}
        title={title}
        onChange={(e) => {
          const raw = e.target.value.trim();
          onChange(raw === '' ? null : Number(raw));
        }}
        className="w-full rounded-md border theme-border theme-bg-primary px-2 py-1.5 text-xs theme-text-primary focus:border-sky-500 focus:outline-none"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * ResourceControlsPanel — configure per-run budget limits for agency() calls.
 */
export function ResourceControlsPanel({ value, onConfigChange }: ResourceControlsPanelProps) {
  const [config, setConfig] = useState<ResourceLimitsConfig>(value ?? DEFAULT_CONFIG);

  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const perSession = useTelemetryStore((s) => s.perSession);
  const metrics = activeSessionId ? perSession[activeSessionId] : undefined;

  const update = (patch: Partial<ResourceLimitsConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    onConfigChange?.(next);
  };

  const tokensUsed = metrics?.finalTokensTotal ?? 0;
  const elapsedMs = metrics?.durationMs ?? 0;

  return (
    <section className="rounded-xl border theme-border theme-bg-secondary-soft p-3 transition-theme">
      {/* Header */}
      <header className="mb-3 flex items-center gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">Agency</p>
          <h3 className="text-sm font-semibold theme-text-primary">Resource Controls</h3>
        </div>
        <HelpTooltip label="Explain resource controls panel" side="bottom">
          Set hard limits on token usage, cost, wall-clock time, agent calls, and steps per agent.
          Choose whether to stop, warn, or error when a limit is reached.
        </HelpTooltip>
      </header>

      {/* Limit inputs */}
      <div className="mb-4">
        <p className="mb-2 text-[10px] uppercase tracking-[0.35em] theme-text-muted">Budget Limits</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <LimitInput
            label="Max total tokens"
            value={config.maxTotalTokens}
            placeholder="Unlimited"
            title="Maximum total tokens (prompt + completion) across the entire run."
            onChange={(v) => update({ maxTotalTokens: v })}
          />
          <LimitInput
            label="Max cost (USD)"
            value={config.maxCostUSD}
            placeholder="Unlimited"
            step={0.01}
            min={0}
            title="Maximum estimated cost in USD before the run is halted."
            onChange={(v) => update({ maxCostUSD: v })}
          />
          <LimitInput
            label="Max duration (seconds)"
            value={config.maxDurationSec}
            placeholder="Unlimited"
            title="Wall-clock time limit in seconds."
            onChange={(v) => update({ maxDurationSec: v })}
          />
          <LimitInput
            label="Max agent calls"
            value={config.maxAgentCalls}
            placeholder="Unlimited"
            title="Maximum total number of individual agent invocations."
            onChange={(v) => update({ maxAgentCalls: v })}
          />
          <LimitInput
            label="Max steps per agent"
            value={config.maxStepsPerAgent}
            placeholder="Unlimited"
            title="Maximum tool-call steps allowed per individual agent before it is halted."
            onChange={(v) => update({ maxStepsPerAgent: v })}
          />
        </div>
      </div>

      {/* On limit reached */}
      <div className="mb-4">
        <p className="mb-2 text-[10px] uppercase tracking-[0.35em] theme-text-muted">On Limit Reached</p>
        <div className="space-y-1">
          {ON_LIMIT_OPTIONS.map(({ value: optVal, label, description }) => {
            const selected = config.onLimitReached === optVal;
            return (
              <label
                key={optVal}
                className={[
                  'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors',
                  selected
                    ? 'border-sky-500/60 bg-sky-500/10'
                    : 'theme-border theme-bg-primary hover:bg-white/5',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="on-limit-reached"
                  checked={selected}
                  onChange={() => update({ onLimitReached: optVal })}
                  className="mt-0.5 shrink-0 accent-sky-500"
                />
                <div>
                  <span
                    className={
                      selected
                        ? 'text-xs font-semibold text-sky-400'
                        : 'text-xs font-semibold theme-text-primary'
                    }
                  >
                    {label}
                  </span>
                  <p className="mt-0.5 text-[10px] theme-text-secondary">{description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Live usage indicators */}
      {metrics && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">Session Usage</p>
          {config.maxTotalTokens != null && config.maxTotalTokens > 0 && (
            <UsageBar
              used={tokensUsed}
              max={config.maxTotalTokens}
              label="Tokens"
            />
          )}
          {config.maxDurationSec != null && config.maxDurationSec > 0 && (
            <UsageBar
              used={Math.round(elapsedMs / 1000)}
              max={config.maxDurationSec}
              label="Duration (s)"
            />
          )}
          {(config.maxTotalTokens == null || config.maxTotalTokens === 0) &&
            (config.maxDurationSec == null || config.maxDurationSec === 0) && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] theme-text-secondary">
                <div>
                  <span className="theme-text-muted">Tokens used</span>{' '}
                  <span className="font-semibold theme-text-primary">{tokensUsed.toLocaleString()}</span>
                </div>
                <div>
                  <span className="theme-text-muted">Elapsed</span>{' '}
                  <span className="font-semibold theme-text-primary">
                    {elapsedMs > 0 ? `${Math.round(elapsedMs / 1000)}s` : '—'}
                  </span>
                </div>
              </div>
            )}
        </div>
      )}

      {!metrics && (
        <p className="text-[10px] theme-text-muted">
          Session usage will appear here once a run is active.
        </p>
      )}
    </section>
  );
}
