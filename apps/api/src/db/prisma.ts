import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

export type Db = PrismaClient;
/** The client or an interactive-transaction client: repos accept either so callers can compose transactions. */
export type Queryable = Db | Prisma.TransactionClient;

export interface DbOptions {
  /** A statement running longer than this is cancelled by Postgres (0 = no limit). */
  statementTimeoutMs?: number;
}

export function createDb(connectionString: string, opts: DbOptions = {}): Db {
  const { statementTimeoutMs = 0 } = opts;
  // `statement_timeout` is a pg connection setting: it applies to every connection the pool opens.
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      ...(statementTimeoutMs > 0 && { statement_timeout: statementTimeoutMs }),
    }),
  });
}
