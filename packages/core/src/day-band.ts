/**
 * THE DAY BAND — what the top of Today says, and how it decides.
 *
 * The band is the filled full-bleed field at the head of the Dashboard: a
 * numeral, an instruction, and one sentence. It replaces a readiness CARD that
 * stated a diagnosis ("Shoulders is the limiter today") and left the athlete to
 * work out what to do about it. This file is the part that decides what it
 * says.
 *
 * ── IT RETURNS KEYS, NEVER SENTENCES ──────────────────────────────────────
 * Every line is an i18n key plus its slots, because this is the one line most
 * athletes will ever read and it has to speak Polish and German too. `parts`
 * are slots filled with ANOTHER key (a discipline's verb, an energy system);
 * `values` are literals (a count, an exercise name). `bandText()` at the bottom
 * is the only renderer, shared by both clients, so a band on mobile and the
 * same band in the admin preview cannot compose the sentence differently.
 *
 * ── THE LADDER, AND WHY IT IS ORDERED THE WAY IT IS ───────────────────────
 * Checked top to bottom, first match wins:
 *
 *   1 none     no reading yet — draw nothing. A fabricated score under a
 *              full-bleed field of colour is a loud way to be wrong.
 *   2 deload   the score is on its floor. Outranks the schedule: a plan that
 *              says "squat heavy" on a day the arithmetic has bottomed out is
 *              the exact case the band exists to catch.
 *   3 protect  something is on tomorrow. NO FILL — see the note below.
 *   4 rest     scheduled rest, or a long enough streak that rest IS the work.
 *   5 order    two trainings due. The band stops naming and starts ORDERING;
 *              that order is the only thing here an athlete cannot work out
 *              from two separate cards.
 *   6 single   one training due, named in its own vocabulary.
 *   7 open     nothing due — fall back to the prescription's freshest system.
 *
 * ── COLOUR NEVER CONTRADICTS THE INSTRUCTION ──────────────────────────────
 * The fill is the readiness band's own role, so the field and the ring agree by
 * construction. But a filled field is a CALL TO ACTION, and rungs 3 and 4 tell
 * the athlete not to train — a bright chartreuse field over "match tomorrow" at
 * a readiness of 81 says two opposite things at once. Those two rungs return
 * `fill: null`, which the clients draw as ground plus a hairline. There is no
 * third option and no "nicer colour" that resolves it.
 *
 * ── MOST ATHLETES HAVE NO PLAN ────────────────────────────────────────────
 * The first cut of this ladder read the plan schedule for every rung, which
 * assumes an enrolment most athletes will never have. Rungs 4–6 now take the
 * day from the athlete's OWN LOG (`rotation()` below) when there is no plan,
 * and say so by changing VOICE: a scheduled day is asserted ("Run first, lift
 * after"), an inferred one is offered ("Run first, then lift"). The band never
 * asserts a session that does not exist.
 */

import { cardioDiscipline, type CardioDiscipline, type LoggedSession } from "./engines/session";
import type { ReadinessDeficit } from "./engines/readiness-deficit";
import type { MuscleGroup, Prescription } from "./engines/types";
import { readinessRole, type SemanticRole } from "./semantic";
import { localMidnightMs } from "./day-key";

// ============================================================
//  What a day can hold
// ============================================================

/** Every kind of training the app can put in a day. The cardio disciplines are
 *  the endurance hub's own set, plus the barbell. */
export type TrainingKind = CardioDiscipline | "gym";

export const TRAINING_KINDS: readonly TrainingKind[] = [
  "gym", "running", "cycling", "swimming", "rowing", "skiing", "walking", "sport", "other",
] as const;

/**
 * Something on the calendar that the band must protect. It arrives from one of
 * three places and the band treats all three identically:
 *
 *  - `plan`     — the plan schedule's next day, when the athlete is enrolled.
 *  - `fixture`  — a WEEKLY RECURRENCE the app detected in the athlete's own log
 *                 (five-a-side every Thursday). See `weeklyFixture()`.
 *  - `declared` — a one-off the athlete told us about (a race). Nothing stores
 *                 one yet; this is the seam it will arrive through, and the
 *                 band is already correct on the day it does.
 */
export interface DayEvent {
  kind: TrainingKind;
  /** Free text for a named event ("Half marathon"). Falls back to the kind's
   *  own noun when absent, so a detected fixture needs no copy of its own. */
  label?: string | null;
  source: "plan" | "fixture" | "declared";
}

