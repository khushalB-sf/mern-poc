import { Prisma } from '../../generated/prisma/client.js';

/** A database unique-constraint violation (the email or the department name is taken). */
export const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
