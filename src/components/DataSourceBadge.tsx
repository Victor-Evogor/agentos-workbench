import type { WorkbenchDataMode } from '@/lib/workbenchStatus';

type DataSourceBadgeTone = WorkbenchDataMode | 'neutral';

const TONE_STYLES: Record<DataSourceBadgeTone, string> = {
  runtime: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  mixed: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
  demo: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
  local: 'theme-border theme-bg-primary text-sky-300',
  neutral: 'theme-border theme-bg-primary theme-text-secondary',
};

const DOT_STYLES: Record<DataSourceBadgeTone, string> = {
  runtime: 'bg-emerald-400',
  mixed: 'bg-amber-400',
  demo: 'bg-rose-400',
  local: 'bg-sky-400',
  neutral: 'bg-slate-400',
};

export function DataSourceBadge({
  tone,
  label,
  accessibleLabel,
  className = '',
}: {
  tone: DataSourceBadgeTone;
  label: string;
  accessibleLabel?: string;
  className?: string;
}) {
  return (
    <span
      aria-label={accessibleLabel ?? `Data source: ${label}`}
      className={[
        'inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.25em]',
        TONE_STYLES[tone],
        className,
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-1.5 w-1.5 rounded-full ${DOT_STYLES[tone]}`}
      />
      {label}
    </span>
  );
}
