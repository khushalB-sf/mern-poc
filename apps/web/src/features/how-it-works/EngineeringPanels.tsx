import type { ReactNode } from 'react';
import { Icon } from '../../shared/ui/Icon';
import { APPROACHES, PRACTICES, SECURITY_ROWS } from './engineering';
import { FEATURE_ROWS, PATH_STAGES, QUESTIONS } from './learningPath';

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

/** The app through the "React to Full Stack 101" path: where each topic lives, every feature, and the questions to answer. */
export function PathPanel() {
  return (
    <Detail>
      <section aria-labelledby="path-topics">
        <h3 id="path-topics" className="text-lg font-semibold">
          Where each topic lives in this app
        </h3>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {PATH_STAGES.map((stage) => (
            <section
              key={stage.id}
              aria-labelledby={`path-${stage.id}`}
              className="rounded-md border border-line bg-surface p-4"
            >
              <h4 id={`path-${stage.id}`} className="font-semibold leading-snug">
                {stage.title}
              </h4>
              <p className="mt-1 text-sm text-ink-soft">{stage.goal}</p>
              <dl className="mt-3 space-y-3 text-sm">
                {stage.topics.map((t) => (
                  <div key={t.topic}>
                    <dt className="font-medium">{t.topic}</dt>
                    <dd className="text-ink-soft">{t.where}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </section>

      <section aria-labelledby="path-features">
        <h3 id="path-features" className="text-lg font-semibold">
          Every feature at a glance
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          Who can use it, the API it calls, the rule the server enforces, the tables it changes and
          the tests that prove it.
        </p>
        <div className="mt-3 overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Each feature with its API, rules, tables and tests
            </caption>
            <thead>
              <tr className="border-b border-line text-ink-soft">
                {['Feature', 'Who', 'API', 'Rules enforced', 'Tables', 'Proven by'].map((h) => (
                  <th key={h} scope="col" className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((r) => (
                <tr key={r.feature} className="border-b border-line align-top last:border-b-0">
                  <th scope="row" className="px-3 py-2 font-medium">
                    {r.feature}
                  </th>
                  <td className="px-3 py-2 text-ink-soft">{r.who}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-soft">{r.api}</td>
                  <td className="px-3 py-2 text-ink-soft">{r.rules}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-soft">{r.tables}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-soft">{r.proof}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="path-questions">
        <h3 id="path-questions" className="text-lg font-semibold">
          Questions you should be able to answer
        </h3>
        <ul aria-label="Walkthrough questions" className="mt-3 space-y-2">
          {QUESTIONS.map((x) => (
            <li key={x.q}>
              <details className="rounded-md border border-line bg-surface px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium">{x.q}</summary>
                <p className="mt-2 text-ink-soft">{x.a}</p>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </Detail>
  );
}
