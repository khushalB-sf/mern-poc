import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../shared/api/client';
import type { DuplicateMatch, Question } from '../../shared/api/types';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { Column, Page, PageHeader } from '../../shared/ui/Page';
import { Button, buttonClass } from '../../shared/ui/Button';
import { ErrorState, PageSpinner } from '../../shared/ui/states';
import { useToast } from '../../shared/ui/Toast';
import { canCreate, canEdit, isAdmin, useMe } from '../auth/hooks';
import { DuplicateDialog } from './components/DuplicateDialog';
import {
  refreshTaxonomy,
  useClients,
  useCreateQuestion,
  useQuestion,
  useTags,
  useUpdateQuestion,
} from './hooks';
import { isTagConflict, TAG_CONFLICT_MESSAGE } from '../../shared/api/errors';
import { QuestionForm, type FormValues } from './QuestionForm';

const EMPTY: FormValues = { text: '', answerNotes: '', tags: [], clientId: '' };
type FieldErrors = Partial<Record<keyof FormValues, string>>;

/** Turns an API failure into field errors and/or one message above the form. */
function explain(e: unknown): { formError?: string; fields?: FieldErrors } {
  if (!(e instanceof ApiError))
    return { formError: "We couldn't save. Check your connection and try again." };
  if (e.code === 'VALIDATION_ERROR') {
    const fields: FieldErrors = {};
    for (const i of (e.details.issues as { path: string; message: string }[] | undefined) ?? []) {
      const key = i.path.split('.')[0] as keyof FormValues;
      if (key in EMPTY) fields[key] = i.message;
    }
    return Object.keys(fields).length
      ? { fields }
      : { formError: 'Some details are not valid. Check the form and try again.' };
  }
  if (isTagConflict(e)) return { formError: TAG_CONFLICT_MESSAGE };
  if (e.code.startsWith('UNKNOWN_TAG'))
    return { formError: `${e.message}. Reload the page to get the latest tags.` };
  if (e.status === 404) return { fields: { clientId: "That department isn't available to you." } };
  if (e.status === 403)
    return { formError: 'Your account has read-only access, so you cannot do this.' };
  if (e.status === 429) return { formError: 'Too many requests. Wait a moment, then try again.' };
  return { formError: e.message };
}

export function QuestionFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id = '' } = useParams();
  useDocumentTitle(mode === 'create' ? 'Add question' : 'Edit question');
  const { data: me } = useMe();
  const tags = useTags();
  const clients = useClients();
  const existing = useQuestion(mode === 'edit' ? id : '');

  if (!me) return null; // RequireAuth guarantees a user; this narrows the type
  if (mode === 'create' && !canCreate(me)) {
    return (
      <Shell title="Add question">
        <ErrorState title="Your account is read-only">
          Only authors and admins can add questions. Ask an admin if you need author access.
        </ErrorState>
        <BackLink to="/" />
      </Shell>
    );
  }

  if (tags.isPending || clients.isPending || (mode === 'edit' && existing.isPending)) {
    return <PageSpinner label="Loading form" />;
  }
  if (tags.isError || clients.isError) {
    return (
      <Shell title="Add question">
        <ErrorState
          onRetry={() => {
            void tags.refetch();
            void clients.refetch();
          }}
        >
          The form's options didn't load.
        </ErrorState>
      </Shell>
    );
  }
  if (mode === 'edit') {
    if (existing.isError || !existing.data) {
      return (
        <Shell title="Edit question">
          <ErrorState title="We can't find that question">
            It may have been removed, or you may not have access to it.
          </ErrorState>
          <BackLink to="/" />
        </Shell>
      );
    }
    if (!canEdit(me, existing.data)) {
      return (
        <Shell title="Edit question">
          <ErrorState title="You can't edit this question">
            Only the author of a question, or an admin, can edit it. Reviewers approve or reject it
            instead.
          </ErrorState>
          <BackLink to={`/questions/${id}`} />
        </Shell>
      );
    }
  }

  return mode === 'create' ? (
    <CreateView categories={tags.data} clients={clients.data} admin={isAdmin(me)} />
  ) : (
    <EditView
      question={existing.data!}
      categories={tags.data}
      clients={clients.data}
      admin={isAdmin(me)}
    />
  );
}

type Categories = NonNullable<ReturnType<typeof useTags>['data']>;

