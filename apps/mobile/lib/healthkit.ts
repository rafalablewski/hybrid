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
import {
  DEVICE_IMPORT_DAYS,
  DEVICE_MATCH_WINDOW_H,
  isDeviceName,
  sanitizeDeviceWorkout,
  sanitizeSessionStream,
  deviceFingerprint,
  type DeviceWorkout,
  type SessionLap,
  type SessionStream,
  type StreamKind,
} from "@hybrid/core";
import { supabase } from "./supabase";
import { fetchWithTimeout } from "./fetch";
import { nativeSpan, readHealthFaults } from "./healthkit-watchdog";
import {
  API_BASE,
  fetchSessions,
  fetchSessionRecordings,
  patchSessionDevice,
  postSessionStreams,
} from "./api";
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
/**
 * THE TRACE PATH HAS TO EARN ITS AUTOMATION.
 *
 * Set the first time a recording's series are read AND uploaded end to end in
 * front of an athlete who asked for it. Until then nothing unattended goes near
 * that read: not the sync's backfill pass, not an import. The reasoning is in
 * `readWorkoutStreams` — the short version is that the app has been closed twice
 * inside that span on a real phone, and a span that can do that does not get to
 * run on its own until it has been seen to work once on this device.
 */
const STREAMS_PROVEN_KEY = "hybrid.healthkit.streamsProven";

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
  // Under the watchdog like every other native span. Connecting is a deliberate
  // tap on a button that says so, so this is where the whole DAILY + WORKOUT
  // list goes to the store in one sheet rather than prompting again later.
  //
  // THE SERIES TYPES ARE NOT IN IT, and that is not a tidy-up. They used to be:
  // a fresh connect sheeted everything at once so a later match wouldn't prompt.
  // But the ask for those three types is one of exactly three native calls the
  // app can still be dying inside, and leaving it here would mean "Connect Apple
  // Health" — a button an athlete presses long before they care about a GPS
  // track — could take the process for a feature they haven't asked for yet.
  // One place asks for them now (`requestStreamReadAuth`), reached from one
  // control that says what it is for. Pinned by healthkit-auth.test.ts.
  const res = await nativeSpan(
    "auth",
    async () => {
      try {
        const ok = await hk.requestAuthorization({
          toRead: [
            // EVERYTHING the relay can store, asked for once. The list was three
            // types; the rest of Apple Health sat on the phone unread.
            ...DAILY_READ_TYPES,
            // The summary's workout match reads the workout list + its HR/energy.
            ...WORKOUT_READ_TYPES,
          ],
        });
        return ok ? null : "authorization did not complete";
      } catch (e) {
        return String(e);
      }
    },
    "authorization did not run",
  );
  if (res) return { ok: false, error: res };
  await AsyncStorage.setItem(CONNECTED_KEY, "1").catch(() => {});
  // What this sheet cleared is the STORE's answer to give, not ours to record
  // (see `storeHasAsked`). All this does is forget the cached answer, so the
  // next read asks again and gets the new one.
  forgetAskedCache();
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

/** `iso`, but for dates that come off a native proxy and may not be dates at
 *  all. `new Date(junk).toISOString()` THROWS, and a throw in the middle of a
 *  workout read used to take the whole fortnight's list with it — see
 *  `readWorkouts`. Null means "this recording has no usable clock". */
