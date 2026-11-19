import type { Role } from '../generated/prisma/enums.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** An admin set this person's password: nothing but changing it is allowed until they have. */
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  /** Two-factor is required of admins and this admin has not set it up yet: only enrolment works. */
  mfaEnrollmentRequired: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** The session (refresh-token family) the access token belongs to. */
      sessionId?: string;
    }
  }
}
