import type { LoggedSession, CardioBlock } from "./session";
import { developmentFraction, type Sex } from "../benchmarks";

/**
 * THE ENDURANCE HALF — one read, six disciplines.
 *
 * ONE ENGINE, MANY GEARBOXES. An advanced runner who swims as a hobby does not
 * have mediocre endurance. Her aerobic engine is advanced; her swim is slow
 * because of technique, position and breathing constraint, none of which is
 * fitness. The physiology is a one-line argument:
 *
 *     performance = engine × economy,   economy ≤ 1   ⟹   engine ≥ performance
 *
 * Every discipline hands back a LOWER BOUND on the same underlying capacity.
 * Which makes averaging not merely unkind but invalid — the mean of two lower
 * bounds is not a lower bound, and an elite run averaged with a hobby swim
 * produces a number that is false about both. The maximum is the tightest bound
 * the evidence supports, and it is the only operation on floors that is
 * defensible at all.
 *
 * SO WHEN DO WE SKIP THE WORSE RESULTS? Never — under a maximum they cannot win,
 * so there is nothing to discard. The risk runs the other way: with six
 * disciplines an athlete gets six chances at a flattering reading, and that bias
 * compounds. Every gate in this file therefore acts on the GOOD results, inside
 * a discipline, before it is allowed to compete:
 *
 *   1. SECOND BEST, NOT BEST. A discipline with two or more qualifying efforts
 *      speaks with its second best. One downhill 5 km, one wind-aided row, one
 *      drifting GPS track cannot set a level: a fluke happens once, a capacity
 *      happens twice.
 *   2. A SINGLE EFFORT IS UNCONFIRMED. Still read — refusing to say anything to
 *      an athlete with one honest race would be worse — but marked, so the
 *      confidence and the public badge can treat it accordingly.
 *   3. ITS OWN VALID RANGE. Each discipline defines what counts as a test of the
 *      engine rather than of something else.
 *   4. CAPPED WHERE THE STANDARD IS SOFT. A discipline whose conditions vary
 *      more than its athletes may raise the level only so far on its own.
 *
 * And the weak results are not thrown away. They stop setting the level and
 * start CERTIFYING it, through the transfer matrix below: corroboration feeds
 * confidence, never the score, so a specialist is never demoted for
 * specialising.
 *
 * ADMISSION IS PER MODALITY, NOT PER SPORT. Rowing on an erg is one of the
 * best-standardised efforts in sport; the same athlete on water is nearly
 * unscoreable (boat class, crew, stream, wind). Cycling by power is the cleanest
 * signal of the six; cycling by speed is a fiction (gearing, terrain, draft).
 * Treating either sport as one thing would lose both.
 */

export type EnduranceDiscipline = "running" | "swimming" | "cycling" | "rowing" | "skiing" | "triathlon";

/** The disciplines the LEVEL engine can score. Deliberately not the same list
 *  as endurance.ts's ENDURANCE_DISCIPLINES, which is what the endurance hub
 *  DISPLAYS — walking is shown there and is not scoreable here, and triathlon is
 *  scoreable here and is not a cardio tag at all. */
export const SCOREABLE_DISCIPLINES: EnduranceDiscipline[] = [
  "running", "swimming", "cycling", "rowing", "skiing", "triathlon",
];

/* ────────────────────────────────────────────────────────────────────────────
 * THE COMMON CURRENCY.
 *
 * Paces cannot be compared across water, road and snow, so nothing is compared
 * as a pace. Each discipline owns four entry thresholds in its OWN unit —
 * exactly the shape the five benchmark lifts already use — and a raw
 * performance is interpolated between them onto one unitless scale:
 *
 *     novice 25   intermediate 50   advanced 75   elite 100
 *
 * The scale deliberately runs PAST 100. An athlete standing on the elite floor
 * and one well beyond it must not be the same number, or every downstream
 * comparison would flatten the best athletes into one another.
 * ──────────────────────────────────────────────────────────────────────────── */
export const TIER_POINTS = 25;
export const ELITE_SCORE = 100;

/** One tier's worth of score. Two disciplines within this are "in agreement". */
export const AGREEMENT_BAND = TIER_POINTS;

