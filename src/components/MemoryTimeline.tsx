import { useEffect, useState, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  deriveMemorySurfaceTone,
  describeMemoryLoadedAt,
  describeMemoryLoadedAtAriaLabel,
  describeMemoryLoadedAtTitle,
  useMemoryStore,
} from '@/state/memoryStore';
import { DataSourceBadge } from './DataSourceBadge';
import { HelpTooltip } from './ui/HelpTooltip';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All recognised memory operation types. */
const ALL_OPERATIONS = ['WRITE', 'RETRIEVE', 'CONSOLIDATE', 'SUMMARIZE', 'DELETE'] as const;

/** All recognised memory categories. */
const ALL_CATEGORIES = ['episodic', 'semantic', 'procedural', 'working'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a Unix ms timestamp as a human-friendly relative string.
 * Precision degrades gracefully: seconds → minutes → hours → days.
 *
 * @param ts - Unix timestamp in milliseconds.
 * @returns A string like "3 min ago" or "2 days ago".
 */
function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day !== 1 ? 's' : ''} ago`;
}

/**
 * Return Tailwind class names for an operation badge.
 *
 * @param op - The operation string (WRITE, RETRIEVE, etc.).
 */
function opBadgeClass(op: string): string {
  switch (op) {
    case 'WRITE':
      return 'bg-green-100  text-green-800  dark:bg-green-900/40  dark:text-green-300';
    case 'RETRIEVE':
      return 'bg-blue-100   text-blue-800   dark:bg-blue-900/40   dark:text-blue-300';
    case 'CONSOLIDATE':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300';
    case 'SUMMARIZE':
      return 'bg-amber-100  text-amber-800  dark:bg-amber-900/40  dark:text-amber-300';
    case 'DELETE':
      return 'bg-red-100    text-red-800    dark:bg-red-900/40    dark:text-red-300';
    default:
      return 'bg-gray-100   text-gray-700   dark:bg-gray-800      dark:text-gray-300';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Memory Timeline sub-panel.
 *
 * Renders a filterable, chronological feed of memory operations (WRITE,
 * RETRIEVE, CONSOLIDATE, SUMMARIZE, DELETE).  Each entry shows a relative
 * timestamp, colour-coded operation badge, category pill, content snippet,
 * and metadata.
 *
 * Data is fetched from the backend on mount via {@link useMemoryStore}.
 */
export function MemoryTimeline() {
  const { timeline, timelineMode, timelineLoading, timelineLoadedAt, fetchTimeline } =
    useMemoryStore();

  /** Active operation type filters — all enabled by default. */
  const [opFilters, setOpFilters] = useState<Set<string>>(new Set(ALL_OPERATIONS));

  /** Selected category filter — empty string means 'all categories'. */
  const [categoryFilter, setCategoryFilter] = useState('');

  /** Load timeline on first render. */
  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  /** Toggle a single operation type in/out of the active filter set. */
  const toggleOp = (op: string) => {
    setOpFilters((prev) => {
      const next = new Set(prev);
      next.has(op) ? next.delete(op) : next.add(op);
      return next;
    });
  };

  /** Filtered and sorted (newest-first) timeline entries. */
  const visible = useMemo(() => {
    return timeline
      .filter((e) => opFilters.has(e.operation))
      .filter((e) => !categoryFilter || e.category === categoryFilter)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [timeline, opFilters, categoryFilter]);

  const tone = deriveMemorySurfaceTone([timelineMode]);
  const toneLabel =
    tone === 'runtime'
      ? 'Runtime Timeline'
      : tone === 'mixed'
        ? 'Mixed Timeline'
        : tone === 'demo'
          ? 'Demo Timeline'
          : 'Timeline Checking';
  const refreshTimeline = () => {
    void fetchTimeline(undefined, { force: true });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <DataSourceBadge
          tone={tone}
          label={toneLabel}
          accessibleLabel={`Memory timeline data source: ${toneLabel}`}
        />
        <span
          className="text-[10px] theme-text-secondary"
          title={describeMemoryLoadedAtTitle(timelineLoadedAt)}
          role="status"
          aria-live="polite"
          aria-label={describeMemoryLoadedAtAriaLabel(timelineLoadedAt)}
        >
          {describeMemoryLoadedAt(timelineLoadedAt)}
        </span>
        <HelpTooltip label="Explain memory timeline" side="bottom">
          Follow memory operations over time, filter by operation type, and isolate specific tiers
          to understand how memories were written, retrieved, summarized, or deleted.
        </HelpTooltip>
        <button
          type="button"
          onClick={refreshTimeline}
          disabled={timelineLoading}
          aria-busy={timelineLoading}
          aria-label={timelineLoading ? 'Refreshing memory timeline' : 'Refresh memory timeline'}
          title="Refresh memory timeline events from the backend."
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border theme-border bg-[color:var(--color-background-secondary)] px-2.5 py-1 text-[10px] theme-text-secondary transition hover:opacity-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <RefreshCw
            size={10}
            className={timelineLoading ? 'animate-spin' : ''}
            aria-hidden="true"
          />
          {timelineLoading ? 'Refreshing…' : 'Refresh'}
        </button>
        <span className="text-[10px] theme-text-secondary" role="status" aria-live="polite">
          {timelineLoading
            ? 'Refreshing…'
            : `${visible.length} event${visible.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border theme-border theme-bg-secondary p-2">
        {/* Operation type checkboxes */}
        <div className="flex flex-wrap gap-2">
          {ALL_OPERATIONS.map((op) => (
            <label key={op} className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={opFilters.has(op)}
                onChange={() => toggleOp(op)}
                title={`${opFilters.has(op) ? 'Hide' : 'Show'} ${op} events in the timeline.`}
                className="accent-accent h-3 w-3"
              />
              <span className={`text-[10px] font-semibold px-1 py-0.5 rounded ${opBadgeClass(op)}`}>
                {op}
              </span>
            </label>
          ))}
        </div>

        {/* Category dropdown */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          title="Filter the timeline to a specific memory category."
          className="ml-auto text-xs rounded border theme-border theme-bg-primary theme-text-primary px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All categories</option>
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Event feed */}
      {visible.length === 0 ? (
        <p className="text-xs theme-text-secondary text-center py-6">
          No events match the current filters.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((entry, idx) => (
            <li
              key={`${entry.timestamp}-${idx}`}
              className="rounded-lg border theme-border theme-bg-secondary px-3 py-2 flex flex-col gap-1"
            >
              <div className="flex items-center gap-2 flex-wrap">
                {/* Relative timestamp */}
                <span className="text-[10px] theme-text-secondary font-mono">
                  {relativeTime(entry.timestamp)}
                </span>

                {/* Operation badge */}
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${opBadgeClass(entry.operation)}`}
                >
                  {entry.operation}
                </span>

                {/* Category pill */}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border theme-border theme-text-secondary">
                  {entry.category}
                </span>
              </div>

              {/* Content snippet */}
              <p className="text-xs theme-text-primary leading-relaxed">
                {entry.content.length > 80 ? `${entry.content.slice(0, 80)}…` : entry.content}
              </p>

              {/* Metadata */}
              {Object.keys(entry.metadata).length > 0 && (
                <p className="text-[10px] theme-text-secondary font-mono">
                  {Object.entries(entry.metadata)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
