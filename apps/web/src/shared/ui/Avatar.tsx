import { cx } from './cx';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Decorative: the person's name is always shown next to it. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex size-9 shrink-0 select-none items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
