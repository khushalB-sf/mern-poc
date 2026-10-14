import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../shared/api/client';
import type { DuplicateMatch, Question } from '../../shared/api/types';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { buttonClass } from '../../shared/ui/Button';
import { ErrorState, PageSpinner } from '../../shared/ui/states';
import { useToast } from '../../shared/ui/Toast';
import { canCreate, canEdit, useMe } from '../auth/hooks';
import { DuplicateDialog } from './components/DuplicateDialog';
import { useClients, useCreateQuestion, useQuestion, useTags, useUpdateQuestion } from './hooks';
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
  if (e.code.startsWith('UNKNOWN_TAG'))
    return { formError: `${e.message}. Reload the page to get the latest tags.` };
  if (e.status === 404) return { fields: { clientId: "That client isn't available to you." } };
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
          Ask an author or reviewer if you'd like to add questions.
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
            Authors can edit their own questions. Reviewers can edit any question.
          </ErrorState>
          <BackLink to={`/questions/${id}`} />
        </Shell>
      );
    }
  }

  return mode === 'create' ? (
    <CreateView categories={tags.data} clients={clients.data} />
  ) : (
    <EditView question={existing.data!} categories={tags.data} />
  );
}

type Categories = NonNullable<ReturnType<typeof useTags>['data']>;

function CreateView({
  categories,
  clients,
}: {
  categories: Categories;
  clients: NonNullable<ReturnType<typeof useClients>['data']>;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateQuestion();
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
          toast('Question added');
          navigate(`/questions/${q.id}`);
        },
        onError: (e) => {
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

function EditView({ question, categories }: { question: Question; categories: Categories }) {
  const navigate = useNavigate();
  const toast = useToast();
  const update = useUpdateQuestion(question.id);
  const [formError, setFormError] = useState<string>();
  const [serverErrors, setServerErrors] = useState<FieldErrors>();

  return (
    <Shell title="Edit question">
      <QuestionForm
        mode="edit"
        defaultValues={{
          text: question.text,
          answerNotes: question.answerNotes,
          tags: question.tags.map((t) => `${t.category}:${t.value}`),
          clientId: question.client?.id ?? '',
        }}
        categories={categories}
        clients={[]}
        lockedClientName={question.client?.name}
        submitting={update.isPending}
        formError={formError}
        serverErrors={serverErrors}
        cancelTo={`/questions/${question.id}`}
        onSubmit={(v) => {
          setFormError(undefined);
          setServerErrors(undefined);
          update.mutate(
            { text: v.text, answerNotes: v.answerNotes, tags: v.tags },
            {
              onSuccess: () => {
                toast('Changes saved');
                navigate(`/questions/${question.id}`);
              },
              onError: (e) => {
                const { formError, fields } = explain(e);
                setFormError(formError);
                setServerErrors(fields);
              },
            },
          );
        }}
      />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <h1 className="mb-6 font-serif text-3xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

function BackLink({ to }: { to: string }) {
  return (
    <p className="text-center">
      <Link to={to} className={buttonClass('secondary')}>
        Go back
      </Link>
    </p>
  );
}
