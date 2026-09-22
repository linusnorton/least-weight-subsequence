/**
 * Regenerates docs/algorithm.svg.
 *
 *   npm run diagram
 *
 * The frames are a recorded trace of a real run, and the decoded result is
 * cross-checked against `leastWeightSubsequence` itself, so the diagram cannot
 * drift from the implementation it illustrates.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { leastWeightSubsequence } from '../src/leastWeightSubsequence.ts';
import type { GetWeight, NodeId } from '../src/leastWeightSubsequence.ts';

const NODES: NodeId[] = ['A', 'B', 'C', 'D', 'E'];

const EDGES = new Map<string, number>([
  ['0,1', 100], ['0,2', 180], ['0,3', 420], ['0,4', 600],
  ['1,2', 90], ['1,3', 250], ['1,4', 500],
  ['2,3', 200], ['2,4', 320],
  ['3,4', 40],
]);

const weight = (i: number, j: number): number => EDGES.get(`${i},${j}`) ?? Infinity;
const getWeight: GetWeight = (from, to) =>
  weight(NODES.indexOf(from), NODES.indexOf(to));

interface Step {
  i: number;
  j: number;
  w: number;
  prefix: number;
  previous: number;
  total: number;
  improved: boolean;
  best: number[];
  from: number[];
}

// Record a trace of the same relaxation the implementation performs.
const steps: Step[] = [];
const best = [0, Infinity, Infinity, Infinity, Infinity];
const from = [-1, -1, -1, -1, -1];

for (let i = 0; i < NODES.length; i++) {
  if (best[i] === Infinity) {
    continue;
  }
  for (let j = i + 1; j < NODES.length; j++) {
    const w = weight(i, j);
    const prefix = best[i];
    const total = prefix + w;
    const previous = best[j];
    const improved = total < previous;
    if (improved) {
      best[j] = total;
      from[j] = i;
    }
    steps.push({ i, j, w, prefix, previous, total, improved, best: [...best], from: [...from] });
  }
}

const segments: Array<[number, number, number]> = [];
for (let j = NODES.length - 1; j > 0; j = from[j]) {
  segments.push([from[j], j, weight(from[j], j)]);
}
segments.reverse();

// Cross-check the trace against the real implementation.
const actual = leastWeightSubsequence(NODES, getWeight);
const traced = segments.map(([a, b, w]) => [[NODES[a], NODES[b]], w]);
if (JSON.stringify(actual) !== JSON.stringify(traced)) {
  throw new Error(
    `trace disagrees with leastWeightSubsequence\n  traced: ${JSON.stringify(traced)}\n  actual: ${JSON.stringify(actual)}`,
  );
}

// Layout.
const CW = 860;
const CH = 520;
const NX = [150, 290, 430, 570, 710];
const NY = 180;
const NR = 20;
const BOX_W = 74;
const BOX_H = 44;
const BOX_Y = 212;

const MX = 62;
const MY = 315;
const LBL_W = 40;
const CELL_W = 56;
const HDR_H = 26;
const CELL_H = 32;
const colX = (c: number): number => MX + LBL_W + c * CELL_W;
const rowY = (r: number): number => MY + HDR_H + r * CELL_H;

const RX = 400;
const RY = 312;
const RW = 430;
const RH = 160;

const BG = '#fcfcfb';
const FG = '#1f2328';
const MUTED = '#6e7781';
const LINE = '#d0d7de';
const BLUE = '#0969da';
const GREEN = '#1a7f37';
const RED = '#cf222e';
const PANEL = '#ffffff';
const SANS = 'ui-sans-serif,-apple-system,Segoe UI,Helvetica,Arial,sans-serif';
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

const PROBE = 1.15;
const FINAL = 3.6;
const TOTAL = steps.length * PROBE + FINAL;

/** Opacity animation making an element visible only during [t0, t1). */
function visible(t0: number, t1: number): string {
  const a = t0 / TOTAL;
  const b = t1 / TOTAL;
  let values: string;
  let keyTimes: string;
  if (t0 <= 0) {
    values = '1;0;0';
    keyTimes = `0;${b.toFixed(5)};1`;
  } else if (t1 >= TOTAL) {
    values = '0;1';
    keyTimes = `0;${a.toFixed(5)}`;
  } else {
    values = '0;1;0;0';
    keyTimes = `0;${a.toFixed(5)};${b.toFixed(5)};1`;
  }
  return `<animate attributeName="opacity" values="${values}" keyTimes="${keyTimes}" calcMode="discrete" dur="${TOTAL}s" repeatCount="indefinite"/>`;
}

