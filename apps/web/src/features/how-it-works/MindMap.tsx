// A mind map drawn as SVG on wide screens and shown as a nested outline everywhere else.
// The outline is also the accessible version: the drawing is hidden from assistive technology.

/** "restricted" is the amber used for client-restricted things; "danger" marks a refusal. */
export type Tone = 'plain' | 'restricted' | 'danger';

export interface MindLeaf {
  text: string;
  tone?: Tone;
}
export interface MindBranch {
  title: string;
  tone?: Tone;
  leaves: MindLeaf[];
}
export interface MindMapData {
  center: string;
  branches: MindBranch[];
}

// Literal class names so Tailwind can see them.
const BOX: Record<Tone, string> = {
  plain: 'fill-surface stroke-line',
  restricted: 'fill-restricted-bg stroke-restricted-edge',
  danger: 'fill-danger-bg stroke-danger',
};
const INK: Record<Tone, string> = {
  plain: 'fill-ink',
  restricted: 'fill-restricted-ink',
  danger: 'fill-danger',
};
const OUTLINE_INK: Record<Tone, string> = {
  plain: '',
  restricted: 'text-restricted-ink',
  danger: 'text-danger',
};

const WIDTH = { leaf: 196, branch: 150, center: 156, gapLeaf: 34, gapCentre: 44 };
const X = {
  leafL: 0,
  branchL: WIDTH.leaf + WIDTH.gapLeaf,
  center: WIDTH.leaf + WIDTH.gapLeaf + WIDTH.branch + WIDTH.gapCentre,
  branchR:
    WIDTH.leaf + WIDTH.gapLeaf + WIDTH.branch + WIDTH.gapCentre + WIDTH.center + WIDTH.gapCentre,
  leafR:
    WIDTH.leaf +
    WIDTH.gapLeaf +
    WIDTH.branch +
    WIDTH.gapCentre +
    WIDTH.center +
    WIDTH.gapCentre +
    WIDTH.branch +
    WIDTH.gapLeaf,
};
const TOTAL_W = X.leafR + WIDTH.leaf;
const MARGIN = 8;
const PAD_Y = 8;
const LEAF_GAP = 6;
const GROUP_GAP = 16;

interface Font {
  size: number;
  bold: boolean;
}
const F = {
  center: { size: 14, bold: true },
  branch: { size: 13, bold: true },
  leaf: { size: 12, bold: false },
} satisfies Record<string, Font>;

const lineHeight = (f: Font) => Math.round(f.size * 1.35);

/** Greedy word wrap using an average glyph width, since SVG cannot measure text for us. */
function wrap(text: string, width: number, f: Font): string[] {
  const perLine = Math.max(8, Math.floor((width - 20) / (f.size * (f.bold ? 0.6 : 0.56))));
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && `${line} ${word}`.length > perLine) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface Node {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  font: Font;
  tone: Tone;
}

const makeNode = (text: string, w: number, font: Font, tone: Tone): Omit<Node, 'x' | 'y'> => {
  const lines = wrap(text, w, font);
  return { w, h: lines.length * lineHeight(font) + PAD_Y * 2, lines, font, tone };
};

interface Placed {
  branch: Node;
  leaves: Node[];
  side: 'l' | 'r';
}

