/**
 * Apple Health (HealthKit) bridge — the native half of the `apple` connector.
 *
 * Deliberately ISOLATED: everything HealthKit-specific on the client lives in
 * this one file. The rest of the app only sees the small async API below, and
 * every entry point degrades gracefully when the native module isn't in the
 * binary (Expo Go, Android, web preview) — so pulling the dependency back out
 * reverts the feature without touching any other screen.
 *
 * Library: @kingstinct/react-native-healthkit (Nitro, new-architecture-native).
 * The first pick, react-native-health, compiled against RN 0.85 after patching
 * but its legacy NativeModule never registers at runtime — RN 0.85 removed the
 * legacy architecture (RCT_REMOVE_LEGACY_ARCH), so NativeModules.AppleHealthKit
 * stayed undefined on-device (TestFlight build of run 29664047261).
 *
 * Data path (the same "Switzerland" rule as every provider): read HRV /
 * resting HR / sleep from HealthKit on-device → aggregate per day → POST the
 * samples to the EXISTING /api/connect/apple/sync relay, where @hybrid/core's
 * parseHealthKit normalizes them into Signal rows (deduped by the
 * userId+kind+ts+source unique index). The engines never learn HealthKit exists.
 */
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEVICE_MATCH_WINDOW_H, isDeviceName, sanitizeDeviceWorkout, type DeviceWorkout } from "@hybrid/core";
import { supabase } from "./supabase";
import { fetchWithTimeout } from "./fetch";
import { API_BASE, fetchSessions, patchSessionDevice } from "./api";
// The bridge's units → ours. Pure + unit-tested (health-quantities.test.ts)
// because an unrecognised unit here does not throw, it makes a whole metric
// disappear — see that file's comment for the distance this cost.
import { metaCelsius, metaMetres, metaQty, qtyCount, qtyKcal, qtyKm, qtyMinutes } from "./health-quantities";

// Apple doesn't expose whether Health *read* access was actually granted (a
// denial is indistinguishable from "no data" by design), so "connected" is a
// local flag set when the permission sheet completes. lastSync mirrors the
// server's Connection.lastSyncAt for instant display.
const CONNECTED_KEY = "hybrid.healthkit.connected";
const LAST_SYNC_KEY = "hybrid.healthkit.lastSync";

type HK = typeof import("@kingstinct/react-native-healthkit");

// Lazy + memoized: the library instantiates its Nitro hybrid objects at import
// time, which THROWS in a binary without the native module (Expo Go) — the
// try/catch turns that into the graceful "no-module" state.
let hkModule: HK | null | undefined;
function loadHealthKit(): HK | null {
  if (hkModule !== undefined) return hkModule;
  if (Platform.OS !== "ios") return (hkModule = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("@kingstinct/react-native-healthkit") as HK;
    hkModule = mod.isHealthDataAvailable() ? mod : null;
  } catch {
    hkModule = null;
  }
  return hkModule;
}

export type HealthKitAvailability = "ready" | "no-module" | "wrong-platform";

/** Whether this binary can talk to HealthKit at all. "no-module" means iOS but
 *  the native module isn't in the build (Expo Go / a build predating it) — or
 *  the device has no health store (some iPads). */
export function healthKitAvailability(): HealthKitAvailability {
  if (Platform.OS !== "ios") return "wrong-platform";
  return loadHealthKit() ? "ready" : "no-module";
}

