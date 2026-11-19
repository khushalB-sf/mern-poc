import { describe, expect, it } from 'vitest';
import { canCreate, canDelete, canEdit, canReview } from '../src/features/auth/hooks';
import type { Question, Role, User } from '../src/shared/api/types';
import { question } from './helpers';

const user = (role: Role, id = 'u1'): User => ({ id, email: 'x@x.dev', name: 'X', role });
const q = (over: Record<string, unknown> = {}) => question(over) as unknown as Question;

describe('UI permission mirrors (the API enforces the real rules)', () => {
  it('create: authors and admins only', () => {
    expect(
      (['USER', 'AUTHOR', 'REVIEWER', 'ADMIN'] as Role[]).map((r) => canCreate(user(r))),
    ).toEqual([false, true, false, true]);
  });

  it('edit: an author only their own; an admin anything; nobody else', () => {
    const own = q();
    const other = q({ author: { id: 'other', name: 'Bob' } });
    expect(canEdit(user('AUTHOR'), own)).toBe(true);
    expect(canEdit(user('AUTHOR'), other)).toBe(false);
    expect(canEdit(user('ADMIN', 'adm'), other)).toBe(true);
    expect(canEdit(user('REVIEWER'), own)).toBe(false);
    expect(canEdit(user('USER'), own)).toBe(false);
  });

  it('review: a reviewer only pending and not their own; an admin any status', () => {
    const pending = q({ status: 'PENDING', author: { id: 'other', name: 'Bob' } });
    expect(canReview(user('REVIEWER', 'rev'), pending)).toBe(true);
    expect(canReview(user('REVIEWER', 'rev'), q({ ...pending, status: 'APPROVED' }))).toBe(false);
    expect(canReview(user('REVIEWER', 'other'), pending)).toBe(false);
    expect(canReview(user('ADMIN', 'adm'), q({ status: 'REJECTED' }))).toBe(true);
    expect(canReview(user('AUTHOR'), pending)).toBe(false);
  });

  it('delete: an admin anything; an author their own until it is approved; nobody else', () => {
    const own = (status: string) => q({ status });
    const other = q({ author: { id: 'other', name: 'Bob' }, status: 'PENDING' });
    expect(canDelete(user('ADMIN', 'adm'), other)).toBe(true);
    expect(canDelete(user('ADMIN', 'adm'), own('APPROVED'))).toBe(true);
    expect(canDelete(user('AUTHOR'), own('PENDING'))).toBe(true);
    expect(canDelete(user('AUTHOR'), own('REJECTED'))).toBe(true);
    expect(canDelete(user('AUTHOR'), own('APPROVED'))).toBe(false);
    expect(canDelete(user('AUTHOR'), other)).toBe(false);
    expect(canDelete(user('REVIEWER'), other)).toBe(false);
    expect(canDelete(user('USER'), other)).toBe(false);
  });
});