function CreateView({
  categories,
  clients,
  admin,
}: {
  categories: Categories;
  clients: NonNullable<ReturnType<typeof useClients>['data']>;
  admin: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateQuestion();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string>();
  const [serverErrors, setServerErrors] = useState<FieldErrors>();
  const [duplicate, setDuplicate] = useState<{
    matches: DuplicateMatch[];
    values: FormValues;
  } | null>(null);

  const submit = (values: FormValues, confirmNotDuplicate = false) => {
    setFormError(undefined);
    setServerErrors(undefined);
    create.mutate(
      {
        text: values.text,
        answerNotes: values.answerNotes,
        tags: values.tags,
        clientId: values.clientId || undefined,
        confirmNotDuplicate,
      },
      {
        onSuccess: (q) => {
          setDuplicate(null);
          toast(admin ? 'Question added' : 'Question submitted for review');
          navigate(`/questions/${q.id}`);
        },
        onError: (e) => {
          if (isTagConflict(e)) void refreshTaxonomy(qc);
          if (e instanceof ApiError && e.code === 'DUPLICATE_SUSPECTED') {
            setDuplicate({ matches: (e.details.matches as DuplicateMatch[]) ?? [], values });
            return;
          }
          setDuplicate(null);
          const { formError, fields } = explain(e);
          setFormError(formError);
          setServerErrors(fields);
        },
      },
    );
  };

  return (
    <Shell title="Add a question">
      <QuestionForm
        mode="create"
        defaultValues={EMPTY}
        categories={categories}
        clients={clients}
        submitting={create.isPending && !duplicate}
        formError={formError}
        serverErrors={serverErrors}
        cancelTo="/"
        goesLive={admin}
        onSubmit={(v) => submit(v)}
      />
      <DuplicateDialog
        open={duplicate !== null}
        yourText={duplicate?.values.text ?? ''}
        matches={duplicate?.matches ?? []}
        submitting={create.isPending}
        onEdit={() => setDuplicate(null)}
        onSubmitAnyway={() => duplicate && submit(duplicate.values, true)}
      />
    </Shell>
  );
}

function EditView({
  question,
  categories,
  clients,
  admin,
}: {
  question: Question;
  categories: Categories;
  clients: NonNullable<ReturnType<typeof useClients>['data']>;
  admin: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const update = useUpdateQuestion(question.id);
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string>();
  const [serverErrors, setServerErrors] = useState<FieldErrors>();
  // Someone saved this question while it was open here: the form offers to load their version.
  const [conflict, setConflict] = useState(false);
  const [duplicate, setDuplicate] = useState<{
    matches: DuplicateMatch[];
    values: FormValues;
  } | null>(null);

  const submit = (v: FormValues, confirmNotDuplicate = false) => {
    setFormError(undefined);
    setServerErrors(undefined);
    update.mutate(
      {
        text: v.text,
        answerNotes: v.answerNotes,
        tags: v.tags,
        expectedUpdatedAt: question.updatedAt,
        ...(confirmNotDuplicate && { confirmNotDuplicate: true }),
      },
      {
        onSuccess: () => {
          setDuplicate(null);
          toast(admin ? 'Changes saved' : 'Changes saved and sent for review');
          navigate(`/questions/${question.id}`);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'DUPLICATE_SUSPECTED') {
            setDuplicate({ matches: (e.details.matches as DuplicateMatch[]) ?? [], values: v });
            return;
          }
          setDuplicate(null);
          if (isTagConflict(e)) void refreshTaxonomy(qc);
          setConflict(e instanceof ApiError && e.code === 'EDIT_CONFLICT');
          const { formError, fields } = explain(e);
          setFormError(formError);
          setServerErrors(fields);
        },
      },
    );
  };

  return (
    <Shell title="Edit question">
      <QuestionForm
        // A new version of the question remounts the form with its text, so "Load their version" really loads it.
        key={question.updatedAt}
        mode="edit"
        defaultValues={{
          text: question.text,
          answerNotes: question.answerNotes,
          tags: question.tags.map((t) => `${t.category}:${t.value}`),
          clientId: question.client?.id ?? '',
        }}
        categories={categories}
        clients={clients}
        lockedClientName={question.client?.name}
        submitting={update.isPending}
        formError={formError}
        serverErrors={serverErrors}
        cancelTo={`/questions/${question.id}`}
        goesLive={admin}
        onSubmit={(v) => submit(v)}
        formAction={
          conflict ? (
            <Button
              size="sm"
              onClick={() => {
                setConflict(false);
                setFormError(undefined);
                void qc.invalidateQueries({ queryKey: ['questions'] });
              }}
            >
              Load their version
            </Button>
          ) : undefined
        }
      />
      <DuplicateDialog
        open={duplicate !== null}
        yourText={duplicate?.values.text ?? ''}
        matches={duplicate?.matches ?? []}
        submitting={update.isPending}
        onEdit={() => setDuplicate(null)}
        onSubmitAnyway={() => duplicate && submit(duplicate.values, true)}
      />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Page>
      <PageHeader title={title} />
      <Column>{children}</Column>
    </Page>
  );
}

function BackLink({ to }: { to: string }) {
  return (
    <p className="mt-4 text-center">
      <Link to={to} className={buttonClass('secondary')}>
        Go back
      </Link>
    </p>
  );
}
