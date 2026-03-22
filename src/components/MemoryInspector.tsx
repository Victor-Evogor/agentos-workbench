import { useEffect, useState, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { useMemoryStore } from '@/state/memoryStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single long-term memory entry as stored in episodic, semantic, or
 * procedural tiers.
 */
interface MemoryEntry {
  id: string;
  content: string;
  confidence: number;
  timestamp: number;
  source: string;
  tags: string[];
}

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
  const sec  = Math.floor(diff / 1000);
  if (sec < 60)  return `${sec}s ago`;
  const min  = Math.floor(sec / 60);
  if (min < 60)  return `${min} min ago`;
  const hr   = Math.floor(min / 60);
  if (hr  < 24)  return `${hr}h ago`;
  const day  = Math.floor(hr / 24);
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
  /** Number of entries currently in this tier. */
  count: number;
  /** Whether the section is currently expanded. */
  open: boolean;
  /** Callback to toggle the expansion state. */
  onToggle: () => void;
}

/**
 * Collapsible section header for a memory category row.
 */
function SectionHeader({ title, count, open, onToggle }: SectionHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border theme-border theme-bg-secondary hover:opacity-90 transition text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-expanded={open}
    >
      <span className="text-xs font-semibold theme-text-primary uppercase tracking-wide">{title}</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 theme-text-primary font-mono">
          {count}
        </span>
        <span className="text-xs theme-text-secondary">{open ? '▲' : '▼'}</span>
      </div>
    </button>
  );
}

/**
 * Props for a single entry row inside a category section.
 */
interface EntryRowProps {
  /** The memory entry to render. */
  entry: MemoryEntry;
  /** Whether this entry is currently expanded to show full detail. */
  expanded: boolean;
  /** Callback to toggle the expanded state. */
  onToggle: () => void;
  /** Callback to request deletion of this entry. */
  onDelete: (id: string) => void;
}

/**
 * Collapsible entry row inside a memory category section.
 * Shows content snippet, confidence badge, relative timestamp, and source.
 * When expanded, shows full content, all metadata, and a delete button.
 */
function EntryRow({ entry, expanded, onToggle, onDelete }: EntryRowProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete memory entry "${entry.id}"?\n\n"${entry.content.slice(0, 80)}"`)) {
      onDelete(entry.id);
    }
  };

  return (
    <div className="border theme-border rounded-lg overflow-hidden">
      {/* Summary row — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-2 px-3 py-2 theme-bg-secondary hover:opacity-90 transition text-left focus-visible:outline-none"
        aria-expanded={expanded}
      >
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <p className="text-xs theme-text-primary leading-snug truncate">
            {entry.content.length > 80 ? `${entry.content.slice(0, 80)}…` : entry.content}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${confidenceBadgeClass(entry.confidence)}`}>
              {Math.round(entry.confidence * 100)}%
            </span>
            <span className="text-[10px] theme-text-secondary">{relativeTime(entry.timestamp)}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border theme-border theme-text-secondary">
              {entry.source}
            </span>
            {entry.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 theme-text-secondary">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <span className="text-[10px] theme-text-secondary shrink-0 mt-0.5">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 py-2 border-t theme-border theme-bg-primary flex flex-col gap-2">
          <p className="text-xs theme-text-primary leading-relaxed">{entry.content}</p>
          <div className="flex items-center justify-between">
            <span className="text-[10px] theme-text-secondary font-mono">
              id: {entry.id} · ts: {new Date(entry.timestamp).toISOString()}
            </span>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded px-1 py-0.5"
              title="Delete this memory entry"
            >
              <Trash2 size={11} />
              Delete
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
  const { entries, working, fetchEntries, removeEntry } = useMemoryStore();

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
  }, [fetchEntries]);

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
    const filter = (arr: MemoryEntry[]) => {
      if (!q) return arr;
      return arr.filter(
        (e) =>
          e.content.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q))
      );
    };
    return {
      episodic:   filter((entries.episodic   as MemoryEntry[] | undefined) ?? []),
      semantic:   filter((entries.semantic   as MemoryEntry[] | undefined) ?? []),
      procedural: filter((entries.procedural as MemoryEntry[] | undefined) ?? []),
    };
  }, [entries, search]);

  const tokens    = (working?.tokens    as number | undefined) ?? 0;
  const maxTokens = (working?.maxTokens as number | undefined) ?? 1;
  const tokenPct  = Math.min(tokens / maxTokens, 1);
  const summary   = (working?.rollingSummary as string | undefined) ?? '';

  const LONG_TERM_SECTIONS = [
    { key: 'episodic',   label: 'Episodic' },
    { key: 'semantic',   label: 'Semantic' },
    { key: 'procedural', label: 'Procedural' },
  ] as const;

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <input
        type="search"
        placeholder="Search memory entries…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border theme-border theme-bg-secondary theme-text-primary text-xs px-3 py-1.5 placeholder:theme-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
      />

      {/* Long-term memory sections */}
      {LONG_TERM_SECTIONS.map(({ key, label }) => {
        const sectionEntries = filteredEntries[key];
        return (
          <div key={key} className="flex flex-col gap-1">
            <SectionHeader
              title={label}
              count={sectionEntries.length}
              open={openSections.has(key)}
              onToggle={() => toggleSection(key)}
            />
            {openSections.has(key) && (
              <div className="flex flex-col gap-1 pl-2">
                {sectionEntries.length === 0 ? (
                  <p className="text-xs theme-text-secondary py-2 pl-1">No entries.</p>
                ) : (
                  sectionEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      expanded={expandedIds.has(entry.id)}
                      onToggle={() => toggleEntry(entry.id)}
                      onDelete={removeEntry}
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
          count={0}
          open={openSections.has('working')}
          onToggle={() => toggleSection('working')}
        />
        {openSections.has('working') && (
          <div className="pl-2 flex flex-col gap-2">
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
                      tokenPct > 0.95 ? 'bg-red-500' : tokenPct > 0.80 ? 'bg-yellow-400' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${tokenPct * 100}%` }}
                  />
                </div>
              </div>

              {/* Rolling summary */}
              {summary ? (
                <p className="text-xs theme-text-primary leading-relaxed">{summary}</p>
              ) : (
                <p className="text-xs theme-text-secondary">No rolling summary available.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
