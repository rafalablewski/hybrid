/**
 * SESSION WRAPPED — the data behind the workout-page "Wrapped" sequence: the
 * free BASICS every athlete sees and the premium FACTS gated behind Full. One
 * pure model both clients render so the panels agree — and, crucially, so both
 * agree on WHICH figures are honest enough to show.
 *
 * Honesty rule (inherited from done-receipt): only real, derived numbers appear
 * here — no fabricated "power/energy/percentile". A fact that can't be computed
 * from the logged session + history is simply omitted, never invented. The one
 * modelled figure, the calorie estimate, is flagged as an estimate (see
 * energy.ts) so a client can never present it as a measurement.
 *
 * DISCIPLINE-SHAPED, not one-size-fits-all. A swim has no sets and a lift has
 * no pace, so the panels are built per discipline rather than pouring every
 * sport through the gym's Sets/Reps/Volume mould — which is how a 1 500 m swim
 * used to render as "1 SET". `wrappedDiscipline` picks the shape; each shape
 * names its own headline and its own four stats.
 */
import type { LoggedSession, SessionBlock, CardioBlock, CardioDiscipline } from "./engines/session";
import { blockBestE1rm, e1rmSeries, cardioDiscipline, formatSportPace, isCardio } from "./engines/session";
import { volumeByMuscle } from "./engines/records";
import { bwAt, type BodyweightInput } from "./bodyweight";
import { doneReceipt } from "./done-receipt";
import { fmtWeight, fmtTonnage, type WeightUnit } from "./units";
import { formatSportDistance } from "./olympic-sports";
import { sessionEnergy, type EnergyEstimate } from "./energy";
import { benchmarkMetric, type Cohort } from "./benchmarks";

/** A free basic stat — unit lives in the value, label is an i18n key. */
export interface WrappedStat {
  labelKey: string;
  value: string;
  /** true when the value is MODELLED, not measured (the client marks it "~"). */
  estimate?: boolean;
}

/** A premium fact — a signed tone lets the client colour a gain/loss. */
export interface WrappedFact {
  labelKey: string;
  value: string;
  tone?: "up" | "down" | "neutral";
}

/**
 * What KIND of session this is, for summary purposes:
 *  • strength     — gym work: sets, reps, tonnage.
 *  • endurance    — a distance sport: distance, pace, time.
 *  • sport        — a timed sport with no distance (tennis, judo, football).
 *  • conditioning — intervals / metcon: rounds and time.
 *  • mixed        — strength AND something else in the same session.
 */
export type WrappedDiscipline = "strength" | "endurance" | "sport" | "conditioning" | "mixed";

export interface SessionWrapped {
  /** the shape the panels are built for */
  discipline: WrappedDiscipline;
  /** the ONE big number the hero shows, and what it is */
  headline: { value: string; labelKey: string };
  /** free — every athlete sees these (at most four, always discipline-shaped) */
  basics: WrappedStat[];
  /** premium (Full) — real derived analytics, each present only when computable */
  facts: WrappedFact[];
  /** the modelled calorie cost, or null when it can't be estimated honestly */
  energy: EnergyEstimate | null;
  /**
   * True when the session's numbers are thin — no measured pace, no heart rate,
   * no RPE — i.e. exactly the case a connected watch would fix. Drives the
   * "connect a device" prompt rather than leaving a plain panel unexplained.
   */
  sparse: boolean;
}

/**
 * "Where you stand" — the headline lift's RELATIVE-STRENGTH percentile vs a
 * cohort (sport / sex / age), from the documented synthetic norms in
 * benchmarks.ts. An ESTIMATE (norms-prior-v0), surfaced only when the athlete
 * has a talent profile (sex + age) AND a known bodyweight — never fabricated.
 * `topPct` = "you're in the top N%".
 */
export interface LiftStanding {
  /** 1..99 percentile vs the cohort */
  percentile: number;
  /** "top N%" — the athlete's standing, N = 100 − percentile (≥ 1) */
  topPct: number;
}

export function liftStanding(e1rmKg: number, bodyweightKg: number, cohort: Cohort): LiftStanding | null {
  if (!(e1rmKg > 0) || !(bodyweightKg > 0)) return null;
  const relStrength = e1rmKg / bodyweightKg;
  const b = benchmarkMetric("relStrength", relStrength, cohort);
  const percentile = Math.round(b.percentile);
  return { percentile, topPct: Math.max(1, 100 - percentile) };
}

/** The endurance modalities — the ones where a distance and a pace mean
 *  something. Everything else that isn't a lift is a timed effort. */
const DISTANCE_DISCIPLINES = new Set<CardioDiscipline>([
  "running",
  "swimming",
  "cycling",
  "rowing",
  "skiing",
  "walking",
]);

const disciplineOf = (b: CardioBlock): CardioDiscipline => b.discipline ?? cardioDiscipline(b.name);

/**
 * Which summary shape a logged session gets. Strength plus anything else is
 * mixed; cardio that covered ground (or belongs to a distance sport) is
 * endurance; a timed sport stays a sport; intervals stay conditioning.
 */
