/**
 * SPORT PAGES — the Endurance section on Today, as ONE PAGE PER SPORT.
 *
 * The section used to be a stack of per-discipline RAILS: a lane per sport,
 * each a horizontal scroller of five bordered tiles (efforts, distance, pace,
 * zones, last effort), with the ball sports exiled to a second block underneath
 * in a different grammar. Three lanes cost eighteen bordered surfaces, four
 * horizontal scrollers and four different time windows on one screen — and
 * because the rails carried no snap, every one of them came to rest with its
 * third tile clipped mid-number.
 *
 * The section is now a PAGER: the full content width per sport, snapped, swiped
 * sideways. A page gets the whole screen, so its figures can be big and few, and
 * the depth that used to be spread across five tiles lives one tap away on the
 * sport's own page (sport-page.ts), which already owns it.
 *
 * THREE THINGS THIS MODEL FIXES THAT THE LANES COULD NOT:
 *
 *   1. ONE WINDOW. Every figure on every page answers for the SAME period —
 *      the trailing `weeks` (default SPORT_PAGE_WEEKS). The lanes printed
 *      whole-history totals under an "ALL TIME" head, over an eight-week bar
 *      chart, beneath a "THIS WEEK" card, with a latest-week pace delta beside
 *      it. Nothing in a comparison instrument could be compared.
 *
 *   2. ONE POPULATION. A ball sport is a page like any other. `discipline:
 *      "sport"` sessions were a separate block with a separate shape because
 *      ENDURANCE_DISCIPLINES excludes that tag — a data-model fact leaking into
 *      a layout. Tennis is usually the sport with the most minutes in it, and
 *      it was below the fold.
 *
 *   3. ONE MEASURE FOR THE HERO. Minutes, on every page, because minutes are
 *      the only thing a swim, a ride and a squash match all have. Distance and
 *      pace stay as facts on the pages that HAVE them, and simply do not render
 *      on the pages that don't — no em dashes standing in for a metric a sport
 *      was never going to carry.
 *
 * DEVICE TRUTH: the endurance slice arrives through `disciplineSessions`, which
 * projects `deviceTrueSessions` first; the ball-sport slice is projected here
 * for the same reason. Every derived rate divides the EXACT seconds
 * (`cardioSeconds`), never the display minutes.
 *
 * Pure and client-agnostic. The one client left is the phone (the user-facing
 * web client was retired in Aug 2026), but the arithmetic still belongs here:
 * the admin Capabilities screens and the API read the same engines, and a
 * figure on Today must not be able to disagree with the same figure anywhere
 * else.
 */
import { deviceTrueSessions } from "./device-truth";
import { roundKm } from "./distance";
import { activeDisciplines, DISCIPLINE_META } from "./endurance";
import { disciplineSessions, paceEffortSplit, weeklyMileage, type EffortSplit } from "./engines/running";
// The window is ONE number, and sport-page.ts already owns it: the pager and
// the sport page it opens must chart the same eight weeks or the two disagree.
import { SPORT_PAGE_WEEKS } from "./sport-page";
import { cardioDiscipline, cardioSeconds, type CardioBlock, type CardioDiscipline, type LoggedSession } from "./engines/session";

const WEEK_MS = 7 * 86_400_000;

/** What a page is keyed off. A discipline is a tag; a sport is a block NAME,
 *  because every tennis, squash and five-a-side block carries the same
 *  `discipline: "sport"` tag and keying off it would collapse them into one
 *  page called "Sport". */
export type SportPageKind = "discipline" | "sport";

/** One sport's whole read at hub altitude, sized for a full-width page. */
export interface SportPage {
  /** Stable identity for keying and for the pager's position. */
  key: string;
  kind: SportPageKind;
  /** Set for `kind: "discipline"`, null for a ball sport. */
  discipline: CardioDiscipline | null;
  /** Set for `kind: "sport"` — the block's own name, which is the catalog key
   *  when it has one. Null for an endurance discipline. */
  sport: string | null;
  /** i18n key for a discipline's name. Null for a sport, whose name is already
   *  a proper noun; `sportPageTitle` resolves either. */
  labelKey: string | null;

  /* ── the window's totals ─────────────────────────────────────────────── */
  /** THE HERO, and the one measure every page shares. */
  minutes: number;
  efforts: number;
  /** Null when the sport carries no distance — the page renders no slot at all
   *  rather than a dash where a metric would be. */
  distanceKm: number | null;
  /** Canonical seconds per km; null when nothing in the window was paced. */
  secPerKm: number | null;
  /** The window's longest single effort, in whole minutes. It is what a timed
   *  sport has instead of a distance, and it is a fact the lanes never showed. */
  longestMinutes: number;

  /* ── the ridge ───────────────────────────────────────────────────────── */
  /** Minutes per week, oldest → newest, `weeks` long. Minutes, not kilometres:
   *  the hero is minutes, and a chart drawn in a different measure from the
   *  figure above it is the mismatch this rewrite exists to remove. */
  weeks: number[];
  /** ISO start of each bucket, aligned with `weeks`. */
  weekStarts: string[];

