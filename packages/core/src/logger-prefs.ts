// Workout-logger preferences — one source of truth for the configurable logger
// (mobile live workout + web logger/builder). Pure defaults + a normalizer; each
// client persists the value per-device (AsyncStorage / localStorage) and reads
// it through a small store. Settings most users never touch default to today's
// hardcoded behavior, so nothing changes until they opt in.

import { sanitizeLandmarkOverrides, type LandmarkOverrides } from "./engines/landmarks";
import type { WeightUnit } from "./units";

export interface LoggerPrefs {
  /** Detailed shows the RPE (and on web, velocity) column; Simple is load × reps. */
  detailed: boolean;
  /** Show the 5→1→GO get-ready count-in before a fresh workout (mobile). */
  countIn: boolean;
  /** Keep the screen awake while logging (mobile). */
  keepAwake: boolean;
  /** Haptic feedback on banking a set / rest done (mobile). */
  haptics: boolean;
  /** Carry the previous set's load/reps into a newly added set. */
  carryOver: boolean;
  /** Auto rest countdown after banking a set (mobile). */
  restTimer: boolean;
  /** Default rest-countdown target, seconds. */
  restSeconds: number;
  /** After banking a set, auto-append the next set (mobile live logger). */
  autoAdvance: boolean;
  /** What the "Start workout" hero opens with. */
  defaultStart: "empty" | "ai" | "last";
  /** Show the effort column as RIR (reps-in-reserve) instead of RPE. Stored as
   *  RPE under the hood (RIR = 10 − RPE), so the engines are unaffected. */
  rpeAsRir: boolean;
  /** Weight unit for display + input. Storage stays kg regardless. */
  units: WeightUnit;
  /** Show a barbell plates-per-side hint under each strength exercise. */
  plateCalc: boolean;
  /** Quick +/- load stepper increment, in the DISPLAY unit (0 = off). */
  quickIncrement: number;
  /** Count warm-up & cool-down sets toward working VOLUME (off = exclude them,
   *  the default). PRs/e1RM stay warm-up-excluded regardless. */
  countWarmupsInVolume: boolean;
  /** Weight a movement's secondary muscles at 0.5 sets (vs 1.0) for volume. */
  fractionalVolume: boolean;
  /** Per-muscle overrides of the default volume landmarks (empty = use defaults). */
  landmarkOverrides: LandmarkOverrides;
}

export const DEFAULT_LOGGER_PREFS: LoggerPrefs = {
  detailed: true,
  countIn: true,
  keepAwake: true,
  haptics: true,
  carryOver: true,
  restTimer: true,
  restSeconds: 90,
  autoAdvance: false,
  defaultStart: "empty",
  rpeAsRir: false,
  units: "kg",
  plateCalc: false,
  quickIncrement: 0,
  countWarmupsInVolume: false,
  fractionalVolume: false,
  landmarkOverrides: {},
};

/** Allowed default-rest values (matches the in-workout presets). */
export const REST_SECONDS_CHOICES = [60, 90, 120, 180] as const;

/**
 * Convert between a stored RPE string and the value shown in the logger.
 * RIR = 10 − RPE (and back); the conversion is symmetric, so one function does
 * both display and input. Non-numeric / blank values pass through untouched.
 */
export function rpeRirSwap(value: string, asRir: boolean): string {
  if (!asRir) return value;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return value;
  return String(Math.max(0, Math.round((10 - n) * 10) / 10));
}

/**
 * Merge a partial / untrusted stored object onto the defaults, type-safe — so a
 * corrupt or older persisted value can never break the logger (unknown keys
 * dropped, wrong types fall back, restSeconds clamped to an allowed choice).
 */
export function normalizeLoggerPrefs(raw: unknown): LoggerPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
  const seconds =
    typeof r.restSeconds === "number" && (REST_SECONDS_CHOICES as readonly number[]).includes(r.restSeconds)
      ? r.restSeconds
      : DEFAULT_LOGGER_PREFS.restSeconds;
  return {
    detailed: bool(r.detailed, DEFAULT_LOGGER_PREFS.detailed),
    countIn: bool(r.countIn, DEFAULT_LOGGER_PREFS.countIn),
    keepAwake: bool(r.keepAwake, DEFAULT_LOGGER_PREFS.keepAwake),
    haptics: bool(r.haptics, DEFAULT_LOGGER_PREFS.haptics),
    carryOver: bool(r.carryOver, DEFAULT_LOGGER_PREFS.carryOver),
    restTimer: bool(r.restTimer, DEFAULT_LOGGER_PREFS.restTimer),
    restSeconds: seconds,
    autoAdvance: bool(r.autoAdvance, DEFAULT_LOGGER_PREFS.autoAdvance),
    defaultStart: r.defaultStart === "ai" || r.defaultStart === "last" ? r.defaultStart : "empty",
    rpeAsRir: bool(r.rpeAsRir, DEFAULT_LOGGER_PREFS.rpeAsRir),
    units: r.units === "lb" ? "lb" : "kg",
    plateCalc: bool(r.plateCalc, DEFAULT_LOGGER_PREFS.plateCalc),
    quickIncrement: typeof r.quickIncrement === "number" && r.quickIncrement > 0 ? r.quickIncrement : 0,
    countWarmupsInVolume: bool(r.countWarmupsInVolume, DEFAULT_LOGGER_PREFS.countWarmupsInVolume),
    fractionalVolume: bool(r.fractionalVolume, DEFAULT_LOGGER_PREFS.fractionalVolume),
    landmarkOverrides: sanitizeLandmarkOverrides(r.landmarkOverrides),
  };
}
