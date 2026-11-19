import { Code } from './Flow';
import { cx } from '../../shared/ui/cx';

// One request as a picture: browser, API, database, with numbered arrows between them.
// Used by the Start here tab and by every feature walkthrough, so they all read the same way.

export interface JourneyNode {
  title: string;
  what: string;
  /** What it is built with, shown as code. */
  tech: string;
  /** Numbered steps that happen inside this box. */
  steps?: { n: number; text: string }[];
  /** Tables touched, shown as small chips (database box only). */
  chips?: string[];
}

/** [step number, short name, one-line example] */
type Arrow = readonly [number, string, string];

export interface JourneyLink {
  go: Arrow;
  back: Arrow;
}

export interface Journey {
  nodes: readonly [JourneyNode, JourneyNode, JourneyNode];
  links: readonly [JourneyLink, JourneyLink];
}

function Badge({ n }: { n: number }) {
  return (
    <span className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
      {n}
    </span>
  );
}

const down = (flip: string, right: string) => (
  <span aria-hidden="true">
    <span className="md:hidden">{flip}</span>
    <span className="hidden md:inline">{right}</span>
  </span>
);

/** `active` lights one box (0 browser, 1 API, 2 database) while a walkthrough is being presented. */
export function JourneyFlow({
  journey,
  label,
  active,
}: {
  journey: Journey;
  label: string;
  active?: 0 | 1 | 2 | null;
}) {
  return (
    <ol
      aria-label={label}
      className="grid items-stretch gap-2 rounded-md border border-line bg-surface p-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]"
    >
      {journey.nodes.flatMap((node, i) => {
        const link = journey.links[i];
        const items = [
          <li
            key={node.title}
            className={cx(
              'rounded-md border bg-paper p-3',
              active === i ? 'border-accent ring-2 ring-accent' : 'border-line',
            )}
          >
            <p className="font-semibold">{node.title}</p>
            <p className="mt-0.5 text-sm text-ink-soft">{node.what}</p>
            <p className="mt-2 text-xs text-ink-soft">
              Built with: <Code>{node.tech}</Code>
            </p>
            {node.chips && (
              <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {node.chips.map((c) => (
                  <li key={c} className="rounded-full border border-line px-2 py-0.5">
                    {c}
                  </li>
                ))}
              </ul>
            )}
            {node.steps && node.steps.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
                {node.steps.map((st) => (
                  <li key={st.n}>
                    <Badge n={st.n} />
                    {st.text}
                  </li>
                ))}
              </ul>
            )}
          </li>,
        ];
        if (link)
          items.push(
            <li
              key={`link-${i}`}
              className="flex flex-col justify-center gap-3 px-1 py-2 text-center text-xs md:min-w-40 md:max-w-52"
            >
              <p>
                <Badge n={link.go[0]} />
                <strong>{link.go[1]}</strong> {down('↓', '→')}
                <span className="block text-ink-soft">{link.go[2]}</span>
              </p>
              <p>
                <Badge n={link.back[0]} />
                {down('↑', '←')} <strong>{link.back[1]}</strong>
                <span className="block text-ink-soft">{link.back[2]}</span>
              </p>
            </li>,
          );
        return items;
      })}
    </ol>
  );
}
