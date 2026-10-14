import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

export type Db = PrismaClient;
/** The client or an interactive-transaction client: repos accept either so callers can compose transactions. */
export type Queryable = Db | Prisma.TransactionClient;

export function createDb(connectionString: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
