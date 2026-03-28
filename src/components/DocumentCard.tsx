import { useCallback, useState } from "react";
import { Download, Eye, EyeOff } from "lucide-react";
import { DocumentPreview } from "./DocumentPreview";

/**
 * Known document formats that the card renders with a distinct icon.
 */
export type DocumentFormat = "pdf" | "docx" | "pptx" | "csv" | "xlsx";

/**
 * Props for the {@link DocumentCard} component.
 */
export interface DocumentCardProps {
  /** Output format of the exported document (e.g. `"pdf"`, `"csv"`). */
  format: DocumentFormat | string;
  /** File name to display and use for the download. */
  filename: string;
  /** Size of the generated file in bytes. */
  sizeBytes: number;
  /** URL that triggers the file download when fetched. */
  downloadUrl: string;
  /** Optional URL for an inline preview of the document content. */
  previewUrl?: string;
}

/** Map from document format to a representative emoji icon. */
const FORMAT_ICONS: Record<string, string> = {
  pdf: "\uD83D\uDCC4",
  docx: "\uD83D\uDCDD",
  pptx: "\uD83D\uDCCA",
  csv: "\uD83D\uDCCB",
  xlsx: "\uD83D\uDCC8",
};

/**
 * Format a byte count into a human-readable string (B, KB, MB, GB).
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Styled download card for agent-generated document exports.
 *
 * Shows the document format icon, filename, file size, a download button, and
 * an optional preview toggle. Styled to match the workbench dark theme.
 */
export const DocumentCard: React.FC<DocumentCardProps> = ({
  format,
  filename,
  sizeBytes,
  downloadUrl,
  previewUrl,
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const icon = FORMAT_ICONS[format.toLowerCase()] ?? "\uD83D\uDCC4";
  const ext = format.toUpperCase();

  /** Trigger browser download of the document. */
  const handleDownload = useCallback(() => {
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = filename;
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [downloadUrl, filename]);

  return (
    <div className="my-2 rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Format icon */}
        <span className="text-2xl" role="img" aria-label={`${ext} document`}>
          {icon}
        </span>

        {/* File info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100">{filename}</p>
          <p className="text-xs text-slate-400">
            {ext} &middot; {formatBytes(sizeBytes)}
          </p>
        </div>

        {/* Preview toggle */}
        {previewUrl && (
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            title={showPreview ? "Hide preview" : "Show preview"}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
          >
            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}

        {/* Download button */}
        <button
          type="button"
          onClick={handleDownload}
          title={`Download ${filename}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </div>

      {/* Preview panel */}
      {showPreview && previewUrl && (
        <div className="border-t border-slate-700 p-3">
          <DocumentPreview previewUrl={previewUrl} />
        </div>
      )}
    </div>
  );
};
