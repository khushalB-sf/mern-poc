import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../shared/api/client';
import type { AdminUser, Department, Role } from '../../shared/api/types';
import { ROLE_LABEL } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { SelectField, TextField } from '../../shared/ui/Field';
import { useToast } from '../../shared/ui/Toast';
import type { UserPatch } from './api';
import {
  useAdminDepartments,
  useCreateResetLink,
  useCreateUser,
  useResetMfa,
  useSetUserDepartments,
  useUpdateUser,
} from './hooks';

const ROLES = Object.keys(ROLE_LABEL) as Role[];

const base = {
  name: z.string().trim().min(1, 'Enter a name').max(100, 'Use 100 characters or fewer'),
  email: z
    .string()
    .trim()
    .min(1, 'Enter an email address')
    .pipe(z.email('Enter a valid email address').max(254)),
  role: z.enum(['USER', 'AUTHOR', 'REVIEWER', 'ADMIN']),
  active: z.boolean(),
};
const PASSWORD_RULE = 'Use at least 8 characters';
const createSchema = z.object({
  ...base,
  password: z.string().min(8, PASSWORD_RULE).max(200, 'Use 200 characters or fewer'),
});
// Editing: blank keeps the current password.
const editSchema = z.object({
  ...base,
  password: z
    .string()
    .max(200, 'Use 200 characters or fewer')
    .refine((p) => p === '' || p.length >= 8, PASSWORD_RULE),
});
type Values = z.infer<typeof createSchema>;
type Field = keyof Values;
const FIELDS: Field[] = ['name', 'email', 'password', 'role', 'active'];

/** One dialog for both adding a user and editing one. Mount it only while open (state resets on mount). */
export function UserDialog({
  user,
  isSelf,
  onClose,
}: {
  /** null = add a user. */
  user: AdminUser | null;
  isSelf: boolean;
  onClose: () => void;
}) {
  const editing = user !== null;
  const departments = useAdminDepartments();
  const create = useCreateUser();
  const update = useUpdateUser();
  const setDepartments = useSetUserDepartments();
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>(user?.clients.map((c) => c.id) ?? []);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(editing ? editSchema : createSchema),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      password: '',
      role: user?.role ?? 'AUTHOR',
      active: user?.active ?? true,
    },
  });

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const explain = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'EMAIL_EXISTS') {
      setError('email', { message: 'Another user already has this email address' });
    } else if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') {
      const issues = (e.details.issues as { path: string; message: string }[] | undefined) ?? [];
      const fields = issues.filter((i) => FIELDS.includes(i.path as Field));
      for (const i of fields) setError(i.path as Field, { message: i.message });
      if (fields.length === 0) setFormError('Some details are not valid. Check the form.');
    } else {
      setFormError(e instanceof ApiError ? e.message : "We couldn't save. Try again.");
    }
  };

  const submit = async (v: Values) => {
    setFormError(undefined);
    try {
      if (!user) {
        const created = await create.mutateAsync({
          name: v.name,
          email: v.email,
          password: v.password,
          role: v.role,
          clientIds: picked,
        });
        toast(`Added ${created.name}`);
      } else {
        const patch: UserPatch = {};
        if (v.name !== user.name) patch.name = v.name;
        if (v.email !== user.email) patch.email = v.email;
        if (v.active !== user.active) patch.active = v.active;
        if (v.password) patch.password = v.password; // blank = keep
        const had = user.clients.map((c) => c.id);
        const grantsChanged = picked.length !== had.length || picked.some((c) => !had.includes(c));
        if (Object.keys(patch).length) await update.mutateAsync({ id: user.id, patch });
        if (grantsChanged) await setDepartments.mutateAsync({ id: user.id, clientIds: picked });
        toast(`Saved ${v.name}`);
      }
      onClose();
    } catch (e) {
      explain(e);
    }
  };

  return (
    <Dialog open onClose={onClose} title={editing ? `Edit ${user.name}` : 'Add a user'}>
      <form noValidate onSubmit={(e) => void handleSubmit(submit)(e)} className="space-y-4">
        {formError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {formError}
          </p>
        )}
        <TextField
          label="Name"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <div>
          <TextField
            label={editing ? 'New password' : 'Password'}
            hint={
              editing
                ? 'Leave blank to keep the current password. Setting one signs them out everywhere, and they must choose their own the next time they sign in.'
                : 'At least 8 characters.'
            }
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Show password
          </label>
        </div>
        {!editing && (
          <SelectField label="Role" error={errors.role?.message} {...register('role')}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </SelectField>
        )}
        {editing && (
          <div>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={isSelf}
                aria-describedby={isSelf ? 'self-active-hint' : undefined}
                className="size-4 accent-[var(--accent)]"
                {...register('active')}
              />
              Active (can sign in)
            </label>
            {isSelf && (
              <p id="self-active-hint" className="mt-1 text-xs text-ink-soft">
                You can't deactivate your own account.
              </p>
            )}
          </div>
        )}
        <DepartmentChecks departments={departments} picked={picked} onToggle={toggle} />
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {editing ? 'Save' : 'Add user'}
          </Button>
        </div>
      </form>
      {user && <ResetLink user={user} />}
      {user?.mfaEnabled && <ResetMfa user={user} />}
    </Dialog>
  );
}

