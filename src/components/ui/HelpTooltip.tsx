import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

type HelpTooltipSide = 'top' | 'bottom';

interface HelpTooltipProps {
  label: string;
  children: ReactNode;
  side?: HelpTooltipSide;
  className?: string;
}

function getTooltipPositionClasses(side: HelpTooltipSide): string {
  if (side === 'bottom') {
    return 'left-1/2 top-full mt-2 -translate-x-1/2';
  }
  return 'left-1/2 bottom-full mb-2 -translate-x-1/2';
}

export function HelpTooltip({
  label,
  children,
  side = 'top',
  className = '',
}: HelpTooltipProps) {
  return (
    <span className={`group relative inline-flex items-center ${className}`}>
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border theme-border theme-bg-secondary theme-text-secondary transition hover:theme-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Info className="h-3 w-3" />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 w-72 max-w-[min(18rem,80vw)] rounded-lg border theme-border bg-slate-950 px-3 py-2 text-[11px] leading-relaxed text-slate-100 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-900 ${getTooltipPositionClasses(side)}`}
      >
        {children}
      </span>
    </span>
  );
}
