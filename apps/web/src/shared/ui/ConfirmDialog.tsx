import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  title: string;
  /** What will happen, in plain words. */
  children: ReactNode;
  confirmLabel: string;
  loading?: boolean;
  /** Shown above the buttons when the action failed. */
  error?: string | undefined;
  onConfirm: () => void;
  onClose: () => void;
}

/** Destructive-action confirmation. Cancel is the safe default and comes first. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  loading = false,
  error,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="text-sm">{children}</div>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
