import argon2 from 'argon2';

// argon2id with the library defaults (m=64 MiB, t=3, p=4), which meet the OWASP minimum.
export const hashPassword = (plain: string) => argon2.hash(plain, { type: argon2.argon2id });

export const verifyPassword = (hash: string, plain: string) =>
  argon2.verify(hash, plain).catch(() => false);

/**
 * Verified against when the email is unknown, so "no such user" costs the same as "wrong password"
 * and response time does not reveal which emails exist.
 */
let dummyHash: Promise<string> | undefined;
export const equaliseTiming = async (plain: string) => {
  dummyHash ??= hashPassword('not-a-real-password');
  await verifyPassword(await dummyHash, plain);
};
