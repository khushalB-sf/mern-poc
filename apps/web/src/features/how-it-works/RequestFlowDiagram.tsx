// One request, left to right, with what each gate answers when it refuses. Drawn as SVG;
// the ordered list below it is the accessible version.

const BOXES = [
  { x: 10, w: 110, title: 'Browser', sub: 'sends the cookie' },
  { x: 165, w: 140, title: 'requireAuth', sub: 'valid session?' },
  { x: 350, w: 140, title: 'requireRole', sub: 'create only' },
  { x: 535, w: 140, title: 'Zod validation', sub: 'right shape?' },
  { x: 720, w: 170, title: 'Handler → Service', sub: 'visible? allowed?', accent: true },
  { x: 935, w: 115, title: 'Postgres', sub: 'SQL + Prisma' },
] as const;

const REFUSALS = [
  { at: 1, x: 165, w: 140, lines: ['401 Unauthenticated'] },
  { at: 2, x: 350, w: 140, lines: ['403 Forbidden'] },
  { at: 3, x: 535, w: 140, lines: ['400 Validation'] },
  { at: 4, x: 705, w: 200, lines: ['404 Not found', '403 Forbidden · 409 Duplicate'] },
] as const;

const Y = 100;
const H = 64;

export const GATES = [
  'The browser sends the session cookie with the request.',
  'requireAuth checks the session. If it is not valid, the request ends with 401.',
  'requireRole checks the role. It runs on create only. If it is not allowed, 403.',
  'Zod validation checks the shape of the input. If it is wrong, 400.',
  'The handler calls the service, which checks visibility (404), then role and ownership (403), and for a create the duplicate check (409).',
  'Postgres runs the query. Reads carry the visibility rule in the SQL.',
  'The answer travels back as JSON: the data, or an error body.',
];

export function RequestFlowDiagram() {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 1060 260"
          aria-hidden="true"
          focusable="false"
          className="min-w-[720px] w-full font-sans"
        >
          <defs>
            <marker
              id="rf-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M0,0L10,5L0,10z" className="fill-control" />
            </marker>
            <marker
              id="rf-arrow-danger"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M0,0L10,5L0,10z" className="fill-danger" />
            </marker>
            <marker
              id="rf-arrow-accent"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M0,0L10,5L0,10z" className="fill-accent" />
            </marker>
          </defs>

          {/* The answer returns to the browser. */}
          <path
            d="M805,100 C805,16 65,16 65,100"
            fill="none"
            strokeWidth={1.6}
            className="stroke-accent"
            markerEnd="url(#rf-arrow-accent)"
          />
          <text x="435" y="26" textAnchor="middle" fontSize={11} className="fill-accent">
            JSON back to the browser: 200, 201, or an error body
          </text>

          {BOXES.map((b, i) => {
            const cx = b.x + b.w / 2;
            const accent = 'accent' in b && b.accent;
            return (
              <g key={b.title}>
                <rect
                  x={b.x}
                  y={Y}
                  width={b.w}
                  height={H}
                  rx={8}
                  strokeWidth={accent ? 2 : 1.5}
                  className={accent ? 'fill-accent-soft stroke-accent' : 'fill-surface stroke-line'}
                />
                <text
                  x={cx}
                  y={Y + 28}
                  textAnchor="middle"
                  fontSize={12.5}
                  fontWeight={600}
                  className="fill-ink"
                >
                  {b.title}
                </text>
                <text
                  x={cx}
                  y={Y + 47}
                  textAnchor="middle"
                  fontSize={10.5}
                  className="fill-ink-soft"
                >
                  {b.sub}
                </text>
                {i < BOXES.length - 1 && (
                  <path
                    d={`M${b.x + b.w},${Y + H / 2} L${BOXES[i + 1]!.x},${Y + H / 2}`}
                    fill="none"
                    strokeWidth={1.6}
                    className="stroke-control"
                    markerEnd="url(#rf-arrow)"
                  />
                )}
              </g>
            );
          })}

          {REFUSALS.map((r) => {
            const b = BOXES[r.at]!;
            const cx = b.x + b.w / 2;
            const h = r.lines.length === 1 ? 34 : 50;
            return (
              <g key={r.lines[0]}>
                <path
                  d={`M${cx},${Y + H} L${cx},196`}
                  fill="none"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  className="stroke-danger"
                  markerEnd="url(#rf-arrow-danger)"
                />
                <rect
                  x={r.x}
                  y={196}
                  width={r.w}
                  height={h}
                  rx={6}
                  strokeWidth={1.5}
                  className="fill-danger-bg stroke-danger"
                />
                {r.lines.map((line, i) => (
                  <text
                    key={line}
                    x={r.x + r.w / 2}
                    y={196 + 21 + i * 16}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    className="fill-danger"
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <ol aria-label="Gates a request passes, in order" className="sr-only">
        {GATES.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ol>
    </div>
  );
}