export interface EnduranceStandard {
  discipline: EnduranceDiscipline;
  /**
   * Entry values for novice / intermediate / advanced / elite in the
   * discipline's normalised unit, for a MALE athlete at peak training age.
   * Published-standards territory, treated as a documented prior exactly like
   * the strength table and the injury calibration.
   */
  thresholds: [number, number, number, number];
  /** Power is better when higher; every pace is better when lower. */
  higherIsBetter: boolean;
  /**
   * Female thresholds. For a PACE this is a multiplier above 1 (an easier bar is
   * a slower one); for POWER it is below 1 (an easier bar is a lower one).
   */
  sexFactor: number;
  /** The effort measure that must fall inside [min, max] to be a valid test. */
  min: number;
  max: number;
  /**
   * Distance the effort is normalised to, and the fatigue exponent used to get
   * there (Riegel and its per-sport analogues). Absent for disciplines that are
   * not normalised by distance (cycling power, triathlon).
   */
  standardDistance?: number;
  exponent?: number;
  /** How many normalised units the reported figure is quoted per. */
  perUnits?: number;
  /**
   * A score this discipline may not lift the athlete past on its own, because
   * its conditions vary more than its athletes do. Another discipline agreeing
   * removes the ceiling — the cap is on the TABLE's confidence, never on the
   * athlete.
   */
  soloCap?: number;
}

/**
 * RUNNING — sec/km at a 5 km equivalent. The original endurance half; the
 * numbers are unchanged so no athlete's level moves when this lands.
 */
const RUNNING: EnduranceStandard = {
  discipline: "running",
  thresholds: [360, 300, 250, 200],
  higherIsBetter: false,
  sexFactor: 1.11,
  min: 3, max: 45,
  standardDistance: 5, exponent: 1.06, perUnits: 5,
};

/**
 * SWIMMING — sec/100 m at a 400 m equivalent, POOL FREESTYLE only.
 *
 * Open water is excluded: current, chop and an unverifiable distance make the
 * clock describe the water rather than the swimmer. Freestyle only, because a
 * breaststroke table describes a different event and scoring one against the
 * other would libel every breaststroker.
 *
 * Elite entry is 4:48 for 400 m — strong club rather than world class, pitched
 * exactly where the run table's 16:40 5 km sits.
 */
const SWIMMING: EnduranceStandard = {
  discipline: "swimming",
  thresholds: [135, 110, 90, 72],
  higherIsBetter: false,
  // The freestyle male/female gap is materially smaller than running's, which is
  // one of the few places where copying the run factor would have been wrong.
  sexFactor: 1.06,
  min: 0.1, max: 1.5,
  standardDistance: 0.4, exponent: 1.03, perUnits: 4,
};

/**
 * ROWING — sec/500 m at a 2 km equivalent, ERG ONLY.
 *
 * The erg is among the most standardised efforts in all of sport: same machine,
 * same drag, no weather. On the water the same athlete is nearly unscoreable —
 * boat class, crew, stream and wind swing a 2 km split further than fitness
 * does — so water rows are left unread rather than guessed at.
 */
const ROWING: EnduranceStandard = {
  discipline: "rowing",
  thresholds: [135, 115, 100, 88],
  higherIsBetter: false,
  sexFactor: 1.1,
  min: 0.5, max: 10,
  standardDistance: 2, exponent: 1.06, perUnits: 4,
};

/**
 * CYCLING — watts per kilo, POWER ONLY, over a 20–60 minute effort.
 *
 * Speed is never admitted. Gearing, terrain, wind and draft mean identical
 * engines produce wildly different km/h, and a threshold table over raw speed
 * would be a fiction — which is why cycling was left unread entirely until now.
 * With a power meter it becomes the CLEANEST of the six: watts are watts.
 */
const CYCLING: EnduranceStandard = {
  discipline: "cycling",
  thresholds: [2.0, 3.0, 4.0, 5.0],
  higherIsBetter: true,
  // Higher-is-better, so an easier bar is a LOWER one.
  sexFactor: 0.85,
  min: 20, max: 60,
};

/**
 * CROSS-COUNTRY SKIING — sec/km at a 10 km equivalent.
 *
 * Capped at the top of advanced on its own. Course profile and snow condition
 * vary more than any other admitted discipline: the same skier is minutes per
 * kilometre apart on fresh powder and a fast groomed track. A second discipline
 * agreeing lifts the cap, because then the reading is no longer resting on the
 * snow that day.
 */
const SKIING: EnduranceStandard = {
  discipline: "skiing",
  thresholds: [360, 285, 225, 180],
  higherIsBetter: false,
  sexFactor: 1.12,
  min: 5, max: 50,
  standardDistance: 10, exponent: 1.06, perUnits: 10,
  soloCap: ELITE_SCORE - 1,
};

