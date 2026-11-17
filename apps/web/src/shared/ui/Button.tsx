import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover border-transparent shadow-sm',
  secondary: 'bg-surface text-ink border-line shadow-sm hover:border-control hover:bg-surface-2',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-surface-2',
  danger: 'bg-danger text-white border-transparent shadow-sm hover:opacity-90',
};
const SIZE: Record<Size, string> = {
  md: 'min-h-11 px-4 text-sm',
  sm: 'min-h-9 px-3 text-sm',
};

/** Class string so links can look like buttons without nesting a <button> inside an <a>. */
export const buttonClass = (variant: Variant = 'secondary', size: Size = 'md') =>
  cx(
    'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-[color,background-color,border-color,box-shadow] active:translate-y-px',
    'disabled:cursor-not-allowed disabled:opacity-60',
    VARIANT[variant],
    SIZE[size],
  );

interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClass(variant, size), className)}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
