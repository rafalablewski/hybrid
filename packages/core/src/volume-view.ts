import type { MuscleGroup } from "./engines/types";
import type { MuscleVolumeStatus, VolumeLandmark, VolumeZone } from "./engines/landmarks";
import type { LandmarkSource } from "./engines/landmark-resolve";
import type { LandmarkFactor } from "./engines/landmark-profile";
import { ALL_MUSCLES } from "./engines/movements";
import { blockWeeks, targetSetsForWeek, type BlockWeek, type BlockWeekKind, type VolumeBlock } from "./engines/volume-block";

/**
 * VOLUME — the view model shared by both clients' Volume screen.
 *
 * The engine (engines/landmarks.ts) answers "how many sets, which zone, what
 * nudge". This module answers the two *presentation* questions that were being
 * re-derived (and drifting) in each client:
 *
 *  1. WHERE does a muscle sit on a rail that can be compared across muscles?
 *     Each muscle has its own landmarks — Triceps top out at 18 sets, Back at
 *     22 — so a rail scaled to absolute sets puts every muscle's productive
 *     band at a different x. Stacked, those bars are unreadable: you cannot see
 *     "over the ceiling" as a shape, only as a number you must parse per row.
 *     `railX` normalises against the athlete's OWN landmarks, so MEV, the MAV
 *     band and MRV land at the SAME x on every row and the column of bars reads
 *     as one picture. The absolute set count is always printed alongside — the
 *     rail shows position, the numeral carries the quantity.
 *
 *  2. WHAT is the one-line verdict for the whole week? `volumeSummary` reduces
 *     seven per-muscle statuses to the hero: how many are in range, which are
 *     over, which are under, and which sentence to lead with.
 */

/** Fixed anchors on the normalised rail (0…1). Identical for every muscle, so
 *  rows stack into a comparable picture. The MAV band therefore always occupies
 *  the same slab of the track, and anything past `mrv` is in the overshoot tail. */
export const RAIL = { mev: 0.34, mavHigh: 0.72, mrv: 0.86 } as const;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Position (0…1) of `sets` on the normalised rail for one muscle's landmarks.
 * Piecewise-linear between the anchors: 0→MEV maps to 0→0.34, MEV→MAVhigh to
 * 0.34→0.72, MAVhigh→MRV to 0.72→0.86, and beyond MRV runs an overshoot tail
 * that saturates at 1.0 once you are 50% past the ceiling (so a wildly
 * over-cooked muscle pins the rail rather than escaping it).
 */
export function railX(sets: number, l: VolumeLandmark): number {
  if (!(sets > 0)) return 0;
  if (sets <= l.mev) return l.mev > 0 ? lerp(0, RAIL.mev, sets / l.mev) : RAIL.mev;
  if (sets <= l.mavHigh) {
    const span = l.mavHigh - l.mev;
    return span > 0 ? lerp(RAIL.mev, RAIL.mavHigh, (sets - l.mev) / span) : RAIL.mavHigh;
  }
  if (sets <= l.mrv) {
    const span = l.mrv - l.mavHigh;
    return span > 0 ? lerp(RAIL.mavHigh, RAIL.mrv, (sets - l.mavHigh) / span) : RAIL.mrv;
  }
  const tail = l.mrv > 0 ? (sets - l.mrv) / (l.mrv * 0.5) : 1;
  return lerp(RAIL.mrv, 1, clamp01(tail));
}

/** Everything a rail needs to draw itself, all in 0…1 track space. */
export interface RailGeometry {
  /** How far the fill runs — the athlete's current position. */
  x: number;
  /** Start of the productive (MAV) band. */
  bandStart: number;
  /** End of the productive (MAV) band — always `RAIL.mavHigh`. */
  bandEnd: number;
  /** The MEV threshold tick — always `RAIL.mev`. */
  mev: number;
  /** The MRV ceiling tick — always `RAIL.mrv`. */
  mrv: number;
}

