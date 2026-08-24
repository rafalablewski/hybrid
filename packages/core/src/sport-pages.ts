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
 *  can never disagree about where a week starts.
 *
 *  `floor` is the window's own start: when a caller asks for an explicit window
 *  whose span is not a whole number of weeks, the oldest bucket is CLAMPED to
 *  it rather than reaching back past the period the figures above it report on.
 *  A partial oldest bucket is the same honesty `activityBaselineWindows` shows
 *  when it truncates a baseline to the elapsed length. */
function weeklyMinutes(
  sessions: LoggedSession[],
  weeks: number,
  now: number,
  keep: (b: CardioBlock) => boolean,
  floor = -Infinity,
): { weeks: number[]; weekStarts: string[] } {
  const mins: number[] = [];
  const starts: string[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const to = now - w * WEEK_MS;
    const from = Math.max(floor, to - WEEK_MS);
    if (from >= to) continue;
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
  opts: { weeks?: number; now?: number; from?: number } = {},
): SportPage[] {
  const now = opts.now ?? Date.now();
  // AN EXPLICIT WINDOW, OR A TRAILING ONE. `from` exists so a caller that is
  // governed by a period control (Today's Progress cluster reads ONE range for
  // the whole screen) can ask this model for THAT window instead of inventing
  // its own — the fault the lanes had worst was figures answering for
  // different periods under one headline. The sport PAGE passes no `from` and
  // keeps its trailing eight weeks exactly as before.
  const from = opts.from ?? now - (opts.weeks ?? SPORT_PAGE_WEEKS) * WEEK_MS;
  // The ridge spans the window it reports on: an explicit window sizes its own
  // bucket count (clamped at the start, see weeklyMinutes), a trailing one
  // keeps the caller's.
  const weeks =
    opts.from != null
      ? Math.max(1, Math.ceil((now - from) / WEEK_MS))
      : (opts.weeks ?? SPORT_PAGE_WEEKS);
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
      ...weeklyMinutes(slice, weeks, now, all, from),
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
      ...weeklyMinutes(trued, weeks, now, keep, from),
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
