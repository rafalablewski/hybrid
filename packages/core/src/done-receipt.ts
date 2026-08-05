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
import { sessionEnergy } from "./energy";
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
  /**
   * Energy cost, kcal — the device's measurement when one recorded the work,
   * else the MET model's ESTIMATE from what was logged (energy.ts). Null when
   * neither can say anything honest: no bodyweight (the model is linear in
   * mass, so inventing one would invent the answer) or no minutes anywhere.
   */
  kcal: number | null;
  /** true when every calorie in `kcal` was MEASURED by a device — so the UI
   *  drops the "~" it otherwise wears. False for a modelled figure, and for a
   *  merged day that mixes a measured session with a typed one. */
  kcalMeasured: boolean;
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

  // The day's burn, off the same trusted duration every other figure here uses
  // — the device's measurement when it counted the calories, else the MET model
  // (energy.ts owns both branches, and returns null rather than guessing when
  // there's no bodyweight to scale by).
  const energy = sessionEnergy(session, {
    bodyweightKg: opts.bodyweightKg,
    durationMin: durationMin > 0 ? durationMin : null,
    ignoreDevice: opts.ignoreDevice,
  });

  return {
    finishedClock: session.completedAt ? sessionClockTime(session.completedAt) : null,
    durationMin: durationMin > 0 ? durationMin : null,
    durationSec: measured && device!.durationSec != null ? device!.durationSec : null,
    tonnageKg: stats.volume,
    sets: stats.sets,
    strengthSets: strengthSetCount(session),
    // NOT ROUNDED — carried at whatever precision it arrived with, because the
    // measured branch above is the device's exact figure and the pace the
    // summary shows is `durationSec / distanceKm`. Every grid we tried erased a
    // real measurement one sport down: 0.1 km lost the ten metres of a 510 m
    // swim, and a metre would lose the tail of anything shorter. Callers round
    // where they RENDER — doneReceiptStats for the rail's "12.3 km",
    // formatSportDistance for the sport's own unit.
    distanceKm,
    elevationM: Math.round(elevationM),
    kcal: energy?.kcal ?? null,
    kcalMeasured: energy?.measured ?? false,
    measured,
  };
}

/** One receipt figure: the value carries its unit ("48 min", "3.0 t"); the
 *  label is an i18n key so each client renders its own language. */
export interface DoneReceiptStat {
  value: string;
  labelKey: string;
  /** true when the figure is MODELLED rather than logged or measured — the
   *  value already carries the "~" that says so; the flag lets a client treat
   *  it differently (a quieter tone, a tooltip) without parsing the string. */
  estimate?: boolean;
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
 *
 * ENERGY COMES LAST, and it is the one figure here that can be MODELLED: it
 * wears a "~" unless a device counted every calorie in it (the Wrapped's
 * idiom), and it is omitted entirely when there's no bodyweight to scale the
 * MET model by — an estimate marked as one is honest, an invented mass is not.
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
  if (r.kcal != null && r.kcal > 0)
    out.push({
      value: `${r.kcalMeasured ? "" : "~"}${r.kcal} kcal`,
      labelKey: "w.home.today.energy",
      estimate: !r.kcalMeasured,
    });
  return out;
}

// stripWeekdayPrefix lived here to trim the weekday off the done receipt's
// title line ("Thu, Upper + Engine" → "Upper + Engine"). That line no longer
// names the work at all — the Done-today card below the rail is the one place a
// finished session is named — so the helper went with it.