const isoOrNull = (d: Date | string | null | undefined): string | null => {
  if (d == null) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

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

/**
 * One sample per local day: the day's TOTAL.
 *
 * The counterpart to `dailyMean`, and the distinction is not cosmetic. Steps,
 * active energy and exercise minutes are CUMULATIVE types — HealthKit stores
 * them as a long stream of small increments, so the day's meaning is their sum
 * and their mean is a meaningless fraction of it. Averaging a day of step
 * samples would have reported about 40 steps.
 */
function dailySum(readings: Reading[], type: string): RelaySample[] {
  const byDay = new Map<string, { total: number; end: string }>();
  for (const r of readings) {
    if (!Number.isFinite(r.value)) continue;
    const day = localDay(r.end);
    const cur = byDay.get(day) ?? { total: 0, end: r.end };
    cur.total += r.value;
    if (r.end > cur.end) cur.end = r.end;
    byDay.set(day, cur);
  }
  return [...byDay.values()].map((d) => ({
    type,
    value: Math.round(d.total * 100) / 100,
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

/**
 * THE TAP'S ASK: the workout list and its statistics, and nothing else.
 *
 * The import worked, and then it exited the app on the next build. The read
 * behind the sheet did not change between those two builds — `readWorkout`,
 * `workoutDistanceKm` and `queryRecentDeviceWorkouts` are byte-identical — so
 * everything new was on the STREAM side: a second `requestAuthorization` for
 * the route and cycling types, and the reads that follow it.
 *
 * Moving that second ask off the tap and down to the point of use (the build
 * before this one) moved the crash with it, exactly: the sheet now opens, the
 * list appears, the sessions land — and the app goes as the trace read starts.
 * That is the whole diagnostic value of the last build, and it says the fatal
 * call is inside the stream half, not in the pairing of the two asks.
 *
 * So this stays as it is — it is the shape that has always worked — and the
 * stream half stops being something the app does TO an athlete. See
 * `requestStreamReadAuth` and `readWorkoutStreams`.
 */
export async function requestDeviceReadAuth(): Promise<boolean> {
  const hk = loadHealthKit();
  if (!hk) return false;
  const ok = await nativeSpan(
    "auth",
    async () => {
      try {
        return await hk.requestAuthorization({ toRead: [...WORKOUT_READ_TYPES] });
      } catch {
        return false;
      }
    },
    false,
  );
  // What was asked for is the STORE's record, not ours — the cached copy of its
  // answer is simply stale now.
  forgetAskedCache();
  return ok;
}

/**
 * THE STREAM TYPES, ASKED FOR ONLY WHEN AN ATHLETE ASKS FOR THEM.
 *
 * Never called from a read path — that is the rule this file now keeps, and
 * healthkit-auth.test.ts fails if it stops keeping it. The last two builds both
 * put this ask somewhere the athlete had not asked for it (on the import tap,
 * then on the import's tail), and the app was closed under it both times.
 *
 * A permission sheet is a deliberate thing anyway. Raised from a control that
 * says what it is for, it costs a tap; raised behind an import, it costs the
 * import — and there is nothing to read afterwards that says which.
 */
export async function requestStreamReadAuth(): Promise<boolean> {
  const hk = loadHealthKit();
  if (!hk) return false;
  const ok = await nativeSpan(
    "stream-auth",
    async () => {
      try {
        return await hk.requestAuthorization({ toRead: [...STREAM_READ_TYPES] });
      } catch {
        return false;
      }
    },
    false,
    { optional: true },
  );
  forgetAskedCache();
  return ok;
}

/**
 * HAS THE STORE ITSELF BEEN ASKED ABOUT THESE TYPES — the gate on every read.
 *
 * The library states it plainly: querying a type the app has never requested
 * authorization for crashes the app. The previous gate answered that question
 * from a flag this file wrote after calling `requestAuthorization`, which is a
 * claim about our own code rather than a fact about the store — and the two
 * come apart. The bridge builds an `HKObjectType` per identifier and SILENTLY
 * DROPS the ones it can't (a type this iOS doesn't know, a series type it
 * mis-resolves), warning to a console nobody is holding; the request then
 * resolves true having asked for less than it was given, and our flag says the
 * whole set is cleared.
 *
 * `getRequestStatusForAuthorization` is Apple answering for the store:
 * `unnecessary` means every type in the set has been put to it and asking again
 * would show nothing. That is exactly, and only, the condition under which a
 * read of those types is safe — a DENIED type is safe to query too (Apple hides
 * a read denial by design; it reads as no data), which is why this asks whether
 * the types were REQUESTED and never what the answer was.
 *
 * Cached per launch on the positive answer only: a "yes" cannot go back to
 * "no" inside a process, and a "no" is exactly what a permission sheet is about
 * to change.
 */
const AUTH_ALREADY_ASKED = 2; // HKAuthorizationRequestStatus.unnecessary
const askedCache = new Set<string>();

function forgetAskedCache(): void {
  askedCache.clear();
}

/**
 * WHICH OF THESE IDENTIFIERS THE BRIDGE CAN ACTUALLY BUILD AN HKObjectType FOR.
 *
 * The gate above rests on `unnecessary` meaning "every type in the set has been
 * put to the store". It does not — not on its own — and the hole is in the
 * bridge, one call below us:
 *
 *  • `objectTypesFromArray` resolves each identifier and SWALLOWS the ones it
 *    can't, with a console warning and nothing else. Four of the nine distance
 *    identifiers in WORKOUT_READ_TYPES are iOS 18 additions, so on iOS 17 the
 *    set that reaches HealthKit is smaller than the one we handed over.
 *  • `getRequestStatusForAuthorization` then SHORT-CIRCUITS on an empty set:
 *    "Both toRead and toShare are empty, returning 'unnecessary' status".
 *
 * Put together, `unnecessary` is returned BOTH when every type has been asked
 * about and when the bridge could resolve none of them — and the gate could not
 * tell those apart. It answered "safe to read" for a set the store had never
 * heard of, and the next line queried it: the library's own documented crash,
 * reached through the guard that exists to prevent it. That is the shape of the
 * report the watchdog kept failing to place — the app closing on the import tap,
 * with nothing left behind, because this call was never a named span either.
 *
 * So the availability probe runs first and the STATUS IS ASKED ONLY ABOUT THE
 * TYPES THE BRIDGE SAID IT COULD BUILD. That is what makes `unnecessary` mean
 * something: the answer now covers a set that is known non-empty and known
 * resolvable, and the reads that follow only ever touch those same types.
 *
 * Note the deliberate asymmetry with the iOS 17 case: the resolvable SUBSET is
 * what gets asked and read, not "all or nothing". Requiring the whole list to
 * resolve would take the import out on every iOS the newest distance types
 * predate — a regression dressed as a safety check.
 *
 * `null` means THE PROBE TOLD US NOTHING, and the caller then uses the whole set
 * — exactly what shipped before this existed. That distinction is the difference
 * between hardening the gate and killing the feature with it, so it is drawn
 * carefully rather than by a truthy check:
 *
 *  • no such function in this native binary (a JS-only update running against an
 *    older build), or the call threw;
 *  • or the answer came back without a single one of the requested identifiers in
 *    it. Off-iOS this library's own shim resolves `{}` for this call, and a shape
 *    we cannot read is indistinguishable from that. Reading `{}` as "none of them
 *    are buildable" would refuse every import on the spot — turning a crash we
 *    are not sure we have into a dead feature we certainly would.
 *
 * An empty array is therefore only ever returned when the probe was READ and
 * genuinely reported nothing buildable, which is the one state worth refusing.
 */
async function buildableTypes(hk: HK, types: readonly string[]): Promise<string[] | null> {
  const probe = hk.areObjectTypesAvailableAsync as
    | ((ids: readonly string[]) => Promise<Record<string, boolean>>)
    | undefined;
  if (typeof probe !== "function") return null;
  let built: Record<string, boolean>;
  try {
    built = await probe.call(hk, types);
  } catch {
    return null;
  }
  // Did it answer about THESE types at all? A dictionary keyed by the identifiers
  // we passed is the only shape we can draw a conclusion from.
  if (!built || !types.some((t) => typeof built[t] === "boolean")) return null;
  return types.filter((t) => built[t] === true);
}

async function storeHasAsked(hk: HK, types: readonly string[]): Promise<boolean> {
  const key = types.join(",");
  if (askedCache.has(key)) return true;
  // Under the watchdog like every other native call in this file. It was the
  // exception, and it is the FIRST call the import tap makes — so a process that
  // died here left an empty marker and the crash went unattributed twice.
  const ok = await nativeSpan(
    "auth-status",
    async () => {
      const buildable = await buildableTypes(hk, types);
      const ask = buildable ?? [...types];
      // AN EMPTY SET IS NOT AN ANSWER. The bridge would report `unnecessary` for
      // it and we would read types the store was never asked about.
      if (ask.length === 0) return false;
      try {
        const status = await hk.getRequestStatusForAuthorization({ toRead: ask as never });
        return (status as unknown as number) === AUTH_ALREADY_ASKED;
      } catch {
        return false;
      }
    },
    false,
  );
  if (ok) askedCache.add(key);
  return ok;
}

/** Whether the trace under a recording can be read at all on this device: the
 *  route and cycling series have been put to the store. False means the athlete
 *  has not opted in (see `requestStreamReadAuth`) — the summaries still import,
 *  the trace under them simply isn't fetched. */
export async function streamReadGranted(): Promise<boolean> {
  const hk = loadHealthKit();
  return hk ? storeHasAsked(hk, STREAM_READ_TYPES) : false;
}

/**
 * THE TRACE ROW'S STATE, WITHOUT SPENDING A NATIVE CALL ON THE IMPORT TAP.
 *
 * The import sheet needs both halves of this the moment it opens, to decide
 * whether the trace row is an offer or a state. It used to get them by calling
 * `streamReadGranted()` there — which put HKWorkoutRouteTypeIdentifier and the
 * two cycling types to HealthKit on the exact tap athletes report the app
 * closing on. Not a permission sheet, so the auth test never caught it; a native
 * call against the series types all the same, on the one path this file spends
 * nothing on them.
 *
 * It is also unnecessary, and that is what makes this a deletion rather than a
 * trade. `proven` is only ever written by a trace read that CAME BACK, and that
 * read is itself behind the grant — so `proven` implies `granted`, and an
 * unproven phone cannot be in the granted-and-proven state the sheet is asking
 * about. Reading `proven` costs one AsyncStorage get.
 *
 * The one visible consequence: a phone that granted the types but has never
 * completed a read reports `granted: false` here, so its row reads as the offer
 * ("get the full recording") rather than as a state. Tapping it re-asks, iOS
 * shows nothing for types it has already put, and the fetch runs — which is the
 * behaviour the row promises either way.
 */
export async function streamReadState(): Promise<{ granted: boolean; proven: boolean }> {
  const proven = await streamsProven();
  return { granted: proven ? await streamReadGranted() : false, proven };
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

/** A quantity type identifier, as the library's query signature wants it. */
type QuantityTypeIdentifier = Parameters<HK["queryQuantitySamples"]>[0];

/** One GPS fix off a workout route (the library's WorkoutRouteLocation). */
type RouteLocationLike = {
  latitude: number;
  longitude: number;
  altitude: number;
  horizontalAccuracy: number;
  date: Date | string;
};

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
  // Read through `isoOrNull`, not `iso`: a proxy whose dates don't survive the
  // bridge would otherwise THROW here rather than return null, and the caller's
  // list would end at this recording instead of skipping it.
  const start = isoOrNull(w.startDate);
  const end = isoOrNull(w.endDate);
  if (!start || !end) return null;
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
  const t = Date.parse(aroundIso);
  if (!Number.isFinite(t)) return null;
  const windowMs = DEVICE_MATCH_WINDOW_H * 3600000;
  return readWorkouts(new Date(t - windowMs), new Date(t + windowMs));
}

/**
 * Everything the device recorded over the last `days` — the read behind the
 * IMPORT flow (core/device-import.ts), where the training started on the wrist
 * and nothing has been logged in the app yet. Same normalizer, same shape; only
 * the window differs from the per-session match above.
 */
export async function queryRecentDeviceWorkouts(days = DEVICE_IMPORT_DAYS): Promise<DeviceWorkout[] | null> {
  // The window ends a DAY AHEAD of now, not at now. A recording can't be too
  // new to import, and the phone's clock is not the watch's: a workout stamped
  // even seconds ahead of `Date.now()` (clock skew between the paired devices,
  // or a recording the store still holds open) fell outside a window that
  // stopped at the current instant — while the per-session match window, which
  // reaches DEVICE_MATCH_WINDOW_H in BOTH directions, saw it perfectly well.
  // That is exactly the shape of the bug athletes reported: nothing in the
  // import sheet, then the same workout right there in the summary's picker.
  return readWorkouts(new Date(Date.now() - days * 86400000), new Date(Date.now() + 86400000));
}

/** The shared read: every workout in [start, end], normalized to DeviceWorkout.
 *  Null when HealthKit itself is unreachable (vs [] = reachable, nothing there). */
async function readWorkouts(startDate: Date, endDate: Date): Promise<DeviceWorkout[] | null> {
  const hk = loadHealthKit();
  if (!hk) return null;
  // Never before a permission sheet has put these types to the store — reading
  // a type the app has never requested is the library's own documented crash.
  // The two surfaces that read workouts both ask first; this covers the
  // unattended callers (auto-import, the sync's repair pass), which cannot.
  if (!(await storeHasAsked(hk, WORKOUT_READ_TYPES))) return null;
  return nativeSpan("workouts", () => readWorkoutsUnguarded(hk, startDate, endDate), null);
}

async function readWorkoutsUnguarded(
  hk: HK,
  startDate: Date,
  endDate: Date,
): Promise<DeviceWorkout[] | null> {
  const filter = { date: { startDate, endDate } };
  let proxies: readonly WorkoutProxyLike[];
  try {
    proxies = await hk.queryWorkoutSamples({ limit: 0, ascending: false, filter });
  } catch {
    // Only the QUERY failing means "unreachable". Everything past this point is
    // per-recording and must degrade per-recording.
    return null;
  }
  // ONE BAD RECORDING MUST NOT COST THE LIST. Every read below happens on a
  // native proxy, and a proxy that throws (a date the bridge can't hand over, a
  // statistic that rejects synchronously, an object the store has since
  // released) used to escape into a try/catch wrapped around the whole loop —
  // so the entire read returned null and the sheet showed nothing. The import
  // reads a FORTNIGHT where the match sheet reads a day either side of one
  // session, so the import was many times likelier to meet the bad recording:
  // "no workouts on the watch" in the import sheet, the workout plainly there
  // in the summary's picker, and no pattern to it from the outside.
  const out: DeviceWorkout[] = [];
  for (const w of proxies) {
    let candidate: DeviceWorkout | null = null;
    try {
      candidate = await readWorkout(hk, w);
    } catch {
      candidate = null;
    }
    if (candidate) out.push(candidate);
  }
  return out;
}

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
  // Same gate as every other workout read: this one runs on a sync, with no
  // athlete in front of it and no sheet it could raise (see `storeHasAsked`).
  if (!(await storeHasAsked(hk, WORKOUT_READ_TYPES))) return { checked: 0, repaired: 0 };
  let matched: { id: string; uuid: string; fingerprint: string }[];
  try {
    // THE WHOLE matched history, which this pass always claimed to cover and
    // did not: it read the History list, which stops at the fifty most recent
    // sessions, so an athlete's older recordings kept their damaged read
    // forever. The recordings index carries every one of them.
    matched = (await fetchSessionRecordings())
      .filter((r) => r.provider === "apple")
      .map((r) => ({ id: r.id, uuid: r.uuid, fingerprint: r.fingerprint }));
  } catch {
    return { checked: 0, repaired: 0 };
  }
  if (matched.length === 0) return { checked: 0, repaired: 0 };

  const fresh = await nativeSpan(
    "workouts",
    async () => {
      const out = new Map<string, DeviceWorkout>();
      let proxies: readonly WorkoutProxyLike[];
      try {
        const uuids = [...new Set(matched.map((m) => m.uuid))];
        proxies = await hk.queryWorkoutSamples({ limit: 0, filter: { uuids } });
      } catch {
        return out;
      }
      // Per-recording, for the same reason the import read is (see
      // `readWorkouts`): this pass covers the athlete's WHOLE matched history,
      // so one unreadable proxy in it would otherwise mean not a single session
      // gets repaired.
      for (const w of proxies) {
        try {
          const read = await readWorkout(hk, w);
          if (read) out.set(read.uuid, read);
        } catch {
          /* this recording can't be re-read — leave the stored one alone */
        }
      }
      return out;
    },
    new Map<string, DeviceWorkout>(),
  );

  let repaired = 0;
  for (const m of matched) {
    const read = fresh.get(m.uuid);
    // The stored blob never crosses the wire — the index carries its fingerprint
    // (core `deviceFingerprint`) and the fresh read is fingerprinted the same
    // way, so an unchanged recording costs one string compare instead of a PATCH.
    if (!read || deviceFingerprint(read) === m.fingerprint) continue;
    if (await patchSessionDevice(m.id, read)) repaired += 1;
  }
  return { checked: matched.length, repaired };
}

/**
 * EVERYTHING THE WATCH KNOWS, and how to ask for it.
 *
 * The relay used to read three metrics — HRV, resting heart rate, sleep — and
 * leave the rest of Apple Health on the phone. Every entry below was already
 * sitting there for anybody who had connected: cardio fitness, the daily
 * activity totals, the composition readings a smart scale writes, and the
 * overnight physiology (respiratory rate, blood oxygen, wrist temperature) that
 * is exactly the kind of thing a readiness model exists to notice.
 *
 * THREE THINGS EACH ROW HAS TO GET RIGHT, and each has already cost this
 * codebase a metric once (see health-quantities.ts):
 *
 *  unit   REQUESTED EXPLICITLY, never left to the store's preference. The trap
 *         is real and silent: HealthKit's default for respiratory rate is
 *         count/SECOND, so the honest-looking read would have stored 0.25
 *         breaths per minute and the plausibility bound would have refused it —
 *         a metric that vanishes without an error anywhere.
 *
 *  agg    SUM for cumulative types (steps, energy, minutes: the day's meaning
 *         is the total of a thousand increments) and MEAN for point readings
 *         (a heart rate, a temperature). Averaging a day of step samples
 *         reports about forty steps.
 *
 *  scale  Apple's percent unit is a FRACTION — 98% arrives as 0.98 — so blood
 *         oxygen and body fat need multiplying, and stand time arrives in
 *         minutes where the signal is hours.
 */
const DAILY_READS: {
  type: QuantityTypeIdentifier;
  unit: string;
  agg: "mean" | "sum";
  /** Applied to every sample before aggregation. */
  scale?: number;
  /** True when the value is a PERCENT Apple hands back as a 0..1 fraction.
   *  Detected per-sample rather than assumed, because a source that writes a
   *  whole number would otherwise be multiplied to 9 800 and refused. */
  percent?: boolean;
}[] = [
  // ---- recovery ----------------------------------------------------------
  { type: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", unit: "ms", agg: "mean" },
  { type: "HKQuantityTypeIdentifierRestingHeartRate", unit: "count/min", agg: "mean" },
  { type: "HKQuantityTypeIdentifierRespiratoryRate", unit: "count/min", agg: "mean" },
  { type: "HKQuantityTypeIdentifierOxygenSaturation", unit: "%", agg: "mean", percent: true },
  { type: "HKQuantityTypeIdentifierAppleSleepingWristTemperature", unit: "degC", agg: "mean" },
  { type: "HKQuantityTypeIdentifierWalkingHeartRateAverage", unit: "count/min", agg: "mean" },
  { type: "HKQuantityTypeIdentifierHeartRateRecoveryOneMinute", unit: "count/min", agg: "mean" },
  // ---- fitness -----------------------------------------------------------
  { type: "HKQuantityTypeIdentifierVO2Max", unit: "ml/(kg*min)", agg: "mean" },
  // ---- daily activity (cumulative — SUM) ---------------------------------
  { type: "HKQuantityTypeIdentifierStepCount", unit: "count", agg: "sum" },
  { type: "HKQuantityTypeIdentifierActiveEnergyBurned", unit: "kcal", agg: "sum" },
  { type: "HKQuantityTypeIdentifierBasalEnergyBurned", unit: "kcal", agg: "sum" },
  { type: "HKQuantityTypeIdentifierAppleExerciseTime", unit: "min", agg: "sum" },
  // Stored as hours; HealthKit reports minutes.
  { type: "HKQuantityTypeIdentifierAppleStandTime", unit: "min", agg: "sum", scale: 1 / 60 },
  // ---- composition (whatever the athlete's scale writes into Health) -----
  { type: "HKQuantityTypeIdentifierBodyMass", unit: "kg", agg: "mean" },
  { type: "HKQuantityTypeIdentifierBodyFatPercentage", unit: "%", agg: "mean", percent: true },
  { type: "HKQuantityTypeIdentifierLeanBodyMass", unit: "kg", agg: "mean" },
];

/** Everything the daily relay needs permission for. */
const DAILY_READ_TYPES = [
  "HKCategoryTypeIdentifierSleepAnalysis",
  ...DAILY_READS.map((r) => r.type),
] as const;

/** How far back the history walk will go. Ten years is longer than the iPhone
 *  has had a Health app for most people, and reaching the end is detected
 *  anyway — this is the backstop, not the plan. */
const HISTORY_FLOOR_DAYS = 3650;
/** One chunk of history per pass. 180 days of ~17 metrics is a few thousand
 *  daily samples — a payload measured in tens of kilobytes, not megabytes. */
const HISTORY_CHUNK_DAYS = 180;
/** Chunks per sync. Two keeps a full ten-year backfill inside about ten
 *  foregrounds without ever making one sync feel like a download. */
const HISTORY_CHUNKS_PER_SYNC = 2;
/** How many consecutive empty chunks mean we have reached the beginning of this
 *  athlete's Health data. Two, not one: a person can have a gap. */
const HISTORY_EMPTY_STOP = 2;
/** How far back the RECENT window reaches on every sync — the freshness pass,
 *  run whether or not the history walk is finished. */
const RECENT_DAYS = 30;

const HISTORY_CURSOR_KEY = "hybrid.healthkit.historyDaysDone";
const HISTORY_EMPTY_KEY = "hybrid.healthkit.historyEmptyRuns";

/** One quantity type over one window → daily samples, or [] on any failure.
 *  Every read degrades ALONE: one unreadable metric must never sink a sync
 *  carrying sixteen others. */
async function readDaily(
  hk: HK,
  r: (typeof DAILY_READS)[number],
  filter: { date: { startDate: Date; endDate: Date } },
): Promise<RelaySample[]> {
  try {
    const xs = await hk.queryQuantitySamples(r.type, { limit: 0, unit: r.unit as never, filter });
    const readings: Reading[] = [];
    for (const x of xs) {
      let v = x.quantity;
      if (!Number.isFinite(v)) continue;
      // A fraction where a percentage is meant. Detected rather than assumed:
      // Apple's percent unit is 0..1, but a third-party source writing through
      // HealthKit may well store 98, and blindly multiplying that gives 9 800 —
      // out of bounds, and the metric disappears with no error to find.
      if (r.percent && v <= 1) v *= 100;
      if (r.scale) v *= r.scale;
      readings.push({ value: v, start: iso(x.startDate), end: iso(x.endDate) });
    }
    return r.agg === "sum" ? dailySum(readings, r.type) : dailyMean(readings, r.type);
  } catch {
    return [];
  }
}

/** Everything readable in one window, as relay samples. */
async function readWindow(hk: HK, startDate: Date, endDate: Date): Promise<RelaySample[]> {
  return nativeSpan(
    "signals",
    async () => {
      const filter = { date: { startDate, endDate } };
      const quantities = await Promise.all(DAILY_READS.map((r) => readDaily(hk, r, filter)));
      const sleep = await hk
        .queryCategorySamples("HKCategoryTypeIdentifierSleepAnalysis", { limit: 0, filter })
        .then((xs) => xs.map((s) => ({ value: s.value as number, start: iso(s.startDate), end: iso(s.endDate) })))
        .catch(() => [] as Reading[]);
      return [...quantities.flat(), ...nightlySleep(sleep)];
    },
    [] as RelaySample[],
  );
}

/** POST one batch to the relay. Returns the rows the server wrote, or null when
 *  the network failed — the caller distinguishes "nothing new" (0, the normal
 *  case for an already-synced day) from "did not happen". */
async function relay(samples: RelaySample[]): Promise<number | null> {
  if (samples.length === 0) return 0;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/connect/apple/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ samples }),
    });
    if (!res.ok) return null;
    const d = (await res.json().catch(() => ({}))) as { written?: number };
    return d.written ?? 0;
  } catch {
    return null;
  }
}

