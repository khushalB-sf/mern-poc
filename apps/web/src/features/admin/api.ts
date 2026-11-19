import { apiFetch } from '../../shared/api/client';
import type {
  AdminUser,
  DeletedQuestion,
  Department,
  DepartmentImpact,
  Role,
  DepartmentTechnologies,
} from '../../shared/api/types';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** A search and a cursor become the query string; nothing is sent for what is empty. */
const listQuery = (params: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const q = sp.toString();
  return q ? `?${q}` : '';
};

export interface UserFilters {
  q: string;
  /** '' = any role */
  role: Role | '';
  /** '' = any status */
  active: 'true' | 'false' | '';
  /** A department id, '' = any */
  clientId: string;
}
export const NO_USER_FILTERS: UserFilters = { q: '', role: '', active: '', clientId: '' };

export const listAdminUsers = (f: UserFilters, cursor: string | undefined, signal?: AbortSignal) =>
  apiFetch<Page<AdminUser>>(`/admin/users${listQuery({ ...f, cursor })}`, { signal });

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

export const listDeletedQuestions = (cursor: string | undefined, signal?: AbortSignal) =>
  apiFetch<Page<DeletedQuestion>>(`/admin/deleted-questions${listQuery({ cursor })}`, { signal });

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

export const listDeletedUsers = (cursor: string | undefined, signal?: AbortSignal) =>
  apiFetch<Page<AdminUser>>(`/admin/users${listQuery({ deleted: 'true', cursor })}`, { signal });

export const restoreUser = (id: string) =>
  apiFetch<{ user: AdminUser }>(`/admin/users/${id}/restore`, { method: 'POST' }).then(
    (r) => r.user,
  );

export interface AuditEvent {
  id: string;
  type: string;
  at: string;
  actor: { id: string; name: string };
  questionId: string | null;
  payload: Record<string, unknown>;
}
export interface AuditFilters {
  type?: string;
  from?: string;
  to?: string;
}

const auditQuery = (f: AuditFilters) => {
  const sp = new URLSearchParams();
  if (f.type) sp.set('type', f.type);
  if (f.from) sp.set('from', f.from);
  if (f.to) sp.set('to', f.to);
  return sp;
};
export const auditExportUrl = (f: AuditFilters) => {
  const q = auditQuery(f).toString();
  return `/api/admin/audit/export${q ? `?${q}` : ''}`;
};
export const listAudit = (f: AuditFilters, cursor: string | undefined, signal?: AbortSignal) => {
  const sp = new URLSearchParams({ limit: '50' });
  for (const [k, v] of auditQuery(f)) sp.set(k, v);
  if (cursor) sp.set('cursor', cursor);
  return apiFetch<{ items: AuditEvent[]; nextCursor: string | null }>(`/admin/audit?${sp}`, {
    signal,
  });
};

export interface ManagedTag {
  id: string;
  value: string;
  label: string;
  archived: boolean;
  questionCount: number;
}
export interface TagList {
  slug: string;
  name: string;
  tags: ManagedTag[];
}

export const listTagCategories = (signal?: AbortSignal) =>
  apiFetch<{ items: TagList[] }>('/admin/tag-categories', { signal }).then((r) => r.items);
export const addTagToList = ({ slug, label }: { slug: string; label: string }) =>
  apiFetch<{ tag: { id: string; label: string } }>(`/admin/tag-categories/${slug}/tags`, {
    method: 'POST',
    body: { label },
  }).then((r) => r.tag);
export const renameTag = ({ id, label }: { id: string; label: string }) =>
  apiFetch<void>(`/admin/tags/${id}`, { method: 'PATCH', body: { label } });
export const setTagArchived = ({ id, archived }: { id: string; archived: boolean }) =>
  apiFetch<void>(`/admin/tags/${id}/${archived ? 'archive' : 'restore'}`, { method: 'POST' });
