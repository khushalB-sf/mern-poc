import { useEffect, useState } from 'react';
import { Button } from '../../shared/ui/Button';
import { cx } from '../../shared/ui/cx';
import { Icon } from '../../shared/ui/Icon';
import { FEATURES, LAYERS, type DbRow, type Stage } from './features';
import { Code, FailChip } from './Flow';

const WRITES: DbRow['action'][] = ['INSERT', 'UPDATE', 'DELETE'];

function Rows({ rows }: { rows: DbRow[] }) {
  return (
    <ul aria-label="Tables touched" className="mt-3 space-y-2">
      {rows.map((r) => (
        <li
          key={`${r.table}-${r.action}-${r.row}`}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border border-line bg-paper p-2.5 text-sm"
        >
          <span
            className={cx(
              'w-16 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-xs font-semibold',
              WRITES.includes(r.action) ? 'bg-accent text-accent-ink' : 'border border-line',
            )}
          >
            {r.action}
          </span>
          <Code>{r.table}</Code>
          <span className="min-w-0 flex-1 basis-60 text-ink-soft">{r.row}</span>
        </li>
      ))}
    </ul>
  );
}

function StageCard({ stage, number, state }: { stage: Stage; number: number; state: string }) {
  const layer = LAYERS[number - 1]!;
  const current = state === 'current';
  return (
    <div
      className={cx(
        'min-w-0 flex-1 rounded-md border bg-surface p-4 transition-opacity',
        current ? 'border-accent ring-2 ring-accent' : 'border-line',
        state === 'later' && 'opacity-50',
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">
        {layer.label}
        <span className="font-normal normal-case tracking-normal text-ink-soft">
          {' '}
          · {layer.who}
        </span>
      </p>
      <h4 className="mt-1 text-lg font-semibold leading-snug">{stage.title}</h4>
      <p className="mt-1.5 text-ink-soft">{stage.detail}</p>

      {stage.checks && (
        <ul className="mt-3 space-y-2 text-sm">
          {stage.checks.map((c, i) => (
            <li key={i} className="flex gap-2">
              <Icon name="check" className="mt-0.5 shrink-0 text-ok" />
              <span className="min-w-0">
                {c.text}
                {c.fail && (
                  <>
                    {' '}
                    <FailChip>{c.fail}</FailChip>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {stage.code && (
        <figure className="mt-3">
          <figcaption className="text-xs text-ink-soft">{stage.code.label}</figcaption>
          <pre className="mt-1 overflow-x-auto rounded-md border border-line bg-paper p-3 font-mono text-xs leading-relaxed">
            {stage.code.text}
          </pre>
        </figure>
      )}

      {stage.rows && <Rows rows={stage.rows} />}

      <p className="mt-3 text-xs text-ink-soft">
        Open: <span className="font-mono">{stage.where}</span>
      </p>
    </div>
  );
}

/** Each feature from the first click to the rows in Postgres, in five fixed layers. */
export function FeatureWalkthrough() {
  const [featureId, setFeatureId] = useState(FEATURES[0]!.id);
  // null shows every step; a number is "presenting": that step is lit and the later ones are dimmed.
  const [step, setStep] = useState<number | null>(null);
  const feature = FEATURES.find((f) => f.id === featureId)!;
  const last = feature.stages.length - 1;

  useEffect(() => {
    if (step !== null)
      document.getElementById(`walk-${step}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [step, featureId]);

  const pick = (id: string) => {
    setFeatureId(id);
    setStep((s) => (s === null ? null : 0));
  };

  return (
    <div className="mt-8">
      <div role="group" aria-label="Choose a feature" className="flex flex-wrap gap-2">
        {FEATURES.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={f.id === featureId}
            onClick={() => pick(f.id)}
            className={cx(
              'min-h-11 rounded-md border px-4 text-sm font-medium',
              f.id === featureId
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-control bg-surface hover:bg-accent-soft',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-md border border-line bg-surface p-4">
        <h3 className="font-serif text-xl font-semibold">{feature.label}</h3>
        <p className="mt-1">{feature.summary}</p>
        <p className="mt-3 rounded-md bg-accent-soft p-3 text-sm">
          <span className="font-semibold">In the database: </span>
          {feature.outcome}
        </p>

        <ol aria-hidden="true" className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
          {LAYERS.map((l, i) => (
            <li key={l.id} className="flex items-center gap-1.5">
              <span
                className={cx(
                  'rounded-full border px-2.5 py-1',
                  step === i ? 'border-accent bg-accent-soft font-semibold' : 'border-line',
                )}
              >
                {l.label}
              </span>
              {i < LAYERS.length - 1 && <Icon name="chevronRight" className="text-control" />}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {step === null ? (
          <Button variant="primary" onClick={() => setStep(0)}>
            Present step by step
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={() => setStep(step - 1)} disabled={step === 0}>
              <Icon name="chevronLeft" /> Back
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => setStep(step + 1)}
              disabled={step === last}
            >
              Next <Icon name="chevronRight" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStep(null)}>
              Show all
            </Button>
            <span role="status" className="px-1 text-sm text-ink-soft">
              Step {step + 1} of {feature.stages.length}: {LAYERS[step]!.label}
            </span>
          </>
        )}
      </div>

      <ol aria-label={`${feature.label}: from click to database`} className="mt-6">
        {feature.stages.map((s, i) => {
          const state =
            step === null ? 'all' : i === step ? 'current' : i > step ? 'later' : 'done';
          return (
            <li
              key={LAYERS[i]!.id}
              id={`walk-${i}`}
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex gap-3 pb-5 last:pb-0 sm:gap-4"
            >
              <div aria-hidden="true" className="flex flex-col items-center">
                <span
                  className={cx(
                    'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                    state === 'current'
                      ? 'bg-accent text-accent-ink'
                      : 'bg-accent-soft text-accent',
                  )}
                >
                  {i + 1}
                </span>
                {i < last && <span className="mt-1 w-px flex-1 bg-line" />}
              </div>
              <StageCard stage={s} number={i + 1} state={state} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
