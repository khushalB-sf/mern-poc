import { useState } from 'react';
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue';
import { plural } from '../../shared/lib/format';
import { ApiError } from '../../shared/api/client';
import type { AdminUser, Role } from '../../shared/api/types';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { ROLE_LABEL } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { EmptyState, ErrorState, PageSpinner } from '../../shared/ui/states';
import { useToast } from '../../shared/ui/Toast';
import { useMe } from '../auth/hooks';
import { Avatar } from '../../shared/ui/Avatar';
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
import { Page, PageHeader } from '../../shared/ui/Page';
import { NO_USER_FILTERS, type UserFilters } from './api';
import {
  useAdminDepartments,
  useAdminUsers,
  useChangeRole,
  useDeleteUser,
  useDeletedUsers,
  useRestoreUser,
} from './hooks';
import { UserDialog } from './UserDialog';

const ROLES = Object.keys(ROLE_LABEL) as Role[];
const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

function DeletedUsers() {
  const deleted = useDeletedUsers();
  const restore = useRestoreUser();
  const toast = useToast();
  const gone = deleted.data?.pages.flatMap((p) => p.items) ?? [];
  if (gone.length === 0) return null;
  return (
    <section aria-labelledby="deleted-users" className="mt-10">
      <h2 id="deleted-users" className="font-serif text-xl font-semibold">
        Deleted users
      </h2>
      <p className="mb-3 mt-1 text-sm text-ink-soft">
        They cannot sign in, and their questions and history are kept. A restored account comes back
        switched off: edit it and tick Active when you want them back in.
      </p>
      {restore.isError && (
        <p role="alert" className="mb-3 text-sm font-medium text-danger">
          {message(restore.error)}
        </p>
      )}
      <DataTable
        caption="Deleted users"
        columns={['User', 'Role', { label: 'Actions', srOnly: true }]}
      >
        {gone.map((u) => (
          <tr key={u.id} className={ROW}>
            <th scope="row" className={`${CELL} text-left font-normal`}>
              <div className="flex items-center gap-3">
                <Avatar name={u.name} />
                <div className="min-w-0">
                  <span className="block font-medium">{u.name}</span>
                  <span className="text-ink-soft">{u.email}</span>
                </div>
              </div>
            </th>
            <td className={CELL}>{ROLE_LABEL[u.role]}</td>
            <td className={CELL}>
              <RowActions>
                <Button
                  size="sm"
                  aria-label={`Restore ${u.name}`}
                  loading={restore.isPending && restore.variables === u.id}
                  onClick={() =>
                    restore.mutate(u.id, {
                      onSuccess: () =>
                        toast(
                          `Restored ${u.name}. Their account is switched off until you activate it.`,
                        ),
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
      {deleted.hasNextPage && (
        <div className="mt-4 text-center">
          <Button loading={deleted.isFetchingNextPage} onClick={() => void deleted.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </section>
  );
}

export function AdminUsersPage() {
  useDocumentTitle('Users');
  const { data: me } = useMe();
  const [typed, setTyped] = useState('');
  const [filters, setFilters] = useState<UserFilters>(NO_USER_FILTERS);
  // The list follows the box as you type, after a short pause.
  const q = useDebouncedValue(typed.trim(), 300);
  const applied = { ...filters, q };
  const users = useAdminUsers(applied);
  const departments = useAdminDepartments();
  const rows = users.data?.pages.flatMap((p) => p.items) ?? [];
  const changeRole = useChangeRole();
  const toast = useToast();
  const remove = useDeleteUser();
  // undefined = closed, null = add a user, a user = edit that user.
  const [editing, setEditing] = useState<AdminUser | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const filtered =
    q !== '' || filters.role !== '' || filters.active !== '' || filters.clientId !== '';
  const clear = () => {
    setTyped('');
    setFilters(NO_USER_FILTERS);
  };

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
        actions={<AddButton onClick={() => setEditing(null)}>Add user</AddButton>}
      />

      <Toolbar
        summary={
          users.isSuccess &&
          `${plural(rows.length, 'user')}${users.hasNextPage ? ' so far, more below' : ''}`
        }
      >
        <SearchField
          label="Search users"
          value={typed}
          onChange={setTyped}
          placeholder="Search by name or email"
        />
        <FilterSelect
          label="Role"
          value={filters.role}
          onChange={(v) => setFilters({ ...filters, role: v as Role | '' })}
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Status"
          value={filters.active}
          onChange={(v) => setFilters({ ...filters, active: v as UserFilters['active'] })}
        >
          <option value="">Any status</option>
          <option value="true">Active</option>
          <option value="false">Deactivated</option>
        </FilterSelect>
        <FilterSelect
          label="Department"
          value={filters.clientId}
          onChange={(v) => setFilters({ ...filters, clientId: v })}
        >
          <option value="">All departments</option>
          {departments.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </FilterSelect>
        {filtered && <ClearFilters onClick={clear} />}
      </Toolbar>

      {users.isPending ? (
        <PageSpinner label="Loading users" />
      ) : users.isError ? (
        <ErrorState title="Couldn't load users" onRetry={() => void users.refetch()}>
          {users.error.message}
        </ErrorState>
      ) : rows.length === 0 ? (
        <EmptyState
          title={filtered ? 'No users match' : 'No users yet'}
          action={filtered ? <ClearFilters onClick={clear} /> : undefined}
        >
          {filtered ? 'Try a different name, role, status or department.' : undefined}
        </EmptyState>
      ) : (
        <DataTable
          caption="Users, their role, departments and status"
          columns={['User', 'Role', 'Departments', 'Status', { label: 'Actions', srOnly: true }]}
        >
          {rows.map((u) => {
            const self = u.id === me?.id;
            return (
              <tr key={u.id} className={ROW}>
                <th scope="row" className={`${CELL} text-left font-normal`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} />
                    <div className="min-w-0">
                      <span className="block font-medium">{u.name}</span>
                      <span className="text-ink-soft">{u.email}</span>
                    </div>
                  </div>
                </th>
                <td className={CELL}>
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
                <td className={CELL}>
                  {u.role === 'ADMIN' ? (
                    <span className="text-ink-soft">All departments</span>
                  ) : (
                    u.clients.map((c) => c.name).join(', ') || 'None'
                  )}
                </td>
                <td className={CELL}>
                  {u.active ? (
                    <StatusBadge tone="ok">Active</StatusBadge>
                  ) : (
                    <StatusBadge tone="danger">Deactivated</StatusBadge>
                  )}
                </td>
                <td className={CELL}>
                  <RowActions>
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
                  </RowActions>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
      {users.hasNextPage && (
        <div className="mt-4 text-center">
          <Button loading={users.isFetchingNextPage} onClick={() => void users.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}

      <DeletedUsers />

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
          Their questions and history are kept, and you can restore the account later.
        </p>
      </ConfirmDialog>
    </Page>
  );
}
