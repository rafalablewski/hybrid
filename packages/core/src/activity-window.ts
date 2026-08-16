/**
 * ACTIVITY WINDOW — the period model and the breakdown behind the Today summary
 * card ("This week", and everything the date filter can turn it into).
 *
 * The card used to state one rolling seven-day window and stop there. Three
 * things were wrong with that:
 *
 *   1. "THIS WEEK" WASN'T THIS WEEK. A rolling `now − 7 days` window on a
 *      Thursday reports last Friday's session under a label that says the
 *      current week. A week is MONDAY → SUNDAY, the same week the history
 *      screen, the plan schedule and every calendar surface already use.
 *   2. THE TOTALS WEREN'T TOTAL. Training time only counted sessions with a
 *      `completedAt`, so a tennis match logged as 90 minutes on a block — with
 *      no stopwatch running — contributed nothing to the week's hours. The card
 *      claimed to summarise ALL activity while quietly dropping the part of it
 *      that isn't lifted.
 *   3. THE FIGURES HAD NO RECEIPTS. "41.6 km" is four sports in a trench coat:
 *      39 km of running, 600 m in the pool, and the rest spread over tennis and
 *      squash. A total that can't be opened is a number you have to trust.
 *
 * So: a RANGE (this week / last 7 / last 30 / YTD / any single month), TOTALS
 * over every logged activity in it, and — per metric — the GROUPS the total is
 * made of plus the individual sessions underneath them.
 *
 * Canonical units throughout, never formatted here: tonnage in kg, hours in
 * MINUTES, distance in KM. Clients format through their own unit preference,
 * which is what lets web and mobile render the identical breakdown.
 *
 * TIME ATTRIBUTION, and why it's honest. A session's minutes are the greater of
 * its wall-clock elapsed time and the sum of its blocks' own minutes — a watch
 * import can carry a 44-minute run on a session with no stopwatch, and a
 * two-hour gym session can hold a single logged 20-minute finisher. Block
 * minutes are attributed to their own sport; whatever wall-clock is left over
 * belongs to the lifting (or, in a session with no lifting, to its largest
 * activity). Every group therefore sums back to exactly the total the card
 * shows — a breakdown that doesn't add up is worse than no breakdown.
 */
import type { CardioBlock, CardioDiscipline, LoggedSession, StrengthBlock } from "./engines/session";
import { cardioDiscipline, sessionVolume, workingSets } from "./engines/session";
import { bwAt, type BodyweightInput } from "./bodyweight";
import { deviceTrueSessions } from "./device-truth";
import { roundKm } from "./distance";
import { DISCIPLINE_META } from "./endurance";
import { OLYMPIC_SPORTS, sportDistanceUnit } from "./olympic-sports";
import { addLocalDays, localMidnightMs, localMondayMs } from "./day-key";

const DAY = 86_400_000;

// ============================================================
//  The period
// ============================================================

export type ActivityRangeKind = "week" | "d7" | "d30" | "ytd" | "month";

export interface ActivityRange {
  /** Stable id — a preset key ("week" | "d7" | "d30" | "ytd") or "m:YYYY-MM". */
  id: string;
  kind: ActivityRangeKind;
  /** Local-midnight start, inclusive. */
  from: number;
  /** The period's NOMINAL end, exclusive — Sunday midnight for a week, the 1st
   *  of next month for a month. This is what the date span is labelled from, so
   *  a week in progress still reads "Mon 27 – Sun 2". */
  to: number;
  /** The effective right edge for every SUM: `to`, or the end of today when the
   *  period is still running. Nothing is logged in the future, so this only
   *  matters for the baseline — a Tuesday can't be compared against four whole
   *  weeks, so the baseline windows are truncated to this same elapsed length. */
  through: number;
  /** i18n key for a preset's name; null for a month (the client formats it). */
  labelKey: string | null;
  /** "YYYY-MM" when kind === "month". */
  month?: string;
  /** Whole days elapsed in the window so far (≥ 1). */
  days: number;
  /** True while the period is still running (its end is in the future). */
  inProgress: boolean;
}

