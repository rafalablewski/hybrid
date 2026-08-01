import type { TrainingLog, EnergySystem } from "./types";
import { movementFor, canonicalExerciseName } from "./movements";
import { gymExercise, loadUnitCount, GYM_ALIASES } from "../exercise-db";
import { bwAt, type BodyweightInput } from "../bodyweight";
import { sportPacePerMeters, formatSportDistance, olympicSport, timedSportOnly } from "../olympic-sports";
import { fmtWeight, fmtTonnage, type WeightUnit } from "../units";
import type { DeviceWorkout } from "../session-device";
import { deviceTrueSession, deviceTrueSessions } from "../device-truth";

// The persisted Session.blocks shape (matches what the web logger writes and
// what the API stores as JSON). Shared so the logger, history, dashboards, and
// engines all agree on one structure.

export interface StrengthSet {
  load: string;
  reps: string;
  rpe?: string;
  /** mean concentric velocity for the set, m/s (VBT — sensor or manual entry) */
  vel?: string;
  /** peak concentric velocity, m/s */
  peakVel?: string;
  /** range of motion, cm */
  rom?: string;
  /**
   * Drop set — performed immediately after the previous set with NO rest and a
   * reduced load (strip weight, keep going to extend the set past failure).
   */
  drop?: boolean;
  /**
   * Rest taken BEFORE this set, in seconds — captured live by the mobile logger
   * (the gap between banking the previous set and banking this one). Optional, so
   * sessions logged without the live timer (web editor, imports) are unaffected.
   */
  rest?: number;
  /**
   * Set role. Absent (or "working") = a working set: it counts as training
   * volume and can set PRs. "warmup" (ramp/prep sets) and "cooldown" (light
   * back-off work) are EXCLUDED from working-set volume, tonnage, e1RM and PR
   * detection — but kept for the load–velocity profile (useful sub-maximal
   * points). Optional + additive, so every pre-existing session reads as working.
   * Orthogonal to `drop`: a drop set is still a working set.
   */
  role?: SetRole;
}

/** A strength set's role. Absent is treated as "working". */
export type SetRole = "warmup" | "working" | "cooldown";

/**
 * The single "type" a set presents in the logger — its role plus the drop flag
 * folded into one mutually-exclusive choice, since a set is exactly one of these.
 * Stored as two backward-compatible fields (`role` + `drop`); this is the UI view.
 */
export type SetType = "working" | "warmup" | "cooldown" | "drop";

type RoleDrop = { role?: SetRole; drop?: boolean };
const SET_TYPE_ORDER: SetType[] = ["working", "warmup", "cooldown", "drop"];

/** A set counts as training work unless it's a warm-up or cool-down (drops count). */
export const isWorkingSet = (s: { role?: SetRole }): boolean =>
  s.role !== "warmup" && s.role !== "cooldown";

/** The working sets of a strength block (warm-up / cool-down removed). */
export const workingSets = (b: StrengthBlock): StrengthSet[] => b.sets.filter(isWorkingSet);

/**
 * The sets that count toward VOLUME — working sets by default, or every set when
 * `includeWarmups` is on (the user setting "count warm-up & cool-down sets in
 * volume"). One helper so every volume computation honours the same rule.
 */
export const setsForVolume = (b: StrengthBlock, includeWarmups = false): StrengthSet[] =>
  includeWarmups ? b.sets : workingSets(b);

/** The mutually-exclusive UI type of a set, derived from its role + drop flag. */
export function setType(s: RoleDrop): SetType {
  if (s.role === "warmup") return "warmup";
  if (s.role === "cooldown") return "cooldown";
  if (s.drop) return "drop";
  return "working";
}

/**
 * Advance a set to the next type in the cycle (working → warm-up → cool-down →
 * drop → working), returning a NEW set with `role`/`drop` set accordingly and
 * every other field preserved. Generic so the web editor and mobile logger,
 * whose set shapes differ, share one source of truth and can't drift.
 */
export function cycleSetType<T extends RoleDrop>(s: T): T {
  const next = SET_TYPE_ORDER[(SET_TYPE_ORDER.indexOf(setType(s)) + 1) % SET_TYPE_ORDER.length];
  return {
    ...s,
    role: next === "warmup" ? "warmup" : next === "cooldown" ? "cooldown" : undefined,
    drop: next === "drop" ? true : undefined,
  };
}

/** The leftmost badge a set shows: its index for working, else W / C / ↓. */
export function setTypeBadge(s: RoleDrop, index: number): string {
  const t = setType(s);
  return t === "warmup" ? "W" : t === "cooldown" ? "C" : t === "drop" ? "↓" : String(index + 1);
}

/**
 * Move the item at `index` one slot in `dir` (-1 up / +1 down), clamped to the
 * ends (a no-op past either edge). Pure — returns a NEW array. Shared by the web
 * + mobile editors so reordering sets AND exercises has one source of truth (the
 * arrow controls), and can't drift between the two clients.
 */
export function moveItem<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (index < 0 || index >= arr.length || j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[index], next[j]] = [next[j]!, next[index]!];
  return next;
}

/**
 * Move the item from `from` to `to`, sliding the rest along (the drag-and-drop
 * reorder — drop an item anywhere, not just one slot). Pure — returns a NEW
 * array; a no-op when the indices are equal or out of range.
 */
export function moveItemTo<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

export interface WarmupStep {
  /** load in kg */
  load: number;
  reps: number;
}

/**
 * A warm-up ramp up to a working load (kg) — three sets at ~40/60/80% for 8/5/3
 * reps, rounded to plate-friendly 2.5 kg. Returns [] for bodyweight / near-empty
 * loads (nothing to ramp). Pure; the logger turns these into warm-up sets.
 */
export function warmupRamp(workingKg: number): WarmupStep[] {
  if (!Number.isFinite(workingKg) || workingKg <= 25) return [];
  const steps: [number, number][] = [
    [0.4, 8],
    [0.6, 5],
    [0.8, 3],
  ];
  return steps.map(([pct, reps]) => ({ load: Math.round((workingKg * pct) / 2.5) * 2.5, reps }));
}

/**
 * A friendly default title for a freshly-logged session, by time of day. The
 * logger no longer asks for a name up front (nobody names a workout), so both
 * clients seed the title from this — identical defaults across web + mobile. A
 * real name is only entered when saving a routine (or the optional finish-screen
 * rename). Returns plain English; this is stored data, not a translated label.
 */