/** A training the athlete is actually scheduled to do today, from a plan. */
export interface PlannedTraining {
  kind: TrainingKind;
  /** What the plan calls it — rendered verbatim, so it is already localized. */
  label: string;
}

// ============================================================
//  The rotation — what an athlete with no plan is likely doing
// ============================================================

/** How far back the rotation looks. Four weeks is two cycles of most people's
 *  week, which is the shortest window a cadence can be read from twice. */
export const ROTATION_WINDOW_DAYS = 28;
/** Sessions of ONE kind needed before it has a cadence at all: three sessions
 *  is two gaps, and one gap is not a rhythm. */
export const ROTATION_MIN_PER_KIND = 3;
/** Sessions in the window, across all kinds, before ANY inference runs. */
export const ROTATION_MIN_LOG = 6;
/** Nothing logged for this long and the rotation is history, not a habit — an
 *  athlete coming back off a fortnight away must not be told a swim is "due". */
export const ROTATION_STALE_DAYS = 10;
/** How irregular a cadence may be and still be trusted: the mean deviation of
 *  the gaps about the median, over the median. At 0.85 a kind trained every
 *  2–3 days passes (and survives one week off), while a burst pattern does
 *  not. */
export const CADENCE_SPREAD_MAX = 0.85;
/** How far into its own cycle a kind must be before it counts as due. Slightly
 *  under 1 so a Tuesday/Friday habit is due on Friday and not first on
 *  Saturday. */
export const DUE_RATIO = 0.9;
/** The band orders at most two trainings. Three is a training camp, not a day. */
export const MAX_DUE = 2;

export interface KindRotation {
  kind: TrainingKind;
  /** Sessions of this kind inside the window. */
  count: number;
  /** Whole days since the last one. */
  daysSince: number;
  /** The median gap between them, in days. */
  cadenceDays: number;
  /** MEAN deviation of the gaps about the median, over the median. Lower is
   *  steadier — and it is the mean rather than the median deviation on purpose:
   *  a burst pattern (three days on, twelve off, three on) has a median gap of
   *  one day and a MEDIAN deviation of zero, so a median-of-medians would call
   *  the most irregular log in the app perfectly steady. The mean feels the
   *  outliers, which is the entire signal here. */
  spread: number;
  /** `daysSince / cadenceDays`. At or over `DUE_RATIO` the kind is due. */
  ratio: number;
  /** Whether this kind alone clears the floor (enough sessions, steady enough). */
  confident: boolean;
}

export type RotationReason = "ok" | "no-log" | "thin-log" | "stale-log" | "no-stable-cadence";

export interface Rotation {
  /** Every kind seen in the window, most overdue first. */
  kinds: KindRotation[];
  /** The kinds the band may speak about — confident, due, at most two. */
  due: KindRotation[];
  /** False when the log cannot support an inference at all. */
  confident: boolean;
  reason: RotationReason;
}

const DAY_MS = 86_400_000;

/** What kind of training a logged session was. A session with any cardio block
 *  is that block's discipline (the first one wins — a brick session is named by
 *  what it opened with); anything else is gym work. */
export function sessionKind(s: LoggedSession): TrainingKind {
  for (const b of s.blocks ?? []) {
    if ((b as { kind?: string }).kind === "cardio") return cardioDiscipline(b.name ?? "");
  }
  return "gym";
}

const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * THE CONFIDENCE FLOOR, and it is the whole point of this function.
 *
 * Inference that guesses is worse than inference that abstains: a band that
 * announces "a swim is due" to someone who swims twice a month has spent the
 * loudest position on the screen being wrong, and the athlete has no way to
 * tell that it was a guess. So this returns `due: []` — sending the ladder to
 * rung 7, which claims nothing about the day — in four separate cases, each
 * named in `reason` so a surface can say WHY it is quiet if it wants to.
 */
