import type { KeyboardEvent, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { Icon } from '../../shared/ui/Icon';
import { Page, PageHeader } from '../../shared/ui/Page';
import { DEMO_ACCOUNTS, DEMO_CLIENTS } from '../auth/demoAccounts';
import { ClientBadge } from '../questions/components/chips';
import { ApproachPanel, DecisionsPanel, PathPanel, SecurityPanel } from './EngineeringPanels';
import { FeatureWalkthrough } from './FeatureWalkthrough';
import { ErDiagram, RELATIONSHIPS } from './ErDiagram';
import { JourneyDiagram, StartPanel } from './StartHere';
import { Code, Flow } from './Flow';
import { MindMap } from './MindMap';
import { RequestFlowDiagram } from './RequestFlowDiagram';
import {
  DECISION_STEPS,
  MIND_MAPS,
  OPERATIONS,
  PIPELINE,
  ROLE_COLUMNS,
  ROLE_ROWS,
  STATUS_ROWS,
  TABLES,
  TRACES,
  VISIBLE_SQL,
} from './content';

function Mark({ value }: { value: string }) {
  if (value === 'yes' || value === 'no') {
    const yes = value === 'yes';
    return (
      <>
        <span aria-hidden="true" className={yes ? 'font-semibold' : 'text-ink-soft'}>
          {yes ? '✓' : '–'}
        </span>
        <span className="sr-only">{yes ? 'Yes' : 'No'}</span>
      </>
    );
  }
  return <span className="text-sm">{value}</span>;
}

const th = 'px-3 py-2 font-medium';

/** The overview map first, then the detail behind it. */
function Detail({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="mt-8 space-y-6">{children}</div>;
}

function RolesPanel() {
  return (
    <Detail>
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">What each role can do</caption>
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th scope="col" className={th}>
                Action
              </th>
              {ROLE_COLUMNS.map((c) => (
                <th key={c} scope="col" className={`${th} text-center`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLE_ROWS.map((r) => (
              <tr key={r.action} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-2 font-normal">
                  {r.action}
                </th>
                {r.cells.map((c, i) => (
                  <td key={ROLE_COLUMNS[i]} className="px-3 py-2 text-center">
                    <Mark value={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-soft">
        The buttons you see follow this table, but they are only a convenience. The API (the server)
        enforces every rule, even for requests that never use the interface.
      </p>
    </Detail>
  );
}

function GrantsPanel() {
  return (
    <Detail>
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Demo accounts, their role and client grants</caption>
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th scope="col" className={th}>
                Account
              </th>
              <th scope="col" className={th}>
                Role
              </th>
              {['Global', ...DEMO_CLIENTS].map((c) => (
                <th key={c} scope="col" className={`${th} text-center`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO_ACCOUNTS.map((a) => (
              <tr key={a.email} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-2 font-normal">
                  <span className="block font-medium">{a.label}</span>
                  <span className="text-ink-soft">{a.email}</span>
                </th>
                <td className="whitespace-nowrap px-3 py-2">{a.role}</td>
                {['Global', ...DEMO_CLIENTS].map((c) => (
                  <td key={c} className="px-3 py-2 text-center">
                    <Mark
                      value={
                        c === 'Global' || (a.grants as readonly string[]).includes(c) ? 'yes' : 'no'
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-soft">
        A grant is permission to see one department’s questions. A restricted question carries this
        badge: <ClientBadge name="MERN" />. Reviewers get no exception: without a grant, a Reviewer
        cannot see or review that department. Only an Admin sees every department.
      </p>
    </Detail>
  );
}

function FlowPanel() {
  return (
    <Detail>
      <RequestFlowDiagram />
      <p className="max-w-3xl text-sm text-ink-soft">
        Checks that need no data run first, because they are cheap. Checks that need the database
        run last, after the request has passed every other gate. Business rules (the app’s own
        rules, such as who may approve a question) live only in the service, never in the route.
      </p>

      <div>
        <h3 className="font-semibold">What each answer means</h3>
        <div className="mt-2 overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Response statuses and where they come from</caption>
            <thead>
              <tr className="border-b border-line text-ink-soft">
                <th scope="col" className={th}>
                  Status
                </th>
                <th scope="col" className={th}>
                  Raised by
                </th>
                <th scope="col" className={th}>
                  Meaning
                </th>
              </tr>
            </thead>
            <tbody>
              {STATUS_ROWS.map((r) => (
                <tr
                  key={`${r.status}-${r.code}`}
                  className="border-b border-line align-top last:border-b-0"
                >
                  <th scope="row" className="whitespace-nowrap px-3 py-2 font-normal">
                    <span className="font-semibold">{r.status}</span>{' '}
                    <span className="font-mono text-xs text-ink-soft">{r.code}</span>
                  </th>
                  <td className="px-3 py-2">{r.from}</td>
                  <td className="px-3 py-2 text-ink-soft">{r.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="font-semibold">Four requests, traced</h3>
        <div className="mt-2 overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Example requests and where each one stops</caption>
            <thead>
              <tr className="border-b border-line text-ink-soft">
                <th scope="col" className={th}>
                  Who
                </th>
                <th scope="col" className={th}>
                  Request
                </th>
                <th scope="col" className={th}>
                  What happens
                </th>
                <th scope="col" className={`${th} text-center`}>
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {TRACES.map((t) => (
                <tr key={t.request} className="border-b border-line align-top last:border-b-0">
                  <th scope="row" className="px-3 py-2 font-medium">
                    {t.who}
                  </th>
                  <td className="px-3 py-2">
                    <Code>{t.request}</Code>
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{t.path}</td>
                  <td className="px-3 py-2 text-center font-semibold">{t.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Detail>
  );
}

function DecisionPanel() {
  return (
    <Detail>
      <div className="max-w-2xl">
        <Flow steps={DECISION_STEPS} label="Order of the access checks" />
      </div>
      <p className="max-w-3xl text-sm text-ink-soft">
        That is why a hidden question answers 404 and never 403: a 403 would tell a probing user the
        question is there. For the same reason there is no unique constraint on question text (a
        database rule that refuses repeated values). The duplicate check also only looks at
        questions you can see.
      </p>
    </Detail>
  );
}

function PipelinePanel() {
  return (
    <Detail>
      <div className="max-w-2xl">
        <Flow steps={PIPELINE} label="Middleware order for an API request" />
      </div>
    </Detail>
  );
}

function OperationsPanel() {
  return (
    <Detail>
      <div className="grid gap-8 lg:grid-cols-2">
        {OPERATIONS.map((op) => (
          <article key={op.id} aria-labelledby={`${op.id}-h`}>
            <h3 id={`${op.id}-h`} className="text-lg font-semibold">
              {op.title}
            </h3>
            <p className="mt-1">
              <Code>{op.route}</Code>
            </p>
            <p className="mt-2 text-sm text-ink-soft">{op.intro}</p>
            <div className="mt-3">
              <Flow steps={op.steps} label={`${op.title} steps`} />
            </div>
          </article>
        ))}
      </div>
    </Detail>
  );
}

function DatabasePanel() {
  return (
    <Detail>
      <div className="grid gap-3 sm:grid-cols-2">
        {TABLES.map((t) => (
          <div key={t.name} className="rounded-md border border-line bg-surface p-3">
            <p className="font-mono text-sm font-medium">{t.name}</p>
            <p className="mt-1 text-sm">{t.purpose}</p>
            <p className="mt-1.5 text-xs text-ink-soft">{t.keys}</p>
          </div>
        ))}
      </div>

      <section aria-labelledby="er-heading">
        <h3 id="er-heading" className="text-lg font-semibold">
          Database diagram
        </h3>
        <p className="mb-3 mt-1 text-sm text-ink-soft">
          Every table, its key columns and how the tables point at each other. A line joins two
          tables. It runs from the “one” side to the “many” side.
        </p>
        <ErDiagram />
        <h3 className="mt-6 font-semibold">How the tables connect, in words</h3>
        <ul
          aria-label="Table relationships"
          className="mt-2 grid gap-x-8 gap-y-1.5 text-sm text-ink-soft lg:grid-cols-2"
        >
          {RELATIONSHIPS.map((r) => (
            <li key={r.id}>{r.text}</li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-semibold">The visibility predicate</h3>
          <pre
            tabIndex={0}
            aria-label="The visibility predicate, as SQL"
            className="mt-2 overflow-x-auto rounded-md border border-line bg-surface p-3 font-mono text-xs leading-relaxed"
          >
            {VISIBLE_SQL}
          </pre>
          <p className="mt-2 text-sm text-ink-soft">
            This rule sits in the same SQL statement as the filters, the search, the count and the
            paging (page-by-page results). Hidden rows are never fetched, counted or ranked.
          </p>
        </div>
      </div>
    </Detail>
  );
}

function SessionPanel() {
  const points: { id: string; body: ReactNode }[] = [
    {
      id: 'cookies',
      body: (
        <>
          Signing in sets two <strong>httpOnly, SameSite=Strict</strong> cookies. Each holds a
          token, a small signed piece of text that proves who you are. Page scripts cannot read the
          cookies, and the browser sends them only for requests from this site. The access token
          lasts 15 minutes and is sent to <Code>/api</Code>. The refresh token lasts 7 days and is
          sent only to <Code>/api/auth</Code>.
        </>
      ),
    },
    {
      id: 'claims',
      body: (
        <>
          The access token carries your user id and the id of your session. Role and active status
          are read from the database on each request. The token stops working the moment its session
          is revoked (ended).
        </>
      ),
    },
    {
      id: 'refresh',
      body: (
        <>
          When the API answers 401 (not signed in), the app refreshes the session once and retries.
          Each refresh token works one time. Replaying a used one revokes the whole session.
        </>
      ),
    },
    {
      id: 'signin',
      body: (
        <>
          Sign-in gives the same error for an unknown email, a wrong password and a disabled
          account. It is rate-limited (capped per minute) per IP address and email, and per IP
          address across all emails. So trying a different email each time does not help.
        </>
      ),
    },
    {
      id: 'revoke',
      body: (
        <>
          Resetting a password, or deactivating or deleting an account, ends all of that person’s
          sessions at once. The last active admin cannot be removed.
        </>
      ),
    },
  ];
  return (
    <Detail>
      <ul className="max-w-3xl space-y-3 text-sm">
        {points.map((p) => (
          <li key={p.id} className="flex gap-2">
            <Icon name="check" className="mt-0.5 shrink-0 text-ok" />
            <span>{p.body}</span>
          </li>
        ))}
      </ul>
    </Detail>
  );
}

const ALL_TABS: {
  id: string;
  label: string;
  title: string;
  lead: ReactNode;
  Body: () => ReactNode;
}[] = [
  {
    id: 'start',
    label: 'Start here',
    title: 'New to backend work? Start here',
    lead: 'What happens when you click something, in six plain steps, and what the words used on the other tabs mean.',
    Body: StartPanel,
  },
  {
    id: 'features',
    label: 'Feature by feature',
    title: 'From one click to the database',
    lead: 'Pick a feature. Every one follows the same five layers, from what the person does on screen to the rows that change in the Postgres database.',
    Body: FeatureWalkthrough,
  },
  {
    id: 'path',
    label: 'Learning path',
    title: 'The app through the Full Stack 101 path',
    lead: 'The five stages of the React to Full Stack 101 path, each mapped to the code that does it. Then every feature, with the rules it enforces and the tests that prove them.',
    Body: PathPanel,
  },
  {
    id: 'roles',
    label: 'Roles',
    title: 'Roles: what you can do',
    lead: 'Every account has one global role, which applies everywhere. It does not depend on the department.',
    Body: RolesPanel,
  },
  {
    id: 'grants',
    label: 'Grants',
    title: 'Grants: what you can see',
    lead: 'A global question belongs to no department, so every signed-in person can see it once it is approved. A grant adds one department’s questions on top.',
    Body: GrantsPanel,
  },
  {
    id: 'flow',
    label: 'Request flow',
    title: 'The path of one request',
    lead: 'This diagram follows one request from left to right. Each gate is a check. When a gate refuses, the red box shows its answer.',
    Body: FlowPanel,
  },
  {
    id: 'decision',
    label: 'The decision',
    title: 'The decision, in order',
    lead: 'The same three checks run for every request, always in this order. Visibility comes before role, so a refused request never confirms that a hidden question exists.',
    Body: DecisionPanel,
  },
  {
    id: 'pipeline',
    label: 'Request pipeline',
    title: 'What happens to a request',
    lead: 'A request is what the browser sends to the server. This is its journey from the browser to the database, in the order the code runs. Red tags show what a step answers when it refuses the request.',
    Body: PipelinePanel,
  },
  {
    id: 'operations',
    label: 'Each operation',
    title: 'Each operation, step by step',
    lead: 'Every route handler (the function that answers one URL) has the same shape. What differs is the service and the SQL behind it.',
    Body: OperationsPanel,
  },
  {
    id: 'database',
    label: 'Database',
    title: 'Database and Prisma',
    lead: (
      <>
        The data lives in PostgreSQL. The app reaches it through Prisma, a library that lets code
        talk to the database. Prisma does not enforce visibility. The rule below is written in SQL,
        and every read of the <Code>question</Code> table goes through one module,{' '}
        <Code>question.repo.ts</Code>. A test fails if any other file touches the table. Writes use
        the Prisma client inside a transaction (a group of changes that all succeed or all fail).
      </>
    ),
    Body: DatabasePanel,
  },
  {
    id: 'session',
    label: 'Sessions',
    title: 'Sessions and cookies',
    lead: 'How the API knows who you are, without asking for your password on every request.',
    Body: SessionPanel,
  },
  {
    id: 'approach',
    label: 'Approach',
    title: 'The implementation approach',
    lead: 'The decisions that shape the system. Each one has the problem it solves, why it was chosen and what it costs.',
    Body: ApproachPanel,
  },
  {
    id: 'decisions',
    label: 'Technical decisions',
    title: 'Every technical decision, and why',
    lead: 'From the repository layout and folder structure to the database design, the backend, the frontend and delivery. For each choice: what was chosen, why, what was rejected and what it costs.',
    Body: DecisionsPanel,
  },
  {
    id: 'security',
    label: 'Security',
    title: 'Security: what defends it, and the test that proves it',
    lead: 'Every defence below is in the code and paired with the test that proves it. A red-team pass (a deliberate attempt to break the system) found problems, and they were fixed.',
    Body: SecurityPanel,
  },
];

// Reading order for a newcomer: orient, learn the one rule, see how a request runs, then why it is built this way.
const GROUPS = [
  { title: '1 · Get oriented', ids: ['start', 'features', 'path'] },
  { title: '2 · The core rule', ids: ['roles', 'grants', 'decision', 'flow'] },
  { title: '3 · Under the hood', ids: ['session', 'pipeline', 'operations', 'database'] },
  { title: '4 · Why it is built this way', ids: ['approach', 'decisions', 'security'] },
].map((g) => ({ ...g, tabs: g.ids.map((id) => ALL_TABS.find((t) => t.id === id)!) }));
const TABS = GROUPS.flatMap((g) => g.tabs);

export function HowItWorksPage() {
  useDocumentTitle('How it works');
  const { hash } = useLocation();
  const navigate = useNavigate();

  // The address bar holds the open tab (#grants), so a tab can be linked to and survives a reload.
  const active = TABS.find((t) => `#${t.id}` === hash)?.id ?? TABS[0]!.id;
  const select = (id: string, focus = false) => {
    void navigate({ hash: id }, { replace: true, preventScrollReset: true });
    if (focus) document.getElementById(`tab-${id}`)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === active);
    const last = TABS.length - 1;
    const target: Record<string, number> = {
      ArrowRight: i === last ? 0 : i + 1,
      ArrowLeft: i === 0 ? last : i - 1,
      Home: 0,
      End: last,
    };
    const next = target[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(TABS[next]!.id, true);
  };

  return (
    <Page>
      <PageHeader
        title="How it works"
        description={
          <>
            Two separate questions decide everything.{' '}
            <strong className="text-ink">What can you see?</strong> Your department grants answer
            that. <strong className="text-ink">What can you change?</strong> Your role answers that.
            The app always checks visibility first, in the database. Read the groups below left to
            right, top to bottom: each one builds on the last. The last tabs cover the approach,
            every technical decision, and the security model.
          </>
        }
      />

      <div
        role="tablist"
        aria-label="How it works"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="grid gap-x-6 gap-y-3 sm:grid-cols-2"
      >
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div aria-hidden="true" className="mb-1.5 text-xs font-medium uppercase text-ink-soft">
              {g.title}
            </div>
            <div className="flex flex-wrap gap-2">
              {g.tabs.map((t) => {
                const on = t.id === active;
                return (
                  <button
                    key={t.id}
                    id={`tab-${t.id}`}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-controls={`panel-${t.id}`}
                    tabIndex={on ? 0 : -1}
                    onClick={() => select(t.id)}
                    className={
                      on
                        ? 'flex-none whitespace-nowrap rounded-full border border-accent bg-accent-soft px-4 py-1.5 text-sm font-medium'
                        : 'flex-none whitespace-nowrap rounded-full border border-line px-4 py-1.5 text-sm text-ink-soft hover:text-ink'
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {TABS.map(({ id, title, lead, Body }) => (
        <section
          key={id}
          id={`panel-${id}`}
          role="tabpanel"
          aria-labelledby={`tab-${id}`}
          hidden={id !== active}
          tabIndex={0}
          className="mt-6 outline-offset-4"
        >
          <h2 className="font-serif text-2xl font-semibold">{title}</h2>
          <p className="mt-2 max-w-3xl text-ink-soft">{lead}</p>
          <div className="mt-5">
            {id === 'start' ? <JourneyDiagram /> : <MindMap data={MIND_MAPS[id]!} />}
          </div>
          <Body />
        </section>
      ))}
    </Page>
  );
}
