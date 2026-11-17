import type { Logger } from 'pino';
import { Prisma } from '../../generated/prisma/client.js';
import type { Role } from '../../generated/prisma/enums.js';
import type { InputJsonValue } from '../../generated/prisma/internal/prismaNamespace.js';
import type { Db, Queryable } from '../../db/prisma.js';
import { AppError, badRequest, forbidden, notFound } from '../../http/errors.js';
import { recordAudit } from '../audit/audit.repo.js';
import { hashPassword } from '../auth/password.js';
import type { AuthUser } from '../../types/express.js';
import {
  departmentImpact,
  listDeletedQuestions,
  restoreQuestion,
} from '../questions/question.repo.js';
import { exclusiveTechnologyIds } from './technologies.js';

// Everything here ignores soft-deleted users and departments, so a deleted record behaves like a missing one.
const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  grants: {
    where: { client: { deletedAt: null } },
    select: { client: { select: { id: true, name: true } } },
  },
} satisfies Prisma.AppUserSelect;

type UserRow = Prisma.AppUserGetPayload<{ select: typeof userSelect }>;

const toAdminUser = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  active: u.active,
  clients: u.grants.map((g) => g.client).sort((a, b) => a.name.localeCompare(b.name)),
});

const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const emailTaken = () =>
  new AppError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
const nameTaken = () =>
  new AppError(409, 'DEPARTMENT_EXISTS', 'A department with this name already exists');

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

// ponytail: no paging. Fine for an internal team; add limit/offset when user counts reach the thousands.
export async function listUsers(db: Db) {
  const users = await db.appUser.findMany({
    where: { deletedAt: null },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: userSelect,
  });
  return users.map(toAdminUser);
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
        (await tx.client.count({ where: { id: { in: clientIds }, deletedAt: null } })) !==
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
          grants: { create: clientIds.map((clientId) => ({ clientId })) },
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

/** Soft delete: the account can no longer sign in or be listed, but the questions and history it made stay. */
export async function deleteUser(db: Db, log: Logger, actor: AuthUser, id: string) {
  if (id === actor.id) throw forbidden('You cannot delete yourself');
  await db.$transaction(async (tx) => {
    const current = await tx.appUser.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw notFound('User not found');
    await tx.appUser.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await signOutEverywhere(tx, id);
    await recordAudit(tx, log, {
      type: 'USER_DELETED',
      actorId: actor.id,
      payload: { userId: id, email: current.email, role: current.role },
    });
  });
}

/** Replaces the user's department (client) grants with exactly `clientIds`. */
export async function setUserClients(
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
      select: { grants: { where: { client: { deletedAt: null } }, select: { clientId: true } } },
    });
    if (!user) throw notFound('User not found');
    if (
      (await tx.client.count({ where: { id: { in: wanted }, deletedAt: null } })) !== wanted.length
    ) {
      throw badRequest('Unknown department');
    }

    const had = new Set(user.grants.map((g) => g.clientId));
    const added = wanted.filter((c) => !had.has(c));
    const removed = [...had].filter((c) => !wanted.includes(c));
    if (added.length + removed.length > 0) {
      await tx.clientGrant.deleteMany({ where: { userId: id, clientId: { in: removed } } });
      await tx.clientGrant.createMany({
        data: added.map((clientId) => ({ userId: id, clientId })),
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

const clientSelect = {
  id: true,
  name: true,
  description: true,
  _count: { select: { grants: { where: { user: { deletedAt: null } } } } },
} satisfies Prisma.ClientSelect;

const toDepartment = (c: Prisma.ClientGetPayload<{ select: typeof clientSelect }>) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  userCount: c._count.grants,
});

export async function listClients(db: Db, { deleted = false } = {}) {
  const rows = await db.client.findMany({
    where: { deletedAt: deleted ? { not: null } : null },
    orderBy: { name: 'asc' },
    select: clientSelect,
  });
  return rows.map(toDepartment);
}

/** What deleting this department would hide, for the confirmation dialog. */
export async function clientImpact(db: Db, id: string) {
  const current = await db.client.findFirst({
    where: { id, deletedAt: null },
    select: clientSelect,
  });
  if (!current) throw notFound('Department not found');
  return {
    ...(await departmentImpact(db, id)),
    users: toDepartment(current).userCount,
    technologies: (await exclusiveTechnologyIds(db, id)).length,
  };
}

/** Undoes deleteClient: the department, its grants and all its questions come back as they were. */
export async function restoreClient(db: Db, log: Logger, actor: AuthUser, id: string) {
  return db.$transaction(async (tx) => {
    const current = await tx.client.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!current) throw notFound('Deleted department not found');
    await tx.client.update({ where: { id }, data: { deletedAt: null } });
    // Only the technologies this very deletion archived (same timestamp) come back.
    const revived = await tx.tag.updateMany({
      where: { archivedAt: current.deletedAt, clients: { some: { clientId: id } } },
      data: { archivedAt: null },
    });
    await recordAudit(tx, log, {
      type: 'CLIENT_RESTORED',
      actorId: actor.id,
      payload: { clientId: id, name: current.name, technologiesRestored: revived.count },
    });
    return toDepartment(await tx.client.findUniqueOrThrow({ where: { id }, select: clientSelect }));
  });
}

