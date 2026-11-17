import type { Logger } from 'pino';
import { Prisma } from '../../generated/prisma/client.js';
import type { Db, Queryable } from '../../db/prisma.js';
import { AppError, badRequest, notFound } from '../../http/errors.js';
import type { AuthUser } from '../../types/express.js';
import { recordAudit } from '../audit/audit.repo.js';
import { tagUsageCounts } from '../questions/question.repo.js';

/**
 * Technologies belong to departments (many-to-many, `client_tag`). A technology is "exclusive" to a
 * department when no other live department uses it: only those are archived along with it. Archived
 * technologies keep their links, so each department can list and restore its own.
 */
const IN_TECH = { category: { slug: 'technology' } } as const;

const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** "Node.js", "node-js" and "nodejs" are the same technology. */
const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const liveDepartment = async (db: Queryable, id: string) => {
  const c = await db.client.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!c) throw notFound('Department not found');
};

/** Ids of the department's active technologies that no other live department uses. */
export async function exclusiveTechnologyIds(db: Queryable, clientId: string): Promise<string[]> {
  const tags = await db.tag.findMany({
    where: { ...IN_TECH, archivedAt: null, clients: { some: { clientId } } },
    select: {
      id: true,
      clients: { select: { clientId: true, client: { select: { deletedAt: true } } } },
    },
  });
  return tags
    .filter((t) => !t.clients.some((l) => l.clientId !== clientId && l.client.deletedAt === null))
    .map((t) => t.id);
}