export function wrappedDiscipline(session: LoggedSession): WrappedDiscipline {
  let strength = 0;
  let endurance = 0;
  let sport = 0;
  let conditioning = 0;
  for (const b of session.blocks) {
    if (b.kind === "strength") {
      if (b.sets.length) strength++;
    } else if (b.kind === "cardio") {
      if ((b.distance ?? 0) > 0 || DISTANCE_DISCIPLINES.has(disciplineOf(b))) endurance++;
      else sport++;
    } else {
      conditioning++;
    }
  }
  const other = endurance + sport + conditioning;
  if (strength > 0 && other > 0) return "mixed";
  if (strength > 0 || other === 0) return "strength";
  if (endurance > 0) return "endurance";
  if (sport > 0) return "sport";
  return "conditioning";
}

/** Total working reps across a session's strength sets (warm-ups included — a
 *  rep is a rep for this headline count). */
function totalReps(session: LoggedSession): number {
  // StrengthSet.reps is a display string ("15", "10/leg") — parse the leading
  // integer; a per-side or timed notation contributes its leading number.
  let reps = 0;
  for (const b of session.blocks)
    if (b.kind === "strength") for (const s of b.sets) reps += Number.parseInt(s.reps, 10) || 0;
  return reps;
}

/** The session's heaviest lift (by e1RM at this session's bodyweight). */
function topLift(session: LoggedSession, bwHereKg: number | null): { name: string; e1rm: number } | null {
  let best: { name: string; e1rm: number } | null = null;
  for (const b of session.blocks)
    if (b.kind === "strength") {
      const e = Math.round(blockBestE1rm(b, bwHereKg));
      if (e > 0 && (!best || e > best.e1rm)) best = { name: b.name, e1rm: e };
    }
  return best;
}

/** The cardio block that defines the session — the one that covered the most
 *  ground, else the longest one. Its NAME drives the distance/pace units. */
function headlineCardio(blocks: SessionBlock[]): CardioBlock | null {
  let best: CardioBlock | null = null;
  for (const b of blocks) {
    if (!isCardio(b)) continue;
    if (!best) { best = b; continue; }
    const km = b.distance ?? 0;
    const bestKm = best.distance ?? 0;
    if (km > bestKm || (km === bestKm && (b.minutes ?? 0) > (best.minutes ?? 0))) best = b;
  }
  return best;
}

/** Mean logged RPE across the session's cardio + conditioning efforts, or null
 *  when the athlete never entered one. */
function meanEffort(blocks: SessionBlock[]): number | null {
  let sum = 0;
  let n = 0;
  for (const b of blocks)
    if ((b.kind === "cardio" || b.kind === "conditioning") && typeof b.rpe === "number" && b.rpe > 0) {
      sum += b.rpe;
      n++;
    }
  return n ? Math.round((sum / n) * 10) / 10 : null;
}

/** Total interval rounds across the session's conditioning blocks. */
function totalRounds(blocks: SessionBlock[]): number {
  let n = 0;
  for (const b of blocks) if (b.kind === "conditioning" && b.rounds) n += b.rounds;
  return n;
}

/** Total elevation gain, metres, across the session's cardio blocks. */
function totalElevation(blocks: SessionBlock[]): number {
  let m = 0;
  for (const b of blocks) if (isCardio(b) && b.elevation) m += b.elevation;
  return m;
}

const MUSCLE_LABEL_KEY = (m: string) => `muscle.${m}`;

/**
 * Build the Wrapped model for a logged session. `all` is the full history (for
 * the e1RM trend); `bw` is the dated bodyweight lookup so tonnage/e1RM/calories
 * use the athlete's weight at this session's date.
 */
