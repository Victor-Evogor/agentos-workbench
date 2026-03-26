/**
 * @file ImageEditingPanel.tsx
 * @description Image editing panel with three modes: Edit (img2img/inpainting),
 * Upscale (super resolution), and Variate (create variations).
 *
 * Sub-tabs:
 *   **Edit** -- Image upload + prompt input + optional mask upload + strength
 *     slider. Calls `POST /api/image/edit`.
 *
 *   **Upscale** -- Image upload + scale picker (2x/4x). Calls
 *     `POST /api/image/upscale`.
 *
 *   **Variate** -- Image upload + count selector. Calls
 *     `POST /api/image/variate`.
 *
 * All modes share a provider picker and a result gallery with download.
 */

import { useCallback, useRef, useState } from 'react';
import {
  Paintbrush,
  Maximize,
  Shuffle,
  Upload,
  RefreshCw,
  Download,
  Image as ImageIcon,
} from 'lucide-react';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { resolveWorkbenchApiBaseUrl } from '@/lib/agentosClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EditSubTab = 'edit' | 'upscale' | 'variate';

const SUB_TABS: { key: EditSubTab; label: string; icon: typeof Paintbrush }[] = [
  { key: 'edit',    label: 'Edit',    icon: Paintbrush },
  { key: 'upscale', label: 'Upscale', icon: Maximize },
  { key: 'variate', label: 'Variate', icon: Shuffle },
];

type ImageProvider = 'openai' | 'stability' | 'replicate' | 'stable-diffusion-local' | '';

interface ImageResultItem {
  base64?: string;
  url?: string;
  width?: number;
  height?: number;
}

interface ImageApiResult {
  images: ImageResultItem[];
  provider: string;
  model: string;
}

