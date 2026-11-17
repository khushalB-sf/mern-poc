import { useId, useState } from 'react';
import type { Department, DepartmentTechnology } from '../../shared/api/types';
import { Button } from '../../shared/ui/Button';
import { SelectField } from '../../shared/ui/Field';
import { useToast } from '../../shared/ui/Toast';
import { RenameForm, Row } from './DepartmentTechnologies';
import {
  useAddDepartmentTechnology,
  useOtherTechnologies,
  useSetOtherTechnologyArchived,
} from './hooks';

function AssignControl({
  tech,
  departments,
}: {
  tech: DepartmentTechnology;
  departments: Department[];
}) {
  const add = useAddDepartmentTechnology();
  const toast = useToast();
  const [departmentId, setDepartmentId] = useState('');
  return (
    <div className="flex items-end gap-1">
      <SelectField
        label={`Department for ${tech.label}`}
        value={departmentId}
        onChange={(e) => setDepartmentId(e.target.value)}
        className="w-40 [&>label]:sr-only"
      >
        <option value="">Choose…</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </SelectField>
      <Button
        size="sm"
        disabled={!departmentId}
        loading={add.isPending}
        aria-label={`Add ${tech.label} to department`}
        onClick={() =>
          add.mutate(
            { id: departmentId, label: tech.label },
            {
              onSuccess: () =>
                toast(
                  `Added ${tech.label} to ${departments.find((d) => d.id === departmentId)?.name}`,
                ),
            },
          )
        }
      >
        Add
      </Button>
    </div>
  );
}

/** Technologies no department uses. Shown only when there are any. */
export function OtherTechnologies({ departments }: { departments: Department[] }) {
  const other = useOtherTechnologies();
  const setArchived = useSetOtherTechnologyArchived();
  const toast = useToast();
  const headingId = useId();
  const [renaming, setRenaming] = useState<string | null>(null);

  if (!other.data || other.data.active.length + other.data.archived.length === 0) return null;
  const { active, archived } = other.data;

  return (
    <section aria-labelledby={headingId} className="mt-10">
      <h2 id={headingId} className="font-serif text-xl font-semibold">
        Other technologies
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        No department uses these. Everyone sees them under &ldquo;Other&rdquo; in filters and on
        questions with no department. Add one to a department to move it there.
      </p>
      {setArchived.isError && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {(setArchived.error as Error).message}
        </p>
      )}

      {active.length > 0 && (
        <ul
          aria-label="Other technologies"
          className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface shadow-sm"
        >
          {active.map((t) =>
            renaming === t.id ? (
              <RenameForm key={t.id} tech={t} onDone={() => setRenaming(null)} />
            ) : (
              <Row key={t.id} tech={t}>
                <AssignControl tech={t} departments={departments} />
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
                  loading={setArchived.isPending && setArchived.variables?.id === t.id}
                  onClick={() =>
                    setArchived.mutate(
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
          <ul
            aria-label="Archived other technologies"
            className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface shadow-sm"
          >
            {archived.map((t) => (
              <Row key={t.id} tech={t}>
                <Button
                  size="sm"
                  aria-label={`Restore ${t.label}`}
                  loading={setArchived.isPending && setArchived.variables?.id === t.id}
                  onClick={() =>
                    setArchived.mutate(
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