/**
 * WALK BACKWARDS THROUGH THE ATHLETE'S WHOLE HISTORY, one chunk per sync.
 *
 * The relay only ever read the last 30 days, so an athlete who had worn a watch
 * for five years handed us a month of it and we threw the rest away — and there
 * is no second chance at somebody's past unless it is fetched from the phone
 * that already holds it.
 *
 * RESUMABLE BY CONSTRUCTION, because it must survive being killed mid-way: the
 * cursor is how many days back we have reached, kept on the device, and every
 * batch is idempotent server-side (Signal is unique on user + kind + timestamp +
 * source, so re-sending a day writes nothing). A failed chunk simply is not
 * advanced past, and the next foreground retries it.
 *
 * It STOPS ON ITS OWN when two consecutive chunks come back empty — that is the
 * beginning of this person's Health data, and grinding on to the ten-year floor
 * afterwards would be ten pointless queries per sync forever.
 */
async function walkHistory(hk: HK): Promise<number> {
  let done = Number((await AsyncStorage.getItem(HISTORY_CURSOR_KEY).catch(() => null)) ?? RECENT_DAYS);
  if (!Number.isFinite(done) || done < RECENT_DAYS) done = RECENT_DAYS;
  let empty = Number((await AsyncStorage.getItem(HISTORY_EMPTY_KEY).catch(() => null)) ?? 0);
  if (!Number.isFinite(empty) || empty < 0) empty = 0;
  if (done >= HISTORY_FLOOR_DAYS || empty >= HISTORY_EMPTY_STOP) return 0;

  let written = 0;
  for (let i = 0; i < HISTORY_CHUNKS_PER_SYNC && done < HISTORY_FLOOR_DAYS && empty < HISTORY_EMPTY_STOP; i++) {
    const from = Math.min(HISTORY_FLOOR_DAYS, done + HISTORY_CHUNK_DAYS);
    const samples = await readWindow(
      hk,
      new Date(Date.now() - from * 86400000),
      new Date(Date.now() - done * 86400000),
    );
    const n = await relay(samples);
    // A network failure does NOT advance the cursor: the chunk is retried next
    // time rather than silently skipped, which would leave a hole nobody could
    // see and nothing would ever go back for.
    if (n == null) break;
    written += n;
    empty = samples.length === 0 ? empty + 1 : 0;
    done = from;
    await AsyncStorage.setItem(HISTORY_CURSOR_KEY, String(done)).catch(() => {});
    await AsyncStorage.setItem(HISTORY_EMPTY_KEY, String(empty)).catch(() => {});
  }
  return written;
}

