import React from 'react';

/**
 * VisuallyHidden Component
 * 
 * Hides content visually while keeping it accessible to screen readers.
 * Use for:
 * - Icon-only button labels
 * - Additional context for screen readers
 * - Skip links (when not focused)
 * 
 * @example
 * ```tsx
 * <button>
 *   <TrashIcon />
 *   <VisuallyHidden>Delete item</VisuallyHidden>
 * </button>
 * ```
 */
export function VisuallyHidden({ 
  children, 
  as: Component = 'span' 
}: { 
  children: React.ReactNode;
  as?: React.ElementType;
}) {
  return (
    <Component className="sr-only">
      {children}
    </Component>
  );
}

/**
 * Announce Component
 * 
 * Creates a live region that announces content changes to screen readers.
 * Use for dynamic status updates, form validation, etc.
 * 
 * @example
 * ```tsx
 * <Announce polite>
 *   {isLoading ? 'Loading...' : `${count} results found`}
 * </Announce>
 * ```
 */
export function Announce({ 
  children, 
  polite = false,
  atomic = true,
}: { 
  children: React.ReactNode;
  /** Use polite for non-urgent updates, assertive for important */
  polite?: boolean;
  /** Announce entire region on change */
  atomic?: boolean;
}) {
  return (
    <div 
      role="status"
      aria-live={polite ? 'polite' : 'assertive'}
      aria-atomic={atomic}
      className="sr-only"
    >
      {children}
    </div>
  );
}