/**
 * TRIATHLON — total finishing time against the race's own distance class.
 *
 * Structurally the strongest evidence available, because it IS three disciplines
 * at once and therefore corroborates itself. Read from a session carrying swim,
 * bike and run blocks whose combined distance lands within tolerance of a
 * canonical race — a brick workout that happens to total 51 km is not an
 * Olympic-distance result, so the tolerance is deliberately tight.
 */
export interface TriathlonClass {
  key: "sprint" | "olympic" | "half" | "full";
  /** Combined swim + bike + run distance, km. */
  km: number;
  /** Finishing minutes for novice / intermediate / advanced / elite. */
  thresholds: [number, number, number, number];
}

export const TRIATHLON_CLASSES: TriathlonClass[] = [
  { key: "sprint", km: 25.75, thresholds: [105, 85, 70, 60] },
  { key: "olympic", km: 51.5, thresholds: [210, 170, 140, 120] },
  { key: "half", km: 113, thresholds: [420, 345, 300, 260] },
  { key: "full", km: 226, thresholds: [900, 720, 630, 540] },
];

/** How far a session's total distance may sit from a canonical race and still
 *  be read as one. Tight on purpose: a brick session is not a race. */
export const TRIATHLON_TOLERANCE = 0.12;

export const ENDURANCE_STANDARDS: EnduranceStandard[] = [RUNNING, SWIMMING, CYCLING, ROWING, SKIING];

export const standardFor = (d: EnduranceDiscipline): EnduranceStandard | undefined =>
  ENDURANCE_STANDARDS.find((s) => s.discipline === d);

/* ────────────────────────────────────────────────────────────────────────────
 * TRANSFER — which disagreements are informative.
 *
 * Two disciplines share an aerobic engine to very different degrees, and that
 * number is what decides whether a gap between them means anything.
 *
 * An elite runner who swims badly is UNREMARKABLE: swimming is the most
 * technique-bound sport on the list and the two barely constrain each other. An
 * elite runner who SKIS badly is surprising, because those correlate strongly —
 * and that pattern is usually a mis-tagged session or a bad GPS track rather
 * than a physiological marvel.
 *
 * A documented prior, in the same spirit as the strength standards, and the
 * right shape to be shrunk toward the athlete's own data the way personal.ts
 * shrinks the ACWR spike onset once enough history exists.
 * ──────────────────────────────────────────────────────────────────────────── */
const TRANSFER_PAIRS: Record<string, number> = {
  "running|skiing": 0.8,
  "running|triathlon": 0.85,
  "running|cycling": 0.6,
  "running|rowing": 0.55,
  "running|swimming": 0.3,
  "skiing|triathlon": 0.7,
  "cycling|skiing": 0.65,
  "rowing|skiing": 0.6,
  "skiing|swimming": 0.35,
  "cycling|triathlon": 0.8,
  "rowing|triathlon": 0.55,
  "swimming|triathlon": 0.65,
  "cycling|rowing": 0.55,
  "cycling|swimming": 0.35,
  "rowing|swimming": 0.45,
};

/** How much two disciplines constrain each other, 0…1. Symmetric. */
export function transfer(a: EnduranceDiscipline, b: EnduranceDiscipline): number {
  if (a === b) return 1;
  return TRANSFER_PAIRS[[a, b].sort().join("|")] ?? 0.5;
}

/** Transfer at or above which a disagreement is worth taking seriously. */
export const HIGH_TRANSFER = 0.7;

/* ────────────────────────────────────────────────────────────────────────────
 * THE ENGINE SCORE.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Thresholds shifted for sex and the age-development curve, in the
 *  discipline's own unit. */
export function shiftedThresholds(std: EnduranceStandard, sex: Sex, ageYears: number | null): number[] {
  const sexF = sex === "F" ? std.sexFactor : 1;
  const devF = ageYears == null ? 1 : developmentFraction(ageYears);
  // For a PACE an easier bar is a slower one, so the development factor divides;
  // for POWER an easier bar is a lower one, so it multiplies. Same idea, and the
  // sign of the operation is the only thing the direction changes.
  return std.thresholds.map((v) => (std.higherIsBetter ? v * sexF * devF : (v * sexF) / devF));
}

/**
 * A raw performance as a point on the shared 0…100+ scale.
 *
 * Linear between the four entries. BELOW novice it decays proportionally rather
 * than clamping to zero, so a genuinely slow effort still ranks against another
 * slow one. ABOVE elite it extrapolates at the advanced-to-elite rate, because
 * the athletes past that bar are exactly the ones a ceiling would flatten.
 */
