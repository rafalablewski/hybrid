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
 */

const KEY = "hybrid.dayBand.rejected.v1";

interface Stored {
  day: string;
  kinds: TrainingKind[];
}

export async function readRejected(now: number = Date.now()): Promise<TrainingKind[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Stored;
    return parsed?.day === localTodayKey(now) && Array.isArray(parsed.kinds) ? parsed.kinds : [];
  } catch {
    return [];
  }
}

export async function rejectKind(kind: TrainingKind, now: number = Date.now()): Promise<TrainingKind[]> {
  const kinds = [...new Set([...(await readRejected(now)), kind])];
  await AsyncStorage.setItem(KEY, JSON.stringify({ day: localTodayKey(now), kinds } satisfies Stored)).catch(() => {});
  return kinds;
}

export async function clearRejected(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
