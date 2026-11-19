import { ApiError } from './client';

/** The API says a picked technology is archived or not one of the department's (an admin changed it). */
export const isTagConflict = (e: unknown): boolean =>
  e instanceof ApiError && (e.code === 'TAG_ARCHIVED' || e.code === 'TAG_NOT_IN_DEPARTMENT');

export const TAG_CONFLICT_MESSAGE =
  'A technology you picked is no longer available for this question. The technologies were refreshed: check your tags and try again.';
