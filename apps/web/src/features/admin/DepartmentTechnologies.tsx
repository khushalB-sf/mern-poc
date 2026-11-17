import { useId, useState } from 'react';
import type { DepartmentTechnology } from '../../shared/api/types';
import { plural } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { TextField } from '../../shared/ui/Field';
import { ErrorState } from '../../shared/ui/states';
import { useToast } from '../../shared/ui/Toast';
import {
  useAddDepartmentTechnology,
  useDepartmentTechnologies,
  useRemoveDepartmentTechnology,
  useRenameTechnology,
  useRestoreDepartmentTechnology,
} from './hooks';

export function Row({
  tech,
  departmentName,
  children,
}: {
  tech: DepartmentTechnology;
  departmentName?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="font-medium">{tech.label}</p>
        <p className="text-xs text-ink-soft">
          {plural(tech.questionCount, 'question')}
          {tech.shared && !tech.archived && ` · also used by other departments`}
          {tech.archived && (departmentName ? ` · archived from ${departmentName}` : ' · archived')}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">{children}</div>
    </li>
  );
}

export function RenameForm({ tech, onDone }: { tech: DepartmentTechnology; onDone: () => void }) {
  const rename = useRenameTechnology();
  const toast = useToast();
  const [label, setLabel] = useState(tech.label);
  return (
    <li className="px-3 py-2.5">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim() === tech.label) return onDone();
          rename.mutate(
            { tagId: tech.id, label },
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
            label={`New name for ${tech.label}`}
            value={label}
            maxLength={50}
            autoComplete="off"
            onChange={(e) => setLabel(e.target.value)}
            error={rename.isError ? (rename.error as Error).message : undefined}
            hint={tech.shared ? 'Other departments that use it see the new name too.' : undefined}
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

/** The technologies a department offers on its questions. Every action applies immediately. */
export function DepartmentTechnologies({
  departmentId,
  departmentName,
}: {
  departmentId: string;
  departmentName: string;
}) {
  const techs = useDepartmentTechnologies(departmentId);
  const add = useAddDepartmentTechnology();
  const remove = useRemoveDepartmentTechnology();
  const restore = useRestoreDepartmentTechnology();
  const toast = useToast();
  const listId = useId();
  const [label, setLabel] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const failure = [add, remove, restore].find((m) => m.isError)?.error as Error | undefined;

  if (techs.isPending) return <p className="text-sm text-ink-soft">Loading technologies…</p>;
  if (techs.isError) {
    return (
      <ErrorState title="Couldn't load technologies" onRetry={() => void techs.refetch()}>
        {techs.error.message}
      </ErrorState>
    );
  }
  const { active, archived, available } = techs.data;

  return (
    <section aria-labelledby={`${listId}-h`} className="mt-6 border-t border-line pt-5">
      <h3 id={`${listId}-h`} className="font-serif text-lg font-semibold">
        Technologies
      </h3>
      <p className="mt-1 text-sm text-ink-soft">
        Questions for {departmentName} can be tagged with these. Changes here apply straight away
        and never change existing questions.
      </p>

      {failure && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {failure.message}
        </p>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          add.mutate(
            { id: departmentId, label },
            {
              onSuccess: (t) => {
                toast(t.created ? `Added ${t.label}` : `Added existing ${t.label}`);
                setLabel('');
              },
            },
          );
        }}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <div className="min-w-48 flex-1">
          <TextField
            label="Add a technology"
            hint="Pick an existing one to share it, or type a new name."
            list={`${listId}-options`}
            value={label}
            maxLength={50}
            autoComplete="off"
            onChange={(e) => setLabel(e.target.value)}
          />
          <datalist id={`${listId}-options`}>
            {available.map((a) => (
              <option key={a.id} value={a.label} />
            ))}
          </datalist>
        </div>
        <Button type="submit" loading={add.isPending}>
          Add
        </Button>
      </form>

      {active.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">No technologies yet.</p>
      ) : (
        <ul
          aria-label={`Technologies of ${departmentName}`}
          className="mt-4 divide-y divide-line rounded-xl border border-line"
        >
          {active.map((t) =>
            renaming === t.id ? (
              <RenameForm key={t.id} tech={t} onDone={() => setRenaming(null)} />
            ) : (
              <Row key={t.id} tech={t} departmentName={departmentName}>
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
                  aria-label={`Remove ${t.label}`}
                  loading={remove.isPending && remove.variables?.tagId === t.id}
                  onClick={() =>
                    remove.mutate(
                      { id: departmentId, tagId: t.id },
                      {
                        onSuccess: () =>
                          toast(
                            t.shared
                              ? `Removed ${t.label} from ${departmentName}`
                              : `Archived ${t.label}`,
                          ),
                      },
                    )
                  }
                >
                  Remove
                </Button>
              </Row>
            ),
          )}
        </ul>
      )}

      {archived.length > 0 && (
        <>
          <h4 className="mt-5 text-sm font-semibold">Archived</h4>
          <p className="text-sm text-ink-soft">
            Hidden from filters and the question form. Questions that already have them keep them.
          </p>
          <ul
            aria-label={`Archived technologies of ${departmentName}`}
            className="mt-2 divide-y divide-line rounded-xl border border-line"
          >
            {archived.map((t) => (
              <Row key={t.id} tech={t} departmentName={departmentName}>
                <Button
                  size="sm"
                  aria-label={`Restore ${t.label}`}
                  loading={restore.isPending && restore.variables?.tagId === t.id}
                  onClick={() =>
                    restore.mutate(
                      { id: departmentId, tagId: t.id },
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
