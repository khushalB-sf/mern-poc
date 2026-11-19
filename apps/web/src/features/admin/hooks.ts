import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDepartment,
  createUser,
  deleteDepartment,
  deleteUser,
  getDepartmentImpact,
  addTagToList,
  listAdminDepartments,
  listTagCategories,
  renameTag as renameListTag,
  setTagArchived,
  listAudit,
  listAdminUsers,
  listDeletedUsers,
  listDeletedDepartments,
  listDeletedQuestions,
  listDepartmentTechnologies,
  listOtherTechnologies,
  restoreDepartment,
  restoreQuestion,
  restoreUser,
  addDepartmentTechnology,
  removeDepartmentTechnology,
  renameTechnology,
  setOtherTechnologyArchived,
  restoreDepartmentTechnology,
  setUserClients,
  updateDepartment,
  updateUser,
  NO_USER_FILTERS,
  type AuditFilters,
  type DepartmentInput,
  type NewUser,
  type UserFilters,
  type UserPatch,
} from './api';

const cursorPaging = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor ?? undefined,
};

export const useAdminUsers = (filters: UserFilters = NO_USER_FILTERS) =>
  useInfiniteQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: ({ pageParam, signal }) => listAdminUsers(filters, pageParam, signal),
    ...cursorPaging,
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
  useInfiniteQuery({
    queryKey: ['admin', 'deleted-questions'],
    queryFn: ({ pageParam, signal }) => listDeletedQuestions(pageParam, signal),
    ...cursorPaging,
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

export const useDeletedUsers = () =>
  useInfiniteQuery({
    queryKey: ['admin', 'users-deleted'],
    queryFn: ({ pageParam, signal }) => listDeletedUsers(pageParam, signal),
    ...cursorPaging,
  });

export const useRestoreUser = () => useAdminMutation((id: string) => restoreUser(id));

export const useAudit = (filters: AuditFilters) =>
  useInfiniteQuery({
    queryKey: ['admin', 'audit', filters],
    queryFn: ({ pageParam, signal }) => listAudit(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useTagCategories = () =>
  useQuery({
    queryKey: ['admin', 'tag-categories'],
    queryFn: ({ signal }) => listTagCategories(signal),
  });
export const useAddTagToList = () =>
  useAdminMutation((v: { slug: string; label: string }) => addTagToList(v));
export const useRenameListTag = () =>
  useAdminMutation((v: { id: string; label: string }) => renameListTag(v));
export const useSetTagArchived = () =>
  useAdminMutation((v: { id: string; archived: boolean }) => setTagArchived(v));