export function defaultSessionTitle(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Late night workout";
  if (h < 12) return "Morning workout";
  if (h < 17) return "Afternoon workout";
  if (h < 21) return "Evening workout";
  return "Night workout";
}

export interface StrengthBlock {
  kind: "strength";
  name: string;
  sets: StrengthSet[];
  note?: string;
  /**
   * PLANNED rest between working sets, in seconds — a builder/routine
   * prescription. Distinct from StrengthSet.rest, which is the ACTUAL rest the
   * live logger measured before a set. Optional + additive.
   */
  restSec?: number;
  /**
   * Superset group key — strength blocks sharing the same `group` are performed
   * together (no rest between exercises), shown as A1/A2/A3… The key is stable
   * (a uid), so a group survives reordering and can hold 3+ exercises.
   */
  group?: string;
  /**
   * @deprecated Legacy "supersetted with the NEXT block" flag (pre-group model).
   * Still read by `supersetLabels` for back-compat; new writes use `group`.
   */
  superset?: boolean;
}

/**
 * Coarse cardio modality — what KIND of endurance/sport activity a cardio block
 * is, independent of its display name. Endurance modalities are named
 * specifically; a known non-distance sport (tennis, football, judo…) is
 * `"sport"` (counts as neither running nor endurance mileage); anything else
 * generic is `"other"`. Lets the Running screen stay runs-only and the endurance
 * summaries exclude racket/team/combat sports without re-guessing from the name.
 */
export type CardioDiscipline =
  | "running"
  | "swimming"
  | "cycling"
  | "rowing"
  | "skiing"
  | "walking"
  | "sport"
  | "other";

export interface CardioBlock {
  kind: "cardio";
  name: string;
  /**
   * The activity's coarse modality — stamped at log time when the sport is known
   * (the sport/run loggers set it), else backfilled from the name on read by
   * `migrateBlocks`. Consumers should prefer this over re-classifying the name.
   */
  discipline?: CardioDiscipline;
  /** distance covered, km — pace is derived from minutes. */
  distance?: number;
  minutes?: number;
  /**
   * The SAME moving time to the second. Never typed and never persisted — it is
   * written only by the device projection (device-truth.ts) from a matched
   * recording's `durationSec`, so a derived pace can agree with the watch's own
   * summary: 510 m in 19:41 is 3:52 /100m, but rounded to 20 min it reads 3:55.
   * Every pace helper prefers it and falls back to `minutes`.
   */
  seconds?: number;
  rpe?: number;
  /** Treadmill incline, percent (shown only for treadmill-style activities). */
  incline?: number;
  /** Swim stroke — Free, Breast, Back, Fly, IM… (shown only for swim activities). */
  stroke?: string;
  /** Target heart-rate zone, 1–5. */
  zone?: number;
  /** Elevation gain, metres (outdoor climb sports — runs, rides, hikes). */
  elevation?: number;
}

export interface ConditioningBlock {
  kind: "conditioning";
  name: string;
  format?: string;
  work?: number;
  rest?: number;
  rounds?: number;
  minutes?: number;
  rpe?: number;
  /**
   * @deprecated Cardio distance now lives on its own `cardio` block kind. Still
   * read by `migrateBlocks` to upgrade sessions logged before the split.
   */
  distance?: number;
}

export type SessionBlock = StrengthBlock | CardioBlock | ConditioningBlock;

export type BlockKind = SessionBlock["kind"];

export interface LoggedSession {
  id: string;
  title: string;
  startedAt: string; // ISO
  completedAt?: string | null;
  blocks: SessionBlock[];
  readiness?: number | null;
  // Private post-workout reflection (owner-only; never serialised to others).
  note?: string | null;
  mood?: number | null;
  tags?: string[] | null;
  /**
   * "How did that feel?" — perceived effort (1..5) and fatigue after (1..5),
   * asked once on the post-workout Wrapped. Effort × duration is the session's
   * internal training load (sRPE); see session-feel.ts for the model and why
   * two identical-looking sessions are not the same session.
   */
  feel?: number | null;
  fatigue?: number | null;
  /**
   * WHEN the athlete answered "how did that feel?" (ISO). Not decoration: the
   * same `fatigue: 4` means an ordinary hard session an hour after training and
   * a recovery problem ten hours after it, so the lag between `completedAt` and
   * this is what makes the two comparable. See feel-timing.ts. Null on rows
   * written before the column existed — the models degrade to the raw report
   * rather than guessing a lag.
   */
  feelLoggedAt?: string | null;
  /**
   * The SAME workout as the athlete's device recorded it (Apple Watch via
   * HealthKit today), attached by the summary's match flow — measured duration,
   * kcal, heart rate next to the logged/estimated figures. Owner-only, frozen
   * at match time; see core/session-device.ts. Null/absent = never matched.
   */
  device?: DeviceWorkout | null;
}

const isStrength = (b: SessionBlock): b is StrengthBlock => b.kind === "strength";
export const isCardio = (b: SessionBlock): b is CardioBlock => b.kind === "cardio";
const num = (s: string | undefined): number => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

/** Estimated 1-rep max (Epley). */
export function e1rm(load: number, reps: number): number {
  return reps <= 0 ? 0 : load * (1 + reps / 30);
}

/**
 * Best estimated 1RM across a strength block's WORKING sets (warm-ups
 * excluded). Pass the athlete's `bodyweightKg` (at the session's date) so
 * bodyweight lifts rank on their EFFECTIVE load — a +20 kg weighted pull-up at
 * 70 kg BW is a 90 kg×reps effort, not a 20 kg one. Holds/carries (time or
 * distance measures) have no meaningful 1RM and return 0.
 */
export function blockBestE1rm(b: StrengthBlock, bodyweightKg?: number | null): number {
  if ((gymExercise(b.name)?.measure ?? "reps") !== "reps") return 0;
  let best = 0;
  for (const s of workingSets(b)) {
    const load = effectiveSetLoadKg(b.name, s.load, bodyweightKg);
    const reps = num(s.reps);
    if (load > 0 && !Number.isNaN(reps)) best = Math.max(best, e1rm(load, reps));
  }
  return best;
}

