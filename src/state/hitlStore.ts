/**
 * @file hitlStore.ts
 * @description Zustand store for Human-in-the-Loop (HITL) approvals queue.
 *
 * Polls `GET /api/agency/approvals` every {@link POLL_INTERVAL_MS} milliseconds
 * and stores pending approvals plus a local decision history.  Components can
 * call {@link submitDecision} to POST a decision and immediately remove the
 * item from the pending list.
 */

import { create } from 'zustand';
import { resolveWorkbenchApiBaseUrl } from '@/lib/agentosClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ApprovalDecision = 'approved' | 'rejected';

export interface PendingApprovalItem {
  id: string;
  type: string;
  agentId: string;
  action: string;
  description: string;
  severity: ApprovalSeverity;
  context: Record<string, unknown>;
  reversible: boolean;
  requestedAt: string;
}

export interface ApprovalHistoryItem {
  id: string;
  type: string;
  agentId: string;
  action: string;
  description: string;
  decision: ApprovalDecision;
  modification?: string;
  decidedAt: string;
}

interface HitlState {
  /** Pending approvals fetched from the backend. */
  pending: PendingApprovalItem[];
  /** Local history of decisions made in this session. */
  history: ApprovalHistoryItem[];
  /** True while a poll is in progress. */
  loading: boolean;
  /** Last fetch error, if any. */
  error: string | null;
  /** True when the background poll interval is active. */
  polling: boolean;

  /** Fetch the current pending list once. */
  fetchPending: () => Promise<void>;
  /** Start/stop background polling. */
  startPolling: () => void;
  stopPolling: () => void;
  /** Submit a decision for an approval item. */
  submitDecision: (
    id: string,
    decision: ApprovalDecision,
    modification?: string
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5_000;
let pollHandle: ReturnType<typeof setInterval> | null = null;

function buildBaseUrl(): string {
  try {
    return resolveWorkbenchApiBaseUrl();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useHitlStore = create<HitlState>((set, get) => ({
  pending: [],
  history: [],
  loading: false,
  error: null,
  polling: false,

  fetchPending: async () => {
    set({ loading: true, error: null });
    try {
      const baseUrl = buildBaseUrl();
      const res = await fetch(`${baseUrl}/api/agency/approvals`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { approvals?: PendingApprovalItem[] };
      set({ pending: data.approvals ?? [], loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch approvals.',
        loading: false,
      });
    }
  },

  startPolling: () => {
    if (pollHandle !== null) return;
    const { fetchPending } = get();
    void fetchPending();
    pollHandle = setInterval(() => {
      void fetchPending();
    }, POLL_INTERVAL_MS);
    set({ polling: true });
  },

  stopPolling: () => {
    if (pollHandle !== null) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
    set({ polling: false });
  },

  submitDecision: async (id, decision, modification) => {
    const baseUrl = buildBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/agency/approvals/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, modification }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Optimistically remove from pending and add to history
      set((state) => {
        const item = state.pending.find((p) => p.id === id);
        const historyEntry: ApprovalHistoryItem | null = item
          ? {
              id: item.id,
              type: item.type,
              agentId: item.agentId,
              action: item.action,
              description: item.description,
              decision,
              modification,
              decidedAt: new Date().toISOString(),
            }
          : null;

        return {
          pending: state.pending.filter((p) => p.id !== id),
          history: historyEntry
            ? [historyEntry, ...state.history].slice(0, 50)
            : state.history,
          error: null,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to submit decision.' });
    }
  },
}));
