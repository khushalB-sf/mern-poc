import type { ReactNode, Ref } from 'react';
import { cx } from './cx';

/**
 * The one page container: every screen has the same width, gutters and top spacing, so the title sits
 * in the same place on every page. Content that reads better narrow (forms, a single question) goes in a
 * <Column> inside it rather than narrowing the page.
 */
export function Page({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8', className)}>
      {children}
    </div>
  );
}

/** A readable column under the page header: left-aligned, or centred for a lone message. */
export function Column({
  center = false,
  className,
  children,
}: {
  center?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx(center ? 'mx-auto max-w-2xl' : 'max-w-3xl', className)}>{children}</div>
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
        {description && <p className="mt-1.5 max-w-3xl text-ink-soft">{description}</p>}
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