export function railGeometry(s: MuscleVolumeStatus): RailGeometry {
  return {
    x: railX(s.sets, s.landmark),
    bandStart: railX(s.landmark.mavLow, s.landmark),
    bandEnd: RAIL.mavHigh,
    mev: RAIL.mev,
    mrv: RAIL.mrv,
  };
}

/** The three landmark VALUES a row prints beneath its rail. Because the rail is
 *  normalised, they sit at fixed anchors — the same anchors the section legend
 *  names once as MEV / MAV / MRV — so the words are the column headers and each
 *  row supplies its own numbers underneath. That is what replaces the old
 *  per-row swatch legend: same information, stated as a scale rather than a key
 *  redrawn seven times. */
export interface RailScale {
  mev: string;
  /** The MAV range, collapsed to a single value when low and high coincide. */
  mav: string;
  mrv: string;
  mevX: number;
  /** Midpoint of the MAV band — always inside the band, on every muscle. */
  mavX: number;
  mrvX: number;
}

export function railScale(l: VolumeLandmark): RailScale {
  return {
    mev: String(l.mev),
    mav: l.mavLow === l.mavHigh ? String(l.mavHigh) : `${l.mavLow}–${l.mavHigh}`,
    mrv: String(l.mrv),
    mevX: RAIL.mev,
    mavX: (RAIL.mev + RAIL.mavHigh) / 2,
    mrvX: RAIL.mrv,
  };
}

/** The three landmark bands an athlete can spotlight from a row's scale. */
export type VolumeBandKey = "mev" | "mav" | "mrv";
export const BAND_KEYS: readonly VolumeBandKey[] = ["mev", "mav", "mrv"] as const;

/**
 * The stretch of rail (0…1) a band occupies for one muscle. Tapping a scale
 * label spotlights this region on EVERY row at once — dimming the rest — so
 * "which part of the bar is my productive range" is answered by the chart
 * itself instead of by a paragraph. `mev` is the shortfall below the minimum,
 * `mav` the productive band, `mrv` the territory past the ceiling.
 */
export function bandRegion(key: VolumeBandKey, l: VolumeLandmark): { from: number; to: number } {
  if (key === "mev") return { from: 0, to: RAIL.mev };
  if (key === "mav") return { from: railX(l.mavLow, l), to: RAIL.mavHigh };
  return { from: RAIL.mrv, to: 1 };
}

/** Which sentence the hero leads with. */
export type VolumeVerdict = "none" | "balanced" | "over" | "under" | "mixed";

export interface VolumeSummary {
  /** Muscle groups considered (always the full set). */
  total: number;
  /** Muscles at or above MEV and not past MRV — the ones you leave alone. */
  inRange: number;
  /** At/over MRV — ease off. Most over-cooked first. */
  over: MuscleVolumeStatus[];
  /** Below MEV — add sets. Biggest shortfall first. */
  under: MuscleVolumeStatus[];
  /** Above the MAV band but under the ceiling — deliberate overreach, hold. */
  peak: MuscleVolumeStatus[];
  /** Nothing logged at all this week. */
  empty: boolean;
  verdict: VolumeVerdict;
}

/** Reduce the seven per-muscle statuses to the hero verdict. */
export function volumeSummary(rows: MuscleVolumeStatus[]): VolumeSummary {
  const by = (z: VolumeZone) => rows.filter((r) => r.zone === z);
  const over = by("overreaching").sort((a, b) => a.deltaSets - b.deltaSets);
  const under = by("under").sort((a, b) => b.deltaSets - a.deltaSets);
  const peak = by("peak");
  const inRange = by("productive").length + peak.length;
  const empty = rows.every((r) => r.sets <= 0);
  const verdict: VolumeVerdict = empty
    ? "none"
    : over.length && under.length
      ? "mixed"
      : over.length
        ? "over"
        : under.length
          ? "under"
          : "balanced";
  return { total: rows.length, inRange, over, under, peak, empty, verdict };
}

/** Display order for the by-muscle list: what needs attention first, then the
 *  muscles that are fine. Within a group, the biggest change leads. */