const PROVIDERS: { value: ImageProvider; label: string }[] = [
  { value: '',                        label: 'Auto-detect' },
  { value: 'openai',                  label: 'OpenAI' },
  { value: 'stability',               label: 'Stability AI' },
  { value: 'replicate',               label: 'Replicate' },
  { value: 'stable-diffusion-local',  label: 'Local SD' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postImageRequest(
  endpoint: string,
  formData: FormData,
): Promise<ImageApiResult> {
  const base = resolveWorkbenchApiBaseUrl();
  const res = await fetch(`${base}${endpoint}`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Image API error: ${res.status} ${res.statusText}`);
  return res.json();
}

function downloadImage(item: ImageResultItem, filename: string) {
  if (item.base64) {
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${item.base64}`;
    a.download = filename;
    a.click();
  } else if (item.url) {
    window.open(item.url, '_blank');
  }
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function ImageEditingPanel() {
  const [subTab, setSubTab] = useState<EditSubTab>('edit');
  const [provider, setProvider] = useState<ImageProvider>('');

  // Edit state
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editMask, setEditMask] = useState<File | null>(null);
  const [editStrength, setEditStrength] = useState(0.75);

  // Upscale state
  const [upscaleFile, setUpscaleFile] = useState<File | null>(null);
  const [upscaleScale, setUpscaleScale] = useState<2 | 4>(2);

  // Variate state
  const [variateFile, setVariateFile] = useState<File | null>(null);
  const [variateCount, setVariateCount] = useState(3);

  // Shared result state
  const [result, setResult] = useState<ImageApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);
  const maskInputRef = useRef<HTMLInputElement>(null);
  const upscaleInputRef = useRef<HTMLInputElement>(null);
  const variateInputRef = useRef<HTMLInputElement>(null);

  const handleEdit = useCallback(async () => {
    if (!editFile || !editPrompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('image', editFile);
      fd.append('prompt', editPrompt);
      fd.append('strength', String(editStrength));
      if (editMask) fd.append('mask', editMask);
      if (provider) fd.append('provider', provider);
      setResult(await postImageRequest('/api/image/edit', fd));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [editFile, editPrompt, editStrength, editMask, provider]);

  const handleUpscale = useCallback(async () => {
    if (!upscaleFile) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('image', upscaleFile);
      fd.append('scale', String(upscaleScale));
      if (provider) fd.append('provider', provider);
      setResult(await postImageRequest('/api/image/upscale', fd));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [upscaleFile, upscaleScale, provider]);

  const handleVariate = useCallback(async () => {
    if (!variateFile) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('image', variateFile);
      fd.append('n', String(variateCount));
      if (provider) fd.append('provider', provider);
      setResult(await postImageRequest('/api/image/variate', fd));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [variateFile, variateCount, provider]);

  const handleDrop = useCallback((e: React.DragEvent, setter: (f: File) => void) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) setter(file);
  }, []);

  const renderUploadZone = (
    file: File | null,
    inputRef: React.RefObject<HTMLInputElement | null>,
    setter: (f: File | null) => void,
    dropTarget: (f: File) => void,
    label?: string,
  ) => (
    <div
      onDrop={(e) => handleDrop(e, dropTarget)}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className="border-2 border-dashed theme-border rounded p-3 text-center cursor-pointer hover:theme-bg-hover transition-colors"
    >
      <Upload size={16} className="mx-auto mb-0.5 theme-text-muted" />
      <p className="text-[10px] theme-text-muted">
        {file ? file.name : (label || 'Drop image or click to select')}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => setter(e.target.files?.[0] ?? null)}
      />
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-0.5 border-b theme-border px-2 pt-1 shrink-0">
        {SUB_TABS.map((tab) => {
          const active = subTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => { setSubTab(tab.key); setResult(null); setError(null); }}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-[0.3em] border-b-2 transition-colors flex items-center gap-1 ${
                active
                  ? 'border-current theme-text-accent font-semibold'
                  : 'border-transparent theme-text-muted hover:theme-text-secondary'
              }`}
            >
              <Icon size={10} />
              {tab.label}
            </button>
          );
        })}
        <div className="ml-auto">
          <HelpTooltip text="Image Editing: edit (img2img/inpainting), upscale (2x/4x), and create variations." />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Provider picker */}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.3em] theme-text-muted mb-1">Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ImageProvider)}
            className="w-full text-xs p-1.5 rounded border theme-border theme-bg-secondary"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* ── Edit Tab ── */}
        {subTab === 'edit' && (
          <div className="space-y-2">
            {renderUploadZone(editFile, editInputRef, setEditFile, setEditFile, 'Drop source image')}

            <div>
              <label className="block text-[10px] uppercase tracking-[0.3em] theme-text-muted mb-1">Edit Prompt</label>
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="Describe how to modify the image..."
                rows={2}
                className="w-full text-xs p-1.5 rounded border theme-border theme-bg-secondary resize-none"
              />
            </div>

            {renderUploadZone(editMask, maskInputRef, setEditMask, setEditMask, 'Drop mask (optional, white=edit area)')}

            <div>
              <label className="block text-[10px] uppercase tracking-[0.3em] theme-text-muted mb-1">
                Strength: {editStrength.toFixed(2)}
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={editStrength * 100}
                onChange={(e) => setEditStrength(Number(e.target.value) / 100)}
                className="w-full"
              />
            </div>

            <button
              onClick={handleEdit}
              disabled={!editFile || !editPrompt.trim() || loading}
              className="w-full py-1.5 text-xs rounded theme-bg-accent theme-text-on-accent disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {loading ? <RefreshCw size={12} className="animate-spin" /> : <Paintbrush size={12} />}
              {loading ? 'Editing...' : 'Edit Image'}
            </button>
          </div>
        )}

        {/* ── Upscale Tab ── */}
        {subTab === 'upscale' && (
          <div className="space-y-2">
            {renderUploadZone(upscaleFile, upscaleInputRef, setUpscaleFile, setUpscaleFile)}

            <div>
              <label className="block text-[10px] uppercase tracking-[0.3em] theme-text-muted mb-1">Scale Factor</label>
              <div className="flex gap-2">
                {([2, 4] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setUpscaleScale(s)}
                    className={`flex-1 py-1.5 text-xs rounded border transition-colors ${
                      upscaleScale === s
                        ? 'theme-border-accent theme-bg-accent/10 font-medium'
                        : 'theme-border theme-bg-secondary'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleUpscale}
              disabled={!upscaleFile || loading}
              className="w-full py-1.5 text-xs rounded theme-bg-accent theme-text-on-accent disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {loading ? <RefreshCw size={12} className="animate-spin" /> : <Maximize size={12} />}
              {loading ? 'Upscaling...' : `Upscale ${upscaleScale}x`}
            </button>
          </div>
        )}

        {/* ── Variate Tab ── */}
        {subTab === 'variate' && (
          <div className="space-y-2">
            {renderUploadZone(variateFile, variateInputRef, setVariateFile, setVariateFile)}

            <div>
              <label className="block text-[10px] uppercase tracking-[0.3em] theme-text-muted mb-1">
                Variations: {variateCount}
              </label>
              <input
                type="range"
                min={1}
                max={8}
                value={variateCount}
                onChange={(e) => setVariateCount(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <button
              onClick={handleVariate}
              disabled={!variateFile || loading}
              className="w-full py-1.5 text-xs rounded theme-bg-accent theme-text-on-accent disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {loading ? <RefreshCw size={12} className="animate-spin" /> : <Shuffle size={12} />}
              {loading ? 'Creating...' : `Create ${variateCount} Variation${variateCount > 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs theme-text-error">{error}</p>
        )}

        {/* Result gallery */}
        {result && result.images?.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.3em] theme-text-muted">
                Results ({result.images.length}) — {result.provider} / {result.model}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {result.images.map((img, i) => (
                <div key={i} className="card-panel--strong p-1 relative group">
                  {img.base64 ? (
                    <img
                      src={`data:image/png;base64,${img.base64}`}
                      alt={`Result ${i + 1}`}
                      className="w-full rounded"
                    />
                  ) : img.url ? (
                    <img
                      src={img.url}
                      alt={`Result ${i + 1}`}
                      className="w-full rounded"
                    />
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center theme-bg-secondary rounded">
                      <ImageIcon size={24} className="theme-text-muted" />
                    </div>
                  )}
                  <button
                    onClick={() => downloadImage(img, `result-${i + 1}.png`)}
                    className="absolute top-2 right-2 p-1 rounded theme-bg-secondary/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Download"
                  >
                    <Download size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
