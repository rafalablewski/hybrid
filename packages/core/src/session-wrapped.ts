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
 * energy.ts) so a client can never present it as a measurement — and when a
 * device measured the session, that flag drops because the figure came off a
 * wrist instead of a table. Matched sessions read MEASURED throughout: the
 * duration, distance, climb and energy here are the device's (done-receipt +
 * energy resolve that), with heart rate joining the facts.
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
import { orderFigures } from "./figure-order";
import { fmtWeight, fmtTonnage, type WeightUnit } from "./units";
import { formatSportDistance } from "./olympic-sports";
import { sessionEnergy, type EnergyEstimate } from "./energy";

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
  /** the session's calorie cost — measured when a device recorded it, else the
   *  model's estimate, or null when neither can say anything honest */
  energy: EnergyEstimate | null;
  /** true when a matched device supplied this session's figures */
  measured: boolean;
  /**
   * True when the session's numbers are thin — no measured pace, no heart rate,
   * no RPE — i.e. exactly the case a connected watch would fix. Drives the
   * "connect a device" prompt rather than leaving a plain panel unexplained.
   */
  sparse: boolean;
}

/**
 * How much to shrink a Wrapped number so it stays on ONE line.
 *
 * The hero and the stat tiles were sized for the gym vocabulary they used to
 * carry — "11.3 t", "25", "78". Making them discipline-aware widened that
 * vocabulary a lot: "1500 m", "2:20 /100m", "10.0 km". At the original size
 * those wrap, and a wrapped value drags its label out of line with the tiles
 * beside it.
 *
 * A CHARACTER COUNT WON'T DO. "11.3 t" and "1500 m" are both six characters and
 * measure 66px and 85px in the tile — the dot and the space are a third the
 * width of a digit, so counting them equally is off by 30%. The table below is
 * per-glyph advance width in em, measured from Archivo Black (the app's display
 * face) and verified against both slots.
 *
 * Living here rather than in each client is the point: mobile could lean on
 * `adjustsFontSizeToFit` and web has no equivalent, so two implementations
 * would mean two different answers to "how big is this number".
 */
const CHAR_EM: Record<string, number> = {
  " ": 0.36, ".": 0.27, ",": 0.27, ":": 0.27, "/": 0.45, "~": 0.64,
  "+": 0.6, "−": 0.45, "-": 0.45, "%": 0.9, "°": 0.45,
  m: 0.77, i: 0.27, n: 0.59, k: 0.64, t: 0.32, g: 0.62, s: 0.55, h: 0.6,
  e: 0.6, r: 0.42, l: 0.27, a: 0.58, o: 0.62, d: 0.62, u: 0.6, c: 0.55, p: 0.62,
};
/** A digit — and the fallback for anything not in the table. */
const DEFAULT_EM = 0.682;

/** Approximate rendered width of a value, in em of its own font size.
 *  `trackingEm` is the slot's letter-spacing (negative tightens). */
export function textWidthEm(value: string, trackingEm = 0): number {
  let w = 0;
  for (const ch of value) w += (CHAR_EM[ch] ?? DEFAULT_EM) + trackingEm;
  return Math.max(0, w);
}

/**
 * Multiplier in (0, 1] that keeps `value` inside `budgetEm` — the slot's width
 * expressed in em of the value's base font size (available px ÷ base px).
 */
export function fitScale(
  value: string,
  budgetEm: number,
  opts: { trackingEm?: number; floor?: number } = {},
): number {
  const w = textWidthEm(value, opts.trackingEm ?? 0);
  if (!(w > budgetEm)) return 1;
  return Math.max(opts.floor ?? 0.5, budgetEm / w);
}

/** The Wrapped hero: 338px of gutter-to-gutter room at a 96px base. */
export const HERO_FIT_EM = 3.4;
/** The hero's letter-spacing (−3px at 96px). */
export const HERO_TRACKING_EM = -0.031;
/** One of the four stat tiles: ~76px of room at a 22px base. */
export const STAT_FIT_EM = 3.25;

