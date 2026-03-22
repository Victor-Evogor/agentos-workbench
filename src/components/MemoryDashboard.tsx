import { useMemoryStore, type MemorySubTab } from '@/state/memoryStore';
import { MemoryOverview } from '@/components/MemoryOverview';
import { MemoryTimeline } from '@/components/MemoryTimeline';
import { MemoryInspector } from '@/components/MemoryInspector';

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
  { key: 'overview',  label: 'Overview'  },
  { key: 'timeline',  label: 'Timeline'  },
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
  const activeSubTab    = useMemoryStore((s) => s.activeSubTab);
  const setActiveSubTab = useMemoryStore((s) => s.setActiveSubTab);

  return (
    <div className="flex flex-col gap-4 h-full">
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
        {activeSubTab === 'overview'  && <MemoryOverview  />}
        {activeSubTab === 'timeline'  && <MemoryTimeline  />}
        {activeSubTab === 'inspector' && <MemoryInspector />}
      </div>
    </div>
  );
}
