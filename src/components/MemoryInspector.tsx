import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import {
  deriveMemorySurfaceTone,
  describeMemoryLoadedAt,
  describeMemoryLoadedAtAriaLabel,
  describeMemoryLoadedAtTitle,
  useMemoryStore,
} from '@/state/memoryStore';
import type { MemoryEntryRecord } from '@/lib/agentosClient';
import { DataSourceBadge } from './DataSourceBadge';
import { HelpTooltip } from './ui/HelpTooltip';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a Unix ms timestamp as a human-friendly relative string.
 *
 * @param ts - Unix timestamp in milliseconds.
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
 * Return a colour class for a confidence badge.
 *
 * @param conf - Confidence score in [0, 1].
 */
function confidenceBadgeClass(conf: number): string {
  if (conf >= 0.9) return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  if (conf >= 0.7) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Props for the collapsible section header.
 */
interface SectionHeaderProps {
  /** Display title for the memory tier. */
  title: string;
  /** DOM id of the toggle button itself. */
  buttonId: string;
  /** Number of entries currently in this tier. */
  count: number;
  /** DOM id of the controlled collapsible content region. */
  contentId: string;
  /** Whether the section is currently expanded. */
  open: boolean;
  /** Callback to toggle the expansion state. */
  onToggle: () => void;
}

/**
 * Collapsible section header for a memory category row.
 */
function SectionHeader({ title, buttonId, count, contentId, open, onToggle }: SectionHeaderProps) {
  return (
    <button
      id={buttonId}
      onClick={onToggle}
      title={`${open ? 'Collapse' : 'Expand'} the ${title} memory section.`}
      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border theme-border theme-bg-secondary hover:opacity-90 transition text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-expanded={open}
      aria-controls={contentId}
      aria-label={`${open ? 'Collapse' : 'Expand'} ${title} memory section with ${count} entr${
        count === 1 ? 'y' : 'ies'
      }`}
    >
      <span className="text-xs font-semibold theme-text-primary uppercase tracking-wide">
        {title}
      </span>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 theme-text-primary font-mono"
        >
          {count}
        </span>
        <span aria-hidden="true" className="text-xs theme-text-secondary">
          {open ? '▲' : '▼'}
        </span>
      </div>
    </button>
  );
}

/**
 * Props for a single entry row inside a category section.
 */
interface EntryRowProps {
  /** The memory entry to render. */
  entry: MemoryEntryRecord;
  /** Whether this entry is currently expanded to show full detail. */
  expanded: boolean;
  /** Callback to toggle the expanded state. */
  onToggle: () => void;
  /** Callback to request deletion of this entry. */
  onDelete: () => void;
  /** Whether this entry is currently waiting for delete confirmation. */
  deleting: boolean;
}

/**
 * Collapsible entry row inside a memory category section.
 * Shows content snippet, confidence badge, relative timestamp, and source.
 * When expanded, shows full content, all metadata, and a delete button.
 */
function EntryRow({ entry, expanded, onToggle, onDelete, deleting }: EntryRowProps) {
  const snippetId = `memory-entry-snippet-${entry.id}`;
  const detailId = `memory-entry-panel-${entry.id}`;
  const summaryButtonId = `memory-entry-toggle-${entry.id}`;
  const confidencePct = Math.round(entry.confidence * 100);
  const timestampIso = new Date(entry.timestamp).toISOString();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleting) {
      return;
    }
    if (window.confirm(`Delete memory entry "${entry.id}"?\n\n"${entry.content.slice(0, 80)}"`)) {
      onDelete();
    }
  };

  return (
    <div
      className={`border theme-border rounded-lg overflow-hidden ${deleting ? 'opacity-80' : ''}`}
    >
      {/* Summary row — always visible */}
      <button
        id={summaryButtonId}
        onClick={onToggle}
        title={
          expanded
            ? 'Collapse this memory entry.'
            : 'Expand this memory entry to inspect full content and metadata.'
        }
        className="w-full flex items-start gap-2 px-3 py-2 theme-bg-secondary hover:opacity-90 transition text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-describedby={snippetId}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} memory entry ${entry.id} from ${
          entry.source
        } with ${confidencePct} percent confidence${deleting ? ', delete in progress' : ''}`}
      >
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <p id={snippetId} className="text-xs theme-text-primary leading-snug truncate">
            {entry.content.length > 80 ? `${entry.content.slice(0, 80)}…` : entry.content}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${confidenceBadgeClass(entry.confidence)}`}
            >
              {confidencePct}%
            </span>
            <span className="text-[10px] theme-text-secondary">
              {relativeTime(entry.timestamp)}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border theme-border theme-text-secondary">
              {entry.source}
            </span>
            {entry.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 theme-text-secondary"
              >
                {tag}
              </span>
            ))}
            {deleting && (
              <span
                role="status"
                aria-live="polite"
                className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300"
              >
                Deleting…
              </span>
            )}
          </div>
        </div>
        <span aria-hidden="true" className="text-[10px] theme-text-secondary shrink-0 mt-0.5">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div
          id={detailId}
          role="region"
          aria-labelledby={summaryButtonId}
          className="px-3 py-2 border-t theme-border theme-bg-primary flex flex-col gap-2"
        >
          <p className="text-xs theme-text-primary leading-relaxed">{entry.content}</p>
          <div className="flex items-start justify-between gap-3">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-[10px] sm:grid-cols-2">
              <div className="flex items-baseline gap-1.5">
                <dt className="theme-text-muted">Entry ID</dt>
                <dd className="font-mono theme-text-secondary">{entry.id}</dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="theme-text-muted">Confidence</dt>
                <dd className="theme-text-secondary">{confidencePct}%</dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="theme-text-muted">Source</dt>
                <dd className="theme-text-secondary">{entry.source}</dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="theme-text-muted">Timestamp</dt>
                <dd className="font-mono theme-text-secondary">
                  <time dateTime={timestampIso}>{timestampIso}</time>
                </dd>
              </div>
              <div className="flex items-start gap-1.5 sm:col-span-2">
                <dt className="theme-text-muted">Tags</dt>
                <dd className="flex flex-wrap gap-1">
                  {entry.tags.length > 0 ? (
                    entry.tags.map((tag) => (
                      <span
                        key={`${entry.id}-${tag}`}
                        className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] theme-text-secondary"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="theme-text-secondary">No tags</span>
                  )}
                </dd>
              </div>
            </dl>
            <button
              onClick={handleDelete}
              disabled={deleting}
              aria-label={
                deleting ? `Deleting memory entry ${entry.id}` : `Delete memory entry ${entry.id}`
              }
              aria-describedby={snippetId}
              className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-red-500 transition hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              title={deleting ? 'Delete in progress' : 'Delete this memory entry'}
            >
              <Trash2 size={11} />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Memory Inspector sub-panel.
 *
 * Renders a collapsible tree browser for all four memory categories.
 * Long-term categories (episodic, semantic, procedural) show individual
 * entries with expand/collapse and per-entry delete.  The Working section
 * shows token usage and the rolling summary only (not deletable).
 *
 * A search bar at the top filters entries across all categories by content
 * or tag.
 *
 * Data is fetched from the backend on mount via {@link useMemoryStore}.
 */
export function MemoryInspector() {
  const {
    entries,
    entriesMode,
    entriesLoading,
    entriesLoadedAt,
    pendingDeleteIds,
    working,
    workingMode,
    workingLoading,
    workingLoadedAt,
    fetchEntries,
    fetchWorking,
    removeEntry,
    successState,
    errorState,
  } = useMemoryStore();
  const deleteFocusPlanRef = useRef<{
    entryId: string;
    category: string;
    orderedIds: string[];
  } | null>(null);

  /** Global search query filtering entries across all categories. */
  const [search, setSearch] = useState('');

  /** Which categories are currently expanded (open). */
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['episodic', 'semantic', 'procedural', 'working'])
  );

  /** Which entry ids are currently expanded to show full detail. */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  /** Load all memory categories on first render. */
  useEffect(() => {
    fetchEntries();
    fetchWorking();
  }, [fetchEntries, fetchWorking]);

  /** Toggle section open/closed. */
  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  /** Toggle entry expanded/collapsed. */
  const toggleEntry = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /**
   * Filter entries in a given category by the current search query.
   *
   * Matches against entry content and tags (case-insensitive substring).
   */
  const filteredEntries = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filter = (arr: MemoryEntryRecord[]) => {
      if (!q) return arr;
      return arr.filter(
        (e) =>
          e.content.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q))
      );
    };
    return {
      episodic: filter(entries.episodic ?? []),
      semantic: filter(entries.semantic ?? []),
      procedural: filter(entries.procedural ?? []),
    };
  }, [entries, search]);

  const tokens = working?.tokens ?? 0;
  const maxTokens = working?.maxTokens ?? 1;
  const tokenPct = Math.min(tokens / maxTokens, 1);
  const summary = working?.rollingSummary ?? '';
  const slotCount = working?.slotCount;
  const slotCapacity = working?.slotCapacity;
  const summaryChainNodes = working?.summaryChainNodes;
  const compactedMessages = working?.compactedMessages;
  const strategy = working?.strategy;
  const transparencyReport = working?.transparencyReport;

  const LONG_TERM_SECTIONS = [
    { key: 'episodic', label: 'Episodic' },
    { key: 'semantic', label: 'Semantic' },
    { key: 'procedural', label: 'Procedural' },
  ] as const;
  const workingSectionId = 'memory-section-working';

  const tone = deriveMemorySurfaceTone([entriesMode, workingMode]);
  const toneLabel =
    tone === 'runtime'
      ? 'Runtime Inspector'
      : tone === 'mixed'
        ? 'Mixed Inspector'
        : tone === 'demo'
          ? 'Demo Inspector'
          : 'Inspector Checking';
  const inspectorLoading = entriesLoading || workingLoading;
  const lastInspectorLoadedAt =
    entriesLoadedAt && workingLoadedAt
      ? Math.max(entriesLoadedAt, workingLoadedAt)
      : (entriesLoadedAt ?? workingLoadedAt ?? null);
  const refreshInspector = () => {
    void fetchEntries(undefined, { force: true });
    void fetchWorking({ force: true });
  };

  useEffect(() => {
    const plan = deleteFocusPlanRef.current;
    if (!plan || successState?.kind !== 'delete-entry' || successState.entryId !== plan.entryId) {
      return;
    }

    const deletedIndex = plan.orderedIds.indexOf(plan.entryId);
    const nextIds = [
      ...plan.orderedIds.slice(deletedIndex + 1),
      ...plan.orderedIds.slice(0, Math.max(0, deletedIndex)),
    ];

    for (const candidateId of nextIds) {
      const candidate = document.getElementById(`memory-entry-toggle-${candidateId}`);
      if (candidate instanceof HTMLButtonElement) {
        candidate.focus();
        deleteFocusPlanRef.current = null;
        return;
      }
    }

    const sectionButton = document.getElementById(`memory-section-toggle-${plan.category}`);
    if (sectionButton instanceof HTMLButtonElement) {
      sectionButton.focus();
    }
    deleteFocusPlanRef.current = null;
  }, [successState]);

  useEffect(() => {
    if (errorState?.kind === 'delete-entry') {
      deleteFocusPlanRef.current = null;
    }
  }, [errorState]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <DataSourceBadge
          tone={tone}
          label={toneLabel}
          accessibleLabel={`Memory inspector data source: ${toneLabel}`}
        />
        <span
          className="text-[10px] theme-text-secondary"
          title={describeMemoryLoadedAtTitle(lastInspectorLoadedAt)}
          role="status"
          aria-live="polite"
          aria-label={describeMemoryLoadedAtAriaLabel(lastInspectorLoadedAt)}
        >
          {describeMemoryLoadedAt(lastInspectorLoadedAt)}
        </span>
        <HelpTooltip label="Explain memory inspector" side="bottom">
          Drill into episodic, semantic, procedural, and working memory entries, inspect exact
          payloads, and remove individual entries while debugging memory behavior.
        </HelpTooltip>
        <button
          type="button"
          onClick={refreshInspector}
          disabled={inspectorLoading}
          aria-busy={inspectorLoading}
          aria-label={inspectorLoading ? 'Refreshing memory inspector' : 'Refresh memory inspector'}
          title="Refresh memory entries and working memory from the backend."
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border theme-border bg-[color:var(--color-background-secondary)] px-2.5 py-1 text-[10px] theme-text-secondary transition hover:opacity-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <RefreshCw
            size={10}
            className={inspectorLoading ? 'animate-spin' : ''}
            aria-hidden="true"
          />
          {inspectorLoading ? 'Refreshing…' : 'Refresh'}
        </button>
        <span className="text-[10px] theme-text-secondary" role="status" aria-live="polite">
          {inspectorLoading ? 'Refreshing…' : 'Ready'}
        </span>
      </div>

      {/* Search bar */}
      <input
        type="search"
        placeholder="Search memory entries…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search memory entries"
        title="Filter memory entries by content or tag across long-term memory sections."
        className="w-full rounded-lg border theme-border theme-bg-secondary theme-text-primary text-xs px-3 py-1.5 placeholder:theme-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
      />

      {/* Long-term memory sections */}
      {LONG_TERM_SECTIONS.map(({ key, label }) => {
        const sectionEntries = filteredEntries[key];
        const sectionId = `memory-section-${key}`;
        const sectionButtonId = `memory-section-toggle-${key}`;
        return (
          <div key={key} className="flex flex-col gap-1">
            <SectionHeader
              title={label}
              buttonId={sectionButtonId}
              count={sectionEntries.length}
              contentId={sectionId}
              open={openSections.has(key)}
              onToggle={() => toggleSection(key)}
            />
            {openSections.has(key) && (
              <div
                id={sectionId}
                role="region"
                aria-label={`${label} memory entries`}
                className="flex flex-col gap-1 pl-2"
              >
                {sectionEntries.length === 0 ? (
                  <p role="status" className="text-xs theme-text-secondary py-2 pl-1">
                    No entries.
                  </p>
                ) : (
                  sectionEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      expanded={expandedIds.has(entry.id)}
                      onToggle={() => toggleEntry(entry.id)}
                      onDelete={() => {
                        deleteFocusPlanRef.current = {
                          entryId: entry.id,
                          category: key,
                          orderedIds: sectionEntries.map((sectionEntry) => sectionEntry.id),
                        };
                        void removeEntry(entry.id);
                      }}
                      deleting={pendingDeleteIds.includes(entry.id)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Working memory section (read-only) */}
      <div className="flex flex-col gap-1">
        <SectionHeader
          title="Working"
          buttonId="memory-section-toggle-working"
          count={0}
          contentId={workingSectionId}
          open={openSections.has('working')}
          onToggle={() => toggleSection('working')}
        />
        {openSections.has('working') && (
          <div
            id={workingSectionId}
            role="region"
            aria-label="Working memory details"
            className="pl-2 flex flex-col gap-2"
          >
            <div className="rounded-lg border theme-border theme-bg-secondary px-3 py-2 flex flex-col gap-2">
              {/* Token bar */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs theme-text-secondary">
                    {tokens.toLocaleString()} / {maxTokens.toLocaleString()} tokens
                  </span>
                  <span className="text-xs theme-text-secondary">
                    {Math.round(tokenPct * 100)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full theme-bg-primary overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      tokenPct > 0.95
                        ? 'bg-red-500'
                        : tokenPct > 0.8
                          ? 'bg-yellow-400'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${tokenPct * 100}%` }}
                  />
                </div>
              </div>

              {(slotCount !== undefined ||
                strategy ||
                summaryChainNodes !== undefined ||
                compactedMessages !== undefined) && (
                <div className="flex flex-wrap gap-1">
                  {slotCount !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border theme-border theme-text-secondary">
                      Slots {slotCount}
                      {slotCapacity ? `/${slotCapacity}` : ''}
                    </span>
                  )}
                  {summaryChainNodes !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border theme-border theme-text-secondary">
                      Summary nodes {summaryChainNodes}
                    </span>
                  )}
                  {compactedMessages !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border theme-border theme-text-secondary">
                      Compacted msgs {compactedMessages}
                    </span>
                  )}
                  {strategy && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border theme-border theme-text-secondary">
                      {strategy}
                    </span>
                  )}
                </div>
              )}

              {/* Rolling summary */}
              {summary ? (
                <p className="text-xs theme-text-primary leading-relaxed">{summary}</p>
              ) : (
                <p className="text-xs theme-text-secondary">No rolling summary available.</p>
              )}

              {transparencyReport && (
                <div className="rounded-md border theme-border theme-bg-primary px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.25em] theme-text-muted">
                    Transparency Report
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed theme-text-secondary">
                    {transparencyReport}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