/**
 * THE SYNC — everything the device holds, into the database.
 *
 * Four passes, each degrading on its own so one failure never costs the others:
 *
 *  1. REPAIR the already-matched workouts (refreshMatchedWorkouts) — a re-sync
 *     mends the history, not only the next match.
 *  2. BACKFILL the streams of sessions matched before streams were stored.
 *  3. RELAY the recent window, every time, so today is always fresh.
 *  4. WALK one more chunk of the athlete's older history.
 *
 * `written` counts Signal rows the server actually created; already-synced days
 * dedupe to 0, which is the normal steady state and not a failure.
 */
export async function syncHealthKit(): Promise<{
  ok: boolean;
  written: number;
  repaired: number;
  /** Sessions whose recording was fetched and stored by this pass. */
  streamed: number;
  error?: "unavailable" | "network";
}> {
  const hk = loadHealthKit();
  if (!hk) return { ok: false, written: 0, repaired: 0, streamed: 0, error: "unavailable" };

  const { repaired } = await refreshMatchedWorkouts().catch(() => ({ repaired: 0 }));
  const streamed = await backfillWorkoutStreams().catch(() => 0);

  const recent = await relay(
    await readWindow(hk, new Date(Date.now() - RECENT_DAYS * 86400000), new Date()),
  );
  if (recent == null) return { ok: false, written: 0, repaired, streamed, error: "network" };

  const older = await walkHistory(hk).catch(() => 0);
  await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()).catch(() => {});
  return { ok: true, written: recent + older, repaired, streamed };
}