export function engineScore(value: number, thresholds: number[], higherIsBetter: boolean): number {
  if (!Number.isFinite(value) || thresholds.length !== 4) return 0;
  // Work in "bigger is better" space so one set of comparisons covers both.
  const v = higherIsBetter ? value : 1 / Math.max(value, 1e-6);
  const t = thresholds.map((x) => (higherIsBetter ? x : 1 / Math.max(x, 1e-6)));

  if (v <= t[0]!) return Math.max(0, TIER_POINTS * (v / t[0]!));
  for (let i = 1; i < 4; i++) {
    if (v <= t[i]!) {
      const span = t[i]! - t[i - 1]!;
      const done = span <= 0 ? 0 : (v - t[i - 1]!) / span;
      return TIER_POINTS * i + TIER_POINTS * done;
    }
  }
  // Past elite: keep going at the advanced → elite rate.
  const topSpan = t[3]! - t[2]!;
  const past = topSpan <= 0 ? 0 : (v - t[3]!) / topSpan;
  return ELITE_SCORE + TIER_POINTS * past;
}

/* ────────────────────────────────────────────────────────────────────────────
 * READING THE LOG.
 * ──────────────────────────────────────────────────────────────────────────── */

/** One qualifying effort, already normalised and scored. */
export interface EnduranceEffort {
  discipline: EnduranceDiscipline;
  /** Display label — the distance covered, or the triathlon class. */
  label: string;
  /** The normalised figure in the discipline's unit: sec/km, sec/100 m,
   *  sec/500 m, W/kg, or finishing minutes. */
  value: number;
  /** The normalised total, seconds — pace disciplines only. */
  equivSec?: number;
  score: number;
  at: string;
}

/** What one discipline has to say, after its gates. */
export interface DisciplineRead {
  discipline: EnduranceDiscipline;
  /** The effort that speaks: the SECOND best when there are two or more. */
  effort: EnduranceEffort;
  /** The athlete's actual best, when it is not the one speaking — kept so a
   *  surface can show the PR without the PR having set the level. */
  best?: EnduranceEffort;
  /** How many qualifying efforts the window held. */
  efforts: number;
  /** False when a single effort is carrying it. */
  confirmed: boolean;
  /** The score after any solo cap. */
  score: number;
  /** True when `soloCap` actually bit — worth saying out loud. */
  capped: boolean;
}

const secondsOf = (b: CardioBlock): number =>
  b.seconds != null && b.seconds > 0 ? b.seconds : (b.minutes ?? 0) * 60;

/** A distance effort normalised to its discipline's standard distance. */
function normalise(std: EnduranceStandard, km: number, sec: number): { value: number; equivSec: number } | null {
  if (!(km >= std.min) || !(km <= std.max) || !(sec > 0)) return null;
  const equivSec = Math.round(sec * Math.pow(std.standardDistance! / km, std.exponent!));
  return { value: Math.round(equivSec / std.perUnits!), equivSec };
}

/**
 * Which discipline a cardio block can be scored as, or null.
 *
 * This is where admission-per-modality lives: a swim must be freestyle, a row
 * must be on an erg, a ride must carry power.
 */
export function admissibleDiscipline(b: CardioBlock): EnduranceDiscipline | null {
  const d = b.discipline;
  if (d === "running") return "running";
  if (d === "skiing") return "skiing";
  if (d === "swimming") {
    // Freestyle only. An untagged stroke is assumed freestyle, which is what
    // almost every logged swim is; a named other stroke is declined.
    const s = (b.stroke ?? "").trim().toLowerCase();
    if (s && !/free|front ?crawl|crawl/.test(s)) return null;
    return "swimming";
  }
  if (d === "rowing") {
    // Erg only — the name is how the log distinguishes it. On water is declined.
    if (/water|boat|scull|skiff|single|double|quad|eight/i.test(b.name)) return null;
    return "rowing";
  }
  if (d === "cycling") return b.watts != null && b.watts > 0 ? "cycling" : null;
  return null;
}

