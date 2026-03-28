import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStorage } from '@/utils/idbStorage';
import { sqlStateStorage } from '@/lib/sqlStateStorage';

type LeftPanelKey =
  | 'home'
  | 'playground'
  | 'prompt-workspace'
  | 'compose'
  | 'personas'
  | 'agency'
  | 'workflows'
  | 'evaluation'
  | 'planning'
  | 'memory'
  | 'voice'
  | 'strategy'
  | 'resources'
  | 'schema'
  | 'rag'
  | 'hitl'
  | 'capabilities'
  | 'marketplace'
  | 'graph-builder'
  | 'tool-forge'
  | 'channels'
  | 'social'
  | 'call-monitor'
  | 'guardrail-eval'
  | 'observability'
  | 'vision-pipeline'
  | 'image-editing'
  | 'llm-providers'
  | 'rag-docs';

interface UiState {
  welcomeTourDismissed: boolean;
  welcomeTourSnoozeUntil: number | null;
  sampleWorkspaceMode: 'sample' | 'clean' | null;
  dismissWelcomeTour: () => void;
  snoozeWelcomeTour: (hours?: number) => void;
  preferredLeftPanel: LeftPanelKey;
  setPreferredLeftPanel: (panel: LeftPanelKey) => void;
  setSampleWorkspaceMode: (mode: 'sample' | 'clean') => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      welcomeTourDismissed: false,
      welcomeTourSnoozeUntil: null,
      sampleWorkspaceMode: null,
      preferredLeftPanel: 'home',
      dismissWelcomeTour: () => set({ welcomeTourDismissed: true, welcomeTourSnoozeUntil: null }),
      snoozeWelcomeTour: (hours = 24) => set({ welcomeTourSnoozeUntil: Date.now() + hours * 60 * 60 * 1000 }),
      setPreferredLeftPanel: (panel) => set({ preferredLeftPanel: panel }),
      setSampleWorkspaceMode: (mode) => set({ sampleWorkspaceMode: mode }),
    }),
    { name: 'agentos-workbench-ui', storage: createJSONStorage(() => (typeof window !== 'undefined' ? idbStorage : sqlStateStorage)) }
  )
);
