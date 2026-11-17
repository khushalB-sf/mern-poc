import { apiFetch } from '../../shared/api/client';
import type {
  AdminUser,
  DeletedQuestion,
  Department,
  DepartmentImpact,
  Role,
  Technology,
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

export const listTechnologies = (signal?: AbortSignal) =>
  apiFetch<{ items: Technology[] }>('/admin/technologies', { signal }).then((r) => r.items);

export const setTechnologyRetired = ({ id, retired }: { id: string; retired: boolean }) =>
  apiFetch<void>(`/admin/technologies/${id}/${retired ? 'retire' : 'restore'}`, {
    method: 'POST',
  });
