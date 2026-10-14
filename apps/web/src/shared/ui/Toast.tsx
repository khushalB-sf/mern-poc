import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { cx } from './cx';

type Tone = 'success' | 'error';
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Tone = 'success') => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, tone }]);
    // Errors stay longer: they usually need to be read, not glanced at.
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      tone === 'error' ? 8000 : 4000,
    );
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <p
            key={t.id}
            className={cx(
              'pointer-events-auto flex max-w-md items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium',
              t.tone === 'success'
                ? 'border-line bg-surface text-ink'
                : 'border-danger bg-danger-bg text-danger',
            )}
          >
            <Icon name={t.tone === 'success' ? 'check' : 'alert'} className="shrink-0" />
            {t.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
