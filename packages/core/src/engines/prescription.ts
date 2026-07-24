import type {
  Biometrics,
  EnergySystem,
  Prescription,
  PrescribedBlock,
  TrainingLog,
} from "./types";
import { MOVEMENTS } from "./movements";
import { computeFatigue } from "./fatigue";
import { computeReadiness } from "./readiness";
import { progressionSignal } from "./progression";
import { velocityAtLoad, type LoadVelocityProfile } from "./velocity";
import { readinessLoadFactor, type ReadinessFeeling } from "../readiness-feeling";

export interface RunTarget {
  /** km */
  distance: number;
  /** minutes (distance × pace) */
  minutes: number;
  /** seconds per km */
  paceSecPerKm: number;
  /**
   * True when there's no run history yet, so distance/pace are a generic
   * starting default rather than read off the athlete's own runs. Lets the UI
   * label it as an estimate instead of presenting it as personalised.
   */
  estimated: boolean;
}

const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Format seconds-per-km as a pace string, e.g. 390 → "6:30 /km". */
export function formatPace(secPerKm: number): string {
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, "0")} /km`;
}

/**
 * Today's easy-run target, read off the athlete's REAL runs: their median easy
 * pace and typical distance (scaled by readiness), so the AI prescribes a run
 * they can actually hit. Falls back to a gentle 5 km @ 6:30/km when there's no
 * run history yet (no fabricated personal pace).
 */
export function easyRunTarget(log: TrainingLog, readiness: number): RunTarget {
  const runs = log
    .flatMap((s) => s.items)
    .filter((i) => i.system === "aerobic" && !!i.distance && i.distance > 0 && !!i.minutes && i.minutes > 0);
  const paces = runs.map((r) => (r.minutes! * 60) / r.distance!);
  const dists = runs.map((r) => r.distance!);
  const medPace = median(paces);
  const medDist = median(dists);
  const estimated = !runs.length;
  const paceSecPerKm = Number.isFinite(medPace) ? Math.round(medPace) : 390;
  const base = Number.isFinite(medDist) ? medDist : 5;
  const scale = readiness >= 70 ? 1 : readiness >= 50 ? 0.85 : 0.7;
  const distance = Math.max(2, Math.round(base * scale * 2) / 2);
  const minutes = Math.round((distance * paceSecPerKm) / 60);
  return { distance, minutes, paceSecPerKm, estimated };
}

/** Athlete self-reported experience + available equipment (mirrors the
 *  onboarding intake). Feed them into prescribeSession so the day's session
 *  matches who the athlete is and what they can train with. */
export type PrescribeExperience = "beginner" | "intermediate" | "advanced";
export type PrescribeEquipment = "full" | "home" | "minimal";

/** The primary strength candidates per equipment tier — barbell when there's a
 *  full gym, dumbbell at home, bodyweight when it's minimal. Same movement
 *  patterns (squat / hinge / push), just doable with what the athlete has. */
const PRIMARY_BY_EQUIPMENT: Record<PrescribeEquipment, string[]> = {
  full: ["Back Squat", "Deadlift", "Bench Press", "Overhead Press"],
  home: ["Goblet Squat", "DB Romanian Deadlift", "DB Bench Press", "DB Overhead Press"],
  minimal: ["Bodyweight Squat", "Single-Leg RDL", "Push-Up", "Pike Push-Up"],
};

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface PrescribeOptions {
  /**
   * Per-lift load–velocity profiles (e.g. from `velocityProfiles(sessions)`).
   * When the chosen primary lift has a resolvable profile, the working load is
   * derived from the velocity-estimated 1RM — autoregulated to today's bar
   * speed rather than a stale rep-based e1RM.
   */
  profiles?: Record<string, LoadVelocityProfile>;
  /** Experience tier — tunes volume + intensity (default "intermediate"). */
  experience?: PrescribeExperience;
  /** Available equipment — picks barbell/dumbbell/bodyweight movements and
   *  swaps machine conditioning for bodyweight work (default "full"). */
  equipment?: PrescribeEquipment;
  /**
   * Today's SUBJECTIVE readiness (the athlete's one-tap check-in feeling). When
   * set it scales the working load on top of the progression dose — primed adds
   * a little, flat eases back, wrecked deloads (load AND a set) — so the pick's
   * guidance is mechanical, not just copy. Absent → neutral (no adjustment).
   */
  subjectiveReadiness?: ReadinessFeeling;
}

/**
 * The prescription engine — the moat made real. Picks the most-recovered heavy
 * pattern with a good progression signal, doses it from that signal, pairs it
 * with the freshest conditioning system, and explains every choice. Confidence
 * rises with log depth (the network effect, made literal).
 *
 * VBT: pass `opts.profiles` and, when the primary lift has a fitted load–velocity
 * profile, the load tracks the velocity-estimated 1RM and a target bar speed is
 * returned for the work sets — true day-to-day autoregulation.
 */
export function prescribeSession(
  log: TrainingLog,
  bio?: Biometrics,
  opts?: PrescribeOptions,
): Prescription {
  const fatigue = computeFatigue(log);
  const { score: readiness, bioAdj } = computeReadiness(fatigue, bio);

  const experience = opts?.experience ?? "intermediate";
  const equipment = opts?.equipment ?? "full";
  // Bodyweight tier has no external load — the strength block is rep/RPE-driven.
  const bodyweight = equipment === "minimal";

  // choose primary strength lift: most-recovered pattern with a good signal,
  // from the movements the athlete can actually train (barbell/dumbbell/BW).
  const candidates = PRIMARY_BY_EQUIPMENT[equipment];
  const scored = candidates
    .map((move) => {
      const meta = MOVEMENTS[move]!;
      const musFatigue = Math.max(
        ...meta.muscles.map((m) => fatigue.muscles[m] ?? 0),
      );
      const sig = progressionSignal(log, move);
      return { move, musFatigue, sig, recovery: 100 - musFatigue };
    })
    .sort((a, b) => b.recovery - a.recovery);
  const primary = scored[0]!;

  // load prescription from signal. Sort newest-first by daysAgo so loggedE1rm[0]
  // is genuinely the most recent reading regardless of the caller's input order
  // (previously this trusted the log to arrive newest-first).
  const loggedE1rm = log
    .slice()
    .sort((a, b) => a.daysAgo - b.daysAgo)
    .flatMap((s) => s.items)
    .filter((i) => i.move === primary.move && i.e1rm !== undefined);
  // No logged history for this lift → fall back to a generic starting load
  // (flagged `loadEstimated` so the UI can say "starting estimate — log to
  // calibrate" rather than presenting a guess as if it were measured).
  const lastE1rm = loggedE1rm.length
    ? loggedE1rm[0]!.e1rm!
    : (MOVEMENTS[primary.move]?.baseLoad ?? 100) * 1.2;
  // Base dose from the progression signal, then nudge by experience: beginners
  // train a touch lighter with more reps and one fewer set (groove the pattern);
  // advanced athletes get slightly more intensity + volume.
  const basePct =
    primary.sig.action === "progress" ? 0.8 : primary.sig.action === "deload" ? 0.65 : 0.75;
  const expPctAdj = experience === "beginner" ? -0.05 : experience === "advanced" ? 0.03 : 0;
  const expSetAdj = experience === "beginner" ? -1 : experience === "advanced" ? 1 : 0;
  const expRepAdj = experience === "beginner" ? 2 : 0;
  const pct = clampN(basePct + expPctAdj, 0.55, 0.9);

  // VBT autoregulation (loaded tiers only): anchor the load to the velocity-
  // estimated 1RM when a fitted profile exists. Bodyweight has no external load.
  const profile = opts?.profiles?.[primary.move];
  const useVel = !bodyweight && !!profile && profile.estimated1rm > 0;
  const oneRm = useVel ? profile!.estimated1rm : lastE1rm;
  // The working load rests on a generic default only when we have neither a
  // velocity profile nor any logged e1RM for this lift (never flagged for BW).
  const loadEstimated = !bodyweight && !useVel && loggedE1rm.length === 0;
  // Subjective readiness (the one-tap check-in feeling) scales the load on top
  // of the progression dose, and a wrecked day also sheds a set — a real
  // deload, not just lighter bars. Neutral (×1, no set change) when unset.
  const readinessFactor = readinessLoadFactor(opts?.subjectiveReadiness);
  const readinessSetAdj = opts?.subjectiveReadiness === "wrecked" ? -1 : 0;
  const baseSets =
    primary.sig.action === "progress" ? 5 : primary.sig.action === "deload" ? 3 : 4;
  const sets = clampN(baseSets + expSetAdj + readinessSetAdj, 2, 6);
  // Bodyweight is rep-driven (no kg); loaded tiers keep the heavy 3–5 scheme.
  const reps =
    (bodyweight ? (primary.sig.action === "deload" ? 8 : 12) : primary.sig.action === "deload" ? 3 : 5) +
    expRepAdj;
  const workLoad = bodyweight ? 0 : Math.round((oneRm * pct * readinessFactor) / 2.5) * 2.5;
  const loadDisplay = bodyweight ? "BW" : String(workLoad);
  const velocityTarget = useVel ? velocityAtLoad(profile!, workLoad) : undefined;

  // choose conditioning system least-loaded recently
  const sysOrder = (
    Object.entries(fatigue.systems) as [EnergySystem, number][]
  ).sort((a, b) => a[1] - b[1]);
  const pickSys = sysOrder[0]![0];
  const aerobic = pickSys === "aerobic";
  const machineCond =
    pickSys === "aerobic"
      ? "Easy Run"
      : pickSys === "threshold"
        ? "Row Intervals"
        : "Assault Bike";
  // No rower/bike at home or minimal → a bodyweight metcon covers the same
  // system. A run needs no equipment, so the aerobic pick is always kept.
  const condMove = equipment !== "full" && !aerobic ? "Mixed Metcon" : machineCond;
  const condFormat =
    pickSys === "aerobic"
      ? "Steady"
      : condMove === "Mixed Metcon"
        ? "Circuit"
        : pickSys === "threshold"
          ? "Intervals"
          : "EMOM";
  // Aerobic day → a steady run with a real distance + goal pace (off the
  // athlete's own runs); threshold/anaerobic stay interval-shaped.
  const run = aerobic ? easyRunTarget(log, readiness) : null;

  // confidence rises with log depth — the network effect, made literal
  const confidence = Math.min(0.95, 0.45 + log.length * 0.08);

  const blocks: PrescribedBlock[] = [
    {
      uid: 901,
      kind: "strength",
      name: primary.move,
      sets: Array.from({ length: sets }, () => ({
        load: loadDisplay,
        reps: String(reps),
        rpe: "",
      })),
    },
    run
      ? {
          uid: 902,
          kind: "cardio",
          name: condMove,
          distance: run.distance,
          minutes: run.minutes,
          paceTarget: formatPace(run.paceSecPerKm),
          rpe: 5,
        }
      : {
          uid: 902,
          kind: "conditioning",
          name: condMove,
          format: condFormat,
          work: 40,
          rest: 20,
          rounds: 8,
        },
  ];

  const loadBasis = bodyweight
    ? "bodyweight — progress reps within the range, then move to a harder variation"
    : useVel
      ? `${Math.round(pct * 100)}% of your velocity-estimated 1RM (${Math.round(oneRm)}kg, autoregulated to today's bar speed) — aim for ~${velocityTarget!.toFixed(2)} m/s on the work sets`
      : loadEstimated
        ? `${Math.round(pct * 100)}% of a starting estimate — log this lift and I'll calibrate it to your real strength`
        : `${Math.round(pct * 100)}% e1RM`;

  // A one-liner on how the session was tailored to the athlete's intake.
  const setupNote =
    ` Dialed for ${experience} level${
      equipment !== "full" ? ` and ${equipment === "home" ? "home (dumbbell)" : "minimal (bodyweight)"} equipment` : ""
    }.`;

  const why =
    `Readiness ${readiness}/100. ` +
    `${primary.move} is your most-recovered ${bodyweight ? "pattern" : "heavy pattern"}, and your signal is "${primary.sig.action}" — ${primary.sig.reason}, ` +
    `so I prescribed ${sets}×${reps}${bodyweight ? "" : ` @ ${workLoad}kg`} (${loadBasis}). ` +
    `Your ${pickSys} system is the freshest, so today's conditioning is ${
      run
        ? `an easy ${run.distance} km run @ ~${formatPace(run.paceSecPerKm)} (≈${run.minutes} min, RPE 5)${run.estimated ? " — a gentle starting pace until you log a run" : ""}`
        : `${condMove.toLowerCase()} (${condFormat.toLowerCase()})`
    } to balance the week.` +
    setupNote +
    (bio && bioAdj !== 0
      ? ` Your wearable nudged readiness ${bioAdj > 0 ? "+" : ""}${bioAdj} today — ${bioAdj > 0 ? "HRV is above baseline and sleep was solid, so you're cleared to push." : "HRV dipped and sleep ran short, so I held the load back."}`
      : "") +
    (opts?.subjectiveReadiness && opts.subjectiveReadiness !== "good"
      ? ` You checked in feeling ${opts.subjectiveReadiness}, so I ${
          opts.subjectiveReadiness === "primed"
            ? "added a little load"
            : opts.subjectiveReadiness === "flat"
              ? "eased the load back"
              : "cut the load and a set to protect recovery"
        }.`
      : "");

  return {
    readiness,
    fatigue,
    primary,
    blocks,
    why,
    confidence,
    pickSys,
    bioAdj: bio ? bioAdj : 0,
    oneRm: bodyweight ? 0 : Math.round(oneRm),
    oneRmSource: useVel ? "velocity" : "e1rm",
    loadEstimated,
    velocityTarget,
  };
}
