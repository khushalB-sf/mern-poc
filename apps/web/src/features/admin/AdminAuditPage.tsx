import { useState } from 'react';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { formatDateTime } from '../../shared/lib/format';
import { Button, buttonClass } from '../../shared/ui/Button';
import { SelectField, TextField } from '../../shared/ui/Field';
import { Page, PageHeader } from '../../shared/ui/Page';
import { EmptyState, ErrorState, PageSpinner } from '../../shared/ui/states';
import { auditExportUrl, type AuditFilters } from './api';
import { AUDIT_LABEL, summarise } from './auditLabels';
import { useAudit } from './hooks';

export function AdminAuditPage() {
  useDocumentTitle('Audit log');
  // What is being edited, and what has been applied (the list only changes on "Apply filters").
  const [draft, setDraft] = useState<AuditFilters>({});
  const [applied, setApplied] = useState<AuditFilters>({});
  const audit = useAudit(applied);
  const events = audit.data?.pages.flatMap((p) => p.items) ?? [];
  const set = (k: keyof AuditFilters) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value || undefined }));

  return (
    <Page>
      <PageHeader
        title="Audit log"
        description="Every change to questions, users, departments, technologies and sign-in security, newest first. Events can be added but never edited or removed."
        actions={
          <a href={auditExportUrl(applied)} className={buttonClass('secondary')} download>
            Download CSV
          </a>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ ...draft });
        }}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm"
      >
        <SelectField
          label="Event"
          value={draft.type ?? ''}
          onChange={set('type')}
          className="min-w-56"
        >
          <option value="">Every event</option>
          {Object.entries(AUDIT_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField label="From" type="date" value={draft.from ?? ''} onChange={set('from')} />
        <TextField label="To" type="date" value={draft.to ?? ''} onChange={set('to')} />
        <Button type="submit" variant="primary">
          Apply filters
        </Button>
      </form>

      {audit.isPending ? (
        <PageSpinner label="Loading the audit log" />
      ) : audit.isError ? (
        <ErrorState title="Couldn't load the audit log" onRetry={() => void audit.refetch()}>
          {audit.error.message}
        </ErrorState>
      ) : events.length === 0 ? (
        <EmptyState title="No events match">
          Try a wider date range or another event type.
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
            <table className="w-full text-sm">
              <caption className="sr-only">Audit events, newest first</caption>
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-xs uppercase tracking-wider text-ink-soft">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    When
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Event
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    By
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-line align-top last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                      {formatDateTime(e.at)}
                    </td>
                    <td className="px-4 py-3 font-medium">{AUDIT_LABEL[e.type] ?? e.type}</td>
                    <td className="px-4 py-3">{e.actor.name}</td>
                    <td className="px-4 py-3">
                      <p>{summarise(e.payload)}</p>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-accent">
                          Show details
                        </summary>
                        <pre className="mt-1 max-w-md overflow-x-auto rounded bg-paper p-2 text-xs">
                          {JSON.stringify(e.payload, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {audit.hasNextPage && (
            <div className="mt-4 text-center">
              <Button loading={audit.isFetchingNextPage} onClick={() => void audit.fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
