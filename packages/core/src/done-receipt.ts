/**
 * Done receipt — the completed-state summary of a plan day ("All done for
 * today"): what was trained, when it finished, and only the numbers that can
 * be trusted. One pure model both week rails render (design:
 * design/done-card-redesign-ideas.html, concept 1 "The receipt, corrected"),
 * so web + mobile agree on every figure AND on which figures not to show.
 *
 * The trust rule this file exists for: `completedAt - startedAt` is the span
 * of the LOG, not necessarily of the WORKOUT. A session typed in after the
 * fact ("log it — it still counts") spans a minute of typing while carrying a
 * full session of sets, and presenting that minute as training duration is a
 * lie that poisons every other number on the card. A duration below the
 * plausibility floor is therefore dropped, falling back to the athlete's own
 * entered minutes (cardio/conditioning blocks) when present, else to nothing.
 *
 * And above all of that sits the MEASUREMENT: when the session is matched to
 * the athlete's device (Apple Watch — see session-device.ts), the device's
 * recording is the duration, the distance and the climb. Nothing typed in
 * outranks a wrist that was there. The logged figures aren't lost — they stay
 * one `ignoreDevice: true` read away, which is exactly what the summary's
 * comparison panel does.
 */
import type { LoggedSession } from "./engines/session";
import { sessionCardioTotals, sessionClockTime } from "./engines/session";
import { liveSessionStats } from "./live-stats";
import { fmtTonnage, type WeightUnit } from "./units";

export interface DoneReceipt {
  /** local clock the session finished at ("11:18"); null when never stamped. */
  finishedClock: string | null;
  /** trusted training minutes; null when untracked or below the plausibility floor. */
  durationMin: number | null;
  /**
   * The SAME trusted time to the second, when a matched device measured it —
   * null for a typed session, which has no seconds to tell. Every DERIVED rate
   * (pace above all) reads this in preference to `durationMin`: a 510 m swim in
   * 19:41 paces 3:52 /100m, and rounding the clock to 20 min before dividing
   * turns that into 3:55 — a disagreement with the watch made entirely of our
   * own rounding. Display of the duration itself stays in minutes.
   */
  durationSec: number | null;
  /** working tonnage, kg (0 for a cardio-only day). */
  tonnageKg: number;
  /**
   * Logged EFFORTS — strength sets plus one per cardio/conditioning block.
   * This is the plausibility floor's unit (a swim is one effort, and one
   * minute of wall clock is enough to have swum it), NOT a display figure.
   * Nothing renders it as "sets": see `strengthSets`.
   */
  sets: number;
  /**
   * Sets logged on STRENGTH blocks — the only sets there are.
   *
   * A set is a resistance-training unit: a bout of reps against a load, with
   * rest around it. Swimming, tennis and squash have no such thing, so a swim
   * that read "1 SETS" on the done card was the data model talking (`sets`
   * counts one per cardio effort) rather than the sport. The same rule the
   * Wrapped already applies per discipline — never a set count for a match —
   * applies here at the source: the receipt carries the strength figure
   * separately, and it is 0 for every swim, match and conditioning piece.
   */
  strengthSets: number;
  /** total cardio distance, km. */
  distanceKm: number;
  /** total elevation gain, m (0 when nothing climbed or nothing recorded it). */
  elevationM: number;
  /** true when a matched device supplied the figures above (duration, and the
   *  distance/climb it recorded) — i.e. they are MEASURED, not typed or
   *  modelled. False for a purely logged session, and for any read taken with
   *  `ignoreDevice`. */
  measured: boolean;
}

/**
 * A real set — with its rest — can't take much under a minute, so a wall-clock
 * span shorter than one minute per logged set is the log's duration, not the
 * workout's, and must not render as one.
 */
const MIN_MINUTES_PER_SET = 1;

/** A set counts once the athlete has typed reps or a load into it — the same
 *  rule liveSessionStats applies, so the two can't disagree on what's logged. */
const filled = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

/** Sets logged on strength blocks — the session's only true set count. */
function strengthSetCount(session: LoggedSession): number {
  let n = 0;
  for (const b of session.blocks)
    if (b.kind === "strength") n += b.sets.filter((s) => filled(s.reps) || filled(s.load)).length;
  return n;
}

/**
 * Build the receipt for the logged session that fulfilled a plan day.
 *
 * `ignoreDevice` reads the session as if it had never been matched — the
 * athlete's own logged figures. Exactly one caller wants that (the summary's
 * logged-vs-measured panel); everything else gets the measurement.
 */
