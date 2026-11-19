import type { Logger } from 'pino';
import { Prisma } from '../../generated/prisma/client.js';
import type { Role } from '../../generated/prisma/enums.js';
import type { InputJsonValue } from '../../generated/prisma/internal/prismaNamespace.js';
import type { Db, Queryable } from '../../db/prisma.js';
import { AppError, badRequest, forbidden, notFound } from '../../http/errors.js';
import { encodeCursor } from '../../http/cursor.js';
import { recordAudit } from '../audit/audit.repo.js';
import { hashPassword } from '../auth/password.js';
import type { AuthUser } from '../../types/express.js';
import { isUnique } from './unique.js';

// Everything here ignores soft-deleted users and departments, so a deleted record behaves like a missing one.
const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  grants: {
    where: { department: { deletedAt: null } },
    select: { department: { select: { id: true, name: true } } },
  },
} satisfies Prisma.AppUserSelect;

type UserRow = Prisma.AppUserGetPayload<{ select: typeof userSelect }>;

const toAdminUser = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  active: u.active,
  clients: u.grants.map((g) => g.department).sort((a, b) => a.name.localeCompare(b.name)),
});

const emailTaken = () =>
  new AppError(409, 'EMAIL_EXISTS', 'An account with this email already exists');

const loadUser = async (db: Queryable, id: string) => {
  const u = await db.appUser.findFirst({ where: { id, deletedAt: null }, select: userSelect });
  if (!u) throw notFound('User not found');
  return toAdminUser(u);
};

/** Ends every login of this user: their refresh tokens stop working, and access tokens expire in minutes. */
const signOutEverywhere = (db: Queryable, userId: string) =>
  db.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

export interface UserListQuery {
  deleted?: boolean | undefined;
  q?: string | undefined;
  role?: Role | undefined;
  active?: boolean | undefined;
  /** Only people granted this department. */
  clientId?: string | undefined;
  limit: number;
  cursor?: [string, string] | undefined;
}