export function sessionWrapped(
  session: LoggedSession,
  all: LoggedSession[],
  opts: { units: WeightUnit; bw?: BodyweightInput },
): SessionWrapped {
  const { units, bw } = opts;
  const bwHereKg = bwAt(bw, session.startedAt);
  const receipt = doneReceipt(session, { bodyweightKg: bwHereKg });
  const discipline = wrappedDiscipline(session);
  const energy = sessionEnergy(session, { bodyweightKg: bwHereKg, durationMin: receipt.durationMin });

  const reps = totalReps(session);
  const lead = headlineCardio(session.blocks);
  const effort = meanEffort(session.blocks);
  const rounds = totalRounds(session.blocks);
  const elevation = totalElevation(session.blocks);
  const secPerKm =
    receipt.distanceKm > 0 && receipt.durationMin != null && receipt.durationMin > 0
      ? Math.round((receipt.durationMin * 60) / receipt.distanceKm)
      : null;

  const minutes: WrappedStat | null =
    receipt.durationMin != null ? { labelKey: "summary.minutes", value: `${receipt.durationMin}` } : null;
  const distance: WrappedStat | null =
    receipt.distanceKm > 0
      ? { labelKey: "session.distance", value: formatSportDistance(receipt.distanceKm, lead?.name ?? "") }
      : null;
  const pace: WrappedStat | null =
    secPerKm != null ? { labelKey: "session.pace", value: formatSportPace(secPerKm, lead?.name) } : null;
  const kcal: WrappedStat | null =
    energy ? { labelKey: "session.wrapped.kcal", value: `${energy.kcal}`, estimate: true } : null;
  const effortStat: WrappedStat | null =
    effort != null ? { labelKey: "session.wrapped.effort", value: `${effort}` } : null;
  const volume: WrappedStat | null =
    receipt.tonnageKg > 0 ? { labelKey: "summary.volumeMoved", value: fmtTonnage(receipt.tonnageKg, units) } : null;
  const sets: WrappedStat | null = receipt.sets > 0 ? { labelKey: "summary.sets", value: String(receipt.sets) } : null;
  const repsStat: WrappedStat | null = reps > 0 ? { labelKey: "session.wrapped.reps", value: String(reps) } : null;
  const roundsStat: WrappedStat | null =
    rounds > 0 ? { labelKey: "session.wrapped.rounds", value: String(rounds) } : null;
  const elevationStat: WrappedStat | null =
    elevation > 0 ? { labelKey: "session.wrapped.elevation", value: `${Math.round(elevation)} m` } : null;

  // ---- BASICS (free) — four tiles, chosen for the discipline. -------------
  // The ORDER is the priority order: the first four that have something true to
  // say win, so a swim never falls back to "1 set" just to fill a slot.
  const wanted: (WrappedStat | null)[] =
    discipline === "strength"
      ? [sets, repsStat, volume, minutes, kcal]
      : discipline === "endurance"
        ? [distance, minutes, pace, kcal, elevationStat, effortStat]
        : discipline === "sport"
          ? [minutes, kcal, effortStat, distance]
          : discipline === "conditioning"
            ? [minutes, roundsStat, kcal, effortStat]
            : [minutes, distance, volume, kcal, pace, sets];
  const basics = wanted.filter((s): s is WrappedStat => s != null).slice(0, 4);

  // ---- HEADLINE — the one number the hero shows. --------------------------
  const headline =
    discipline === "endurance" && distance
      ? { value: distance.value, labelKey: "session.distance" }
      : discipline === "strength" && volume
        ? { value: volume.value, labelKey: "summary.volumeMoved" }
        : discipline === "mixed" && volume
          ? { value: volume.value, labelKey: "summary.volumeMoved" }
          : minutes
            ? { value: `${receipt.durationMin} min`, labelKey: "summary.minutes" }
            : (basics[0] ?? { value: "—", labelKey: "session.wrapped.basics" });

  // ---- FACTS (premium) — real derived analytics only. ---------------------
  const facts: WrappedFact[] = [];
  const top = topLift(session, bwHereKg);
  if (top) {
    facts.push({ labelKey: "session.wrapped.est1rm", value: fmtWeight(top.e1rm, units), tone: "neutral" });
    // e1RM trend for the headline lift: gain from first logged to this session.
    const series = e1rmSeries(all, top.name, bw);
    if (series.length > 1) {
      const delta = Math.round(series[series.length - 1]!.e1rm - series[0]!.e1rm);
      if (delta !== 0)
        facts.push({
          labelKey: "session.wrapped.trend",
          value: `${delta > 0 ? "+" : "−"}${fmtWeight(Math.abs(delta), units)}`,
          tone: delta > 0 ? "up" : "down",
        });
    }
  }
  // Endurance/sport premium: the derived pace, the climb, and the modelled
  // intensity (MET-minutes) — each only when the session actually carries it.
  if (discipline !== "strength") {
    if (pace) facts.push({ labelKey: "session.pace", value: pace.value, tone: "neutral" });
    if (elevationStat) facts.push({ labelKey: "session.wrapped.elevation", value: elevationStat.value, tone: "neutral" });
    if (energy) facts.push({ labelKey: "session.wrapped.intensity", value: `${energy.metMinutes}`, tone: "neutral" });
  }
  // Muscle split — the session's most-trained muscle and its tonnage
  // (bodyweight-aware via this session's weight, so dips/pull-ups count).
  const muscles = volumeByMuscle(session.blocks, false, bwHereKg);
  if (muscles.length > 0) {
    const m = muscles[0]!;
    facts.push({ labelKey: MUSCLE_LABEL_KEY(m.muscle), value: fmtWeight(m.volume, units), tone: "neutral" });
  }
  // Readiness the athlete logged for the day, when present.
  if (typeof session.readiness === "number") {
    facts.push({ labelKey: "home.readiness", value: `${session.readiness}`, tone: "neutral" });
  }
  // Total volume also lives here as the anchor premium fact when a lift exists.
  if (receipt.tonnageKg > 0 && top) {
    facts.unshift({ labelKey: "summary.volumeMoved", value: fmtTonnage(receipt.tonnageKg, units), tone: "neutral" });
  }

  // A session is "sparse" when nothing measured its intensity: no pace, no RPE,
  // and no calorie estimate worth the name. That's the device-shaped hole.
  const sparse = pace == null && effort == null && (energy == null || energy.basis === "duration");

  return { discipline, headline, basics, facts, energy, sparse };
}
