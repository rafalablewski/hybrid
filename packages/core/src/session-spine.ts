/**
 * SESSION SPINE — the session as a shape you can read, built from its own sets.
 *
 * The summary used to draw `sessionSignature`: six bars, no axis, no scale, no
 * comparison, captioned "your session's shape". It occupied a full panel and
 * answered nothing an athlete would ask. This replaces it with the two figures
 * a set-by-set log can honestly produce, and nothing else:
 *
 *   THE SPINE — one bar per set, height by the load actually moved, grouped by
 *   exercise, warm-ups ghosted and the heaviest working set flagged. It is the
 *   session, in order, at a glance: the ramp up to a top single reads as a ramp,
 *   a straight-sets day reads as a wall.
 *
 *   THE CURVE — running tonnage after each set. Where the spine says how heavy,
 *   the curve says how much has accumulated, and it is the only figure on the
 *   summary that shows the session as something that BUILT rather than a total
 *   that arrived.
 *
 * NOTHING HERE IS PLACED ON A CLOCK. The obvious version of this chart puts
 * each set at the minute it happened, and the app cannot honestly draw that: a
 * set carries the rest taken BEFORE it, not its own duration, so a clock
 * position would be part measurement and part guess at how long a set takes.
 * The x-axis is the set index — which is exact, and which an athlete reads the
 * same way. The rest that IS logged is reported as a median, as itself.
 *
 * Both panels read one model so the hero's curve and the work panel's spine
 * cannot disagree about what a set weighed.
 */
import type { LoggedSession } from "./engines/session";
import { sessionSetFacts, type SetFact } from "./session-facts";
import type { BodyweightInput } from "./bodyweight";

export interface SpineBar {
  /** the load actually moved per rep, kg — the bar's height */
  loadKg: number;
  /** the set's own contribution to tonnage, kg (0 when it has nothing to weigh) */
  volumeKg: number;
  reps: number | null;
  /** warm-up or cool-down: drawn as a ghost, counted in neither summary figure */
  warmup: boolean;
  /** a drop set — performed straight off the one before it */
  drop: boolean;
  /** which exercise group the bar belongs to (index into `groups`) */
  group: number;
  /** the session's heaviest working set — exactly one bar, or none */
  top: boolean;
}

export interface SpineGroup {
  exercise: string;
  /** index of the group's first bar */
  from: number;
  /** how many bars it owns */
  count: number;
}

export interface SessionSpine {
  bars: SpineBar[];
  groups: SpineGroup[];
  /** running tonnage after each bar, kg — same length as `bars` */
  cumulativeKg: number[];
  /** the session's strength tonnage, kg (working sets only) */
  totalKg: number;
  workingSets: number;
  totalSets: number;
  /** the heaviest working set, or null when nothing was loaded */
  topSet: { exercise: string; loadKg: number; reps: number | null } | null;
  /** median LOGGED rest before a working set, seconds — null when none logged */
  medianRestSec: number | null;
  /** mean LOGGED RPE across working sets — null when none logged */
  meanRpe: number | null;
}

/** The fewest bars that make a shape rather than a decoration. Below this the
 *  panel has nothing to draw and the client should not draw it — the same
 *  judgement SIGNATURE_MIN_BARS made for the chart this replaces. */
export const SPINE_MIN_BARS = 3;

const isStrengthFact = (f: SetFact): boolean => f.kind === "strength";

/** The middle value of a sorted list — the average of the two middles for an
 *  even count, so a two-rest session reports something between them. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : Math.round((v[mid - 1]! + v[mid]!) / 2);
}

/**
 * The session's spine. `bw` is the dated bodyweight lookup, so a dip or a
 * pull-up stands at the weight the athlete was ON THE DAY rather than today's.
 *
 * Cardio and conditioning contribute nothing: they have no sets and no load, so
 * a session made only of them returns an empty spine and the panel is absent.
 */
export function sessionSpine(
  session: LoggedSession,
  opts: { bw?: BodyweightInput } = {},
): SessionSpine {
  const facts = sessionSetFacts(session, opts.bw).filter(isStrengthFact);

  const bars: SpineBar[] = [];
  const groups: SpineGroup[] = [];
  const cumulativeKg: number[] = [];
  let running = 0;

  for (const f of facts) {
    const warmup = f.role === "warmup" || f.role === "cooldown";
    const last = groups[groups.length - 1];
    if (!last || last.exercise !== f.exercise) {
      groups.push({ exercise: f.exercise, from: bars.length, count: 1 });
    } else {
      last.count++;
    }
    // A working set with nothing to weigh (a timed hold logged as strength)
    // still gets a bar — it happened — but adds nothing to the curve.
    if (!warmup) running += f.volumeKg ?? 0;
    bars.push({
      loadKg: f.effectiveLoadKg ?? 0,
      volumeKg: f.volumeKg ?? 0,
      reps: f.reps,
      warmup,
      drop: f.drop,
      group: groups.length - 1,
      top: false,
    });
    cumulativeKg.push(Math.round(running));
  }

  // The heaviest WORKING set, by the load actually moved. Ties go to the first,
  // which is the one the athlete hit on the way up rather than the repeat.
  let topIdx = -1;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    if (b.warmup || b.loadKg <= 0) continue;
    if (topIdx < 0 || b.loadKg > bars[topIdx]!.loadKg) topIdx = i;
  }
  if (topIdx >= 0) bars[topIdx]!.top = true;

  const working = facts.filter((f) => !(f.role === "warmup" || f.role === "cooldown"));
  const rests = working.map((f) => f.restSec).filter((r): r is number => r != null && r > 0);
  const rpes = working.map((f) => f.rpe).filter((r): r is number => r != null && r > 0);

  return {
    bars,
    groups,
    cumulativeKg,
    totalKg: Math.round(running),
    workingSets: working.length,
    totalSets: bars.length,
    topSet:
      topIdx >= 0
        ? {
            exercise: groups[bars[topIdx]!.group]!.exercise,
            loadKg: bars[topIdx]!.loadKg,
            reps: bars[topIdx]!.reps,
          }
        : null,
    medianRestSec: median(rests),
    meanRpe: rpes.length ? Math.round((rpes.reduce((s, r) => s + r, 0) / rpes.length) * 10) / 10 : null,
  };
}
