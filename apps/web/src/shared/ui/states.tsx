import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Button } from './Button';
import { cx } from './cx';

function Panel({
  icon,
  tone,
  title,
  children,
  action,
}: {
  icon: IconName;
  tone: 'neutral' | 'danger';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className={cx(
          'mx-auto mb-4 flex size-12 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-danger-bg text-danger' : 'bg-accent-soft text-accent',
        )}
      >
        <Icon name={icon} className="size-6" />
      </span>
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      {children && <p className="mx-auto mt-2 max-w-md text-ink-soft">{children}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

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
    <Panel icon="inbox" tone="neutral" title={title} action={action}>
      {children}
    </Panel>
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
    <div role="alert">
      <Panel
        icon="alert"
        tone="danger"
        title={title}
        action={onRetry && <Button onClick={onRetry}>Try again</Button>}
      >
        {children}
      </Panel>
    </div>
  );
}

/** Placeholder cards shaped like real results, so the page does not jump when data arrives. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="animate-pulse space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <div className="h-5 w-4/5 rounded bg-line" />
          <div className="mt-4 flex gap-2">
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
