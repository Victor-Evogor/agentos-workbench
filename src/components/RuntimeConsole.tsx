import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  Boxes,
  BrainCircuit,
  Database,
  KeyRound,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import {
  getAvailableModels,
  getRuntimeStatus,
  type AgentOSModelInfo,
  type RuntimeStatusResponse,
} from '@/lib/agentosClient';
import { useSecretStore } from '@/state/secretStore';
import { HelpTooltip } from './ui/HelpTooltip';

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-lg border theme-border theme-bg-primary px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">{label}</p>
          <p className="mt-1 text-lg font-semibold theme-text-primary">{value}</p>
          <p className="mt-1 text-[11px] leading-relaxed theme-text-secondary">{detail}</p>
        </div>
        <span className="theme-text-secondary">{icon}</span>
      </div>
    </div>
  );
}

function BoolBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.25em]',
        active
          ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
          : 'theme-border theme-bg-primary theme-text-secondary',
      ].join(' ')}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-500'}`} />
      {label}
    </span>
  );
}

export function RuntimeConsole() {
  const secrets = useSecretStore((state) => state.secrets);
  const [runtime, setRuntime] = useState<RuntimeStatusResponse | null>(null);
  const [models, setModels] = useState<AgentOSModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [runtimeSnapshot, availableModels] = await Promise.all([
          getRuntimeStatus(),
          getAvailableModels().catch(() => []),
        ]);
        if (cancelled) return;
        setRuntime(runtimeSnapshot);
        setModels(availableModels);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load runtime status');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const configuredSecrets = Object.keys(secrets).length;
  const runtimeServices = runtime?.runtime.services;
  const providers = runtime?.runtime.providers?.configured ?? [];
  const defaultProvider = runtime?.runtime.providers?.defaultProvider ?? null;
  const capabilities = runtime?.runtime.capabilities;
  const conversationManager = runtime?.runtime.conversationManager;
  const gmis = runtime?.runtime.gmis;
  const runtimeExtensions = runtime?.runtime.extensions;
  const orchestrationApi = runtime?.orchestrationApi;
  const workbenchIntegration = runtime?.workbenchIntegration;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">Runtime</p>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold theme-text-primary">Backend services and API wiring</h4>
            <HelpTooltip label="Explain runtime console" side="bottom">
              This panel shows what the connected backend actually exposes right now: package exports, configured providers,
              loaded services, and which orchestration features the workbench can truly drive end to end.
            </HelpTooltip>
          </div>
          <p className="mt-1 text-xs theme-text-secondary">
            Verifies the AgentOS package surface, service managers, catalogs, and provider wiring the workbench is using.
          </p>
        </div>
        <button
          type="button"
          title="Reload runtime status, service wiring, and the available model catalog from the backend."
          onClick={() => {
            setLoading(true);
            setError(null);
            void Promise.all([getRuntimeStatus(), getAvailableModels().catch(() => [])])
              .then(([runtimeSnapshot, availableModels]) => {
                setRuntime(runtimeSnapshot);
                setModels(availableModels);
              })
              .catch((err) => {
                setError(err instanceof Error ? err.message : 'Failed to refresh runtime status');
              })
              .finally(() => setLoading(false));
          }}
          className="inline-flex items-center gap-2 rounded-full border theme-border px-3 py-1 text-[11px] font-medium theme-text-secondary hover:theme-text-primary"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Mode"
          value={runtime?.runtime.connected ? 'Connected' : 'Standalone'}
          detail={`AgentOS ${runtime?.packageVersion ?? 'unknown'}${runtime?.runtime.mode ? ` · ${runtime.runtime.mode}` : ''}`}
          icon={<Activity size={16} />}
        />
        <MetricCard
          label="Catalogs"
          value={`${runtime?.catalogs.extensions ?? 0}/${runtime?.catalogs.tools ?? 0}`}
          detail={`${runtime?.catalogs.skills ?? 0} skills · ${runtime?.catalogs.installedExtensions ?? 0} installed extensions · ${gmis?.activeCount ?? 0} active GMIs`}
          icon={<Boxes size={16} />}
        />
        <MetricCard
          label="Providers"
          value={String(models.length)}
          detail={`${providers.length} configured provider${providers.length === 1 ? '' : 's'}${defaultProvider ? ` · default ${defaultProvider}` : ''}`}
          icon={<BrainCircuit size={16} />}
        />
        <MetricCard
          label="Secrets"
          value={String(configuredSecrets)}
          detail={`${runtime?.catalogs.guardrailPacksInstalled ?? 0} guardrail packs installed in registry`}
          icon={<KeyRound size={16} />}
        />
      </div>

      <div className="rounded-lg border theme-border theme-bg-primary p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">Latest Core APIs</p>
            <div className="flex items-center gap-2">
              <p className="text-xs theme-text-secondary">Checks the current root-package exports the latest docs reference.</p>
              <HelpTooltip label="Explain latest core APIs">
                These badges confirm whether the installed AgentOS package exposes the modern helper APIs the docs describe.
                They do not guarantee that every workbench screen is using those APIs yet.
              </HelpTooltip>
            </div>
          </div>
          <span className="text-[10px] theme-text-secondary">
            {loading ? 'Checking…' : 'Current package'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <BoolBadge label="generateText" active={Boolean(runtime?.modernApi.generateText)} />
          <BoolBadge label="streamText" active={Boolean(runtime?.modernApi.streamText)} />
          <BoolBadge label="generateImage" active={Boolean(runtime?.modernApi.generateImage)} />
          <BoolBadge label="agent()" active={Boolean(runtime?.modernApi.agentFactory)} />
          <BoolBadge label="processRequest" active={Boolean(capabilities?.processRequest)} />
          <BoolBadge label="conversationHistory" active={Boolean(capabilities?.getConversationHistory)} />
        </div>
      </div>

      <div className="rounded-lg border theme-border theme-bg-primary p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">Unified Orchestration</p>
            <div className="flex items-center gap-2">
              <p className="text-xs theme-text-secondary">Distinguishes exported graph APIs from what the workbench currently drives end to end.</p>
              <HelpTooltip label="Explain unified orchestration status">
                The first row shows whether AgentOS exports the graph runtime and builders. The second row shows what the
                workbench itself currently supports, which can lag behind the package export surface.
              </HelpTooltip>
            </div>
          </div>
          <span className="text-[10px] theme-text-secondary">
            {loading ? 'Checking…' : 'Export surface'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <BoolBadge label="AgentGraph" active={Boolean(orchestrationApi?.agentGraph)} />
          <BoolBadge label="workflow()" active={Boolean(orchestrationApi?.workflowBuilder)} />
          <BoolBadge label="mission()" active={Boolean(orchestrationApi?.missionBuilder)} />
          <BoolBadge label="GraphRuntime" active={Boolean(orchestrationApi?.graphRuntime)} />
          <BoolBadge label="checkpoints" active={Boolean(orchestrationApi?.checkpointStore)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <BoolBadge label="workflow defs UI" active={Boolean(workbenchIntegration?.workflowDefinitions)} />
          <BoolBadge label="workflow execute UI" active={Boolean(workbenchIntegration?.workflowExecution)} />
          <BoolBadge label="agency execute UI" active={Boolean(workbenchIntegration?.agencyExecution)} />
          <BoolBadge label="runtime-backed planning" active={Boolean(workbenchIntegration?.planningDashboardBackedByRuntime)} />
          <BoolBadge label="graph-run records" active={Boolean(workbenchIntegration?.graphRunRecords)} />
          <BoolBadge label="graph inspection UI" active={Boolean(workbenchIntegration?.graphInspectionUi)} />
          <BoolBadge label="checkpoint UI" active={Boolean(workbenchIntegration?.checkpointResumeUi)} />
        </div>
        {workbenchIntegration?.note ? (
          <p className="mt-3 text-[11px] leading-relaxed theme-text-secondary">
            {workbenchIntegration.note}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border theme-border theme-bg-primary p-3">
          <div className="mb-2 flex items-center gap-2">
            <Wrench size={14} className="theme-text-secondary" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">Services</p>
              <div className="flex items-center gap-2">
                <p className="text-xs theme-text-secondary">Managers the workbench expects the backend to expose.</p>
                <HelpTooltip label="Explain runtime services">
                  These are the backend managers the workbench relies on for conversations, tools, extensions, models, and
                  retrieval. Missing services usually mean the backend is running in a degraded or standalone mode.
                </HelpTooltip>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <BoolBadge label="Conversation" active={Boolean(runtimeServices?.conversationManager)} />
            <BoolBadge label="Extensions" active={Boolean(runtimeServices?.extensionManager)} />
            <BoolBadge label="Tools" active={Boolean(runtimeServices?.toolOrchestrator)} />
            <BoolBadge label="Models" active={Boolean(runtimeServices?.modelProviderManager)} />
            <BoolBadge label="Retrieval" active={Boolean(runtimeServices?.retrievalAugmentor)} />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border theme-border theme-bg-secondary px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.25em] theme-text-muted">Active conversations</p>
              <p className="mt-1 text-sm font-semibold theme-text-primary">
                {conversationManager?.activeConversations ?? 0}
              </p>
            </div>
            <div className="rounded-md border theme-border theme-bg-secondary px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.25em] theme-text-muted">Active GMIs</p>
              <p className="mt-1 text-sm font-semibold theme-text-primary">
                {gmis?.activeCount ?? 0}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] theme-text-secondary">
            Max in-memory conversations: {conversationManager?.maxActiveConversationsInMemory ?? 'n/a'}
            {runtimeExtensions ? ` · ${runtimeExtensions.loadedPacks.length} loaded packs` : ''}
          </p>
        </div>

        <div className="rounded-lg border theme-border theme-bg-primary p-3">
          <div className="mb-2 flex items-center gap-2">
            <Database size={14} className="theme-text-secondary" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.35em] theme-text-muted">Providers & Models</p>
              <div className="flex items-center gap-2">
                <p className="text-xs theme-text-secondary">Configured model backends plus the model catalog surfaced to the UI.</p>
                <HelpTooltip label="Explain providers and models">
                  Providers are configured backend integrations such as OpenAI or Anthropic. The model count reflects what
                  the workbench can currently list, which may be smaller than the full provider catalog if the backend is offline.
                </HelpTooltip>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {providers.length > 0 ? (
              providers.map((provider) => (
                <span
                  key={provider}
                  className="rounded-full border theme-border theme-bg-secondary px-2 py-1 text-[10px] uppercase tracking-[0.25em] theme-text-primary"
                >
                  {provider === defaultProvider ? `${provider} default` : provider}
                </span>
              ))
            ) : (
              <span className="text-xs theme-text-secondary">No providers reported by the runtime.</span>
            )}
          </div>
          <div className="mt-3 space-y-1">
            {models.slice(0, 6).map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between rounded-md border theme-border theme-bg-secondary px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-medium theme-text-primary">{model.displayName ?? model.id}</p>
                  <p className="theme-text-secondary">{model.provider ?? 'unknown provider'}</p>
                </div>
                <span className="theme-text-secondary">{model.id}</span>
              </div>
            ))}
            {models.length === 0 && (
              <p className="text-xs theme-text-secondary">No models reported by `/api/agentos/models`.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