export function rotation(sessions: LoggedSession[], now: number = Date.now()): Rotation {
  const today = localMidnightMs(now);
  const cutoff = today - ROTATION_WINDOW_DAYS * DAY_MS;

  const inWindow = (sessions ?? [])
    .map((s) => ({ at: localMidnightMs(new Date(s.startedAt).getTime()), kind: sessionKind(s) }))
    .filter((x) => Number.isFinite(x.at) && x.at >= cutoff && x.at <= today)
    .sort((a, b) => a.at - b.at);

  const empty = (reason: RotationReason): Rotation => ({ kinds: [], due: [], confident: false, reason });

  if (!inWindow.length) return empty("no-log");
  if (inWindow.length < ROTATION_MIN_LOG) return empty("thin-log");

  const lastAny = inWindow[inWindow.length - 1]!.at;
  if (Math.round((today - lastAny) / DAY_MS) > ROTATION_STALE_DAYS) return empty("stale-log");

  const byKind = new Map<TrainingKind, number[]>();
  for (const x of inWindow) {
    const list = byKind.get(x.kind) ?? [];
    list.push(x.at);
    byKind.set(x.kind, list);
  }

  const kinds: KindRotation[] = [];
  for (const [kind, days] of byKind) {
    const gaps: number[] = [];
    for (let i = 1; i < days.length; i++) gaps.push(Math.round((days[i]! - days[i - 1]!) / DAY_MS));
    const daysSince = Math.round((today - days[days.length - 1]!) / DAY_MS);
    const cadence = gaps.length ? Math.max(1, median(gaps)) : NaN;
    const spread = gaps.length
      ? gaps.reduce((sum, g) => sum + Math.abs(g - cadence), 0) / gaps.length / cadence
      : Number.POSITIVE_INFINITY;
    const confident = days.length >= ROTATION_MIN_PER_KIND && Number.isFinite(cadence) && spread <= CADENCE_SPREAD_MAX;
    kinds.push({
      kind,
      count: days.length,
      daysSince,
      cadenceDays: Number.isFinite(cadence) ? cadence : 0,
      spread: Number.isFinite(spread) ? spread : Number.POSITIVE_INFINITY,
      ratio: Number.isFinite(cadence) ? daysSince / cadence : 0,
      confident,
    });
  }
  kinds.sort((a, b) => b.ratio - a.ratio);

  if (!kinds.some((k) => k.confident)) return { kinds, due: [], confident: false, reason: "no-stable-cadence" };

  const due = kinds.filter((k) => k.confident && k.ratio >= DUE_RATIO).slice(0, MAX_DUE);
  return { kinds, due, confident: true, reason: "ok" };
}

/**
 * A WEEKLY FIXTURE — the half of "what's on tomorrow" an unplanned athlete's
 * log can actually answer.
 *
 * Five-a-side every Thursday is a recurrence; a half marathon in six weeks is
 * not, and no amount of reading the log will find it. So this looks for one
 * thing only: a kind that lands on the SAME WEEKDAY in at least
 * `FIXTURE_MIN_WEEKS` of the last `FIXTURE_LOOKBACK_WEEKS`. Everything else
 * has to be declared.
 */
export const FIXTURE_LOOKBACK_WEEKS = 6;
export const FIXTURE_MIN_WEEKS = 3;

export interface WeeklyFixture {
  kind: TrainingKind;
  /** 0 = Sunday, matching `Date#getDay`. */
  weekday: number;
  /** How many distinct weeks it landed on that weekday. */
  weeks: number;
}

export function weeklyFixture(sessions: LoggedSession[], now: number = Date.now()): WeeklyFixture[] {
  const today = localMidnightMs(now);
  const cutoff = today - FIXTURE_LOOKBACK_WEEKS * 7 * DAY_MS;
  const seen = new Map<string, Set<number>>();

  for (const s of sessions ?? []) {
    const at = localMidnightMs(new Date(s.startedAt).getTime());
    if (!Number.isFinite(at) || at < cutoff || at > today) continue;
    const key = `${sessionKind(s)}|${new Date(at).getDay()}`;
    const weeks = seen.get(key) ?? new Set<number>();
    weeks.add(Math.floor((at - cutoff) / (7 * DAY_MS)));
    seen.set(key, weeks);
  }

  const out: WeeklyFixture[] = [];
  for (const [key, weeks] of seen) {
    if (weeks.size < FIXTURE_MIN_WEEKS) continue;
    const [kind, day] = key.split("|");
    out.push({ kind: kind as TrainingKind, weekday: Number(day), weeks: weeks.size });
  }
  return out.sort((a, b) => b.weeks - a.weeks);
}

/** The fixture that falls on TOMORROW, as an event the ladder can protect. */
export function fixtureTomorrow(sessions: LoggedSession[], now: number = Date.now()): DayEvent | null {
  const tomorrow = new Date(localMidnightMs(now) + DAY_MS).getDay();
  // Only a SPORT fixture is worth protecting a day for. A Thursday gym habit is
  // a habit; missing it costs nothing, and a band that says "nothing on the
  // legs today" before every routine session would be unusable.
  const hit = weeklyFixture(sessions, now).find((f) => f.weekday === tomorrow && f.kind !== "gym" && f.kind !== "walking");
  return hit ? { kind: hit.kind, source: "fixture" } : null;
}

