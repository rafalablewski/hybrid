import AsyncStorage from "@react-native-async-storage/async-storage";
import { localTodayKey, type TrainingKind } from "@hybrid/core";

/**
 * "NOT TODAY" — the one tap that corrects an inferred day.
 *
 * The band only ever INFERS when the athlete has no plan, and an inference can
 * be wrong in a way the app has no other way of finding out: a rotation says a
 * swim is due, the athlete is going to run. Tapping the correction cycles the
 * band to the next confident kind and records the rejection, so the rest of the
 * day's screens agree with what the athlete just said.
 *
 * SCOPED TO THE DAY, deliberately. A rejection is a fact about today, not a
 * standing preference — "not swimming today" must not still be true on Friday.
 * The record is keyed by the local day and anything older is dropped on read,
 * so the store cannot grow and cannot leak yesterday's answer into today.
 *
 * It is also the only TRAINING-INTENT signal the app collects. Everything else
 * it knows is what already happened.
 *
 * ── TWO REJECTIONS, BECAUSE THEY ARE TWO DIFFERENT ANSWERS ────────────────
 *
 * `kinds` is about TODAY: the athlete is not swimming today. `events` is about
 * TOMORROW: there is no game tomorrow, whatever the log's Thursdays suggest.
 * They were one set, and the fixture read consulted neither — so the "not
 * today?" under "you have a game tomorrow" dropped `sport` from the ROTATION
 * (silently suppressing today's suggestions) and left the fixture standing.
 * The band redrew identically and the only visible way to argue with a wrong
 * guess did nothing at all.
 *
 * Keeping them apart matters in both directions: saying you are not swimming
 * today must not cancel Thursday's fixture, and saying there is no game
 * tomorrow must not stop the app offering you a game today.
 */

const KEY = "hybrid.dayBand.rejected.v1";

interface Stored {
  day: string;
  /** Kinds the athlete said no to for TODAY's training. */
  kinds: TrainingKind[];
  /** Kinds the athlete said are not happening TOMORROW (an inferred fixture).
   *  Optional so a record written before this existed still reads. */
  events?: TrainingKind[];
}

const EMPTY: Stored = { day: "", kinds: [], events: [] };

/** The whole record for today, or an empty one. The single read both getters
 *  and both setters go through, so a write of one set cannot drop the other. */
async function read(now: number): Promise<Stored> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Stored;
    if (parsed?.day !== localTodayKey(now)) return EMPTY;
    return {
      day: parsed.day,
      kinds: Array.isArray(parsed.kinds) ? parsed.kinds : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return EMPTY;
  }
}

async function write(now: number, next: Omit<Stored, "day">): Promise<void> {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({ day: localTodayKey(now), ...next } satisfies Stored),
  ).catch(() => {});
}

/** Kinds rejected for TODAY's training. */
export async function readRejected(now: number = Date.now()): Promise<TrainingKind[]> {
  return (await read(now)).kinds;
}

/** Kinds the athlete says are NOT happening tomorrow — read by the fixture
 *  detector, so a dismissed guess stops protecting the day rather than being
 *  re-worded. */
export async function readRejectedEvents(now: number = Date.now()): Promise<TrainingKind[]> {
  return (await read(now)).events ?? [];
}

export async function rejectKind(kind: TrainingKind, now: number = Date.now()): Promise<TrainingKind[]> {
  const cur = await read(now);
  const kinds = [...new Set([...cur.kinds, kind])];
  await write(now, { kinds, events: cur.events ?? [] });
  return kinds;
}

export async function rejectEvent(kind: TrainingKind, now: number = Date.now()): Promise<TrainingKind[]> {
  const cur = await read(now);
  const events = [...new Set([...(cur.events ?? []), kind])];
  await write(now, { kinds: cur.kinds, events });
  return events;
}

export async function clearRejected(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