export function doneReceipt(
  session: LoggedSession,
  opts: { bodyweightKg?: number | null; ignoreDevice?: boolean } = {},
): DoneReceipt {
  const stats = liveSessionStats(session.blocks, [], opts);
  const cardio = sessionCardioTotals(session.blocks);
  const device = opts.ignoreDevice ? null : (session.device ?? null);

  // Athlete-entered minutes are trusted as-is: cardio blocks plus conditioning
  // blocks (which carry their own `minutes`) — entered, not clock-derived.
  const enteredMin =
    cardio.minutes +
    session.blocks.reduce((n, b) => (b.kind === "conditioning" ? n + (b.minutes ?? 0) : n), 0);

  const started = Date.parse(session.startedAt);
  const completed = Date.parse(session.completedAt ?? "");
  const spanMin =
    Number.isFinite(started) && Number.isFinite(completed) && completed > started
      ? Math.round((completed - started) / 60000)
      : null;
  const spanPlausible = spanMin != null && spanMin >= Math.max(1, stats.sets * MIN_MINUTES_PER_SET);

  // The larger trusted candidate wins: a live-logged clock span covers rest and
  // everything entered within it, while for an after-the-fact log the athlete's
  // entered minutes dwarf (and outrank) the minute the typing took.
  const loggedMin = Math.max(spanPlausible ? spanMin! : 0, enteredMin > 0 ? Math.round(enteredMin) : 0);

  // …and a device that recorded the workout outranks every one of them.
  const measured = device != null && device.durationMin > 0;
  const durationMin = measured ? device!.durationMin : loggedMin;
  const distanceKm = device?.distanceKm != null ? device.distanceKm : cardio.distanceKm;
  const elevationM = device?.elevationM != null ? device.elevationM : cardio.elevationM;

  return {
    finishedClock: session.completedAt ? sessionClockTime(session.completedAt) : null,
    durationMin: durationMin > 0 ? durationMin : null,
    durationSec: measured && device!.durationSec != null ? device!.durationSec : null,
    tonnageKg: stats.volume,
    sets: stats.sets,
    strengthSets: strengthSetCount(session),
    // Rounded to the METRE, not to 0.1 km. A 510 m pool swim is 0.51 km, and
    // rounding it to 0.5 here erased the ten metres the watch measured — the
    // summary then printed "500 m" beside the device panel's "510 m" and derived
    // a pace from the wrong distance. Callers that want a coarse "12.3 km"
    // headline round at the point they render it (see doneReceiptStats).
    distanceKm: Math.round(distanceKm * 1000) / 1000,
    elevationM: Math.round(elevationM),
    measured,
  };
}

/** One receipt figure: the value carries its unit ("48 min", "3.0 t"); the
 *  label is an i18n key so each client renders its own language. */
export interface DoneReceiptStat {
  value: string;
  labelKey: string;
}

/**
 * The stats a receipt shows, in display order — duration, volume, distance,
 * sets — each included only when it has something true to say. Unit lives in
 * the value; the uppercase label stays a bare word (one grammar, per the
 * design's trust pass).
 *
 * SETS IS A STRENGTH FIGURE. It reads `strengthSets`, so a swim, a tennis
 * match or a squash game — none of which have sets — shows its duration and
 * distance and stops there, instead of the "1 SETS" the effort counter used to
 * produce. A day that lifted and swam still reports the sets it actually
 * lifted, not the swim padded into the count.
 */
export function doneReceiptStats(r: DoneReceipt, units: WeightUnit): DoneReceiptStat[] {
  const out: DoneReceiptStat[] = [];
  if (r.durationMin != null) out.push({ value: `${r.durationMin} min`, labelKey: "w.home.rail.duration" });
  if (r.tonnageKg > 0) out.push({ value: fmtTonnage(r.tonnageKg, units), labelKey: "w.home.today.volume" });
  // The receipt keeps metre precision; a rail stat reads in tenths of a km —
  // but only once there IS a kilometre. Under one, tenths round a 34 m pool
  // swim to "0 km", so anything sub-kilometre reads in metres (the same rule
  // the device panel and the match picker already use).
  if (r.distanceKm > 0)
    out.push({
      value: r.distanceKm < 1 ? `${Math.round(r.distanceKm * 1000)} m` : `${Math.round(r.distanceKm * 10) / 10} km`,
      labelKey: "w.home.today.distance",
    });
  if (r.strengthSets > 0) out.push({ value: String(r.strengthSets), labelKey: "w.home.today.sets" });
  return out;
}

const WEEKDAY_PREFIX_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s*/;

/**
 * Drop a plan-day title's leading weekday ("Thu, Upper + Engine" → "Upper +
 * Engine"): under an "All done for today" headline — and beside the rail's own
 * date line — the weekday is said twice. Titles without the prefix pass through.
 */
export function stripWeekdayPrefix(title: string): string {
  return (title || "").replace(WEEKDAY_PREFIX_RE, "");
}
