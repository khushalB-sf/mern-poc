import { z } from 'zod';

/** A cursor is the sort key of the last row on the page, as JSON, base64url-encoded. */
export const encodeCursor = (parts: unknown[]) =>
  Buffer.from(JSON.stringify(parts)).toString('base64url');

const decode = (raw: string): unknown => {
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString());
  } catch {
    return null;
  }
};

/** A query-string cursor holding exactly one string and one uuid (e.g. [name, id]). Anything else is a 400. */
export const stringIdCursor = z
  .string()
  .max(400)
  .transform((raw, ctx) => {
    const v = decode(raw);
    const ok =
      Array.isArray(v) &&
      v.length === 2 &&
      typeof v[0] === 'string' &&
      typeof v[1] === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v[1]);
    if (!ok) ctx.addIssue({ code: 'custom', message: 'Invalid cursor' });
    return ok ? ([v[0], v[1]] as [string, string]) : (['', ''] as [string, string]);
  });
