import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
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
  /** In edit mode the client is fixed; show it instead of a picker. */
  lockedClientName?: string | null | undefined;
  submitting: boolean;
  formError?: string | undefined;
  /** Field errors reported by the server, keyed by form field. */
  serverErrors?: Partial<Record<keyof FormValues, string>> | undefined;
  cancelTo: string;
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
  serverErrors,
  cancelTo,
  onSubmit,
}: Props) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues });

  useEffect(() => {
    for (const [field, message] of Object.entries(serverErrors ?? {})) {
      setError(field as keyof FormValues, { message });
    }
  }, [serverErrors, setError]);

  const textLength = watch('text').length;
  const notesLength = watch('answerNotes').length;

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-7">
      {formError && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-bg px-3 py-2.5 text-sm font-medium text-danger"
        >
          {formError}
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

      <div>
        <p className="mb-1 text-sm font-medium">Tags</p>
        <p className="mb-3 text-sm text-ink-soft">
          Pick as many as apply in each group. Tags make the question easy to find.
        </p>
        <Controller
          control={control}
          name="tags"
          render={({ field }) => (
            <TagPicker
              categories={categories}
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

      {mode === 'create'
        ? clients.length > 0 && (
            <SelectField
              label="Who can see this question?"
              hint="Questions for a client are visible only to people with access to that client. This can't be changed later."
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
            <p className="rounded-md bg-restricted-bg px-3 py-2.5 text-sm text-restricted-ink">
              This question is restricted to {lockedClientName}. A question's client can't be
              changed after it is added.
            </p>
          )}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        <Link to={cancelTo} className={buttonClass('secondary')}>
          Cancel
        </Link>
        <Button type="submit" variant="primary" loading={submitting}>
          {mode === 'create' ? 'Add question' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