export async function healthKitConnected(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CONNECTED_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function healthKitLastSync(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Record the connection's existence server-side so the Connections hub shows a
 *  real status (there's no OAuth leg for apple — just this flag). Best-effort. */
async function registerAppleConnection(action: "connect" | "disconnect"): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/connect/apple/register`, {
      method: action === "connect" ? "POST" : "DELETE",
      headers: await authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Open the HealthKit permission sheet for read access to HRV / resting HR /
 *  sleep, then register the connection. Resolves ok when the sheet completes —
 *  Apple hides per-type read denials, so a "connected" state with no data means
 *  access was declined (surfaced on the page as a Settings hint). */
export async function connectHealthKit(): Promise<{ ok: boolean; error?: string }> {
  const hk = loadHealthKit();
  if (!hk) return { ok: false, error: "unavailable" };
  try {
    const ok = await hk.requestAuthorization({
      toRead: [
        "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
        "HKQuantityTypeIdentifierRestingHeartRate",
        "HKCategoryTypeIdentifierSleepAnalysis",
        // The summary's workout match reads the workout list + its HR/energy.
        // Asked here too so a fresh connect sheets everything ONCE.
        ...WORKOUT_READ_TYPES,
      ],
    });
    if (!ok) return { ok: false, error: "authorization did not complete" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
  await AsyncStorage.setItem(CONNECTED_KEY, "1").catch(() => {});
  await registerAppleConnection("connect");
  return { ok: true };
}

/** Forget the local connection and mark the server row revoked. (iOS keeps the
 *  Health permission itself — the user manages that in Settings → Health.) */
export async function disconnectHealthKit(): Promise<void> {
  await AsyncStorage.removeItem(CONNECTED_KEY).catch(() => {});
  await AsyncStorage.removeItem(LAST_SYNC_KEY).catch(() => {});
  await registerAppleConnection("disconnect");
}

// ---- sample reading + per-day aggregation --------------------------------

/** The relay shape parseHealthKit consumes: HK type identifier + value + end. */
export type RelaySample = { type: string; value: number; end: string };

/** A library-agnostic reading: value + [start, end] ISO timestamps. */
type Reading = { value: number; start: string; end: string };

const iso = (d: Date | string) => new Date(d).toISOString();

const localDay = (isoTs: string) => {
  const d = new Date(isoTs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** One sample per local day: mean of the day's readings, stamped with the
 *  day's LATEST sample end. A re-sync with unchanged data reproduces the
 *  identical (ts, value) → deduped server-side; new readings later the same day
 *  move the ts, so the fresher aggregate lands as the day's latest row. */
function dailyMean(readings: Reading[], type: string): RelaySample[] {
  const byDay = new Map<string, { sum: number; n: number; end: string }>();
  for (const r of readings) {
    if (!Number.isFinite(r.value)) continue;
    const day = localDay(r.end);
    const cur = byDay.get(day) ?? { sum: 0, n: 0, end: r.end };
    cur.sum += r.value;
    cur.n += 1;
    if (r.end > cur.end) cur.end = r.end;
    byDay.set(day, cur);
  }
  return [...byDay.values()].map((d) => ({
    type,
    value: Math.round((d.sum / d.n) * 100) / 100,
    end: d.end,
  }));
}

/** Sum asleep-stage segment durations into hours per night, attributed to the
 *  local day the sleep ENDED on (a 23:00→07:00 night belongs to the wake day).
 *  HKCategoryValueSleepAnalysis: 0 inBed, 1 asleep(Unspecified), 2 awake,
 *  3 asleepCore, 4 asleepDeep, 5 asleepREM — count only the asleep stages. */
const ASLEEP_VALUES = new Set([1, 3, 4, 5]);

function nightlySleep(segments: Reading[]): RelaySample[] {
  const byDay = new Map<string, { hours: number; end: string }>();
  for (const s of segments) {
    if (!ASLEEP_VALUES.has(s.value)) continue;
    const ms = Date.parse(s.end) - Date.parse(s.start);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    const day = localDay(s.end);
    const cur = byDay.get(day) ?? { hours: 0, end: s.end };
    cur.hours += ms / 3600000;
    if (s.end > cur.end) cur.end = s.end;
    byDay.set(day, cur);
  }
  return [...byDay.values()].map((d) => ({
    type: "HKCategoryTypeIdentifierSleepAnalysis",
    value: Math.round(d.hours * 100) / 100,
    end: d.end,
  }));
}

// ---- workout matching (the summary's "match a device workout") ------------

/** HealthKit has no one "distance" — it keeps a separate quantity type per
 *  travel mode, and a workout carries a statistic only for its own. */
const DISTANCE_TYPES = [
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierDistanceCycling",
  "HKQuantityTypeIdentifierDistanceSwimming",
  "HKQuantityTypeIdentifierDistanceRowing",
  "HKQuantityTypeIdentifierDistancePaddleSports",
  "HKQuantityTypeIdentifierDistanceCrossCountrySkiing",
  "HKQuantityTypeIdentifierDistanceDownhillSnowSports",
  "HKQuantityTypeIdentifierDistanceSkatingSports",
  "HKQuantityTypeIdentifierDistanceWheelchair",
] as const;

type DistanceType = (typeof DISTANCE_TYPES)[number];

/** The distance type an activity records in, keyed off the HK activity enum's
 *  own name ("swimming", "crossCountrySkiing"). Most specific first — "swimBikeRun"
 *  (a triathlon) has no single mode, so it falls through to the generic probe. */
const ACTIVITY_DISTANCE: [RegExp, DistanceType][] = [
  [/swim|waterFitness|waterSports|underwaterDiving/i, "HKQuantityTypeIdentifierDistanceSwimming"],
  [/crossCountrySkiing/i, "HKQuantityTypeIdentifierDistanceCrossCountrySkiing"],
  [/downhillSkiing|snowboarding|snowSports/i, "HKQuantityTypeIdentifierDistanceDownhillSnowSports"],
  [/skating|skatingSports/i, "HKQuantityTypeIdentifierDistanceSkatingSports"],
  [/rowing/i, "HKQuantityTypeIdentifierDistanceRowing"],
  [/paddle|surfing|sailing|kayak|canoe/i, "HKQuantityTypeIdentifierDistancePaddleSports"],
  [/wheelchair/i, "HKQuantityTypeIdentifierDistanceWheelchair"],
  [/cycling|handCycling/i, "HKQuantityTypeIdentifierDistanceCycling"],
  [/running|walking|hiking|elliptical|stairs|stepTraining/i, "HKQuantityTypeIdentifierDistanceWalkingRunning"],
];

/** What the match flow reads beyond the daily biometrics: the workout list
 *  itself plus the per-workout heart-rate / active-energy / step / distance
 *  statistics. */
const WORKOUT_READ_TYPES = [
  "HKWorkoutTypeIdentifier",
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierStepCount",
  // Every distance flavour HealthKit records, because `workout.statistics(for:)`
  // only answers for types the app may read — and the workout's own
  // `totalDistance` is nil for recordings whose distance lives in the
  // per-activity statistics instead (see `workoutDistanceKm`).
  ...DISTANCE_TYPES,
] as const;

/** Sheet the workout read permissions (idempotent — iOS only shows the sheet
 *  for types it hasn't asked about yet, so an athlete who connected before this
 *  feature existed gets exactly one extra prompt). */
export async function requestWorkoutReadAuth(): Promise<boolean> {
  const hk = loadHealthKit();
  if (!hk) return false;
  try {
    return await hk.requestAuthorization({ toRead: [...WORKOUT_READ_TYPES] });
  } catch {
    return false;
  }
}

/** "functionalStrengthTraining" (the enum's name) → "Functional Strength
 *  Training" — resolved here so no other client ever needs the HK enum. */
const activityRawName = (hk: HK, type: number): string =>
  (hk.WorkoutActivityType as Record<number, string | undefined>)[type] ?? "";

const activityLabel = (hk: HK, type: number): string => {
  const raw = activityRawName(hk, type);
  if (!raw) return "Workout";
  const words = raw.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** One workout proxy as the library hands it back. */
type WorkoutProxyLike = Awaited<ReturnType<HK["queryWorkoutSamples"]>>[number];

/**
 * HOW FAR the recording says it went, km.
 *
 * `totalDistance` first — but it is nil for workouts whose distance is only
 * kept as per-activity statistics, so an absent total falls back to the
 * statistic for the activity's own distance type (an unmapped activity probes
 * the three common modes rather than all nine). Explicitly requesting metres
 * sidesteps the store's locale-preferred unit. Null when nothing measured a
 * distance — a gym session genuinely has none.
 */
async function workoutDistanceKm(w: WorkoutProxyLike, rawActivity: string): Promise<number | null> {
  const total = qtyKm(w.totalDistance);
  if (total != null && total > 0) return total;
  const primary = ACTIVITY_DISTANCE.find(([re]) => re.test(rawActivity))?.[1];
  const probes: DistanceType[] = primary
    ? [primary]
    : [
        "HKQuantityTypeIdentifierDistanceWalkingRunning",
        "HKQuantityTypeIdentifierDistanceCycling",
        "HKQuantityTypeIdentifierDistanceSwimming",
      ];
  const stats = await Promise.all(probes.map((type) => w.getStatistic(type, "m").catch(() => undefined)));
  let best = 0;
  for (const s of stats) {
    const km = qtyKm(s?.sumQuantity);
    if (km != null && km > best) best = km;
  }
  return best > 0 ? best : null;
}

/** Apple product-type families ("Watch6,18", "iPhone16,2") → the hardware an
 *  athlete would name, for a recording that carries no device name of its own. */
const PRODUCT_FAMILY: [RegExp, string][] = [
  [/^watch/i, "Apple Watch"],
  [/^iphone/i, "iPhone"],
  [/^ipad/i, "iPad"],
];

/**
 * WHAT RECORDED IT — the device name to show beside the workout.
 *
 * Not as simple as `sourceRevision.source.name`: this library hands the source
 * back as a Nitro hybrid object, and EVERY hybrid object carries its own `name`
 * property holding the native class name. That shadows HealthKit's source name,
 * so the naive read returns the literal string "SourceProxy" — which is what
 * shipped, and what athletes saw on the summary. The real source name is only
 * reachable through `toJSON()`, which serialises the underlying Source.
 *
 * Preference order: the HKDevice that produced the samples ("Apple Watch"),
 * then the source's true name (the app or paired device, e.g. "Strava"), then
 * the product type's family. Each step degrades on its own; returning undefined
 * lets core name the provider's device instead.
 */
const recordingDevice = (w: {
  device?: { name?: string; model?: string } | null;
  sourceRevision?: { source?: { name?: string; toJSON?: (key?: string) => { name?: string } }; productType?: string } | null;
}): string | undefined => {
  const rev = w.sourceRevision ?? undefined;
  let sourceName: string | undefined;
  try {
    // toJSON() first — `source.name` on the proxy is the CLASS name, not the
    // recording's source. isDeviceName() is the belt to that braces.
    sourceName = rev?.source?.toJSON?.()?.name ?? rev?.source?.name;
  } catch {
    sourceName = undefined;
  }
  const family = rev?.productType
    ? PRODUCT_FAMILY.find(([re]) => re.test(rev.productType!))?.[1]
    : undefined;
  for (const candidate of [w.device?.name, sourceName, family, w.device?.model])
    if (isDeviceName(candidate)) return candidate.trim();
  return undefined;
};

/**
 * ONE recording → the stored DeviceWorkout shape. Every field degrades to
 * absent on its own, so a workout without a strap (no heart rate) or without a
 * distance is still a usable read. Null when the result can't be sanitized.
 *
 * Shared by the match picker and the refresh pass below, so a fix to what the
 * bridge reads reaches ALREADY-matched sessions too, not just the next match.
 */
async function readWorkout(hk: HK, w: WorkoutProxyLike): Promise<DeviceWorkout | null> {
  const start = iso(w.startDate);
  const end = iso(w.endDate);
  const rawActivity = activityRawName(hk, w.workoutActivityType as unknown as number);
  const durationMin =
    qtyMinutes(w.duration) ?? Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 60000));
  // Everything the recording carries, each read degrading to absent on its
  // own: per-workout statistics (HR incl. the floor, steps), the measured
  // distance, the workout's own totals (strokes/flights), and the metadata
  // extras (climb, average METs, indoor flag, weather).
  const [hr, stepStat, distanceKm] = await Promise.all([
    w.getStatistic("HKQuantityTypeIdentifierHeartRate", "count/min").catch(() => undefined),
    w.getStatistic("HKQuantityTypeIdentifierStepCount", "count").catch(() => undefined),
    workoutDistanceKm(w, rawActivity).catch(() => null),
  ]);
  const meta = (w.metadata ?? {}) as Record<string, unknown>;
  const indoorRaw = meta["HKIndoorWorkout"];
  return sanitizeDeviceWorkout({
    provider: "apple",
    uuid: w.uuid,
    activityLabel: activityLabel(hk, w.workoutActivityType as unknown as number),
    start,
    end,
    durationMin: Math.round(durationMin),
    durationSec: Math.round(durationMin * 60),
    kcal: qtyKcal(w.totalEnergyBurned) ?? undefined,
    distanceKm: distanceKm ?? undefined,
    avgHr: hr?.averageQuantity?.quantity,
    maxHr: hr?.maximumQuantity?.quantity,
    minHr: hr?.minimumQuantity?.quantity,
    steps: qtyCount(stepStat?.sumQuantity) ?? undefined,
    strokes: qtyCount(w.totalSwimmingStrokeCount) ?? undefined,
    flights: qtyCount(w.totalFlightsClimbed) ?? undefined,
    elevationM: metaMetres(meta["HKElevationAscended"]) ?? undefined,
    avgMets: metaQty(meta["HKAverageMETs"])?.quantity,
    tempC: metaCelsius(meta["HKWeatherTemperature"]) ?? undefined,
    ...(typeof indoorRaw === "boolean" || indoorRaw === 0 || indoorRaw === 1 ? { indoor: Boolean(indoorRaw) } : {}),
    source: recordingDevice(w),
  });
}

/**
 * Read the workouts the device recorded around a logged session (±the shared
 * match window) and normalize each to the stored DeviceWorkout shape. Returns
 * null when HealthKit itself is unreachable (vs [] = reachable but nothing
 * there).
 */
export async function queryDeviceWorkouts(aroundIso: string): Promise<DeviceWorkout[] | null> {
  const hk = loadHealthKit();
  if (!hk) return null;
  const t = Date.parse(aroundIso);
  if (!Number.isFinite(t)) return null;
  const windowMs = DEVICE_MATCH_WINDOW_H * 3600000;
  const filter = { date: { startDate: new Date(t - windowMs), endDate: new Date(t + windowMs) } };
  try {
    const proxies = await hk.queryWorkoutSamples({ limit: 0, ascending: false, filter });
    const out: DeviceWorkout[] = [];
    for (const w of proxies) {
      const candidate = await readWorkout(hk, w);
      if (candidate) out.push(candidate);
    }
    return out;
  } catch {
    return null;
  }
}

/** The stored fields a refresh may legitimately change. `matchedAt` is excluded
 *  — the server re-stamps it on every write, so comparing it would make every
 *  session look stale forever. */
const deviceFingerprint = (d: DeviceWorkout): string =>
  JSON.stringify(
    Object.entries(d)
      .filter(([k]) => k !== "matchedAt")
      .sort(([a], [b]) => a.localeCompare(b)),
  );

/**
 * REPAIR THE SESSIONS ALREADY MATCHED.
 *
 * `Session.device` is a snapshot frozen at match time, so a fix to what the
 * native read understands (the "meters" unit that dropped every distance, and
 * the pace that died with it) would otherwise only reach workouts matched from
 * then on — every session matched before it would keep its damaged read until
 * the athlete happened to re-match it by hand, one at a time.
 *
 * So the sync re-reads them: ask HealthKit for exactly the stored uuids (one
 * query, no date window — the athlete's whole matched history), re-normalize,
 * and PATCH back only the sessions whose read actually CHANGED. Workouts the
 * store no longer holds (deleted on the watch) are left alone rather than
 * unlinked — a missing recording is not a decision to unmatch.
 */
export async function refreshMatchedWorkouts(): Promise<{ checked: number; repaired: number }> {
  const hk = loadHealthKit();
  if (!hk) return { checked: 0, repaired: 0 };
  let matched: { id: string; device: DeviceWorkout }[];
  try {
    matched = (await fetchSessions())
      .filter((s) => s.device?.provider === "apple" && typeof s.device.uuid === "string" && s.device.uuid)
      .map((s) => ({ id: s.id, device: s.device as DeviceWorkout }));
  } catch {
    return { checked: 0, repaired: 0 };
  }
  if (matched.length === 0) return { checked: 0, repaired: 0 };

  let fresh: Map<string, DeviceWorkout>;
  try {
    const uuids = [...new Set(matched.map((m) => m.device.uuid))];
    const proxies = await hk.queryWorkoutSamples({ limit: 0, filter: { uuids } });
    fresh = new Map();
    for (const w of proxies) {
      const read = await readWorkout(hk, w);
      if (read) fresh.set(read.uuid, read);
    }
  } catch {
    return { checked: matched.length, repaired: 0 };
  }

  let repaired = 0;
  for (const m of matched) {
    const read = fresh.get(m.device.uuid);
    if (!read || deviceFingerprint(read) === deviceFingerprint(m.device)) continue;
    if (await patchSessionDevice(m.id, read)) repaired += 1;
  }
  return { checked: matched.length, repaired };
}

/** Read the last 30 days of HRV / resting HR / sleep from HealthKit and relay
 *  them to the backend. Returns how many Signal rows the server wrote (already-
 *  synced days dedupe to 0 — that's normal, not a failure), and how many
 *  already-matched workouts the same pass repaired (see
 *  refreshMatchedWorkouts — a re-sync fixes the history, not just the future). */
export async function syncHealthKit(): Promise<{
  ok: boolean;
  written: number;
  repaired: number;
  error?: "unavailable" | "network";
}> {
  const hk = loadHealthKit();
  if (!hk) return { ok: false, written: 0, repaired: 0, error: "unavailable" };

  // Repairing the already-matched workouts rides along with the daily relay:
  // "sync" is what an athlete reaches for when the app disagrees with the
  // watch, so it must mend the history rather than only the next match. It
  // never fails the sync — a repair pass that can't run leaves the rows as
  // they were.
  const { repaired } = await refreshMatchedWorkouts().catch(() => ({ repaired: 0 }));

  const filter = {
    date: { startDate: new Date(Date.now() - 30 * 86400000), endDate: new Date() },
  };
  // Each query degrades to [] on its own, so one unreadable metric never sinks
  // the whole sync. limit: 0 = no limit; units are requested explicitly so the
  // values match the Signal ontology (hrv in ms, restingHr in bpm).
  const [hrv, rhr, sleep] = await Promise.all([
    hk
      .queryQuantitySamples("HKQuantityTypeIdentifierHeartRateVariabilitySDNN", { limit: 0, unit: "ms", filter })
      .then((xs) => xs.map((s) => ({ value: s.quantity, start: iso(s.startDate), end: iso(s.endDate) })))
      .catch(() => [] as Reading[]),
    hk
      .queryQuantitySamples("HKQuantityTypeIdentifierRestingHeartRate", { limit: 0, unit: "count/min", filter })
      .then((xs) => xs.map((s) => ({ value: s.quantity, start: iso(s.startDate), end: iso(s.endDate) })))
      .catch(() => [] as Reading[]),
    hk
      .queryCategorySamples("HKCategoryTypeIdentifierSleepAnalysis", { limit: 0, filter })
      .then((xs) => xs.map((s) => ({ value: s.value as number, start: iso(s.startDate), end: iso(s.endDate) })))
      .catch(() => [] as Reading[]),
  ]);

  const samples: RelaySample[] = [
    ...dailyMean(hrv, "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"),
    ...dailyMean(rhr, "HKQuantityTypeIdentifierRestingHeartRate"),
    ...nightlySleep(sleep),
  ];
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/connect/apple/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ samples }),
    });
    if (!res.ok) return { ok: false, written: 0, repaired, error: "network" };
    const d = (await res.json().catch(() => ({}))) as { written?: number };
    await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()).catch(() => {});
    return { ok: true, written: d.written ?? 0, repaired };
  } catch {
    return { ok: false, written: 0, repaired, error: "network" };
  }
}