/** In a LIKE pattern % and _ are wildcards; a search for them should find them, not everything. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Users by name, paged by a (name, id) cursor, optionally filtered by a name or email fragment, role, status or department. */
export async function listUsers(db: Db, f: UserListQuery = { limit: 50 }) {
  const rows = await db.appUser.findMany({
    where: {
      deletedAt: f.deleted ? { not: null } : null,
      ...(f.role && { role: f.role }),
      ...(f.active !== undefined && { active: f.active }),
      ...(f.clientId && { grants: { some: { departmentId: f.clientId } } }),
      ...(f.q && {
        OR: [
          { name: { contains: escapeLike(f.q), mode: 'insensitive' as const } },
          { email: { contains: escapeLike(f.q), mode: 'insensitive' as const } },
        ],
      }),
      ...(f.cursor && {
        AND: [
          {
            OR: [{ name: { gt: f.cursor[0] } }, { name: f.cursor[0], id: { gt: f.cursor[1] } }],
          },
        ],
      }),
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: f.limit + 1,
    select: userSelect,
  });
  const page = rows.slice(0, f.limit);
  const last = page.at(-1);
  return {
    items: page.map(toAdminUser),
    nextCursor: rows.length > f.limit && last ? encodeCursor([last.name, last.id]) : null,
  };
}

export interface NewUser {
  email: string;
  name: string;
  password: string;
  role: Role;
  clientIds: string[];
}

export async function createUser(db: Db, log: Logger, actor: AuthUser, input: NewUser) {
  const clientIds = [...new Set(input.clientIds)];
  const passwordHash = await hashPassword(input.password); // before the transaction: it is slow by design
  try {
    return await db.$transaction(async (tx) => {
      if (
        (await tx.department.count({ where: { id: { in: clientIds }, deletedAt: null } })) !==
        clientIds.length
      ) {
        throw badRequest('Unknown department');
      }
      const created = await tx.appUser.create({
        data: {
          email: input.email,
          name: input.name,
          role: input.role,
          passwordHash,
          grants: { create: clientIds.map((departmentId) => ({ departmentId })) },
        },
        select: { id: true },
      });
      await recordAudit(tx, log, {
        type: 'USER_CREATED',
        actorId: actor.id,
        payload: { userId: created.id, email: input.email, role: input.role, clientIds },
      });
      return loadUser(tx, created.id);
    });
  } catch (e) {
    if (isUnique(e)) throw emailTaken();
    throw e;
  }
}

export interface UserPatch {
  name?: string | undefined;
  email?: string | undefined;
  role?: Role | undefined;
  active?: boolean | undefined;
  password?: string | undefined;
}

/**
 * There must always be an active admin. Two admins demoting each other at the same moment would
 * otherwise both pass their own check, so the active admins are locked (in id order, no deadlock)
 * and the survivors counted inside the transaction.
 */
async function assertAnotherAdminRemains(tx: Queryable, leavingId: string) {
  const admins = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM app_user
    WHERE role = 'ADMIN' AND active AND deleted_at IS NULL
    ORDER BY id FOR UPDATE`;
  if (!admins.some((a) => a.id !== leavingId)) {
    throw new AppError(409, 'LAST_ADMIN', 'There must be at least one active admin');
  }
}

export async function updateUser(
  db: Db,
  log: Logger,
  actor: AuthUser,
  id: string,
  patch: UserPatch,
) {
  // Self-demotion or self-lockout could leave the system with no admin, so nobody does it to themselves.
  if (id === actor.id && patch.role !== undefined)
    throw forbidden('You cannot change your own role');
  if (id === actor.id && patch.active === false) throw forbidden('You cannot deactivate yourself');
  const passwordHash =
    patch.password === undefined ? undefined : await hashPassword(patch.password);

  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.appUser.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw notFound('User not found');
      const stopsBeingAdmin =
        current.role === 'ADMIN' &&
        current.active &&
        ((patch.role !== undefined && patch.role !== 'ADMIN') || patch.active === false);
      if (stopsBeingAdmin) await assertAnotherAdminRemains(tx, id);

      const data: Prisma.AppUserUpdateInput = {};
      const changed: Record<string, { from: InputJsonValue | null; to: InputJsonValue | null }> =
        {};
      const set = <K extends 'name' | 'email' | 'active'>(k: K, v: UserPatch[K]) => {
        if (v !== undefined && v !== current[k]) {
          data[k] = v;
          changed[k] = { from: current[k], to: v };
        }
      };
      set('name', patch.name);
      set('email', patch.email);
      set('active', patch.active);
      const roleChanged = patch.role !== undefined && patch.role !== current.role;
      if (roleChanged) data.role = patch.role!;
      if (passwordHash) data.passwordHash = passwordHash;

      if (Object.keys(data).length > 0) await tx.appUser.update({ where: { id }, data });
      if (roleChanged) {
        await recordAudit(tx, log, {
          type: 'USER_ROLE_CHANGED',
          actorId: actor.id,
          payload: { userId: id, from: current.role, to: patch.role! },
        });
      }
      if (Object.keys(changed).length > 0 || passwordHash) {
        await recordAudit(tx, log, {
          type: 'USER_UPDATED',
          actorId: actor.id,
          // The password itself is never recorded, only the fact that it was reset.
          payload: { userId: id, changes: changed, passwordReset: Boolean(passwordHash) },
        });
      }
      if (passwordHash || patch.active === false) await signOutEverywhere(tx, id);
      return loadUser(tx, id);
    });
  } catch (e) {
    if (isUnique(e)) throw emailTaken();
    throw e;
  }
}

/**
 * Undoes deleteUser. The account comes back switched off: the sessions it had were already signed out,
 * and letting someone in again is a decision an admin makes explicitly (edit, set active).
 */
export async function restoreUser(db: Db, log: Logger, actor: AuthUser, id: string) {
  return db.$transaction(async (tx) => {
    const current = await tx.appUser.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!current) throw notFound('Deleted user not found');
    await tx.appUser.update({ where: { id }, data: { deletedAt: null, active: false } });
    await recordAudit(tx, log, {
      type: 'USER_RESTORED',
      actorId: actor.id,
      payload: { userId: id, email: current.email, role: current.role },
    });
    return loadUser(tx, id);
  });
}

/** Soft delete: the account can no longer sign in or be listed, but the questions and history it made stay. */
export async function deleteUser(db: Db, log: Logger, actor: AuthUser, id: string) {
  if (id === actor.id) throw forbidden('You cannot delete yourself');
  await db.$transaction(async (tx) => {
    const current = await tx.appUser.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw notFound('User not found');
    if (current.role === 'ADMIN' && current.active) await assertAnotherAdminRemains(tx, id);
    await tx.appUser.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await signOutEverywhere(tx, id);
    await recordAudit(tx, log, {
      type: 'USER_DELETED',
      actorId: actor.id,
      payload: { userId: id, email: current.email, role: current.role },
    });
  });
}

/** Replaces the user's department (formerly `client`) grants with exactly `clientIds`. */
export async function setUserDepartments(
  db: Db,
  log: Logger,
  actor: AuthUser,
  id: string,
  clientIds: string[],
) {
  const wanted = [...new Set(clientIds)];
  return db.$transaction(async (tx) => {
    const user = await tx.appUser.findFirst({
      where: { id, deletedAt: null },
      select: {
        grants: { where: { department: { deletedAt: null } }, select: { departmentId: true } },
      },
    });
    if (!user) throw notFound('User not found');
    if (
      (await tx.department.count({ where: { id: { in: wanted }, deletedAt: null } })) !==
      wanted.length
    ) {
      throw badRequest('Unknown department');
    }

    const had = new Set(user.grants.map((g) => g.departmentId));
    const added = wanted.filter((c) => !had.has(c));
    const removed = [...had].filter((c) => !wanted.includes(c));
    if (added.length + removed.length > 0) {
      await tx.departmentGrant.deleteMany({ where: { userId: id, departmentId: { in: removed } } });
      await tx.departmentGrant.createMany({
        data: added.map((departmentId) => ({ userId: id, departmentId })),
        skipDuplicates: true, // a stale grant to a since-deleted department may already exist
      });
      await recordAudit(tx, log, {
        type: 'USER_CLIENTS_CHANGED',
        actorId: actor.id,
        payload: { userId: id, added, removed },
      });
    }
    return loadUser(tx, id);
  });
}
