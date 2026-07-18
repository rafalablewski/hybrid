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
  /** working tonnage, kg (0 for a cardio-only day). */
  tonnageKg: number;
  /** logged sets (a cardio/conditioning effort counts as 1). */
  sets: number;
  /** total cardio distance, km. */
  distanceKm: number;
}

/**
 * A real set — with its rest — can't take much under a minute, so a wall-clock
 * span shorter than one minute per logged set is the log's duration, not the
 * workout's, and must not render as one.
 */
const MIN_MINUTES_PER_SET = 1;

/** Build the receipt for the logged session that fulfilled a plan day. */
export function doneReceipt(
  session: LoggedSession,
  opts: { bodyweightKg?: number | null } = {},
): DoneReceipt {
  const stats = liveSessionStats(session.blocks, [], opts);
  const cardio = sessionCardioTotals(session.blocks);

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
  const durationMin = Math.max(spanPlausible ? spanMin! : 0, enteredMin > 0 ? Math.round(enteredMin) : 0);

  return {
    finishedClock: session.completedAt ? sessionClockTime(session.completedAt) : null,
    durationMin: durationMin > 0 ? durationMin : null,
    tonnageKg: stats.volume,
    sets: stats.sets,
    distanceKm: Math.round(cardio.distanceKm * 10) / 10,
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
 */
export function doneReceiptStats(r: DoneReceipt, units: WeightUnit): DoneReceiptStat[] {
  const out: DoneReceiptStat[] = [];
  if (r.durationMin != null) out.push({ value: `${r.durationMin} min`, labelKey: "w.home.rail.duration" });
  if (r.tonnageKg > 0) out.push({ value: fmtTonnage(r.tonnageKg, units), labelKey: "w.home.today.volume" });
  if (r.distanceKm > 0) out.push({ value: `${r.distanceKm} km`, labelKey: "w.home.today.distance" });
  if (r.sets > 0) out.push({ value: String(r.sets), labelKey: "w.home.today.sets" });
  return out;
}

const WEEKDAY_PREFIX_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s*/;

/**
 * Drop a plan-day title's leading weekday ("Thu, Upper + Engine" → "Upper +
 * Engine"): under an "All done for today" headline — and beside the rail's own
 * date line — the weekday is said twice. Titles without the prefix pass through.
 */
export function stripWeekdayPrefix(title: string): string {
  return title.replace(WEEKDAY_PREFIX_RE, "");
}
