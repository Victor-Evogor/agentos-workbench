import { useEffect, useState } from "react";

/**
 * Props for the {@link DocumentPreview} component.
 */
export interface DocumentPreviewProps {
  /** URL to fetch preview content from. */
  previewUrl: string;
}

/**
 * Fetches preview content from a URL and renders it inline.
 *
 * - HTML responses (`text/html`) are rendered via `dangerouslySetInnerHTML`.
 * - All other content types are rendered inside a `<pre>` block.
 * - A loading skeleton is shown while the fetch is in progress.
 */
export const DocumentPreview: React.FC<DocumentPreviewProps> = ({ previewUrl }) => {
  const [content, setContent] = useState<string | null>(null);
  const [isHtml, setIsHtml] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(previewUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = res.headers.get("content-type") ?? "";
        const text = await res.text();
        if (!cancelled) {
          setContent(text);
          setIsHtml(ct.includes("text/html"));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load preview");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  if (loading) {
    return (
      <div className="animate-pulse rounded-lg border border-slate-700 bg-slate-950 p-4">
        <div className="h-3 w-3/4 rounded bg-slate-700" />
        <div className="mt-2 h-3 w-1/2 rounded bg-slate-700" />
        <div className="mt-2 h-3 w-2/3 rounded bg-slate-700" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
        Preview unavailable: {error}
      </div>
    );
  }

  if (!content) return null;

  if (isHtml) {
    return (
      <div
        className="rounded-lg border border-slate-700 bg-white p-4 text-sm text-slate-800"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  return (
    <pre className="max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-4 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
      {content}
    </pre>
  );
};
