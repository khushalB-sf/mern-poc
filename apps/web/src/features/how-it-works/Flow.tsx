import type { ReactNode } from 'react';
import { Icon } from '../../shared/ui/Icon';

export interface FlowStep {
  title: string;
  detail: ReactNode;
  /** What the caller gets if this step rejects the request, e.g. "401 UNAUTHENTICATED". */
  fail?: string;
}

/** A vertical chain of numbered step cards, so a flow stays readable at phone width. */
export function Flow({ steps, label }: { steps: FlowStep[]; label: string }) {
  return (
    <ol aria-label={label}>
      {steps.map((s, i) => (
        <li key={s.title}>
          <div className="flex gap-3 rounded-md border border-line bg-surface p-3">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.title}</p>
              <p className="mt-0.5 text-sm text-ink-soft">{s.detail}</p>
              {s.fail && (
                <p className="mt-1.5">
                  <span className="inline-block rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">
                    <span className="sr-only">Rejects with </span>
                    {s.fail}
                  </span>
                </p>
              )}
            </div>
          </div>
          {i < steps.length - 1 && (
            <div aria-hidden="true" className="flex justify-center py-1 text-control">
              <Icon name="chevronDown" />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-paper px-1 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}