export const listDeletedQuestionsForAdmin = (db: Db) => listDeletedQuestions(db);

export async function restoreDeletedQuestion(db: Db, log: Logger, actor: AuthUser, id: string) {
  await db.$transaction(async (tx) => {
    const { text } = await restoreQuestion(tx, id);
    await recordAudit(tx, log, {
      type: 'QUESTION_RESTORED',
      actorId: actor.id,
      questionId: id,
      payload: { text },
    });
  });
}

export async function createClient(
  db: Db,
  log: Logger,
  actor: AuthUser,
  input: { name: string; description?: string | null | undefined },
) {
  try {
    return await db.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: { name: input.name, description: input.description ?? null },
        select: clientSelect,
      });
      await recordAudit(tx, log, {
        type: 'CLIENT_CREATED',
        actorId: actor.id,
        payload: { clientId: client.id, name: input.name },
      });
      return toDepartment(client);
    });
  } catch (e) {
    // The unique index is the source of truth: no check-then-insert race.
    if (isUnique(e)) throw nameTaken();
    throw e;
  }
}

export async function updateClient(
  db: Db,
  log: Logger,
  actor: AuthUser,
  id: string,
  patch: { name?: string | undefined; description?: string | null | undefined },
) {
  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.client.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw notFound('Department not found');

      const changes: Record<string, { from: InputJsonValue | null; to: InputJsonValue | null }> =
        {};
      if (patch.name !== undefined && patch.name !== current.name) {
        changes.name = { from: current.name, to: patch.name };
      }
      if (patch.description !== undefined && patch.description !== current.description) {
        changes.description = { from: current.description, to: patch.description };
      }
      if (Object.keys(changes).length > 0) {
        await tx.client.update({
          where: { id },
          data: {
            ...(patch.name !== undefined && { name: patch.name }),
            ...(patch.description !== undefined && { description: patch.description }),
          },
        });
        await recordAudit(tx, log, {
          type: 'CLIENT_UPDATED',
          actorId: actor.id,
          payload: { clientId: id, changes },
        });
      }
      return toDepartment(
        await tx.client.findUniqueOrThrow({ where: { id }, select: clientSelect }),
      );
    });
  } catch (e) {
    if (isUnique(e)) throw nameTaken();
    throw e;
  }
}

/** Soft delete: the department and every question in it disappear; grants and history stay on record. */
export async function deleteClient(db: Db, log: Logger, actor: AuthUser, id: string) {
  await db.$transaction(async (tx) => {
    const current = await tx.client.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw notFound('Department not found');
    const now = new Date();
    // Technologies no other live department uses go with it; shared ones stay. Same timestamp as the
    // deletion, so restoring the department can tell which ones this deletion archived.
    const exclusive = await exclusiveTechnologyIds(tx, id);
    await tx.tag.updateMany({ where: { id: { in: exclusive } }, data: { archivedAt: now } });
    await tx.client.update({ where: { id }, data: { deletedAt: now } });
    await recordAudit(tx, log, {
      type: 'CLIENT_DELETED',
      actorId: actor.id,
      payload: { clientId: id, name: current.name, technologiesArchived: exclusive.length },
    });
  });
}
