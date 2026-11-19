import { useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { plural } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { TextField } from '../../shared/ui/Field';
import { Page, PageHeader } from '../../shared/ui/Page';
import { EmptyState, ErrorState, PageSpinner } from '../../shared/ui/states';
import { useToast } from '../../shared/ui/Toast';
import type { ManagedTag, TagList } from './api';
import { useAddTagToList, useRenameListTag, useSetTagArchived, useTagCategories } from './hooks';

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

function Row({ tag, children }: { tag: ManagedTag; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="font-medium">{tag.label}</p>
        <p className="text-xs text-ink-soft">{plural(tag.questionCount, 'question')}</p>
      </div>
      <div className="flex shrink-0 gap-1">{children}</div>
    </li>
  );
}

function RenameForm({ tag, onDone }: { tag: ManagedTag; onDone: () => void }) {
  const rename = useRenameListTag();
  const toast = useToast();
  const [label, setLabel] = useState(tag.label);
  return (
    <li className="px-3 py-2.5">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim() === tag.label) return onDone();
          rename.mutate(
            { id: tag.id, label },
            {
              onSuccess: () => {
                toast(`Renamed to ${label.trim()}`);
                onDone();
              },
            },
          );
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="min-w-48 flex-1">
          <TextField
            label={`New name for ${tag.label}`}
            value={label}
            maxLength={50}
            autoComplete="off"
            onChange={(e) => setLabel(e.target.value)}
            error={rename.isError ? message(rename.error) : undefined}
          />
        </div>
        <Button type="submit" variant="primary" loading={rename.isPending}>
          Save
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </form>
    </li>
  );
}

function ListSection({ list }: { list: TagList }) {
  const add = useAddTagToList();
  const archive = useSetTagArchived();
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const active = list.tags.filter((t) => !t.archived);
  const archived = list.tags.filter((t) => t.archived);

  return (
    <section
      aria-labelledby={`list-${list.slug}`}
      className="rounded-xl border border-line bg-surface p-5 shadow-sm"
    >
      <h2 id={`list-${list.slug}`} className="font-serif text-xl font-semibold">
        {list.name}
      </h2>
      {archive.isError && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {message(archive.error)}
        </p>
      )}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          add.mutate(
            { slug: list.slug, label },
            {
              onSuccess: (t) => {
                toast(`Added ${t.label}`);
                setLabel('');
              },
            },
          );
        }}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <div className="min-w-48 flex-1">
          <TextField
            label={`Add to ${list.name}`}
            value={label}
            maxLength={50}
            autoComplete="off"
            onChange={(e) => setLabel(e.target.value)}
            error={add.isError ? message(add.error) : undefined}
          />
        </div>
        <Button type="submit" loading={add.isPending} aria-label={`Add to ${list.name} list`}>
          Add
        </Button>
      </form>

      {active.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">Nothing here yet.</p>
      ) : (
        <ul
          aria-label={list.name}
          className="mt-4 divide-y divide-line rounded-xl border border-line"
        >
          {active.map((t) =>
            renaming === t.id ? (
              <RenameForm key={t.id} tag={t} onDone={() => setRenaming(null)} />
            ) : (
              <Row key={t.id} tag={t}>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Rename ${t.label}`}
                  onClick={() => setRenaming(t.id)}
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
              </Row>
            ),
          )}
        </ul>
      )}

      {archived.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold">Archived</h3>
          <p className="text-sm text-ink-soft">
            Hidden from filters and the question form. Questions that already have them keep them.
          </p>
          <ul
            aria-label={`Archived ${list.name}`}
            className="mt-2 divide-y divide-line rounded-xl border border-line"
          >
            {archived.map((t) => (
              <Row key={t.id} tag={t}>
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
              </Row>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function AdminTagsPage() {
  useDocumentTitle('Tags');
  const lists = useTagCategories();
  return (
    <Page width="lg">
      <PageHeader
        title="Tags"
        description="The lists authors tag questions with, besides technology (which each department manages). Archiving hides a tag from new questions and filters; questions that already have it keep it."
      />
      {lists.isPending ? (
        <PageSpinner label="Loading tags" />
      ) : lists.isError ? (
        <ErrorState title="Couldn't load tags" onRetry={() => void lists.refetch()}>
          {lists.error.message}
        </ErrorState>
      ) : lists.data.length === 0 ? (
        <EmptyState title="No lists">There is nothing to manage here.</EmptyState>
      ) : (
        <div className="space-y-6">
          {lists.data.map((l) => (
            <ListSection key={l.slug} list={l} />
          ))}
        </div>
      )}
    </Page>
  );
}
