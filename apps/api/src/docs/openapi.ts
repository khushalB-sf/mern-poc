import { adminPaths } from './paths.admin.js';
import { paths } from './paths.js';
import { schemas } from './schemas.js';

export function buildOpenApi() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Interview Question Bank API',
      version: '0.1.0',
      description: [
        'Shared question bank with department-restricted visibility and a review workflow. (A department is called a "client" in field and path names.)',
        '',
        '**Authenticating in this page:** call `POST /auth/login` below with "Try it out". The server sets two httpOnly cookies (`access_token`, `refresh_token`); the browser then sends them automatically on every later "Try it out" call. Tokens never appear in response bodies. Use `POST /auth/logout` to end the session.',
        '',
        '**Visibility guarantee:** a question tied to a client is visible only to users granted that client. The rule is part of the SQL query itself, so a user without the grant gets results indistinguishable from a genuine zero-match, and the same `404` for that question by ID as for a nonexistent one. Counts, tags, history and duplicate matches obey the same rule.',
        '',
        '**Roles:** `USER` read-only (approved questions only); `AUTHOR` adds questions and edits their own (an edit sends it back for review); `REVIEWER` approves or rejects pending questions with a note; `ADMIN` does everything: manages users and departments, and adds, edits, reviews and deletes any question (admin-made questions are approved immediately). Only `ADMIN` bypasses department grants. **Deletes are soft:** a deleted user, department or question disappears from every list and lookup, and its history is kept.',
        '',
        '**Review workflow:** new and edited questions are `PENDING`. Users see only `APPROVED` questions; authors also see their own at any status; reviewers see every status within their departments.',
      ].join('\n'),
    },
    servers: [{ url: '/api' }],
    tags: [
      { name: 'Auth' },
      { name: 'Questions' },
      { name: 'Reference data' },
      { name: 'Admin', description: 'ADMIN role only' },
      { name: 'System' },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
          description: 'httpOnly cookie set by /auth/login',
        },
      },
      schemas,
    },
    paths: { ...paths, ...adminPaths },
  };
}
