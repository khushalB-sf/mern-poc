import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import { cx } from './cx';

interface Props {
  label: string;
  /** Number of selected options (multi-select). */
  count?: number;
  /** Selected option text (single-select); shown after the label. */
  value?: string;
  /** Close after a choice, for single-select lists. */
  closeOnChange?: boolean;
  children: ReactNode;
}

/**
 * A filter dropdown built on native <details>: the summary is the button and keyboard toggle.
 * Added on top: close on outside click, on Escape (focus returns to the button) and when keyboard focus leaves.
 * Keyboard: ArrowDown on the button opens the list; Up/Down/Home/End move between options; typing letters
 * jumps to the option that starts with them. Space still toggles the focused option.
 */
export function Dropdown({ label, count = 0, value, closeOnChange = false, children }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const active = count > 0 || !!value;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const close = () => {
      el.open = false;
    };
    // A mouse press on non-focusable text inside the panel moves focus to <main>. That is not "tabbing
    // away", so focus changes that follow a pointer press inside the dropdown never close it.
    let pointerInside = false;
    const onPointerDown = (e: PointerEvent) => {
      pointerInside = el.contains(e.target as Node);
      if (el.open && !pointerInside) close();
    };
    const options = () => [
      ...(panelRef.current?.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), [tabindex="0"]',
      ) ?? []),
    ];
    const textOf = (o: HTMLElement) =>
      (o.closest('label')?.textContent ?? o.getAttribute('aria-label') ?? o.textContent ?? '')
        .trim()
        .toLowerCase();
    let typed = '';
    let typedAt = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      pointerInside = false;
      if (e.key === 'Escape' && el.open) {
        close();
        el.querySelector('summary')?.focus();
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const summary = el.querySelector('summary');
      const list = options();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const go = (o: HTMLElement | undefined) => {
        e.preventDefault();
        o?.focus();
      };
      if (e.target === summary) {
        if (e.key === 'ArrowDown') {
          el.open = true;
          go(list[0]);
        }
        return;
      }
      if (at < 0) return; // focus is on something that is not an option
      if (e.key === 'ArrowDown') go(list[Math.min(at + 1, list.length - 1)]);
      else if (e.key === 'ArrowUp') {
        if (at === 0) go(summary as HTMLElement);
        else go(list[at - 1]);
      } else if (e.key === 'Home') go(list[0]);
      else if (e.key === 'End') go(list[list.length - 1]);
      else if (e.key.length === 1 && e.key !== ' ') {
        // Typeahead: letters typed in quick succession form one prefix.
        const now = Date.now();
        typed = now - typedAt > 700 ? e.key.toLowerCase() : typed + e.key.toLowerCase();
        typedAt = now;
        // A repeated single letter cycles through the options that start with it.
        const from = typed.length === 1 ? at + 1 : at;
        const ordered = [...list.slice(from), ...list.slice(0, from)];
        go(ordered.find((o) => textOf(o).startsWith(typed)));
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!pointerInside && e.relatedTarget && !el.contains(e.relatedTarget as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return (
    // Static on phones so the panel spans the whole filter bar; anchored to its button from `sm` up.
    <details ref={ref} className="group sm:relative">
      <summary
        className={cx(
          'inline-flex min-h-10 cursor-pointer select-none list-none items-center gap-2 rounded-lg border px-3 text-sm font-medium shadow-sm transition-colors [&::-webkit-details-marker]:hidden',
          active
            ? 'border-accent/40 bg-accent-soft text-accent'
            : 'border-line bg-surface text-ink hover:border-control',
        )}
      >
        <span>
          {label}
          {value && <span className="font-normal">{`: ${value}`}</span>}
        </span>
        {count > 0 && (
          <span className="rounded-full bg-accent px-1.5 text-xs text-accent-ink">
            {count}
            <span className="sr-only"> selected</span>
          </span>
        )}
        <Icon name="chevronDown" className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div
        ref={panelRef}
        onChange={closeOnChange ? () => ref.current && (ref.current.open = false) : undefined}
        className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-lg sm:inset-x-auto sm:left-0 sm:w-64"
      >
        {children}
      </div>
    </details>
  );
}
