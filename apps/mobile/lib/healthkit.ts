/**
 * Apple Health (HealthKit) bridge — the native half of the `apple` connector.
 *
 * Deliberately ISOLATED: everything HealthKit-specific on the client lives in
 * this one file. The rest of the app only sees the small async API below, and
 * every entry point degrades gracefully when the native module isn't in the
 * binary (Expo Go, Android, web preview) — so pulling the `react-native-health`
 * dependency back out reverts the feature without touching any other screen.
 *
 * Data path (the same "Switzerland" rule as every provider): read HRV /
 * resting HR / sleep from HealthKit on-device → aggregate per day → POST the
 * samples to the EXISTING /api/connect/apple/sync relay, where @hybrid/core's
 * parseHealthKit normalizes them into Signal rows (deduped by the
 * userId+kind+ts+source unique index). The engines never learn HealthKit exists.
 */
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AppleHealthKit, { type HealthKitPermissions, type HealthValue } from "react-native-health";
import { supabase } from "./supabase";
import { fetchWithTimeout } from "./fetch";
import { API_BASE } from "./api";

// Apple doesn't expose whether Health *read* access was actually granted (a
// denial is indistinguishable from "no data" by design), so "connected" is a
// local flag set when the permission sheet completes. lastSync mirrors the
// server's Connection.lastSyncAt for instant display.
const CONNECTED_KEY = "hybrid.healthkit.connected";
const LAST_SYNC_KEY = "hybrid.healthkit.lastSync";

export type HealthKitAvailability = "ready" | "no-module" | "wrong-platform";

/** Whether this binary can talk to HealthKit at all. "no-module" means iOS but
 *  the native module isn't compiled in (Expo Go / a build predating it). */
export function healthKitAvailability(): HealthKitAvailability {
  if (Platform.OS !== "ios") return "wrong-platform";
  // In a binary without the native module, react-native-health still imports
  // fine but exports only its JS constants — no methods.
  return typeof (AppleHealthKit as { initHealthKit?: unknown }).initHealthKit === "function"
    ? "ready"
    : "no-module";
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
  if (healthKitAvailability() !== "ready") return { ok: false, error: "unavailable" };
  const P = AppleHealthKit.Constants?.Permissions;
  const permissions = {
    permissions: {
      read: [
        P?.HeartRateVariability ?? "HeartRateVariability",
        P?.RestingHeartRate ?? "RestingHeartRate",
        P?.SleepAnalysis ?? "SleepAnalysis",
      ],
      write: [],
    },
  } as HealthKitPermissions;
  const granted = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    try {
      AppleHealthKit.initHealthKit(permissions, (error: string) =>
        resolve(error ? { ok: false, error } : { ok: true }),
      );
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
  if (!granted.ok) return granted;
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

type SampleQuery = (
  options: { startDate: string; endDate: string; ascending?: boolean },
  callback: (err: string, results: HealthValue[]) => void,
) => void;

/** Promisified sample query that resolves [] on any error, so one unreadable
 *  metric never sinks the whole sync. */
function query(fn: SampleQuery, options: { startDate: string; endDate: string }): Promise<HealthValue[]> {
  return new Promise((resolve) => {
    try {
      fn.call(AppleHealthKit, { ...options, ascending: true }, (err, results) =>
        resolve(err || !Array.isArray(results) ? [] : results),
      );
    } catch {
      resolve([]);
    }
  });
}

/** The relay shape parseHealthKit consumes: HK type identifier + value + end. */
export type RelaySample = { type: string; value: number; end: string };

const localDay = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** One sample per local day: mean of the day's readings (× scale), stamped with
 *  the day's LATEST sample end. A re-sync with unchanged data reproduces the
 *  identical (ts, value) → deduped server-side; new readings later the same day
 *  move the ts, so the fresher aggregate lands as the day's latest row. */
function dailyMean(samples: HealthValue[], type: string, scale: number): RelaySample[] {
  const byDay = new Map<string, { sum: number; n: number; end: string }>();
  for (const s of samples) {
    if (typeof s.value !== "number" || !Number.isFinite(s.value) || !s.endDate) continue;
    const day = localDay(s.endDate);
    const cur = byDay.get(day) ?? { sum: 0, n: 0, end: s.endDate };
    cur.sum += s.value;
    cur.n += 1;
    if (s.endDate > cur.end) cur.end = s.endDate;
    byDay.set(day, cur);
  }
  return [...byDay.values()].map((d) => ({
    type,
    value: Math.round((d.sum / d.n) * scale * 100) / 100,
    end: d.end,
  }));
}

// Sleep segments that count as actually asleep (react-native-health surfaces
// the stage name as the sample's value; INBED/AWAKE are excluded).
const ASLEEP_STAGES = new Set(["ASLEEP", "CORE", "DEEP", "REM"]);

/** Sum asleep-stage segment durations into hours per night, attributed to the
 *  local day the sleep ENDED on (a 23:00→07:00 night belongs to the wake day). */
function nightlySleep(samples: HealthValue[]): RelaySample[] {
  const byDay = new Map<string, { hours: number; end: string }>();
  for (const s of samples) {
    // Sleep is a category sample: its value is the stage name, not a number.
    const stage = String((s as { value: unknown }).value ?? "").toUpperCase();
    if (!ASLEEP_STAGES.has(stage) || !s.startDate || !s.endDate) continue;
    const ms = Date.parse(s.endDate) - Date.parse(s.startDate);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    const day = localDay(s.endDate);
    const cur = byDay.get(day) ?? { hours: 0, end: s.endDate };
    cur.hours += ms / 3600000;
    if (s.endDate > cur.end) cur.end = s.endDate;
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
  if (healthKitAvailability() !== "ready") return { ok: false, written: 0, error: "unavailable" };
  const options = {
    startDate: new Date(Date.now() - 30 * 86400000).toISOString(),
    endDate: new Date().toISOString(),
  };
  const [hrv, rhr, sleep] = await Promise.all([
    query(AppleHealthKit.getHeartRateVariabilitySamples, options),
    query(AppleHealthKit.getRestingHeartRateSamples, options),
    query(AppleHealthKit.getSleepSamples, options),
  ]);
  const samples: RelaySample[] = [
    // HealthKit reports SDNN in SECONDS; the Signal ontology stores hrv in ms.
    ...dailyMean(hrv, "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", 1000),
    ...dailyMean(rhr, "HKQuantityTypeIdentifierRestingHeartRate", 1),
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
