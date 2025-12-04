import React, { useId } from 'react';

/**
 * Accessible Input Props
 * Extends native input attributes with label and error support.
 */
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
	/** Leading icon */
	icon?: React.ReactNode;
	/** Visible label text */
	label?: string;
	/** Visually hidden label (for icon-only inputs) */
	srLabel?: string;
	/** Error message */
	error?: string;
	/** Help text shown below input */
	helpText?: string;
};

/**
 * Accessible Input Component
 * 
 * Features:
 * - Automatic label association via htmlFor/id
 * - Error state with aria-invalid and aria-describedby
 * - Help text support
 * - Focus ring for keyboard navigation (WCAG 2.4.7)
 * 
 * @example
 * ```tsx
 * <Input label="Email" type="email" required />
 * <Input srLabel="Search" icon={<SearchIcon />} placeholder="Search..." />
 * <Input label="Password" error="Password is required" />
 * ```
 */
export function Input({ 
	className, 
	icon, 
	label, 
	srLabel, 
	error, 
	helpText,
	id: providedId,
	...rest 
}: InputProps) {
	const generatedId = useId();
	const inputId = providedId || generatedId;
	const errorId = error ? `${inputId}-error` : undefined;
	const helpId = helpText ? `${inputId}-help` : undefined;
	const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

	return (
		<div className="text-sm">
			{/* Visible label */}
			{label && (
				<label 
					htmlFor={inputId} 
					className="block mb-1.5 font-medium theme-text-primary"
				>
					{label}
					{rest.required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
				</label>
			)}
			
			{/* Screen reader only label */}
			{srLabel && !label && (
				<label htmlFor={inputId} className="sr-only">
					{srLabel}
				</label>
			)}
			
			<div className="relative">
				{icon && (
					<div 
						className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 theme-text-muted"
						aria-hidden="true"
					>
						{icon}
					</div>
				)}
				<input
					id={inputId}
					className={`
						w-full rounded-lg border bg-[color:var(--color-background-secondary)] 
						px-3 py-2 text-sm theme-text-primary min-h-[44px]
						placeholder:text-[color:var(--color-text-muted)] 
						focus:border-transparent focus-visible:outline-none 
						focus-visible:ring-2 focus-visible:ring-accent 
						focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background-primary)] 
						transition-colors
						${error ? 'border-red-500 ring-red-500' : 'theme-border'}
						${icon ? 'pl-8' : ''} 
						${className ?? ''}
					`}
					aria-invalid={error ? 'true' : undefined}
					aria-describedby={describedBy}
					{...rest}
				/>
			</div>
			
			{/* Error message */}
			{error && (
				<p id={errorId} className="mt-1.5 text-sm text-red-500" role="alert">
					{error}
				</p>
			)}
			
			{/* Help text */}
			{helpText && !error && (
				<p id={helpId} className="mt-1.5 text-sm theme-text-muted">
					{helpText}
				</p>
			)}
		</div>
	);
}


