import { z } from 'zod';
import type { Queryable } from '../../db/prisma.js';
import { AppError } from '../../http/errors.js';

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

/** Flat, de-duplicated tag ids for writes (same validation as filters: unknown tags are a 400). */
export async function resolveTagIds(db: Queryable, tags: string[]): Promise<string[]> {
  return [...new Set((await resolveTagGroups(db, tags)).flat())];
}
