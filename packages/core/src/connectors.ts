/**
 * Wearable & sensor connectors — the "Switzerland" ingestion layer.
 *
 * Each provider is just an adapter that normalizes its payload into the Signal
 * ontology; the engines never learn a vendor exists. This module is the pure,
 * testable heart of that: provider specs + parsers that turn raw API/native
 * payloads into Signal[]. OAuth/token plumbing lives in the app (needs creds).
 */

import type { Signal, SignalKind } from "./engines/signals";
import { signalUnit } from "./engines/signals";

export type ProviderId =
  | "whoop"
  | "garmin"
  | "oura"
  | "polar"
  | "coros"
  | "apple"
  | "catapult";

export type ConnectorAuth = "oauth" | "native" | "team";

export interface ConnectorSpec {
  id: ProviderId;
  label: string;
  auth: ConnectorAuth;
  /** which Signal kinds this provider contributes */
  provides: SignalKind[];
  /** OAuth scopes to request (oauth providers only) */
  scopes?: string[];
}

/** The connector registry surfaced in the Connections hub. */
export const CONNECTORS: ConnectorSpec[] = [
  { id: "whoop", label: "WHOOP", auth: "oauth", provides: ["hrv", "restingHr", "sleep", "sleepScore"], scopes: ["read:recovery", "read:sleep", "read:cycles"] },
  { id: "oura", label: "Oura", auth: "oauth", provides: ["hrv", "restingHr", "sleep", "sleepScore"], scopes: ["daily"] },
  { id: "garmin", label: "Garmin", auth: "oauth", provides: ["hrv", "restingHr", "sleep", "totalDistance"], scopes: ["wellness"] },
  { id: "polar", label: "Polar", auth: "oauth", provides: ["hrv", "restingHr", "sleep"], scopes: ["accesslink.read_all"] },
  { id: "coros", label: "COROS", auth: "oauth", provides: ["hrv", "restingHr", "totalDistance"] },
  { id: "apple", label: "Apple Watch / Health", auth: "native", provides: ["hrv", "restingHr", "sleep"] },
  { id: "catapult", label: "Catapult GPS", auth: "team", provides: ["totalDistance", "highSpeedRunning", "accelLoad"] },
];

export function connectorSpec(id: ProviderId): ConnectorSpec | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

/** A normalized recovery reading any provider can be reduced to. */
export interface RecoveryReading {
  ts: string;
  hrv?: number | null;
  restingHr?: number | null;
  sleepH?: number | null;
  sleepScore?: number | null;
}

function push(out: Signal[], athleteId: string, source: ProviderId, ts: string, kind: SignalKind, value?: number | null) {
  if (typeof value === "number" && Number.isFinite(value))
    out.push({ athleteId, kind, value, unit: signalUnit(kind), source, ts });
}

/** Turn a normalized recovery reading into Signals. */
export function recoverySignals(athleteId: string, source: ProviderId, r: RecoveryReading): Signal[] {
  const out: Signal[] = [];
  push(out, athleteId, source, r.ts, "hrv", r.hrv);
  push(out, athleteId, source, r.ts, "restingHr", r.restingHr);
  push(out, athleteId, source, r.ts, "sleep", r.sleepH);
  push(out, athleteId, source, r.ts, "sleepScore", r.sleepScore);
  return out;
}

// ---- provider parsers (raw payload → Signal[]) --------------------------
// Loose input types: we read only the fields we map, defensively.

/** WHOOP v1 recovery + sleep records. */
export function parseWhoop(athleteId: string, raw: {
  records?: { created_at?: string; score?: { hrv_rmssd_milli?: number; resting_heart_rate?: number; sleep_performance_percentage?: number }; }[];
}): Signal[] {
  const out: Signal[] = [];
  for (const rec of raw.records ?? []) {
    out.push(
      ...recoverySignals(athleteId, "whoop", {
        ts: rec.created_at ?? new Date().toISOString(),
        hrv: rec.score?.hrv_rmssd_milli,
        restingHr: rec.score?.resting_heart_rate,
        sleepScore: rec.score?.sleep_performance_percentage,
      }),
    );
  }
  return out;
}

/** Oura daily readiness/sleep documents. */
export function parseOura(athleteId: string, raw: {
  data?: { day?: string; average_hrv?: number; lowest_heart_rate?: number; total_sleep_duration?: number; score?: number }[];
}): Signal[] {
  const out: Signal[] = [];
  for (const d of raw.data ?? []) {
    out.push(
      ...recoverySignals(athleteId, "oura", {
        ts: d.day ? `${d.day}T00:00:00.000Z` : new Date().toISOString(),
        hrv: d.average_hrv,
        restingHr: d.lowest_heart_rate,
        // Oura sleep duration is seconds → hours
        sleepH: typeof d.total_sleep_duration === "number" ? d.total_sleep_duration / 3600 : undefined,
        sleepScore: d.score,
      }),
    );
  }
  return out;
}

/** Apple HealthKit samples relayed from the native client. */
export function parseHealthKit(athleteId: string, raw: {
  samples?: { type?: string; value?: number; end?: string }[];
}): Signal[] {
  const out: Signal[] = [];
  const map: Record<string, SignalKind> = {
    HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
    HKQuantityTypeIdentifierRestingHeartRate: "restingHr",
    HKCategoryTypeIdentifierSleepAnalysis: "sleep",
  };
  for (const s of raw.samples ?? []) {
    const kind = s.type ? map[s.type] : undefined;
    if (!kind || typeof s.value !== "number") continue;
    push(out, athleteId, "apple", s.end ?? new Date().toISOString(), kind, s.value);
  }
  return out;
}
