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
  /**
   * THE PIN — what the band already named today, in the order it named it.
   *
   * A total order in `rotation()` makes the band deterministic for a given
   * input; it does not stop the input moving underneath it. A refetch on focus,
   * a session synced from another device, a signal landing late — any of those
   * can re-rank the day while the athlete is looking at it, and an instruction
   * that rewrites itself unprompted is one nobody can act on.
   *
   * So the answer is written down the first time it is reached from a settled
   * read, and `pinRotation()` in core promotes it back to the front on every
   * later resolve. It cannot invent an answer: a pinned kind is only promoted
   * while it still qualifies, so training it drops it out with nothing to
   * clear. Day-scoped like everything else in this file.
   */
  pin?: TrainingKind[];
}

const EMPTY: Stored = { day: "", kinds: [], events: [], pin: [] };

/**
 * EVERY DAY-SCOPED ANSWER IN ONE READ, and a flag saying it happened.
 *
 * The three reads used to be three `useEffect`s writing three `useState([])`s,
 * and an empty array meant both "nothing rejected" and "we have not asked the
 * disk yet". The band consumed them either way, so it painted its instruction
 * against an answer that had not loaded and then silently changed its mind ~200
 * ms later. `loaded` is what lets the host wait instead.
 */
export interface DayBandPrefs {
  kinds: TrainingKind[];
  events: TrainingKind[];
  pin: TrainingKind[];
  /** False until the disk has answered — never render a decision against this. */
  loaded: boolean;
}

export const EMPTY_PREFS: DayBandPrefs = { kinds: [], events: [], pin: [], loaded: false };

export async function readDayBandPrefs(now: number = Date.now()): Promise<DayBandPrefs> {
  const r = await read(now);
  return { kinds: r.kinds, events: r.events ?? [], pin: r.pin ?? [], loaded: true };
}

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
      pin: Array.isArray(parsed.pin) ? parsed.pin : [],
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
  // A rejection clears the pin it contradicts: the athlete has just said this
  // is not today's answer, so holding it at the front of the rotation would be
  // the app arguing with the only intent signal it collects.
  await write(now, { kinds, events: cur.events ?? [], pin: (cur.pin ?? []).filter((k) => k !== kind) });
  return kinds;
}

/**
 * PIN what the band just said. Called once per local day, from a SETTLED read —
 * pinning a band that was resolved against half its inputs would freeze exactly
 * the wrong answer, which is the defect this exists to end.
 */
export async function pinKinds(kinds: readonly TrainingKind[], now: number = Date.now()): Promise<TrainingKind[]> {
  const cur = await read(now);
  const pin = [...new Set(kinds)];
  await write(now, { kinds: cur.kinds, events: cur.events ?? [], pin });
  return pin;
}

export async function rejectEvent(kind: TrainingKind, now: number = Date.now()): Promise<TrainingKind[]> {
  const cur = await read(now);
  const events = [...new Set([...(cur.events ?? []), kind])];
  await write(now, { kinds: cur.kinds, events, pin: cur.pin ?? [] });
  return events;
}

export async function clearRejected(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