/** Every qualifying effort in the window, scored, by discipline. */
export function enduranceEfforts(
  sessions: LoggedSession[],
  opts: { sex?: Sex; ageYears?: number | null; bodyweightKg?: number | null; since: number; now: number },
): Map<EnduranceDiscipline, EnduranceEffort[]> {
  const sex: Sex = opts.sex ?? "M";
  const age = opts.ageYears ?? null;
  const out = new Map<EnduranceDiscipline, EnduranceEffort[]>();
  const push = (e: EnduranceEffort) => {
    const list = out.get(e.discipline) ?? [];
    list.push(e);
    out.set(e.discipline, list);
  };

  for (const s of sessions) {
    const t = Date.parse(s.startedAt);
    if (!Number.isFinite(t) || t < opts.since || t > opts.now) continue;
    const cardio = s.blocks.filter((b): b is CardioBlock => b.kind === "cardio");

    // A TRIATHLON is a property of the SESSION, not of any one block: swim, bike
    // and run together, totalling a canonical race. Checked first so the three
    // legs are not also read as three weak standalone efforts.
    const tri = triathlonEffort(cardio, s.startedAt, sex, age);
    if (tri) { push(tri); continue; }

    for (const b of cardio) {
      const d = admissibleDiscipline(b);
      if (!d) continue;
      const std = standardFor(d)!;
      const thresholds = shiftedThresholds(std, sex, age);

      if (d === "cycling") {
        // Power, per kilo, over an effort long enough to be aerobic.
        const mins = secondsOf(b) / 60;
        const bw = opts.bodyweightKg;
        if (!(mins >= std.min) || !(mins <= std.max) || !bw || !(bw > 0)) continue;
        const wkg = Math.round(((b.watts ?? 0) / bw) * 100) / 100;
        if (!(wkg > 0)) continue;
        push({ discipline: d, label: `${Math.round(mins)} min`, value: wkg, score: engineScore(wkg, thresholds, true), at: s.startedAt });
        continue;
      }

      const n = normalise(std, b.distance ?? 0, secondsOf(b));
      if (!n) continue;
      push({
        discipline: d,
        label: `${Math.round((b.distance ?? 0) * 10) / 10} km`,
        value: n.value,
        equivSec: n.equivSec,
        score: engineScore(n.value, thresholds, false),
        at: s.startedAt,
      });
    }
  }
  return out;
}

/** A session read as a triathlon, or null. */
function triathlonEffort(cardio: CardioBlock[], at: string, sex: Sex, age: number | null): EnduranceEffort | null {
  const has = (d: string) => cardio.some((b) => b.discipline === d && (b.distance ?? 0) > 0);
  if (!has("swimming") || !has("cycling") || !has("running")) return null;
  const km = cardio.reduce((a, b) => a + (b.distance ?? 0), 0);
  const sec = cardio.reduce((a, b) => a + secondsOf(b), 0);
  if (!(sec > 0)) return null;
  const cls = TRIATHLON_CLASSES.find((c) => Math.abs(km - c.km) / c.km <= TRIATHLON_TOLERANCE);
  if (!cls) return null;
  const sexF = sex === "F" ? 1.1 : 1;
  const devF = age == null ? 1 : developmentFraction(age);
  const thresholds = cls.thresholds.map((v) => (v * sexF) / devF);
  const minutes = Math.round(sec / 60);
  return {
    discipline: "triathlon",
    label: cls.key,
    value: minutes,
    equivSec: sec,
    score: engineScore(minutes, thresholds, false),
    at,
  };
}

/**
 * One discipline's verdict, after its gates.
 *
 * The SECOND best effort speaks whenever there are two, which is the single most
 * important line in this file: it is what stops one favourable course, one
 * tailwind or one bad GPS trace from buying a whole tier.
 */
export function readDiscipline(discipline: EnduranceDiscipline, efforts: EnduranceEffort[]): DisciplineRead | null {
  if (efforts.length === 0) return null;
  const sorted = [...efforts].sort((a, b) => b.score - a.score);
  const confirmed = sorted.length >= 2;
  const speaks = confirmed ? sorted[1]! : sorted[0]!;
  const cap = standardFor(discipline)?.soloCap;
  const capped = cap != null && speaks.score > cap;
  return {
    discipline,
    effort: speaks,
    best: confirmed ? sorted[0] : undefined,
    efforts: sorted.length,
    confirmed,
    score: capped ? cap! : speaks.score,
    capped,
  };
}

export interface EnduranceRead {
  /** The discipline that set the level — the maximum, always. */
  top: DisciplineRead;
  /** Every discipline that spoke, strongest first. */
  reads: DisciplineRead[];
  /** 0…1. Corroboration, not count. */
  confidence: number;
  /**
   * A discipline that transfers strongly from the top one yet sits two or more
   * tiers below it. Not a penalty — a flag, because that combination is far more
   * often a mis-tagged session than a physiological marvel.
   */
  contradiction?: DisciplineRead;
}

