import type { Logger } from 'pino';
import type { Db } from '../../db/prisma.js';
import { AppError, badRequest, notFound } from '../../http/errors.js';
import type { AuthUser } from '../../types/express.js';
import { recordAudit } from '../audit/audit.repo.js';
import { tagUsageCounts } from '../questions/question.repo.js';
import { freeValue, hasLetterOrDigit, keyOf, slugOf } from './technologies.js';

/**
 * Seniority levels, question types and any other category except technology. Technologies belong to
 * departments and are managed there; these are plain lists, so adding one is just adding it.
 */
const NOT_TECHNOLOGY = { category: { slug: { not: 'technology' } } } as const;
const exists = () => new AppError(409, 'TAG_EXISTS', 'That name is already used in this list');

export async function listTagCategories(db: Db) {
  const [categories, usage] = await Promise.all([
    db.tagCategory.findMany({
      where: { slug: { not: 'technology' } },
      orderBy: { name: 'asc' },
      include: { tags: { orderBy: { label: 'asc' } } },
    }),
    tagUsageCounts(db),
  ]);
  return categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    tags: c.tags.map((t) => ({
      id: t.id,
      value: t.value,
      label: t.label,
      archived: t.archivedAt !== null,
      questionCount: usage.get(t.id) ?? 0,
    })),
  }));
}

export async function addTag(db: Db, log: Logger, actor: AuthUser, slug: string, rawLabel: string) {
  const label = rawLabel.trim();
  if (!hasLetterOrDigit(label)) throw badRequest('Use letters or numbers in the name');
  return db.$transaction(async (tx) => {
    const category = await tx.tagCategory.findFirst({
      where: { slug, NOT: { slug: 'technology' } },
      include: { tags: { select: { label: true, value: true } } },
    });
    if (!category) throw notFound('List not found');
    const key = keyOf(label);
    if (category.tags.some((t) => keyOf(t.label) === key || keyOf(t.value) === key)) throw exists();
    const tag = await tx.tag.create({
      data: {
        categoryId: category.id,
        label,
        value: freeValue(slugOf(label), new Set(category.tags.map((t) => t.value))),
      },
    });
    await recordAudit(tx, log, {
      type: 'TAG_CREATED',
      actorId: actor.id,
      payload: { tagId: tag.id, label, category: slug },
    });
    return { id: tag.id, value: tag.value, label: tag.label };
  });
}

export async function renameTag(
  db: Db,
  log: Logger,
  actor: AuthUser,
  id: string,
  rawLabel: string,
) {
  const label = rawLabel.trim();
  if (!hasLetterOrDigit(label)) throw badRequest('Use letters or numbers in the name');
  return db.$transaction(async (tx) => {
    const current = await tx.tag.findFirst({ where: { id, ...NOT_TECHNOLOGY } });
    if (!current) throw notFound('Tag not found');
    const siblings = await tx.tag.findMany({
      where: { categoryId: current.categoryId, id: { not: id } },
      select: { label: true },
    });
    if (siblings.some((t) => keyOf(t.label) === keyOf(label))) throw exists();
    if (label !== current.label) {
      await tx.tag.update({ where: { id }, data: { label } });
      await recordAudit(tx, log, {
        type: 'TAG_UPDATED',
        actorId: actor.id,
        payload: { tagId: id, from: current.label, to: label },
      });
    }
    return { id, label };
  });
}

export async function setTagArchived(
  db: Db,
  log: Logger,
  actor: AuthUser,
  id: string,
  archived: boolean,
) {
  await db.$transaction(async (tx) => {
    const current = await tx.tag.findFirst({ where: { id, ...NOT_TECHNOLOGY } });
    if (!current || (current.archivedAt !== null) === archived) throw notFound('Tag not found');
    await tx.tag.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null, archivedByClientId: null },
    });
    await recordAudit(tx, log, {
      type: archived ? 'TAG_ARCHIVED' : 'TAG_RESTORED',
      actorId: actor.id,
      payload: { tagId: id, label: current.label },
    });
  });
}
