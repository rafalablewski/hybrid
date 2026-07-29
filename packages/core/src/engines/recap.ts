import type { LoggedSession, SessionBlock } from "./session";
import { localDayKey } from "../day-key";
import { sessionVolume } from "./session";
import { bwAt, type BodyweightInput } from "../bodyweight";
import { deviceTrueSessions } from "../device-truth";
import {
  newPrsInSession,
  newCardioPrsInSession,
  volumeByMuscle,
  type PrHit,
  type CardioPrHit,
  type MuscleVolume,
} from "./records";

// Weekly recap — the retention loop. Rolls the last 7 days of training into one
// shareable summary (with deltas vs the week before), so "come home and review"
// has a natural weekly beat. Pure, so web + mobile compute it identically.

export interface WeeklyRecap {
  /** ISO start of the 7-day window. */
  start: string;
  sessions: number;
  volume: number; // kg tonnage
  sets: number;
  minutes: number; // summed where completedAt is known
  activeDays: number; // distinct calendar days trained
  lifts: number; // distinct strength lifts
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

export function weeklyRecap(sessions: LoggedSession[], now = Date.now(), bw?: BodyweightInput): WeeklyRecap {
  const within = (s: LoggedSession, from: number, to: number) => ms(s.startedAt) >= from && ms(s.startedAt) < to;
  // The week's distance and minutes are the measured ones wherever a device
  // recorded the session (see device-truth.ts).
  const measured = deviceTrueSessions(sessions);
  const thisWeek = measured.filter((s) => within(s, now - WEEK, now + 1));
  const prevWeek = measured.filter((s) => within(s, now - 2 * WEEK, now - WEEK));

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
    start: new Date(now - WEEK).toISOString(),
    sessions: thisWeek.length,
    volume,
    sets,
    minutes,
    activeDays: days.size,
    lifts: lifts.size,
    distanceKm: Math.round(distanceKm * 10) / 10,
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
