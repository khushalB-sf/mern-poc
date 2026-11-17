import type { ReactNode } from 'react';
import { Code } from './Flow';

// One walkthrough per feature, from the click to the database. Every statement describes the code it
// names (`where`): keep it in step with apps/web and apps/api.

export type Layer = 'screen' | 'browser' | 'api' | 'rules' | 'db';

/** Every feature walks the same five layers in this order, so the shape is familiar after the first. */
export const LAYERS: { id: Layer; label: string; who: string }[] = [
  { id: 'screen', label: 'On screen', who: 'what the person does' },
  { id: 'browser', label: 'Browser', who: 'React app' },
  { id: 'api', label: 'API gates', who: 'Express middleware' },
  { id: 'rules', label: 'Business rules', who: 'service' },
  { id: 'db', label: 'Database', who: 'PostgreSQL via Prisma' },
];

export interface DbRow {
  table: string;
  action: 'READ' | 'INSERT' | 'UPDATE' | 'DELETE';
  row: string;
}

export interface Stage {
  title: string;
  detail: ReactNode;
  /** The file to open to see it, prefixed web or api. */
  where: string;
  /** Rules that run in this layer, in order, each with what it answers when it refuses. */
  checks?: { text: ReactNode; fail?: string }[];
  code?: { label: string; text: string };
  /** The tables this step touches. Only on the database layer. */
  rows?: DbRow[];
}

export interface Feature {
  id: string;
  label: string;
  /** The same sentence you would say out loud. */
  summary: string;
  /** What changes in the database, in one line. */
  outcome: string;
  /** Exactly one per layer, in LAYERS order. */
  stages: [Stage, Stage, Stage, Stage, Stage];
}

const SESSION: { text: ReactNode; fail: string } = {
  text: 'The cookie holds a valid session. The user is loaded from the database, so role and active status are always current.',
  fail: '401 UNAUTHENTICATED',
};
const RATE: { text: ReactNode; fail: string } = {
  text: 'Fewer than 120 requests a minute from this user.',
  fail: '429 RATE_LIMITED',
};