/** True while there is still older history left to fetch — for a settings row
 *  that wants to say "still importing your history" rather than leaving an
 *  athlete wondering why five years showed up over a week. */
export async function healthKitHistoryPending(): Promise<boolean> {
  try {
    const done = Number((await AsyncStorage.getItem(HISTORY_CURSOR_KEY)) ?? RECENT_DAYS);
    const empty = Number((await AsyncStorage.getItem(HISTORY_EMPTY_KEY)) ?? 0);
    return done < HISTORY_FLOOR_DAYS && empty < HISTORY_EMPTY_STOP;
  } catch {
    return false;
  }
}

// ---- the recording itself: streams, route, laps ---------------------------

/**
 * THE PART OF A RECORDING A SUMMARY THROWS AWAY.
 *
 * `readWorkout` above produces a DeviceWorkout — duration, distance, kcal,
 * average and peak heart rate. Every app with a HealthKit entitlement reads
 * those same eleven numbers; they are a commodity. What is not is the shape
 * underneath: where the heart rate went and when, the GPS track, the laps the
 * athlete pressed, and the cumulative distance series every split and best
 * effort falls out of.
 *
 * ONLY THE PHONE CAN READ IT, and only while the recording is still in the
 * store. So the read happens at match time and is uploaded with the match; a
 * recording that was never read is one the athlete would have to re-import by
 * hand. Everything below degrades per series — a workout with a good heart-rate
 * trace and a broken GPS track must still land the heart rate.
 *
 * The shapes are @hybrid/core's (session-streams.ts): nothing HealthKit-specific
 * crosses this file's boundary, so a Garmin or WHOOP connector later fills the
 * same shape and the server, the database and both clients are unchanged.
 */

