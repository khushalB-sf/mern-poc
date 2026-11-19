import { Icon } from '../../../shared/ui/Icon';
import { Button } from '../../../shared/ui/Button';
import { MAX_OFFSET } from '../filters';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPage }: Props) {
  // Only what the API will serve: the offset is capped, so a huge result set ends at a last reachable page.
  const reachable = Math.min(total, MAX_OFFSET + pageSize);
  const pages = Math.max(1, Math.ceil(reachable / pageSize));
  if (total === 0 || pages === 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, reachable);
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 shadow-sm"
    >
      <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <Icon name="chevronLeft" />
        Previous
      </Button>
      <p className="text-sm text-ink-soft">
        {from.toLocaleString()} to {to.toLocaleString()} of {total.toLocaleString()}
        {reachable < total && (
          <span className="block text-xs">Narrow your search to see the rest.</span>
        )}
      </p>
      <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
        <Icon name="chevronRight" />
      </Button>
    </nav>
  );
}