export const FEATURES: Feature[] = [
  {
    id: 'login',
    label: 'Sign in',
    summary: 'You enter your email and password and click Sign in.',
    outcome: 'Two cookies reach the browser and one new row is written to refresh_token.',
    stages: [
      {
        title: 'You enter your email and password and click Sign in',
        detail:
          'The login page is open to signed-out visitors. The form checks the email format first, so an obvious typo never leaves the browser.',
        where: 'web · features/auth/LoginPage.tsx',
      },
      {
        title: 'React sends the credentials to the API',
        detail: (
          <>
            The <Code>useLogin</Code> mutation calls <Code>POST /api/auth/login</Code>. nginx
            forwards <Code>/api</Code> to the API container, so the browser only ever talks to one
            origin. When sign-in succeeds, the app clears anything cached for a previous user.
          </>
        ),
        where: 'web · features/auth/hooks.ts, api.ts',
      },
      {
        title: 'The request passes the gates',
        detail: 'Cheap checks that need no data run first.',
        where: 'api · http/app.ts, modules/auth/routes.ts',
        checks: [
          {
            text: 'The body is JSON and under 100 kb.',
            fail: '400 INVALID_JSON · 413 PAYLOAD_TOO_LARGE',
          },
          { text: 'The Origin header is ours (second CSRF layer).', fail: '403 BAD_ORIGIN' },
          {
            text: 'Email and password have the right shape. The email is lower-cased.',
            fail: '400 VALIDATION_ERROR',
          },
          {
            text: 'Not too many attempts from this address and email.',
            fail: '429 RATE_LIMITED',
          },
        ],
      },
      {
        title: 'The service checks the password',
        detail: (
          <>
            An unknown email, a wrong password and a disabled account all give the same answer and
            take the same time, so nobody can use sign-in to find out which emails exist.
          </>
        ),
        where: 'api · modules/auth/service.ts → login()',
        checks: [
          { text: 'Find the user by email.' },
          {
            text: 'Verify the Argon2 password hash, and that the account is active.',
            fail: '401 UNAUTHENTICATED',
          },
          { text: 'Create a session: an access token and a refresh token.' },
        ],
      },
      {
        title: 'Database: one lookup, one new row',
        detail: (
          <>
            The two tokens go back only as <strong>httpOnly, SameSite=Strict</strong> cookies, never
            in the response body, so page scripts cannot read them. The refresh token is stored
            hashed, never as written.
          </>
        ),
        where: 'api · modules/auth/service.ts → issue()',
        rows: [
          {
            table: 'app_user',
            action: 'READ',
            row: 'where email = … → id, role, active, password_hash',
          },
          {
            table: 'refresh_token',
            action: 'INSERT',
            row: 'id · user_id · family_id (new) · token_hash (sha-256) · expires_at = now + 7 days',
          },
        ],
      },
    ],
  },
  {
    id: 'search',
    label: 'Search and filter',
    summary: 'You type in the search box or tick a tag filter.',
    outcome: 'Nothing is written. One query returns only the questions you may see.',
    stages: [
      {
        title: 'You type in the search box or tick a tag filter',
        detail:
          'The box waits 300 ms after you stop typing. The search and filters are then put in the page address, so a search can be bookmarked or shared.',
        where: 'web · features/questions/QuestionListPage.tsx, FilterBar.tsx',
      },
      {
        title: 'React asks the API for the list',
        detail: (
          <>
            <Code>useQuestionSearch</Code> calls <Code>GET /api/questions</Code>. Results are cached
            for 30 seconds, and the previous results stay on screen, dimmed, while the next ones
            load.
          </>
        ),
        where: 'web · features/questions/hooks.ts, api.ts',
        code: {
          label: 'The request',
          text: 'GET /api/questions?q=react+hooks&tags=technology:react&limit=20&offset=0',
        },
      },
      {
        title: 'The request passes the gates',
        detail: 'The same gates as every other request to /api/questions.',
        where: 'api · modules/auth/middleware.ts, modules/questions/routes.ts',
        checks: [
          SESSION,
          RATE,
          {
            text: 'The query has the right shape: q up to 200 characters, limit 1 to 50, no unknown fields.',
            fail: '400 VALIDATION_ERROR',
          },
        ],
      },
      {
        title: 'Tag names become tag ids',
        detail: (
          <>
            <Code>technology:react</Code> is looked up in the tag table. Different categories are
            AND-ed, values inside one category are OR-ed. Visibility is not a separate step here: it
            is built into the SQL in the next layer.
          </>
        ),
        where: 'api · modules/tags/tags.ts → resolveTagGroups()',
        checks: [
          {
            text: 'Every tag exists in the fixed taxonomy.',
            fail: '400 UNKNOWN_TAG · UNKNOWN_TAG_CATEGORY',
          },
        ],
      },
      {
        title: 'Database: one WHERE decides what you may see',
        detail:
          'Reads only. Hidden rows are never fetched, counted or ranked, so a search can never reveal that a restricted question exists.',
        where: 'api · modules/questions/question.repo.ts → searchQuestions()',
        code: {
          label: 'The query, simplified',
          text: `SELECT … FROM question q
WHERE ( q.client_id IS NULL                      -- global, or
        OR EXISTS (SELECT 1 FROM client_grant g  -- you hold the grant
                   WHERE g.user_id = $you AND g.client_id = q.client_id) )
  AND <full-text match on text and notes>        -- only if you typed a search
  AND EXISTS (<has one of the chosen tags>)      -- one per tag category
ORDER BY relevance, newest first
LIMIT 20 OFFSET 0;
-- the same WHERE runs again as count(*) for the total`,
        },
        rows: [
          {
            table: 'question',
            action: 'READ',
            row: 'one page, plus the total from the same WHERE',
          },
          { table: 'question_tag · tag', action: 'READ', row: 'the tags of the rows on this page' },
        ],
      },
    ],
  },
  {
    id: 'open',
    label: 'Open a question',
    summary: 'You click a question in the list.',
    outcome: 'Nothing is written. A hidden question looks exactly like a missing one.',
    stages: [
      {
        title: 'You click a question in the list',
        detail:
          'The page shows the question, its tags, a badge if it is restricted to a client, and its edit history. The Edit button appears only if your role allows it.',
        where: 'web · features/questions/QuestionDetailPage.tsx',
      },
      {
        title: 'React makes two requests',
        detail: (
          <>
            <Code>useQuestion</Code> and <Code>useHistory</Code> call{' '}
            <Code>GET /api/questions/:id</Code> and <Code>/history</Code>. A 404 is shown as “not
            found” and is not retried.
          </>
        ),
        where: 'web · features/questions/hooks.ts',
      },
      {
        title: 'The request passes the gates',
        detail: 'Authentication and rate limit, then the id is checked.',
        where: 'api · modules/questions/routes.ts',
        checks: [SESSION, RATE, { text: 'The id is a UUID.', fail: '400 VALIDATION_ERROR' }],
      },
      {
        title: 'Visible first, history second',
        detail:
          'The history is fetched only after the question is confirmed visible. Only the edit diffs of this question are returned, never the raw audit payloads, which can name other questions.',
        where: 'api · modules/questions/service.ts → questionHistory()',
        checks: [
          {
            text: 'The question is loaded through the visibility rule. No row means not found, the same answer as for an id that does not exist.',
            fail: '404 NOT_FOUND',
          },
        ],
      },
      {
        title: 'Database: the same visibility rule, by id',
        detail: 'Reads only.',
        where: 'api · modules/questions/question.repo.ts → getVisibleQuestion()',
        code: {
          label: 'The query, simplified',
          text: `SELECT … FROM question q
WHERE q.id = $1
  AND ( q.client_id IS NULL OR <you hold the grant> );
-- then the history, once the question is confirmed visible:
SELECT … FROM audit_event WHERE question_id = $1 ORDER BY at;`,
        },
        rows: [
          { table: 'question', action: 'READ', row: 'by id, through the visibility rule' },
          { table: 'question_tag · tag', action: 'READ', row: 'its tags' },
          { table: 'audit_event', action: 'READ', row: 'its history, oldest first' },
        ],
      },
    ],
  },
  {
    id: 'create',
    label: 'Add a question',
    summary: 'You fill in the form and click Add question.',
    outcome:
      'One transaction writes the question, its tags and an audit event. All of it, or none of it.',
    stages: [
      {
        title: 'You fill in the form and click Add question',
        detail:
          'The Add question button exists only for Author and Admin accounts. The form checks length and tags before sending. If the API finds a near-duplicate, a dialog lists the matches and you choose whether to edit or add it anyway. An Author’s question starts as pending until a reviewer decides; an Admin’s goes live at once.',
        where: 'web · features/questions/QuestionForm.tsx, components/DuplicateDialog.tsx',
      },
      {
        title: 'React sends the new question',
        detail: (
          <>
            <Code>useCreateQuestion</Code> calls <Code>POST /api/questions</Code>. On success it
            marks every cached list as stale, so the new question shows up, and opens its page.
          </>
        ),
        where: 'web · features/questions/hooks.ts, api.ts',
        code: {
          label: 'The request body',
          text: `{ "text": "…", "answerNotes": "…",
  "tags": ["technology:react"],
  "clientId": "…",                 // optional: no client means global
  "confirmNotDuplicate": false }`,
        },
      },
      {
        title: 'The request passes the gates',
        detail: 'The role gate runs before validation, so a read-only account never gets that far.',
        where: 'api · modules/questions/routes.ts',
        checks: [
          SESSION,
          RATE,
          { text: 'The role is Author or Admin.', fail: '403 FORBIDDEN' },
          {
            text: 'The body has the right shape: text 1 to 1000 characters, notes up to 10,000, at most 30 tags, no unknown fields.',
            fail: '400 VALIDATION_ERROR',
          },
        ],
      },
      {
        title: 'The service checks the rules, cheapest first',
        detail:
          'A rejected duplicate is written to the audit table in its own commit, so the attempt leaves a trace even though no question is created.',
        where: 'api · modules/questions/service.ts → createQuestion()',
        checks: [
          {
            text: 'If you chose a client, you hold a grant for it. A client you are not granted looks exactly like one that does not exist.',
            fail: '404 NOT_FOUND',
          },
          {
            text: 'Every tag exists in the fixed taxonomy.',
            fail: '400 UNKNOWN_TAG · UNKNOWN_TAG_CATEGORY',
          },
          {
            text: 'No near-duplicate among the questions you can see: text similarity of 0.6 or more. Hidden questions are never compared.',
            fail: '409 DUPLICATE_SUSPECTED',
          },
        ],
      },
      {
        title: 'Database: three tables change in one transaction',
        detail:
          'If any insert fails, none of them is saved. After the commit the question is read back through the visibility rule and returned with 201.',
        where: 'api · modules/questions/question.repo.ts → insertQuestion(), audit/audit.repo.ts',
        rows: [
          {
            table: 'question',
            action: 'INSERT',
            row: 'text · answer_notes · author_id = you · client_id (null means global) · created_at',
          },
          {
            table: 'question_tag',
            action: 'INSERT',
            row: 'one row per tag: (question_id, tag_id)',
          },
          {
            table: 'audit_event',
            action: 'INSERT',
            row: 'type = QUESTION_CREATED · actor_id = you · payload = text, client, tags',
          },
          {
            table: 'audit_event',
            action: 'INSERT',
            row: 'type = DUPLICATE_OVERRIDDEN, only when you added it past a match',
          },
        ],
      },
    ],
  },
  {
    id: 'edit',
    label: 'Edit a question',
    summary: 'You change a question you may edit and click Save changes.',
    outcome: 'One transaction updates the question and records exactly what changed.',
    stages: [
      {
        title: 'You change a question and click Save changes',
        detail:
          'Edit question shows only for an Author on a question they wrote, or for an Admin. A question’s department cannot be changed. An Author’s save sends it back for review.',
        where: 'web · features/questions/QuestionFormPage.tsx, auth/hooks.ts → canEdit()',
      },
      {
        title: 'React sends only the editable fields',
        detail: (
          <>
            <Code>useUpdateQuestion</Code> calls <Code>PATCH /api/questions/:id</Code> with text,
            notes and tags. <Code>clientId</Code> is not part of the request. On success the cached
            lists, the question and its history are marked stale.
          </>
        ),
        where: 'web · features/questions/hooks.ts, api.ts',
      },
      {
        title: 'The request passes the gates',
        detail:
          'There is no role gate here. The role check has to come after the visibility lookup, so it lives in the service.',
        where: 'api · modules/questions/routes.ts',
        checks: [
          SESSION,
          RATE,
          {
            text: 'The id is a UUID, and the body holds at least one of text, answerNotes and tags, and nothing else.',
            fail: '400 VALIDATION_ERROR',
          },
        ],
      },
      {
        title: 'Visibility, then role, then what changed',
        detail: 'All of this runs inside one transaction.',
        where: 'api · modules/questions/service.ts → updateQuestion()',
        checks: [
          { text: 'You can see the question.', fail: '404 NOT_FOUND' },
          {
            text: 'Your role allows it: Author on your own question, or Admin.',
            fail: '403 FORBIDDEN',
          },
          {
            text: 'Something actually changed. If not, the question comes back untouched and nothing is recorded.',
          },
        ],
      },
      {
        title: 'Database: update and audit commit together',
        detail: 'The history list on the question page is built from these audit rows.',
        where: 'api · modules/questions/question.repo.ts → updateQuestionRow()',
        rows: [
          { table: 'question', action: 'UPDATE', row: 'the changed columns · updated_at = now' },
          {
            table: 'question_tag',
            action: 'DELETE',
            row: 'only if the tags changed: the old set is removed …',
          },
          { table: 'question_tag', action: 'INSERT', row: '… and the new set is inserted' },
          {
            table: 'audit_event',
            action: 'INSERT',
            row: 'type = QUESTION_UPDATED · payload = { changes: { text: { from, to } } }',
          },
        ],
      },
    ],
  },
  {
    id: 'refresh',
    label: 'Stay signed in',
    summary: 'You keep working and, 15 minutes after sign-in, one request comes back 401.',
    outcome: 'The used refresh token is marked used and a new one is stored.',
    stages: [
      {
        title: 'You keep working. After 15 minutes one request comes back 401.',
        detail:
          'The access token lasts 15 minutes, so some request eventually finds it expired. The app handles that before you notice anything.',
        where: 'web · any page',
      },
      {
        title: 'The app refreshes the session once and retries',
        detail:
          'It calls POST /api/auth/refresh, then repeats the original request. Parallel 401s share one refresh, and a browser lock covers other tabs, because a refresh token works only once.',
        where: 'web · shared/api/client.ts → refreshSession()',
      },
      {
        title: 'The refresh cookie is checked',
        detail: (
          <>
            The refresh token lasts 7 days and its cookie is sent to <Code>/api/auth</Code> only,
            never with ordinary API calls.
          </>
        ),
        where: 'api · modules/auth/routes.ts, tokens.ts',
        checks: [
          {
            text: 'The cookie is present and its signature is valid.',
            fail: '401 UNAUTHENTICATED',
          },
        ],
      },
      {
        title: 'Each refresh token works exactly once',
        detail: 'Using a spent token is treated as theft and ends the whole session.',
        where: 'api · modules/auth/service.ts → refresh()',
        checks: [
          { text: 'The token matches the hash on record.', fail: '401 UNAUTHENTICATED' },
          {
            text: 'Claim it atomically: only one caller can flip used_at from null. A second use revokes the whole session.',
            fail: '401 UNAUTHENTICATED',
          },
          { text: 'The account is still active.', fail: '401 UNAUTHENTICATED' },
        ],
      },
      {
        title: 'Database: rotate the token',
        detail:
          'New cookies are set and the request that failed is repeated, now with a valid session.',
        where: 'api · modules/auth/service.ts → issue(), revokeFamily()',
        rows: [
          { table: 'refresh_token', action: 'READ', row: 'by id: compare token_hash' },
          {
            table: 'refresh_token',
            action: 'UPDATE',
            row: 'used_at = now, where used_at and revoked_at are still null',
          },
          {
            table: 'refresh_token',
            action: 'INSERT',
            row: 'the next token: same family_id, expires_at = now + 7 days',
          },
          {
            table: 'refresh_token',
            action: 'UPDATE',
            row: 'on a replay: revoked_at = now for the whole family_id',
          },
        ],
      },
    ],
  },
];