/** Bikes only. `cyclingPower` and `cyclingCadence` are what a power meter and a
 *  cadence sensor write; nothing else in HealthKit ever writes them. */
const CYCLING = /cycling|handCycling/i;

/**
 * The per-workout series worth reading, and the unit each is stored in. Kept
 * small on purpose: these are the ones the app derives something from.
 *
 * `when` is not an optimisation. Every entry here is a separate native query
 * against a separate HealthKit type, and the two cycling types are iOS 17
 * additions — asking a lift for its cycling power is a query that can only ever
 * come back empty, on the exact path the app has twice disappeared inside.
 */
const STREAM_READS: {
  kind: StreamKind;
  type: QuantityTypeIdentifier;
  unit: string;
  when: (rawActivity: string) => boolean;
}[] = [
  { kind: "hr", type: "HKQuantityTypeIdentifierHeartRate", unit: "count/min", when: () => true },
  { kind: "power", type: "HKQuantityTypeIdentifierCyclingPower", unit: "W", when: (a) => CYCLING.test(a) },
  { kind: "cadence", type: "HKQuantityTypeIdentifierCyclingCadence", unit: "count/min", when: (a) => CYCLING.test(a) },
];

/** The read permissions the stream read needs, on top of WORKOUT_READ_TYPES.
 *  A route lives behind its own type; power and cadence behind theirs. */
const STREAM_READ_TYPES = [
  "HKWorkoutRouteTypeIdentifier",
  "HKQuantityTypeIdentifierCyclingPower",
  "HKQuantityTypeIdentifierCyclingCadence",
] as const;

/** Seconds from `t0`, floored — the offset the stored streams are keyed on. */
const offsetSec = (d: Date | string, t0: number): number | null => {
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? Math.floor((t - t0) / 1000) : null;
};

/** One quantity type over one workout → a stream, or null when the store has
 *  nothing (a ride with no power meter, a lift with no strap). */
async function readQuantityStream(
  hk: HK,
  w: WorkoutProxyLike,
  read: (typeof STREAM_READS)[number],
  t0: number,
  uuid: string,
): Promise<SessionStream | null> {
  let samples: readonly { quantity: number; startDate: Date; endDate: Date }[];
  try {
    samples = await hk.queryQuantitySamples(read.type, {
      // The workout filter is what makes this the workout's OWN heart rate
      // rather than every beat in the day around it.
      //
      // The two casts are the library's generics, not looseness on our side:
      // the filter is typed for the untyped `WorkoutProxy` while a query hands
      // back the `WorkoutProxyTyped` flavour (they differ only in how metadata
      // is typed), and `unit` is narrowed per-identifier — which a table of
      // three identifiers can't satisfy at the call site. The unit strings are
      // pinned beside their identifiers in STREAM_READS above.
      filter: { workout: w as never },
      limit: 0,
      ascending: true,
      unit: read.unit as never,
    });
  } catch {
    return null;
  }
  const offsets: number[] = [];
  const values: number[] = [];
  for (const s of samples) {
    // A quantity sample spans an interval; the value belongs at its END, which
    // is when the reading was complete. Beat-to-beat samples make this a
    // distinction without a difference; a 10-second averaged power sample makes
    // it the difference between a lap boundary landing right and landing early.
    const at = offsetSec(s.endDate, t0);
    if (at == null || !Number.isFinite(s.quantity)) continue;
    offsets.push(at);
    values.push(s.quantity);
  }
  if (offsets.length < 2) return null;
  return sanitizeSessionStream({
    kind: read.kind,
    startedAt: new Date(t0).toISOString(),
    offsets,
    values,
    provider: "apple",
    uuid,
  });
}

/**
 * THE ROUTE, and the two streams that fall out of it.
 *
 * HealthKit stores a workout route as CLLocations — latitude, longitude,
 * altitude, speed — and nothing else. The cumulative distance series (which
 * every split and best effort is computed from) is not stored anywhere: it is
 * integrated here, from the great-circle distance between consecutive fixes.
 *
 * INACCURATE FIXES ARE SKIPPED, not smoothed. A GPS fix with a 65-metre
 * horizontal accuracy in a city street is a jump sideways into the next block,
 * and integrating it adds distance the athlete never ran — which would make
 * every split and every "best 5 km" derived from it flatteringly fast. Dropping
 * the fix loses a moment of the track; keeping it loses the truth of the figure.
 */
const MAX_FIX_ACCURACY_M = 50;

