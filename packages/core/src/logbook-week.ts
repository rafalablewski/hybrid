import { localDayKey, localMidnightMs, addLocalDays } from "./day-key";
import type { LoggedSession } from "./engines/session";
import { doneReceipt, type DoneReceipt } from "./done-receipt";
import { sessionKind, type TrainingKind } from "./day-band";

// ============================================================
//  Logbook week — the plan-less athlete's week rail ("The Constant").
//
//  A free logger with no enrolled program used to see the first-run chooser
//  forever: five workouts by Friday and still no calendar. This engine gives
//  that athlete the SAME week-rail object plan users get, in LOGBOOK MODE —
//  the last seven local calendar days ending today, each day reconciled
//  against the logged sessions. A logbook makes no promises, so there is no
//  "missed" state: a day either holds training (✓, chalk) or it stays quiet
//  greyscale — never terracotta guilt.
//
//  Pure and client-agnostic: web + mobile render the same rail from the same
//  result (mirrors plan-schedule.ts, which owns the enrolled variant).
// ============================================================

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Days the logbook rail shows at once — the trailing window ending today. */
export const LOGBOOK_WINDOW = 7;

/** How far back a SCROLLABLE rail reaches. Seven fixed chips could only ever
 *  show seven days, which is why the header had to carry a "Last 7 days"
 *  caption explaining the control's own limits; a rail that scrolls shows its
 *  own extent, so the caption goes and the window can be as deep as the data.
 *  Four weeks is one mesocycle — far enough to see a pattern, near enough that
 *  building every day up front stays free. */
export const LOGBOOK_SCROLL_WINDOW = 28;

/** One calendar day of the logbook rail. Field names match ScheduledDay so the
 *  Today screen can scope its day-following cards (Also-today / feeling) to a
 *  lifted day from EITHER rail without caring which one it came from. */
export interface LogbookDay {
  /** position in the window (0-based; the last entry is today). */
  index: number;
  /** local yyyy-mm-dd. */
  dateKey: string;
  /** local-midnight timestamp. */
  ts: number;
  weekdayShort: string; // "Mon"
  dayOfMonth: number; // 13
  monthShort: string; // "Jul"
  isToday: boolean;
  /** ids of the sessions logged on this local day, in logged order. */
  sessionIds: string[];
  /** ≥1 session logged on this day. */
  logged: boolean;
  /** Trained minutes on this day, summed across its sessions and read through
   *  the DEVICE's recording wherever there is one (doneReceipt is device-true
   *  by default) — so a watch-measured 52:18 counts as 52, not as the 50 that
   *  was typed. */
  loadMin: number;
  /** `loadMin` as a fraction of the window's HEAVIEST day, 0–1. This is what a
   *  day cell draws instead of a ✓. A tick says something happened; a bar the
   *  width of the day's relative load says how much, in the same pixels — and
   *  seven of them are a training week at a glance, which is the only reason
   *  the strip exists. Relative rather than absolute because there is no honest
   *  universal ceiling for "a hard day": it is whatever this athlete's hardest
   *  day in view actually was. */
  load: number;
  /**
   * WHAT THE DAY WAS, for the strip that draws it. The kind of the day's
   * LONGEST session, by the same `sessionKind` the day band's rotation reads —
   * so the bar's colour and the band's vocabulary can never call the same day
   * two different things.
   *
   * The longest rather than the first, because the bar's WIDTH is minutes and
   * its colour should describe the minutes it is drawing: a 12-minute warm-up
   * jog before a 70-minute lift is a lifting day, whatever order they were
   * banked in. Null on a day with nothing logged, and on a day whose sessions
   * all carry no trustworthy duration to compare.
   */
  kind: TrainingKind | null;
}

export interface LogbookWeekResult {
  /** the trailing LOGBOOK_WINDOW days, oldest first; the last one is today. */
  days: LogbookDay[];
  /** index of today in `days` (always the last entry). */
  todayIndex: number;
  /** how many of the window's days hold at least one session. */
  loggedDayCount: number;
}