/** For someone who cannot sign in: a one-time link the admin passes on. Shown once, never stored in plain. */
function ResetLink({ user }: { user: AdminUser }) {
  const create = useCreateResetLink();
  const toast = useToast();
  const [link, setLink] = useState<{ url: string; expiresAt: string }>();
  return (
    <section aria-labelledby="reset-link-h" className="mt-6 border-t border-line pt-4">
      <h3 id="reset-link-h" className="text-sm font-semibold">
        Password reset link
      </h3>
      <p className="mt-1 text-sm text-ink-soft">
        For someone who cannot sign in. Create a one-time link and send it to them yourself. A new
        link replaces an earlier one.
      </p>
      {create.isError && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {create.error instanceof ApiError ? create.error.message : "We couldn't create it."}
        </p>
      )}
      {link ? (
        <div className="mt-3 space-y-2">
          <TextField
            label="One-time reset link"
            readOnly
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            hint="Shown once: copy it now. It works once and is valid for 24 hours."
          />
          <Button
            size="sm"
            onClick={() =>
              void navigator.clipboard?.writeText(link.url).then(
                () => toast('Link copied'),
                () => toast('Select the link and copy it', 'error'),
              )
            }
          >
            Copy link
          </Button>
        </div>
      ) : (
        <Button
          className="mt-3"
          size="sm"
          loading={create.isPending}
          onClick={() =>
            create.mutate(user.id, {
              onSuccess: (r) =>
                setLink({
                  url: `${window.location.origin}/reset-password#token=${r.token}`,
                  expiresAt: r.expiresAt,
                }),
            })
          }
        >
          Create a reset link
        </Button>
      )}
    </section>
  );
}

/** Someone lost their phone: clear their two-factor so they can sign in with the password and set it up again. */
function ResetMfa({ user }: { user: AdminUser }) {
  const reset = useResetMfa();
  const toast = useToast();
  return (
    <section aria-labelledby="reset-mfa-h" className="mt-6 border-t border-line pt-4">
      <h3 id="reset-mfa-h" className="text-sm font-semibold">
        Two-factor
      </h3>
      <p className="mt-1 text-sm text-ink-soft">
        {user.name} uses two-factor sign-in. If they lost their device, reset it: they are signed
        out and can sign in with just their password to set it up again.
      </p>
      {reset.isError && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {reset.error instanceof ApiError ? reset.error.message : "We couldn't reset it."}
        </p>
      )}
      <Button
        className="mt-3"
        size="sm"
        loading={reset.isPending}
        onClick={() =>
          reset.mutate(user.id, { onSuccess: () => toast(`Two-factor reset for ${user.name}`) })
        }
      >
        Reset two-factor
      </Button>
    </section>
  );
}

function DepartmentChecks({
  departments,
  picked,
  onToggle,
}: {
  departments: ReturnType<typeof useAdminDepartments>;
  picked: string[];
  onToggle: (id: string) => void;
}) {
  if (departments.isPending) return <p className="text-sm text-ink-soft">Loading departments</p>;
  if (departments.isError)
    return (
      <p role="alert" className="text-sm text-danger">
        Couldn't load departments.
      </p>
    );
  const list: Department[] = departments.data;
  if (list.length === 0) return <p className="text-sm text-ink-soft">No departments exist yet.</p>;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">Departments</legend>
      <p className="mb-1 text-sm text-ink-soft">
        Questions of a department are visible only to users granted it. Admins see all.
      </p>
      {list.map((d) => (
        <label key={d.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={picked.includes(d.id)}
            onChange={() => onToggle(d.id)}
            className="size-4 accent-[var(--accent)]"
          />
          {d.name}
        </label>
      ))}
    </fieldset>
  );
}