/** Great-circle distance between two fixes, km (haversine). */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function readRouteStreams(
  w: WorkoutProxyLike,
  t0: number,
  uuid: string,
): Promise<SessionStream[]> {
  let routes: readonly { locations: readonly RouteLocationLike[] }[];
  try {
    routes = await w.getWorkoutRoutes();
  } catch {
    return [];
  }
  const fixes = routes
    .flatMap((r) => [...r.locations])
    .map((l) => ({ ...l, at: offsetSec(l.date, t0) }))
    .filter((l) => l.at != null && Number.isFinite(l.latitude) && Number.isFinite(l.longitude))
    .sort((a, b) => a.at! - b.at!);
  if (fixes.length < 2) return [];

  const routeOffsets: number[] = [];
  const lat: number[] = [];
  const lng: number[] = [];
  const distOffsets: number[] = [];
  const dist: number[] = [];
  const altOffsets: number[] = [];
  const alt: number[] = [];
  let km = 0;
  let prev: (typeof fixes)[number] | null = null;
  for (const f of fixes) {
    const usable =
      !Number.isFinite(f.horizontalAccuracy) || f.horizontalAccuracy <= MAX_FIX_ACCURACY_M;
    if (!usable) continue;
    if (prev) km += haversineKm(prev.latitude, prev.longitude, f.latitude, f.longitude);
    routeOffsets.push(f.at!);
    lat.push(f.latitude);
    lng.push(f.longitude);
    distOffsets.push(f.at!);
    dist.push(km);
    if (Number.isFinite(f.altitude)) {
      altOffsets.push(f.at!);
      alt.push(f.altitude);
    }
    prev = f;
  }

  const startedAt = new Date(t0).toISOString();
  const base = { startedAt, provider: "apple", uuid };
  return [
    sanitizeSessionStream({ ...base, kind: "route", offsets: routeOffsets, values: lat, valuesB: lng }),
    sanitizeSessionStream({ ...base, kind: "distance", offsets: distOffsets, values: dist }),
    sanitizeSessionStream({ ...base, kind: "altitude", offsets: altOffsets, values: alt }),
  ].filter((s): s is SessionStream => s != null);
}

/**
 * The laps the DEVICE recorded — the button presses, and the legs of a
 * multi-sport recording.
 *
 * HealthKit gives lap MARKERS (instants), not lap objects, so a lap's duration
 * is the gap to the next marker and the last lap runs to the end of the
 * workout. Segments arrive as `activities` and already carry their own
 * interval. The splits and best efforts are NOT computed here — the server
 * derives those from the distance series when the upload lands, so the rule
 * lives in one place rather than in every client that can read a watch.
 */
function readDeviceLaps(w: WorkoutProxyLike, t0: number, endSec: number): SessionLap[] {
  const out: SessionLap[] = [];
  const lap = (kind: "lap" | "segment", index: number, from: number, to: number): SessionLap => ({
    kind,
    index,
    startOffsetSec: from,
    durationSec: Math.max(0, to - from),
    distanceKm: null,
    avgHr: null,
    maxHr: null,
    avgWatts: null,
    elevationM: null,
    paceSecPerKm: null,
  });

  try {
    // WorkoutEventType.lap === 3, marker === 4 — a watch writes one or the
    // other depending on how the lap was taken.
    const marks = (w.events ?? [])
      .filter((e) => (e.type as unknown as number) === 3 || (e.type as unknown as number) === 4)
      .map((e) => offsetSec(e.startDate, t0))
      .filter((s): s is number => s != null && s >= 0)
      .sort((a, b) => a - b);
    marks.forEach((from, i) => {
      const to = i + 1 < marks.length ? marks[i + 1]! : endSec;
      if (to > from) out.push(lap("lap", i, from, to));
    });
  } catch {
    // A proxy that won't hand over its events costs the laps, not the upload.
  }

  try {
    const acts = [...(w.activities ?? [])];
    if (acts.length > 1)
      acts.forEach((a, i) => {
        const from = offsetSec(a.startDate, t0);
        const to = offsetSec(a.endDate, t0);
        if (from != null && to != null && to > from) out.push(lap("segment", i, from, to));
      });
  } catch {
    // Same.
  }
  return out;
}

/**
 * Read everything one recording holds beyond its summary, by the store's own
 * uuid — the id already carried on `Session.device`, so a match, an import and
 * a repair pass all address the same recording the same way.
 *
 * Null when HealthKit is unreachable or the store no longer holds the workout
 * (deleted on the watch); `{ streams: [] }` when it holds it and there was
 * nothing underneath (a gym session with no strap and no GPS).
 *
 * THE ONE READ THE APP IS WILLING TO GIVE UP, and the one it has twice been
 * closed inside. Three rules follow from that, and they are the shape of this
 * function:
 *
 *  1. IT NEVER ASKS FOR ANYTHING. If the route and cycling types have not been
 *     put to the store by a deliberate tap (`requestStreamReadAuth`), this
 *     reads nothing and says so. A permission sheet raised from a read path is
 *     what the last two builds did, and the app went both times.
 *  2. THE SPANS ARE SEPARATE AND SEQUENTIAL. The sample series and the route
 *     query are different native calls with different failure modes, and running
 *     them under one name (or under `Promise.all`) is why "it died in streams"
 *     was as much as the last build could say. Each is marked on its own, so a
 *     marker left on disk names the CALL; and each is quarantined on its own, so
 *     a route query that takes the process does not also cost the heart rate.
 *  3. NOTHING UNATTENDED GETS HERE FIRST. See `streamsProven` — until one read
 *     has completed in front of the athlete who asked for it, no sync and no
 *     import comes down this path.
 *
 * A missing heart-rate trace costs a chart. Being thrown out of the app costs
 * the import, the rating that follows it, and the athlete's belief that the
 * thing works.
 */
export async function readWorkoutStreams(
  uuid: string,
): Promise<{ streams: SessionStream[]; laps: SessionLap[]; activityLabel: string } | null> {
  const hk = loadHealthKit();
  if (!hk || !uuid) return null;
  // Both sets, because this reads the workout and its heart rate as well as the
  // series behind the stream types.
  if (!(await storeHasAsked(hk, WORKOUT_READ_TYPES))) return null;
  if (!(await storeHasAsked(hk, STREAM_READ_TYPES))) return null;

  const w = await nativeSpan(
    "stream-read",
    async () => {
      try {
        return (await hk.queryWorkoutSamples({ limit: 1, filter: { uuid } }))[0] ?? null;
      } catch {
        return null;
      }
    },
    null,
    { optional: true },
  );
  if (!w) return null;

  const start = isoOrNull(w.startDate);
  const end = isoOrNull(w.endDate);
  if (!start || !end) return null;
  const t0 = Date.parse(start);
  const endSec = Math.max(0, Math.round((Date.parse(end) - t0) / 1000));
  const rawActivity = activityRawName(hk, w.workoutActivityType as unknown as number);

  // The sample series, under their own span. Sequential with the route below,
  // not parallel: two native calls in flight at once share one marker, and a
  // marker that can name either of two calls names neither.
  const quantities = await nativeSpan(
    "stream-read",
    async () => {
      const out: (SessionStream | null)[] = [];
      // Only what this recording can HAVE. A lift has no cycling power, and
      // asking for one is a query against a type this athlete may never have
      // written a sample of — cost with no possible return.
      for (const r of STREAM_READS.filter((s) => s.when(rawActivity)))
        out.push(await readQuantityStream(hk, w, r, t0, uuid).catch(() => null));
      return out;
    },
    [] as (SessionStream | null)[],
    { optional: true },
  );

  const route = await nativeSpan(
    "stream-route",
    () => readRouteStreams(w, t0, uuid).catch(() => [] as SessionStream[]),
    [] as SessionStream[],
    { optional: true },
  );

  return {
    streams: [...quantities.filter((s): s is SessionStream => s != null), ...route],
    laps: readDeviceLaps(w, t0, endSec),
    activityLabel: activityLabel(hk, w.workoutActivityType as unknown as number),
  };
}

