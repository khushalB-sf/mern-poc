import { apiFetch } from '../../shared/api/client';
import type {
  AdminUser,
  DeletedQuestion,
  Department,
  DepartmentImpact,
  Role,
  DepartmentTechnologies,
} from '../../shared/api/types';

export const listAdminUsers = (signal?: AbortSignal) =>
  apiFetch<{ items: AdminUser[] }>('/admin/users', { signal }).then((r) => r.items);

export interface NewUser {
  name: string;
  email: string;
  password: string;
  role: Role;
  clientIds: string[];
}

/** Only the fields that changed are sent. */
export interface UserPatch {
  name?: string;
  email?: string;
  role?: Role;
  active?: boolean;
  password?: string;
}

export const createUser = (body: NewUser) =>
  apiFetch<{ user: AdminUser }>('/admin/users', { method: 'POST', body }).then((r) => r.user);

export const updateUser = (id: string, body: UserPatch) =>
  apiFetch<{ user: AdminUser }>(`/admin/users/${id}`, { method: 'PATCH', body }).then(
    (r) => r.user,
  );

export const deleteUser = (id: string) =>
  apiFetch<void>(`/admin/users/${id}`, { method: 'DELETE' });

export const setUserClients = (id: string, clientIds: string[]) =>
  apiFetch<{ user: AdminUser }>(`/admin/users/${id}/clients`, {
    method: 'PUT',
    body: { clientIds },
  }).then((r) => r.user);

export const listAdminDepartments = (signal?: AbortSignal) =>
  apiFetch<{ items: Department[] }>('/admin/clients', { signal }).then((r) => r.items);

export interface DepartmentInput {
  name: string;
  description: string | null;
}

export const createDepartment = (body: DepartmentInput) =>
  apiFetch<{ client: Department }>('/admin/clients', { method: 'POST', body }).then(
    (r) => r.client,
  );

export const updateDepartment = (id: string, body: Partial<DepartmentInput>) =>
  apiFetch<{ client: Department }>(`/admin/clients/${id}`, { method: 'PATCH', body }).then(
    (r) => r.client,
  );

export const deleteDepartment = (id: string) =>
  apiFetch<void>(`/admin/clients/${id}`, { method: 'DELETE' });

export const listDeletedDepartments = (signal?: AbortSignal) =>
  apiFetch<{ items: Department[] }>('/admin/clients?deleted=true', { signal }).then((r) => r.items);

export const getDepartmentImpact = (id: string, signal?: AbortSignal) =>
  apiFetch<DepartmentImpact>(`/admin/clients/${id}/impact`, { signal });

export const restoreDepartment = (id: string) =>
  apiFetch<{ client: Department }>(`/admin/clients/${id}/restore`, { method: 'POST' });

export const listDeletedQuestions = (signal?: AbortSignal) =>
  apiFetch<{ items: DeletedQuestion[] }>('/admin/deleted-questions', { signal }).then(
    (r) => r.items,
  );

export const restoreQuestion = (id: string) =>
  apiFetch<void>(`/admin/questions/${id}/restore`, { method: 'POST' });

export const listDepartmentTechnologies = (id: string, signal?: AbortSignal) =>
  apiFetch<DepartmentTechnologies>(`/admin/clients/${id}/technologies`, { signal });

export const addDepartmentTechnology = ({ id, label }: { id: string; label: string }) =>
  apiFetch<{ technology: { id: string; label: string; created: boolean } }>(
    `/admin/clients/${id}/technologies`,
    { method: 'POST', body: { label } },
  ).then((r) => r.technology);

export const removeDepartmentTechnology = ({ id, tagId }: { id: string; tagId: string }) =>
  apiFetch<void>(`/admin/clients/${id}/technologies/${tagId}`, { method: 'DELETE' });

export const restoreDepartmentTechnology = ({ id, tagId }: { id: string; tagId: string }) =>
  apiFetch<void>(`/admin/clients/${id}/technologies/${tagId}/restore`, { method: 'POST' });

export const renameTechnology = ({ tagId, label }: { tagId: string; label: string }) =>
  apiFetch<void>(`/admin/technologies/${tagId}`, { method: 'PATCH', body: { label } });

export const listOtherTechnologies = (signal?: AbortSignal) =>
  apiFetch<Pick<DepartmentTechnologies, 'active' | 'archived'>>('/admin/technologies/other', {
    signal,
  });

export const setOtherTechnologyArchived = ({ id, archived }: { id: string; archived: boolean }) =>
  apiFetch<void>(`/admin/technologies/${id}/${archived ? 'archive' : 'restore'}`, {
    method: 'POST',
  });
