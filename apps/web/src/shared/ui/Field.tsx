import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from './cx';

const CONTROL =
  'w-full rounded-md border border-control bg-surface px-3 text-ink placeholder:text-ink-soft ' +
  'disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger';

interface ShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  className?: string;
}

/** Label, hint and error wired to the control with aria-describedby / aria-invalid. */
function useFieldIds(error: string | undefined, hint: ReactNode) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return {
    id,
    hintId,
    errorId,
    control: {
      id,
      'aria-invalid': error ? (true as const) : undefined,
      'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
    },
  };
}

function Shell({
  ids,
  label,
  hint,
  error,
  className,
  aside,
  children,
}: ShellProps & { ids: ReturnType<typeof useFieldIds>; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={ids.id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {hint && (
        <p id={ids.hintId} className="mb-1.5 text-sm text-ink-soft">
          {hint}
        </p>
      )}
      {children}
      {(error || aside) && (
        <div className="mt-1.5 flex items-start justify-between gap-3">
          {error ? (
            <p id={ids.errorId} className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : (
            <span />
          )}
          {aside}
        </div>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  className,
  ...rest
}: ShellProps & Omit<ComponentPropsWithRef<'input'>, 'className'>) {
  const ids = useFieldIds(error, hint);
  return (
    <Shell ids={ids} label={label} hint={hint} error={error} className={className ?? ''}>
      <input {...ids.control} {...rest} className={cx(CONTROL, 'min-h-11')} />
    </Shell>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  className,
  counter,
  ...rest
}: ShellProps & { counter?: string } & Omit<ComponentPropsWithRef<'textarea'>, 'className'>) {
  const ids = useFieldIds(error, hint);
  return (
    <Shell
      ids={ids}
      label={label}
      hint={hint}
      error={error}
      className={className ?? ''}
      aside={counter && <span className="shrink-0 text-xs text-ink-soft">{counter}</span>}
    >
      <textarea {...ids.control} {...rest} className={cx(CONTROL, 'py-2 leading-relaxed')} />
    </Shell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...rest
}: ShellProps & Omit<ComponentPropsWithRef<'select'>, 'className'>) {
  const ids = useFieldIds(error, hint);
  return (
    <Shell ids={ids} label={label} hint={hint} error={error} className={className ?? ''}>
      <select {...ids.control} {...rest} className={cx(CONTROL, 'min-h-11')}>
        {children}
      </select>
    </Shell>
  );
}