/**
 * Heaviest EFFECTIVE working-set load in a strength block (kg) — the ACTUAL top
 * weight lifted, not an estimated 1RM. Bodyweight-aware like `blockBestE1rm`
 * (a +20 kg weighted pull-up at 70 kg BW counts as 90 kg). Holds/carries (time
 * or distance measures) have no load and return 0. This is the headline
 * strength number; e1RM stays a secondary, derived stat.
 */
export function blockTopLoad(b: StrengthBlock, bodyweightKg?: number | null): number {
  if ((gymExercise(b.name)?.measure ?? "reps") !== "reps") return 0;
  let best = 0;
  for (const s of workingSets(b)) {
    const load = effectiveSetLoadKg(b.name, s.load, bodyweightKg);
    const reps = num(s.reps);
    if (load > 0 && !Number.isNaN(reps) && reps > 0) best = Math.max(best, load);
  }
  return best;
}

/**
 * Pace per km for a cardio block (e.g. "5:42 /km"), derived from distance +
 * minutes. Null unless both are logged — pace isn't stored, it's computed so it
 * can never disagree with the distance/time it came from.
 */
export function pacePerKm(b: { distance?: number; minutes?: number; seconds?: number }): string | null {
  const sec = cardioSeconds(b);
  if (!b.distance || b.distance <= 0 || sec == null) return null;
  return `${paceClock(sec / b.distance)} /km`;
}

/**
 * The moving time of a cardio effort in SECONDS — the device's measured seconds
 * when a matched recording supplied them, else the logged minutes. One helper so
 * every derived rate (pace lines, PRs, trends) reads the same clock; deriving
 * from whole minutes where a second-accurate one exists is how a 19:41 swim came
 * to disagree with the watch beside it. Null when nothing timed the effort.
 */
export function cardioSeconds(b: { minutes?: number; seconds?: number }): number | null {
  if (typeof b.seconds === "number" && b.seconds > 0) return b.seconds;
  return typeof b.minutes === "number" && b.minutes > 0 ? b.minutes * 60 : null;
}

/**
 * Sport-aware pace for a cardio/sport activity — per km for running/cycling, or
 * per the sport's split for metre sports (e.g. "1:30 /100m" for swimming, "2:00
 * /500m" for rowing). Reads the block NAME to pick the unit; falls back to /km
 * for plain cardio. Distance is always stored in km, so the math is single-unit.
 */
export function cardioPace(b: { name?: string; distance?: number; minutes?: number; seconds?: number }): string | null {
  const sec = cardioSeconds(b);
  if (!b.distance || b.distance <= 0 || sec == null) return null;
  return formatSportPace(sec / b.distance, b.name);
}

/** Format a seconds-per-km rate as the sport's labelled pace (e.g. "5:42 /km", "1:30 /100m"). */
export function formatSportPace(secPerKm: number, name?: string): string {
  const per = name ? sportPacePerMeters(name) : 1000;
  const label = per === 1000 ? "/km" : `/${per}m`;
  return `${paceClock(secPerKm * (per / 1000))} ${label}`;
}

/**
 * One-line summary of a cardio PR (distance furthest / pace fastest), rendered in
 * the move's natural unit (metres for swimming/rowing, km otherwise). `firstLabel`
 * is the caller-localized "first time" tag. One source of truth for the web + both
 * mobile PR lines so the distance/pace + delta math can't drift between them.
 * `value`/`previous` are km for a distance PR and seconds-per-km for a pace PR.
 */
export function formatCardioPr(
  p: { kind: "distance" | "pace"; move: string; value: number; previous: number | null },
  firstLabel: string,
): string {
  if (p.kind === "distance")
    return p.previous == null
      ? `${p.move} ${formatSportDistance(p.value, p.move)} (${firstLabel})`
      : `${p.move} ${formatSportDistance(p.value, p.move)} (+${formatSportDistance(p.value - p.previous, p.move)})`;
  const per = sportPacePerMeters(p.move) / 1000;
  const delta = p.previous != null ? ` (−${paceClock((p.previous - p.value) * per)})` : "";
  return `${p.move} ${formatSportPace(p.value, p.move)}${delta}`;
}

/**
 * One-line summary of a STRENGTH PR, headlining the weight actually moved (#231)
 * — never the estimated 1RM. One source of truth for the web + mobile PR lines
 * so the wording and delta math can't drift between them.
 *
 * Three shapes, because a record isn't always a heavier bar:
 *   first ever      → "Barbell Deadlift 100 kg (first!)"
 *   heavier than before → "Barbell Bench Press 82 kg (+6 kg)"
 *   same bar, more reps → "Pull-up 88 kg (more reps)"
 * The last case is why e1RM still DETECTS records — 100 kg × 5 → 100 kg × 8 is
 * a genuine PR that no weight comparison would ever catch.
 */
export function formatStrengthPr(
  p: { lift: string; topLoad: number; previousTopLoad: number | null },
  labels: { first: string; moreReps: string },
  units: WeightUnit = "kg",
): string {
  return `${p.lift} ${fmtWeight(p.topLoad, units)} (${strengthPrDelta(p, labels, units)})`;
}

/**
 * Just the "what changed" tag of a strength PR — the gain, the first-time label,
 * or the more-reps label. Split out of formatStrengthPr because the PR ROWS and
 * the Wrapped hero subtitle render the delta on its own, next to a lift name
 * that's already on screen. Both clients share this so the three-way branch
 * can't drift between them (it was hand-written in six places before).
 *
 * `first` differs by surface on purpose — a row says "first!", the hero says
 * "first ever" — so the caller passes the label it wants.
 *
 * Formats through fmtWeight rather than raw subtraction: topLoad is rounded to
 * 0.1 kg, so `100.1 - 95.3` is 4.799999999999997 in binary floating point.
 */
export function strengthPrDelta(
  p: { topLoad: number; previousTopLoad: number | null },
  labels: { first: string; moreReps: string },
  units: WeightUnit = "kg",
): string {
  if (p.previousTopLoad == null) return labels.first;
  if (p.topLoad > p.previousTopLoad) return `+${fmtWeight(p.topLoad - p.previousTopLoad, units)}`;
  return labels.moreReps;
}

