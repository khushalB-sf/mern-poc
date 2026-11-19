import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { stringIdCursor } from '../../http/cursor.js';
import { validateBody, validateParams, validateQuery } from '../../http/validate.js';
import { recordBase } from '../../http/metrics.js';
import { auditRoutes } from './audit.js';
import { addTag, listTagCategories, renameTag, setTagArchived } from './tags.js';
import { createResetLink } from '../auth/credentials.js';
import { createMfa } from '../auth/mfa.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import {
  clientImpact,
  createClient,
  createUser,
  deleteClient,
  deleteUser,
  listClients,
  listDeletedQuestionsForAdmin,
  listUsers,
  restoreClient,
  restoreUser,
  restoreDeletedQuestion,
  setUserClients,
  updateClient,
  updateUser,
  type NewUser,
  type UserPatch,
} from './service.js';
import {
  addDepartmentTechnology,
  listDepartmentTechnologies,
  listOtherTechnologies,
  removeDepartmentTechnology,
  renameTechnology,
  restoreDepartmentTechnology,
  setOtherTechnologyArchived,
} from './technologies.js';

const idParams = z.object({ id: z.uuid() });
const slugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,40}$/) });

const userListQuery = z.strictObject({
  deleted: z
    .literal('true')
    .transform(() => true)
    .optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: stringIdCursor.optional(),
});
const deletedQuestionsQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: stringIdCursor.optional(),
});

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
export const technologyBody = z.strictObject({ label: z.string().trim().min(1).max(50) });
export const createClientSchema = z.strictObject({ name, description: description.optional() });
export const updateClientSchema = z
  .strictObject({ name: name.optional(), description: description.optional() })
  .refine((o) => Object.keys(o).length > 0, 'At least one field is required');

/** Everything here is ADMIN-only; the gate is applied to the whole router before any validator runs. */
export function adminRoutes(db: Db, config: Config, limit: RequestHandler) {
  const router = Router();
  router.use(requireAuth(db, config), limit, requireRole('ADMIN'));

  router.get('/users', validateQuery(userListQuery), async (_req, res) => {
    res.json(await listUsers(db, res.locals.query as z.infer<typeof userListQuery>));
  });

  router.post('/users/:id/mfa-reset', validateParams(idParams), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    await createMfa(db, config).adminReset(req.log, req.user!, id);
    res.status(204).end();
  });

  router.post('/users/:id/reset-link', validateParams(idParams), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    res.status(201).json(await createResetLink(db, req.log, req.user!, id));
  });

  router.post('/users/:id/restore', validateParams(idParams), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    res.json({ user: await restoreUser(db, req.log, req.user!, id) });
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

  router.use('/audit', recordBase, auditRoutes(db));

  router.get('/tag-categories', async (_req, res) => {
    res.json({ items: await listTagCategories(db) });
  });

  router.post(
    '/tag-categories/:slug/tags',
    validateParams(slugParams),
    validateBody(technologyBody),
    async (req, res) => {
      const { slug } = res.locals.params as z.infer<typeof slugParams>;
      res.status(201).json({ tag: await addTag(db, req.log, req.user!, slug, req.body.label) });
    },
  );

  router.patch(
    '/tags/:id',
    validateParams(idParams),
    validateBody(technologyBody),
    async (req, res) => {
      const { id } = res.locals.params as z.infer<typeof idParams>;
      res.json({ tag: await renameTag(db, req.log, req.user!, id, req.body.label) });
    },
  );

  for (const [action, archived] of [
    ['archive', true],
    ['restore', false],
  ] as const) {
    router.post(`/tags/:id/${action}`, validateParams(idParams), async (req, res) => {
      const { id } = res.locals.params as z.infer<typeof idParams>;
      await setTagArchived(db, req.log, req.user!, id, archived);
      res.status(204).end();
    });
  }

  router.get('/deleted-questions', validateQuery(deletedQuestionsQuery), async (_req, res) => {
    res.json(
      await listDeletedQuestionsForAdmin(
        db,
        res.locals.query as z.infer<typeof deletedQuestionsQuery>,
      ),
    );
  });

  router.post('/questions/:id/restore', validateParams(idParams), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    await restoreDeletedQuestion(db, req.log, req.user!, id);
    res.status(204).end();
  });

  router.get('/technologies/other', async (_req, res) => {
    res.json(await listOtherTechnologies(db));
  });

  for (const [action, archived] of [
    ['archive', true],
    ['restore', false],
  ] as const) {
    router.post(`/technologies/:id/${action}`, validateParams(idParams), async (req, res) => {
      const { id } = res.locals.params as z.infer<typeof idParams>;
      await setOtherTechnologyArchived(db, req.log, req.user!, id, archived);
      res.status(204).end();
    });
  }

  const clientTagParams = z.object({ id: z.uuid(), tagId: z.uuid() });

  router.get('/clients/:id/technologies', validateParams(idParams), async (_req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    res.json(await listDepartmentTechnologies(db, id));
  });

  router.post(
    '/clients/:id/technologies',
    validateParams(idParams),
    validateBody(technologyBody),
    async (req, res) => {
      const { id } = res.locals.params as z.infer<typeof idParams>;
      res.status(201).json({
        technology: await addDepartmentTechnology(db, req.log, req.user!, id, req.body.label),
      });
    },
  );

  router.delete(
    '/clients/:id/technologies/:tagId',
    validateParams(clientTagParams),
    async (req, res) => {
      const { id, tagId } = res.locals.params as z.infer<typeof clientTagParams>;
      await removeDepartmentTechnology(db, req.log, req.user!, id, tagId);
      res.status(204).end();
    },
  );

  router.post(
    '/clients/:id/technologies/:tagId/restore',
    validateParams(clientTagParams),
    async (req, res) => {
      const { id, tagId } = res.locals.params as z.infer<typeof clientTagParams>;
      await restoreDepartmentTechnology(db, req.log, req.user!, id, tagId);
      res.status(204).end();
    },
  );

  router.patch(
    '/technologies/:id',
    validateParams(idParams),
    validateBody(technologyBody),
    async (req, res) => {
      const { id } = res.locals.params as z.infer<typeof idParams>;
      res.json({ technology: await renameTechnology(db, req.log, req.user!, id, req.body.label) });
    },
  );

  return router;
}