const URGENCY: Record<VolumeZone, number> = { overreaching: 0, under: 1, peak: 2, productive: 3 };

export function sortByUrgency(rows: MuscleVolumeStatus[]): MuscleVolumeStatus[] {
  return [...rows].sort(
    (a, b) => URGENCY[a.zone] - URGENCY[b.zone] || Math.abs(b.deltaSets) - Math.abs(a.deltaSets),
  );
}

/** Format a set count for display — whole numbers stay whole, fractional
 *  counting (a compound's secondary muscles at 0.5) keeps its half. */
export function setsLabel(sets: number): string {
  return Number.isInteger(sets) ? String(sets) : sets.toFixed(1);
}

/** The signed set delta as a compact chip label: `+9`, `−10`, or `—` when the
 *  prescription is to hold. Uses a real minus sign, not a hyphen. */
export function deltaLabel(s: MuscleVolumeStatus): string {
  const n = Math.round(s.deltaSets);
  if (n === 0) return "—";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** Muscle groups in the order the hero's week-shape draws them (the engine's
 *  natural order, so the shape and the list agree row for row). */
export function shapeOrder(rows: MuscleVolumeStatus[]): MuscleGroup[] {
  return rows.map((r) => r.muscle);
}

/* ────────────────────────────────────────────────────────────────────────────
 * WHOSE NUMBERS ARE THESE — and where in the block we are.
 *
 * Both clients render the same two answers, so the i18n keys, the percentages
 * and the ramp geometry are derived once here rather than in each screen.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * THE SEVEN MUSCLE GROUPS' NAMES — one map, because it was two.
 *
 * Each Volume screen carried its own `MUSCLE_KEY` literal, and `posterior` is
 * why that matters: its key is `musclePosteriorChain`, so any surface that
 * derives the key from the group name (the obvious shortcut) prints the raw key
 * for one row out of seven. A third copy would have made the same mistake.
 */
export const MUSCLE_GROUP_KEY: Record<MuscleGroup, string> = {
  quads: "w.analyze.vol.muscleQuads",
  glutes: "w.analyze.vol.muscleGlutes",
  posterior: "w.analyze.vol.musclePosteriorChain",
  back: "w.analyze.vol.muscleBack",
  chest: "w.analyze.vol.muscleChest",
  shoulders: "w.analyze.vol.muscleShoulders",
  triceps: "w.analyze.vol.muscleTriceps",
};

/** i18n key naming the layer the landmarks came from. */
export function sourceLabelKey(source: LandmarkSource): string {
  return `w.analyze.vol.source${source.charAt(0).toUpperCase()}${source.slice(1)}`;
}

/** i18n key for the sentence explaining that layer. */
export function sourceWhyKey(source: LandmarkSource): string {
  return `w.analyze.vol.sourceWhy${source.charAt(0).toUpperCase()}${source.slice(1)}`;
}

/** The four layers, in the order `athleteLandmarks` applies them. */
export const LANDMARK_LAYERS: readonly LandmarkSource[] = ["population", "profile", "observed", "manual"] as const;

/** One rung of the provenance ladder. */
export interface ProvenanceRung {
  source: LandmarkSource;
  labelKey: string;
  /** The sentence explaining this layer — shown when the rung is selected. */
  whyKey: string;
  /** True when this layer actually contributed to the numbers on screen. */
  lit: boolean;
  /** True for the DEEPEST lit layer — the one that names the landmarks. */
  active: boolean;
  /** 0…1 confidence this layer can claim, or null when it carries none of its
   *  own: population is the floor everyone starts from, and a number the
   *  athlete typed is not an estimate to be confident about. */
  confidence: number | null;
}

