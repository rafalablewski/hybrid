import type { LoggedSession, SessionBlock } from "./session";
import { localDayKey, localMondayMs, addLocalDays } from "../day-key";
import { sessionVolume } from "./session";
import { bwAt, type BodyweightInput } from "../bodyweight";
import { deviceTrueSessions } from "../device-truth";
import { roundKm } from "../distance";
import {
  newPrsInSession,
  newCardioPrsInSession,
  prRecordsInSession,
  comparePrRecords,
  volumeByMuscle,
  type PrHit,
  type CardioPrHit,
  type PrRecord,
  type MuscleVolume,
} from "./records";

// Weekly recap — the retention loop. Rolls a week of training into one
// shareable summary (with deltas vs the week before), so "come home and review"
// has a natural weekly beat. Two windows read it: the ROLLING seven days
// (weeklyRecap), and a Mon–Sun CALENDAR week (calendarWeekRecap — what History's
// week chapters are cut on, and what the week summary screen reports). Pure.

// The figures are DECLARED in the app's reading order (figure-order.ts), the
// order every recap surface renders them in. They used to lead with the session
// count while the Progress card led with tonnage, and a shape that suggests one
// sequence while the screens use another is how the drift started.
export interface WeeklyRecap {
  /** ISO start of the window this recap covers. */
  start: string;
  volume: number; // kg tonnage
  sets: number;
  lifts: number; // distinct strength lifts
  sessions: number;
  activeDays: number; // distinct calendar days trained
  minutes: number; // summed where completedAt is known
  distanceKm: number; // total cardio distance logged this week
  prs: PrHit[]; // records set this week (best per lift)
  cardioPrs: CardioPrHit[]; // cardio records set this week (distance/pace)
  topMuscle: MuscleVolume | null;
  prevSessions: number;
  prevVolume: number;
  sessionsDelta: number;
  volumeDelta: number;
}

const WEEK = 7 * 86_400_000;
const ms = (iso: string) => new Date(iso).getTime();

// ── Week adherence strip ─────────────────────────────────────────────────────
// A glanceable Mon→Sun calendar of THIS week: which days were trained, which is
// today, which are still ahead. Pure so web + mobile render the identical strip.

export type WeekDayState = "done" | "today" | "future" | "missed";
export interface WeekDay {
  /** 0=Mon … 6=Sun (ISO weekday order, what the strip renders left→right). */
  index: number;
  /** Single-letter label in Mon→Sun order: M T W T F S S. */
  label: string;
  state: WeekDayState;
}
export interface WeekAdherence {
  days: WeekDay[];
  /** Days trained so far this week. */
  done: number;
  /** Target sessions for the week (defaults to 3). */
  target: number;
}

const DOW_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
/** Monday-start day-of-week index (0=Mon … 6=Sun) for a Date. */
const monIndex = (d: Date) => (d.getDay() + 6) % 7;

/**
 * Build the Mon→Sun adherence strip for the week containing `now`. A day is
 * `done` when a session was logged on it, `today` for the current day (when not
 * yet trained), `missed` for past untrained days, `future` for days ahead.
 */
export function weekAdherence(sessions: LoggedSession[], target = 3, now = Date.now()): WeekAdherence {
  const today = new Date(now);
  const todayIdx = monIndex(today);
  // Midnight of this week's Monday.
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() - todayIdx);
  const mondayMs = monday.getTime();

  // Which Mon-start day-indices have at least one logged session this week.
  const trained = new Set<number>();
  for (const s of sessions) {
    const t = ms(s.startedAt);
    if (!Number.isFinite(t) || t < mondayMs || t >= mondayMs + WEEK) continue;
    trained.add(monIndex(new Date(t)));
  }

  const days: WeekDay[] = DOW_LABELS.map((label, index) => {
    let state: WeekDayState;
    if (trained.has(index)) state = "done";
    else if (index === todayIdx) state = "today";
    else if (index < todayIdx) state = "missed";
    else state = "future";
    return { index, label, state };
  });

  return { days, done: trained.size, target: Math.max(target, trained.size) };
}