/** Format seconds-per-km as a m:ss clock, e.g. 342 → "5:42". */
export function paceClock(secPerKm: number): string {
  // Round to whole seconds FIRST, then split — otherwise rounding the seconds
  // component alone can yield 60 (e.g. 359.6 → "5:60" instead of "6:00").
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface PacePoint {
  date: string; // ISO
  secPerKm: number;
}

/** Pace (sec/km) over time for one cardio move, oldest → newest. Lower is faster. */
export function paceSeries(sessions: LoggedSession[], move: string): PacePoint[] {
  // Pace off the device's distance + time when it measured the effort.
  const sorted = [...deviceTrueSessions(sessions)].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const pts: PacePoint[] = [];
  for (const s of sorted)
    for (const b of s.blocks) {
      if (!isCardio(b) || b.name !== move || !b.distance || b.distance <= 0) continue;
      const sec = cardioSeconds(b);
      if (sec != null) pts.push({ date: s.startedAt, secPerKm: Math.round(sec / b.distance) });
    }
  return pts;
}

/** The headline cardio move in a session (the one with the longest paced distance). */
export function headlineRunMove(blocks: SessionBlock[]): string | undefined {
  return blocks
    .filter((b): b is CardioBlock => isCardio(b) && !!b.distance && !!b.minutes)
    .sort((a, b) => (b.distance ?? 0) - (a.distance ?? 0))[0]?.name;
}

/**
 * One-line summary of a cardio block: distance, minutes, derived pace, RPE.
 * Shared so the web + mobile history/detail views read runs the same way.
 */
export function cardioSummary(b: CardioBlock, opts: { rpe?: boolean } = {}): string {
  const parts: (string | null | undefined)[] = [];
  // Distance + pace render in the sport's natural unit (metres for swimming /
  // rowing, km otherwise) — driven by the block name; storage stays km.
  if (b.distance) parts.push(formatSportDistance(b.distance, b.name));
  if (b.minutes) parts.push(`${b.minutes} min`);
  const pace = cardioPace(b);
  if (pace) parts.push(pace);
  if (opts.rpe && b.rpe) parts.push(`RPE ${b.rpe}`);
  return parts.filter(Boolean).join(", ") || "cardio";
}

/**
 * One-line summary of a conditioning (interval/metcon) block: format, the
 * interval (rounds × work/rest seconds), total minutes, and optionally RPE.
 */
export function conditioningSummary(b: ConditioningBlock, opts: { rpe?: boolean } = {}): string {
  const parts: (string | null | undefined)[] = [b.format];
  if (b.work && b.rest) parts.push(`${b.rounds ? `${b.rounds}×` : ""}${b.work}/${b.rest}s`);
  else if (b.rounds) parts.push(`${b.rounds} rounds`);
  if (b.minutes) parts.push(`${b.minutes} min`);
  if (opts.rpe && b.rpe) parts.push(`RPE ${b.rpe}`);
  return parts.filter(Boolean).join(", ");
}

/** One-line summary of any block. */
export function blockSummary(b: SessionBlock): string {
  if (isStrength(b)) return b.sets.map((s) => `${s.load || "–"}×${s.reps || "–"}`).join(", ");
  if (isCardio(b)) return cardioSummary(b);
  return conditioningSummary(b);
}

/**
 * Sessions whose START falls on the same calendar day as `now` (local time),
 * newest first. Drives the "done today" acknowledgement on Today — a quick sport
 * log or a finished prescribed session both surface here the moment they're
 * saved, so the athlete gets confirmation the workout counted. Shared by web +
 * mobile so the two Today screens can't drift.
 */
export function sessionsOnDay(sessions: LoggedSession[], now = Date.now()): LoggedSession[] {
  const day = new Date(now).toDateString();
  return sessions
    .filter((s) => new Date(s.startedAt).toDateString() === day)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

/** Whether the athlete has logged at least one session today. */
export function trainedToday(sessions: LoggedSession[], now = Date.now()): boolean {
  return sessionsOnDay(sessions, now).length > 0;
}

/**
 * Shape of a logged session, for choosing how to summarise it: STRENGTH (gym —
 * sets & tonnage), CARDIO (distance/pace, no strength blocks), or MIXED (both).
 * An empty session reads as strength.
 */
export function sessionShape(session: LoggedSession): "strength" | "cardio" | "mixed" {
  let strength = 0;
  let other = 0;
  for (const b of session.blocks) b.kind === "strength" ? strength++ : other++;
  if (strength && other) return "mixed";
  if (other && !strength) return "cardio";
  return "strength";
}

/**
 * A one-line, HONEST summary of a saved routine (WorkoutTemplate) for the
 * Quick-start picker — no fabricated numbers. `moves` is the block count; `kind`
 * is the discipline (single kind, else "mixed"); `minutes` is summed ONLY from
 * cardio/conditioning blocks that actually carry a minutes value (a pure gym
 * routine has none → null, so the client shows just the move count). Shared so
 * the web sheet + mobile sheet read identically.
 */
export function routineSummary(blocks: SessionBlock[]): {
  moves: number;
  minutes: number | null;
  kind: BlockKind | "mixed";
} {
  const moves = blocks.length;
  const kinds = [...new Set(blocks.map((b) => b.kind))];
  const kind: BlockKind | "mixed" = kinds.length === 1 ? (kinds[0] ?? "mixed") : "mixed";
  let minutes = 0;
  let hasMinutes = false;
  for (const b of blocks)
    if ((b.kind === "cardio" || b.kind === "conditioning") && typeof b.minutes === "number" && b.minutes > 0) {
      minutes += b.minutes;
      hasMinutes = true;
    }
  return { moves, minutes: hasMinutes ? Math.round(minutes) : null, kind };
}

/** Local clock time a session was logged at — "21:05" (locale clock, no
 *  seconds). One formatter shared by both clients (session rows, detail). */
export function sessionClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** The emoji glyph a logged session wears in a list row: the sport catalog's
 *  icon for a sport/cardio session (title = sport name for quick logs), the
 *  barbell for gym work. Shared so web + mobile rows can't drift. */
export function sessionIcon(session: LoggedSession): string {
  if (sessionShape(session) === "strength") return "🏋️";
  return olympicSport(session.title)?.icon ?? "🏃";
}

/**
 * Totals across a session's CARDIO blocks — distance (km), minutes, elevation
 * gain (m), and a derived overall pace (sec/km, distance-weighted). Powers the
 * non-gym session headline (Duration, Distance, Pace) so cardio/sport logs get
 * their own summary instead of the gym Sets/Volume framing.
 */
export function sessionCardioTotals(blocks: SessionBlock[]): {
  distanceKm: number;
  minutes: number;
  elevationM: number;
  secPerKm: number | null;
  count: number;
} {
  let distanceKm = 0;
  let minutes = 0;
  let sec = 0;
  let elevationM = 0;
  let count = 0;
  for (const b of blocks)
    if (isCardio(b)) {
      count++;
      if (b.distance) distanceKm += b.distance;
      if (b.minutes) minutes += b.minutes;
      // Pace runs off the second-accurate clock where a device recorded one
      // (`b.seconds`, see device-truth.ts) — deriving it from the whole minutes
      // shown beside it is how a 7:52 watch run at 5:47 /km came to read 5:53.
      sec += cardioSeconds(b) ?? 0;
      if (b.elevation) elevationM += b.elevation;
    }
  const secPerKm = distanceKm > 0 && sec > 0 ? Math.round(sec / distanceKm) : null;
  return { distanceKm, minutes, elevationM, secPerKm, count };
}

/**
 * `sessionCardioTotals` for a whole SESSION rather than a loose block list —
 * reading the DEVICE's measurement when one recorded it (see device-truth.ts).
 * Prefer this everywhere a session's distance/time is shown: a matched session
 * must never print the typed figures beside the summary's measured ones.
 */
export function sessionCardioSummary(session: LoggedSession): ReturnType<typeof sessionCardioTotals> {
  return sessionCardioTotals(deviceTrueSession(session).blocks);
}

/**
 * The one-line meta under a session's title in a list row (Today's Done-Today
 * card on both clients). Sport-adaptive, so a run reads as distance/time/pace
 * and a lift as tonnage + what was trained — never the gym Sets/Volume framing
 * on a swim.
 *
 *   cardio    "8.4 km – 44 min – 5:14 /km"
 *   swim      "0.2 km – 10 min – 5:00 /100m"
 *   timed     "75 min"           (a sport that tracks no distance)
 *   strength  "7.4 t – Back Squat – Romanian Deadlift"
 *
 * WHY IT LIVES IN CORE. It was hand-written twice — once in web today.tsx, once
 * in mobile home.tsx — as the same function, which is exactly how two clients
 * come to disagree about what a row says. One source, both callers.
 *
 * THE TAIL IS PACE, NOT A CLOCK TIME. This line used to end with the session's
 * startedAt ("… – 21:33"), which reads as when you trained but, for a
 * quick-logged sport, is stamped when the record is SAVED. Pace replaces it:
 * distance and duration say how much, pace is the only figure here that says
 * how hard, and it costs no new data — it's already implied by the two numbers
 * beside it.
 */
export function sessionMeta(session: LoggedSession, units: WeightUnit = "kg", bodyweightKg?: number | null): string {
  if (sessionShape(session) !== "strength") {
    // Measured where a device recorded it (see device-truth.ts).
    const ct = sessionCardioSummary(session);
    const parts: string[] = [];
    // Aggregate distance stays in KILOMETRES even for metre sports — per-effort
    // distances render in the sport's own unit, totals never do (olympic-sports.ts).
    if (ct.distanceKm) parts.push(`${ct.distanceKm.toFixed(1)} km`);
    if (ct.minutes) parts.push(`${ct.minutes} min`);
    const pace = sessionPaceTail(session, ct.secPerKm);
    if (pace) parts.push(pace);
    if (parts.length) return parts.join(" – ");
    return session.blocks.map((b) => b.name).join(" – ");
  }
  const vol = sessionVolume(session.blocks, false, bodyweightKg);
  const names = session.blocks.map((b) => b.name).join(" – ");
  return vol > 0 ? `${fmtTonnage(vol, units)} – ${names}` : names;
}

/**
 * The session's overall pace, labelled in its sport's split ("/km", "/100m",
 * "/500m") — or null when one number can't honestly describe the session.
 *
 * `secPerKm` from sessionCardioTotals is DISTANCE-WEIGHTED across every cardio
 * block, so a session that mixes sports with different splits (a swim and a run
 * in one log) would render one figure under one sport's label while describing
 * both. Those get no tail at all: the row's distance and duration are still
 * true, and a wrong pace is worse than no pace — which is the whole reason the
 * clock time came off this line.
 */
function sessionPaceTail(session: LoggedSession, secPerKm: number | null): string | null {
  if (secPerKm == null) return null;
  const moving = deviceTrueSession(session).blocks.filter(
    (b): b is CardioBlock => isCardio(b) && !!b.distance && b.distance > 0,
  );
  if (!moving.length) return null;
  const splits = new Set(moving.map((b) => sportPacePerMeters(b.name ?? "")));
  if (splits.size > 1) return null;
  return formatSportPace(secPerKm, moving[0]!.name);
}

/**
 * The most recent prior strength performance of EACH lift (newest session
 * first), keyed by lift name. One pass over a single sort, so the live logger
 * can show a "last time" reference per exercise without re-sorting history on
 * every render. Powers progressive overload — a target to beat.
 */
export function lastStrengthByLift(sessions: LoggedSession[]): Map<string, StrengthBlock> {
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  const map = new Map<string, StrengthBlock>();
  for (const s of sorted)
    for (const b of s.blocks)
      if (isStrength(b) && b.sets.length && !map.has(b.name)) map.set(b.name, b);
  return map;
}

// ----- Block kind inference + legacy migration -----

const CARDIO_RE = /\b(run|jog|walk|hike|ruck|sprint|swim|bike|cycl|ride|row(?!ing intervals)|erg|ski|elliptical|treadmill|cardio)\b/i;
const CONDITIONING_RE = /\b(metcon|emom|amrap|wod|circuit|interval|conditioning|tabata|complex|finisher)s?\b/i;

// Keyword → cardio modality, most-specific first so a shared word can't
// cross-classify: "Canoe Sprint" is rowing (not running via "sprint"), "Ski
// Erg" is skiing (not rowing via "erg"), "Bike Sprints" is cycling (not
// running), "Race Walking" is walking (not running via a stray "run"-like word).
// Leading word-boundary + stem (no trailing boundary) so "swim" matches
// "Swimming", "cycl" matches "Cycling", "run" matches "Running", etc.
const DISCIPLINE_PATTERNS: [CardioDiscipline, RegExp][] = [
  ["swimming", /\b(swim|freestyle|breaststroke|backstroke|butterfly|pool)/i],
  ["cycling", /\b(bike|biking|cycl|spin|peloton|bmx|ride|riding)/i],
  ["skiing", /\b(skiing|ski\b|skate|skating|snowboard)/i],
  ["walking", /\b(walk|hike|hiking|ruck|stair|step)/i],
  ["rowing", /\b(row|erg|paddle|kayak|canoe|scull)/i],
  ["running", /\b(run|jog|sprint|treadmill|fartlek|parkrun|marathon)/i],
];

/**
 * Coarse cardio modality for an activity NAME. Endurance modalities are matched
 * by keyword (running/swimming/cycling/rowing/skiing/walking — covering both the
 * Olympic endurance sports and generic/custom names like "Easy Run" or
 * "Treadmill"); a known Olympic sport that tracks no distance (tennis, football,
 * judo…) is `"sport"`; anything else generic is `"other"`. This is the fallback
 * when a block carries no stamped `discipline` — see `CardioDiscipline`.
 */
export function cardioDiscipline(name: string): CardioDiscipline {
  for (const [d, re] of DISCIPLINE_PATTERNS) if (re.test(name)) return d;
  if (timedSportOnly(name)) return "sport";
  return "other";
}

/**
 * Best-guess block kind for an exercise name — checks the MOVEMENTS catalog
 * first (a movement with a system / a "cond" pattern is cardio or conditioning),
 * then a keyword heuristic, defaulting to strength.
 */
export function inferBlockKind(name: string): BlockKind {
  const m = movementFor(name);
  if (m) {
    if (m.system == null && m.pattern !== "cond") return "strength";
    // A known engine move: aerobic steady → cardio; intervals/metcon → conditioning.
    if (CONDITIONING_RE.test(name)) return "conditioning";
    if (m.system === "aerobic" || CARDIO_RE.test(name)) return "cardio";
    return "conditioning";
  }
  if (CONDITIONING_RE.test(name)) return "conditioning";
  if (CARDIO_RE.test(name)) return "cardio";
  return "strength";
}

/**
 * Upgrade sessions logged BEFORE the cardio/conditioning split: a conditioning
 * block that carries a distance and no interval shape (work/rest/rounds) becomes
 * a cardio block. Idempotent and defensive over raw JSON — apply at every point
 * stored Session.blocks are read back into a LoggedSession.
 */
export function migrateBlocks(blocks: unknown, aliasMap: Record<string, string> = GYM_ALIASES): SessionBlock[] {
  if (!Array.isArray(blocks)) return [];
  const migrated = blocks.map((raw) => {
    const b = raw as Record<string, unknown>;
    if (
      b?.kind === "conditioning" &&
      typeof b.distance === "number" &&
      b.distance > 0 &&
      !b.work &&
      !b.rest &&
      !b.rounds
    ) {
      return {
        kind: "cardio",
        name: String(b.name ?? "Cardio"),
        distance: b.distance,
        ...(typeof b.minutes === "number" ? { minutes: b.minutes } : {}),
        ...(typeof b.rpe === "number" ? { rpe: b.rpe } : {}),
      } satisfies CardioBlock;
    }
    return raw as SessionBlock;
  });
  // Backfill each cardio block's modality from its (canonical) name unless it was
  // already stamped at log time — so every consumer can read `discipline` as a
  // stable tag rather than re-classifying the name. Derived AFTER canonicalizing
  // so a renamed move classifies off its current name.
  return canonicalizeBlockNames(migrated, aliasMap).map((b) =>
    b.kind === "cardio" && !b.discipline ? { ...b, discipline: cardioDiscipline(b.name) } : b,
  );
}

/**
 * Rewrite each block's exercise `name` to its CURRENT canonical name via an alias
 * map. The default map (`GYM_ALIASES`) heals built-in renames — so a lift logged
 * under an old catalog name (e.g. "Incline Bench Press") displays and attributes
 * under the new one everywhere — while a caller with the admin library on hand
 * passes `exerciseNameAliasMap(library)` to also fold admin-authored renames.
 * Only the display `name` changes; sets and every other field are untouched.
 * Idempotent and pure — safe to apply at any read boundary.
 */
export function canonicalizeBlockNames(
  blocks: SessionBlock[],
  aliasMap: Record<string, string> = GYM_ALIASES,
): SessionBlock[] {
  if (!aliasMap || Object.keys(aliasMap).length === 0) return blocks;
  return blocks.map((b) => {
    const canon = canonicalExerciseName(b.name, aliasMap);
    return canon === b.name ? b : { ...b, name: canon };
  });
}

/** Migrate the blocks of a whole session list read from storage. Threads an
 *  optional alias map through so a caller can canonicalize admin renames too. */
export function migrateSessions<T extends { blocks: unknown }>(
  sessions: T[],
  aliasMap: Record<string, string> = GYM_ALIASES,
): (Omit<T, "blocks"> & { blocks: SessionBlock[] })[] {
  return sessions.map((s) => ({ ...s, blocks: migrateBlocks(s.blocks, aliasMap) }));
}

// ----- Supersets (A1/A2/A3 groups) -----

type GroupedBlock = { kind: string; group?: string; superset?: boolean };

/** The superset group key for a block, normalizing the legacy `superset` flag. */
function groupKeyAt(blocks: GroupedBlock[], i: number): string | null {
  const b = blocks[i];
  if (!b || b.kind !== "strength") return null;
  if (b.group) return b.group;
  // Legacy boolean: `superset` meant "joined to the NEXT block". A contiguous
  // run of strength blocks linked that way is one group, keyed by its start.
  const linksToNext = (x?: GroupedBlock) => !!x && x.kind === "strength" && !!x.superset && !x.group;
  const inRun = (!!b.superset && !b.group) || linksToNext(blocks[i - 1]);
  if (!inRun) return null;
  let start = i;
  while (start > 0 && linksToNext(blocks[start - 1])) start--;
  return `legacy-${start}`;
}

/**
 * Per-block superset labels (e.g. ["A1","A2",null,"B1","B2"]). Groups are
 * lettered by first appearance; only groups with ≥2 members are labelled. One
 * source of truth so the web + mobile editors and detail views can't drift.
 */
export function supersetLabels(blocks: GroupedBlock[]): (string | null)[] {
  const keys = blocks.map((_, i) => groupKeyAt(blocks, i));
  const counts = new Map<string, number>();
  for (const k of keys) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  const letters = new Map<string, string>();
  const seq = new Map<string, number>();
  let nextLetter = 0;
  return keys.map((k) => {
    if (!k || (counts.get(k) ?? 0) < 2) return null;
    if (!letters.has(k)) letters.set(k, String.fromCharCode(65 + nextLetter++ % 26));
    const n = (seq.get(k) ?? 0) + 1;
    seq.set(k, n);
    return `${letters.get(k)}${n}`;
  });
}

/** True when a block shares a superset group with the block directly above it. */
export function isSupersettedWithPrev(blocks: GroupedBlock[], index: number): boolean {
  const k = groupKeyAt(blocks, index);
  return !!k && k === groupKeyAt(blocks, index - 1);
}

/**
 * Toggle whether the block at `index` is supersetted with the one directly
 * above it: joins (or extends) that group, or leaves it. Drops any group left
 * with a single member. Pure — returns a new array; `newKey` mints group ids.
 */
export function toggleSuperset<T extends { kind: string; group?: string; superset?: boolean }>(
  blocks: T[],
  index: number,
  newKey: () => string,
): T[] {
  const cur = blocks[index];
  const prev = blocks[index - 1];
  if (!cur || !prev || cur.kind !== "strength" || prev.kind !== "strength") return blocks;
  const next = blocks.slice();
  if (isSupersettedWithPrev(blocks, index)) {
    next[index] = { ...cur, group: undefined, superset: undefined };
  } else {
    const g = groupKeyAt(blocks, index - 1) ?? newKey();
    if (!prev.group) next[index - 1] = { ...prev, group: g, superset: undefined };
    next[index] = { ...cur, group: g, superset: undefined };
  }
  // Cleanup: a group with <2 members isn't a superset anymore.
  const counts = new Map<string, number>();
  for (const b of next) if (b.kind === "strength" && b.group) counts.set(b.group, (counts.get(b.group) ?? 0) + 1);
  return next.map((b) =>
    b.kind === "strength" && b.group && (counts.get(b.group) ?? 0) < 2 ? { ...b, group: undefined } : b,
  );
}

/**
 * The EFFECTIVE load of a strength set in kg, honouring the exercise's load
 * mode from the exercise DB: external = the entered load; bodyweight = the
 * athlete's bodyweight (10 pull-ups at 70 kg BW = 700 kg of work);
 * bodyweight-plus = BW + the entered added weight (+10 kg → 80 kg per rep);
 * assisted = BW − the entered assistance. When the bodyweight isn't known
 * (guest, never logged), it degrades to the entered number — exactly the
 * pre-bodyweight behaviour, so nothing regresses without data.
 */
export function effectiveSetLoadKg(
  exerciseName: string,
  load: string,
  bodyweightKg?: number | null,
): number {
  const n = parseFloat(load);
  const entered = Number.isFinite(n) ? n : 0;
  const bw = bodyweightKg != null && bodyweightKg > 0 ? bodyweightKg : 0;
  const mode = gymExercise(exerciseName)?.loadMode ?? "external";
  if (mode === "bodyweight") return bw;
  if (mode === "bodyweight-plus") return bw + entered;
  if (mode === "assisted") return Math.max(0, bw - entered);
  return entered;
}

/**
 * Does this lift's EFFECTIVE tonnage depend on the athlete's bodyweight? True
 * for rep-counted bodyweight / bodyweight-plus / assisted moves — the ones that
 * silently UNDER-count until a bodyweight is on file (a plain bodyweight lift
 * reads 0, a weighted one counts only the added plate). Holds and carries are
 * excluded (their seconds/metres are never tonnage), and an unknown lift is
 * external by default, so this is false for it.
 */
export function isBodyweightDependent(exerciseName: string): boolean {
  const ex = gymExercise(exerciseName);
  if (!ex || ex.measure !== "reps") return false;
  return ex.loadMode === "bodyweight" || ex.loadMode === "bodyweight-plus" || ex.loadMode === "assisted";
}

/**
 * Should the logger nudge the athlete to record a bodyweight? True when the
 * session has a bodyweight-dependent lift (see isBodyweightDependent) AND no
 * bodyweight is known — the case where tonnage reads wrong (often 0) until they
 * set it. Once a weight is on file this is false, so the nudge self-dismisses.
 */
export function needsBodyweight(blocks: SessionBlock[], bodyweightKg?: number | null): boolean {
  if (bodyweightKg != null && bodyweightKg > 0) return false;
  return blocks.some((b) => isStrength(b) && isBodyweightDependent(b.name));
}

/**
 * Tonnage (effective load × reps) summed across a session's strength sets.
 * Working sets only by default; pass `includeWarmups` to count warm-up /
 * cool-down sets too (the user volume setting). Pass the athlete's
 * `bodyweightKg` so bodyweight lifts count their true work (see
 * effectiveSetLoadKg). Sets measured in seconds or metres (planks, carries)
 * are never tonnage.
 */
export function sessionVolume(
  blocks: SessionBlock[],
  includeWarmups = false,
  bodyweightKg?: number | null,
): number {
  let v = 0;
  for (const b of blocks) {
    if (!isStrength(b)) continue;
    // A hold or carry's "reps" are seconds/metres — multiplying them by a
    // load isn't tonnage; skip the block entirely.
    const measure = gymExercise(b.name)?.measure ?? "reps";
    if (measure !== "reps") continue;
    // A bilateral dumbbell lift moves two bells per rep — count both (see
    // loadUnitCount). e1RM/PRs stay per-bell, so this factor lives here, not in
    // effectiveSetLoadKg.
    const units = loadUnitCount(b.name);
    for (const s of setsForVolume(b, includeWarmups)) {
      const reps = num(s.reps);
      if (Number.isNaN(reps)) continue;
      v += effectiveSetLoadKg(b.name, s.load, bodyweightKg) * reps * units;
    }
  }
  return Math.round(v);
}

/** Lifetime tonnage across sessions — bodyweight-aware when `bw` is passed
 *  (a dated lookup resolves each session at ITS OWN date). */
export function totalVolume(sessions: LoggedSession[], bw?: BodyweightInput): number {
  return sessions.reduce((sum, s) => sum + sessionVolume(s.blocks, false, bwAt(bw, s.startedAt)), 0);
}

/** Distinct strength lift names seen across sessions, most-frequent first. */
export function liftNames(sessions: LoggedSession[]): string[] {
  const counts = new Map<string, number>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b)) counts.set(b.name, (counts.get(b.name) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export interface E1rmPoint {
  date: string;
  e1rm: number;
}

/** e1RM over time for one lift, oldest → newest — bodyweight-aware when `bw`
 *  is passed (each point uses the athlete's weight at that session's date). */
export function e1rmSeries(sessions: LoggedSession[], lift: string, bw?: BodyweightInput): E1rmPoint[] {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const pts: E1rmPoint[] = [];
  for (const s of sorted)
    for (const b of s.blocks)
      if (isStrength(b) && b.name === lift) {
        const best = blockBestE1rm(b, bwAt(bw, s.startedAt));
        if (best > 0) pts.push({ date: s.startedAt, e1rm: Math.round(best) });
      }
  return pts;
}

export interface TopLoadPoint {
  date: string;
  weightKg: number;
}

/** Heaviest working-set load per session for one lift, oldest → newest — the
 *  ACTUAL top weight (not e1RM), bodyweight-aware when `bw` is passed. */
export function topLoadSeries(sessions: LoggedSession[], lift: string, bw?: BodyweightInput): TopLoadPoint[] {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const pts: TopLoadPoint[] = [];
  for (const s of sorted)
    for (const b of s.blocks)
      if (isStrength(b) && b.name === lift) {
        const best = blockTopLoad(b, bwAt(bw, s.startedAt));
        if (best > 0) pts.push({ date: s.startedAt, weightKg: Math.round(best * 10) / 10 });
      }
  return pts;
}

export interface PrRow {
  lift: string;
  e1rm: number;
  when: string;
}

export interface TopLiftRow {
  lift: string;
  weightKg: number;
  when: string;
}

/** Heaviest ACTUAL load per lift (all-time), heaviest first — the real top
 *  weight, not an estimated 1RM. Bodyweight-aware when `bw` is passed (each
 *  session resolves at its own date). */
export function bestTopLoadByLift(sessions: LoggedSession[], bw?: BodyweightInput): TopLiftRow[] {
  const map = new Map<string, { weightKg: number; when: string }>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b)) {
        const best = Math.round(blockTopLoad(b, bwAt(bw, s.startedAt)) * 10) / 10;
        const cur = map.get(b.name);
        if (best > 0 && (!cur || best > cur.weightKg)) map.set(b.name, { weightKg: best, when: s.startedAt });
      }
  return [...map.entries()]
    .map(([lift, v]) => ({ lift, ...v }))
    .sort((a, b) => b.weightKg - a.weightKg);
}

/** Best e1RM per lift (all-time PRs), strongest first — bodyweight-aware when
 *  `bw` is passed (each session resolves at its own date). */
export function bestE1rmByLift(sessions: LoggedSession[], bw?: BodyweightInput): PrRow[] {
  const map = new Map<string, { e1rm: number; when: string }>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b)) {
        const best = Math.round(blockBestE1rm(b, bwAt(bw, s.startedAt)));
        const cur = map.get(b.name);
        if (best > 0 && (!cur || best > cur.e1rm)) map.set(b.name, { e1rm: best, when: s.startedAt });
      }
  return [...map.entries()]
    .map(([lift, v]) => ({ lift, ...v }))
    .sort((a, b) => b.e1rm - a.e1rm);
}