/**
 * HAS THIS DEVICE EVER COME BACK FROM A TRACE READ.
 *
 * The unattended passes (the sync's backfill, an auto-import) ask this before
 * going anywhere near `readWorkoutStreams`. It is set by the first read that
 * completes — which, by construction, is one an athlete asked for while looking
 * at the app.
 *
 * The asymmetry is deliberate and it is the whole point: a crash in front of
 * somebody who just tapped "get the full recording" is a feature that didn't
 * work, and they can tell us. The same crash on the tail of an import, or on a
 * foreground sync, is the app closing for no reason anybody can name — which is
 * exactly the report that took two builds to place.
 */
export async function streamsProven(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STREAMS_PROVEN_KEY)) === "1";
  } catch {
    return false;
  }
}

/**
 * Read a recording's streams and upload them against a session. Best-effort and
 * fire-and-forget by design: the match itself is already saved, and a failed
 * stream upload must never look like a failed match. Returns what landed.
 *
 * Coming back from here AT ALL is the thing worth recording — not whether the
 * store held a trace. A gym session with no strap and no GPS has nothing to
 * upload and still proves the read is survivable on this phone.
 */
export async function uploadWorkoutStreams(
  sessionId: string,
  uuid: string,
): Promise<{ streams: number; laps: number }> {
  const read = await readWorkoutStreams(uuid).catch(() => null);
  if (!read) return { streams: 0, laps: 0 };
  await AsyncStorage.setItem(STREAMS_PROVEN_KEY, "1").catch(() => {});
  if (read.streams.length === 0) return { streams: 0, laps: 0 };
  return postSessionStreams(sessionId, read);
}

/**
 * Upload the streams for a batch of rows an import just landed.
 *
 * The import writes SUMMARIES — that is all the server was handed. The trace
 * under each one is still on this device and nowhere else. Sequential rather
 * than parallel: a fortnight of runs is a fortnight of GPS tracks, and firing
 * twenty uploads at once off a phone on a train is how a sync ends up worse
 * than no sync.
 *
 * NO LONGER FIRED BY THE IMPORT ITSELF. It used to run unawaited on the tail of
 * every import, which is where an athlete lost the app twice: the sessions had
 * landed, the rating question was on screen, and the process went. The import is
 * done when the summaries are in the log; this is a second, separate thing an
 * athlete asks for (see the trace row on the import sheet), and it may only run
 * on its own once such a read has been seen to return (`streamsProven`).
 *
 * Best-effort throughout — the sessions are already saved, and a row whose
 * recording the store no longer holds is simply skipped. Returns how many rows
 * actually landed streams.
 */
export async function uploadLandedStreams(
  landed: { id: string; uuid?: string | null }[],
  max = 20,
): Promise<number> {
  if (healthKitAvailability() !== "ready") return 0;
  let done = 0;
  for (const row of landed.slice(0, max)) {
    if (!row.uuid) continue;
    const res = await uploadWorkoutStreams(row.id, row.uuid).catch(() => ({ streams: 0, laps: 0 }));
    if (res.streams > 0) done += 1;
  }
  return done;
}

/**
 * THE STREAMS OF WORKOUTS MATCHED BEFORE STREAMS WERE STORED.
 *
 * Every session matched or imported before this feature existed carries a
 * summary and nothing underneath — the trace was never asked for. It is
 * usually still on THIS phone: Apple Health keeps the recording, and the
 * session stores the store's own id for it, so the whole history can be walked
 * by uuid exactly as `refreshMatchedWorkouts` walks it to repair summaries.
 *
 * Which makes this a one-time catch-up, not a permanent cost. The skip list
 * comes from the server (`fetchStreamedSessionIds`), so a session is read once
 * and never again, and the pass goes quiet as soon as the backlog is cleared.
 *
 * BOUNDED AND SEQUENTIAL, because it is the most expensive thing in the sync: a
 * GPS track is thousands of fixes to read and tens of kilobytes to upload.
 * `MAX_BACKFILL_PER_SYNC` sessions per foreground works through years of
 * history over a few days of ordinary use without ever making one sync feel
 * like a download — and firing them in parallel off a phone on a train is how a
 * sync ends up worse than no sync.
 *
 * Best-effort throughout: a recording the store no longer holds is skipped, and
 * nothing here can fail the sync it rides along with.
 */
const MAX_BACKFILL_PER_SYNC = 12;

export async function backfillWorkoutStreams(max = MAX_BACKFILL_PER_SYNC): Promise<number> {
  if (healthKitAvailability() !== "ready") return 0;
  // The unattended gate. This pass runs on a foreground with nobody looking at
  // it, so it is the LAST place that should meet a native call for the first
  // time: until one trace read has returned in front of an athlete who asked
  // for it, the backlog waits. It costs a delay on a feature nobody has opted
  // into yet; the alternative cost is the app closing on app open.
  if (!(await streamsProven())) return 0;
  if (!(await streamReadGranted())) return 0;
  let pending: { id: string; uuid: string }[];
  try {
    // The RECORDINGS index, not the History list: History returns the fifty most
    // recent sessions, so a work-list built from it would stop at fifty and an
    // athlete's older traces would never be fetched however often they synced.
    pending = (await fetchSessionRecordings())
      .filter((r) => !r.streamed && r.provider === "apple")
      .map((r) => ({ id: r.id, uuid: r.uuid }));
  } catch {
    return 0;
  }
  if (pending.length === 0) return 0;

  let done = 0;
  for (const row of pending.slice(0, max)) {
    const res = await uploadWorkoutStreams(row.id, row.uuid).catch(() => ({ streams: 0, laps: 0 }));
    if (res.streams > 0) done += 1;
  }
  return done;
}
