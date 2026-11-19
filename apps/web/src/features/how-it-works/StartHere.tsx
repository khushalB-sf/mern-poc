import type { ReactNode } from 'react';
import { Code } from './Flow';
import { JourneyFlow, type Journey } from './JourneyFlow';

// A starting point for someone new to backend work: what happens when you click something, and what the
// words used on the rest of this page mean. Every "in this app" note names real code in this repository.

export const STORY: { title: string; text: ReactNode }[] = [
  {
    title: 'You click “Search”',
    text: (
      <>
        The page you see is a <strong>React app</strong> running in your browser. It cannot read the
        database itself, so it asks a server for the data.
      </>
    ),
  },
  {
    title: 'The browser sends a request',
    text: (
      <>
        A <strong>request</strong> is a short message over HTTP. It says what you want (for example{' '}
        <Code>GET /api/questions?q=closure</Code>) and carries your login cookie.
      </>
    ),
  },
  {
    title: 'The server checks the request',
    text: (
      <>
        The <strong>API</strong> (a program built with Express) runs a few checks in order. Are you
        signed in? Is the request shaped correctly? Are you allowed to do this? If a check fails, it
        stops and sends back an error.
      </>
    ),
  },
  {
    title: 'The code decides what to do',
    text: (
      <>
        The <strong>route</strong> calls a <strong>service</strong>: a plain function that holds the
        business rules. The service asks the database for the data.
      </>
    ),
  },
  {
    title: 'The database answers',
    text: (
      <>
        <strong>PostgreSQL</strong> stores everything in tables. The server asks with a{' '}
        <strong>SQL query</strong>, and the database returns only the rows that match.
      </>
    ),
  },
  {
    title: 'The server replies',
    text: (
      <>
        The server sends a <strong>response</strong>: a status code (such as <Code>200</Code> for
        success or <Code>404</Code> for not found) and the data as <strong>JSON</strong>. React then
        draws it on the screen.
      </>
    ),
  },
];

export interface Term {
  term: string;
  meaning: ReactNode;
}
export interface TermGroup {
  id: string;
  title: string;
  terms: Term[];
}

