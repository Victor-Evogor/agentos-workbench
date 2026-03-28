import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import {
  deriveMemorySurfaceTone,
  describeMemoryError,
  describeMemorySuccess,
  useMemoryStore,
  type MemorySubTab,
} from '@/state/memoryStore';
import { MemoryOverview } from '@/components/MemoryOverview';
import { MemoryTimeline } from '@/components/MemoryTimeline';
import { MemoryInspector } from '@/components/MemoryInspector';
import { DataSourceBadge } from '@/components/DataSourceBadge';
import { HelpTooltip } from '@/components/ui/HelpTooltip';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Sub-tab descriptor used to render the pill navigation bar.
 */
interface SubTabDescriptor {
  key: MemorySubTab;
  label: string;
}

const SUB_TABS: SubTabDescriptor[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'inspector', label: 'Inspector' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Memory Dashboard panel.
 *
 * Top-level container for the cognitive memory system view.  Renders a
 * pill-style sub-tab bar (Overview | Timeline | Inspector) and delegates
 * rendering to the active sub-panel component.
 *
 * Active sub-tab state is persisted in {@link useMemoryStore} so navigation
 * within the panel survives re-renders without resetting to the first tab.
 */
export function MemoryDashboard() {
  const activeSubTab = useMemoryStore((s) => s.activeSubTab);
  const setActiveSubTab = useMemoryStore((s) => s.setActiveSubTab);
  const statsMode = useMemoryStore((s) => s.statsMode);
  const workingMode = useMemoryStore((s) => s.workingMode);
  const timelineMode = useMemoryStore((s) => s.timelineMode);
  const entriesMode = useMemoryStore((s) => s.entriesMode);
  const error = useMemoryStore((s) => s.error);
  const errorState = useMemoryStore((s) => s.errorState);
  const successNotice = useMemoryStore((s) => s.successNotice);
  const successState = useMemoryStore((s) => s.successState);
  const clearError = useMemoryStore((s) => s.clearError);
  const clearSuccessNotice = useMemoryStore((s) => s.clearSuccessNotice);
  const tone = deriveMemorySurfaceTone([statsMode, workingMode, timelineMode, entriesMode]);
  const errorDescription = describeMemoryError(errorState);
  const successDescription = describeMemorySuccess(successState);
  const toneLabel =
    tone === 'runtime'
      ? 'Runtime Memory'
      : tone === 'mixed'
        ? 'Mixed Memory'
        : tone === 'demo'
          ? 'Demo Memory'
          : 'Memory Checking';

  useEffect(() => {
    if (!successNotice) {
      return;
    }
    const timeout = window.setTimeout(() => {
      clearSuccessNotice();
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [successNotice, clearSuccessNotice]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold theme-text-primary">Memory Workspace</h3>
        <DataSourceBadge tone={tone} label={toneLabel} />
        <HelpTooltip label="Explain memory workspace" side="bottom">
          Overview summarizes memory counts and health, Timeline shows recent memory operations, and
          Inspector lets you inspect or remove specific stored memories. Use this panel to
          understand what the runtime is remembering.
        </HelpTooltip>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] text-rose-300">
          <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold uppercase tracking-[0.25em] text-rose-200">
              {errorDescription?.title ?? 'Memory Error'}
            </p>
            <p className="mt-1 leading-relaxed">{errorDescription?.detail ?? error}</p>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 rounded p-1 text-rose-300 transition hover:bg-rose-500/10 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            title="Dismiss memory error"
            aria-label="Dismiss memory error"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      )}

      {!error && successNotice && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] text-emerald-300">
          <CheckCircle2 size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold uppercase tracking-[0.25em] text-emerald-200">
              {successDescription?.title ?? 'Success'}
            </p>
            <p className="mt-1 leading-relaxed">{successDescription?.detail ?? successNotice}</p>
          </div>
          <button
            type="button"
            onClick={clearSuccessNotice}
            className="shrink-0 rounded p-1 text-emerald-300 transition hover:bg-emerald-500/10 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            title="Dismiss memory success notice"
            aria-label="Dismiss memory success notice"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Sub-tab pill bar */}
      <div className="flex items-center gap-1" role="tablist" aria-label="Memory sub-tabs">
        {SUB_TABS.map(({ key, label }) => {
          const active = activeSubTab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveSubTab(key)}
              title={
                key === 'overview'
                  ? 'View memory counts, health, and high-level summaries.'
                  : key === 'timeline'
                    ? 'Inspect recent memory events and updates over time.'
                    : 'Browse concrete memory entries and inspect their stored contents.'
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active
                  ? 'theme-bg-accent theme-text-on-accent border-transparent shadow-sm'
                  : 'theme-text-secondary theme-bg-secondary theme-border hover:opacity-90'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Active sub-panel */}
      <div className="flex-1 overflow-y-auto">
        {activeSubTab === 'overview' && <MemoryOverview />}
        {activeSubTab === 'timeline' && <MemoryTimeline />}
        {activeSubTab === 'inspector' && <MemoryInspector />}
      </div>
    </div>
  );
}