// ============================================================
//  The band
// ============================================================

export type BandRung = "none" | "deload" | "protect" | "rest" | "order" | "single" | "open";
/** How certain the band is allowed to sound. `suggests` is the unplanned voice. */
export type BandVoice = "asserts" | "suggests" | "protects" | "states" | "silent";
/** Where the day came from — surfaced so a client can label an inferred day and
 *  offer the correction that teaches the rotation. */
export type BandSource = "plan" | "inferred" | "prescription" | "none";

/** One line of band copy: a key, slots filled with other keys, slots filled
 *  with literals. Rendered by `bandText()` and nothing else. */
export interface BandLine {
  key: string;
  /** Slot name → i18n key. Resolved before interpolation. */
  parts?: Record<string, string>;
  /** Slot name → literal value (a count, an exercise name, a plan's own label). */
  values?: Record<string, string | number>;
}

export interface DayBand {
  rung: BandRung;
  /** The readiness band's role, or null for a QUIET band (ground + hairline).
   *  Null is not "no colour available" — it is the instruction refusing a fill. */
  fill: SemanticRole | null;
  voice: BandVoice;
  source: BandSource;
  /** The score, so a caller never re-derives it from the deficit. */
  figure: number;
  /** The instruction. Null only on `none`. */
  head: BandLine | null;
  /** Sentences under it, joined with a space. May be empty. */
  say: BandLine[];
  /** The discipline mark to draw, when the day has one. */
  mark: TrainingKind | null;
  /** The kinds the band is talking about, in the order it named them — what a
   *  "not today" correction has to cycle through. */
  kinds: TrainingKind[];
}

export interface DayBandInput {
  deficit: ReadinessDeficit;
  /** The limiting tissue, when the reading has one. Drives which pattern the
   *  band steers away from and which sentence it uses. */
  muscle?: MuscleGroup | null;
  /** Today's prescription, when the host has one. */
  rx?: Prescription | null;
  /** The plan's day. Absent for the athletes this ladder is built around. */
  plan?: { isRest: boolean; dayNumber?: number | null; trainings: PlannedTraining[] } | null;
  /** What is on tomorrow, from any of the three sources. */
  tomorrow?: DayEvent | null;
  /** The athlete's own log, used only when there is no plan. */
  sessions?: LoggedSession[];
  /** Supply a rotation to avoid recomputing it; otherwise it is derived. */
  rot?: Rotation;
  /** Days trained in a row, for the unplanned rest case. */
  streakDays?: number;
  now?: number;
}

/** Trained this many days without a break and rest is the session. */
export const REST_STREAK_DAYS = 6;

const K = "w.home.band.";
const leadKey = (k: TrainingKind) => `${K}lead.${k}`;
const followKey = (k: TrainingKind) => `${K}follow.${k}`;
const thenKey = (k: TrainingKind) => `${K}then.${k}`;
const nounKey = (k: TrainingKind) => `${K}noun.${k}`;
const muscleKey = (m: MuscleGroup) => `w.home.today.muscle.${m}`;

/** Which cost is doing the limiting — the biggest one on the ring. */
function limiterOf(d: ReadinessDeficit): "tissue" | "conditioning" | "fuel" | "other" | "none" {
  const top = [...(d.costs ?? [])].sort((a, b) => b.points - a.points)[0];
  if (!top) return "none";
  const kind = top.kind as string;
  if (kind === "tissue") return "tissue";
  if (kind === "conditioning") return "conditioning";
  if (kind === "fuel") return "fuel";
  return "other";
}

/** The check-in's clause, and ONLY the check-in's — readiness picks the
 *  movement, it does not scale the bar, so nothing else here may claim a load. */
function doseLine(rx?: Prescription | null): BandLine | null {
  const adj = rx?.readinessAdjust;
  if (!adj) return null;
  if (adj.loadPct === undefined) return { key: `${K}sayDoseBodyweight` };
  const key = adj.feeling === "primed" ? "sayDosePrimed" : adj.feeling === "flat" ? "sayDoseFlat" : "sayDoseWrecked";
  return { key: K + key, values: { pct: adj.loadPct } };
}

