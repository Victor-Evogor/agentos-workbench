import { create } from 'zustand';
import {
  getMemoryStats,
  getMemoryTimeline,
  getMemoryEntries,
  getWorkingMemory,
  deleteMemoryEntry,
} from '@/lib/agentosClient';

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
 * corresponding `fetch*` actions.  The `loading` / `error` flags mirror
 * the pattern used in other workbench stores (telemetryStore, sessionStore).
 */
interface MemoryState {
  /** Aggregate counts + token usage from `GET /memory/stats`. */
  stats: Record<string, unknown> | null;

  /** Ordered list of memory operation events from `GET /memory/timeline`. */
  timeline: unknown[];

  /**
   * Per-category entry lists keyed by category name
   * ('episodic' | 'semantic' | 'procedural').
   * Working memory is stored separately in `working`.
   */
  entries: Record<string, unknown[]>;

  /** Working memory snapshot from `GET /memory/working`. */
  working: Record<string, unknown> | null;

  /** True while any fetch is in flight. */
  loading: boolean;

  /** Last error message, or null if no error has occurred. */
  error: string | null;

  /** Currently visible sub-tab inside the Memory dashboard. */
  activeSubTab: MemorySubTab;

  // --- Actions ---

  /** Switch the visible sub-tab. */
  setActiveSubTab: (tab: MemorySubTab) => void;

  /** Load aggregate memory statistics from the backend. */
  fetchStats: () => Promise<void>;

  /**
   * Load the memory operation timeline.
   * @param since - Optional Unix ms lower bound; only entries after this
   *                timestamp are fetched.
   */
  fetchTimeline: (since?: number) => Promise<void>;

  /**
   * Load memory entries, optionally filtered to a single category.
   * @param type - Category name, or omit for all categories.
   */
  fetchEntries: (type?: string) => Promise<void>;

  /** Load the working memory snapshot. */
  fetchWorking: () => Promise<void>;

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
  timeline: [],
  entries: {},
  working: null,
  loading: false,
  error: null,
  activeSubTab: 'overview',

  setActiveSubTab: (tab) => set({ activeSubTab: tab }),

  fetchStats: async () => {
    try {
      set({ loading: true });
      const stats = await getMemoryStats();
      set({ stats, loading: false });
    } catch (e: unknown) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchTimeline: async (since) => {
    try {
      const timeline = await getMemoryTimeline(since);
      set({ timeline });
    } catch (e: unknown) {
      set({ error: (e as Error).message });
    }
  },

  fetchEntries: async (type) => {
    try {
      const data = await getMemoryEntries(type);
      set((s) => {
        if (type) {
          // Single category — merge into entries map.
          return { entries: { ...s.entries, [type]: data as unknown[] } };
        }
        // Full store object: shape is { episodic: [], semantic: [], procedural: [], working: {} }.
        // Only pull the array-valued keys into `entries`; working is handled separately.
        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
          const fullStore = data as Record<string, unknown>;
          const arrayEntries: Record<string, unknown[]> = {};
          for (const [k, v] of Object.entries(fullStore)) {
            if (Array.isArray(v)) arrayEntries[k] = v;
          }
          return { entries: arrayEntries };
        }
        return s;
      });
    } catch (e: unknown) {
      set({ error: (e as Error).message });
    }
  },

  fetchWorking: async () => {
    try {
      const working = await getWorkingMemory();
      set({ working });
    } catch (e: unknown) {
      set({ error: (e as Error).message });
    }
  },

  removeEntry: async (id) => {
    // Optimistically remove from UI before the network round-trip completes.
    set((s) => {
      const entries = { ...s.entries };
      for (const k of Object.keys(entries)) {
        if (Array.isArray(entries[k])) {
          entries[k] = entries[k].filter((e: unknown) => (e as { id?: string }).id !== id);
        }
      }
      return { entries };
    });
    try {
      await deleteMemoryEntry(id);
    } catch (e: unknown) {
      set({ error: (e as Error).message });
    }
  },
}));