  /* ── how hard ────────────────────────────────────────────────────────── */
  zones: EffortSplit;

  /** ISO of the most recent effort in the window, for ordering. */
  lastAt: string | null;
}

const isCardio = (b: { kind: string }): b is CardioBlock => b.kind === "cardio";

interface Totals {
  km: number;
  seconds: number;
  minutes: number;
  efforts: number;
  longestMinutes: number;
  lastAt: number;
}

/**
 * Window totals, walked off the blocks rather than summed off the weekly
 * buckets.
 *
 * The buckets round km per week and minutes per week for DISPLAY; adding eight
 * rounded values and then dividing gives a pace that drifts from the one the
 * device panel prints. Same rule as the rest of the app (device-truth.ts):
 * derive from the exact values, round once at the end.
 */
function totalsIn(sessions: LoggedSession[], from: number, to: number, keep: (b: CardioBlock) => boolean): Totals {
  const out: Totals = { km: 0, seconds: 0, minutes: 0, efforts: 0, longestMinutes: 0, lastAt: 0 };
  for (const s of sessions) {
    const t = new Date(s.startedAt).getTime();
    if (!Number.isFinite(t) || t < from || t >= to) continue;
    for (const b of s.blocks) {
      if (!isCardio(b) || !keep(b)) continue;
      const mins = b.minutes && b.minutes > 0 ? b.minutes : 0;
      const sec = cardioSeconds(b);
      out.efforts += 1;
      out.minutes += mins;
      if (b.distance && b.distance > 0) out.km += b.distance;
      if (sec != null && sec > 0) out.seconds += sec;
      if (mins > out.longestMinutes) out.longestMinutes = mins;
      if (t > out.lastAt) out.lastAt = t;
    }
  }
  return out;
}

/** The sessions inside the window, so the zone split answers for the same
 *  period as every figure beside it. */
function windowSlice(sessions: LoggedSession[], from: number, to: number): LoggedSession[] {
  return sessions.filter((s) => {
    const t = new Date(s.startedAt).getTime();
    return Number.isFinite(t) && t >= from && t < to;
  });
}

/** Minutes per trailing 7-day bucket, oldest → newest — the same bucketing
 *  `weeklyMileage` uses, so a page's ridge and the sport page's volume chart
 *  can never disagree about where a week starts. */
function weeklyMinutes(
  sessions: LoggedSession[],
  weeks: number,
  now: number,
  keep: (b: CardioBlock) => boolean,
): { weeks: number[]; weekStarts: string[] } {
  const mins: number[] = [];
  const starts: string[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const to = now - w * WEEK_MS;
    const from = to - WEEK_MS;
    starts.push(new Date(from).toISOString());
    mins.push(Math.round(totalsIn(sessions, from, to, keep).minutes));
  }
  return { weeks: mins, weekStarts: starts };
}

const ZERO_ZONES: EffortSplit = { easy: 0, moderate: 0, hard: 0 };

/**
 * One page per sport the athlete actually trained in the window, busiest first.
 *
 * A sport with nothing in the window gets no page — the same rule the lanes
 * had, and the reason no page needs an empty state of its own. Ties break on
 * efforts, then on recency: two sports with the same minutes are ordered by
 * which one you are still doing.
 */
export function sportPages(
  sessions: LoggedSession[],
  opts: { weeks?: number; now?: number } = {},
): SportPage[] {
  const weeks = opts.weeks ?? SPORT_PAGE_WEEKS;
  const now = opts.now ?? Date.now();
  const from = now - weeks * WEEK_MS;
  const all = () => true;
  const pages: SportPage[] = [];

  /* ── the endurance disciplines ───────────────────────────────────────── */
  for (const summary of activeDisciplines(sessions)) {
    const d = summary.discipline;
    // disciplineSessions projects deviceTrueSessions before filtering.
    const slice = disciplineSessions(sessions, d);
    const t = totalsIn(slice, from, now, all);
    if (t.efforts === 0) continue;
    const meta = DISCIPLINE_META[d];
    pages.push({
      key: `d:${d}`,
      kind: "discipline",
      discipline: d,
      sport: null,
      labelKey: meta.labelKey,
      minutes: Math.round(t.minutes),
      efforts: t.efforts,
      distanceKm: t.km > 0 ? roundKm(t.km) : null,
      secPerKm: t.km > 0 && t.seconds > 0 ? t.seconds / t.km : null,
      longestMinutes: Math.round(t.longestMinutes),
      ...weeklyMinutes(slice, weeks, now, all),
      zones: paceEffortSplit(windowSlice(slice, from, now)),
      lastAt: t.lastAt > 0 ? new Date(t.lastAt).toISOString() : null,
    });
  }

  /* ── the ball sports, as pages of the same shape ─────────────────────── */
  const trued = deviceTrueSessions(sessions);
  const isSport = (b: CardioBlock) => (b.discipline ?? cardioDiscipline(b.name)) === "sport";
  const names = new Set<string>();
  for (const s of trued) {
    const t = new Date(s.startedAt).getTime();
    if (!Number.isFinite(t) || t < from || t >= now) continue;
    for (const b of s.blocks) {
      if (!isCardio(b) || !isSport(b)) continue;
      const name = b.name.trim();
      if (name) names.add(name);
    }
  }
  for (const name of names) {
    const keep = (b: CardioBlock) => isSport(b) && b.name.trim() === name;
    const t = totalsIn(trued, from, now, keep);
    if (t.efforts === 0) continue;
    const win = windowSlice(trued, from, now);
    pages.push({
      key: `s:${name}`,
      kind: "sport",
      discipline: null,
      sport: name,
      labelKey: null,
      minutes: Math.round(t.minutes),
      efforts: t.efforts,
      distanceKm: t.km > 0 ? roundKm(t.km) : null,
      secPerKm: t.km > 0 && t.seconds > 0 ? t.seconds / t.km : null,
      longestMinutes: Math.round(t.longestMinutes),
      ...weeklyMinutes(trued, weeks, now, keep),
      // A timed sport has no pace, so it has no split to show. Running
      // paceEffortSplit over a slice with no paced volume would return zeros
      // anyway; saying so here is cheaper and states the reason.
      zones: t.km > 0 ? paceEffortSplit(win.map((s) => ({ ...s, blocks: s.blocks.filter((b) => !isCardio(b) || keep(b)) }))) : ZERO_ZONES,
      lastAt: t.lastAt > 0 ? new Date(t.lastAt).toISOString() : null,
    });
  }

  return pages.sort(
    (a, b) =>
      b.minutes - a.minutes ||
      b.efforts - a.efforts ||
      (b.lastAt ? Date.parse(b.lastAt) : 0) - (a.lastAt ? Date.parse(a.lastAt) : 0),
  );
}

