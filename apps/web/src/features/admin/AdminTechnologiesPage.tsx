import { useState } from 'react';
import type { Technology } from '../../shared/api/types';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { plural } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { Page, PageHeader } from '../../shared/ui/Page';
import { EmptyState, ErrorState, PageSpinner } from '../../shared/ui/states';
import { useToast } from '../../shared/ui/Toast';
import { useSetTechnologyRetired, useTechnologies } from './hooks';

function TechList({
  label,
  items,
  action,
  busyId,
}: {
  label: string;
  items: Technology[];
  action: (t: Technology) => React.ReactNode;
  busyId?: string | undefined;
}) {
  return (
    <ul
      aria-label={label}
      className="divide-y divide-line rounded-xl border border-line bg-surface shadow-sm"
    >
      {items.map((t) => (
        <li
          key={t.id}
          aria-busy={busyId === t.id}
          className="flex items-center justify-between gap-3 p-4"
        >
          <div className="min-w-0">
            <p className="font-medium">{t.label}</p>
            <p className="text-sm text-ink-soft">{plural(t.questionCount, 'question')}</p>
          </div>
          {action(t)}
        </li>
      ))}
    </ul>
  );
}

export function AdminTechnologiesPage() {
  useDocumentTitle('Technologies');
  const technologies = useTechnologies();
  const setRetired = useSetTechnologyRetired();
  const toast = useToast();
  const [retiring, setRetiring] = useState<Technology | null>(null);

  const active = technologies.data?.filter((t) => !t.retired) ?? [];
  const retired = technologies.data?.filter((t) => t.retired) ?? [];

  return (
    <Page>
      <PageHeader
        title="Technologies"
        description="Retire a technology to stop it being offered in filters and on new questions. Questions that already have it keep it."
      />

      {technologies.isPending ? (
        <PageSpinner label="Loading technologies" />
      ) : technologies.isError ? (
        <ErrorState title="Couldn't load technologies" onRetry={() => void technologies.refetch()}>
          {technologies.error.message}
        </ErrorState>
      ) : (
        <div className="space-y-10">
          {setRetired.isError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {(setRetired.error as Error).message}
            </p>
          )}
          <section aria-labelledby="active-technologies">
            <h2 id="active-technologies" className="mb-3 font-serif text-xl font-semibold">
              In use
            </h2>
            {active.length === 0 ? (
              <EmptyState title="No active technologies">
                Restore one from the list below.
              </EmptyState>
            ) : (
              <TechList
                label="Technologies"
                items={active}
                busyId={setRetired.isPending ? setRetired.variables?.id : undefined}
                action={(t) => (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Retire ${t.label}`}
                    onClick={() => setRetiring(t)}
                  >
                    Retire
                  </Button>
                )}
              />
            )}
          </section>

          {retired.length > 0 && (
            <section aria-labelledby="retired-technologies">
              <h2 id="retired-technologies" className="font-serif text-xl font-semibold">
                Retired
              </h2>
              <p className="mt-1 mb-3 text-sm text-ink-soft">
                Hidden from filters and the question form. Restore one to offer it again.
              </p>
              <TechList
                label="Retired technologies"
                items={retired}
                busyId={setRetired.isPending ? setRetired.variables?.id : undefined}
                action={(t) => (
                  <Button
                    size="sm"
                    loading={setRetired.isPending && setRetired.variables?.id === t.id}
                    aria-label={`Restore ${t.label}`}
                    onClick={() =>
                      setRetired.mutate(
                        { id: t.id, retired: false },
                        { onSuccess: () => toast(`Restored ${t.label}`) },
                      )
                    }
                  >
                    Restore
                  </Button>
                )}
              />
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={retiring !== null}
        title={retiring ? `Retire ${retiring.label}?` : 'Retire technology'}
        confirmLabel="Retire technology"
        loading={setRetired.isPending}
        error={setRetired.isError ? (setRetired.error as Error).message : undefined}
        onClose={() => {
          setRetired.reset();
          setRetiring(null);
        }}
        onConfirm={() =>
          retiring &&
          setRetired.mutate(
            { id: retiring.id, retired: true },
            {
              onSuccess: () => {
                toast(`Retired ${retiring.label}`);
                setRetiring(null);
              },
            },
          )
        }
      >
        <p>
          {retiring?.label} will no longer be offered in filters or when writing questions.{' '}
          {retiring && retiring.questionCount > 0
            ? `The ${plural(retiring.questionCount, 'question')} that use it keep it. `
            : ''}
          You can restore it any time.
        </p>
      </ConfirmDialog>
    </Page>
  );
}