/** The sentence that names what is holding the day back. */
function limiterLine(d: ReadinessDeficit, muscle?: MuscleGroup | null): BandLine | null {
  switch (limiterOf(d)) {
    case "tissue":
      return muscle ? { key: `${K}sayTissue`, parts: { muscle: muscleKey(muscle) } } : { key: `${K}sayTissueAny` };
    case "conditioning": return { key: `${K}sayEngine` };
    case "fuel": return { key: `${K}sayFuel` };
    case "other": return { key: `${K}saySleep` };
    default: return null;
  }
}

export function dayBand(input: DayBandInput): DayBand {
  const { deficit: d, muscle = null, rx = null, plan = null, tomorrow = null } = input;
  const now = input.now ?? Date.now();
  const figure = d?.kept ?? 0;
  const fill = readinessRole(figure);

  const quiet = (rung: BandRung, voice: BandVoice, head: BandLine, say: BandLine[], mark: TrainingKind | null): DayBand =>
    ({ rung, fill: null, voice, source: plan ? "plan" : "inferred", figure, head, say, mark, kinds: mark ? [mark] : [] });

  // ── 1. NO READING ────────────────────────────────────────────────────────
  if (!d || !Number.isFinite(d.kept) || d.kept <= 0) {
    return { rung: "none", fill: null, voice: "silent", source: "none", figure: 0, head: null, say: [], mark: null, kinds: [] };
  }

  // ── 2. THE FLOOR, which outranks anything the calendar says ──────────────
  if (d.clamped === "floor") {
    return {
      rung: "deload", fill: "danger", voice: "asserts", source: "prescription", figure,
      head: { key: `${K}deload` },
      say: [{ key: `${K}sayDeloadFloor` }],
      mark: null, kinds: [],
    };
  }

  // ── 3. SOMETHING IS ON TOMORROW ──────────────────────────────────────────
  if (tomorrow) {
    const head: BandLine = tomorrow.label
      ? { key: `${K}protect`, values: { event: tomorrow.label } }
      : { key: `${K}protectKind`, parts: { noun: nounKey(tomorrow.kind) } };
    return quiet("protect", "protects", head, [{ key: `${K}sayProtect` }], tomorrow.kind);
  }

  // ── 4. REST ──────────────────────────────────────────────────────────────
  const streak = input.streakDays ?? 0;
  if (plan?.isRest) {
    return quiet("rest", "states", { key: `${K}rest` },
      plan.dayNumber ? [{ key: `${K}sayRestPlanned`, values: { n: plan.dayNumber } }] : [], null);
  }
  if (!plan && streak >= REST_STREAK_DAYS) {
    return quiet("rest", "states", { key: `${K}rest` }, [{ key: `${K}sayRestStreak`, values: { n: streak } }], null);
  }

  // ── what today holds ─────────────────────────────────────────────────────
  const rot = plan ? null : (input.rot ?? rotation(input.sessions ?? [], now));
  const planned: PlannedTraining[] = plan?.trainings ?? [];
  const inferred: TrainingKind[] = rot?.due.map((k) => k.kind) ?? [];
  const source: BandSource = plan ? "plan" : inferred.length ? "inferred" : "prescription";
  // Two trainings of the SAME kind are one training with two entries — a
  // double run day is still a run day, and "Run first, then run" is not an
  // order, it is a stutter.
  const kinds: TrainingKind[] = [...new Set(plan ? planned.map((t) => t.kind) : inferred)];
  const limiter = limiterOf(d);
  const tissueLed = limiter === "tissue";

  // ── 5. TWO TRAININGS — the band orders them ──────────────────────────────
  if (kinds.length > 1) {
    const gym = kinds.find((k) => k === "gym");
    const sport = kinds.find((k) => k !== "gym");
    let lead: TrainingKind;
    let follow: TrainingKind;
    let clause: BandLine;

    if (gym && sport) {
      // ONE OF EACH. The limiter decides which discipline gives ground: a
      // loaded tissue means the bar sheds load and the sport keeps its
      // quality; a spent engine means the opposite.
      lead = tissueLed ? sport : gym;
      follow = tissueLed ? gym : sport;
      clause = tissueLed
        ? (muscle
            ? { key: `${K}sayOrderTissue`, parts: { muscle: muscleKey(muscle), noun: nounKey(sport) } }
            : { key: `${K}sayOrderTissueAny`, parts: { noun: nounKey(sport) } })
        : { key: `${K}sayOrderEngine`, parts: { noun: nounKey(sport) } };
    } else {
      // TWO SPORTS. There is no bar to ease, so the most overdue one leads and
      // the second is the one held back.
      lead = kinds[0]!;
      follow = kinds[1]!;
      clause = tissueLed
        ? (muscle
            ? { key: `${K}sayOrderPairTissue`, parts: { muscle: muscleKey(muscle) } }
            : { key: `${K}sayOrderPairTissueAny` })
        : { key: `${K}sayOrderPairEngine` };
    }

    const dose = doseLine(rx);
    return {
      rung: "order", fill, voice: plan ? "asserts" : "suggests", source, figure,
      head: {
        key: `${K}order`,
        parts: { lead: leadKey(lead), follow: plan ? followKey(follow) : thenKey(follow) },
      },
      say: dose ? [clause, dose] : [clause],
      mark: lead,
      kinds: [lead, follow],
    };
  }

  // ── 6. ONE TRAINING — named in its own vocabulary ────────────────────────
  if (kinds.length === 1) {
    const kind = kinds[0]!;
    const isGym = kind === "gym";
    const label = plan ? planned[0]!.label : null;
    const head: BandLine = label
      ? { key: `${K}singleLabel`, values: { label } }
      : isGym && rx?.primary?.move
        ? { key: `${K}singleGymDue`, values: { move: rx.primary.move } }
        : { key: `${K}singleDue`, parts: { noun: nounKey(kind) } };

    // The sentence must add a fact the headline does not have — never the same
    // session restated in other words. The limiter is that fact when there is
    // one; otherwise it is how long it has been.
    const since = rot?.due.find((k) => k.kind === kind)?.daysSince;
    const say: BandLine[] = [];
    const lim = limiterLine(d, muscle);
    if (lim) say.push(lim);
    else if (since !== undefined) say.push({ key: isGym ? `${K}saySinceGym` : `${K}saySince`, values: { n: since } });
    const dose = doseLine(rx);
    if (dose) say.push(dose);

    return { rung: "single", fill, voice: plan ? "asserts" : "suggests", source, figure, head, say, mark: kind, kinds: [kind] };
  }

  // ── 7. NOTHING DUE — the prescription's own answer ───────────────────────
  const sys = rx?.pickSys ?? "aerobic";
  const say: BandLine[] = [{ key: `${K}sayOpen`, parts: { system: `${K}system.${sys}` } }];
  const lim = limiterLine(d, muscle);
  if (lim) say.push(lim);
  return {
    rung: "open", fill, voice: "suggests", source: "prescription", figure,
    head: { key: `${K}open` }, say, mark: null, kinds: [],
  };
}

