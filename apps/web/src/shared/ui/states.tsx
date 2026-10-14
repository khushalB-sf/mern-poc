import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from './Button';

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="py-14 text-center">
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      {children && <p className="mx-auto mt-2 max-w-md text-ink-soft">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  children,
  onRetry,
}: {
  title?: string;
  children?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="py-14 text-center">
      <Icon name="alert" className="mx-auto mb-3 size-7 text-danger" />
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      {children && <p className="mx-auto mt-2 max-w-md text-ink-soft">{children}</p>}
      {onRetry && (
        <div className="mt-5 flex justify-center">
          <Button onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}

/** Placeholder rows shaped like real results, so the page does not jump when data arrives. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="animate-pulse divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="py-5">
          <div className="h-5 w-4/5 rounded bg-line" />
          <div className="mt-3 flex gap-2">
            <div className="h-5 w-16 rounded-full bg-line" />
            <div className="h-5 w-12 rounded-full bg-line" />
            <div className="h-5 w-20 rounded-full bg-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-[50dvh] items-center justify-center gap-3 text-ink-soft"
    >
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      {label}
    </div>
  );
}