const INFINITY = '&#8734;';
const ARROW_L = '&#8592;';
const ARROW_R = '&#8594;';
const fmt = (v: number): string => (v === Infinity ? INFINITY : String(v));

function arc(i: number, j: number, width: number, colour: string): string {
  const peak = 145 - 23 * (j - i - 1);
  const cy = 2 * peak - (NY - NR);
  const d = `M ${NX[i]} ${NY - NR} Q ${(NX[i] + NX[j]) / 2} ${cy} ${NX[j]} ${NY - NR}`;
  return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round"/>`;
}

const out: string[] = [];
out.push(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" width="${CW}" height="${CH}" font-family="${SANS}">`,
  `<rect width="${CW}" height="${CH}" rx="10" fill="${BG}"/>`,
  `<rect x="0.5" y="0.5" width="${CW - 1}" height="${CH - 1}" rx="10" fill="none" stroke="${LINE}"/>`,
  `<text x="30" y="36" font-size="15" font-weight="600" fill="${FG}">least-weight-subsequence</text>`,
  `<text x="30" y="56" font-size="12.5" fill="${MUTED}">Every node is passed through. The algorithm only chooses which ones are segment boundaries.</text>`,
);

for (let k = 0; k < NODES.length; k++) {
  out.push(
    `<circle cx="${NX[k]}" cy="${NY}" r="${NR}" fill="${PANEL}" stroke="${LINE}" stroke-width="1.5"/>`,
    `<text x="${NX[k]}" y="${NY + 5}" font-size="14" font-weight="600" text-anchor="middle" fill="${FG}">${NODES[k]}</text>`,
  );
  if (k < NODES.length - 1) {
    out.push(`<line x1="${NX[k] + NR}" y1="${NY}" x2="${NX[k + 1] - NR}" y2="${NY}" stroke="${LINE}" stroke-width="1.5"/>`);
  }
  out.push(`<rect x="${NX[k] - BOX_W / 2}" y="${BOX_Y}" width="${BOX_W}" height="${BOX_H}" rx="6" fill="${PANEL}" stroke="${LINE}"/>`);
}
out.push(
  `<text x="34" y="${BOX_Y + 21}" font-size="11.5" fill="${MUTED}">best[]</text>`,
  `<text x="34" y="${BOX_Y + 37}" font-size="11.5" fill="${MUTED}">from[]</text>`,
  `<text x="${MX}" y="${MY - 12}" font-size="12" font-weight="600" fill="${FG}">weight(i, j)</text>`,
);

for (let c = 0; c < 4; c++) {
  out.push(`<text x="${colX(c) + CELL_W / 2}" y="${MY + 18}" font-size="12" font-weight="600" text-anchor="middle" fill="${MUTED}">${NODES[c + 1]}</text>`);
}
for (let r = 0; r < 4; r++) {
  out.push(`<text x="${MX + LBL_W / 2}" y="${rowY(r) + 21}" font-size="12" font-weight="600" text-anchor="middle" fill="${MUTED}">${NODES[r]}</text>`);
  for (let c = 0; c < 4; c++) {
    const x = colX(c);
    const y = rowY(r);
    if (c < r) {
      out.push(`<rect x="${x}" y="${y}" width="${CELL_W}" height="${CELL_H}" fill="#f2f2f0" stroke="${LINE}"/>`);
    } else {
      out.push(
        `<rect x="${x}" y="${y}" width="${CELL_W}" height="${CELL_H}" fill="${PANEL}" stroke="${LINE}"/>`,
        `<text x="${x + CELL_W / 2}" y="${y + 21}" font-size="12.5" font-family="${MONO}" text-anchor="middle" fill="${FG}">${weight(r, c + 1)}</text>`,
      );
    }
  }
}
out.push(`<rect x="${RX}" y="${RY}" width="${RW}" height="${RH}" rx="8" fill="${PANEL}" stroke="${LINE}"/>`);