// "Where you stand" — the headline lift's relative-strength percentile against
// a sport/sex/age cohort — was REMOVED with the Talent Graph (2026-08 strategy
// cuts). The opt-in talent profile was its only source of sex + age, and there
// is no other cohort input in the schema, so the card could never render again.
// A panel that can only ever say nothing is worse than no panel.

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
  // Duration, distance and climb all arrive through the receipt, which already
  // prefers the matched device's recording over the logged figures.
  const elevation = receipt.elevationM;
  // Pace comes off the SECOND-accurate clock when a device measured one, so the
  // hero's pace and the comparison panel's measured column are the same number
  // — dividing by whole minutes made them differ by three seconds per 100 m.
  const trustedSec = receipt.durationSec ?? (receipt.durationMin != null ? receipt.durationMin * 60 : null);
  const secPerKm =
    receipt.distanceKm > 0 && trustedSec != null && trustedSec > 0
      ? Math.round(trustedSec / receipt.distanceKm)
      : null;

  const minutes: WrappedStat | null =
    receipt.durationMin != null ? { labelKey: "summary.minutes", value: `${receipt.durationMin}` } : null;
  const distance: WrappedStat | null =
    receipt.distanceKm > 0
      ? { labelKey: "session.distance", value: formatSportDistance(receipt.distanceKm, lead?.name ?? "") }
      : null;
  const pace: WrappedStat | null =
    secPerKm != null ? { labelKey: "session.pace", value: formatSportPace(secPerKm, lead?.name) } : null;
  // A measured burn is NOT an estimate — it loses the "~" the model's figure
  // wears, because the device counted it.
  const kcal: WrappedStat | null =
    energy ? { labelKey: "session.wrapped.kcal", value: `${energy.kcal}`, estimate: !energy.measured } : null;
  const avgHr: WrappedStat | null =
    session.device?.avgHr != null ? { labelKey: "session.device.avgHr", value: `${session.device.avgHr}` } : null;
  const effortStat: WrappedStat | null =
    effort != null ? { labelKey: "session.wrapped.effort", value: `${effort}` } : null;
  const volume: WrappedStat | null =
    receipt.tonnageKg > 0 ? { labelKey: "summary.volumeMoved", value: fmtTonnage(receipt.tonnageKg, units) } : null;
  // Strength sets only — the discipline gate below already keeps this tile away
  // from a swim or a match, and `strengthSets` keeps a MIXED day's count honest
  // (the effort counter would have padded it with one per cardio block).
  const sets: WrappedStat | null =
    receipt.strengthSets > 0 ? { labelKey: "summary.sets", value: String(receipt.strengthSets) } : null;
  const repsStat: WrappedStat | null = reps > 0 ? { labelKey: "session.wrapped.reps", value: String(reps) } : null;
  const roundsStat: WrappedStat | null =
    rounds > 0 ? { labelKey: "session.wrapped.rounds", value: String(rounds) } : null;
  const elevationStat: WrappedStat | null =
    elevation > 0 ? { labelKey: "session.wrapped.elevation", value: `${Math.round(elevation)} m` } : null;

  // ---- BASICS (free) — four tiles, chosen for the discipline. -------------
  // TWO SEPARATE DECISIONS, and they used to be one line of code doing both.
  //
  // WHICH four: a priority list per discipline — the first four that have
  // something true to say win, so a swim never falls back to "1 set" just to
  // fill a slot, and a lifting day doesn't spend a tile on pace. That judgement
  // is this file's, and it is unchanged.
  //
  // WHAT ORDER they then read in: the app's, not this file's (figure-order.ts).
  // Five disciplines had five sequences here — strength opened on sets,
  // endurance on distance, a sport on minutes — so the same session's tonnage
  // sat in a different corner of the grid depending on what it was called, and
  // none of it agreed with the Progress card or the feed. Priority picks the
  // four; the reading order lays them out.
  const wanted: [string, WrappedStat | null][] =
    discipline === "strength"
      ? [["sets", sets], ["reps", repsStat], ["tonnage", volume], ["hours", minutes], ["kcal", kcal], ["hr", avgHr]]
      : discipline === "endurance"
        ? [["distance", distance], ["hours", minutes], ["pace", pace], ["kcal", kcal], ["hr", avgHr], ["elevation", elevationStat], ["effort", effortStat]]
        : discipline === "sport"
          ? [["hours", minutes], ["kcal", kcal], ["hr", avgHr], ["effort", effortStat], ["distance", distance]]
          : discipline === "conditioning"
            ? [["hours", minutes], ["rounds", roundsStat], ["kcal", kcal], ["hr", avgHr], ["effort", effortStat]]
            : [["hours", minutes], ["distance", distance], ["tonnage", volume], ["kcal", kcal], ["hr", avgHr], ["pace", pace], ["sets", sets]];
  const basics = orderFigures(
    wanted.filter((w): w is [string, WrappedStat] => w[1] != null).slice(0, 4),
    ([key]) => key,
  ).map(([, s]) => s);

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
    if (energy && energy.metMinutes > 0)
      facts.push({ labelKey: "session.wrapped.intensity", value: `${energy.metMinutes}`, tone: "neutral" });
  }
  // The peak the wrist saw — a fact no log can produce, so it rides on every
  // discipline (a matched lifting session has a heart rate too).
  if (session.device?.maxHr != null)
    facts.push({ labelKey: "session.device.maxHr", value: `${session.device.maxHr} bpm`, tone: "neutral" });
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
  // and no calorie estimate worth the name. That's the device-shaped hole — and
  // a matched session can never be in it, since a device is exactly what fills
  // it (`basis: "device"`).
  const sparse = pace == null && effort == null && (energy == null || energy.basis === "duration");

  return { discipline, headline, basics, facts, energy, sparse, measured: receipt.measured };
}
