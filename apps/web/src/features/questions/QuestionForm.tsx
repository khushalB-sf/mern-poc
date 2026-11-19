import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import type { Client, TagCategory } from '../../shared/api/types';
import { Button, buttonClass } from '../../shared/ui/Button';
import { SelectField, TextAreaField } from '../../shared/ui/Field';
import { TagPicker } from './components/TagPicker';

export const TEXT_MAX = 1000;
export const NOTES_MAX = 10_000;

export const formSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Enter the question')
    .max(TEXT_MAX, `Keep the question under ${TEXT_MAX.toLocaleString()} characters`),
  answerNotes: z
    .string()
    .max(NOTES_MAX, `Keep the notes under ${NOTES_MAX.toLocaleString()} characters`),
  tags: z.array(z.string()),
  clientId: z.string(),
});
export type FormValues = z.infer<typeof formSchema>;

interface Props {
  mode: 'create' | 'edit';
  defaultValues: FormValues;
  categories: TagCategory[];
  clients: Client[];
  /** In edit mode the department is fixed; show it instead of a picker. */
  lockedClientName?: string | null | undefined;
  submitting: boolean;
  formError?: string | undefined;
  /** Shown under the form error, e.g. a button that fixes it. */
  formAction?: ReactNode;
  /** Field errors reported by the server, keyed by form field. */
  serverErrors?: Partial<Record<keyof FormValues, string>> | undefined;
  cancelTo: string;
  /** Admin changes go live at once; everyone else's go to review. Only affects the button wording. */
  goesLive?: boolean;
  onSubmit: (values: FormValues) => void;
}

export function QuestionForm({
  mode,
  defaultValues,
  categories,
  clients,
  lockedClientName,
  submitting,
  formError,
  formAction,
  serverErrors,
  cancelTo,
  goesLive = false,
  onSubmit,
}: Props) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues });

  useEffect(() => {
    for (const [field, message] of Object.entries(serverErrors ?? {})) {
      setError(field as keyof FormValues, { message });
    }
  }, [serverErrors, setError]);

  const clientId = watch('clientId');
  // Technologies follow the department: a department question offers only its own, a global one any.
  const technologies = useMemo(() => {
    const list = clientId ? clients.find((c) => c.id === clientId)?.technologies : undefined;
    return list ? new Set(list) : null;
  }, [clientId, clients]);
  const departmentName = clientId ? clients.find((c) => c.id === clientId)?.name : undefined;

  // Choosing another department drops technologies it doesn't have (create only; edit keeps the department).
  useEffect(() => {
    if (mode !== 'create' || !technologies) return;
    const current = getValues('tags');
    const next = current.filter(
      (t) => !t.startsWith('technology:') || technologies.has(t.slice('technology:'.length)),
    );
    if (next.length !== current.length) setValue('tags', next);
  }, [mode, technologies, getValues, setValue]);

  const textLength = watch('text').length;
  const notesLength = watch('answerNotes').length;

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-7"
    >
      {formError && (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-bg px-3 py-2.5 text-sm font-medium text-danger"
        >
          {formError}
          {formAction && <span className="ml-3 inline-block">{formAction}</span>}
        </p>
      )}

      <TextAreaField
        label="Question"
        rows={3}
        hint="Write it the way you would ask it in the interview."
        counter={`${textLength.toLocaleString()} / ${TEXT_MAX.toLocaleString()}`}
        error={errors.text?.message}
        {...register('text')}
      />

      <TextAreaField
        label="Answer notes"
        rows={6}
        hint="What a good answer covers, and useful follow-ups. Optional."
        counter={`${notesLength.toLocaleString()} / ${NOTES_MAX.toLocaleString()}`}
        error={errors.answerNotes?.message}
        {...register('answerNotes')}
      />

      {mode === 'create'
        ? clients.length > 0 && (
            <SelectField
              label="Who can see this question?"
              hint="Questions for a department are visible only to people with access to that department. This can't be changed later."
              error={errors.clientId?.message}
              {...register('clientId')}
            >
              <option value="">Everyone</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} only
                </option>
              ))}
            </SelectField>
          )
        : lockedClientName && (
            <p className="rounded-lg bg-restricted-bg px-3 py-2.5 text-sm text-restricted-ink">
              This question is restricted to {lockedClientName}. A question's department can't be
              changed after it is added.
            </p>
          )}

      <div>
        <p className="mb-1 text-sm font-medium">Tags</p>
        <p className="mb-3 text-sm text-ink-soft">
          Pick as many as apply in each group. Tags make the question easy to find.
          {departmentName && ` Technologies are the ones ${departmentName} uses.`}
        </p>
        <Controller
          control={control}
          name="tags"
          render={({ field }) => (
            <TagPicker
              categories={categories}
              technologies={technologies}
              selected={field.value}
              onToggle={(tag) =>
                field.onChange(
                  field.value.includes(tag)
                    ? field.value.filter((t) => t !== tag)
                    : [...field.value, tag],
                )
              }
            />
          )}
        />
        {errors.tags?.message && (
          <p className="mt-2 text-sm font-medium text-danger">{errors.tags.message}</p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        <Link to={cancelTo} className={buttonClass('secondary')}>
          Cancel
        </Link>
        <Button type="submit" variant="primary" loading={submitting}>
          {mode === 'create'
            ? goesLive
              ? 'Add question'
              : 'Submit for review'
            : goesLive
              ? 'Save changes'
              : 'Save and resubmit'}
        </Button>
      </div>
    </form>
  );
}