steps.forEach((s, k) => {
  const t0 = k * PROBE;
  const t1 = (k + 1) * PROBE;
  const colour = s.improved ? GREEN : RED;
  // The first frame defaults to visible so renderers without SMIL still show
  // a sensible still rather than an empty panel.
  const g: string[] = [`<g opacity="${k === 0 ? 1 : 0}">${visible(t0, t1)}`];

  g.push(arc(s.i, s.j, 3, BLUE));
  const cx = colX(s.j - 1);
  const cy = rowY(s.i);
  g.push(
    `<rect x="${cx}" y="${cy}" width="${CELL_W}" height="${CELL_H}" fill="${BLUE}" fill-opacity="0.13" stroke="${BLUE}" stroke-width="2"/>`,
    `<text x="${cx + CELL_W / 2}" y="${cy + 21}" font-size="12.5" font-weight="700" font-family="${MONO}" text-anchor="middle" fill="${BLUE}">${s.w}</text>`,
  );
  for (const m of [s.i, s.j]) {
    g.push(`<circle cx="${NX[m]}" cy="${NY}" r="${NR}" fill="none" stroke="${BLUE}" stroke-width="2.5"/>`);
  }
  for (let m = 0; m < NODES.length; m++) {
    const hot = m === s.j;
    if (hot) {
      g.push(`<rect x="${NX[m] - BOX_W / 2}" y="${BOX_Y}" width="${BOX_W}" height="${BOX_H}" rx="6" fill="${colour}" fill-opacity="0.12" stroke="${colour}" stroke-width="2"/>`);
    }
    g.push(`<text x="${NX[m]}" y="${BOX_Y + 21}" font-size="13.5" font-weight="${hot ? 700 : 500}" font-family="${MONO}" text-anchor="middle" fill="${hot ? colour : FG}">${fmt(s.best[m])}</text>`);
    const f = s.from[m];
    g.push(`<text x="${NX[m]}" y="${BOX_Y + 37}" font-size="10.5" font-family="${MONO}" text-anchor="middle" fill="${MUTED}">${f >= 0 ? ARROW_L + NODES[f] : '&#183;'}</text>`);
  }
  g.push(
    `<text x="${RX + 22}" y="${RY + 32}" font-size="11.5" font-weight="600" fill="${MUTED}">STEP ${k + 1} OF ${steps.length}</text>`,
    `<text x="${RX + 22}" y="${RY + 62}" font-size="14" font-family="${MONO}" fill="${FG}">i = ${NODES[s.i]}   j = ${NODES[s.j]}</text>`,
    `<text x="${RX + 22}" y="${RY + 92}" font-size="13.5" font-family="${MONO}" fill="${FG}">best[${NODES[s.i]}] + w = ${fmt(s.prefix)} + ${s.w} = ${s.total}</text>`,
  );
  if (s.improved) {
    g.push(
      `<text x="${RX + 22}" y="${RY + 122}" font-size="13.5" font-family="${MONO}" fill="${GREEN}">${s.total} &lt; ${fmt(s.previous)}  ${ARROW_R} update</text>`,
      `<text x="${RX + 22}" y="${RY + 144}" font-size="12.5" font-family="${MONO}" fill="${GREEN}">best[${NODES[s.j]}]=${s.total}  from[${NODES[s.j]}]=${NODES[s.i]}</text>`,
    );
  } else {
    g.push(
      `<text x="${RX + 22}" y="${RY + 122}" font-size="13.5" font-family="${MONO}" fill="${RED}">${s.total} &lt; ${fmt(s.previous)} ?  no  ${ARROW_R} keep</text>`,
      `<text x="${RX + 22}" y="${RY + 144}" font-size="12.5" font-family="${MONO}" fill="${MUTED}">best[${NODES[s.j]}] stays ${fmt(s.previous)}</text>`,
    );
  }
  g.push('</g>');
  out.push(g.join(''));
});

