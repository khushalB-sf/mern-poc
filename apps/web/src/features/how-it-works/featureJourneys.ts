import type { Journey } from './JourneyFlow';

// One picture per feature walkthrough, same shape as the Start here picture. Numbers: 1 the click,
// 2 the request, 3 the gates, 4 the rules, 5 the query, 6 the rows or result, 7 the reply.
// Keep each line true to the matching walkthrough in features.tsx.

const BROWSER = 'React app';
const API = 'Express: route → service';
const DB = 'PostgreSQL via Prisma';

export const FEATURE_JOURNEYS: Record<string, Journey> = {
  login: {
    nodes: [
      {
        title: 'Your browser',
        what: 'The sign-in form checks the email shape, then sends it.',
        tech: BROWSER,
        steps: [{ n: 1, text: 'Enter email and password, click Sign in' }],
      },
      {
        title: 'The API (server)',
        what: 'Checks the password without revealing which emails exist.',
        tech: API,
        steps: [
          { n: 3, text: 'Gates: JSON body, Origin, input shape, attempt limit' },
          { n: 4, text: 'Service: find the user, check the Argon2 password hash, account active?' },
        ],
      },
      {
        title: 'The database',
        what: 'Finds the user and saves the new session.',
        tech: DB,
        chips: ['READ app_user', 'INSERT refresh_token'],
      },
    ],
    links: [
      {
        go: [2, 'Request', 'POST /api/auth/login'],
        back: [7, 'Reply', '200 + two cookies, or 401 / 429'],
      },
      {
        go: [5, 'SQL query', 'look up the email, store a token'],
        back: [6, 'Rows', 'the user and the saved token'],
      },
    ],
  },
  search: {
    nodes: [
      {
        title: 'Your browser',
        what: 'Turns the box and filters into a request.',
        tech: BROWSER,
        steps: [{ n: 1, text: 'Type in the search box or tick a tag filter' }],
      },
      {
        title: 'The API (server)',
        what: 'Checks the request, turns tag names into ids.',
        tech: API,
        steps: [
          { n: 3, text: 'Gates: signed in, under the rate limit, valid query' },
          { n: 4, text: 'Service: tag names become tag ids' },
        ],
      },
      {
        title: 'The database',
        what: 'One WHERE decides what you are allowed to see.',
        tech: DB,
        chips: ['READ question', 'READ question_tag · tag'],
      },
    ],
    links: [
      { go: [2, 'Request', 'GET /api/questions?q=…&tags=…'], back: [7, 'Reply', '200 + one page'] },
      {
        go: [5, 'SQL query', 'filters + the visibility rule'],
        back: [6, 'Rows', 'one page and the total'],
      },
    ],
  },
  open: {
    nodes: [
      {
        title: 'Your browser',
        what: 'Asks for the question and its history.',
        tech: BROWSER,
        steps: [{ n: 1, text: 'Click a question in the list' }],
      },
      {
        title: 'The API (server)',
        what: 'Visible first, history second.',
        tech: API,
        steps: [
          { n: 3, text: 'Gates: signed in, rate limit, id is a UUID' },
          { n: 4, text: 'Service: can you see it? If not, 404' },
        ],
      },
      {
        title: 'The database',
        what: 'The same visibility rule, applied by id.',
        tech: DB,
        chips: ['READ question', 'READ question_tag · tag', 'READ audit_event'],
      },
    ],
    links: [
      {
        go: [2, 'Requests', 'GET /api/questions/:id and its /history'],
        back: [7, 'Reply', '200, or 404 not found'],
      },
      {
        go: [5, 'SQL query', 'the question by id, through the rule'],
        back: [6, 'Rows', 'the question, tags, history'],
      },
    ],
  },
  create: {
    nodes: [
      {
        title: 'Your browser',
        what: 'The form checks the fields, then sends them.',
        tech: BROWSER,
        steps: [{ n: 1, text: 'Fill in the form, click Add question' }],
      },
      {
        title: 'The API (server)',
        what: 'Checks the cheap rules first, then the duplicate check.',
        tech: API,
        steps: [
          { n: 3, text: 'Gates: signed in, Author or Admin, input shape' },
          { n: 4, text: 'Service: department visible, tags exist, not a duplicate' },
        ],
      },
      {
        title: 'The database',
        what: 'Three tables change in one transaction.',
        tech: DB,
        chips: ['INSERT question', 'INSERT question_tag', 'INSERT audit_event'],
      },
    ],
    links: [
      { go: [2, 'Request', 'POST /api/questions'], back: [7, 'Reply', '201 + the new question'] },
      {
        go: [5, 'SQL', 'one transaction: all succeed or all fail'],
        back: [6, 'Rows', 'the saved question'],
      },
    ],
  },
  edit: {
    nodes: [
      {
        title: 'Your browser',
        what: 'Sends only the fields you may change.',
        tech: BROWSER,
        steps: [{ n: 1, text: 'Change the question, click Save changes' }],
      },
      {
        title: 'The API (server)',
        what: 'Visibility, then role, then what changed.',
        tech: API,
        steps: [
          { n: 3, text: 'Gates: signed in, input shape' },
          {
            n: 4,
            text: 'Service: can you see it, may you edit it, was it changed by someone else?',
          },
        ],
      },
      {
        title: 'The database',
        what: 'The update and its audit row commit together.',
        tech: DB,
        chips: ['UPDATE question', 'DELETE + INSERT question_tag', 'INSERT audit_event'],
      },
    ],
    links: [
      {
        go: [2, 'Request', 'PATCH /api/questions/:id'],
        back: [7, 'Reply', '200, or 403 / 404 / 409'],
      },
      {
        go: [5, 'SQL', 'one transaction: update + audit'],
        back: [6, 'Rows', 'the updated question'],
      },
    ],
  },
  review: {
    nodes: [
      {
        title: 'Your browser',
        what: 'Sends the decision and your note.',
        tech: BROWSER,
        steps: [{ n: 1, text: 'Open a pending question, click Approve or Reject' }],
      },
      {
        title: 'The API (server)',
        what: 'Locks the row, then checks visibility, role and state.',
        tech: API,
        steps: [
          { n: 3, text: 'Gates: signed in, input shape' },
          { n: 4, text: 'Service: Reviewer or Admin, not your own question, still pending' },
        ],
      },
      {
        title: 'The database',
        what: 'The decision and its record commit together.',
        tech: DB,
        chips: [
          'READ question (row lock)',
          'UPDATE question',
          'INSERT audit_event',
          'INSERT notification',
        ],
      },
    ],
    links: [
      {
        go: [2, 'Request', 'POST /api/questions/:id/review'],
        back: [7, 'Reply', '200, or 403 / 404 / 409'],
      },
      {
        go: [5, 'SQL', 'lock the row, then write the decision'],
        back: [6, 'Rows', 'the reviewed question'],
      },
    ],
  },
  technologies: {
    nodes: [
      {
        title: 'Your browser',
        what: 'Sends the technology name.',
        tech: BROWSER,
        steps: [{ n: 1, text: 'Edit a department, add a technology' }],
      },
      {
        title: 'The API (server)',
        what: 'Matches the name, then links an existing one or creates a new one.',
        tech: API,
        steps: [
          { n: 3, text: 'Gates: signed in, Admin only, input shape' },
          { n: 4, text: 'Service: department exists, name is valid, link or create' },
        ],
      },
      {
        title: 'The database',
        what: 'At most three rows change in one transaction.',
        tech: DB,
        chips: ['INSERT or UPDATE tag', 'INSERT department_tag', 'INSERT audit_event'],
      },
    ],
    links: [
      {
        go: [2, 'Request', 'POST /api/admin/clients/:id/technologies'],
        back: [7, 'Reply', '200 + the updated department'],
      },
      {
        go: [5, 'SQL', 'one transaction'],
        back: [6, 'Rows', 'the new link'],
      },
    ],
  },
  'delete-department': {
    nodes: [
      {
        title: 'Your browser',
        what: 'Shows what will be hidden before you confirm.',
        tech: BROWSER,
        steps: [{ n: 1, text: 'Click Delete and read the impact' }],
      },
      {
        title: 'The API (server)',
        what: 'Works out which technologies only this department used.',
        tech: API,
        steps: [
          { n: 3, text: 'Gates: signed in, Admin only, id is a UUID' },
          { n: 4, text: 'Service: department exists and is not already deleted' },
        ],
      },
      {
        title: 'The database',
        what: 'Nothing is erased. Questions are not touched.',
        tech: DB,
        chips: ['UPDATE tag (archive)', 'UPDATE department (deleted_at)', 'INSERT audit_event'],
      },
    ],
    links: [
      {
        go: [2, 'Requests', 'GET …/impact, then DELETE /api/admin/clients/:id'],
        back: [7, 'Reply', '200 (restore: POST …/restore)'],
      },
      {
        go: [5, 'SQL', 'one transaction'],
        back: [6, 'Rows', 'hidden, not deleted'],
      },
    ],
  },
  refresh: {
    nodes: [
      {
        title: 'Your browser',
        what: 'Refreshes the session once and repeats the request.',
        tech: BROWSER,
        steps: [{ n: 1, text: 'You keep working; after 15 minutes one request gets 401' }],
      },
      {
        title: 'The API (server)',
        what: 'Each refresh token works exactly once.',
        tech: API,
        steps: [
          { n: 3, text: 'Gate: the refresh cookie is present and its signature is valid' },
          { n: 4, text: 'Service: matches the hash, not used, not revoked, account active' },
        ],
      },
      {
        title: 'The database',
        what: 'Rotates the token. A replay revokes the whole family.',
        tech: DB,
        chips: ['READ refresh_token', 'UPDATE used_at', 'INSERT next token'],
      },
    ],
    links: [
      {
        go: [2, 'Request', 'POST /api/auth/refresh'],
        back: [7, 'Reply', '200 + new cookies, or 401'],
      },
      {
        go: [5, 'SQL', 'compare, mark used, store the next one'],
        back: [6, 'Rows', 'the new token'],
      },
    ],
  },
};
