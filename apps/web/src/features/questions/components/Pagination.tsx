import { Icon } from '../../../shared/ui/Icon';
import { Button } from '../../../shared/ui/Button';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPage }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0 || pages === 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-t border-line pt-4"
    >
      <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <Icon name="chevronLeft" />
        Previous
      </Button>
      <p className="text-sm text-ink-soft">
        {from.toLocaleString()} to {to.toLocaleString()} of {total.toLocaleString()}
      </p>
      <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
        <Icon name="chevronRight" />
      </Button>
    </nav>
  );
}
