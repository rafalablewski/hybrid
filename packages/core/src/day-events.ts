/**
 * WHAT IS ON A DAY — the three sources of the band's "tomorrow", and their order.
 *
 * The day band's protect rung (day-band.ts, rung 5) says "Five-a-side tomorrow.
 * Nothing on the legs today." It shipped with exactly one source: a WEEKLY
 * FIXTURE the app detected in the log. That is the only half of the question a
 * log can answer, and the PR that built it said so — a half marathon in six
 * weeks leaves no trace in the log until the day it happens, and a plan day is
 * a training day rather than an event.
 *
 * This file is the other two halves, and the rule that orders all three.
 *
 * ── THE ORDER, AND WHY IT IS THIS ONE ─────────────────────────────────────
 *
 *   1 declared    the athlete typed it. The most specific thing anyone knows
 *                 about that date, and the only one that came from a human.
 *   2 competition the enrolled plan's own day says `kind: "competition"` — the
 *                 program peaks to a meet and this is the meet. A fact, stated
 *                 by the thing the athlete enrolled in.
 *   3 fixture     a recurrence the app INFERRED from the log. A guess, and it
 *                 only gets the day when no fact wants it.
 *
 * The band already treats those three differently in VOICE — a fact is
 * asserted, a guess is hedged and shows the count it was drawn from — so the
 * order here is not merely precedence, it is the difference between the band
 * saying "Half marathon tomorrow." and "Usually a game tomorrow."
 *
 * ── ONLY THE GUESS IS REJECTABLE ──────────────────────────────────────────
 * "Not today?" exists because an INFERENCE can be wrong in a way the athlete
 * can see and the app cannot. A declared event is corrected by deleting it, and
 * a plan's competition day by leaving the plan — neither is the app's guess to
 * withdraw. So `reject` is applied to the fixture and to nothing else, which is
 * also what keeps a dismissed Thursday from silently cancelling a race.
 *
 * ── A COMPETITION DAY IS NOT A REST DAY ───────────────────────────────────
 * A program's race day prescribes no session (`sessions: []`), which means
 * `programCalendarDays()` reads it as `isTraining: false` and the schedule hands
 * it on as `isRest: true`. Before `ScheduledDay.kind` existed, that was the
 * ONLY thing the band could see about it — so on the morning of an athlete's
 * meet, the band said "Rest day. Day 37 of the plan, and it's there on purpose."
 * `dayEventToday()` is what stops that, and it is why the plan day's structured
 * kind had to be carried through rather than left as a display label.
 */

import { blocksKind, fixtureTomorrow, TRAINING_KINDS, type DayEvent, type TrainingKind } from "./day-band";
import type { LoggedSession, SessionBlock } from "./engines/session";
import type { ScheduledDay } from "./plan-schedule";
import type { PlanDiscipline } from "./plan-program";
import { addLocalDays, localDayKey } from "./day-key";

/**
 * A one-off the athlete declared — a race, a test, a trial.
 *
 * `date` is a LOCAL day key (yyyy-mm-dd) stored verbatim, the same idiom
 * `PlanDayOverride` uses: a race is on a calendar date, not at an instant, and
 * storing the key means the server never has to reason about the athlete's
 * timezone to know which day it lands on.
 */
export interface DeclaredEvent {
  id: string;
  /** Local yyyy-mm-dd. */
  date: string;
  kind: TrainingKind;
  /** What the athlete called it ("Half marathon"). Null falls back to the
   *  kind's own noun, so an event needs no name to be useful. */
  label?: string | null;
}

/**
 * THE LONGEST NAME WE KEEP, and it is arithmetic rather than a round number.
 *
 * A label is not a description — it is dropped straight into the band's HEAD,
 * which sets in the 26pt display face under a 44-character budget
 * (`BAND_HEAD_MAX`). What is left for the name is that budget minus the longest
 * wrapper any locale puts around it: `"{event} tomorrow."` in English costs 10
 * characters (Polish 7, German 8), and `"{event} today."` costs 7 to 9. So 34,
 * and `day-band.test.ts` puts a label of exactly this length through every head
 * template in all three languages rather than trusting the subtraction.
 *
 * A name that will not fit is TRIMMED rather than rejected: an athlete typing
 * "Powerlifting regionals, session two" has told us something true, and losing
 * the tail of it is better than losing the event.
 */
