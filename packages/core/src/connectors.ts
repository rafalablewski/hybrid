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

/**
 * Does the athlete have ANY live wearable/sensor connection? A revoked row is
 * history, not a connection. Shared so both clients decide identically whether
 * to prompt "connect a device" on a session summary — the prompt is only honest
 * when there is genuinely nothing feeding measured heart rate/energy in.
 */
export function hasActiveConnection(
  connections: { status?: string | null }[] | null | undefined,
): boolean {
  return !!connections?.some((c) => (c.status ?? "active") !== "revoked");
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
/**
 * EVERY HEALTHKIT TYPE THE RELAY UNDERSTANDS → the Signal kind it becomes.
 *
 * Exported because the PHONE has to read exactly what the server can store: the
 * native side asks HealthKit for these identifiers and the relay maps them
 * back, so one table keeps the two ends from drifting. Adding a metric is a
 * line here plus a `SignalKind` — nothing else.
 *
 * It started as three entries (HRV, resting HR, sleep) and everything else the
 * watch knew stayed on the watch: VO2 max, the body-composition readings a
 * smart scale writes, respiratory rate, blood oxygen, sleeping wrist
 * temperature, heart-rate recovery, and the daily activity totals. All of it
 * was already on the phone of anyone who had connected Apple Health.
 */
export const MAX_HEALTHKIT_SAMPLES = 20_000;

export const HEALTHKIT_SIGNAL_TYPES: Record<string, SignalKind> = {
  // ---- recovery ----------------------------------------------------------
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
  HKQuantityTypeIdentifierRestingHeartRate: "restingHr",
  HKCategoryTypeIdentifierSleepAnalysis: "sleep",
  HKQuantityTypeIdentifierRespiratoryRate: "respiratoryRate",
  HKQuantityTypeIdentifierOxygenSaturation: "spo2",
  HKQuantityTypeIdentifierAppleSleepingWristTemperature: "wristTemp",
  HKQuantityTypeIdentifierWalkingHeartRateAverage: "walkingHr",
  HKQuantityTypeIdentifierHeartRateRecoveryOneMinute: "heartRateRecovery",
  // ---- fitness -----------------------------------------------------------
  HKQuantityTypeIdentifierVO2Max: "vo2Max",
  // ---- daily activity ----------------------------------------------------
  HKQuantityTypeIdentifierStepCount: "steps",
  HKQuantityTypeIdentifierActiveEnergyBurned: "activeEnergy",
  HKQuantityTypeIdentifierBasalEnergyBurned: "restingEnergy",
  HKQuantityTypeIdentifierAppleExerciseTime: "exerciseMinutes",
  HKQuantityTypeIdentifierAppleStandTime: "standHours",
  // ---- composition (a smart scale writes these into Health) --------------
  HKQuantityTypeIdentifierBodyMass: "bodyMass",
  HKQuantityTypeIdentifierBodyFatPercentage: "bodyFat",
  HKQuantityTypeIdentifierLeanBodyMass: "leanMass",
};

export function parseHealthKit(athleteId: string, raw: {
  samples?: { type?: string; value?: number; end?: string }[];
}): Signal[] {
  const out: Signal[] = [];
  const map: Record<string, SignalKind> = HEALTHKIT_SIGNAL_TYPES;
  // Capped. The phone now relays the athlete's whole history in chunks rather
  // than one 30-day window, so this list is genuinely large — and a cap here is
  // what keeps a malformed or hostile body from becoming an unbounded write.
  // 20 000 daily samples is ~3 years of every metric in the table at once, far
  // above any chunk the client sends.
  for (const s of (raw.samples ?? []).slice(0, MAX_HEALTHKIT_SAMPLES)) {
    const kind = s.type ? map[s.type] : undefined;
    if (!kind || typeof s.value !== "number") continue;
    push(out, athleteId, "apple", s.end ?? new Date().toISOString(), kind, s.value);
  }
  return out;
}