/** The presets, in filter order. Months are appended per athlete — see
 *  `activityMonths()` — because which months exist depends on the history. */
export const ACTIVITY_RANGE_PRESETS: ReadonlyArray<{ id: string; kind: ActivityRangeKind; labelKey: string }> = [
  { id: "week", kind: "week", labelKey: "w.home.act.rWeek" },
  { id: "d7", kind: "d7", labelKey: "w.home.act.rD7" },
  { id: "d30", kind: "d30", labelKey: "w.home.act.rD30" },
  { id: "ytd", kind: "ytd", labelKey: "w.home.act.rYtd" },
];

/** The card opens on the calendar week — the period an athlete is actually in. */
export const DEFAULT_ACTIVITY_RANGE = "week";

const MONTH_ID = /^m:(\d{4})-(\d{2})$/;

/** Exclusive end of the local day containing `ms`. */
const dayEnd = (ms: number) => addLocalDays(localMidnightMs(ms), 1);

const monthStart = (year: number, monthIndex: number) => new Date(year, monthIndex, 1).getTime();

/** The month-range id ("m:2026-07") for a timestamp. */
export const activityMonthId = (ms: number): string => {
  const d = new Date(ms);
  return `m:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const build = (
  id: string,
  kind: ActivityRangeKind,
  from: number,
  to: number,
  labelKey: string | null,
  now: number,
  month?: string,
): ActivityRange => {
  const through = Math.min(to, dayEnd(now));
  return {
    id, kind, from, to, labelKey, month,
    through: Math.max(through, from),
    days: Math.max(1, Math.round((Math.max(through, from) - from) / DAY)),
    inProgress: to > dayEnd(now),
  };
};

/**
 * An id → a concrete window. Unknown ids (including a month the athlete no
 * longer has, or one in the future) fall back to the current calendar week
 * rather than throwing: a stale preference must never blank the card.
 */
export function resolveActivityRange(id: string | null | undefined, now = Date.now()): ActivityRange {
  const m = MONTH_ID.exec(id ?? "");
  if (m) {
    const year = Number(m[1]);
    const monthIndex = Number(m[2]) - 1;
    const from = monthStart(year, monthIndex);
    if (Number.isFinite(from) && monthIndex >= 0 && monthIndex <= 11 && from < dayEnd(now)) {
      return build(id!, "month", from, monthStart(year, monthIndex + 1), null, now, `${m[1]}-${m[2]}`);
    }
  }
  switch (id) {
    case "d7":
      return build("d7", "d7", addLocalDays(dayEnd(now), -7), dayEnd(now), "w.home.act.rD7", now);
    case "d30":
      return build("d30", "d30", addLocalDays(dayEnd(now), -30), dayEnd(now), "w.home.act.rD30", now);
    case "ytd": {
      const year = new Date(now).getFullYear();
      return build("ytd", "ytd", monthStart(year, 0), monthStart(year + 1, 0), "w.home.act.rYtd", now);
    }
    default: {
      const monday = localMondayMs(now);
      return build("week", "week", monday, addLocalDays(monday, 7), "w.home.act.rWeek", now);
    }
  }
}

/**
 * The periods the comparison is made against: the windows immediately before
 * this one, of the SAME elapsed length, NEAREST FIRST — [0] is the axis every
 * percentage is measured from, and the rest feed the mean the comparison page
 * draws as a landmark. Four for a week (the average
 * the card has always quoted), three for a month or a 30-day window, two years
 * for a YTD.
 *
 * Truncating each one to the current period's elapsed length is what keeps a
 * Tuesday honest: three days of this week are compared against the first three
 * days of the four before it, not against four finished weeks.
 */
export function activityBaselineWindows(range: ActivityRange): { from: number; to: number }[] {
  const span = Math.max(1, Math.round((range.through - range.from) / DAY));
  const out: { from: number; to: number }[] = [];
  if (range.kind === "week" || range.kind === "d7") {
    for (let i = 1; i <= 4; i++) {
      const from = addLocalDays(range.from, -7 * i);
      out.push({ from, to: addLocalDays(from, span) });
    }
  } else if (range.kind === "d30") {
    for (let i = 1; i <= 3; i++) {
      const from = addLocalDays(range.from, -30 * i);
      out.push({ from, to: addLocalDays(from, span) });
    }
  } else if (range.kind === "month") {
    const d = new Date(range.from);
    for (let i = 1; i <= 3; i++) {
      const from = monthStart(d.getFullYear(), d.getMonth() - i);
      const end = monthStart(d.getFullYear(), d.getMonth() - i + 1);
      out.push({ from, to: Math.min(addLocalDays(from, span), end) });
    }
  } else {
    const year = new Date(range.from).getFullYear();
    for (let i = 1; i <= 2; i++) {
      const from = monthStart(year - i, 0);
      out.push({ from, to: Math.min(addLocalDays(from, span), monthStart(year - i + 1, 0)) });
    }
  }
  return out;
}

/**
 * The month ids the filter offers, newest first: this month back to the month
 * of the oldest logged session, capped. A month with nothing in it still counts
 * — an empty March is a fact about the training year, and skipping it would put
 * February next to April with no sign anything was missing.
 */
export function activityMonths(sessions: LoggedSession[], now = Date.now(), cap = 18): string[] {
  let oldest = now;
  for (const s of sessions) {
    const t = new Date(s.startedAt).getTime();
    if (Number.isFinite(t) && t < oldest) oldest = t;
  }
  const end = new Date(now);
  const start = new Date(oldest);
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const out: string[] = [];
  for (let i = 0; i <= Math.min(Math.max(0, months), cap - 1); i++) {
    out.push(activityMonthId(monthStart(end.getFullYear(), end.getMonth() - i)));
  }
  return out;
}

// ============================================================
//  Metrics, groups, items
// ============================================================

/** The figures the card carries, in render order. */
export const ACTIVITY_METRICS = ["tonnage", "sessions", "hours", "distance"] as const;
export type ActivityMetric = (typeof ACTIVITY_METRICS)[number];

/** What an activity IS, which is also how the breakdown groups it. */
export type ActivityGroupKind = "strength" | "endurance" | "sport" | "conditioning" | "other";

export interface ActivityGroupMeta {
  /** Stable within a summary: "strength" | "d:running" | "sport:tennis". */
  id: string;
  kind: ActivityGroupKind;
  /** The endurance discipline, when the group is one. */
  discipline: CardioDiscipline | null;
  /** i18n key for the group's name — null for a named sport, which carries its
   *  own label because "Squash" is not a translatable app string. */
  labelKey: string | null;
  label: string | null;
  /** A semantic sport glyph (never a decorative marker). */
  icon: string;
  /** The group's natural DISTANCE unit — metres for pool and ergo sports, so
   *  600 m of swimming never has to read as "0.6 km" inside a km total. */
  unit: "km" | "m";
}

export const STRENGTH_GROUP: ActivityGroupMeta = {
  id: "strength", kind: "strength", discipline: null,
  labelKey: "w.home.act.gStrength", label: null, icon: "🏋️", unit: "km",
};
const CONDITIONING_GROUP: ActivityGroupMeta = {
  id: "conditioning", kind: "conditioning", discipline: null,
  labelKey: "w.home.act.gConditioning", label: null, icon: "🔥", unit: "km",
};
const OTHER_GROUP: ActivityGroupMeta = {
  id: "other", kind: "other", discipline: null,
  labelKey: "w.home.act.gOther", label: null, icon: "⏱", unit: "km",
};

/** One session's contribution to one metric, inside one group. */
export interface ActivityEntry {
  sessionId: string;
  /** The session's own title — what the row is called. */
  title: string;
  startedAt: string;
  groupId: string;
  /** The activity's own name: the cardio block's move ("Long run", "Squash"),
   *  or the session title for a strength row. */
  name: string;
  /** The contribution in the metric's canonical unit (kg / 1 / minutes / km). */
  value: number;
  /** Context for the row's meta line — always this contribution's own figures,
   *  never the whole session's, so a run inside a mixed session doesn't claim
   *  the lifting's tonnage. */
  minutes: number;
  distanceKm: number;
  tonnage: number;
  sets: number;
  lifts: number;
}

export interface ActivityGroup extends ActivityGroupMeta {
  /** Summed contributions, canonical unit. */
  value: number;
  /** Distinct sessions in the group. */
  sessions: number;
  /** 0…1 of the metric's total — the share bar, computed once here so both
   *  clients draw the same width. */
  share: number;
  /** Newest first. */
  items: ActivityEntry[];
}

export interface ActivityDetail {
  metric: ActivityMetric;
  /** Always equal to the sum of `groups[].value` — the card's figure, opened. */
  total: number;
  /** Biggest contributor first. */
  groups: ActivityGroup[];
  /** Every contribution flat, newest first. */
  items: ActivityEntry[];
  /** Distinct sessions behind the figure. */
  sessions: number;
}

export interface ActivityTotals {
  tonnage: number;
  sessions: number;
  /** MINUTES — the canonical unit; the card renders hours. */
  hours: number;
  /** KM. */
  distance: number;
}

export interface ActivitySummary {
  range: ActivityRange;
  totals: ActivityTotals;
  details: Record<ActivityMetric, ActivityDetail>;
  /** Distinct sessions in the window. */
  sessions: number;
}

const ms = (iso: string) => new Date(iso).getTime();
const isCardio = (b: { kind: string }): b is CardioBlock => b.kind === "cardio";
const isStrength = (b: { kind: string }): b is StrengthBlock => b.kind === "strength";

/** The group a cardio block belongs to. Racket / team / combat sessions all
 *  carry the same `sport` discipline tag, so they group by their own NAME —
 *  otherwise tennis and squash would collapse into one lane called "Sport",
 *  exactly the flattening the endurance block was built to escape. */
function cardioGroup(b: CardioBlock): ActivityGroupMeta {
  const d = b.discipline ?? cardioDiscipline(b.name);
  if (d === "sport") {
    const name = b.name.trim() || "Sport";
    return {
      id: `sport:${name.toLowerCase()}`,
      kind: "sport",
      discipline: "sport",
      labelKey: null,
      label: name,
      icon: OLYMPIC_SPORTS[name]?.icon ?? "🎯",
      unit: sportDistanceUnit(name),
    };
  }
  const meta = DISCIPLINE_META[d];
  return {
    id: `d:${d}`, kind: "endurance", discipline: d,
    labelKey: meta.labelKey, label: null, icon: meta.emoji, unit: meta.distanceUnit,
  };
}

interface GroupPart {
  meta: ActivityGroupMeta;
  minutes: number;
  distanceKm: number;
  /** The first block name seen for this group — what the row is called. */
  name: string;
}

interface SessionFacts {
  session: LoggedSession;
  tonnage: number;
  sets: number;
  lifts: number;
  /** Whole-session minutes (the greater of wall-clock and logged block time). */
  minutes: number;
  /** Per-group time and distance; the parts' minutes sum to `minutes` exactly. */
  parts: GroupPart[];
  /** The group the SESSION itself is filed under when it's counted as one. */
  primary: ActivityGroupMeta;
}

/** Everything one session contributes, split by activity. See the file header
 *  for why leftover wall-clock lands on the lifting. */
function sessionFacts(s: LoggedSession, bw?: BodyweightInput): SessionFacts {
  const bwKg = bwAt(bw, s.startedAt);
  const tonnage = sessionVolume(s.blocks, false, bwKg);

  let lifts = 0;
  let sets = 0;
  const parts = new Map<string, GroupPart>();
  let blockMinutes = 0;

  for (const b of s.blocks) {
    if (isStrength(b)) {
      lifts += 1;
      sets += workingSets(b).length;
      continue;
    }
    const meta = isCardio(b) ? cardioGroup(b) : CONDITIONING_GROUP;
    const cur = parts.get(meta.id) ?? { meta, minutes: 0, distanceKm: 0, name: b.name?.trim() || (meta.label ?? "") };
    const mins = b.minutes && b.minutes > 0 ? b.minutes : 0;
    cur.minutes += mins;
    blockMinutes += mins;
    if (isCardio(b) && b.distance && b.distance > 0) cur.distanceKm += b.distance;
    parts.set(meta.id, cur);
  }

  const startedAt = ms(s.startedAt);
  const elapsed = s.completedAt ? Math.max(0, Math.round((ms(s.completedAt) - startedAt) / 60000)) : 0;
  const minutes = Math.max(elapsed, Math.round(blockMinutes));
  const leftover = minutes - Math.round(blockMinutes);

  const list = [...parts.values()];
  const biggest = list.reduce<GroupPart | null>((best, p) => (!best || p.minutes > best.minutes ? p : best), null);

  if (leftover > 0) {
    if (lifts > 0) {
      const cur = parts.get(STRENGTH_GROUP.id) ?? { meta: STRENGTH_GROUP, minutes: 0, distanceKm: 0, name: s.title };
      cur.minutes += leftover;
      parts.set(STRENGTH_GROUP.id, cur);
    } else if (biggest) {
      biggest.minutes += leftover;
    } else {
      parts.set(OTHER_GROUP.id, { meta: OTHER_GROUP, minutes: leftover, distanceKm: 0, name: s.title });
    }
  }

  const primary = lifts > 0 ? STRENGTH_GROUP : (biggest?.meta ?? OTHER_GROUP);
  return { session: s, tonnage, sets, lifts, minutes, parts: [...parts.values()], primary };
}

/**
 * Totals over [from, to) for sessions that are ALREADY device-projected (see
 * device-truth.ts) — the shape the verdict needs when it sums five windows off
 * one projection. Most callers want `activityTotals`, which projects for them.
 */
export function activityTotalsIn(projected: LoggedSession[], from: number, to: number, bw?: BodyweightInput): ActivityTotals {
  const totals: ActivityTotals = { tonnage: 0, sessions: 0, hours: 0, distance: 0 };
  for (const s of projected) {
    const t = ms(s.startedAt);
    if (!Number.isFinite(t) || t < from || t >= to) continue;
    const f = sessionFacts(s, bw);
    totals.sessions += 1;
    totals.tonnage += f.tonnage;
    totals.hours += f.minutes;
    for (const p of f.parts) totals.distance += p.distanceKm;
  }
  return totals;
}

/** Totals over [from, to) — device-measured sessions win. */
export function activityTotals(sessions: LoggedSession[], from: number, to: number, bw?: BodyweightInput): ActivityTotals {
  return activityTotalsIn(deviceTrueSessions(sessions), from, to, bw);
}

function toDetail(metric: ActivityMetric, items: ActivityEntry[], metas: Map<string, ActivityGroupMeta>): ActivityDetail {
  const byGroup = new Map<string, ActivityEntry[]>();
  for (const it of items) {
    const list = byGroup.get(it.groupId);
    if (list) list.push(it);
    else byGroup.set(it.groupId, [it]);
  }
  const total = items.reduce((n, it) => n + it.value, 0);
  const groups: ActivityGroup[] = [...byGroup.entries()]
    .map(([id, list]) => {
      const value = list.reduce((n, it) => n + it.value, 0);
      return {
        ...(metas.get(id) ?? OTHER_GROUP),
        value,
        sessions: new Set(list.map((it) => it.sessionId)).size,
        share: total > 0 ? value / total : 0,
        items: list,
      };
    })
    // Biggest first; a tie falls back to the group id so the order is total and
    // the two clients can't stack the same week differently.
    .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1));
  return { metric, total, groups, items, sessions: new Set(items.map((it) => it.sessionId)).size };
}

/**
 * The window opened up: totals, and for each metric the groups it's made of
 * with their sessions underneath.
 *
 * Every metric's groups sum to that metric's total, and the totals match what
 * `activityTotals` reports for the same window — the card's figure and the list
 * behind it are the same arithmetic, not two of them.
 */
export function activitySummary(sessions: LoggedSession[], range: ActivityRange, bw?: BodyweightInput): ActivitySummary {
  const measured = deviceTrueSessions(sessions)
    .filter((s) => {
      const t = ms(s.startedAt);
      return Number.isFinite(t) && t >= range.from && t < range.through;
    })
    // Newest first — the order every list in the detail renders in.
    .sort((a, b) => (b.startedAt < a.startedAt ? -1 : b.startedAt > a.startedAt ? 1 : 0));

  const metas = new Map<string, ActivityGroupMeta>();
  const tonnage: ActivityEntry[] = [];
  const counted: ActivityEntry[] = [];
  const hours: ActivityEntry[] = [];
  const distance: ActivityEntry[] = [];
  const totals: ActivityTotals = { tonnage: 0, sessions: 0, hours: 0, distance: 0 };

  for (const s of measured) {
    const f = sessionFacts(s, bw);
    metas.set(STRENGTH_GROUP.id, STRENGTH_GROUP);
    metas.set(f.primary.id, f.primary);
    for (const p of f.parts) metas.set(p.meta.id, p.meta);

    totals.sessions += 1;
    totals.tonnage += f.tonnage;
    totals.hours += f.minutes;

    const base = { sessionId: s.id, title: s.title, startedAt: s.startedAt };
    const strengthMinutes = f.parts.find((p) => p.meta.id === STRENGTH_GROUP.id)?.minutes ?? 0;

    if (f.tonnage > 0) {
      tonnage.push({
        ...base, groupId: STRENGTH_GROUP.id, name: s.title, value: f.tonnage,
        minutes: strengthMinutes, distanceKm: 0, tonnage: f.tonnage, sets: f.sets, lifts: f.lifts,
      });
    }

    counted.push({
      ...base, groupId: f.primary.id, name: s.title, value: 1,
      minutes: f.minutes,
      distanceKm: f.parts.reduce((n, p) => n + p.distanceKm, 0),
      tonnage: f.tonnage, sets: f.sets, lifts: f.lifts,
    });

    for (const p of f.parts) {
      if (p.minutes > 0) {
        hours.push({
          ...base, groupId: p.meta.id, name: p.name || s.title, value: p.minutes,
          minutes: p.minutes, distanceKm: p.distanceKm, tonnage: p.meta.id === STRENGTH_GROUP.id ? f.tonnage : 0,
          sets: p.meta.id === STRENGTH_GROUP.id ? f.sets : 0, lifts: p.meta.id === STRENGTH_GROUP.id ? f.lifts : 0,
        });
      }
      if (p.distanceKm > 0) {
        totals.distance += p.distanceKm;
        distance.push({
          ...base, groupId: p.meta.id, name: p.name || s.title, value: p.distanceKm,
          minutes: p.minutes, distanceKm: p.distanceKm, tonnage: 0, sets: 0, lifts: 0,
        });
      }
    }
  }

  return {
    range,
    totals,
    sessions: totals.sessions,
    details: {
      tonnage: toDetail("tonnage", tonnage, metas),
      sessions: toDetail("sessions", counted, metas),
      hours: toDetail("hours", hours, metas),
      distance: toDetail("distance", distance, metas),
    },
  };
}

/** i18n key for the detail panel's own heading, per metric. */
export const activityDetailKey = (m: ActivityMetric) =>
  ({
    tonnage: "w.home.act.dTonnage", sessions: "w.home.act.dSessions",
    hours: "w.home.act.dHours", distance: "w.home.act.dDistance",
  })[m];

/**
 * A group's value in ITS OWN unit, for display — 0.6 km of swimming reads as
 * "600" with the unit "m", while 39 km of running stays "39" / "km". Only the
 * distance metric has per-group units; everything else is already canonical.
 */
export function groupDistanceDisplay(km: number, unit: "km" | "m"): string {
  return unit === "m" ? String(Math.round(km * 1000)) : String(roundKm(km));
}
