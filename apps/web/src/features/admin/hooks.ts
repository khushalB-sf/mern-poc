import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDepartment,
  createUser,
  deleteDepartment,
  deleteUser,
  listAdminDepartments,
  listAdminUsers,
  setUserClients,
  updateDepartment,
  updateUser,
  type DepartmentInput,
  type NewUser,
  type UserPatch,
} from './api';

export const useAdminUsers = () =>
  useQuery({
    queryKey: ['admin', 'users'],
    queryFn: ({ signal }) => listAdminUsers(signal),
  });

export const useAdminDepartments = () =>
  useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: ({ signal }) => listAdminDepartments(signal),
  });

/**
 * Anything an admin changes can affect the admin lists, the app-wide department list (filters, forms)
 * and, when a department goes, which questions exist. Refresh the lot; the data is small.
 */
function useAdminMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(
        ['admin', 'clients', 'questions'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      ),
  });
}

export const useChangeRole = () =>
  useAdminMutation(({ id, role }: { id: string; role: UserPatch['role'] & string }) =>
    updateUser(id, { role }),
  );
export const useCreateUser = () => useAdminMutation((u: NewUser) => createUser(u));
export const useUpdateUser = () =>
  useAdminMutation(({ id, patch }: { id: string; patch: UserPatch }) => updateUser(id, patch));
export const useDeleteUser = () => useAdminMutation((id: string) => deleteUser(id));
export const useSetUserDepartments = () =>
  useAdminMutation(({ id, clientIds }: { id: string; clientIds: string[] }) =>
    setUserClients(id, clientIds),
  );

export const useCreateDepartment = () =>
  useAdminMutation((d: DepartmentInput) => createDepartment(d));
export const useUpdateDepartment = () =>
  useAdminMutation(({ id, patch }: { id: string; patch: Partial<DepartmentInput> }) =>
    updateDepartment(id, patch),
  );
export const useDeleteDepartment = () => useAdminMutation((id: string) => deleteDepartment(id));
