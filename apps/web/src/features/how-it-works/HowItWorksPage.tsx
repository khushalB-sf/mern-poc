import type { KeyboardEvent, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { Icon } from '../../shared/ui/Icon';
import { DEMO_ACCOUNTS, DEMO_CLIENTS } from '../auth/demoAccounts';
import { ClientBadge } from '../questions/components/chips';
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
        The buttons you see in the interface follow this table, but they are only a convenience. The
        API enforces every rule, including for requests that never touch the interface.
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
        A restricted question carries this badge: <ClientBadge name="Acme" />. Reviewers get no
        exception: without a grant, a Reviewer cannot see or edit that client.
      </p>
    </Detail>
  );
}

function FlowPanel() {
  return (
    <Detail>
      <RequestFlowDiagram />
      <p className="max-w-3xl text-sm text-ink-soft">
        Checks that need no data run first and are cheap. The ones that need the database run last,
        once the request has passed every gate. Business rules live only in the service, never in
        the route.
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
                <tr key={r.status} className="border-b border-line align-top last:border-b-0">
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
                <tr key={t.who} className="border-b border-line align-top last:border-b-0">
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
        question is there. For the same reason there is no unique constraint on question text, and
        the duplicate check only looks at questions you can see.
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-semibold">How the tables connect</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
            <li>
              <Code>app_user</Code> ─ <Code>client_grant</Code> ─ <Code>client</Code>: a user can
              hold many grants, a client can be granted to many users.
            </li>
            <li>
              <Code>question</Code> → <Code>app_user</Code>: every question has one author.
            </li>
            <li>
              <Code>question</Code> → <Code>client</Code>: optional. No client means global.
            </li>
            <li>
              <Code>question</Code> ─ <Code>question_tag</Code> ─ <Code>tag</Code> →{' '}
              <Code>tag_category</Code>: many tags per question, many questions per tag.
            </li>
            <li>
              <Code>audit_event</Code> → <Code>app_user</Code> and, optionally,{' '}
              <Code>question</Code>: the who and when behind the history.
            </li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold">The visibility predicate</h3>
          <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-surface p-3 font-mono text-xs leading-relaxed">
            {VISIBLE_SQL}
          </pre>
          <p className="mt-2 text-sm text-ink-soft">
            It sits in the same statement as the filters, the search, the count and the paging.
            Hidden rows are never fetched, counted or ranked.
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
          Signing in sets two <strong>httpOnly, SameSite=Strict</strong> cookies. Page scripts
          cannot read them. The access token lasts 15 minutes and is sent to <Code>/api</Code>; the
          refresh token lasts 7 days and is sent only to <Code>/api/auth</Code>.
        </>
      ),
    },
    {
      id: 'claims',
      body: (
        <>
          The access token carries only your user id. Role and active status are read from the
          database on each request.
        </>
      ),
    },
    {
      id: 'refresh',
      body: (
        <>
          On a 401 the app refreshes the session once and retries. Each refresh token works one
          time. Replaying a used one revokes the whole session.
        </>
      ),
    },
    {
      id: 'signin',
      body: (
        <>
          Sign-in answers the same error for an unknown email, a wrong password and a disabled
          account, and is rate-limited per address and email.
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

const TABS: {
  id: string;
  label: string;
  title: string;
  lead: ReactNode;
  Body: () => ReactNode;
}[] = [
  {
    id: 'roles',
    label: 'Roles',
    title: 'Roles: what you can do',
    lead: 'Every account has one global role. It does not depend on the client.',
    Body: RolesPanel,
  },
  {
    id: 'grants',
    label: 'Grants',
    title: 'Grants: what you can see',
    lead: 'Everyone sees global questions. A grant adds one client’s questions on top.',
    Body: GrantsPanel,
  },
  {
    id: 'flow',
    label: 'Request flow',
    title: 'The path of one request',
    lead: 'One request, left to right, and what each gate answers when it refuses. Red boxes are the refusals.',
    Body: FlowPanel,
  },
  {
    id: 'decision',
    label: 'The decision',
    title: 'The decision, in order',
    lead: 'The same three checks run for every request. Because visibility comes before role, a rejected request never confirms that a hidden question exists.',
    Body: DecisionPanel,
  },
  {
    id: 'pipeline',
    label: 'Request pipeline',
    title: 'What happens to a request',
    lead: 'From the browser to the database, in the order the code runs. Red tags show what a step answers when it refuses the request.',
    Body: PipelinePanel,
  },
  {
    id: 'operations',
    label: 'Each operation',
    title: 'Each operation, step by step',
    lead: 'The route handler is the same shape every time. What differs is the service and the SQL behind it.',
    Body: OperationsPanel,
  },
  {
    id: 'database',
    label: 'Database',
    title: 'Database and Prisma',
    lead: (
      <>
        PostgreSQL, accessed through Prisma. Prisma does not enforce visibility: the predicate below
        is written in SQL, and every read of the <Code>question</Code> table goes through one
        module, <Code>question.repo.ts</Code>. A test fails if any other file touches the table.
        Writes use the Prisma client inside a transaction.
      </>
    ),
    Body: DatabasePanel,
  },
  {
    id: 'session',
    label: 'Sessions',
    title: 'Sessions and cookies',
    lead: 'How the API knows who you are.',
    Body: SessionPanel,
  },
];

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
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-serif text-3xl font-semibold leading-tight sm:text-4xl">How it works</h1>
      <p className="mt-3 max-w-3xl text-lg text-ink-soft">
        Two separate questions decide everything.{' '}
        <strong className="text-ink">What can you see?</strong> is answered by client grants.{' '}
        <strong className="text-ink">What can you change?</strong> is answered by your role.
        Visibility is always checked first, in the database.
      </p>

      <div
        role="tablist"
        aria-label="How it works"
        onKeyDown={onKeyDown}
        className="mt-6 flex gap-2 overflow-x-auto pb-1"
      >
        {TABS.map((t) => {
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
            <MindMap data={MIND_MAPS[id]!} />
          </div>
          <Body />
        </section>
      ))}
    </div>
  );
}