/** Confidence a single discipline carries on its own, before corroboration. */
export const CONFIRMED_BASE = 0.55;
export const UNCONFIRMED_BASE = 0.35;
export const CORROBORATION_WEIGHT = 0.2;
export const CONTRADICTION_PENALTY = 0.1;
export const CONFIDENCE_CAP = 0.85;

/**
 * THE ENDURANCE READ.
 *
 * The maximum sets the level. Everything else certifies it — a second discipline
 * within a tier of the top one raises confidence in proportion to how much the
 * two actually constrain each other, so an elite runner's hobby swim adds almost
 * nothing and a triathlete's three agreeing legs add a great deal. Nothing below
 * the maximum ever subtracts from the score.
 */
export function combineEndurance(byDiscipline: Map<EnduranceDiscipline, EnduranceEffort[]>): EnduranceRead | null {
  const reads: DisciplineRead[] = [];
  for (const [d, efforts] of byDiscipline) {
    const r = readDiscipline(d, efforts);
    if (r) reads.push(r);
  }
  if (reads.length === 0) return null;
  reads.sort((a, b) => b.score - a.score);
  const top = reads[0]!;

  let confidence = top.confirmed ? CONFIRMED_BASE : UNCONFIRMED_BASE;
  let contradiction: DisciplineRead | undefined;
  for (const r of reads.slice(1)) {
    const w = transfer(top.discipline, r.discipline);
    const gap = top.score - r.score;
    if (gap <= AGREEMENT_BAND) confidence += CORROBORATION_WEIGHT * w;
    else if (w >= HIGH_TRANSFER && gap >= AGREEMENT_BAND * 2) {
      confidence -= CONTRADICTION_PENALTY;
      if (!contradiction) contradiction = r;
    }
  }
  // A capped discipline standing alone stays capped; one that another discipline
  // agrees with has its ceiling lifted, because the reading is then no longer
  // resting on the snow that day.
  if (top.capped && reads.some((r) => r !== top && top.score - r.score <= AGREEMENT_BAND)) {
    top.score = top.effort.score;
    top.capped = false;
    reads.sort((a, b) => b.score - a.score);
  }

  return {
    top: reads[0]!,
    reads,
    confidence: Math.round(Math.min(CONFIDENCE_CAP, Math.max(0, confidence)) * 100) / 100,
    contradiction,
  };
}

/** i18n key naming each discipline's unit, so a swim is never labelled "per km". */
export const ENDURANCE_UNIT_KEY: Record<EnduranceDiscipline, string> = {
  running: "w.analyze.vol.levelPace",
  swimming: "w.analyze.vol.unitPer100m",
  rowing: "w.analyze.vol.unitPer500m",
  cycling: "w.analyze.vol.unitWkg",
  skiing: "w.analyze.vol.levelPace",
  triathlon: "w.analyze.vol.unitFinish",
};

export const ENDURANCE_DISCIPLINE_KEY: Record<EnduranceDiscipline, string> = {
  running: "w.analyze.vol.discRunning",
  swimming: "w.analyze.vol.discSwimming",
  cycling: "w.analyze.vol.discCycling",
  rowing: "w.analyze.vol.discRowing",
  skiing: "w.analyze.vol.discSkiing",
  triathlon: "w.analyze.vol.discTriathlon",
};

/** Whether the discipline's figure is a clock (pace) or a plain number. */
export const isPaceDiscipline = (d: EnduranceDiscipline): boolean => d !== "cycling";

/**
 * One endurance figure, formatted, with the i18n key for its own unit.
 *
 * Lives here rather than in either client because the alternative is two
 * implementations that eventually disagree about whether a swim is quoted per
 * 100 m or per km — and a swim labelled "per km" is not a rounding difference,
 * it is a different claim. Deliberately free of any import from fitness-level.ts
 * so the module graph stays one-way.
 */
export function enduranceFigure(e: { discipline?: EnduranceDiscipline; ratio: number }): { value: string; unitKey: string } {
  const d = e.discipline ?? "running";
  const v = e.ratio;
  const value = isPaceDiscipline(d)
    ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`
    : String(Math.round(v * 100) / 100);
  return { value, unitKey: ENDURANCE_UNIT_KEY[d] };
}
