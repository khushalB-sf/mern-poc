import type { ReactNode } from 'react';
import { Code } from './Flow';

// One walkthrough per feature, from the click to the database. Every statement describes the code it
// names (`where`): keep it in step with apps/web and apps/api.

export type Layer = 'screen' | 'browser' | 'api' | 'rules' | 'db';

/** Every feature walks the same five layers in this order, so the shape is familiar after the first. */
export const LAYERS: { id: Layer; label: string; who: string }[] = [
  { id: 'screen', label: 'On screen', who: 'what the person does' },
  { id: 'browser', label: 'Browser', who: 'React app' },
  { id: 'api', label: 'API gates', who: 'code that runs before the handler' },
  { id: 'rules', label: 'Business rules', who: 'the service, our business logic' },
  { id: 'db', label: 'Database', who: 'PostgreSQL, reached through Prisma' },
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
  text: 'The cookie holds a valid session. The user is loaded from the database on every request, so their role and active status are always current.',
  fail: '401 UNAUTHENTICATED',
};
const RATE: { text: ReactNode; fail: string } = {
  text: 'This user has sent fewer than 120 requests in the last minute (a cap on requests per minute).',
  fail: '429 RATE_LIMITED',
};

export const FEATURES: Feature[] = [
  {
    id: 'login',
    label: 'Sign in',
    summary: 'You enter your email and password and click Sign in.',
    outcome: 'Two cookies are sent to the browser, and one new row is saved in refresh_token.',
    stages: [
      {
        title: 'You enter your email and password and click Sign in',
        detail:
          'Anyone who is signed out can open the login page. The form checks the email format first. An obvious typo never leaves the browser.',
        where: 'web · features/auth/LoginPage.tsx',
      },
      {
        title: 'React sends the credentials to the API',
        detail: (
          <>
            The <Code>useLogin</Code> mutation calls <Code>POST /api/auth/login</Code>. nginx (the
            web server in front of the app) forwards <Code>/api</Code> to the API container. So the
            browser only ever talks to one origin, meaning one address. When sign-in succeeds, the
            app clears any data cached for a previous user.
          </>
        ),
        where: 'web · features/auth/hooks.ts, api.ts',
      },
      {
        title: 'The request passes the gates',
        detail:
          'This is code that runs on every request before the handler. Cheap checks that need no database data run first.',
        where: 'api · http/app.ts, modules/auth/routes.ts',
        checks: [
          {
            text: 'The body is JSON and under 100 kb.',
            fail: '400 INVALID_JSON · 413 PAYLOAD_TOO_LARGE',
          },
          {
            text: 'The Origin header (which site sent the request) is ours. This is a second layer of protection against CSRF, forged requests from other sites.',
            fail: '403 BAD_ORIGIN',
          },
          {
            text: 'Email and password have the right shape (checking the input has the right form). The email is lower-cased.',
            fail: '400 VALIDATION_ERROR',
          },
          {
            text: 'Not too many attempts from this address with this email. Also not too many from this address across all emails. This is a cap on attempts per minute.',
            fail: '429 RATE_LIMITED',
          },
        ],
      },
      {
        title: 'The service checks the password',
        detail: (
          <>
            An unknown email, a wrong password and a disabled account all give the same answer and
            take the same time. So nobody can use sign-in to find out which emails exist.
          </>
        ),
        where: 'api · modules/auth/service.ts → login()',
        checks: [
          { text: 'Find the user by email.' },
          {
            text: 'Verify the password against its Argon2 hash (a one-way scramble of the password), and check that the account is active.',
            fail: '401 UNAUTHENTICATED',
          },
          {
            text: 'Create a session: an access token (a short-lived proof you are signed in) and a refresh token (used to get a new access token).',
          },
        ],
      },
      {
        title: 'Database: one lookup, one new row',
        detail: (
          <>
            The two tokens go back only as <strong>httpOnly, SameSite=Strict</strong> cookies, never
            in the response body. httpOnly means page scripts cannot read the cookie.
            SameSite=Strict means the browser sends it only for requests from our own site. The
            refresh token is stored as a one-way scramble (a hash), never as written.
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
    outcome: 'Nothing is written. One query returns only the questions you are allowed to see.',
    stages: [
      {
        title: 'You type in the search box or tick a tag filter',
        detail:
          'The box waits 300 ms after you stop typing. Then the search and filters go into the page address. This includes “My questions” for Authors and Admins. So you can bookmark or share a search. The filter dropdowns also work from the keyboard. Down opens one. The arrow keys, Home and End move between options. Typing a letter jumps to a matching option. Space ticks it.',
        where: 'web · features/questions/QuestionListPage.tsx, FilterBar.tsx',
      },
      {
        title: 'React asks the API for the list',
        detail: (
          <>
            <Code>useQuestionSearch</Code> calls <Code>GET /api/questions</Code>. Results are cached
            (kept in memory for reuse) for 30 seconds. The previous results stay on screen, dimmed,
            while the next ones load.
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
        detail:
          'The same gates as every other request to /api/questions. Each gate is a check that can stop the request.',
        where: 'api · modules/auth/middleware.ts, modules/questions/routes.ts',
        checks: [
          SESSION,
          RATE,
          {
            text: 'The query has the right shape: q up to 200 characters, limit 1 to 50, offset 0 to 10,000, and no unknown fields. Deeper than offset 10,000, the list asks you to narrow your search.',
            fail: '400 VALIDATION_ERROR',
          },
        ],
      },
      {
        title: 'Tag names become tag ids',
        detail: (
          <>
            <Code>technology:react</Code> is looked up in the tag table. Different categories are
            AND-ed: a question must match all of them. Values inside one category are OR-ed: a
            question needs to match only one. Checking whether you may see a question is not a
            separate step here. It is built into the SQL in the next layer.
          </>
        ),
        where: 'api · modules/tags/tags.ts → resolveTagGroups()',
        checks: [
          {
            text: 'Every tag exists in the fixed taxonomy (the set list of allowed tags).',
            fail: '400 UNKNOWN_TAG · UNKNOWN_TAG_CATEGORY',
          },
        ],
      },
      {
        title: 'Database: one WHERE decides what you may see',
        detail:
          'Reads only. Rows you may not see are never fetched, counted or ranked. So a search can never reveal that a restricted question exists.',
        where: 'api · modules/questions/question.repo.ts → searchQuestions()',
        code: {
          label: 'The query, simplified',
          text: `SELECT … FROM question q
WHERE ( q.department_id IS NULL                      -- global, or
        OR EXISTS (SELECT 1 FROM department_grant g  -- you hold the grant
                   WHERE g.user_id = $you AND g.department_id = q.department_id) )
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
    outcome:
      'Nothing is written. A question you may not see looks exactly like one that does not exist.',
    stages: [
      {
        title: 'You click a question in the list',
        detail:
          'The page shows the question, its tags and its edit history. It also shows a badge if the question is restricted to a client. The Edit button appears only if your role allows it.',
        where: 'web · features/questions/QuestionDetailPage.tsx',
      },
      {
        title: 'React makes two requests',
        detail: (
          <>
            <Code>useQuestion</Code> and <Code>useHistory</Code> call{' '}
            <Code>GET /api/questions/:id</Code> and <Code>/history</Code>. A 404 is shown as “not
            found”. The app does not retry it.
          </>
        ),
        where: 'web · features/questions/hooks.ts',
      },
      {
        title: 'The request passes the gates',
        detail:
          'First we check who you are, then the cap on requests per minute, then that the id is well formed.',
        where: 'api · modules/questions/routes.ts',
        checks: [SESSION, RATE, { text: 'The id is a UUID.', fail: '400 VALIDATION_ERROR' }],
      },
      {
        title: 'Visible first, history second',
        detail:
          'The history is fetched only after the question is confirmed visible to you. Only the edit diffs (what changed) of this question are returned. The raw audit payloads (the stored log data) are never returned, because they can name other questions.',
        where: 'api · modules/questions/service.ts → questionHistory()',
        checks: [
          {
            text: 'The question is loaded through the visibility rule (whether you are allowed to see it). If no row comes back, the answer is not found. It is the same answer as for an id that does not exist.',
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
  AND ( q.department_id IS NULL OR <you hold the grant> );
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
      'One transaction (a group of changes that all succeed or all fail) writes the question, its tags and an audit event (a permanent log row of who did what).',
    stages: [
      {
        title: 'You fill in the form and click Add question',
        detail:
          'The Add question button exists only for Author and Admin accounts. The form checks length and tags before sending. If the API finds a near-duplicate, a dialog lists the matches. You then choose whether to edit your question or add it anyway. An Author’s question starts as pending until a reviewer decides. An Admin’s goes live at once.',
        where: 'web · features/questions/QuestionForm.tsx, components/DuplicateDialog.tsx',
      },
      {
        title: 'React sends the new question',
        detail: (
          <>
            <Code>useCreateQuestion</Code> calls <Code>POST /api/questions</Code>. On success it
            marks every cached list as stale, so the lists reload and show the new question. Then it
            opens the question’s page.
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
        detail:
          'The role gate runs before the input check, so a read-only account never gets that far.',
        where: 'api · modules/questions/routes.ts',
        checks: [
          SESSION,
          RATE,
          { text: 'The role is Author or Admin.', fail: '403 FORBIDDEN' },
          {
            text: 'The body has the right shape: text 1 to 1000 characters, notes up to 10,000, at most 30 tags, and no unknown fields.',
            fail: '400 VALIDATION_ERROR',
          },
        ],
      },
      {
        title: 'The service checks the rules, cheapest first',
        detail:
          'The duplicate check runs inside the transaction. First it takes a lock on the normalised text (the text in a standard form). The lock makes other requests wait, so two people saving the same question at the same moment cannot both pass the check. A rejected duplicate is written to the audit table in its own commit. So the attempt leaves a trace even though no question is created.',
        where: 'api · modules/questions/service.ts → createQuestion()',
        checks: [
          {
            text: 'If you chose a client, you hold a grant for it (permission to see that client). A client you have no grant for looks exactly like one that does not exist.',
            fail: '404 NOT_FOUND',
          },
          {
            text: 'Every tag exists in the fixed taxonomy (the set list of allowed tags).',
            fail: '400 UNKNOWN_TAG · UNKNOWN_TAG_CATEGORY',
          },
          {
            text: 'No near-duplicate among the questions you can see. A near-duplicate means a text similarity score of 0.6 or more. Questions you cannot see are never compared.',
            fail: '409 DUPLICATE_SUSPECTED',
          },
        ],
      },
      {
        title: 'Database: three tables change in one transaction',
        detail:
          'If any insert fails, none of them is saved. After the commit, the question is read back through the visibility rule and returned with 201.',
        where: 'api · modules/questions/question.repo.ts → insertQuestion(), audit/audit.repo.ts',
        rows: [
          {
            table: 'question',
            action: 'INSERT',
            row: 'text · answer_notes · author_id = you · department_id (null means global) · created_at',
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
    outcome:
      'One transaction (a group of changes that all succeed or all fail) updates the question and records exactly what changed.',
    stages: [
      {
        title: 'You change a question and click Save changes',
        detail:
          'Edit question shows only for an Author on a question they wrote, or for an Admin. You cannot change a question’s department. When an Author saves, the question goes back for review. The form remembers which version of the question it opened.',
        where: 'web · features/questions/QuestionFormPage.tsx, auth/hooks.ts → canEdit()',
      },
      {
        title: 'React sends only the editable fields',
        detail: (
          <>
            <Code>useUpdateQuestion</Code> calls <Code>PATCH /api/questions/:id</Code> with text,
            notes and tags. It also sends <Code>expectedUpdatedAt</Code>, the version you opened. If
            you chose to save past a near-duplicate, it sends <Code>confirmNotDuplicate</Code> too.{' '}
            <Code>clientId</Code> is not part of the request. On success the cached lists, the
            question and its history are marked stale, so they reload.
          </>
        ),
        where: 'web · features/questions/hooks.ts, api.ts',
      },
      {
        title: 'The request passes the gates',
        detail:
          'There is no role gate here. The role check has to come after the check on whether you may see the question. So it lives in the service.',
        where: 'api · modules/questions/routes.ts',
        checks: [
          SESSION,
          RATE,
          {
            text: 'The id is a UUID (a long random id). The body holds at least one of text, answerNotes and tags. It holds nothing beyond those and the two optional fields above.',
            fail: '400 VALIDATION_ERROR',
          },
        ],
      },
      {
        title: 'Visibility, then role, then what changed',
        detail:
          'All of this runs inside one transaction, so it all succeeds or all fails together.',
        where: 'api · modules/questions/service.ts → updateQuestion()',
        checks: [
          { text: 'You are allowed to see the question.', fail: '404 NOT_FOUND' },
          {
            text: 'Your role allows it: Author on your own question, or Admin.',
            fail: '403 FORBIDDEN',
          },
          {
            text: 'The question is still the version you opened (expectedUpdatedAt). If someone saved first, your edit is refused. The form then offers “Load their version”.',
            fail: '409 EDIT_CONFLICT',
          },
          {
            text: 'Something actually changed. If not, the question comes back untouched and nothing is recorded.',
          },
          {
            text: 'A changed text is checked for near-duplicates like a new question: same lock, same 0.6 rule. It is never compared against itself.',
            fail: '409 DUPLICATE_SUSPECTED',
          },
        ],
      },
      {
        title: 'Database: update and audit commit together',
        detail:
          'The question row is locked for the whole transaction. Other requests for the same row wait. So no other save can slip in between the check that your version is current and the update. The history list on the question page is built from these audit rows.',
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
          {
            table: 'audit_event',
            action: 'INSERT',
            row: 'type = DUPLICATE_OVERRIDDEN, only when you saved past a match',
          },
        ],
      },
    ],
  },
  {
    id: 'review',
    label: 'Review a question',
    summary: 'A Reviewer opens a pending question and clicks Approve or Reject, with a note.',
    outcome:
      'One transaction (a group of changes that all succeed or all fail) records the decision on the question and writes one audit row. A row lock (making other requests wait for the same row) keeps two reviewers deciding at once safe.',
    stages: [
      {
        title: 'You open a pending question and choose Approve or Reject',
        detail:
          'The review panel shows only for a Reviewer on a pending question they did not write, or for an Admin. Rejecting needs a note, so the author knows what to change.',
        where: 'web · features/questions/components/ReviewPanel.tsx, auth/hooks.ts → canReview()',
      },
      {
        title: 'React sends the decision',
        detail: (
          <>
            <Code>useReviewQuestion</Code> calls <Code>POST /api/questions/:id/review</Code> with
            the decision and the note. On success the question, its history and the lists are marked
            stale, so they reload.
          </>
        ),
        where: 'web · features/questions/hooks.ts, api.ts',
      },
      {
        title: 'The request passes the gates',
        detail:
          'There is no role gate here either. The role check must come after the check on whether you may see the question.',
        where: 'api · modules/questions/routes.ts',
        checks: [
          SESSION,
          RATE,
          {
            text: 'The id is a UUID, the decision is APPROVED or REJECTED, and the note is at most 2,000 characters. The note is required when rejecting.',
            fail: '400 VALIDATION_ERROR',
          },
        ],
      },
      {
        title: 'Lock, then visibility, role and state',
        detail:
          'The same order as every write, inside one transaction: lock, then visibility, then role, then state.',
        where: 'api · modules/questions/service.ts → reviewQuestion()',
        checks: [
          {
            text: 'The question row is locked. A second reviewer has to wait, and then sees the first decision.',
          },
          { text: 'You are allowed to see the question.', fail: '404 NOT_FOUND' },
          { text: 'You are a Reviewer or an Admin.', fail: '403 FORBIDDEN' },
          { text: 'It is not your own question (Admins excepted).', fail: '403 FORBIDDEN' },
          {
            text: 'It is still pending, meaning waiting for a decision. Admins may overturn an earlier decision.',
            fail: '409 NOT_PENDING',
          },
        ],
      },
      {
        title: 'Database: the decision and its record commit together',
        detail:
          'The review note and the reviewer are shown on the question and in its history. The author sees the outcome in the sidebar count and on the Notifications page.',
        where: 'api · modules/questions/question.repo.ts → setReviewDecision()',
        rows: [
          {
            table: 'question',
            action: 'READ',
            row: 'FOR UPDATE: the row lock (other requests wait for this row)',
          },
          {
            table: 'question',
            action: 'UPDATE',
            row: 'status · review_note · reviewed_by_id · reviewed_at',
          },
          {
            table: 'audit_event',
            action: 'INSERT',
            row: 'type = QUESTION_APPROVED or QUESTION_REJECTED · payload = { note }',
          },
          {
            table: 'notification',
            action: 'INSERT',
            row: 'tells the author (not when they decided it themselves): user_id, question_id, the outcome. It holds ids only, no question text.',
          },
        ],
      },
    ],
  },
  {
    id: 'technologies',
    label: 'Manage a department’s technologies',
    summary: 'An Admin edits a department and adds a technology to it.',
    outcome:
      'If the name is new, a new technology is created. If it already exists, the existing one is linked to the department. Existing questions are never touched.',
    stages: [
      {
        title: 'You open Edit on a department and add a technology',
        detail:
          'The edit dialog lists the department’s technologies, each with Rename and Remove. It also has an Archived list with Restore. It suggests technologies that other departments already use. Changes apply at once.',
        where: 'web · features/admin/AdminDepartmentsPage.tsx, DepartmentTechnologies.tsx',
      },
      {
        title: 'React sends the name',
        detail: (
          <>
            <Code>useAddDepartmentTechnology</Code> calls{' '}
            <Code>POST /api/admin/clients/:id/technologies</Code> with a label. The lists, filters
            and question forms are marked stale, so they reload and pick up the change.
          </>
        ),
        where: 'web · features/admin/hooks.ts, api.ts',
      },
      {
        title: 'The request passes the gates',
        detail:
          'Every /admin route is admin-only. The rule is set once for the whole group of admin routes.',
        where: 'api · modules/admin/routes.ts',
        checks: [
          SESSION,
          { text: 'You are an Admin.', fail: '403 FORBIDDEN' },
          {
            text: 'The id is a UUID. The body is exactly { label }, 1 to 50 characters, with spaces trimmed from both ends.',
            fail: '400 VALIDATION_ERROR',
          },
        ],
      },
      {
        title: 'Match the name, then link or create',
        detail: (
          <>
            “Node.js”, “node-js” and “nodejs” count as the same technology. If the name matches an
            existing one, it is linked to the department, and un-archived if needed. If nothing
            matches, a new technology is created. Two admins may add the same new name at once. They
            still end up with one technology, because the unique index decides. A unique index is a
            database rule that refuses duplicates.
          </>
        ),
        where: 'api · modules/admin/technologies.ts → addDepartmentTechnology()',
        checks: [
          { text: 'The department exists and is not deleted.', fail: '404 NOT_FOUND' },
          { text: 'The name has letters or numbers in it.', fail: '400 BAD_REQUEST' },
        ],
      },
      {
        title: 'Database: at most three rows change in one transaction',
        detail:
          'From now on, a question for this department may use the technology. A question for another department may not.',
        where: 'api · modules/admin/technologies.ts',
        rows: [
          {
            table: 'tag',
            action: 'INSERT',
            row: 'only when the name is new · value = a slug of the label (a URL-safe, lower-case form)',
          },
          {
            table: 'tag',
            action: 'UPDATE',
            row: 'only when an archived match is revived · archived_at = null',
          },
          {
            table: 'department_tag',
            action: 'INSERT',
            row: '(department, technology), skipped if the link already exists',
          },
          {
            table: 'audit_event',
            action: 'INSERT',
            row: 'TAG_CREATED or TAG_RESTORED, then TAG_LINKED',
          },
        ],
      },
    ],
  },
  {
    id: 'delete-department',
    label: 'Delete and restore a department',
    summary: 'An Admin deletes a department, then changes their mind and restores it.',
    outcome:
      'Nothing is erased. The department and its questions are hidden. The technologies only it used are archived. A restore brings back exactly what the delete hid.',
    stages: [
      {
        title: 'You click Delete and read what will be hidden',
        detail:
          'The confirmation dialog asks the API first. It then says how many questions will be hidden, and how many of those are awaiting review. It also says how many users lose access and how many technologies will be archived. A deleted department appears under Deleted departments with a Restore button.',
        where: 'web · features/admin/AdminDepartmentsPage.tsx',
      },
      {
        title: 'React asks for the impact, then deletes',
        detail: (
          <>
            <Code>GET /api/admin/clients/:id/impact</Code> fills the dialog.{' '}
            <Code>DELETE /api/admin/clients/:id</Code> does the delete. Restore is{' '}
            <Code>POST /api/admin/clients/:id/restore</Code>.
          </>
        ),
        where: 'web · features/admin/hooks.ts, api.ts',
      },
      {
        title: 'The request passes the gates',
        detail: 'Admin only. The rule covers every route under /admin.',
        where: 'api · modules/admin/routes.ts',
        checks: [
          SESSION,
          { text: 'You are an Admin.', fail: '403 FORBIDDEN' },
          { text: 'The id is a UUID.', fail: '400 VALIDATION_ERROR' },
        ],
      },
      {
        title: 'Work out what only this department used',
        detail:
          'A technology is exclusive when no other live department uses it. Those technologies are archived, and each is marked as archived by this deletion. So a restore brings back exactly those. It also brings back any technology that an earlier deletion archived and that this department also uses. It leaves anything an admin archived by hand alone.',
        where: 'api · modules/admin/service.ts → deleteClient(), restoreClient()',
        checks: [
          { text: 'The department exists and is not already deleted.', fail: '404 NOT_FOUND' },
        ],
      },
      {
        title: 'Database: the questions are not touched at all',
        detail:
          'The visibility predicate (the WHERE condition that decides who sees what) already hides questions of a deleted department from everyone. So the delete only has to mark the department.',
        where: 'api · modules/admin/service.ts',
        rows: [
          {
            table: 'tag',
            action: 'UPDATE',
            row: 'archived_at = now and archived_by_department_id = this department, for technologies only it used',
          },
          {
            table: 'department',
            action: 'UPDATE',
            row: 'deleted_at = now (restore sets it back to null, meaning empty)',
          },
          {
            table: 'audit_event',
            action: 'INSERT',
            row: 'CLIENT_DELETED, or CLIENT_RESTORED on the way back',
          },
        ],
      },
    ],
  },
  {
    id: 'refresh',
    label: 'Stay signed in',
    summary: 'You keep working and, 15 minutes after sign-in, one request comes back 401.',
    outcome: 'The used refresh token is marked as used, and a new one is stored.',
    stages: [
      {
        title: 'You keep working. After 15 minutes one request comes back 401.',
        detail:
          'The access token lasts 15 minutes. So some request eventually finds it expired. The app handles that before you notice anything.',
        where: 'web · any page',
      },
      {
        title: 'The app refreshes the session once and retries',
        detail:
          'It calls POST /api/auth/refresh, then repeats the original request. If several requests get 401 at the same time, they share one refresh. A browser lock covers other open tabs too. This matters because a refresh token works only once.',
        where: 'web · shared/api/client.ts → refreshSession()',
      },
      {
        title: 'The refresh cookie is checked',
        detail: (
          <>
            The refresh token lasts 7 days. Its cookie is sent to <Code>/api/auth</Code> only, never
            with ordinary API calls.
          </>
        ),
        where: 'api · modules/auth/routes.ts, tokens.ts',
        checks: [
          {
            text: 'The cookie is present and its signature is valid (it has not been tampered with).',
            fail: '401 UNAUTHENTICATED',
          },
        ],
      },
      {
        title: 'Each refresh token works exactly once',
        detail: 'Using a spent token a second time is treated as theft. It ends the whole session.',
        where: 'api · modules/auth/service.ts → refresh()',
        checks: [
          { text: 'The token matches the hash on record.', fail: '401 UNAUTHENTICATED' },
          {
            text: 'Claim it atomically, in one step that cannot be interrupted: only one caller can change used_at from null. A second use revokes the whole session.',
            fail: '401 UNAUTHENTICATED',
          },
          { text: 'The account is still active.', fail: '401 UNAUTHENTICATED' },
        ],
      },
      {
        title: 'Database: rotate the token',
        detail:
          'New cookies are set. The request that failed is repeated, now with a valid session.',
        where: 'api · modules/auth/service.ts → issue(), revokeFamily()',
        rows: [
          {
            table: 'refresh_token',
            action: 'READ',
            row: 'by id: compare token_hash (the stored one-way scramble)',
          },
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
            row: 'on a replay (the same token used twice): revoked_at = now for the whole family_id',
          },
        ],
      },
    ],
  },
];
