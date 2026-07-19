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
import { supabase } from "./supabase";
import { fetchWithTimeout } from "./fetch";
import { API_BASE } from "./api";

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

/** Read the last 30 days of HRV / resting HR / sleep from HealthKit and relay
 *  them to the backend. Returns how many Signal rows the server wrote (already-
 *  synced days dedupe to 0 — that's normal, not a failure). */
export async function syncHealthKit(): Promise<{ ok: boolean; written: number; error?: "unavailable" | "network" }> {
  const hk = loadHealthKit();
  if (!hk) return { ok: false, written: 0, error: "unavailable" };

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
    if (!res.ok) return { ok: false, written: 0, error: "network" };
    const d = (await res.json().catch(() => ({}))) as { written?: number };
    await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()).catch(() => {});
    return { ok: true, written: d.written ?? 0 };
  } catch {
    return { ok: false, written: 0, error: "network" };
  }
}
