import type { ReactNode } from 'react';
import { Icon } from '../../shared/ui/Icon';
import { APPROACHES, PRACTICES, SECURITY_ROWS } from './engineering';

const th = 'px-3 py-2 font-medium';

function Detail({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="mt-8 space-y-6">{children}</div>;
}

/** The ten main decisions, each as problem, decision, why and the honest cost. */
export function ApproachPanel() {
  return (
    <Detail>
      <ol aria-label="Implementation decisions" className="grid gap-4 lg:grid-cols-2">
        {APPROACHES.map((a, i) => (
          <li
            key={a.id}
            aria-labelledby={`approach-${a.id}`}
            className="rounded-md border border-line bg-surface p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Decision {i + 1}
            </p>
            <h3 id={`approach-${a.id}`} className="mt-1 text-lg font-semibold leading-snug">
              {a.title}
            </h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="font-medium">The problem</dt>
                <dd className="text-ink-soft">{a.problem}</dd>
              </div>
              <div>
                <dt className="font-medium">What we did</dt>
                <dd className="text-ink-soft">{a.decision}</dd>
              </div>
              <div>
                <dt className="font-medium">Why</dt>
                <dd className="text-ink-soft">{a.why}</dd>
              </div>
              <div>
                <dt className="font-medium">The cost</dt>
                <dd className="text-ink-soft">{a.tradeoff}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
    </Detail>
  );
}

/** Threat, defence and the test that proves it. */
export function SecurityPanel() {
  return (
    <Detail>
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Threats, the defence, and the tests that prove it</caption>
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th scope="col" className={th}>
                Threat
              </th>
              <th scope="col" className={th}>
                Defence
              </th>
              <th scope="col" className={th}>
                Proven by
              </th>
            </tr>
          </thead>
          <tbody>
            {SECURITY_ROWS.map((r) => (
              <tr key={r.threat} className="border-b border-line align-top last:border-b-0">
                <th scope="row" className="px-3 py-2 font-medium">
                  {r.threat}
                </th>
                <td className="px-3 py-2 text-ink-soft">{r.defence}</td>
                <td className="px-3 py-2 font-mono text-xs text-ink-soft">{r.proof}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Detail>
  );
}

/** How the work is done: testing, TDD, quality, accessibility, documentation, delivery. */
export function PracticesPanel() {
  return (
    <Detail>
      <div className="grid gap-6 lg:grid-cols-2">
        {PRACTICES.map((g) => (
          <section key={g.id} aria-labelledby={`practice-${g.id}`}>
            <h3 id={`practice-${g.id}`} className="text-lg font-semibold">
              {g.title}
            </h3>
            <ul className="mt-2 space-y-2 text-sm">
              {g.points.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <Icon name="check" className="mt-0.5 shrink-0 text-ok" />
                  <span className="min-w-0 text-ink-soft">{p}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Detail>
  );
}