const g: string[] = [`<g opacity="0">${visible(steps.length * PROBE, TOTAL)}`];
for (const [a, b, w] of segments) {
  g.push(arc(a, b, 4.5, GREEN));
  g.push(`<text x="${(NX[a] + NX[b]) / 2}" y="${145 - 23 * (b - a - 1) - 8}" font-size="12" font-weight="700" font-family="${MONO}" text-anchor="middle" fill="${GREEN}">${w}</text>`);
}
for (const [a, b] of segments) {
  for (const m of [a, b]) {
    g.push(
      `<circle cx="${NX[m]}" cy="${NY}" r="${NR}" fill="${GREEN}" fill-opacity="0.12" stroke="${GREEN}" stroke-width="2.5"/>`,
      `<text x="${NX[m]}" y="${NY + 5}" font-size="14" font-weight="700" text-anchor="middle" fill="${GREEN}">${NODES[m]}</text>`,
    );
  }
}
const passed = NODES.map((_, m) => m).filter((m) => !segments.some(([a, b]) => a === m || b === m));
for (const m of passed) {
  g.push(`<text x="${NX[m]}" y="${NY + 5}" font-size="14" font-weight="600" text-anchor="middle" fill="${MUTED}">${NODES[m]}</text>`);
}
for (let m = 0; m < NODES.length; m++) {
  g.push(`<text x="${NX[m]}" y="${BOX_Y + 21}" font-size="13.5" font-weight="700" font-family="${MONO}" text-anchor="middle" fill="${FG}">${fmt(best[m])}</text>`);
  const f = from[m];
  g.push(`<text x="${NX[m]}" y="${BOX_Y + 37}" font-size="10.5" font-family="${MONO}" text-anchor="middle" fill="${f >= 0 ? GREEN : MUTED}">${f >= 0 ? ARROW_L + NODES[f] : '&#183;'}</text>`);
}
for (const [a, b, w] of segments) {
  g.push(
    `<rect x="${colX(b - 1)}" y="${rowY(a)}" width="${CELL_W}" height="${CELL_H}" fill="${GREEN}" fill-opacity="0.15" stroke="${GREEN}" stroke-width="2"/>`,
    `<text x="${colX(b - 1) + CELL_W / 2}" y="${rowY(a) + 21}" font-size="12.5" font-weight="700" font-family="${MONO}" text-anchor="middle" fill="${GREEN}">${w}</text>`,
  );
}
const chain = [NODES.length - 1];
for (let j = NODES.length - 1; j > 0; j = from[j]) {
  chain.push(from[j]);
}
g.push(
  `<text x="${RX + 22}" y="${RY + 32}" font-size="11.5" font-weight="600" fill="${MUTED}">RESULT</text>`,
  `<text x="${RX + 22}" y="${RY + 62}" font-size="14" font-family="${MONO}" fill="${FG}">walk from[]:  ${chain.map((c) => NODES[c]).join(` ${ARROW_L} `)}</text>`,
  `<text x="${RX + 22}" y="${RY + 92}" font-size="13.5" font-family="${MONO}" fill="${GREEN}">${segments.map(([a, b, w]) => `${NODES[a]}${ARROW_R}${NODES[b]} ${w}`).join('   ')}</text>`,
  `<text x="${RX + 22}" y="${RY + 122}" font-size="13.5" font-family="${MONO}" fill="${FG}">total ${best[NODES.length - 1]}  (vs ${weight(0, NODES.length - 1)} unsplit)</text>`,
  `<text x="${RX + 22}" y="${RY + 144}" font-size="12.5" font-family="${MONO}" fill="${MUTED}">${passed.map((m) => NODES[m]).join(', ')} is travelled through, not a cut</text>`,
  '</g>',
);
out.push(g.join(''));
out.push('</svg>');

mkdirSync('docs', { recursive: true });
writeFileSync('docs/algorithm.svg', out.join('\n'));
console.log(`docs/algorithm.svg: ${steps.length} probe steps, ${TOTAL.toFixed(1)}s loop`);