/**
 * Convert logged sessions into the engine's TrainingLog so fatigue/readiness/
 * prescription run on the athlete's REAL data — the Sprint 4 spine.
 *
 * WHERE A REPORTED FEELING BECOMES TRAINING LOAD. Every intensity below used to
 * fall back to a CONSTANT when the athlete hadn't typed a per-set or per-block
 * RPE — 7 for a lift, 6 for cardio, 8 for conditioning — so two athletes who
 * logged the identical session were, to every engine downstream, identical. If
 * the athlete answered "how did that feel?" for a session (session-feel.ts),
 * that answer is a real measurement of what the work cost THEM and replaces the
 * constant. An RPE they entered per block still wins over both: it is more
 * specific than a whole-session rating.
 *
 * `feelRpe` is passed in rather than derived here so the caller can supply the
 * effort model's prediction for unrated sessions too (see engines/effort.ts
 * `effectiveSessionRpe`); with no override the behaviour is bit-for-bit what it
 * was before.
 */
export function toTrainingLog(
  sessions: LoggedSession[],
  now = Date.now(),
  feelRpe?: (s: LoggedSession) => number | null,
): TrainingLog {
  // Every fatigue / injury / readiness engine downstream reads this log, so the
  // measurement is projected in HERE — one call, and a matched session's real
  // minutes and distance reach all of them (see device-truth.ts).
  return deviceTrueSessions(sessions).map((s) => {
    const daysAgo = Math.max(0, Math.round((now - new Date(s.startedAt).getTime()) / 86_400_000));
    // The athlete's own answer for this session, when there is one.
    const felt = feelRpe?.(s) ?? null;
    const items = s.blocks.map((b) => {
      if (b.kind === "strength") {
        const est = Math.round(blockBestE1rm(b));
        const working = workingSets(b);
        let topRpe = 0;
        for (const st of working) {
          const r = num(st.rpe);
          if (!Number.isNaN(r)) topRpe = Math.max(topRpe, r);
        }
        return {
          move: b.name,
          e1rm: est || undefined,
          topRpe: topRpe || felt || undefined,
          hardSets: working.length,
        };
      }
      if (b.kind === "cardio") {
        const system = (movementFor(b.name)?.system ?? "aerobic") as EnergySystem;
        return { move: b.name, system, minutes: b.minutes ?? 30, rpe: b.rpe ?? felt ?? 6, ...(b.distance ? { distance: b.distance } : {}) };
      }
      const system = (movementFor(b.name)?.system ?? "anaerobic") as EnergySystem;
      const minutes =
        b.minutes ??
        (b.work && b.rest && b.rounds ? Math.round(((b.work + b.rest) * b.rounds) / 60) : 12);
      return { move: b.name, system, minutes, rpe: b.rpe ?? felt ?? 8 };
    });
    return { daysAgo, items };
  });
}