export async function listDepartmentTechnologies(db: Db, clientId: string) {
  await liveDepartment(db, clientId);
  const [links, available, usage] = await Promise.all([
    db.clientTag.findMany({
      where: { clientId, tag: IN_TECH },
      select: {
        tag: {
          select: {
            id: true,
            value: true,
            label: true,
            archivedAt: true,
            clients: { select: { clientId: true, client: { select: { deletedAt: true } } } },
          },
        },
      },
    }),
    db.tag.findMany({
      where: { ...IN_TECH, archivedAt: null, clients: { none: { clientId } } },
      orderBy: { label: 'asc' },
      select: { id: true, label: true },
    }),
    tagUsageCounts(db),
  ]);
  const rows = links
    .map(({ tag: t }) => ({
      id: t.id,
      value: t.value,
      label: t.label,
      archived: t.archivedAt !== null,
      questionCount: usage.get(t.id) ?? 0,
      shared: t.clients.some((l) => l.clientId !== clientId && l.client.deletedAt === null),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return {
    active: rows.filter((r) => !r.archived),
    archived: rows.filter((r) => r.archived),
    available,
  };
}

/** Adds a technology to a department: links the existing one when the name matches, else creates it. */
export async function addDepartmentTechnology(
  db: Db,
  log: Logger,
  actor: AuthUser,
  clientId: string,
  rawLabel: string,
) {
  const label = rawLabel.trim();
  const key = keyOf(label);
  if (!key) throw badRequest('Use letters or numbers in the name');

  const run = () =>
    db.$transaction(async (tx) => {
      await liveDepartment(tx, clientId);
      const all = await tx.tag.findMany({
        where: IN_TECH,
        select: { id: true, value: true, label: true, archivedAt: true },
      });
      const existing = all.find((t) => keyOf(t.label) === key || keyOf(t.value) === key);
      let tag = existing;
      if (!tag) {
        const category = await tx.tagCategory.findUniqueOrThrow({ where: { slug: 'technology' } });
        tag = await tx.tag.create({
          data: { categoryId: category.id, value: slugOf(label), label },
          select: { id: true, value: true, label: true, archivedAt: true },
        });
        await recordAudit(tx, log, {
          type: 'TAG_CREATED',
          actorId: actor.id,
          payload: { tagId: tag.id, label },
        });
      } else if (tag.archivedAt) {
        await tx.tag.update({ where: { id: tag.id }, data: { archivedAt: null } });
        await recordAudit(tx, log, {
          type: 'TAG_RESTORED',
          actorId: actor.id,
          payload: { tagId: tag.id, label: tag.label },
        });
      }
      const link = await tx.clientTag.createMany({
        data: [{ clientId, tagId: tag.id }],
        skipDuplicates: true,
      });
      if (link.count > 0) {
        await recordAudit(tx, log, {
          type: 'TAG_LINKED',
          actorId: actor.id,
          payload: { tagId: tag.id, label: tag.label, clientId },
        });
      }
      return { id: tag.id, label: tag.label, created: !existing };
    });
  try {
    return await run();
  } catch (e) {
    // Two admins adding the same new name at once: the unique index decides, the loser just links.
    if (isUnique(e)) return run();
    throw e;
  }
}

/** Shared technology: unlink from this department only. Exclusive: archive it (the link stays). */
export async function removeDepartmentTechnology(
  db: Db,
  log: Logger,
  actor: AuthUser,
  clientId: string,
  tagId: string,
) {
  await db.$transaction(async (tx) => {
    await liveDepartment(tx, clientId);
    const link = await tx.clientTag.findFirst({
      where: { clientId, tagId, tag: { ...IN_TECH, archivedAt: null } },
      select: { tag: { select: { label: true } } },
    });
    if (!link) throw notFound('Technology not found in this department');
    const exclusive = (await exclusiveTechnologyIds(tx, clientId)).includes(tagId);
    const payload = { tagId, label: link.tag.label, clientId };
    if (exclusive) {
      await tx.tag.update({ where: { id: tagId }, data: { archivedAt: new Date() } });
      await recordAudit(tx, log, { type: 'TAG_ARCHIVED', actorId: actor.id, payload });
    } else {
      await tx.clientTag.delete({ where: { clientId_tagId: { clientId, tagId } } });
      await recordAudit(tx, log, { type: 'TAG_UNLINKED', actorId: actor.id, payload });
    }
  });
}

export async function restoreDepartmentTechnology(
  db: Db,
  log: Logger,
  actor: AuthUser,
  clientId: string,
  tagId: string,
) {
  await db.$transaction(async (tx) => {
    await liveDepartment(tx, clientId);
    const link = await tx.clientTag.findFirst({
      where: { clientId, tagId, tag: { ...IN_TECH, archivedAt: { not: null } } },
      select: { tag: { select: { label: true } } },
    });
    if (!link) throw notFound('Archived technology not found in this department');
    await tx.tag.update({ where: { id: tagId }, data: { archivedAt: null } });
    await recordAudit(tx, log, {
      type: 'TAG_RESTORED',
      actorId: actor.id,
      payload: { tagId, label: link.tag.label, clientId },
    });
  });
}

/** Label only: the value (slug) appears in URLs and saved filters, so it never changes. */
export async function renameTechnology(
  db: Db,
  log: Logger,
  actor: AuthUser,
  tagId: string,
  rawLabel: string,
) {
  const label = rawLabel.trim();
  const key = keyOf(label);
  if (!key) throw badRequest('Use letters or numbers in the name');
  return db.$transaction(async (tx) => {
    const all = await tx.tag.findMany({ where: IN_TECH, select: { id: true, label: true } });
    const current = all.find((t) => t.id === tagId);
    if (!current) throw notFound('Technology not found');
    if (all.some((t) => t.id !== tagId && keyOf(t.label) === key)) {
      throw new AppError(409, 'TECHNOLOGY_EXISTS', 'A technology with this name already exists');
    }
    if (label !== current.label) {
      await tx.tag.update({ where: { id: tagId }, data: { label } });
      await recordAudit(tx, log, {
        type: 'TAG_UPDATED',
        actorId: actor.id,
        payload: { tagId, from: current.label, to: label },
      });
    }
    return { id: tagId, label };
  });
}

const NO_LIVE_DEPARTMENT = { clients: { none: { client: { deletedAt: null } } } } as const;

/** The "Other" group: technologies no live department uses, active and archived. */
export async function listOtherTechnologies(db: Db) {
  const [tags, usage] = await Promise.all([
    db.tag.findMany({
      where: { ...IN_TECH, ...NO_LIVE_DEPARTMENT },
      orderBy: { label: 'asc' },
      select: { id: true, value: true, label: true, archivedAt: true },
    }),
    tagUsageCounts(db),
  ]);
  const rows = tags.map((t) => ({
    id: t.id,
    value: t.value,
    label: t.label,
    archived: t.archivedAt !== null,
    questionCount: usage.get(t.id) ?? 0,
    shared: false,
  }));
  return { active: rows.filter((r) => !r.archived), archived: rows.filter((r) => r.archived) };
}

/**
 * Archive or restore an "Other" technology. One that a live department uses is managed from that
 * department (Remove / Restore there), so it is refused here.
 */
export async function setOtherTechnologyArchived(
  db: Db,
  log: Logger,
  actor: AuthUser,
  tagId: string,
  archived: boolean,
) {
  await db.$transaction(async (tx) => {
    const current = await tx.tag.findFirst({
      where: { id: tagId, ...IN_TECH },
      select: {
        label: true,
        archivedAt: true,
        clients: { select: { client: { select: { deletedAt: true } } } },
      },
    });
    if (!current) throw notFound('Technology not found');
    if (current.clients.some((l) => l.client.deletedAt === null)) {
      throw new AppError(
        409,
        'TECHNOLOGY_IN_DEPARTMENT',
        'This technology belongs to a department. Manage it from there.',
      );
    }
    if ((current.archivedAt !== null) === archived) throw notFound('Technology not found');
    await tx.tag.update({
      where: { id: tagId },
      data: { archivedAt: archived ? new Date() : null },
    });
    await recordAudit(tx, log, {
      type: archived ? 'TAG_ARCHIVED' : 'TAG_RESTORED',
      actorId: actor.id,
      payload: { tagId, label: current.label },
    });
  });
}