export const TERM_GROUPS: TermGroup[] = [
  {
    id: 'web',
    title: 'How the web talks',
    terms: [
      {
        term: 'API',
        meaning:
          'A set of addresses a program can call to get or change data. Here, the React app calls our API; people never do.',
      },
      {
        term: 'Route (endpoint)',
        meaning: (
          <>
            One address plus a method, for example <Code>POST /api/questions</Code> to add a
            question. Each route is one small function.
          </>
        ),
      },
      {
        term: 'HTTP method',
        meaning:
          'The verb of a request. GET reads, POST creates or performs an action, PATCH changes part of something, PUT replaces something, DELETE removes it.',
      },
      {
        term: 'Status code',
        meaning: (
          <>
            A number in the response that says how it went. <Code>200</Code> OK, <Code>201</Code>{' '}
            created, <Code>204</Code> done with nothing to return, <Code>400</Code> bad input,{' '}
            <Code>401</Code> not signed in, <Code>403</Code> signed in but not allowed,{' '}
            <Code>404</Code> not found, <Code>409</Code> conflict, <Code>429</Code> too many
            requests, <Code>500</Code> a bug on the server.
          </>
        ),
      },
      {
        term: 'JSON',
        meaning: 'A text format for data, like { "name": "Ada" }. Requests and responses use it.',
      },
      {
        term: 'Cookie',
        meaning:
          'A small piece of data the browser keeps and sends back with every request. We use cookies to remember that you are signed in.',
      },
    ],
  },
  {
    id: 'code',
    title: 'How the code is organised',
    terms: [
      {
        term: 'Middleware',
        meaning:
          'A function that runs on every request before your route. It can check something, change the request, or stop it with an error.',
      },
      {
        term: 'Handler (controller)',
        meaning:
          'The function behind a route. In this app it stays thin: read the input, call a service, send the result.',
      },
      {
        term: 'Service',
        meaning:
          'A function that holds the real rules, such as “only the author may edit”. It does not know about HTTP, so it is easy to test.',
      },
      {
        term: 'Repository',
        meaning: (
          <>
            The code that talks to the database. Here that is mainly <Code>question.repo.ts</Code>.
          </>
        ),
      },
      {
        term: 'Validation and schema',
        meaning: (
          <>
            Checking that incoming data has the right shape before using it. A <em>schema</em>{' '}
            describes that shape. We write schemas with a library called Zod.
          </>
        ),
      },
      {
        term: 'TypeScript',
        meaning:
          'JavaScript with types. The editor and the compiler catch many mistakes before the code runs.',
      },
      {
        term: 'Monorepo',
        meaning: 'One repository holding more than one app. Ours holds the API and the web app.',
      },
    ],
  },
  {
    id: 'data',
    title: 'The database',
    terms: [
      {
        term: 'Table, row, column',
        meaning:
          'A table is like a spreadsheet tab. Each row is one record (one question). Each column is one property (its text).',
      },
      {
        term: 'Primary key',
        meaning:
          'The column that identifies a row, such as an id. No two rows share it, and looking a row up by it is fast.',
      },
      {
        term: 'Foreign key and relationship',
        meaning:
          'A column that points at a row in another table, such as a question’s author_id. It links the tables together.',
      },
      {
        term: 'One-to-many and many-to-many',
        meaning:
          'One user has many questions (one-to-many). A user can see many departments and a department can have many users (many-to-many), which needs a small link table between them.',
      },
      {
        term: 'Index',
        meaning:
          'Like the index of a book: a structure that lets the database find rows without reading the whole table.',
      },
      {
        term: 'SQL and query',
        meaning:
          'SQL is the language for asking a database questions. A query is one such question.',
      },
      {
        term: 'ORM (Prisma)',
        meaning:
          'A library that lets code talk to the database using normal objects instead of writing all the SQL by hand. We use Prisma.',
      },
      {
        term: 'Migration',
        meaning:
          'A saved, numbered change to the database structure, such as adding a column. Running the migrations in order builds the same database anywhere.',
      },
      {
        term: 'Transaction',
        meaning:
          'A group of changes that either all succeed or all fail. Saving a question and its audit row happen in one, so you never get half.',
      },
      {
        term: 'Lock',
        meaning:
          'A way to make other requests wait for the same row. It stops two reviewers from deciding on one question at the same moment.',
      },
      {
        term: 'Soft delete',
        meaning: (
          <>
            Marking a row as deleted (with a <Code>deleted_at</Code> time) instead of removing it.
            Nothing is lost, and an admin can restore it.
          </>
        ),
      },
      {
        term: 'Audit log',
        meaning:
          'A permanent record of who did what and when. In this app nobody can edit or remove its rows.',
      },
      {
        term: 'Pagination',
        meaning:
          'Returning a long list in pages instead of all at once. Offset paging says “skip 40, give me 20”. Cursor paging says “continue after this row”.',
      },
    ],
  },
  {
    id: 'safety',
    title: 'Keeping it safe',
    terms: [
      {
        term: 'Authentication',
        meaning: 'Proving who you are, for example by signing in with an email and password.',
      },
      {
        term: 'Authorization',
        meaning:
          'Deciding what you are allowed to do once we know who you are. Hiding a button is not enough: the server must check.',
      },
      {
        term: 'Session',
        meaning: 'The period during which you stay signed in.',
      },
      {
        term: 'Token and JWT',
        meaning:
          'A token is a small proof of sign-in. A JWT is a token that is signed, so the server can tell it was not faked.',
      },
      {
        term: 'Refresh token',
        meaning:
          'A longer-lived token used only to get a new short-lived one. Each works once, so a stolen copy is noticed.',
      },
      {
        term: 'httpOnly cookie',
        meaning:
          'A cookie that scripts on the page cannot read. Our tokens live in these, so a script that sneaks into the page cannot steal them.',
      },
      {
        term: 'Password hash',
        meaning:
          'A one-way scramble of a password. We store only the scramble (made with Argon2id, which is deliberately slow), never the password.',
      },
      {
        term: 'CSRF',
        meaning:
          'A trick where another website makes your browser send a request to ours using your cookies. We block it with SameSite cookies and an Origin check.',
      },
      {
        term: 'XSS',
        meaning:
          'An attacker getting their own script to run inside your page. React escapes text by default, and our content security policy blocks inline scripts.',
      },
      {
        term: 'Rate limit',
        meaning: 'A cap on how many requests one person or address can make per minute.',
      },
      {
        term: 'Environment variable',
        meaning:
          'A setting (such as a secret or a database address) given to the program from outside, so it is not written in the code.',
      },
    ],
  },
  {
    id: 'run',
    title: 'Testing and running it',
    terms: [
      {
        term: 'Unit, integration and end-to-end tests',
        meaning:
          'A unit test checks one small function. An integration test checks several parts together (here, the real API with a real database). An end-to-end test drives a real browser.',
      },
      {
        term: 'Regression test',
        meaning: 'A test kept after a bug is fixed, so the bug cannot quietly come back.',
      },
      {
        term: 'Docker and container',
        meaning:
          'A way to package a program with everything it needs, so it runs the same on any machine. A container is one running package.',
      },
      {
        term: 'Docker Compose',
        meaning:
          'A tool that starts several containers together (database, API, web) from one file.',
      },
      {
        term: 'Log',
        meaning:
          'A line the program writes about what it did. Every request gets an id, so you can find all lines for one request.',
      },
      {
        term: 'Health check',
        meaning:
          'A small address that answers “are you running?”, used by Docker to monitor the app.',
      },
    ],
  },
];

