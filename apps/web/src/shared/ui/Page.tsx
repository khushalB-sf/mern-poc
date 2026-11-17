import type { ReactNode, Ref } from 'react';
import { cx } from './cx';

const WIDTH = { md: 'max-w-3xl', lg: 'max-w-5xl', xl: 'max-w-6xl' } as const;

/** The one page container, so every screen shares the same gutters and rhythm. */
export function Page({
  width = 'xl',
  className,
  children,
}: {
  width?: keyof typeof WIDTH;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx('mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8', WIDTH[width], className)}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  headingRef,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** The list page moves focus here after paging. */
  headingRef?: Ref<HTMLHeadingElement>;
  className?: string;
}) {
  return (
    <header
      className={cx('mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}
    >
      <div className="min-w-0">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-serif text-3xl font-semibold leading-tight outline-none"
        >
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Raised surface used for panels, tables and form sections. */
export function Card({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & React.ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      className={cx('rounded-xl border border-line bg-surface shadow-sm', className)}
      {...rest}
    >
      {children}
    </section>
  );
}
