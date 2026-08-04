/**
 * TRAJECTORY GEOMETRY — the freshness/readiness plot, computed once for both
 * clients.
 *
 * The two clients used to draw this chart from different primitives (a chart
 * library on web, bars and tick markers on mobile), which meant the same
 * fourteen days had two different shapes and only one of them could be read
 * per-point. The geometry now lives here, exactly as `sparkline` and
 * `tissueAxis` already do, so neither client rounds its own coordinates.
 *
 * TWO THINGS THIS ADDS over a plain sparkline:
 *
 *  - A ZOOMED, STATED DOMAIN. Plotted 0..100 these series sit in a band a
 *    tenth of the chart's height and every week looks identical. The domain is
 *    the data's own range, padded and snapped to tens, and it is RETURNED so
 *    the UI can print it — a zoomed axis that doesn't say it is zoomed is a
 *    chart that exaggerates.
 *  - SESSION MARKS. A dip nobody can attribute is decoration with axes. Days
 *    carrying logged training get a tick under the baseline, so the shape of
 *    the line and the work that caused it are read together.
 */

export interface TrajectoryPlotPoint {
  daysAgo: number;
  hpi: number;
  readiness: number;
}

export interface PlotBox {
  width: number;
  height: number;
  /** room above the line and below the baseline for the session marks */
  pad?: number;
}

/** One plotted day, in both the forms the two clients need: screen
 *  coordinates for a path, and a 0..1 normal for a bar or a marker. Mobile
 *  deliberately ships no SVG renderer (see the body-map note in
 *  capabilities.ts), so it sizes native views from `hpiN` / `readyN` while web
 *  strokes the paths — same domain, same days, same marks. */
export interface TrajectoryDay {
  daysAgo: number;
  x: number;
  hpiY: number;
  readyY: number;
  /** 0..1 within the drawn domain */
  hpiN: number;
  readyN: number;
  /** did this day carry logged training? */
  trained: boolean;
}

export interface TrajectoryPlot {
  /** SVG path for the freshness series */
  hpiD: string;
  /** SVG path for the readiness series (drawn dashed by both clients) */
  readyD: string;
  /** y of the baseline the session marks hang from */
  baselineY: number;
  /** x of every day that carried a logged session */
  sessionX: number[];
  /** the newest freshness point, for the emphasised endpoint */
  last: { x: number; y: number };
  /** the domain actually drawn, so the UI can state it */
  lo: number;
  hi: number;
  /** every day's x, oldest → newest (lets a client place its own marks) */
  xs: number[];
  /** every day, in both coordinate forms */
  days: TrajectoryDay[];
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * @param points   oldest → newest, as `performanceTrajectory` returns them
 * @param sessionDaysAgo  which days carried logged training (0 = today)
 */
export function trajectoryPlot(
  points: TrajectoryPlotPoint[],
  sessionDaysAgo: Iterable<number>,
  { width, height, pad = 8 }: PlotBox,
): TrajectoryPlot {
  const baselineY = height - pad;
  const span = height - pad * 2;
  const n = points.length;

  const values = points.flatMap((p) => [p.hpi, p.readiness]);
  // Snap the domain out to tens so it reads as a scale rather than as whatever
  // the data happened to be, and never collapse to a zero-height band.
  const rawLo = values.length ? Math.min(...values) : 0;
  const rawHi = values.length ? Math.max(...values) : 100;
  let lo = Math.max(0, Math.floor((rawLo - 5) / 10) * 10);
  let hi = Math.min(100, Math.ceil((rawHi + 5) / 10) * 10);
  if (hi - lo < 20) {
    hi = Math.min(100, lo + 20);
    lo = Math.max(0, hi - 20);
  }
  const range = hi - lo || 1;

  const xAt = (i: number) => (n < 2 ? width / 2 : pad + (i * (width - pad * 2)) / (n - 1));
  const yAt = (v: number) => baselineY - ((Math.min(hi, Math.max(lo, v)) - lo) / range) * span;
  const path = (pick: (p: TrajectoryPlotPoint) => number) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${round(xAt(i))},${round(yAt(pick(p)))}`).join(" ");

  const trained = new Set<number>();
  for (const d of sessionDaysAgo) trained.add(d);

  const xs = points.map((_, i) => round(xAt(i)));
  const lastPoint = points[n - 1];
  const norm = (v: number) => (Math.min(hi, Math.max(lo, v)) - lo) / range;
  const days: TrajectoryDay[] = points.map((p, i) => ({
    daysAgo: p.daysAgo,
    x: round(xAt(i)),
    hpiY: round(yAt(p.hpi)),
    readyY: round(yAt(p.readiness)),
    hpiN: round(norm(p.hpi)),
    readyN: round(norm(p.readiness)),
    trained: trained.has(p.daysAgo),
  }));

  return {
    hpiD: n ? path((p) => p.hpi) : "",
    readyD: n ? path((p) => p.readiness) : "",
    baselineY,
    sessionX: points.flatMap((p, i) => (trained.has(p.daysAgo) ? [round(xAt(i))] : [])),
    last: lastPoint ? { x: round(xAt(n - 1)), y: round(yAt(lastPoint.hpi)) } : { x: width / 2, y: baselineY },
    lo,
    hi,
    xs,
    days,
  };
}

/**
 * Which days in the window carried logged training, as "days ago" — the input
 * the plot's session marks need. Local-day based, so a session at 23:50 marks
 * the day the athlete would say it happened on.
 */
export function sessionDaysAgo(startedAt: (string | null | undefined)[], now = Date.now()): number[] {
  const DAY = 86_400_000;
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today = startOfDay(now);
  const out = new Set<number>();
  for (const iso of startedAt) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    const days = Math.round((today - startOfDay(t)) / DAY);
    if (days >= 0) out.add(days);
  }
  return [...out];
}
