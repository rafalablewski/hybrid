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

export interface RunTarget {
  /** km */
  distance: number;
  /** minutes (distance × pace) */
  minutes: number;
  /** seconds per km */
  paceSecPerKm: number;
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
  const paceSecPerKm = Number.isFinite(medPace) ? Math.round(medPace) : 390;
  const base = Number.isFinite(medDist) ? medDist : 5;
  const scale = readiness >= 70 ? 1 : readiness >= 50 ? 0.85 : 0.7;
  const distance = Math.max(2, Math.round(base * scale * 2) / 2);
  const minutes = Math.round((distance * paceSecPerKm) / 60);
  return { distance, minutes, paceSecPerKm };
}

export interface PrescribeOptions {
  /**
   * Per-lift load–velocity profiles (e.g. from `velocityProfiles(sessions)`).
   * When the chosen primary lift has a resolvable profile, the working load is
   * derived from the velocity-estimated 1RM — autoregulated to today's bar
   * speed rather than a stale rep-based e1RM.
   */
  profiles?: Record<string, LoadVelocityProfile>;
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

  // choose primary strength lift: most-recovered pattern with a good signal
  const candidates = ["Back Squat", "Deadlift", "Bench Press", "Overhead Press"];
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

  // load prescription from signal
  const lastE1rm = (() => {
    const h = log
      .flatMap((s) => s.items)
      .filter((i) => i.move === primary.move && i.e1rm !== undefined);
    return h.length ? h[0]!.e1rm! : (MOVEMENTS[primary.move]!.baseLoad ?? 100) * 1.2;
  })();
  const pct =
    primary.sig.action === "progress"
      ? 0.8
      : primary.sig.action === "deload"
        ? 0.65
        : 0.75;

  // VBT autoregulation: if we have a fitted load–velocity profile for the
  // primary lift, anchor the load to its velocity-estimated 1RM (which moves
  // with today's readiness) and surface the bar speed to hit on the work sets.
  const profile = opts?.profiles?.[primary.move];
  const useVel = !!profile && profile.estimated1rm > 0;
  const oneRm = useVel ? profile!.estimated1rm : lastE1rm;
  const workLoad = Math.round((oneRm * pct) / 2.5) * 2.5;
  const velocityTarget = useVel ? velocityAtLoad(profile!, workLoad) : undefined;
  const reps = primary.sig.action === "deload" ? 3 : 5;
  const sets =
    primary.sig.action === "progress" ? 5 : primary.sig.action === "deload" ? 3 : 4;

  // choose conditioning system least-loaded recently
  const sysOrder = (
    Object.entries(fatigue.systems) as [EnergySystem, number][]
  ).sort((a, b) => a[1] - b[1]);
  const pickSys = sysOrder[0]![0];
  const aerobic = pickSys === "aerobic";
  const condMove =
    pickSys === "aerobic"
      ? "Easy Run"
      : pickSys === "threshold"
        ? "Row Intervals"
        : "Assault Bike";
  const condFormat =
    pickSys === "aerobic" ? "Steady" : pickSys === "threshold" ? "Intervals" : "EMOM";
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
        load: String(workLoad),
        reps: String(reps),
        rpe: "",
      })),
    },
    run
      ? {
          uid: 902,
          kind: "conditioning",
          name: condMove,
          format: condFormat,
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

  const loadBasis = useVel
    ? `${Math.round(pct * 100)}% of your velocity-estimated 1RM (${Math.round(oneRm)}kg, autoregulated to today's bar speed) — aim for ~${velocityTarget!.toFixed(2)} m/s on the work sets`
    : `${Math.round(pct * 100)}% e1RM`;

  const why =
    `Readiness ${readiness}/100. ` +
    `${primary.move} is your most-recovered heavy pattern, and your signal is "${primary.sig.action}" — ${primary.sig.reason}, ` +
    `so I prescribed ${sets}×${reps} @ ${workLoad}kg (${loadBasis}). ` +
    `Your ${pickSys} system is the freshest, so today's conditioning is ${
      run
        ? `an easy ${run.distance} km run @ ~${formatPace(run.paceSecPerKm)} (≈${run.minutes} min, RPE 5)`
        : `${condMove.toLowerCase()} (${condFormat.toLowerCase()})`
    } to balance the week.` +
    (bio && bioAdj !== 0
      ? ` Your wearable nudged readiness ${bioAdj > 0 ? "+" : ""}${bioAdj} today — ${bioAdj > 0 ? "HRV is above baseline and sleep was solid, so you're cleared to push." : "HRV dipped and sleep ran short, so I held the load back."}`
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
    oneRm: Math.round(oneRm),
    oneRmSource: useVel ? "velocity" : "e1rm",
    velocityTarget,
  };
}
