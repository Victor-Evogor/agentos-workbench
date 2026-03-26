/**
 * AgencyStrategyPanel — strategy selection UI for the agency() API.
 *
 * Exposes:
 *   - Strategy picker: sequential | parallel | debate | review-loop | hierarchical
 *   - Adaptive override toggle
 *   - Max rounds slider (debate / review-loop only)
 *   - ASCII flow diagram showing the selected strategy topology
 *
 * Designed to live inside AgencyManager as a collapsible sub-section,
 * or as a standalone tab. State flows up via {@link onConfigChange}.
 */

import { useState } from 'react';
import { HelpTooltip } from '@/components/ui/HelpTooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgencyStrategy =
  | 'sequential'
  | 'parallel'
  | 'debate'
  | 'review-loop'
  | 'hierarchical';

export interface AgencyStrategyConfig {
  strategy: AgencyStrategy;
  adaptive: boolean;
  /** Only applies when strategy is 'debate' or 'review-loop'. */
  maxRounds: number;
}

export interface AgencyStrategyPanelProps {
  value?: AgencyStrategyConfig;
  onConfigChange?: (config: AgencyStrategyConfig) => void;
}

// ---------------------------------------------------------------------------
// Strategy metadata
// ---------------------------------------------------------------------------

interface StrategyDescriptor {
  key: AgencyStrategy;
  label: string;
  description: string;
  /** Simple ASCII/text diagram of the flow. */
  diagram: string;
  hasRounds: boolean;
}

const STRATEGIES: StrategyDescriptor[] = [
  {
    key: 'sequential',
    label: 'Sequential',
    description: 'Agents run in order, each building on the previous.',
    diagram: 'Agent A → Agent B → Agent C → Result',
    hasRounds: false,
  },
  {
    key: 'parallel',
    label: 'Parallel',
    description: 'All agents run simultaneously, results synthesised.',
    diagram: '┌─ Agent A ─┐\n├─ Agent B ─┤ → Synthesiser → Result\n└─ Agent C ─┘',
    hasRounds: false,
  },
  {
    key: 'debate',
    label: 'Debate',
    description: 'Agents argue in rounds until consensus.',
    diagram: 'Round 1: A ↔ B\nRound 2: A ↔ B ↔ C\n   …\nRound N: Consensus → Result',
    hasRounds: true,
  },
  {
    key: 'review-loop',
    label: 'Review Loop',
    description: 'Producer creates, reviewer approves or requests revision.',
    diagram: 'Producer → [draft] → Reviewer\n              ↑ revise ←┘\n              └── approved → Result',
    hasRounds: true,
  },
  {
    key: 'hierarchical',
    label: 'Hierarchical',
    description: 'Manager agent delegates subtasks to team members.',
    diagram: '      Manager\n     /   |   \\\nAgentA AgentB AgentC\n     \\   |   /\n      Result',
    hasRounds: false,
  },
];

const DEFAULT_CONFIG: AgencyStrategyConfig = {
  strategy: 'sequential',
  adaptive: false,
  maxRounds: 3,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * AgencyStrategyPanel — select and configure the multi-agent execution strategy.
 */
export function AgencyStrategyPanel({ value, onConfigChange }: AgencyStrategyPanelProps) {
  const [config, setConfig] = useState<AgencyStrategyConfig>(value ?? DEFAULT_CONFIG);

  const update = (patch: Partial<AgencyStrategyConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    onConfigChange?.(next);
  };

  const selected = STRATEGIES.find((s) => s.key === config.strategy) ?? STRATEGIES[0]!;

  return (
    <section className="rounded-xl border theme-border theme-bg-secondary-soft p-3 transition-theme">
      {/* Header */}
      <header className="mb-3 flex items-center gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">Agency</p>
          <h3 className="text-sm font-semibold theme-text-primary">Execution Strategy</h3>
        </div>
        <HelpTooltip label="Explain agency strategy panel" side="bottom">
          Choose how the multi-agent collective coordinates work. Adaptive mode lets the manager
          agent override the strategy per-task at runtime.
        </HelpTooltip>
      </header>

      {/* Strategy picker */}
      <div className="mb-4">
        <p className="mb-1 text-[10px] uppercase tracking-[0.35em] theme-text-muted">Strategy</p>
        <div className="space-y-1">
          {STRATEGIES.map((strategy) => {
            const isSelected = config.strategy === strategy.key;
            return (
              <label
                key={strategy.key}
                className={[
                  'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors',
                  isSelected
                    ? 'border-sky-500/60 bg-sky-500/10'
                    : 'theme-border theme-bg-primary hover:bg-white/5',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="agency-strategy"
                  checked={isSelected}
                  onChange={() => update({ strategy: strategy.key })}
                  className="mt-0.5 shrink-0 accent-sky-500"
                />
                <div className="min-w-0 flex-1">
                  <span
                    className={
                      isSelected
                        ? 'text-xs font-semibold text-sky-400'
                        : 'text-xs font-semibold theme-text-primary'
                    }
                  >
                    {strategy.label}
                  </span>
                  <p className="mt-0.5 text-[10px] theme-text-secondary">{strategy.description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Flow diagram */}
      <div className="mb-4">
        <p className="mb-1 text-[10px] uppercase tracking-[0.35em] theme-text-muted">Flow Diagram</p>
        <pre className="whitespace-pre rounded-lg border theme-border theme-bg-primary px-3 py-2 font-mono text-[10px] leading-relaxed theme-text-secondary">
          {selected.diagram}
        </pre>
      </div>

      {/* Max rounds slider — only for debate and review-loop */}
      {selected.hasRounds && (
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">Max Rounds</p>
            <span className="text-xs font-semibold theme-text-primary">{config.maxRounds}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={config.maxRounds}
            onChange={(e) => update({ maxRounds: Number(e.target.value) })}
            title="Maximum number of debate or review rounds before the run terminates."
            className="w-full accent-sky-500"
          />
          <div className="mt-0.5 flex justify-between text-[9px] theme-text-muted">
            <span>1</span>
            <span>10</span>
          </div>
        </div>
      )}

      {/* Adaptive toggle */}
      <div>
        <p className="mb-1 text-[10px] uppercase tracking-[0.35em] theme-text-muted">Adaptive Override</p>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border theme-border theme-bg-primary px-3 py-2 transition-colors hover:bg-white/5">
          <input
            type="checkbox"
            checked={config.adaptive}
            onChange={(e) => update({ adaptive: e.target.checked })}
            className="shrink-0 accent-sky-500"
          />
          <div>
            <span className="text-xs font-semibold theme-text-primary">
              Let manager override strategy per-task
            </span>
            <p className="mt-0.5 text-[10px] theme-text-secondary">
              When enabled the manager agent may switch to a more appropriate strategy dynamically
              based on task complexity.
            </p>
          </div>
        </label>
      </div>
    </section>
  );
}
