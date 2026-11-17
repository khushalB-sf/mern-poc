import { useState } from 'react';
import { ApiError } from '../../shared/api/client';
import type { AdminUser, Role } from '../../shared/api/types';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { ROLE_LABEL } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { EmptyState, ErrorState, PageSpinner } from '../../shared/ui/states';
import { useToast } from '../../shared/ui/Toast';
import { useMe } from '../auth/hooks';
import { Avatar } from '../../shared/ui/Avatar';
import { Page, PageHeader } from '../../shared/ui/Page';
import { useAdminUsers, useChangeRole, useDeleteUser } from './hooks';
import { UserDialog } from './UserDialog';

const ROLES = Object.keys(ROLE_LABEL) as Role[];
const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

export function AdminUsersPage() {
  useDocumentTitle('Users');
  const { data: me } = useMe();
  const users = useAdminUsers();
  const changeRole = useChangeRole();
  const toast = useToast();
  const remove = useDeleteUser();
  // undefined = closed, null = add a user, a user = edit that user.
  const [editing, setEditing] = useState<AdminUser | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);

  const onRole = (u: AdminUser, role: Role) =>
    changeRole.mutate(
      { id: u.id, role },
      {
        onSuccess: () => toast(`${u.name} is now ${ROLE_LABEL[role]}`),
        onError: (e) => toast(message(e), 'error'),
      },
    );

  return (
    <Page>
      <PageHeader
        title="Users"
        description="Add people, change what each can do and which departments they can see, or remove them."
        actions={
          <Button variant="primary" onClick={() => setEditing(null)}>
            <Icon name="plus" />
            Add user
          </Button>
        }
      />

      {users.isPending ? (
        <PageSpinner label="Loading users" />
      ) : users.isError ? (
        <ErrorState title="Couldn't load users" onRetry={() => void users.refetch()}>
          {users.error.message}
        </ErrorState>
      ) : users.data.length === 0 ? (
        <EmptyState title="No users yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
          <table className="w-full text-sm">
            <caption className="sr-only">Users, their role and departments</caption>
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-xs uppercase tracking-wider text-ink-soft">
                <th scope="col" className="px-4 py-3 font-semibold">
                  User
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Role
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Departments
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id} className="border-b border-line align-top last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} />
                        <div className="min-w-0">
                          <span className="block font-medium">{u.name}</span>
                          <span className="text-ink-soft">{u.email}</span>
                        </div>
                      </div>
                    </th>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Role for ${u.name}`}
                        value={u.role}
                        disabled={self || changeRole.isPending}
                        aria-describedby={self ? 'self-role-hint' : undefined}
                        onChange={(e) => onRole(u, e.target.value as Role)}
                        className="min-h-10 rounded-lg border border-control bg-surface px-2 hover:border-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      {self && (
                        <p id="self-role-hint" className="mt-1 text-xs text-ink-soft">
                          You can't change your own role.
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.role === 'ADMIN' ? (
                        <p className="text-ink-soft">All departments</p>
                      ) : (
                        <p>{u.clients.map((c) => c.name).join(', ') || 'None'}</p>
                      )}
                      {!u.active && <p className="mt-1 text-xs text-danger">Deactivated</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Edit ${u.name}`}
                          onClick={() => setEditing(u)}
                        >
                          Edit
                        </Button>
                        {!self && (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Delete ${u.name}`}
                            onClick={() => setDeleting(u)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <UserDialog
          user={editing}
          isSelf={editing !== null && editing.id === me?.id}
          onClose={() => setEditing(undefined)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete user'}
        confirmLabel="Delete user"
        loading={remove.isPending}
        error={remove.isError ? message(remove.error) : undefined}
        onClose={() => {
          remove.reset();
          setDeleting(null);
        }}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast(`Deleted ${deleting.name}`);
              setDeleting(null);
            },
          })
        }
      >
        <p>
          {deleting?.name} will no longer be able to sign in and will disappear from this list.
          Their questions and history are kept.
        </p>
      </ConfirmDialog>
    </Page>
  );
}
