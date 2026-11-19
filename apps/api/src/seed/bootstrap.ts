import type { Logger } from 'pino';
import type { Db } from '../db/prisma.js';
import { AppError } from '../http/errors.js';
import { recordAudit } from '../modules/audit/audit.repo.js';
import { hashPassword } from '../modules/auth/password.js';
import { passwordProblem } from '../modules/auth/passwordPolicy.js';

/**
 * The first admin of a real deployment, from ADMIN_EMAIL and ADMIN_PASSWORD, instead of a demo account with
 * a published password. Idempotent: it only acts when there is no active admin, so it is safe on every start,
 * and it is also the way back in if every admin was deactivated. The password is temporary: the admin
 * must choose their own at first sign-in.
 */
export async function bootstrapAdmin(
  db: Db,
  log: Logger,
  input: { email: string; password: string },
): Promise<'created' | 'skipped'> {
  const email = input.email.trim().toLowerCase();
  const problem = passwordProblem(input.password, { email, name: 'Administrator' });
  if (problem) throw new Error(`ADMIN_PASSWORD is not acceptable: ${problem}`);

  const active = await db.appUser.count({
    where: { role: 'ADMIN', active: true, deletedAt: null },
  });
  if (active > 0) return 'skipped';
  if (await db.appUser.findUnique({ where: { email } })) {
    throw new Error(
      `ADMIN_EMAIL ${email} already belongs to an account that is not an active admin`,
    );
  }
  const passwordHash = await hashPassword(input.password);
  await db.$transaction(async (tx) => {
    const admin = await tx.appUser.create({
      data: { email, name: 'Administrator', role: 'ADMIN', passwordHash, mustChangePassword: true },
    });
    await recordAudit(tx, log, {
      type: 'USER_CREATED',
      actorId: admin.id,
      payload: { userId: admin.id, email, role: 'ADMIN', bootstrap: true },
    });
  });
  return 'created';
}

export { AppError };