/**
 * The recap for an ARBITRARY window, with its deltas against the window
 * immediately before it.
 *
 * `weeklyRecap` and `calendarWeekRecap` are the same reading over two different
 * windows — a rolling seven days, and a Mon–Sun calendar week — so the maths is
 * written once here. It was inlined in `weeklyRecap` until the week summary
 * screen needed a PAST week: a rolling window anchored on `now` can only ever
 * answer for the week that is happening.
 */
function recapWindow(
  sessions: LoggedSession[],
  from: number,
  to: number,
  prevFrom: number,
  prevTo: number,
  bw?: BodyweightInput,
): WeeklyRecap {
  const within = (s: LoggedSession, lo: number, hi: number) => ms(s.startedAt) >= lo && ms(s.startedAt) < hi;
  // The week's distance and minutes are the measured ones wherever a device
  // recorded the session (see device-truth.ts).
  const measured = deviceTrueSessions(sessions);
  const thisWeek = measured.filter((s) => within(s, from, to));
  const prevWeek = measured.filter((s) => within(s, prevFrom, prevTo));

  let volume = 0;
  let sets = 0;
  let minutes = 0;
  let distanceKm = 0;
  const days = new Set<string>();
  const lifts = new Set<string>();
  const blocks: SessionBlock[] = [];
  for (const s of thisWeek) {
    volume += sessionVolume(s.blocks, false, bwAt(bw, s.startedAt));
    days.add(localDayKey(s.startedAt));
    for (const b of s.blocks) {
      blocks.push(b);
      if (b.kind === "strength") {
        sets += b.sets.length;
        lifts.add(b.name);
      } else {
        sets += 1;
        if (b.kind === "cardio" && b.distance && b.distance > 0) distanceKm += b.distance;
      }
    }
    if (s.completedAt) minutes += Math.max(0, Math.round((ms(s.completedAt) - ms(s.startedAt)) / 60000));
  }

  // PRs across the week, best per lift (each session compared to all prior history).
  const prMap = new Map<string, PrHit>();
  for (const s of [...thisWeek].sort((a, b) => ms(a.startedAt) - ms(b.startedAt))) {
    const prior = sessions.filter((x) => ms(x.startedAt) < ms(s.startedAt));
    for (const h of newPrsInSession(s, prior)) {
      const cur = prMap.get(h.lift);
      if (!cur || h.topLoad > cur.topLoad) prMap.set(h.lift, h);
    }
  }
  // Heaviest first, matching newPrsInSession and the Cockpit rows that render these.
  const prs = [...prMap.values()].sort((a, b) => b.topLoad - a.topLoad);

  // Cardio PRs across the week, best per move+kind.
  const cardioMap = new Map<string, CardioPrHit>();
  for (const s of [...thisWeek].sort((a, b) => ms(a.startedAt) - ms(b.startedAt))) {
    const prior = sessions.filter((x) => ms(x.startedAt) < ms(s.startedAt));
    for (const h of newCardioPrsInSession(s, prior)) {
      const key = `${h.move}-${h.kind}`;
      const cur = cardioMap.get(key);
      const better = !cur || (h.kind === "distance" ? h.value > cur.value : h.value < cur.value);
      if (better) cardioMap.set(key, h);
    }
  }
  const cardioPrs = [...cardioMap.values()];

  const prevVolume = prevWeek.reduce((v, s) => v + sessionVolume(s.blocks, false, bwAt(bw, s.startedAt)), 0);

  return {
    start: new Date(from).toISOString(),
    sessions: thisWeek.length,
    volume,
    sets,
    minutes,
    activeDays: days.size,
    lifts: lifts.size,
    distanceKm: roundKm(distanceKm),
    prs,
    cardioPrs,
    // The week's blocks span several dates; the current weight is a fair basis
    // for a coarse "top muscle" headline (bodyweight lifts now count, not 0).
    topMuscle: volumeByMuscle(blocks, false, bwAt(bw))[0] ?? null,
    prevSessions: prevWeek.length,
    prevVolume,
    sessionsDelta: thisWeek.length - prevWeek.length,
    volumeDelta: volume - prevVolume,
  };
}

