import type { LoggedSession, SessionBlock } from "./session";
import { sessionVolume } from "./session";
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

export function weeklyRecap(sessions: LoggedSession[], now = Date.now()): WeeklyRecap {
  const within = (s: LoggedSession, from: number, to: number) => ms(s.startedAt) >= from && ms(s.startedAt) < to;
  const thisWeek = sessions.filter((s) => within(s, now - WEEK, now + 1));
  const prevWeek = sessions.filter((s) => within(s, now - 2 * WEEK, now - WEEK));

  let volume = 0;
  let sets = 0;
  let minutes = 0;
  let distanceKm = 0;
  const days = new Set<string>();
  const lifts = new Set<string>();
  const blocks: SessionBlock[] = [];
  for (const s of thisWeek) {
    volume += sessionVolume(s.blocks);
    days.add(s.startedAt.slice(0, 10));
    for (const b of s.blocks) {
      blocks.push(b);
      if (b.kind === "strength") {
        sets += b.sets.length;
        lifts.add(b.name);
      } else {
        sets += 1;
        if (b.distance && b.distance > 0) distanceKm += b.distance;
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
      if (!cur || h.e1rm > cur.e1rm) prMap.set(h.lift, h);
    }
  }
  const prs = [...prMap.values()].sort((a, b) => b.e1rm - (b.previous ?? 0) - (a.e1rm - (a.previous ?? 0)));

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

  const prevVolume = prevWeek.reduce((v, s) => v + sessionVolume(s.blocks), 0);

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
    topMuscle: volumeByMuscle(blocks)[0] ?? null,
    prevSessions: prevWeek.length,
    prevVolume,
    sessionsDelta: thisWeek.length - prevWeek.length,
    volumeDelta: volume - prevVolume,
  };
}
