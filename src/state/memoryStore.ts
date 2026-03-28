import { create } from 'zustand';
import type { WorkbenchDataMode } from '@/lib/workbenchStatus';
import {
  getMemoryStats,
  getMemoryTimeline,
  getMemoryEntries,
  getWorkingMemory,
  deleteMemoryEntry,
  type MemoryEntryRecord,
  type MemoryEntriesResponse,
  type MemoryStatsResponse,
  type MemoryTimelineEntry,
  type WorkingMemorySnapshot,
} from '@/lib/agentosClient';

export type MemorySurfaceTone = WorkbenchDataMode | 'neutral';
export type MemoryResponseMode = Extract<WorkbenchDataMode, 'runtime' | 'demo'>;
export type MemoryErrorKind =
  | 'fetch-stats'
  | 'fetch-timeline'
  | 'fetch-entries'
  | 'fetch-working'
  | 'delete-entry';
export type MemorySuccessKind = 'delete-entry';
export interface MemoryFetchOptions {
  force?: boolean;
}
export const MEMORY_FRESHNESS_WINDOW_MS = 15_000;

export interface MemoryErrorState {
  kind: MemoryErrorKind;
  message: string;
  entryId?: string;
}

export interface MemorySuccessState {
  kind: MemorySuccessKind;
  message: string;
  entryId?: string;
}

export interface RemovedMemoryEntry {
  category: string;
  entry: MemoryEntryRecord;
  index: number;
}

export function resolveMemoryDataMode(
  mode?: MemoryResponseMode | null,
  connected?: boolean | null
): MemoryResponseMode | null {
  if (mode === 'runtime' || mode === 'demo') {
    return mode;
  }
  if (typeof connected === 'boolean') {
    return connected ? 'runtime' : 'demo';
  }
  return null;
}

export function deriveMemorySurfaceTone(
  values: Array<WorkbenchDataMode | boolean | null | undefined>
): MemorySurfaceTone {
  const known = values
    .map((value) => {
      if (value === 'runtime' || value === 'demo' || value === 'mixed' || value === 'local') {
        return value;
      }
      if (typeof value === 'boolean') {
        return value ? 'runtime' : 'demo';
      }
      return null;
    })
    .filter((value): value is WorkbenchDataMode => value !== null);
  if (known.length === 0) {
    return 'neutral';
  }
  if (known.includes('mixed')) {
    return 'mixed';
  }
  if (known.includes('local')) {
    return known.length === 1 ? 'local' : 'mixed';
  }
  const hasRuntime = known.includes('runtime');
  const hasDemo = known.includes('demo');
  if (hasRuntime && hasDemo) {
    return 'mixed';
  }
  return hasRuntime ? 'runtime' : 'demo';
}

export function deriveMemoryLoadingState(flags: {
  statsLoading?: boolean;
  timelineLoading?: boolean;
  entriesLoading?: boolean;
  workingLoading?: boolean;
}): boolean {
  return Boolean(
    flags.statsLoading || flags.timelineLoading || flags.entriesLoading || flags.workingLoading
  );
}

export function shouldFetchMemoryData(args: {
  lastLoadedAt?: number | null;
  loading?: boolean;
  force?: boolean;
  freshnessWindowMs?: number;
}): boolean {
  if (args.force) {
    return true;
  }
  if (args.loading) {
    return false;
  }
  if (!args.lastLoadedAt) {
    return true;
  }
  return Date.now() - args.lastLoadedAt > (args.freshnessWindowMs ?? MEMORY_FRESHNESS_WINDOW_MS);
}

