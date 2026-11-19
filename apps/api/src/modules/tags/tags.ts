import { z } from 'zod';
import type { Queryable } from '../../db/prisma.js';
import { AppError } from '../../http/errors.js';
import { globalTagIds, type Actor } from '../questions/question.repo.js';

/** "category:value", lowercase slugs, e.g. technology:react or type:system-design. */
export const tagString = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9.-]*$/, 'must look like category:value');

/** Query-string form: comma-separated list of category:value. */
export const tagListParam = z
  .string()
  .max(1000)
  .transform((s) =>
    s
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  )
  .pipe(z.array(tagString).max(30));

/**
 * Resolves "category:value" strings to tag ids, grouped by category: each inner array is an
 * OR-set, the outer array is AND'ed (ADR-004). Unknown categories/values are a 400.
 * The tag table is global and not sensitive, so naming the bad input leaks nothing.
 */
export async function resolveTagGroups(db: Queryable, tags: string[]): Promise<string[][]> {
  if (tags.length === 0) return [];
  const wanted = new Map<string, Set<string>>();
  for (const t of tags) {
    const [category, value] = t.split(':') as [string, string];
    wanted.set(category, (wanted.get(category) ?? new Set()).add(value));
  }

  const found = await db.tagCategory.findMany({
    where: { slug: { in: [...wanted.keys()] } },
    include: {
      tags: { where: { value: { in: [...new Set(tags.map((t) => t.split(':')[1]!))] } } },
    },
  });
  const bySlug = new Map(found.map((c) => [c.slug, c]));

  const groups: string[][] = [];
  for (const [category, values] of wanted) {
    const cat = bySlug.get(category);
    if (!cat) throw new AppError(400, 'UNKNOWN_TAG_CATEGORY', `Unknown tag category "${category}"`);
    const ids: string[] = [];
    for (const value of values) {
      const tag = cat.tags.find((t) => t.value === value);
      if (!tag) throw new AppError(400, 'UNKNOWN_TAG', `Unknown tag "${category}:${value}"`);
      ids.push(tag.id);
    }
    groups.push(ids);
  }
  return groups;
}

/**
 * Flat, de-duplicated tag ids for writes (same validation as filters: unknown tags are a 400).
 * - An archived tag cannot be newly attached.
 * - On a department question, a technology must be one of that department's (`departmentId`). A global
 *   question (`departmentId` null) may use any active technology.
 * `alreadyOn` lists the "category:value" tags the question already carries; those stay allowed, so an
 * edit does not fail on a tag archived or unlinked after the fact.
 */
export async function resolveTagIds(
  db: Queryable,
  tags: string[],
  alreadyOn: string[] = [],
  departmentId: string | null = null,
): Promise<string[]> {
  const ids = [...new Set((await resolveTagGroups(db, tags)).flat())];
  if (ids.length === 0) return ids;
  const rows = await db.tag.findMany({
    where: { id: { in: ids } },
    select: { id: true, value: true, archivedAt: true, category: { select: { slug: true } } },
  });
  const fresh = rows.filter((t) => !alreadyOn.includes(`${t.category.slug}:${t.value}`));
  const name = (t: (typeof rows)[number]) => `${t.category.slug}:${t.value}`;

  const archived = fresh.filter((t) => t.archivedAt);
  if (archived.length > 0) {
    throw new AppError(
      400,
      'TAG_ARCHIVED',
      `Tag no longer available: ${archived.map(name).join(', ')}`,
    );
  }
  if (departmentId) {
    const technologies = fresh.filter((t) => t.category.slug === 'technology');
    const linked = new Set(
      (
        await db.departmentTag.findMany({
          where: { departmentId, tagId: { in: technologies.map((t) => t.id) } },
          select: { tagId: true },
        })
      ).map((l) => l.tagId),
    );
    const outside = technologies.filter((t) => !linked.has(t.id));
    if (outside.length > 0) {
      throw new AppError(
        400,
        'TAG_NOT_IN_DEPARTMENT',
        `Not a technology of this department: ${outside.map(name).join(', ')}`,
      );
    }
  }
  return ids;
}

/**
 * Technologies no live department uses ("Other" in the UI). Active ones are offered to everyone as an
 * "Other" group; the admin manages them on the Departments page.
 */
export async function orphanTagIds(db: Queryable): Promise<Set<string>> {
  const rows = await db.tag.findMany({
    where: {
      category: { slug: 'technology' },
      archivedAt: null,
      departments: { none: { department: { deletedAt: null } } },
    },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/**
 * Technology tag ids to offer as list filters, or null for no narrowing (admins). Everyone else gets
 * the technologies of the departments they are granted (without any, those on global questions), plus
 * the unassigned "Other" ones.
 */
export async function filterTechnologyIds(
  db: Queryable,
  actor: Actor,
): Promise<Set<string> | null> {
  if (actor.role === 'ADMIN') return null;
  const links = await db.departmentTag.findMany({
    where: {
      department: { deletedAt: null, grants: { some: { userId: actor.id } } },
      tag: { archivedAt: null },
    },
    select: { tagId: true },
    distinct: ['tagId'],
  });
  const own = links.length > 0 ? new Set(links.map((l) => l.tagId)) : await globalTagIds(db);
  for (const id of await orphanTagIds(db)) own.add(id);
  return own;
}