export const READING_ORDER: { tab: string; why: string }[] = [
  { tab: 'Request flow', why: 'See the path of one request, with the checks it passes.' },
  { tab: 'Feature by feature', why: 'Follow real actions from the click to the database.' },
  { tab: 'Database', why: 'See the tables and how they connect.' },
  { tab: 'Sessions', why: 'Learn how sign-in works.' },
  { tab: 'Roles and Grants', why: 'Learn who may do what, and who may see what.' },
  { tab: 'Technical decisions', why: 'Find out why each choice was made.' },
];

const START_JOURNEY: Journey = {
  nodes: [
    {
      title: 'Your browser',
      what: 'Shows the page. It cannot read the data itself.',
      tech: 'React app',
      steps: [{ n: 1, text: 'You click “Search”' }],
    },
    {
      title: 'The API (server)',
      what: 'Checks the request, then runs the rules.',
      tech: 'Express: route → service',
      steps: [{ n: 3, text: 'Checks: signed in? right shape? allowed?' }],
    },
    {
      title: 'The database',
      what: 'Keeps all the data in tables.',
      tech: 'PostgreSQL',
    },
  ],
  links: [
    { go: [2, 'Request', 'GET /api/questions?q=closure'], back: [6, 'Reply', '200 + JSON'] },
    { go: [4, 'SQL query', 'the service asks for data'], back: [5, 'Rows', 'only the matches'] },
  ],
};

/** The whole journey in one picture. The numbers match the six steps listed below it. */
export function JourneyDiagram() {
  return <JourneyFlow journey={START_JOURNEY} label="Start here: overview" />;
}

export function StartPanel() {
  return (
    <div className="mt-8 space-y-8">
      <section aria-labelledby="start-story">
        <h3 id="start-story" className="text-lg font-semibold">
          What happens when you click something
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Almost everything in this app follows the same six steps. Learn them once and the rest of
          the page will make sense.
        </p>
        <ol aria-label="One request in six steps" className="mt-3 grid gap-3 md:grid-cols-2">
          {STORY.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-md border border-line bg-surface p-4">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
              >
                {i + 1}
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{s.title}</p>
                <p className="mt-0.5 text-ink-soft">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="start-order">
        <h3 id="start-order" className="text-lg font-semibold">
          A good order to read this page
        </h3>
        <ol aria-label="Suggested reading order" className="mt-3 space-y-1.5 text-sm">
          {READING_ORDER.map((r, i) => (
            <li key={r.tab} className="flex gap-2">
              <span className="w-5 shrink-0 text-ink-soft">{i + 1}.</span>
              <span>
                <strong>{r.tab}</strong>
                <span className="text-ink-soft"> — {r.why}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="start-terms">
        <h3 id="start-terms" className="text-lg font-semibold">
          Words you will see on this page
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Short, plain meanings. If a word on another tab is new to you, look for it here.
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {TERM_GROUPS.map((g) => (
            <section
              key={g.id}
              aria-labelledby={`terms-${g.id}`}
              className="rounded-md border border-line bg-surface p-4"
            >
              <h4 id={`terms-${g.id}`} className="font-semibold">
                {g.title}
              </h4>
              <dl className="mt-3 space-y-3 text-sm">
                {g.terms.map((t) => (
                  <div key={t.term}>
                    <dt className="font-medium">{t.term}</dt>
                    <dd className="text-ink-soft">{t.meaning}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
