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
import { Page, PageHeader } from '../../shared/ui/Page';
import {
  useAdminDepartments,
  useCreateDepartment,
  useDeleteDepartment,
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
    <Dialog open onClose={onClose} title={`Edit ${department.name}`}>
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
    </Dialog>
  );
}

export function AdminDepartmentsPage() {
  useDocumentTitle('Departments');
  const departments = useAdminDepartments();
  const create = useCreateDepartment();
  const remove = useDeleteDepartment();
  const toast = useToast();
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  });

  const onSubmit = (v: Values) =>
    create.mutate(clean(v), {
      onSuccess: (d) => {
        toast(`Added department ${d.name}`);
        reset();
      },
      onError: (e) => setServerError(setError, e),
    });

  return (
    <Page>
      <PageHeader
        title="Departments"
        description="Questions can be restricted to a department. Grant users access on the Users page."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <form
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4 rounded-xl border border-line bg-surface p-5 shadow-sm"
        >
          <TextField
            label="New department"
            autoComplete="off"
            error={errors.name?.message}
            {...register('name')}
          />
          <TextAreaField
            label="Description (optional)"
            rows={2}
            error={errors.description?.message}
            {...register('description')}
          />
          <Button type="submit" variant="primary" loading={create.isPending}>
            Add department
          </Button>
        </form>

        <div className="min-w-0">
          {departments.isPending ? (
            <PageSpinner label="Loading departments" />
          ) : departments.isError ? (
            <ErrorState
              title="Couldn't load departments"
              onRetry={() => void departments.refetch()}
            >
              {departments.error.message}
            </ErrorState>
          ) : departments.data.length === 0 ? (
            <EmptyState title="No departments yet">Add the first one above.</EmptyState>
          ) : (
            <ul
              aria-label="Departments"
              className="divide-y divide-line rounded-xl border border-line bg-surface shadow-sm"
            >
              {departments.data.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{d.name}</p>
                    {d.description && <p className="text-sm text-ink-soft">{d.description}</p>}
                    <p className="text-sm text-ink-soft">{plural(d.userCount, 'user')}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
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
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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
          The department disappears from filters, forms and grants, and its questions will be hidden
          with it. Nothing is erased, so the history is kept.
        </p>
      </ConfirmDialog>
    </Page>
  );
}