/** A page's title — an i18n key for a discipline, a proper noun for a sport.
 *  One function so no client has to branch on `kind` to print a name. */
export function sportPageTitle(page: SportPage, t: (key: string) => string): string {
  return page.labelKey ? t(page.labelKey) : (page.sport ?? "");
}

/** The section's own total across every page — the head's one figure. */
export function sportPagesTotal(pages: SportPage[]): { sports: number; minutes: number; efforts: number } {
  let minutes = 0;
  let efforts = 0;
  for (const p of pages) {
    minutes += p.minutes;
    efforts += p.efforts;
  }
  return { sports: pages.length, minutes, efforts };
}

/* ── THE RIDGE ───────────────────────────────────────────────────────────── */

/**
 * The eight-week chart as ONE CONTINUOUS AREA rather than a row of bars.
 *
 * Volume over time is a LEVEL, and a level reads as a line: eight separate
 * rectangles make eight objects out of one shape, and at rail width they came
 * out four pixels wide with a two-pixel gap, which is a texture rather than a
 * chart. The app already draws a level this way for the pace trend, so the
 * ridge is the mark this section should have been using from the start.
 *
 * The smoothing is the MIDPOINT CUBIC: each control point shares its endpoint's
 * y, so the curve is smooth in x and cannot overshoot in y. That matters here —
 * a Catmull-Rom through a spiky week would dip the curve BELOW zero and draw a
 * week of negative training.
 */
export interface RidgeGeometry {
  /** The stroked path along the top of the area. */
  line: string;
  /** The same path closed down to the baseline, for the fill. */
  area: string;
  /** The newest point, so a client can sit its dot on the end of the line. */
  tip: { x: number; y: number };
  /** Every value identical (an untrained window included) — the curve is a flat
   *  line and a client may want to say so rather than draw a trend. */
  flat: boolean;
}

/**
 * Geometry for `values` drawn into a `w` × `h` box, oldest at x=0.
 *
 * `pad` keeps the stroke's own width inside the box at the extremes — without
 * it a peak week is drawn with its top half clipped. The baseline is h: a zero
 * week sits ON the floor, which is what makes a gap in training read as a gap
 * rather than as a low reading.
 */
export function ridgeGeometry(values: number[], w: number, h: number, pad = 3): RidgeGeometry {
  const n = values.length;
  if (n === 0) return { line: "", area: "", tip: { x: 0, y: h }, flat: true };

  const peak = Math.max(...values);
  const flat = values.every((v) => v === values[0]);
  const top = pad;
  const bottom = h - pad;
  const y = (v: number) => (peak > 0 ? bottom - (v / peak) * (bottom - top) : bottom);
  const pts = values.map((v, i) => ({ x: n === 1 ? w / 2 : (i / (n - 1)) * w, y: y(v) }));

  let line = `M${pts[0]!.x.toFixed(1)},${pts[0]!.y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const mx = (a.x + b.x) / 2;
    line += ` C${mx.toFixed(1)},${a.y.toFixed(1)} ${mx.toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }

  const tip = pts[pts.length - 1]!;
  return {
    line,
    area: `${line} L${w.toFixed(1)},${h.toFixed(1)} L0,${h.toFixed(1)} Z`,
    tip: { x: tip.x, y: tip.y },
    flat,
  };
}
