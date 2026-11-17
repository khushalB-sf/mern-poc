import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDepartment,
  createUser,
  deleteDepartment,
  deleteUser,
  getDepartmentImpact,
  listAdminDepartments,
  listAdminUsers,
  listDeletedDepartments,
  listDeletedQuestions,
  listDepartmentTechnologies,
  listOtherTechnologies,
  restoreDepartment,
  restoreQuestion,
  addDepartmentTechnology,
  removeDepartmentTechnology,
  renameTechnology,
  setOtherTechnologyArchived,
  restoreDepartmentTechnology,
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
        ['admin', 'clients', 'questions', 'tags'].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
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

export const useDeletedDepartments = () =>
  useQuery({
    queryKey: ['admin', 'departments-deleted'],
    queryFn: ({ signal }) => listDeletedDepartments(signal),
  });

/** Fetched fresh each time the delete dialog opens, so the counts are current. */
export const useDepartmentImpact = (id: string | null) =>
  useQuery({
    // Not under 'admin': deleting the department invalidates that prefix, which would refetch a now-404 impact.
    queryKey: ['department-impact', id],
    queryFn: ({ signal }) => getDepartmentImpact(id!, signal),
    enabled: id !== null,
    gcTime: 0,
  });

export const useRestoreDepartment = () => useAdminMutation((id: string) => restoreDepartment(id));

export const useDeletedQuestions = () =>
  useQuery({
    queryKey: ['admin', 'deleted-questions'],
    queryFn: ({ signal }) => listDeletedQuestions(signal),
  });

export const useRestoreQuestion = () => useAdminMutation((id: string) => restoreQuestion(id));

export const useDepartmentTechnologies = (id: string) =>
  useQuery({
    queryKey: ['admin', 'department-technologies', id],
    queryFn: ({ signal }) => listDepartmentTechnologies(id, signal),
  });

export const useAddDepartmentTechnology = () =>
  useAdminMutation((v: { id: string; label: string }) => addDepartmentTechnology(v));
export const useRemoveDepartmentTechnology = () =>
  useAdminMutation((v: { id: string; tagId: string }) => removeDepartmentTechnology(v));
export const useRestoreDepartmentTechnology = () =>
  useAdminMutation((v: { id: string; tagId: string }) => restoreDepartmentTechnology(v));
export const useRenameTechnology = () =>
  useAdminMutation((v: { tagId: string; label: string }) => renameTechnology(v));

export const useOtherTechnologies = () =>
  useQuery({
    queryKey: ['admin', 'other-technologies'],
    queryFn: ({ signal }) => listOtherTechnologies(signal),
  });

export const useSetOtherTechnologyArchived = () =>
  useAdminMutation((v: { id: string; archived: boolean }) => setOtherTechnologyArchived(v));
