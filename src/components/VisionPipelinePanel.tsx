/**
 * @file VisionPipelinePanel.tsx
 * @description Vision pipeline configuration and testing panel.
 *
 * Sub-tabs:
 *   **Config** -- strategy picker (progressive/local-only/cloud-only/parallel),
 *     content type override, confidence threshold slider.
 *
 *   **Process** -- image upload area (drag & drop or file picker), results
 *     display: extracted text, confidence, content category, regions, layout.
 *     Tier breakdown showing which tiers ran and time per tier.
 *
 *   **Embed** -- CLIP embedding visualization. Upload an image, see the
 *     embedding dimensions and a truncated preview. Copy-to-clipboard.
 *
 * All state is local to the panel. Calls the backend via
 * `POST /api/vision/process` and `POST /api/vision/embed`.
 */

import { useCallback, useRef, useState } from 'react';
import {
  Eye,
  FileText,
  Upload,
  RefreshCw,
  Copy,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { resolveWorkbenchApiBaseUrl } from '@/lib/agentosClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VisionSubTab = 'config' | 'process' | 'embed';

interface SubTabDescriptor {
  key: VisionSubTab;
  label: string;
}

const SUB_TABS: SubTabDescriptor[] = [
  { key: 'config',  label: 'Config'  },
  { key: 'process', label: 'Process' },
  { key: 'embed',   label: 'Embed'   },
];

type VisionStrategy = 'progressive' | 'local-only' | 'cloud-only' | 'parallel';

interface TierReport {
  tier: number;
  provider: string;
  durationMs: number;
  confidence: number;
  skipped: boolean;
  skipReason?: string;
}

interface VisionRegion {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  tier: number;
}

interface VisionResult {
  text: string;
  confidence: number;
  contentType: string;
  regions: VisionRegion[];
  layout?: unknown[];
  description?: string;
  tierBreakdown: TierReport[];
}

interface EmbedResult {
  model: string;
  dimensions: number;
  embedding: number[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Post an image buffer to a vision endpoint. */
async function postVisionRequest(
  endpoint: string,
  imageFile: File,
  extraBody?: Record<string, unknown>,
): Promise<unknown> {
  const formData = new FormData();
  formData.append('image', imageFile);
  if (extraBody) {
    for (const [k, v] of Object.entries(extraBody)) {
      formData.append(k, String(v));
    }
  }
  const base = resolveWorkbenchApiBaseUrl();
  const res = await fetch(`${base}${endpoint}`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Vision API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Strategy Picker
// ---------------------------------------------------------------------------

const STRATEGY_OPTIONS: { value: VisionStrategy; label: string; desc: string }[] = [
  { value: 'progressive', label: 'Progressive', desc: 'Local-first, escalate if low confidence' },
  { value: 'local-only',  label: 'Local Only',  desc: 'Never call cloud APIs' },
  { value: 'cloud-only',  label: 'Cloud Only',  desc: 'Send directly to cloud provider' },
  { value: 'parallel',    label: 'Parallel',     desc: 'Run all tiers simultaneously' },
];

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function VisionPipelinePanel() {
  const [subTab, setSubTab] = useState<VisionSubTab>('process');
  const [strategy, setStrategy] = useState<VisionStrategy>('progressive');
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.85);

  // Process tab state
  const [processFile, setProcessFile] = useState<File | null>(null);
  const [processResult, setProcessResult] = useState<VisionResult | null>(null);
  const [processLoading, setProcessLoading] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  // Embed tab state
  const [embedFile, setEmbedFile] = useState<File | null>(null);
  const [embedResult, setEmbedResult] = useState<EmbedResult | null>(null);
  const [embedLoading, setEmbedLoading] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const processInputRef = useRef<HTMLInputElement>(null);
  const embedInputRef = useRef<HTMLInputElement>(null);

  // -- Process handler
  const handleProcess = useCallback(async () => {
    if (!processFile) return;
    setProcessLoading(true);
    setProcessError(null);
    try {
      const result = await postVisionRequest('/api/vision/process', processFile, {
        strategy,
        confidenceThreshold: String(confidenceThreshold),
      });
      setProcessResult(result as VisionResult);
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessLoading(false);
    }
  }, [processFile, strategy, confidenceThreshold]);

  // -- Embed handler
  const handleEmbed = useCallback(async () => {
    if (!embedFile) return;
    setEmbedLoading(true);
    setEmbedError(null);
    try {
      const result = await postVisionRequest('/api/vision/embed', embedFile);
      setEmbedResult(result as EmbedResult);
    } catch (err) {
      setEmbedError(err instanceof Error ? err.message : String(err));
    } finally {
      setEmbedLoading(false);
    }
  }, [embedFile]);

  // -- Copy embedding
  const handleCopyEmbedding = useCallback(() => {
    if (!embedResult) return;
    navigator.clipboard.writeText(JSON.stringify(embedResult.embedding));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [embedResult]);

  // -- Drag & drop
  const handleDrop = useCallback((e: React.DragEvent, target: 'process' | 'embed') => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      if (target === 'process') setProcessFile(file);
      else setEmbedFile(file);
    }
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-0.5 border-b theme-border px-2 pt-1 shrink-0">
        {SUB_TABS.map((tab) => {
          const active = subTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-[0.3em] border-b-2 transition-colors ${
                active
                  ? 'border-current theme-text-accent font-semibold'
                  : 'border-transparent theme-text-muted hover:theme-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
        <div className="ml-auto">
          <HelpTooltip label="Explain vision pipeline panel" side="bottom">
            Vision Pipeline: OCR, image description, and CLIP embeddings using a 3-tier progressive architecture.
          </HelpTooltip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* ── Config Tab ── */}
        {subTab === 'config' && (
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.3em] theme-text-muted mb-1.5">Strategy</label>
              <div className="grid grid-cols-2 gap-2">
                {STRATEGY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStrategy(opt.value)}
                    className={`p-2 rounded text-left border transition-colors ${
                      strategy === opt.value
                        ? 'theme-border-accent theme-bg-accent/10'
                        : 'theme-border theme-bg-secondary hover:theme-bg-hover'
                    }`}
                  >
                    <div className="text-xs font-medium">{opt.label}</div>
                    <div className="text-[10px] theme-text-muted mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.3em] theme-text-muted mb-1.5">
                Confidence Threshold: {(confidenceThreshold * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={confidenceThreshold * 100}
                onChange={(e) => setConfidenceThreshold(Number(e.target.value) / 100)}
                className="w-full"
              />
              <div className="flex justify-between text-[9px] theme-text-muted mt-0.5">
                <span>Always escalate</span>
                <span>Never escalate</span>
              </div>
            </div>

            <div className="card-panel--strong p-2 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.3em] theme-text-muted">Tier Summary</p>
              <div className="text-xs space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Layers size={10} className="theme-text-muted" />
                  <span className="font-medium">Tier 0:</span>
                  <span className="theme-text-muted">PaddleOCR / Tesseract.js (local OCR)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Layers size={10} className="theme-text-muted" />
                  <span className="font-medium">Tier 1:</span>
                  <span className="theme-text-muted">TrOCR / Florence-2 / CLIP (transformers)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Layers size={10} className="theme-text-muted" />
                  <span className="font-medium">Tier 2:</span>
                  <span className="theme-text-muted">Cloud Vision (OpenAI / Google / Anthropic)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Process Tab ── */}
        {subTab === 'process' && (
          <div className="space-y-3">
            {/* Upload area */}
            <div
              onDrop={(e) => handleDrop(e, 'process')}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => processInputRef.current?.click()}
              className="border-2 border-dashed theme-border rounded p-4 text-center cursor-pointer hover:theme-bg-hover transition-colors"
            >
              <Upload size={20} className="mx-auto mb-1 theme-text-muted" />
              <p className="text-xs theme-text-muted">
                {processFile ? processFile.name : 'Drop an image or click to select'}
              </p>
              <input
                ref={processInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setProcessFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <button
              onClick={handleProcess}
              disabled={!processFile || processLoading}
              className="w-full py-1.5 text-xs rounded theme-bg-accent theme-text-on-accent disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {processLoading ? <RefreshCw size={12} className="animate-spin" /> : <Eye size={12} />}
              {processLoading ? 'Processing...' : 'Process Image'}
            </button>

            {processError && (
              <p className="text-xs theme-text-error">{processError}</p>
            )}

            {processResult && (
              <div className="space-y-2">
                {/* Extracted text */}
                <div className="card-panel--strong p-2">
                  <p className="text-[10px] uppercase tracking-[0.3em] theme-text-muted mb-1">
                    <FileText size={10} className="inline mr-1" />
                    Extracted Text
                  </p>
                  <pre className="text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {processResult.text || '(no text detected)'}
                  </pre>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="card-panel--strong p-2">
                    <p className="text-[10px] uppercase tracking-[0.3em] theme-text-muted">Confidence</p>
                    <p className="text-sm font-semibold">{(processResult.confidence * 100).toFixed(1)}%</p>
                  </div>
                  <div className="card-panel--strong p-2">
                    <p className="text-[10px] uppercase tracking-[0.3em] theme-text-muted">Content Type</p>
                    <p className="text-sm font-semibold">{processResult.contentType}</p>
                  </div>
                </div>

                {/* Tier breakdown */}
                {processResult.tierBreakdown?.length > 0 && (
                  <div className="card-panel--strong p-2">
                    <p className="text-[10px] uppercase tracking-[0.3em] theme-text-muted mb-1">
                      <Clock size={10} className="inline mr-1" />
                      Tier Breakdown
                    </p>
                    <div className="space-y-0.5">
                      {processResult.tierBreakdown.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className={`w-2 h-2 rounded-full ${t.skipped ? 'bg-gray-400' : 'bg-green-500'}`} />
                          <span className="font-medium">Tier {t.tier}</span>
                          <span className="theme-text-muted">{t.provider}</span>
                          {t.skipped ? (
                            <span className="theme-text-muted ml-auto">{t.skipReason || 'skipped'}</span>
                          ) : (
                            <span className="ml-auto">{t.durationMs}ms ({(t.confidence * 100).toFixed(0)}%)</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Regions */}
                {processResult.regions?.length > 0 && (
                  <div className="card-panel--strong p-2">
                    <p className="text-[10px] uppercase tracking-[0.3em] theme-text-muted mb-1">
                      Regions ({processResult.regions.length})
                    </p>
                    <div className="max-h-32 overflow-y-auto space-y-0.5">
                      {processResult.regions.map((r, i) => (
                        <div key={i} className="text-[10px] flex items-start gap-1">
                          <span className="theme-text-muted shrink-0">T{r.tier}</span>
                          <span className="truncate">{r.text}</span>
                          <span className="ml-auto theme-text-muted shrink-0">{(r.confidence * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Embed Tab ── */}
        {subTab === 'embed' && (
          <div className="space-y-3">
            <div
              onDrop={(e) => handleDrop(e, 'embed')}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => embedInputRef.current?.click()}
              className="border-2 border-dashed theme-border rounded p-4 text-center cursor-pointer hover:theme-bg-hover transition-colors"
            >
              <Upload size={20} className="mx-auto mb-1 theme-text-muted" />
              <p className="text-xs theme-text-muted">
                {embedFile ? embedFile.name : 'Drop an image or click to select'}
              </p>
              <input
                ref={embedInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setEmbedFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <button
              onClick={handleEmbed}
              disabled={!embedFile || embedLoading}
              className="w-full py-1.5 text-xs rounded theme-bg-accent theme-text-on-accent disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {embedLoading ? <RefreshCw size={12} className="animate-spin" /> : <Eye size={12} />}
              {embedLoading ? 'Generating...' : 'Generate CLIP Embedding'}
            </button>

            {embedError && (
              <p className="text-xs theme-text-error">{embedError}</p>
            )}

            {embedResult && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="card-panel--strong p-2">
                    <p className="text-[10px] uppercase tracking-[0.3em] theme-text-muted">Model</p>
                    <p className="text-xs font-medium">{embedResult.model}</p>
                  </div>
                  <div className="card-panel--strong p-2">
                    <p className="text-[10px] uppercase tracking-[0.3em] theme-text-muted">Dimensions</p>
                    <p className="text-xs font-medium">{embedResult.dimensions}</p>
                  </div>
                </div>

                <div className="card-panel--strong p-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] uppercase tracking-[0.3em] theme-text-muted">Embedding Preview</p>
                    <button
                      onClick={handleCopyEmbedding}
                      className="text-[10px] flex items-center gap-0.5 theme-text-muted hover:theme-text-secondary"
                    >
                      {copied ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-[10px] theme-text-muted max-h-24 overflow-y-auto font-mono">
                    [{embedResult.embedding.slice(0, 16).map(v => v.toFixed(4)).join(', ')}, ...]
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