// ============================================================
//  Rendering
// ============================================================

/**
 * THE ONE RENDERER. `parts` resolve through `t` first, then every slot is
 * interpolated into the line. Both clients call this; nothing composes a band
 * sentence by hand.
 */
export function bandText(t: (key: string) => string, line: BandLine): string {
  let out = t(line.key);
  for (const [slot, key] of Object.entries(line.parts ?? {})) out = out.split(`{${slot}}`).join(t(key));
  for (const [slot, value] of Object.entries(line.values ?? {})) out = out.split(`{${slot}}`).join(String(value));
  return out;
}

/** The whole sentence under the instruction, as one string. */
export function bandSay(t: (key: string) => string, band: DayBand): string {
  return band.say.map((l) => bandText(t, l)).join(" ");
}

/**
 * COPY BUDGETS, in characters, measured against the WIDEST locale rather than
 * English — German runs about a third longer than the English it is written
 * from, and Polish carries the longer discipline nouns.
 *
 * THE ARITHMETIC, so the next person can move these honestly rather than
 * nudging them until the test passes. On a 390pt screen the band's own gutter
 * leaves 360pt. The head sets in the display face at 27pt, which averages
 * ~0.55em per character — about 24 characters a line, two lines, 44 with the
 * break. The sentence sets at 14.5pt regular, ~46 characters a line, three
 * lines, 130. A head over budget steps DOWN a type rung (27 → 23); it never
 * wraps to a third line and it is never ellipsized, because an instruction
 * with its verb cut off is worse than a smaller instruction.
 */
export const BAND_HEAD_MAX = 44;
export const BAND_SAY_MAX = 130;

/**
 * The NEXT kind to offer when the athlete says "not today" to an inferred day.
 * Cycles through the rotation's own order, skipping what is already on the
 * band, so the correction is one tap and the app learns what it got wrong.
 */
export function nextDueKind(rot: Rotation, rejected: readonly TrainingKind[]): TrainingKind | null {
  const pool = rot.kinds.filter((k) => k.confident && !rejected.includes(k.kind));
  return pool.length ? pool[0]!.kind : null;
}
