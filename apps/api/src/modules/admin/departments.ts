import type { Logger } from 'pino';
import { Prisma } from '../../generated/prisma/client.js';
import type { InputJsonValue } from '../../generated/prisma/internal/prismaNamespace.js';
import type { Db } from '../../db/prisma.js';
import { AppError, notFound } from '../../http/errors.js';
import { recordAudit } from '../audit/audit.repo.js';
import type { AuthUser } from '../../types/express.js';
import {
  departmentImpact,
  listDeletedQuestions,
  restoreQuestion,
} from '../questions/question.repo.js';
import { isUnique } from './unique.js';
import { exclusiveTechnologyIds } from './technologies.js';

const nameTaken = () =>
  new AppError(409, 'DEPARTMENT_EXISTS', 'A department with this name already exists');

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
    // Technologies a department deletion archived (nobody live used them) are used again now that this
    // department is live: they come back, whichever deletion archived them. Hand-archived ones do not.
    const revived = await tx.tag.updateMany({
      where: { archivedByClientId: { not: null }, clients: { some: { clientId: id } } },
      data: { archivedAt: null, archivedByClientId: null },
    });
    await recordAudit(tx, log, {
      type: 'CLIENT_RESTORED',
      actorId: actor.id,
      payload: { clientId: id, name: current.name, technologiesRestored: revived.count },
    });
    return toDepartment(await tx.client.findUniqueOrThrow({ where: { id }, select: clientSelect }));
  });
}

export const listDeletedQuestionsForAdmin = (
  db: Db,
  f: { limit: number; cursor?: [string, string] | undefined },
) => listDeletedQuestions(db, f);

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
    // Technologies no other live department uses go with it; shared ones stay. They are marked as archived
    // by this deletion, which is how a restore knows to bring them back.
    const exclusive = await exclusiveTechnologyIds(tx, id);
    await tx.tag.updateMany({
      where: { id: { in: exclusive } },
      data: { archivedAt: now, archivedByClientId: id },
    });
    await tx.client.update({ where: { id }, data: { deletedAt: now } });
    await recordAudit(tx, log, {
      type: 'CLIENT_DELETED',
      actorId: actor.id,
      payload: { clientId: id, name: current.name, technologiesArchived: exclusive.length },
    });
  });
}
