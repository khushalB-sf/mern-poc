import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { validateBody, validateParams } from '../../http/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import {
  clientImpact,
  createClient,
  createUser,
  deleteClient,
  deleteUser,
  listClients,
  listDeletedQuestionsForAdmin,
  listTechnologies,
  listUsers,
  restoreClient,
  restoreDeletedQuestion,
  setTechnologyRetired,
  setUserClients,
  updateClient,
  updateUser,
  type NewUser,
  type UserPatch,
} from './service.js';

const idParams = z.object({ id: z.uuid() });

const role = z.enum(['USER', 'AUTHOR', 'REVIEWER', 'ADMIN']);
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const name = z.string().trim().min(1).max(100);
// Upper bound keeps Argon2 from being used as a CPU-exhaustion lever (same as login).
const password = z.string().min(8).max(200);
const description = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .transform((v) => v || null); // blank clears it

export const createUserSchema = z.strictObject({
  email,
  name,
  password,
  role,
  clientIds: z.array(z.uuid()).max(100).default([]),
});
export const updateUserSchema = z
  .strictObject({
    name: name.optional(),
    email: email.optional(),
    role: role.optional(),
    active: z.boolean().optional(),
    password: password.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'At least one field is required');
export const userClientsSchema = z.strictObject({ clientIds: z.array(z.uuid()).max(100) });
export const createClientSchema = z.strictObject({ name, description: description.optional() });
export const updateClientSchema = z
  .strictObject({ name: name.optional(), description: description.optional() })
  .refine((o) => Object.keys(o).length > 0, 'At least one field is required');

/** Everything here is ADMIN-only; the gate is applied to the whole router before any validator runs. */
export function adminRoutes(db: Db, config: Config) {
  const router = Router();
  router.use(requireAuth(db, config), requireRole('ADMIN'));

  router.get('/users', async (_req, res) => {
    res.json({ items: await listUsers(db) });
  });

  router.post('/users', validateBody(createUserSchema), async (req, res) => {
    res.status(201).json({ user: await createUser(db, req.log, req.user!, req.body as NewUser) });
  });

  router.patch(
    '/users/:id',
    validateParams(idParams),
    validateBody(updateUserSchema),
    async (req, res) => {
      const { id } = res.locals.params as z.infer<typeof idParams>;
      res.json({ user: await updateUser(db, req.log, req.user!, id, req.body as UserPatch) });
    },
  );

  router.delete('/users/:id', validateParams(idParams), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    await deleteUser(db, req.log, req.user!, id);
    res.status(204).end();
  });

  router.put(
    '/users/:id/clients',
    validateParams(idParams),
    validateBody(userClientsSchema),
    async (req, res) => {
      const { id } = res.locals.params as z.infer<typeof idParams>;
      res.json({ user: await setUserClients(db, req.log, req.user!, id, req.body.clientIds) });
    },
  );

  router.get('/clients', async (req, res) => {
    res.json({ items: await listClients(db, { deleted: req.query.deleted === 'true' }) });
  });

  router.get('/clients/:id/impact', validateParams(idParams), async (_req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    res.json(await clientImpact(db, id));
  });

  router.post('/clients/:id/restore', validateParams(idParams), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    res.json({ client: await restoreClient(db, req.log, req.user!, id) });
  });

  router.post('/clients', validateBody(createClientSchema), async (req, res) => {
    res.status(201).json({ client: await createClient(db, req.log, req.user!, req.body) });
  });

  router.patch(
    '/clients/:id',
    validateParams(idParams),
    validateBody(updateClientSchema),
    async (req, res) => {
      const { id } = res.locals.params as z.infer<typeof idParams>;
      res.json({ client: await updateClient(db, req.log, req.user!, id, req.body) });
    },
  );

  router.delete('/clients/:id', validateParams(idParams), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    await deleteClient(db, req.log, req.user!, id);
    res.status(204).end();
  });

  router.get('/deleted-questions', async (_req, res) => {
    res.json({ items: await listDeletedQuestionsForAdmin(db) });
  });

  router.post('/questions/:id/restore', validateParams(idParams), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    await restoreDeletedQuestion(db, req.log, req.user!, id);
    res.status(204).end();
  });

  router.get('/technologies', async (_req, res) => {
    res.json({ items: await listTechnologies(db) });
  });

  for (const [action, retired] of [
    ['retire', true],
    ['restore', false],
  ] as const) {
    router.post(`/technologies/:id/${action}`, validateParams(idParams), async (req, res) => {
      const { id } = res.locals.params as z.infer<typeof idParams>;
      await setTechnologyRetired(db, req.log, req.user!, id, retired);
      res.status(204).end();
    });
  }

  return router;
}
