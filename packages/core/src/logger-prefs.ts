// Workout-logger preferences — one source of truth for the configurable logger
// (mobile live workout + web logger/builder). Pure defaults + a normalizer; each
// client persists the value per-device (AsyncStorage / localStorage) and reads
// it through a small store. Settings most users never touch default to today's
// hardcoded behavior, so nothing changes until they opt in.

import { sanitizeLandmarkOverrides, type LandmarkOverrides } from "./engines/landmarks";
import { sanitizeVolumeProfile, type AthleteVolumeProfile } from "./engines/landmark-profile";
import { resolveBlock, DEFAULT_BLOCK, type VolumeBlock } from "./engines/volume-block";
import type { WeightUnit } from "./units";

export interface LoggerPrefs {
  /** Detailed shows the RPE column; Simple is load × reps. */
  detailed: boolean;
  /** Show the M/S bar-velocity column (VBT logging). Off by default — only
   *  athletes who train with a velocity device want it on. */
  velocity: boolean;
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
  /** Fire a background notification when the rest countdown ends (mobile). */
  restNotify: boolean;
  /** Play a sound with the rest cue / notification (mobile). */
  restSound: boolean;
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
  /** Per-muscle overrides of the default volume landmarks (empty = use defaults).
   *  These are the athlete's FINAL word — applied last, over both the profile
   *  estimate and anything the log adapted. */
  landmarkOverrides: LandmarkOverrides;
  /** What we know about the athlete, so the landmarks stop being a population
   *  table (training age, mass, age, recovery). Empty = the population table. */
  volumeProfile: AthleteVolumeProfile;
  /** Let the training log correct the estimated ceiling (adaptive MRV). */
  adaptiveLandmarks: boolean;
  /** Where the athlete is in the current mesocycle — drives the MEV → MAV ramp. */
  volumeBlock: VolumeBlock;
  /** Show the block's weekly target on the Volume screen (off = landmarks only). */
  periodizeVolume: boolean;
  /**
   * Pull new workouts off the athlete's watch by themselves — no sheet, no tap.
   * Off by default: the first import should be one the athlete watched happen,
   * so they can see what the plan does before it runs unattended. The read is
   * phone-only (a health store is native), but the preference lives here so the
   * toggle reads the same on both clients. See core/device-import.ts.
   */
  deviceAutoImport: boolean;
}

export const DEFAULT_LOGGER_PREFS: LoggerPrefs = {
  detailed: true,
  velocity: false,
  countIn: true,
  keepAwake: true,
  haptics: true,
  carryOver: true,
  restTimer: true,
  restSeconds: 90,
  restNotify: true,
  restSound: true,
  autoAdvance: false,
  defaultStart: "empty",
  rpeAsRir: false,
  units: "kg",
  plateCalc: false,
  quickIncrement: 0,
  countWarmupsInVolume: false,
  fractionalVolume: false,
  landmarkOverrides: {},
  volumeProfile: {},
  adaptiveLandmarks: true,
  volumeBlock: DEFAULT_BLOCK,
  periodizeVolume: false,
  deviceAutoImport: false,
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
    velocity: bool(r.velocity, DEFAULT_LOGGER_PREFS.velocity),
    countIn: bool(r.countIn, DEFAULT_LOGGER_PREFS.countIn),
    keepAwake: bool(r.keepAwake, DEFAULT_LOGGER_PREFS.keepAwake),
    haptics: bool(r.haptics, DEFAULT_LOGGER_PREFS.haptics),
    carryOver: bool(r.carryOver, DEFAULT_LOGGER_PREFS.carryOver),
    restTimer: bool(r.restTimer, DEFAULT_LOGGER_PREFS.restTimer),
    restSeconds: seconds,
    restNotify: bool(r.restNotify, DEFAULT_LOGGER_PREFS.restNotify),
    restSound: bool(r.restSound, DEFAULT_LOGGER_PREFS.restSound),
    autoAdvance: bool(r.autoAdvance, DEFAULT_LOGGER_PREFS.autoAdvance),
    defaultStart: r.defaultStart === "ai" || r.defaultStart === "last" ? r.defaultStart : "empty",
    rpeAsRir: bool(r.rpeAsRir, DEFAULT_LOGGER_PREFS.rpeAsRir),
    units: r.units === "lb" ? "lb" : "kg",
    plateCalc: bool(r.plateCalc, DEFAULT_LOGGER_PREFS.plateCalc),
    quickIncrement: typeof r.quickIncrement === "number" && r.quickIncrement > 0 ? r.quickIncrement : 0,
    countWarmupsInVolume: bool(r.countWarmupsInVolume, DEFAULT_LOGGER_PREFS.countWarmupsInVolume),
    fractionalVolume: bool(r.fractionalVolume, DEFAULT_LOGGER_PREFS.fractionalVolume),
    landmarkOverrides: sanitizeLandmarkOverrides(r.landmarkOverrides),
    volumeProfile: sanitizeVolumeProfile(r.volumeProfile),
    adaptiveLandmarks: bool(r.adaptiveLandmarks, DEFAULT_LOGGER_PREFS.adaptiveLandmarks),
    volumeBlock: resolveBlock(r.volumeBlock as Partial<VolumeBlock> | null | undefined),
    periodizeVolume: bool(r.periodizeVolume, DEFAULT_LOGGER_PREFS.periodizeVolume),
    deviceAutoImport: bool(r.deviceAutoImport, DEFAULT_LOGGER_PREFS.deviceAutoImport),
  };
}
