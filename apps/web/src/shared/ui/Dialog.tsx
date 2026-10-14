import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import { cx } from './cx';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** `sheet` slides in from the bottom on small screens (used for mobile filters). */
  size?: 'md' | 'lg';
}

/**
 * Native <dialog>: the browser provides the focus trap, Escape to close, inert background and
 * returning focus to the opener, so none of that is hand-rolled here.
 */
export function Dialog({ open, onClose, title, children, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-lg border border-line bg-surface p-0 text-ink',
        size === 'lg' ? 'max-w-3xl' : 'max-w-lg',
        'max-h-[calc(100dvh-2rem)] overflow-y-auto',
      )}
    >
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-serif text-xl font-semibold leading-snug">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-2 rounded-md p-2 text-ink-soft hover:bg-accent-soft hover:text-ink"
          >
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
