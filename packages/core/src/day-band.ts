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
 * is the only renderer — the one place a band's line becomes a string, so a
 * second surface cannot compose the same band differently. It has ONE caller
 * today (the mobile field); that is a fact about how far the band has been
 * built, not a reason to inline it, and the second caller is the operator
 * preview recorded as `day-band-preview` in capabilities.ts.
 *
 * ── THE LADDER, AND WHY IT IS ORDERED THE WAY IT IS ───────────────────────
 * Checked top to bottom, first match wins:
 *
 *   1 none     no reading yet — draw nothing. A fabricated score under a
 *              full-bleed field of colour is a loud way to be wrong.
 *   2 race     A MEET, A RACE OR A TEST IS TODAY. The one calendar entry the
 *              app cannot move, so it outranks even the floor: a heavy squat
 *              can go to Thursday, a start line cannot. The reading moves into
 *              the sentence, where a flat morning changes how the race is RUN.
 *              It comes from a FACT — a declared event, or the plan's own
 *              competition day (day-events.ts) — never from a fixture.
 *   3 deload   the score is on its floor. Outranks the schedule: a plan that
 *              says "squat heavy" on a day the arithmetic has bottomed out is
 *              the exact case the band exists to catch.
 *   4 done     THE DAY HAS ALREADY BEEN TRAINED. Everything below this rung
 *              answers "what should you do today?", and the athlete has
 *              answered it — in the log. The band said "Nothing on the legs
 *              today. A walk if you want one." on a screen that also showed
 *              10.2 t and a trap-bar deadlift, because the ladder was never
 *              handed the one thing it was standing on top of.
 *   5 protect  something is on tomorrow. NO FILL — see the note below.
 *   6 rest     scheduled rest, or a long enough streak that rest IS the work.
 *   7 order    two trainings due. The band stops naming and starts ORDERING;
 *              that order is the only thing here an athlete cannot work out
 *              from two separate cards.
 *   8 single   one training due, named in its own vocabulary.
 *   9 open     nothing due — fall back to the prescription's freshest system.
 *
 * ── WHAT THE BAND ASKS FOR, ONCE THE DAY IS DONE ──────────────────────────
 * A finished session has exactly one fact the app cannot measure: how it FELT.
 * Every figure around it — tonnage, minutes, distance, pace — is already in the
 * log or on the watch, and the one value that turns them into training load
 * (feel × duration, session-feel.ts) has to be asked for. So the done rung
 * leads with that question while it is still worth answering, and states the
 * answer back once it has one. It is the only rung that asks the athlete for
 * something rather than telling them something.
 *
 * ── COLOUR NEVER CONTRADICTS THE INSTRUCTION ──────────────────────────────
 * `fill` is the reading's own semantic role, so the band and the ring cannot
 * disagree about how the day scored. But some rungs tell the athlete NOT to
 * train, and a colour of ACTION over "match tomorrow" at a readiness of 81 says
 * two opposite things at once. Those rungs return `fill: null`, and there is no
 * third option and no "nicer colour" that resolves it.
 *
 * WHERE THAT COLOUR IS DRAWN is the surface's business and it has moved. It was
 * a solid field behind the whole band; since Aug 2026 the band is one material
 * (a wash of the day's hue, every rung) and the acting/reporting distinction is
 * carried by the READING — the numeral lights in the day's hue when the rung is
 * asking for something and stays held-back ink when it is reporting. The rule
 * this section states is unchanged; only its medium is.
 * ── MOST ATHLETES HAVE NO PLAN ────────────────────────────────────────────
 * The first cut of this ladder read the plan schedule for every rung, which
 * assumes an enrolment most athletes will never have. Rungs 5–7 now take the
 * day from the athlete's OWN LOG (`rotation()` below) when there is no plan,
 * and say so by changing VOICE: a scheduled day is asserted ("Run first, lift
 * after"), an inferred one is offered ("Run first, then lift"). The band never
 * asserts a session that does not exist.
 */

import { cardioDiscipline, sessionsOnDay, type CardioDiscipline, type LoggedSession } from "./engines/session";
import { hasFeel, feelDef } from "./session-feel";
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
  /**
   * THE EVIDENCE, for a `fixture` only — how many of the last `of` weeks this
   * landed on `weekday`. A plan day and a declared race carry none because
   * nobody inferred them: they are facts, and a fact does not have to show its
   * working.
   *
   * It exists because the band said "You have a game tomorrow." off the back of
   * three Thursdays in six weeks, in the flattest declarative in the app, to an
   * athlete who had no game. The band's own doctrine is that it never asserts a
   * session that does not exist; rungs 7–8 honour that by changing VOICE
   * between a scheduled day and an inferred one, and this rung did not. Now the
   * inference says what it is and shows the count it was drawn from, so a wrong
   * guess reads as a wrong guess rather than as news.
   */
  seen?: { weeks: number; of: number; weekday: number } | null;
  /**
   * TRUE WHEN THE DAY COULD BE MOVED — a plan's KEY session, as against a race,
   * a declared commitment or a detected fixture.
   *
   * It changes two things and it is worth being exact about both. It softens
   * the protect rung's sentence: "nothing on the legs today" is the right
   * instruction before a start line and an overstatement before a tempo run,
   * which the athlete's own plan has already put an easy day in front of. And
   * it keeps the day off rung 2 — a race outranks even the floor because a
   * start line cannot be rescheduled, and a key session plainly can. Testing or
   * grinding a quality session on a floored reading is the exact case the floor
   * exists to catch.
   */
  movable?: boolean;
}

/**
 * WHAT TODAY ALREADY HOLDS — the half of the day the ladder never asked about.
 *
 * Derived from the log rather than handed in, so a caller cannot disagree with
 * the screen underneath it about what "today" means. `now` is the real today on
 * every branch of the Dashboard, including when the week rail is scrubbed: the
 * band is about the day you are in, not the day you are looking at.
 */
export interface DoneToday {
  /** Sessions logged today. */
  count: number;
  /** How many of them carry no "how did that feel?" answer. */
  unrated: number;
  /** The feel of the most recent RATED session today (1–5), or null. */
  feel: number | null;
  /** What the day's training was — the most recent session's kind. */
  kind: TrainingKind | null;
}

export function doneToday(sessions: LoggedSession[], now: number = Date.now()): DoneToday {
  const today = sessionsOnDay(sessions ?? [], now);
  if (!today.length) return { count: 0, unrated: 0, feel: null, kind: null };
  // Most recent first, so "the day's training" and "the day's feel" both mean
  // the latest thing that happened rather than whatever the array held first.
  const byTime = [...today].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  const rated = byTime.find(hasFeel);
  return {
    count: byTime.length,
    unrated: byTime.filter((s) => !hasFeel(s)).length,
    feel: rated?.feel ?? null,
    kind: sessionKind(byTime[0]!),
  };
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

/** What kind of training a set of blocks is. The first cardio block wins — a
 *  brick session is named by what it opened with — and anything else is gym
 *  work. Takes BLOCKS rather than a session so a plan's day, which has blocks
 *  and no session, resolves through exactly the same rule. */
export function blocksKind(blocks: readonly { kind?: string; name?: string }[] | undefined): TrainingKind {
  for (const b of blocks ?? []) {
    if (b?.kind === "cardio") return cardioDiscipline(b.name ?? "");
  }
  return "gym";
}

/** What kind of training a logged session was. */
export function sessionKind(s: LoggedSession): TrainingKind {
  return blocksKind(s.blocks as unknown as { kind?: string; name?: string }[]);
}

/**
 * DAYS TRAINED IN A ROW, counting back from today — what rung 6 needs for an
 * athlete with no plan to be told to rest.
 *
 * Counts from TODAY if something is logged today, otherwise from yesterday, so
 * a streak is not broken at midnight by a day that has not happened yet. Two
 * sessions on one day are one day of the streak.
 */
export function trainingStreak(sessions: LoggedSession[], now: number = Date.now()): number {
  const days = new Set(
    (sessions ?? [])
      .map((s) => localMidnightMs(new Date(s.startedAt).getTime()))
      .filter((ms) => Number.isFinite(ms)),
  );
  const today = localMidnightMs(now);
  let cursor = days.has(today) ? today : today - DAY_MS;
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor -= DAY_MS;
  }
  return streak;
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
 * rung 9, which claims nothing about the day — in four separate cases, each
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
  // A TOTAL ORDER, and the last key is what makes it one.
  //
  // This was `b.ratio - a.ratio` alone. `Array#sort` is stable, so every tie
  // fell through to the Map's insertion order — which is the order each kind
  // FIRST APPEARS in the 28-day window. Which of two equally-due disciplines
  // led the band was therefore decided by which one the athlete happened to
  // train four weeks ago, and logging one backdated session at the old end of
  // the window flipped the whole band for a reason nobody could infer.
  //
  // Four keys, each defensible on its own: most overdue, then longest since,
  // then most established, then the app's own canonical order of disciplines.
  // The last is exhaustive, so no tie can reach the iterator.
  kinds.sort((a, b) =>
    b.ratio - a.ratio ||
    b.daysSince - a.daysSince ||
    b.count - a.count ||
    TRAINING_KINDS.indexOf(a.kind) - TRAINING_KINDS.indexOf(b.kind));

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
/**
 * How long a fixture may go unplayed and still protect a day. `rotation()` has
 * had `ROTATION_STALE_DAYS` since it was written — "nothing logged for this
 * long and the rotation is history, not a habit" — and the fixture detector,
 * which makes a LOUDER claim about a SPECIFIC day, had no equivalent at all.
 *
 * So three Thursdays in July and then nothing kept protecting every Thursday
 * into late August: the count still cleared FIXTURE_MIN_WEEKS out of the
 * six-week window long after the last game. A fortnight is the floor because a
 * weekly fixture recurs every 7 days — you are allowed to miss one week, not
 * two, before the app stops planning your day around it.
 */
export const FIXTURE_STALE_DAYS = 14;

export interface WeeklyFixture {
  kind: TrainingKind;
  /** 0 = Sunday, matching `Date#getDay`. */
  weekday: number;
  /** How many distinct weeks it landed on that weekday. */
  weeks: number;
  /** Whole days since the most recent one. The detector REPORTS this rather
   *  than filtering on it: finding the pattern and deciding it is still live
   *  are two different questions, and only the second is the band's. */
  daysSince: number;
}

export function weeklyFixture(sessions: LoggedSession[], now: number = Date.now()): WeeklyFixture[] {
  const today = localMidnightMs(now);
  const cutoff = today - FIXTURE_LOOKBACK_WEEKS * 7 * DAY_MS;
  const seen = new Map<string, { weeks: Set<number>; last: number }>();

  for (const s of sessions ?? []) {
    const at = localMidnightMs(new Date(s.startedAt).getTime());
    if (!Number.isFinite(at) || at < cutoff || at > today) continue;
    const key = `${sessionKind(s)}|${new Date(at).getDay()}`;
    const rec = seen.get(key) ?? { weeks: new Set<number>(), last: at };
    rec.weeks.add(Math.floor((at - cutoff) / (7 * DAY_MS)));
    rec.last = Math.max(rec.last, at);
    seen.set(key, rec);
  }

  const out: WeeklyFixture[] = [];
  for (const [key, rec] of seen) {
    if (rec.weeks.size < FIXTURE_MIN_WEEKS) continue;
    const [kind, day] = key.split("|");
    out.push({
      kind: kind as TrainingKind,
      weekday: Number(day),
      weeks: rec.weeks.size,
      daysSince: Math.round((today - rec.last) / DAY_MS),
    });
  }
  return out.sort((a, b) => b.weeks - a.weeks);
}

/**
 * The fixture that falls on TOMORROW, as an event the ladder can protect.
 *
 * `reject` is what the athlete has already said is not happening — the "not
 * today?" tap under an inferred band. It belongs HERE rather than downstream
 * because a rejected fixture must not merely be re-labelled: the whole point of
 * the tap is that the band drops to the rung below and says something the
 * athlete can use.
 */
export function fixtureTomorrow(
  sessions: LoggedSession[],
  now: number = Date.now(),
  reject: readonly TrainingKind[] = [],
): DayEvent | null {
  const tomorrow = new Date(localMidnightMs(now) + DAY_MS).getDay();
  // Only a SPORT fixture is worth protecting a day for. A Thursday gym habit is
  // a habit; missing it costs nothing, and a band that says "nothing on the
  // legs today" before every routine session would be unusable.
  // A fixture protects a day only while it is still being PLAYED — see
  // FIXTURE_STALE_DAYS. A habit that stopped a month ago is history, and the
  // count inside the six-week window cannot tell the difference on its own.
  const hit = weeklyFixture(sessions, now).find(
    (f) =>
      f.weekday === tomorrow &&
      f.kind !== "gym" &&
      f.kind !== "walking" &&
      f.daysSince <= FIXTURE_STALE_DAYS &&
      !reject.includes(f.kind),
  );
  return hit
    ? { kind: hit.kind, source: "fixture", seen: { weeks: hit.weeks, of: FIXTURE_LOOKBACK_WEEKS, weekday: hit.weekday } }
    : null;
}

// ============================================================
//  The band
// ============================================================

export type BandRung = "none" | "race" | "deload" | "done" | "protect" | "rest" | "order" | "single" | "open";
/** How certain the band is allowed to sound. `suggests` is the unplanned voice. */
export type BandVoice = "asserts" | "suggests" | "protects" | "states" | "silent";
/** Where the day came from — surfaced so a client can label an inferred day and
 *  offer the correction that teaches the rotation. */
export type BandSource = "plan" | "declared" | "inferred" | "logged" | "prescription" | "none";

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
  /** The one thing the band wants BACK from the athlete, when there is one.
   *  `rate` is the done rung asking how the session felt — the single value the
   *  app cannot derive from anything it already has. Null on every other rung:
   *  a band that asked for something on all of them would be a form. */
  ask?: "rate" | null;
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
  /** What is on tomorrow, from any of the three sources. See day-events.ts,
   *  which holds the rule that orders them. */
  tomorrow?: DayEvent | null;
  /**
   * A FACT on TODAY — a declared race, or the enrolled plan's competition day.
   * Never a fixture: rung 2 asserts, and a guess about today is what rungs 6–8
   * already handle in the voice a guess deserves.
   */
  today?: DayEvent | null;
  /** The athlete's own log, used only when there is no plan. */
  sessions?: LoggedSession[];
  /** Supply a rotation to avoid recomputing it; otherwise it is derived. */
  rot?: Rotation;
  /** What today already holds. Derived from `sessions` when absent. */
  done?: DoneToday | null;
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
/** A weekday, PLURAL, 0 = Sunday to match `Date#getDay`. It appears in exactly
 *  one sentence ("3 of the last 6 Thursdays"), so each locale writes it in the
 *  case that sentence needs — Polish carries the genitive plural (`czwartków`)
 *  rather than the citation form, because there is nowhere else for it to go. */
const weekdayKey = (d: number) => `${K}weekday.${d}`;
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

  const quiet = (rung: BandRung, voice: BandVoice, head: BandLine, say: BandLine[], mark: TrainingKind | null, src?: BandSource): DayBand =>
    ({ rung, fill: null, voice, source: src ?? (plan ? "plan" : "inferred"), figure, head, say, mark, kinds: mark ? [mark] : [] });

  // ── 1. NO READING ────────────────────────────────────────────────────────
  if (!d || !Number.isFinite(d.kept) || d.kept <= 0) {
    return { rung: "none", fill: null, voice: "silent", source: "none", figure: 0, head: null, say: [], mark: null, kinds: [] };
  }

  // ── 2. THE RACE IS TODAY ─────────────────────────────────────────────────
  //
  // The one calendar entry the app cannot move. Every rung below this one
  // answers "what should you do today?" by weighing what the athlete COULD do
  // against what their body is carrying — and on the day of a meet that
  // question is already settled. Nothing is going to be rescheduled because a
  // number came back at 41.
  //
  // So it outranks even the FLOOR, which outranks everything else. The floor's
  // own doctrine is why: it is there to catch "a plan that says squat heavy on
  // a day the arithmetic has bottomed out", and a heavy squat can be moved to
  // Thursday. A start line cannot. The reading does not disappear — it moves
  // into the sentence, where a flat morning changes how the race is RUN rather
  // than whether it happens.
  //
  // It does NOT outrank the log: once the day is trained, the race is over and
  // the band has a report to make (rung 4), not an instruction to give.
  //
  // AND IT NEVER TAKES A GUESS. This rung is the flattest declarative the app
  // has, so a fixture reaching it would assert a race off three Thursdays —
  // the exact defect rung 5 was rebuilt to stop. The doctrine is enforced here
  // rather than merely documented at the caller.
  const done = input.done ?? doneToday(input.sessions ?? [], now);
  const race = input.today && input.today.source !== "fixture" && !input.today.movable ? input.today : null;
  if (race && done.count === 0) {
    const head: BandLine = race.label
      ? { key: `${K}race`, values: { event: race.label } }
      : { key: `${K}raceKind`, parts: { noun: nounKey(race.kind) } };
    return {
      rung: "race",
      // A race is the loudest call to act the app will ever make, so it takes
      // the reading's own fill — the same rule the rest of the ladder holds.
      // The quiet rungs are the ones that say DON'T train; this one does not.
      fill,
      voice: "asserts",
      source: race.source === "declared" ? "declared" : "plan",
      figure,
      head,
      say: [{ key: d.clamped === "floor" ? `${K}sayRaceFloor` : `${K}sayRace` }],
      mark: race.kind,
      kinds: [race.kind],
    };
  }

  // ── 3. THE FLOOR, which outranks anything else the calendar says ─────────
  if (d.clamped === "floor") {
    return {
      rung: "deload", fill: "danger", voice: "asserts", source: "prescription", figure,
      head: { key: `${K}deload` },
      say: [{ key: `${K}sayDeloadFloor` }],
      mark: null, kinds: [],
    };
  }

  // ── 4. THE DAY IS ALREADY TRAINED ────────────────────────────────────────
  //
  // Everything below this rung answers "what should you do today?" — and once
  // something is in the log, the athlete has answered it. The band used to
  // prescribe straight over the top: "Nothing on the legs today. A walk if you
  // want one." above a card reading 10.2 t, 20 sets, 94 min and a trap-bar
  // deadlift, because nothing ever handed the ladder today's own sessions.
  //
  // A FACT about tomorrow still outranks a report about today: a declared race
  // or a plan's own day changes what to do with the REST of the evening, so it
  // keeps the rung below. A GUESS does not — a fixture the app inferred is not
  // worth overriding what actually happened.
  if (done.count > 0 && (!tomorrow || tomorrow.source === "fixture")) {
    // The one value the app cannot measure, asked for while it is still worth
    // answering; the answer stated back once it has one.
    const feel = feelDef(done.feel);
    const asking = done.unrated > 0;
    return {
      rung: "done",
      // An ASK is an action, so it takes the reading's own fill; a report is
      // not, so it goes quiet. Same rule as everywhere else on this ladder.
      fill: asking ? fill : null,
      voice: "states",
      source: "logged",
      figure,
      head: { key: asking ? `${K}doneRate` : `${K}doneLogged` },
      say: asking
        ? [{ key: `${K}sayDoneRate` }]
        : feel
          ? [{ key: `${K}sayDoneFeel`, parts: { feel: feel.labelKey } }]
          : [],
      mark: done.kind,
      kinds: [],
      ask: asking ? "rate" : null,
    };
  }

  // ── 5. SOMETHING IS ON TOMORROW ──────────────────────────────────────────
  //
  // TWO VOICES, because there are two completely different claims here. A plan
  // day and a declared race are FACTS: the athlete or the program put them in
  // the calendar, and the band states them. A weekly fixture is a GUESS the app
  // made from the log — and a guess stated as a fact is the defect this rung
  // shipped with ("You have a game tomorrow." to an athlete with no game).
  //
  // So a fixture hedges in the head, shows the count it was drawn from in the
  // sentence, and reports `source: "inferred"` — which is also what puts the
  // "not today?" correction under it and keeps it away from a declared event
  // nobody needs to correct.
  if (tomorrow) {
    const guessed = tomorrow.source === "fixture";
    const head: BandLine = tomorrow.label
      ? { key: `${K}protect`, values: { event: tomorrow.label } }
      : { key: guessed ? `${K}protectUsual` : `${K}protectKind`, parts: { noun: nounKey(tomorrow.kind) } };
    // The evidence line, when there is evidence. A fixture handed in without a
    // `seen` (a caller that predates it) still hedges — it just cannot say how
    // often, and inventing a count would be worse than not having one.
    const say: BandLine = !guessed
      // A MOVABLE day gets the softer sentence. Before a race, "nothing on the
      // legs today" is the instruction; before a key session it is an
      // overstatement, and one the athlete's own plan usually contradicts —
      // this rung fires on a day the program has already made easy, so the
      // band's job there is to say WHY, not to overrule it.
      ? { key: tomorrow.movable ? `${K}sayProtectKey` : `${K}sayProtect` }
      : tomorrow.seen
        ? {
            key: `${K}sayProtectUsual`,
            parts: { weekday: weekdayKey(tomorrow.seen.weekday) },
            values: { n: tomorrow.seen.weeks, total: tomorrow.seen.of },
          }
        : { key: `${K}sayProtectMaybe` };
    const src: BandSource = guessed ? "inferred" : tomorrow.source === "declared" ? "declared" : "plan";
    return quiet("protect", guessed ? "suggests" : "protects", head, [say], tomorrow.kind, src);
  }

  // ── 6. REST ──────────────────────────────────────────────────────────────
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

  // ── 7. TWO TRAININGS — the band orders them ──────────────────────────────
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

  // ── 8. ONE TRAINING — named in its own vocabulary ────────────────────────
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

  // ── 9. NOTHING DUE — the prescription's own answer ───────────────────────
  const sys = rx?.pickSys ?? "aerobic";
  const say: BandLine[] = [{ key: `${K}sayOpen`, parts: { system: `${K}system.${sys}` } }];
  const lim = limiterLine(d, muscle);
  if (lim) say.push(lim);
  return {
    rung: "open", fill, voice: "suggests", source: "prescription", figure,
    head: { key: `${K}open` }, say, mark: null, kinds: [],
  };
}

/**
 * THE DECK — the ranking behind the band, and the four rules that keep it a
 * band rather than a menu.
 *
 * The engine has never had one answer. It has a RANKED LIST and it prints the
 * top of it, which is why an athlete watching the band change its mind reads it
 * as arbitrary: the alternatives were always there and nothing ever showed
 * them. So the band discloses the list. It does NOT become a carousel — the
 * whole argument for replacing the readiness card was that the band says one
 * thing, and a row of equal options is that card in a new coat.
 *
 *  1 PAGE 1 IS THE ANSWER. `deck[0]` is exactly `dayBand(input)`, unchanged. At
 *    rest the band is what it always was; the deck costs nothing until someone
 *    reaches for it.
 *
 *  2 NO DECK BELOW TWO. One candidate returns a one-page deck, which the
 *    clients draw with no pager and no dots. An indicator that always shows a
 *    single dot is chrome that means nothing.
 *
 *  3 NAMING RUNGS ONLY. You may page between CANDIDATES, never between
 *    VERDICTS. `order` and `single` name a training the athlete could choose
 *    differently; `race`, `deload`, `done`, `protect`, `rest` and `open` are
 *    statements about the day, and swiping past a floored reading to find a
 *    nicer one is precisely what the floor exists to prevent.
 *
 *  4 THREE, HARD. `rotation()` already refuses to name more than two trainings
 *    (`MAX_DUE`) on the grounds that three is a training camp; the same
 *    argument caps this. A deck invites the engine to get lazy — if there are
 *    always alternatives, nobody has to make the first one right — and the cap
 *    is the guard. If a fourth candidate would be worth showing, the RANKING
 *    needs work, not the pager.
 *
 * Each page is a full band built by the same ladder with the pages above it
 * rejected, so every one carries its own evidence line. That is the point of
 * the gesture: the reason a candidate sits where it sits IS the content.
 */
export const BAND_DECK_MAX = 3;

/** The rungs that name a training the athlete could reasonably choose
 *  differently. Everything else is a verdict about the day. */
const DECKABLE: readonly BandRung[] = ["order", "single"] as const;

export function dayBandDeck(input: DayBandInput): DayBand[] {
  const first = dayBand(input);
  if (!DECKABLE.includes(first.rung)) return [first];

  // AN ENROLLED ATHLETE HAS NO DECK, and the reason is not policy — it is that
  // there is nothing to page through. `dayBand()` sets `rot = plan ? null : …`,
  // so on a planned day the rotation is never consulted and the plan's own day
  // IS the answer; a candidate list drawn from the log would be offering an
  // athlete alternatives to a program they chose.
  //
  // It shipped without this guard and the failure was loud rather than subtle:
  // `nextDueKind` kept finding kinds in the log, each page was built by a
  // `dayBand()` that ignored the pruned rotation because a plan was set, and
  // the deck came out as the SAME page three times, under three dots. The
  // deck's own test suite missed it because every fixture in it was unplanned.
  if (input.plan) return [first];

  const rot = input.rot ?? rotation([...(input.sessions ?? [])], input.now ?? Date.now());
  const deck: DayBand[] = [first];
  const spent: TrainingKind[] = [...first.kinds];

  while (deck.length < BAND_DECK_MAX) {
    // DUE, not merely confident. `nextDueKind` returns the next CONFIDENT kind
    // — which is right for the correction it was written for ("not swimming
    // today, give me something else") and wrong here: a candidate page is a
    // whole band, and rung 8's head is the flat assertion "A ride is due."
    // Offered off `nextDueKind` it said exactly that about a ride taken
    // yesterday on a seven-day cadence. A deck page has to clear the same bar
    // the first page cleared, or the band is asserting something it knows to
    // be false in the one place this design exists to prevent that.
    const next = rot.kinds.find((k) => k.confident && k.ratio >= DUE_RATIO && !spent.includes(k.kind))?.kind;
    if (!next) break;
    // The same ladder, with everything already offered taken out of the
    // rotation — so a page is not a re-labelled copy of the one before it, it
    // is what the engine would have said had the kinds above it not been due.
    const pruned = rot.kinds.filter((k) => !spent.includes(k.kind) || k.kind === next);
    const page = dayBand({
      ...input,
      rot: { ...rot, kinds: pruned, due: pruned.filter((k) => k.confident && k.kind === next).slice(0, MAX_DUE) },
    });
    // A page that fell off the naming rungs is not a candidate, it is a
    // different verdict — and rule 3 says the deck does not cross that line.
    if (!DECKABLE.includes(page.rung) || !page.kinds.length) break;
    deck.push(page);
    spent.push(...page.kinds);
  }
  return deck;
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
 * leaves ~360pt. The head sets in the display face at `fs.display` (26), which
 * averages ~0.55em per character — about 25 characters a line, two lines, so
 * 44 leaves room for the break. The sentence sets at `fs.bodyLg` (14) regular,
 * ~50 characters a line, three lines, so 130 leaves the same slack. A head over
 * budget steps DOWN a rung (`fs.display` → `fs.headline`); it never wraps to a
 * third line and it is never ellipsized, because an instruction with its verb
 * cut off is worse than a smaller instruction.
 */
export const BAND_HEAD_MAX = 44;
export const BAND_SAY_MAX = 130;

/**
 * The NEXT kind to offer when the athlete says "not today" to an inferred day.
 * Cycles through the rotation's own order, skipping what is already on the
 * band, so the correction is one tap and the app learns what it got wrong.
 */
/**
 * TODAY'S ANSWER STAYS TODAY'S ANSWER — the pin.
 *
 * A total order (see `rotation()`) makes the band deterministic for a GIVEN
 * input. It does not stop the input moving underneath it: a refetch on focus, a
 * session synced from another device, a signal landing late — any of these can
 * re-rank the day while the athlete is looking at it, and an instruction that
 * rewrites itself unprompted is one nobody can act on.
 *
 * So the kinds the band already named today are promoted back to the front, in
 * the order it named them. Two rules keep this from becoming a lie:
 *
 *  - A PINNED KIND MUST STILL QUALIFY. It is only promoted if it is still in
 *    `due` — still confident, still into its own cycle. So the pin can reorder
 *    the day's answer and can never invent one.
 *  - IT SELF-HEALS. Train the pinned kind and its `daysSince` resets to 0, its
 *    ratio falls under `DUE_RATIO`, it leaves `due`, and the pin stops applying
 *    with nothing to clear. The band moves on because the DAY moved on, which
 *    is the only reason it should ever move.
 *
 * The pin is stored per local day by the client (mobile:
 * `lib/day-band-prefs.ts`), because "what today's answer is" is a fact about
 * today and expires with it — the same scoping "not today?" already has.
 */
export function pinRotation(rot: Rotation, pinned: readonly TrainingKind[]): Rotation {
  if (!pinned.length || !rot.due.length) return rot;
  // QUALIFYING, not `due` — and the difference is the whole reach of the pin.
  // `due` is already sliced to MAX_DUE, so looking there meant a pinned kind
  // that had slipped to third could not be promoted back: with three kinds
  // equally overdue the band pinned one, a later read re-ranked it out of the
  // top two, and the answer changed underneath the athlete — which is the
  // exact thing the pin exists to stop. The bar for promotion is the same bar
  // `due` itself is drawn against, so the pin still cannot invent an answer.
  const qualifies = rot.kinds.filter((k) => k.confident && k.ratio >= DUE_RATIO);
  const held = pinned
    .map((k) => qualifies.find((d) => d.kind === k))
    .filter((d): d is KindRotation => !!d);
  if (!held.length) return rot;
  const rest = qualifies.filter((d) => !held.includes(d));
  return { ...rot, due: [...held, ...rest].slice(0, MAX_DUE) };
}

export function nextDueKind(rot: Rotation, rejected: readonly TrainingKind[]): TrainingKind | null {
  const pool = rot.kinds.filter((k) => k.confident && !rejected.includes(k.kind));
  return pool.length ? pool[0]!.kind : null;
}