export const EVENT_LABEL_MAX = 34;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The API's rows → events, dropping anything that cannot be one. The band puts
 * whatever this returns in the largest type on the screen, so a row with a
 * broken date or an unknown kind is discarded rather than defaulted: an event
 * on the wrong day is worse than no event.
 */
export function sanitizeDeclaredEvents(raw: unknown): DeclaredEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: DeclaredEvent[] = [];
  for (const r of raw) {
    const row = r as Record<string, unknown>;
    const id = typeof row?.id === "string" ? row.id : "";
    const date = typeof row?.date === "string" ? row.date : "";
    const kind = row?.kind as TrainingKind;
    if (!id || !DAY_KEY_RE.test(date) || !TRAINING_KINDS.includes(kind)) continue;
    const label = typeof row?.label === "string" ? row.label.trim().slice(0, EVENT_LABEL_MAX) : "";
    out.push({ id, date, kind, label: label || null });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** The declared event on one local day. A day holds ONE event as far as the
 *  band is concerned — it can only protect a day once — so the earliest
 *  declared wins and the rest are the calendar's business, not the band's. */
export function declaredOn(events: readonly DeclaredEvent[] | undefined, dayKey: string): DeclaredEvent | null {
  return (events ?? []).find((e) => e.date === dayKey) ?? null;
}

/** The plan's competition day on one local day, if the athlete is enrolled and
 *  the program has one. */
export function planRaceOn(days: readonly ScheduledDay[] | undefined, dayKey: string): ScheduledDay | null {
  return (days ?? []).find((d) => d.dateKey === dayKey && d.kind === "competition") ?? null;
}

/**
 * WHAT DISCIPLINE A PLAN'S DAY IS — and why `blocksKind()` alone cannot say.
 *
 * `blocksKind()` names a day by its first CARDIO block, and its own comment
 * claims that "a plan's day, which has blocks and no session, resolves through
 * exactly the same rule". It does not. A plan's prose endurance entry is
 * expanded into a **conditioning** block carrying the coach's label for the
 * workout — "Hills", "Tempo", "Easy", "Long" — so every day of the app's only
 * 9-week 5K program resolves to `gym`, and the band told an enrolled runner
 * that a gym session was due on a tempo day.
 *
 * No keyword will fix that: "Tempo" is a workout, not a modality. The program
 * around it is what knows, so the fallback is the plan's own DISCIPLINE. It is
 * a mapping and it is stated as one:
 *
 *   strength-percent | hypertrophy → gym       a barbell program is gym work
 *   conditioning                   → other     a Hyrox/CrossFit race is neither
 *                                              a gym session nor a run, and
 *                                              `other` is the app's word for
 *                                              exactly that
 *   endurance                      → running   TRUE OF THIS LIBRARY: the one
 *                                              endurance program in it is a
 *                                              running plan. Add a cycling or
 *                                              swimming program and this line
 *                                              is the thing that must change —
 *                                              give the program a discipline
 *                                              that says which, rather than
 *                                              widening the guess.
 *
 * Evidence still wins: a day whose blocks DO name a modality is named by them,
 * so a plan that writes "Easy Run" as a cardio block never reaches the mapping.
 */
const DISCIPLINE_KIND: Record<PlanDiscipline, TrainingKind> = {
  "strength-percent": "gym",
  hypertrophy: "gym",
  endurance: "running",
  conditioning: "other",
};

export function planDayKind(
  blocks: readonly SessionBlock[] | undefined,
  discipline: PlanDiscipline | undefined,
): TrainingKind {
  const named = blocksKind(blocks as { kind?: string; name?: string }[] | undefined);
  if (named !== "gym") return named;
  // `gym` is `blocksKind`'s answer for "no cardio block here", which means two
  // different things: "this is barbell work" and "I could not tell". What
  // separates them is the day's FIRST block, by the same idiom `blocksKind`
  // itself uses — a brick session is named by what it OPENED with, and a plan
  // author puts the day's headline work first. A tempo day opens with an
  // unnameable conditioning block, so the plan gets to name it; the 5K
  // program's run-then-lift day opens the same way and is still a run day;
  // and a squat session inside that same program opens with a strength block
  // and stays gym work.
  if (!discipline || blocks?.[0]?.kind !== "conditioning") return "gym";
  return DISCIPLINE_KIND[discipline] ?? "gym";
}

/**
 * WHAT DISCIPLINE A PLAN'S RACE IS.
 *
 * A competition day carries no blocks — that is what makes it a competition
 * day — so it cannot name itself. The program around it can: the commonest kind
 * across everything it DOES prescribe is what it trains the athlete to do, and
 * therefore what they are about to compete in.
 */
export function planRaceKind(
  days: readonly ScheduledDay[] | undefined,
  discipline?: PlanDiscipline,
): TrainingKind {
  const tally = new Map<TrainingKind, number>();
  for (const d of days ?? []) {
    if (d.isRest || !d.blocks.length) continue;
    const k = planDayKind(d.blocks, discipline);
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  let best: TrainingKind = discipline ? DISCIPLINE_KIND[discipline] ?? "gym" : "gym";
  let most = 0;
  for (const [k, n] of tally) if (n > most) { best = k; most = n; }
  return best;
}

export interface DayEventSources {
  /** Everything the athlete has declared. Past dates are harmless — the lookup
   *  is by day key. */
  declared?: readonly DeclaredEvent[];
  /** The enrolled plan's scheduled days, when there is a plan. */
  planDays?: readonly ScheduledDay[];
  /** That plan's discipline — how a day whose blocks cannot name themselves is
   *  named. See `planDayKind`. */
  planDiscipline?: PlanDiscipline;
  /** The athlete's log — the only source a fixture can be detected from. */
  sessions?: readonly LoggedSession[];
  /** Kinds the athlete has said are not happening. Applied to the FIXTURE
   *  only; see the note at the top of this file. */
  reject?: readonly TrainingKind[];
}

/** A declared event as the band's own event shape. */
const asEvent = (e: DeclaredEvent): DayEvent => ({ kind: e.kind, label: e.label ?? null, source: "declared" });

/**
 * THE FACT on a given day — a declared event, or the plan's competition day.
 * No fixture: a guess is only ever offered about TOMORROW, because that is the
 * one day the band can still change what you do about it.
 */
export function dayFactOn(src: DayEventSources, dayKey: string): DayEvent | null {
  const declared = declaredOn(src.declared, dayKey);
  if (declared) return asEvent(declared);
  const race = planRaceOn(src.planDays, dayKey);
  if (!race) return null;
  return {
    kind: planRaceKind(src.planDays, src.planDiscipline),
    // The program's own word for the day ("Race day", "Competition", whatever
    // `peakLabel` says), already localized by the plan it came from.
    label: race.kindLabel ?? race.title ?? null,
    source: "plan",
  };
}

/**
 * WHAT IS ON TOMORROW — the whole rule, in one place, so a host cannot hold a
 * different one. It used to live in `home.tsx` as
 * `plan ? null : fixtureTomorrow(...)`, which quietly meant an enrolled athlete
 * got the protect rung from nothing at all.
 */
export function dayEventTomorrow(src: DayEventSources, now: number = Date.now()): DayEvent | null {
  // addLocalDays rather than +24h: on the two days a year that are 23 or 25
  // hours long, adding a fixed day in milliseconds lands back on today.
  const key = localDayKey(addLocalDays(now, 1));
  return dayFactOn(src, key) ?? fixtureTomorrow([...(src.sessions ?? [])], now, src.reject ?? []);
}

/**
 * WHAT IS ON TODAY. A race is the one calendar entry the app cannot move, so
 * the band answers with it before it answers with anything else — see the
 * `race` rung in day-band.ts.
 */
export function dayEventToday(src: DayEventSources, now: number = Date.now()): DayEvent | null {
  return dayFactOn(src, localDayKey(now));
}