export function describeMemoryLoadedAt(timestamp?: number | null): string {
  if (!timestamp) {
    return 'Not loaded yet';
  }
  const diffMs = Math.max(0, Date.now() - timestamp);
  if (diffMs < 5_000) {
    return 'Updated just now';
  }
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) {
    return `Updated ${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `Updated ${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Updated ${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
}

export function describeMemoryLoadedAtTitle(timestamp?: number | null): string {
  if (!timestamp) {
    return 'Load time unavailable';
  }
  return `Loaded at ${new Date(timestamp).toISOString()}`;
}

export function describeMemoryLoadedAtAriaLabel(timestamp?: number | null): string {
  return `Last updated status. ${describeMemoryLoadedAt(timestamp)}. ${describeMemoryLoadedAtTitle(
    timestamp
  )}.`;
}

export function updatePendingDeleteIds(
  pendingDeleteIds: string[],
  id: string,
  pending: boolean
): string[] {
  if (pending) {
    return pendingDeleteIds.includes(id) ? pendingDeleteIds : [...pendingDeleteIds, id];
  }
  return pendingDeleteIds.filter((entryId) => entryId !== id);
}

export function removeEntryFromCollections(
  entries: Record<string, MemoryEntryRecord[]>,
  id: string
): {
  entries: Record<string, MemoryEntryRecord[]>;
  removed: RemovedMemoryEntry | null;
} {
  let removed: RemovedMemoryEntry | null = null;
  const nextEntries = Object.fromEntries(
    Object.entries(entries).map(([category, records]) => {
      const index = records.findIndex((entry) => entry.id === id);
      if (index < 0) {
        return [category, records];
      }
      removed = {
        category,
        entry: records[index],
        index,
      };
      return [category, [...records.slice(0, index), ...records.slice(index + 1)]];
    })
  ) as Record<string, MemoryEntryRecord[]>;

  return { entries: nextEntries, removed };
}

export function restoreEntryInCollections(
  entries: Record<string, MemoryEntryRecord[]>,
  removed: RemovedMemoryEntry | null
): Record<string, MemoryEntryRecord[]> {
  if (!removed) {
    return entries;
  }
  const existing = entries[removed.category] ?? [];
  if (existing.some((entry) => entry.id === removed.entry.id)) {
    return entries;
  }
  const nextCategory = [...existing];
  nextCategory.splice(Math.min(removed.index, nextCategory.length), 0, removed.entry);
  return {
    ...entries,
    [removed.category]: nextCategory,
  };
}

export function applyMemoryStatsDelta(
  stats: MemoryStatsResponse | null,
  removed: RemovedMemoryEntry | null,
  delta: 1 | -1
): MemoryStatsResponse | null {
  if (!stats || !removed) {
    return stats;
  }
  if (removed.category === 'episodic') {
    return {
      ...stats,
      episodic: {
        ...stats.episodic,
        count: Math.max(0, stats.episodic.count + delta),
      },
    };
  }
  if (removed.category === 'semantic') {
    return {
      ...stats,
      semantic: {
        ...stats.semantic,
        count: Math.max(0, stats.semantic.count + delta),
      },
    };
  }
  if (removed.category === 'procedural') {
    return {
      ...stats,
      procedural: {
        ...stats.procedural,
        count: Math.max(0, stats.procedural.count + delta),
      },
    };
  }
  return stats;
}

export function describeMemoryError(errorState: MemoryErrorState | null): {
  title: string;
  detail: string;
} | null {
  if (!errorState) {
    return null;
  }

  switch (errorState.kind) {
    case 'fetch-stats':
      return { title: 'Stats Load Failed', detail: errorState.message };
    case 'fetch-timeline':
      return { title: 'Timeline Load Failed', detail: errorState.message };
    case 'fetch-entries':
      return { title: 'Memory Entries Load Failed', detail: errorState.message };
    case 'fetch-working':
      return { title: 'Working Memory Load Failed', detail: errorState.message };
    case 'delete-entry':
      return {
        title: errorState.entryId ? `Delete Failed: ${errorState.entryId}` : 'Delete Failed',
        detail: errorState.message,
      };
    default:
      return { title: 'Memory Error', detail: errorState.message };
  }
}

export function describeMemorySuccess(successState: MemorySuccessState | null): {
  title: string;
  detail: string;
} | null {
  if (!successState) {
    return null;
  }

  switch (successState.kind) {
    case 'delete-entry':
      return {
        title: successState.entryId
          ? `Delete Complete: ${successState.entryId}`
          : 'Delete Complete',
        detail: successState.message,
      };
    default:
      return {
        title: 'Success',
        detail: successState.message,
      };
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The three sub-tabs rendered inside the MemoryDashboard panel.
 *
 * - `overview`   — 2×2 summary card grid with health indicator.
 * - `timeline`   — Chronological operation feed with operation-type filters.
 * - `inspector`  — Collapsible tree browser with per-entry delete.
 */
export type MemorySubTab = 'overview' | 'timeline' | 'inspector';

/**
 * Zustand state shape for the cognitive memory panel.
 *
 * All remote data fields start as empty / null and are populated by the
 * corresponding `fetch*` actions. The aggregate `loading` flag and the
 * request-specific loading flags mirror the pattern used in other workbench
 * stores while still letting subviews report honest refresh state.
 *
 * The `error` / `errorState` flags mirror
 * the pattern used in other workbench stores (telemetryStore, sessionStore).
 */
interface MemoryState {
  /** Aggregate counts + token usage from `GET /memory/stats`. */
  stats: MemoryStatsResponse | null;
  statsMode: MemoryResponseMode | null;

  /** Ordered list of memory operation events from `GET /memory/timeline`. */
  timeline: MemoryTimelineEntry[];

  /** Whether the timeline is coming from a live runtime or mock fallback. */
  timelineConnected: boolean | null;
  timelineMode: MemoryResponseMode | null;

  /**
   * Per-category entry lists keyed by category name
   * ('episodic' | 'semantic' | 'procedural').
   * Working memory is stored separately in `working`.
   */
  entries: Record<string, MemoryEntryRecord[]>;

  /** Whether long-term entries are coming from a live runtime or mock fallback. */
  entriesConnected: boolean | null;
  entriesMode: MemoryResponseMode | null;

  /** Working memory snapshot from `GET /memory/working`. */
  working: WorkingMemorySnapshot | null;
  workingMode: MemoryResponseMode | null;

  /** True while any fetch is in flight. */
  loading: boolean;
  statsLoading: boolean;
  timelineLoading: boolean;
  entriesLoading: boolean;
  workingLoading: boolean;
  statsLoadedAt: number | null;
  timelineLoadedAt: number | null;
  entriesLoadedAt: number | null;
  workingLoadedAt: number | null;

  /** Last error message, or null if no error has occurred. */
  error: string | null;
  errorState: MemoryErrorState | null;
  successNotice: string | null;
  successState: MemorySuccessState | null;
  pendingDeleteIds: string[];

  /** Currently visible sub-tab inside the Memory dashboard. */
  activeSubTab: MemorySubTab;

  // --- Actions ---

  /** Switch the visible sub-tab. */
  setActiveSubTab: (tab: MemorySubTab) => void;

  /** Clear the last visible error banner. */
  clearError: () => void;
  /** Clear the last visible success notice. */
  clearSuccessNotice: () => void;

  /** Load aggregate memory statistics from the backend. */
  fetchStats: (options?: MemoryFetchOptions) => Promise<void>;

  /**
   * Load the memory operation timeline.
   * @param since - Optional Unix ms lower bound; only entries after this
   *                timestamp are fetched.
   */
  fetchTimeline: (since?: number, options?: MemoryFetchOptions) => Promise<void>;

  /**
   * Load memory entries, optionally filtered to a single category.
   * @param type - Category name, or omit for all categories.
   */
  fetchEntries: (type?: string, options?: MemoryFetchOptions) => Promise<void>;

  /** Load the working memory snapshot. */
  fetchWorking: (options?: MemoryFetchOptions) => Promise<void>;

  /**
   * Optimistically remove an entry from the local store then fire a DELETE
   * request to the backend.
   * @param id - The memory entry id to remove.
   */
  removeEntry: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Zustand store for the Memory Dashboard panel.
 *
 * Usage:
 * ```tsx
 * const { stats, fetchStats, activeSubTab, setActiveSubTab } = useMemoryStore();
 * ```
 */
export const useMemoryStore = create<MemoryState>()((set) => ({
  stats: null,
  statsMode: null,
  timeline: [],
  timelineConnected: null,
  timelineMode: null,
  entries: {},
  entriesConnected: null,
  entriesMode: null,
  working: null,
  workingMode: null,
  loading: false,
  statsLoading: false,
  timelineLoading: false,
  entriesLoading: false,
  workingLoading: false,
  statsLoadedAt: null,
  timelineLoadedAt: null,
  entriesLoadedAt: null,
  workingLoadedAt: null,
  error: null,
  errorState: null,
  successNotice: null,
  successState: null,
  pendingDeleteIds: [],
  activeSubTab: 'overview',

  setActiveSubTab: (tab) => set({ activeSubTab: tab }),
  clearError: () => set({ error: null, errorState: null }),
  clearSuccessNotice: () => set({ successNotice: null, successState: null }),

  fetchStats: async (options) => {
    const current = useMemoryStore.getState();
    if (
      !shouldFetchMemoryData({
        lastLoadedAt: current.statsLoadedAt,
        loading: current.statsLoading,
        force: options?.force,
      })
    ) {
      return;
    }
    try {
      set((s) => ({
        statsLoading: true,
        loading: deriveMemoryLoadingState({ ...s, statsLoading: true }),
      }));
      const stats = await getMemoryStats();
      set((s) => ({
        stats,
        statsMode: resolveMemoryDataMode(stats?.mode, stats?.connected),
        error: null,
        errorState: null,
        statsLoading: false,
        statsLoadedAt: Date.now(),
        loading: deriveMemoryLoadingState({ ...s, statsLoading: false }),
      }));
    } catch (e: unknown) {
      const message = (e as Error).message;
      set((s) => ({
        error: message,
        errorState: { kind: 'fetch-stats', message },
        statsLoading: false,
        loading: deriveMemoryLoadingState({ ...s, statsLoading: false }),
      }));
    }
  },

  fetchTimeline: async (since, options) => {
    const current = useMemoryStore.getState();
    if (
      since === undefined &&
      !shouldFetchMemoryData({
        lastLoadedAt: current.timelineLoadedAt,
        loading: current.timelineLoading,
        force: options?.force,
      })
    ) {
      return;
    }
    try {
      set((s) => ({
        timelineLoading: true,
        loading: deriveMemoryLoadingState({ ...s, timelineLoading: true }),
      }));
      const response = await getMemoryTimeline(since);
      set((s) => ({
        timeline: response?.timeline ?? [],
        timelineConnected: response?.connected ?? null,
        timelineMode: resolveMemoryDataMode(response?.mode, response?.connected),
        error: null,
        errorState: null,
        timelineLoading: false,
        timelineLoadedAt: Date.now(),
        loading: deriveMemoryLoadingState({ ...s, timelineLoading: false }),
      }));
    } catch (e: unknown) {
      const message = (e as Error).message;
      set((s) => ({
        error: message,
        errorState: { kind: 'fetch-timeline', message },
        timelineLoading: false,
        loading: deriveMemoryLoadingState({ ...s, timelineLoading: false }),
      }));
    }
  },

  fetchEntries: async (type, options) => {
    const current = useMemoryStore.getState();
    if (
      type === undefined &&
      !shouldFetchMemoryData({
        lastLoadedAt: current.entriesLoadedAt,
        loading: current.entriesLoading,
        force: options?.force,
      })
    ) {
      return;
    }
    try {
      set((s) => ({
        entriesLoading: true,
        loading: deriveMemoryLoadingState({ ...s, entriesLoading: true }),
      }));
      const data = await getMemoryEntries(type);
      set((s) => {
        if (type) {
          if (type === 'working' && data && typeof data === 'object' && !Array.isArray(data)) {
            const working = data as WorkingMemorySnapshot;
            return {
              working,
              workingMode: resolveMemoryDataMode(working.mode, working.connected),
              error: null,
              errorState: null,
              entriesLoading: false,
              entriesLoadedAt: Date.now(),
              loading: deriveMemoryLoadingState({ ...s, entriesLoading: false }),
            };
          }
          // Single category — merge into entries map.
          return {
            entriesMode: s.entriesMode,
            error: null,
            errorState: null,
            entriesLoading: false,
            entriesLoadedAt: Date.now(),
            loading: deriveMemoryLoadingState({ ...s, entriesLoading: false }),
            entries: {
              ...s.entries,
              [type]: Array.isArray(data) ? (data as MemoryEntryRecord[]) : (s.entries[type] ?? []),
            },
          };
        }
        // Full store object: shape is { episodic: [], semantic: [], procedural: [], working: {} }.
        // Only pull the array-valued keys into `entries`; working is handled separately.
        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
          const fullStore = data as Partial<
            MemoryEntriesResponse & { working?: WorkingMemorySnapshot }
          >;
          return {
            entriesConnected: fullStore.connected ?? null,
            entriesMode: resolveMemoryDataMode(fullStore.mode, fullStore.connected),
            error: null,
            errorState: null,
            entriesLoading: false,
            entriesLoadedAt: Date.now(),
            loading: deriveMemoryLoadingState({ ...s, entriesLoading: false }),
            entries: {
              episodic: Array.isArray(fullStore.episodic) ? fullStore.episodic : [],
              semantic: Array.isArray(fullStore.semantic) ? fullStore.semantic : [],
              procedural: Array.isArray(fullStore.procedural) ? fullStore.procedural : [],
            },
            working: fullStore.working ?? s.working,
          };
        }
        return {
          ...s,
          entriesLoading: false,
          loading: deriveMemoryLoadingState({ ...s, entriesLoading: false }),
        };
      });
    } catch (e: unknown) {
      const message = (e as Error).message;
      set((s) => ({
        error: message,
        errorState: { kind: 'fetch-entries', message },
        entriesLoading: false,
        loading: deriveMemoryLoadingState({ ...s, entriesLoading: false }),
      }));
    }
  },

  fetchWorking: async (options) => {
    const current = useMemoryStore.getState();
    if (
      !shouldFetchMemoryData({
        lastLoadedAt: current.workingLoadedAt,
        loading: current.workingLoading,
        force: options?.force,
      })
    ) {
      return;
    }
    try {
      set((s) => ({
        workingLoading: true,
        loading: deriveMemoryLoadingState({ ...s, workingLoading: true }),
      }));
      const working = await getWorkingMemory();
      set((s) => ({
        working,
        workingMode: resolveMemoryDataMode(working?.mode, working?.connected),
        error: null,
        errorState: null,
        workingLoading: false,
        workingLoadedAt: Date.now(),
        loading: deriveMemoryLoadingState({ ...s, workingLoading: false }),
      }));
    } catch (e: unknown) {
      const message = (e as Error).message;
      set((s) => ({
        error: message,
        errorState: { kind: 'fetch-working', message },
        workingLoading: false,
        loading: deriveMemoryLoadingState({ ...s, workingLoading: false }),
      }));
    }
  },

  removeEntry: async (id) => {
    set((s) => ({
      pendingDeleteIds: updatePendingDeleteIds(s.pendingDeleteIds, id, true),
      error: null,
      errorState: null,
      successNotice: null,
      successState: null,
    }));

    try {
      const result = await deleteMemoryEntry(id);
      if (!result.ok) {
        set((s) => ({
          pendingDeleteIds: updatePendingDeleteIds(s.pendingDeleteIds, id, false),
          entriesMode: resolveMemoryDataMode(result.mode, null) ?? s.entriesMode,
          error: result.error ?? `Failed to delete memory entry (${result.status}).`,
          errorState: {
            kind: 'delete-entry',
            entryId: id,
            message: result.error ?? `Failed to delete memory entry (${result.status}).`,
          },
        }));
        return;
      }

      set((s) => ({
        ...(() => {
          const next = removeEntryFromCollections(s.entries, id);
          return {
            entries: next.entries,
            stats: applyMemoryStatsDelta(s.stats, next.removed, -1),
          };
        })(),
        pendingDeleteIds: updatePendingDeleteIds(s.pendingDeleteIds, id, false),
        entriesMode: resolveMemoryDataMode(result.mode, null) ?? s.entriesMode,
        error: null,
        errorState: null,
        successNotice: `Deleted memory entry ${id}.`,
        successState: {
          kind: 'delete-entry',
          entryId: id,
          message: `Deleted memory entry ${id}.`,
        },
      }));
    } catch (e: unknown) {
      const message = (e as Error).message;
      set((s) => ({
        pendingDeleteIds: updatePendingDeleteIds(s.pendingDeleteIds, id, false),
        error: message,
        errorState: {
          kind: 'delete-entry',
          entryId: id,
          message,
        },
      }));
    }
  },
}));