function layout(data: MindMapData) {
  type Group = { branch: Omit<Node, 'x' | 'y'>; leaves: Omit<Node, 'x' | 'y'>[]; height: number };
  const groups = data.branches.map((b): Group => {
    const branch = makeNode(b.title, WIDTH.branch, F.branch, b.tone ?? 'plain');
    const leaves = b.leaves.map((l) => makeNode(l.text, WIDTH.leaf, F.leaf, l.tone ?? 'plain'));
    const stack = leaves.reduce((s, l) => s + l.h, 0) + LEAF_GAP * Math.max(0, leaves.length - 1);
    return { branch, leaves, height: Math.max(branch.h, stack) };
  });

  // Put each branch on whichever side is shorter so far, keeping the original order within a side.
  const sides: { l: Group[]; r: Group[] } = { l: [], r: [] };
  const heights = { l: 0, r: 0 };
  for (const g of groups) {
    const side = heights.r <= heights.l ? 'r' : 'l';
    sides[side].push(g);
    heights[side] += g.height + GROUP_GAP;
  }
  const sideH = (s: 'l' | 'r') => Math.max(0, heights[s] - GROUP_GAP);
  const center = makeNode(data.center, WIDTH.center, F.center, 'plain');
  const H = Math.max(sideH('l'), sideH('r'), center.h) + MARGIN * 2;

  const placed: Placed[] = [];
  for (const s of ['l', 'r'] as const) {
    let y = (H - sideH(s)) / 2;
    for (const g of sides[s]) {
      const stackH =
        g.leaves.reduce((t, l) => t + l.h, 0) + LEAF_GAP * Math.max(0, g.leaves.length - 1);
      let ly = y + (g.height - stackH) / 2;
      const leaves = g.leaves.map((l): Node => {
        const n = { ...l, x: s === 'r' ? X.leafR : X.leafL, y: ly };
        ly += l.h + LEAF_GAP;
        return n;
      });
      const branch: Node = {
        ...g.branch,
        x: s === 'r' ? X.branchR : X.branchL,
        y: y + (g.height - g.branch.h) / 2,
      };
      placed.push({ branch, leaves, side: s });
      y += g.height + GROUP_GAP;
    }
  }
  return { H, placed, center: { ...center, x: X.center, y: (H - center.h) / 2 } as Node };
}

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
};

function NodeShape({
  n,
  anchor,
  strong,
}: {
  n: Node;
  anchor: 'middle' | 'start';
  strong?: boolean;
}) {
  const lh = lineHeight(n.font);
  const tx = anchor === 'middle' ? n.x + n.w / 2 : n.x + 10;
  return (
    <g>
      <rect
        x={n.x}
        y={n.y}
        width={n.w}
        height={n.h}
        rx={8}
        strokeWidth={strong ? 2 : 1.5}
        className={strong ? 'fill-accent-soft stroke-accent' : BOX[n.tone]}
      />
      <text
        textAnchor={anchor}
        fontSize={n.font.size}
        fontWeight={n.font.bold ? 600 : 400}
        className={strong ? 'fill-ink' : INK[n.tone]}
      >
        {n.lines.map((line, i) => (
          <tspan key={line + i} x={tx} y={n.y + PAD_Y + lh * i + n.font.size}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

export function MindMap({ data }: { data: MindMapData }) {
  const { H, placed, center } = layout(data);
  const cy = center.y + center.h / 2;

  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <svg
        viewBox={`0 0 ${TOTAL_W} ${H}`}
        aria-hidden="true"
        focusable="false"
        className="hidden w-full font-sans lg:block"
      >
        {placed.map((p) => {
          const right = p.side === 'r';
          const by = p.branch.y + p.branch.h / 2;
          const fromX = right ? center.x + center.w : center.x;
          const toX = right ? p.branch.x : p.branch.x + p.branch.w;
          const leafFromX = right ? p.branch.x + p.branch.w : p.branch.x;
          return (
            <g key={p.branch.lines.join(' ')}>
              <path
                d={curve(fromX, cy, toX, by)}
                fill="none"
                strokeWidth={1.5}
                className="stroke-control"
              />
              {p.leaves.map((l) => (
                <path
                  key={l.lines.join(' ')}
                  d={curve(leafFromX, by, right ? l.x : l.x + l.w, l.y + l.h / 2)}
                  fill="none"
                  strokeWidth={1.5}
                  className="stroke-control"
                />
              ))}
            </g>
          );
        })}
        <NodeShape n={center} anchor="middle" strong />
        {placed.map((p) => (
          <g key={`n-${p.branch.lines.join(' ')}`}>
            <NodeShape n={p.branch} anchor="middle" />
            {p.leaves.map((l) => (
              <NodeShape key={l.lines.join(' ')} n={l} anchor="start" />
            ))}
          </g>
        ))}
      </svg>

      {/* Outline: the whole map below the large breakpoint, and the screen-reader version always. */}
      <ul aria-label={`${data.center}: overview`} className="lg:sr-only">
        <li className="font-semibold">
          {data.center}
          <ul className="mt-2 space-y-3 border-l-2 border-accent pl-4">
            {data.branches.map((b) => (
              <li key={b.title}>
                <span className={`font-medium ${OUTLINE_INK[b.tone ?? 'plain']}`}>{b.title}</span>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm font-normal text-ink-soft">
                  {b.leaves.map((l) => (
                    <li key={l.text} className={OUTLINE_INK[l.tone ?? 'plain']}>
                      {l.text}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </li>
      </ul>
    </div>
  );
}
