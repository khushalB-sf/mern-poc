import { useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { plural } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import {
  AddButton,
  CELL,
  ClearFilters,
  DataTable,
  FilterSelect,
  ROW,
  RowActions,
  SearchField,
  StatusBadge,
  Toolbar,
} from '../../shared/ui/DataTable';
import { Dialog } from '../../shared/ui/Dialog';
import { SelectField, TextField } from '../../shared/ui/Field';
import { Page, PageHeader } from '../../shared/ui/Page';
import { EmptyState, ErrorState, PageSpinner } from '../../shared/ui/states';
import { useToast } from '../../shared/ui/Toast';
import type { ManagedTag, TagList } from './api';
import { useAddTagToList, useRenameListTag, useSetTagArchived, useTagCategories } from './hooks';

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

type Row = ManagedTag & { list: string; slug: string };
type Status = 'active' | 'archived' | 'all';

function AddDialog({
  lists,
  initial,
  onClose,
}: {
  lists: TagList[];
  initial: string;
  onClose: () => void;
}) {
  const add = useAddTagToList();
  const toast = useToast();
  const [slug, setSlug] = useState(initial || lists[0]!.slug);
  const [label, setLabel] = useState('');
  return (
    <Dialog open onClose={onClose} title="Add tag">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          add.mutate(
            { slug, label },
            {
              onSuccess: (t) => {
                toast(`Added ${t.label}`);
                onClose();
              },
            },
          );
        }}
        className="space-y-4"
      >
        <SelectField label="List" value={slug} onChange={(e) => setSlug(e.target.value)}>
          {lists.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Name"
          value={label}
          maxLength={50}
          autoComplete="off"
          onChange={(e) => setLabel(e.target.value)}
          error={add.isError ? message(add.error) : undefined}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={add.isPending}>
            Add tag
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RenameDialog({ tag, onClose }: { tag: Row; onClose: () => void }) {
  const rename = useRenameListTag();
  const toast = useToast();
  const [label, setLabel] = useState(tag.label);
  return (
    <Dialog open onClose={onClose} title={`Rename ${tag.label}`}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim() === tag.label) return onClose();
          rename.mutate(
            { id: tag.id, label },
            {
              onSuccess: () => {
                toast(`Renamed to ${label.trim()}`);
                onClose();
              },
            },
          );
        }}
        className="space-y-4"
      >
        <TextField
          label="Name"
          hint="Questions that already have this tag keep it under the new name."
          value={label}
          maxLength={50}
          autoComplete="off"
          onChange={(e) => setLabel(e.target.value)}
          error={rename.isError ? message(rename.error) : undefined}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={rename.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AdminTagsPage() {
  useDocumentTitle('Tags');
  const lists = useTagCategories();
  const archive = useSetTagArchived();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<Row | null>(null);
  const [search, setSearch] = useState('');
  const [list, setList] = useState('');
  const [status, setStatus] = useState<Status>('active');

  const all: Row[] =
    lists.data?.flatMap((l) => l.tags.map((t) => ({ ...t, list: l.name, slug: l.slug }))) ?? [];
  const needle = search.trim().toLowerCase();
  const rows = all
    .filter(
      (t) =>
        (needle === '' || t.label.toLowerCase().includes(needle)) &&
        (list === '' || t.slug === list) &&
        (status === 'all' || (status === 'archived') === t.archived),
    )
    .sort((a, b) => a.list.localeCompare(b.list) || a.label.localeCompare(b.label));
  const filtered = needle !== '' || list !== '' || status !== 'active';
  const clear = () => {
    setSearch('');
    setList('');
    setStatus('active');
  };

  return (
    <Page>
      <PageHeader
        title="Tags"
        description="The lists authors tag questions with, besides technology (which each department manages). Archiving hides a tag from new questions and filters; questions that already have it keep it."
        actions={
          <AddButton
            disabled={!lists.data || lists.data.length === 0}
            onClick={() => setAdding(true)}
          >
            Add tag
          </AddButton>
        }
      />

      <Toolbar summary={lists.isSuccess && `${rows.length} of ${plural(all.length, 'tag')}`}>
        <SearchField
          label="Search tags"
          value={search}
          onChange={setSearch}
          placeholder="Search by name"
        />
        <FilterSelect label="List" value={list} onChange={setList}>
          <option value="">All lists</option>
          {lists.data?.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Status" value={status} onChange={(v) => setStatus(v as Status)}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </FilterSelect>
        {filtered && <ClearFilters onClick={clear} />}
      </Toolbar>

      {archive.isError && (
        <p role="alert" className="mb-3 text-sm font-medium text-danger">
          {message(archive.error)}
        </p>
      )}

      {lists.isPending ? (
        <PageSpinner label="Loading tags" />
      ) : lists.isError ? (
        <ErrorState title="Couldn't load tags" onRetry={() => void lists.refetch()}>
          {lists.error.message}
        </ErrorState>
      ) : lists.data.length === 0 ? (
        <EmptyState title="No lists">There is nothing to manage here.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          title={filtered ? 'No tags match' : 'No tags yet'}
          action={filtered ? <ClearFilters onClick={clear} /> : undefined}
        >
          {filtered
            ? 'Try a different name, list or status.'
            : 'Use Add tag to create the first one.'}
        </EmptyState>
      ) : (
        <DataTable
          caption="Tags, their list, usage and status"
          columns={['Tag', 'List', 'Questions', 'Status', { label: 'Actions', srOnly: true }]}
        >
          {rows.map((t) => (
            <tr key={t.id} className={ROW}>
              <th scope="row" className={`${CELL} text-left font-medium`}>
                {t.label}
              </th>
              <td className={`${CELL} text-ink-soft`}>{t.list}</td>
              <td className={CELL}>{t.questionCount.toLocaleString()}</td>
              <td className={CELL}>
                {t.archived ? (
                  <StatusBadge tone="muted">Archived</StatusBadge>
                ) : (
                  <StatusBadge tone="ok">Active</StatusBadge>
                )}
              </td>
              <td className={CELL}>
                <RowActions>
                  {t.archived ? (
                    <Button
                      size="sm"
                      aria-label={`Restore ${t.label}`}
                      loading={archive.isPending && archive.variables?.id === t.id}
                      onClick={() =>
                        archive.mutate(
                          { id: t.id, archived: false },
                          { onSuccess: () => toast(`Restored ${t.label}`) },
                        )
                      }
                    >
                      Restore
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Rename ${t.label}`}
                        onClick={() => setRenaming(t)}
                      >
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Archive ${t.label}`}
                        loading={archive.isPending && archive.variables?.id === t.id}
                        onClick={() =>
                          archive.mutate(
                            { id: t.id, archived: true },
                            { onSuccess: () => toast(`Archived ${t.label}`) },
                          )
                        }
                      >
                        Archive
                      </Button>
                    </>
                  )}
                </RowActions>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {adding && lists.data && (
        <AddDialog lists={lists.data} initial={list} onClose={() => setAdding(false)} />
      )}
      {renaming && <RenameDialog tag={renaming} onClose={() => setRenaming(null)} />}
    </Page>
  );
}