/**
 * WHOSE NUMBERS ARE THESE, drawn as a ladder rather than said as a word.
 *
 * `athleteLandmarks` layers population table → profile estimate → what the log
 * observed → the athlete's own edits, and hands back `layers` (what actually
 * contributed) and `source` (the deepest of them). Reduced to a single caption —
 * "Learned from your training" — that provenance is a claim the athlete has to
 * take on trust. As a ladder it is a picture: four rungs, lit as far as the
 * evidence reaches, each carrying the confidence that layer can honestly claim.
 * You read how personal the numbers are before you read a word, and you can see
 * what is still unlit — which is the same thing as seeing what to do next.
 *
 * Shared by both clients so the rungs, their order and their confidences cannot
 * drift apart.
 */
export function provenanceLadder(resolved: {
  layers: LandmarkSource[];
  source: LandmarkSource;
  profileConfidence: number;
  observedConfidence: number;
}): ProvenanceRung[] {
  const lit = new Set(resolved.layers);
  return LANDMARK_LAYERS.map((source) => ({
    source,
    labelKey: sourceLabelKey(source),
    whyKey: sourceWhyKey(source),
    lit: lit.has(source),
    active: source === resolved.source,
    confidence:
      source === "profile" ? resolved.profileConfidence
      : source === "observed" ? resolved.observedConfidence
      : null,
  }));
}

/** A rung's trailing figure: its confidence when it has one, an em dash when the
 *  layer has not been reached, and nothing when it is lit but carries no
 *  estimate of its own. */
export function rungMeta(rung: ProvenanceRung): string {
  if (!rung.lit) return "—";
  return rung.confidence != null ? `${Math.round(rung.confidence * 100)}%` : "";
}

/** i18n key naming which end of the band a factor moved. */
export function factorAffectsKey(affects: LandmarkFactor["affects"]): string {
  return `w.analyze.vol.affects${affects.charAt(0).toUpperCase()}${affects.slice(1)}`;
}

/** i18n key naming one personalization factor. */
export function factorLabelKey(key: LandmarkFactor["key"]): string {
  return `w.analyze.vol.factor${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

/** i18n key naming a block week's job. */
export function blockKindKey(kind: BlockWeekKind): string {
  return `w.analyze.vol.kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

/** A factor's effect as a signed percentage: `+8%`, `−15%`, `—` at parity.
 *  Real minus sign, not a hyphen. */
export function factorPercent(multiplier: number): string {
  const pct = Math.round((multiplier - 1) * 100);
  if (pct === 0) return "—";
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

/** One column of the block's ramp strip. */
export interface RampColumn extends BlockWeek {
  /** 0…1 — the week's prescribed volume against the athlete's total ceiling. */
  height: number;
  /** Total prescribed working sets that week, across every muscle. */
  sets: number;
  current: boolean;
}

/**
 * The block drawn as a shape: one column per week, each as tall as that week's
 * total prescribed sets measured against the athlete's total MRV. Read left to
 * right it IS the periodization — a low introduction week, a climb, and the
 * step down of the deload — which is the whole argument for ramping said
 * without a sentence.
 */
export function blockRamp(block: VolumeBlock, landmarks: Record<MuscleGroup, VolumeLandmark>): RampColumn[] {
  const ceiling = ALL_MUSCLES.reduce((s, m) => s + landmarks[m].mrv, 0) || 1;
  return blockWeeks(block).map((w) => {
    const sets = ALL_MUSCLES.reduce((s, m) => s + targetSetsForWeek(landmarks[m], w, block.peakAt), 0);
    return { ...w, sets, height: clamp01(sets / ceiling), current: w.week === block.week };
  });
}

/** How this week's logged sets compare to the block's target for that muscle. */
export type TargetVerdict = "under" | "on" | "over";

/** On-target within one set either way — a rounded prescription doesn't deserve
 *  to be reported as a miss. */
export function targetVerdict(sets: number, target: number): TargetVerdict {
  const delta = sets - target;
  if (delta > 1) return "over";
  if (delta < -1) return "under";
  return "on";
}

export const TARGET_VERDICT_KEY: Record<TargetVerdict, string> = {
  under: "w.analyze.vol.underTarget",
  on: "w.analyze.vol.onTarget",
  over: "w.analyze.vol.overTarget",
};