/** Build the trailing seven-day logbook week from the logged sessions. */
export function logbookWeek(
  sessions: LoggedSession[],
  opts: { now?: number; windowDays?: number } = {},
): LogbookWeekResult {
  const now = opts.now ?? Date.now();
  const windowDays = Math.max(1, opts.windowDays ?? LOGBOOK_WINDOW);

  // Sessions grouped by their LOCAL day key, preserving logged order.
  const byDate = new Map<string, string[]>();
  // Trained minutes per local day, device-true (see LogbookDay.loadMin).
  const minsByDate = new Map<string, number>();
  // The day's kind, carried with the minutes that won it (see LogbookDay.kind).
  const kindByDate = new Map<string, { kind: TrainingKind; mins: number; at: number; id: string }>();
  for (const s of sessions) {
    const ts = Date.parse(s.startedAt);
    if (!Number.isFinite(ts)) continue;
    const k = localDayKey(ts);
    const ids = byDate.get(k);
    if (ids) ids.push(s.id);
    else byDate.set(k, [s.id]);
    const mins = doneReceipt(s).durationMin;
    if (mins != null && mins > 0) minsByDate.set(k, (minsByDate.get(k) ?? 0) + mins);
    // TIES ARE BROKEN BY A TOTAL ORDER, not by arrival. "The longest session
    // holds the day" leaves a 40-minute run and a 40-minute lift undecided, and
    // deciding those by whichever the caller happened to list first means the
    // same week repaints when the same sessions are re-sorted. So: longer wins;
    // equal minutes go to the one that STARTED LATER, because a day ends as
    // whatever you finished it doing; and the id settles the last tie, which is
    // arbitrary but stable, which is the only property that matters by then.
    const held = kindByDate.get(k);
    const mine = { kind: sessionKind(s), mins: mins ?? 0, at: ts, id: s.id };
    if (!held || mine.mins > held.mins
      || (mine.mins === held.mins && (mine.at > held.at || (mine.at === held.at && mine.id > held.id)))) {
      kindByDate.set(k, mine);
    }
  }

  const todayMidnight = localMidnightMs(now);
  const todayKey = localDayKey(now);
  const days: LogbookDay[] = [];
  for (let i = 0; i < windowDays; i++) {
    const ts = addLocalDays(todayMidnight, i - (windowDays - 1));
    const dt = new Date(ts);
    const dateKey = localDayKey(ts);
    const sessionIds = byDate.get(dateKey) ?? [];
    days.push({
      index: i,
      dateKey,
      ts,
      weekdayShort: WEEKDAY[dt.getDay()]!,
      dayOfMonth: dt.getDate(),
      monthShort: MONTH[dt.getMonth()]!,
      isToday: dateKey === todayKey,
      sessionIds,
      logged: sessionIds.length > 0,
      loadMin: Math.round(minsByDate.get(dateKey) ?? 0),
      kind: kindByDate.get(dateKey)?.kind ?? null,
      load: 0, // normalised below, once the window's heaviest day is known
    });
  }

  // Normalise against the heaviest day IN VIEW. A day that holds sessions but
  // no trustworthy duration (a strength log with no clock) still gets a visible
  // floor, because "trained" and "trained for zero minutes" are different facts
  // and only one of them is true.
  const peak = days.reduce((m, d) => Math.max(m, d.loadMin), 0);
  for (const d of days) {
    d.load = d.loadMin > 0 && peak > 0 ? Math.min(1, d.loadMin / peak) : d.logged ? 0.18 : 0;
  }

  return {
    days,
    todayIndex: days.length - 1,
    loggedDayCount: days.filter((d) => d.logged).length,
  };
}

/**
 * Merge same-day receipts into one honest summary for the logbook rail's
 * done state: sums only what every figure can vouch for (doneReceipt already
 * dropped untrustworthy durations per session). Null for an empty day.
 */
export function mergeDoneReceipts(receipts: DoneReceipt[]): DoneReceipt | null {
  if (!receipts.length) return null;
  let durationMin = 0;
  let hasDuration = false;
  // Seconds only add up while EVERY measured session brought them; a day mixing
  // a second-accurate recording with a typed session has no honest second total.
  let durationSec = 0;
  let allSec = true;
  let tonnageKg = 0;
  let sets = 0;
  let strengthSets = 0;
  let distanceKm = 0;
  let elevationM = 0;
  // Calories add up across the day, but the "~" doesn't come off unless EVERY
  // session that contributed one was measured: a day mixing a watch-counted run
  // with a typed gym session has a total that is part measurement, part model,
  // and the honest label for that is still an estimate.
  let kcal = 0;
  let hasKcal = false;
  let kcalMeasured = true;
  // The day counts as measured when ANY of its sessions was matched to a device
  // — that part of the day's totals came off a wrist.
  let measured = false;
  // The day's distance belongs to ONE discipline only while every session that
  // covered ground covered it the same way. A swim and a tennis match sum to a
  // kilometre figure made of two incomparable kinds of kilometre, so the day
  // loses its lead and the hero falls back to a total that is always true.
  let cardioLead: string | null = null;
  let leadAgrees = true;
  for (const r of receipts) {
    if (r.durationMin != null) {
      durationMin += r.durationMin;
      hasDuration = true;
      if (r.durationSec != null) durationSec += r.durationSec;
      else allSec = false;
    }
    tonnageKg += r.tonnageKg;
    sets += r.sets;
    strengthSets += r.strengthSets;
    distanceKm += r.distanceKm;
    elevationM += r.elevationM;
    if (r.kcal != null && r.kcal > 0) {
      kcal += r.kcal;
      hasKcal = true;
      if (!r.kcalMeasured) kcalMeasured = false;
    }
    if (r.distanceKm > 0) {
      if (r.cardioLead == null) leadAgrees = false;
      else if (cardioLead == null) cardioLead = r.cardioLead;
      else if (cardioLead !== r.cardioLead) leadAgrees = false;
    }
    measured = measured || r.measured;
  }
  return {
    durationMin: hasDuration ? durationMin : null,
    durationSec: hasDuration && allSec && durationSec > 0 ? durationSec : null,
    tonnageKg,
    sets,
    strengthSets,
    // Summed, not rounded — the parts are the devices' exact figures (see
    // doneReceipt). The rail rounds when it renders.
    distanceKm,
    elevationM: Math.round(elevationM),
    kcal: hasKcal ? kcal : null,
    kcalMeasured: hasKcal && kcalMeasured,
    measured,
    cardioLead: leadAgrees ? cardioLead : null,
  };
}