/** The ROLLING seven days ending at `now`, against the seven before them — the
 *  retention beat ("your week", wherever the week is the last seven days). */
export function weeklyRecap(sessions: LoggedSession[], now = Date.now(), bw?: BodyweightInput): WeeklyRecap {
  return recapWindow(sessions, now - WEEK, now + 1, now - 2 * WEEK, now - WEEK, bw);
}

/**
 * A CALENDAR week — Monday 00:00 to the next Monday 00:00, local — against the
 * calendar week before it. The week summary screen's reading, and History's
 * week chapters are cut on exactly these boundaries, so the summary behind a
 * chapter and the chapter itself count the same sessions by construction.
 *
 * The bounds step by local calendar days rather than by 7 × 86 400 000, so the
 * 23- and 25-hour DST weeks are still whole weeks.
 */
export function calendarWeekRecap(sessions: LoggedSession[], mondayMs: number, bw?: BodyweightInput): WeeklyRecap {
  const monday = localMondayMs(mondayMs);
  return recapWindow(sessions, monday, addLocalDays(monday, 7), addLocalDays(monday, -7), monday, bw);
}

/**
 * PRs set inside an ARBITRARY window, best per lift, heaviest first.
 *
 * `weeklyRecap` can only ever answer for a rolling seven days, which is why the
 * Performance page and the Today activity card were reporting two different
 * weeks under two labels a reader treats as synonyms. The activity card owns a
 * real window — a calendar week, 30 days, a named month — so it needs the PRs
 * for THAT window rather than for a seven-day span that happens to overlap it.
 *
 * Each session is still compared against ALL prior history, not just history
 * inside the window: a record is a record against everything before it.
 */
export function prsBetween(
  sessions: LoggedSession[],
  from: number,
  to: number,
  bw?: BodyweightInput,
): PrHit[] {
  const measured = deviceTrueSessions(sessions);
  const inWindow = measured
    .filter((s) => {
      const t = ms(s.startedAt);
      return Number.isFinite(t) && t >= from && t < to;
    })
    .sort((a, b) => ms(a.startedAt) - ms(b.startedAt));

  const best = new Map<string, PrHit>();
  for (const s of inWindow) {
    const prior = sessions.filter((x) => ms(x.startedAt) < ms(s.startedAt));
    for (const h of newPrsInSession(s, prior, bw)) {
      const cur = best.get(h.lift);
      if (!cur || h.topLoad > cur.topLoad) best.set(h.lift, h);
    }
  }
  return [...best.values()].sort((a, b) => b.topLoad - a.topLoad);
}

/**
 * `prsBetween`, AS PATHS - the same window, the same comparison, split by axis
 * so the Records block can print what each record moved between. See the RECORDS
 * AS A PATH note in engines/records.ts for why the two views exist.
 *
 * Dedup differs from `prsBetween` in the one way that matters: that one keeps
 * the heaviest hit per LIFT, because it renders one line per lift. A path table
 * keys on the lift AND its axis, so a week where you added a plate on Tuesday
 * and a rep on Friday keeps both - they are different records, and collapsing
 * them would put a pair on screen that no single session ever performed. Within
 * one axis the biggest gain wins, which is the figure the row prints.
 */
export function prRecordsBetween(
  sessions: LoggedSession[],
  from: number,
  to: number,
  bw?: BodyweightInput,
): PrRecord[] {
  const measured = deviceTrueSessions(sessions);
  const inWindow = measured
    .filter((s) => {
      const t = ms(s.startedAt);
      return Number.isFinite(t) && t >= from && t < to;
    })
    .sort((a, b) => ms(a.startedAt) - ms(b.startedAt));

  const best = new Map<string, PrRecord>();
  for (const s of inWindow) {
    const prior = sessions.filter((x) => ms(x.startedAt) < ms(s.startedAt));
    for (const r of prRecordsInSession(s, prior, bw)) {
      const key = `${r.lift} ${r.axis}`;
      const cur = best.get(key);
      if (!cur || comparePrRecords(r, cur) < 0) best.set(key, r);
    }
  }
  return [...best.values()].sort(comparePrRecords);
}
