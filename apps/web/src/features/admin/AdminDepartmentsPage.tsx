import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, type UseFormSetError } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../shared/api/client';
import type { Department } from '../../shared/api/types';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { plural } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { Dialog } from '../../shared/ui/Dialog';
import { TextAreaField, TextField } from '../../shared/ui/Field';
import { EmptyState, ErrorState, PageSpinner } from '../../shared/ui/states';
import { useToast } from '../../shared/ui/Toast';
import { DepartmentTechnologies } from './DepartmentTechnologies';
import { OtherTechnologies } from './OtherTechnologies';
import {
  AddButton,
  CELL,
  ClearFilters,
  DataTable,
  FilterSelect,
  ROW,
  RowActions,
  SearchField,
  Toolbar,
} from '../../shared/ui/DataTable';
import { Page, PageHeader } from '../../shared/ui/Page';
import {
  useAdminDepartments,
  useCreateDepartment,
  useDeletedDepartments,
  useDeleteDepartment,
  useDepartmentImpact,
  useRestoreDepartment,
  useUpdateDepartment,
} from './hooks';

const DESCRIPTION_MAX = 500;
const schema = z.object({
  name: z.string().trim().min(1, 'Enter a department name').max(100, 'Use 100 characters or fewer'),
  description: z.string().trim().max(DESCRIPTION_MAX, `Use ${DESCRIPTION_MAX} characters or fewer`),
});
type Values = z.infer<typeof schema>;

function setServerError(setError: UseFormSetError<Values>, e: unknown) {
  setError(e instanceof ApiError && e.code !== 'DEPARTMENT_EXISTS' ? 'description' : 'name', {
    message:
      e instanceof ApiError && e.code === 'DEPARTMENT_EXISTS'
        ? 'A department with this name already exists'
        : e instanceof ApiError
          ? e.message
          : "We couldn't save the department. Try again.",
  });
}

/** Blank description is stored as none. */
const clean = (v: Values) => ({ name: v.name, description: v.description || null });

function EditDialog({ department, onClose }: { department: Department; onClose: () => void }) {
  const update = useUpdateDepartment();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: department.name, description: department.description ?? '' },
  });
  return (
    <Dialog open onClose={onClose} title={`Edit ${department.name}`} size="lg">
      <form
        noValidate
        onSubmit={handleSubmit((v) => {
          const next = clean(v);
          const patch: Partial<typeof next> = {};
          if (next.name !== department.name) patch.name = next.name;
          if (next.description !== department.description) patch.description = next.description;
          if (Object.keys(patch).length === 0) return onClose();
          update.mutate(
            { id: department.id, patch },
            {
              onSuccess: () => {
                toast(`Saved ${next.name}`);
                onClose();
              },
              onError: (e) => setServerError(setError, e),
            },
          );
        })}
        className="space-y-4"
      >
        <TextField
          label="Name"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextAreaField
          label="Description"
          hint="Optional. Say what the department covers."
          rows={3}
          error={errors.description?.message}
          {...register('description')}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={update.isPending}>
            Save
          </Button>
        </div>
      </form>
      <DepartmentTechnologies departmentId={department.id} departmentName={department.name} />
    </Dialog>
  );
}

function AddDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateDepartment();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  });
  return (
    <Dialog open onClose={onClose} title="Add department">
      <form
        noValidate
        onSubmit={handleSubmit((v) =>
          create.mutate(clean(v), {
            onSuccess: (d) => {
              toast(`Added department ${d.name}`);
              onClose();
            },
            onError: (e) => setServerError(setError, e),
          }),
        )}
        className="space-y-4"
      >
        <TextField
          label="Name"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextAreaField
          label="Description"
          hint="Optional. Say what the department covers."
          rows={3}
          error={errors.description?.message}
          {...register('description')}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Add department
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeletedDepartments() {
  const deleted = useDeletedDepartments();
  const restore = useRestoreDepartment();
  const toast = useToast();
  if (!deleted.data || deleted.data.length === 0) return null;
  return (
    <section aria-labelledby="deleted-departments" className="mt-10">
      <h2 id="deleted-departments" className="font-serif text-xl font-semibold">
        Deleted departments
      </h2>
      <p className="mb-3 mt-1 text-sm text-ink-soft">
        Their questions are hidden from everyone. Restoring a department brings them back exactly as
        they were.
      </p>
      {restore.isError && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {(restore.error as Error).message}
        </p>
      )}
      <DataTable
        caption="Deleted departments"
        columns={['Department', 'Description', { label: 'Actions', srOnly: true }]}
      >
        {deleted.data.map((d) => (
          <tr key={d.id} className={ROW}>
            <th scope="row" className={`${CELL} text-left font-medium`}>
              {d.name}
            </th>
            <td className={`${CELL} text-ink-soft`}>{d.description ?? '—'}</td>
            <td className={CELL}>
              <RowActions>
                <Button
                  size="sm"
                  loading={restore.isPending && restore.variables === d.id}
                  aria-label={`Restore ${d.name}`}
                  onClick={() =>
                    restore.mutate(d.id, {
                      onSuccess: () => toast(`Restored department ${d.name}`),
                    })
                  }
                >
                  Restore
                </Button>
              </RowActions>
            </td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}

export function AdminDepartmentsPage() {
  useDocumentTitle('Departments');
  const departments = useAdminDepartments();
  const remove = useDeleteDepartment();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<'' | 'with' | 'none'>('');
  const impact = useDepartmentImpact(deleting?.id ?? null);

  const all = departments.data ?? [];
  const needle = search.trim().toLowerCase();
  const rows = all.filter(
    (d) =>
      (needle === '' ||
        d.name.toLowerCase().includes(needle) ||
        (d.description ?? '').toLowerCase().includes(needle)) &&
      (users === '' || (users === 'with' ? d.userCount > 0 : d.userCount === 0)),
  );
  const filtered = needle !== '' || users !== '';
  const clear = () => {
    setSearch('');
    setUsers('');
  };

  return (
    <Page>
      <PageHeader
        title="Departments"
        description="Questions can be restricted to a department. Grant users access on the Users page."
        actions={<AddButton onClick={() => setAdding(true)}>Add department</AddButton>}
      />

      <Toolbar
        summary={
          departments.isSuccess &&
          (filtered
            ? `${rows.length} of ${plural(all.length, 'department')}`
            : plural(all.length, 'department'))
        }
      >
        <SearchField
          label="Search departments"
          value={search}
          onChange={setSearch}
          placeholder="Search by name or description"
        />
        <FilterSelect label="Users" value={users} onChange={(v) => setUsers(v as typeof users)}>
          <option value="">Any number</option>
          <option value="with">With users</option>
          <option value="none">No users</option>
        </FilterSelect>
        {filtered && <ClearFilters onClick={clear} />}
      </Toolbar>

      {departments.isPending ? (
        <PageSpinner label="Loading departments" />
      ) : departments.isError ? (
        <ErrorState title="Couldn't load departments" onRetry={() => void departments.refetch()}>
          {departments.error.message}
        </ErrorState>
      ) : all.length === 0 ? (
        <EmptyState title="No departments yet">
          Use Add department to create the first one.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="No departments match" action={<ClearFilters onClick={clear} />}>
          Try a different name, or clear the filters.
        </EmptyState>
      ) : (
        <DataTable
          caption="Departments, their description and number of users"
          columns={['Department', 'Description', 'Users', { label: 'Actions', srOnly: true }]}
        >
          {rows.map((d) => (
            <tr key={d.id} className={ROW}>
              <th scope="row" className={`${CELL} text-left font-medium`}>
                {d.name}
              </th>
              <td className={`${CELL} text-ink-soft`}>{d.description ?? '—'}</td>
              <td className={CELL}>{d.userCount}</td>
              <td className={CELL}>
                <RowActions>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Edit ${d.name}`}
                    onClick={() => setEditing(d)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${d.name}`}
                    onClick={() => setDeleting(d)}
                  >
                    Delete
                  </Button>
                </RowActions>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {departments.data && <OtherTechnologies departments={departments.data} />}

      <DeletedDepartments />

      {adding && <AddDialog onClose={() => setAdding(false)} />}

      {editing && <EditDialog department={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete department'}
        confirmLabel="Delete department"
        loading={remove.isPending}
        error={remove.isError ? (remove.error as Error).message : undefined}
        onClose={() => {
          remove.reset();
          setDeleting(null);
        }}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast(`Deleted department ${deleting.name}`);
              setDeleting(null);
            },
          })
        }
      >
        <p>
          The department disappears from filters, forms and grants.{' '}
          {impact.data ? (
            <>
              Its {plural(impact.data.questions, 'question')}
              {impact.data.pending > 0 && ` (${impact.data.pending} awaiting review)`} will be
              hidden from everyone, and {plural(impact.data.users, 'user')} lose access.
              {impact.data.technologies > 0 &&
                ` ${plural(impact.data.technologies, 'technology', 'technologies')} used only by this department will be archived.`}
            </>
          ) : (
            'Its questions will be hidden from everyone.'
          )}{' '}
          Nothing is erased: you can restore it later from this page.
        </p>
      </ConfirmDialog>
    </Page>
  );
}
