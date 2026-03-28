import { DataSourceBadge } from '@/components/DataSourceBadge';
import { RagConfigPanel } from '@/components/RagConfigPanel';
import { RagDocumentManager } from '@/components/RagDocumentManager';
import { RagRuntimePanel } from '@/components/RagRuntimePanel';
import { HelpTooltip } from '@/components/ui/HelpTooltip';

export function RagWorkspace() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border theme-border theme-bg-secondary-soft p-3 transition-theme">
        <header className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-center gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">
                Retrieval
              </p>
              <h3 className="text-sm font-semibold theme-text-primary">RAG Workspace</h3>
            </div>
            <HelpTooltip label="Explain RAG workspace" side="bottom">
              Configure retrieval settings and manage indexed documents from one place. The current
              workspace combines local RAG configuration, a runtime-backed retrieval console, and
              a mixed document library with both runtime-backed and demo-backed sources.
            </HelpTooltip>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <DataSourceBadge tone="mixed" label="Mixed Workspace" />
            <DataSourceBadge tone="runtime" label="Runtime Query + Ingest" />
            <DataSourceBadge tone="local" label="Config" />
            <DataSourceBadge tone="mixed" label="Mixed Document Library" />
          </div>
        </header>
        <p className="mt-3 max-w-3xl text-[11px] theme-text-secondary">
          Tune retrieval parameters, test the live retrieval runtime, manage runtime and demo
          document sources, inspect chunks, and compare the two paths without bouncing between
          separate panels.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <RagConfigPanel />
          <RagRuntimePanel />
        </div>
        <div className="min-w-0">
          <RagDocumentManager />
        </div>
      </div>
    </div>
  );
}
