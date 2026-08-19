import type { Biometrics } from "./types";

/**
 * HEAT EXPOSURE — sauna, as a recovery input.
 *
 * NO DEVICE WILL EVER MEASURE THIS. A watch does not know you sat in a sauna
 * and nothing in the room reports to us, so the entire input is two numbers the
 * athlete TYPES: how long, and how hot. That is not a gap waiting for a sensor;
 * it is the fact that decides the whole shape of this module.
 *
 * ── WHY THERE IS A SUPPRESSION RULE ────────────────────────────────────────
 * If sauna improves sleep quality and parasympathetic tone, `biometricAdjustment`
 * ALREADY credits it — at ±15 points, read from HRV, resting HR and sleep
 * against the athlete's own baseline. On the mornings it matters, that is not a
 * proxy for the effect; it IS the effect. So a flat "+3 because you saunaed"
 * counts one night of physiology twice, and on a bad dose (long, hot, straight
 * after a hard session — which suppresses overnight HRV) it credits the sauna
 * while the wearable correctly debits it, and the athlete watches two terms on
 * one card argue about one night.
 *
 * Heat is therefore a PRIOR and the wearable is a MEASUREMENT, and a
 * measurement beats a prior: with a fresh biometric read the credit is exactly
 * zero, and `suppressed` says so, so the card can state the rule rather than
 * silently rounding to nothing. This is the same posture `BIOMETRIC_FRESH_DAYS`
 * already takes ("no measurement, no adjustment") and the same
 * prior-corrected-by-observation move `landmark-adapt.ts` makes.
 *
 * A typed number is still allowed to count — the app runs on self-reports (RPE,
 * the post-session feel, the check-in, every gram of logged food). Heat is just
 * the one recovery input that will never graduate out of that tier, which is
 * why the suppression rule is a permanent shape rather than a stopgap.
 *
 * ── WHY TEMPERATURE AND MODALITY ARE BOTH INPUTS ───────────────────────────
 * Duration alone is not the dose. Twenty minutes at 90 °C and twenty minutes in
 * a 55 °C infrared cabin are not the same stimulus, and a model that reads only
 * the clock scores them identically. `heatIntensity` converts minutes into
 * EQUIVALENT MINUTES at a stated reference, and everything downstream — the
 * saturating curve, the cap, the decay — is unchanged and takes an honest input.
 *
 * And neither is duration-and-temperature: air temperature is only a PROXY for
 * thermal strain, and the proxy has a different constant in each modality. One
 * ramp calibrated on dry sauna scored a 45 °C steam room at exactly zero,
 * because 45 °C is the dry floor. So each protocol carries its own pair — see
 * HEAT_PROTOCOLS below, which is where that argument is made in full.
 *
 * WHAT THIS STILL CANNOT SEE: humidity, as a measured quantity. A steam room at
 * 60% and one at 100% are different doses and the model reads the modality you
 * picked, not the air you were in. Three calibrated ramps is better than one and
 * is not the same as solved, and a humidity term fitted to nothing would be
 * false precision wearing a curve.
 *
 * ── NO NEGATIVE TERM ───────────────────────────────────────────────────────
 * The overdose case is real and unmeasurable from a typed duration, and the
 * wearable measures its consequence the next morning anyway. Putting a cost on
 * the readiness ring for something the engine is guessing at would satisfy the
 * sum law's arithmetic while violating its point. So `points` is never
 * negative, which is also why `readinessDeficit` needs no new cost kind: a
 * positive credit takes no arc, exactly as a positive `bioAdj` takes none.
 *
 * Pure data + math. No UI, no I/O.
 */

/** One Signal row, as this module needs to read it. `id` is optional so a caller
 *  that has not selected it (the engines) still type-checks; the diary-style
 *  surfaces that need to DELETE a sitting pass it. */
export interface HeatSignalRow {
  id?: string;
  kind: string;
  value: number;
  source: string;
  ts: string | Date;
}

/* ── THE TEMPERATURE MODEL ─────────────────────────────────────────────────── */

/**
 * WHAT KIND OF HEAT. Air temperature means something DIFFERENT in each.
 *
 * A dry sauna at 90 °C, a steam room at 45 °C and an infrared cabin at 55 °C
 * are all real thermal doses, and a single ramp calibrated on the first scores
 * the other two at roughly nothing. The reason is not that the thermometer is
 * lying — it is that air temperature is only a proxy for thermal strain, and
 * the proxy has a different constant of proportionality in each modality:
 *
 *   • DRY SAUNA — 70–100 °C at 10–20% humidity. Sweat evaporates freely, which
 *     is exactly why the air has to be that hot to load you. The anchor.
 *   • STEAM — 40–50 °C at ~100% humidity. Evaporative cooling is essentially
 *     blocked, so the body cannot shed what it makes and a far lower air
 *     temperature produces comparable strain.
 *   • INFRARED — 45–60 °C air, but the panels heat tissue RADIANTLY rather than
 *     through the air, so the thermometer under-reads the dose by construction.
 *
 * So each protocol carries its own floor and reference, and the question each
 * pair answers is the same one: what air temperature, in THIS modality, loads
 * an athlete the way 80 °C of dry sauna does?
 *
 * These are calibrations, not measurements. A steam room at 60% humidity and
 * one at 100% are different doses and this still cannot tell them apart — it
 * has moved from one ramp for three modalities to one ramp EACH, which is
 * better and is not the same as solved.
 */
export type HeatProtocol = "sauna" | "steam" | "infrared";

export const HEAT_PROTOCOLS: Record<HeatProtocol, { floorC: number; refC: number }> = {
  // The anchor. Unchanged, and everything else is expressed against it.
  sauna: { floorC: 45, refC: 80 },
  // A humid room below ~35 °C is not thermally stressful; by the upper 40s,
  // with evaporation blocked, it is doing the work of a moderate dry sauna.
  steam: { floorC: 35, refC: 48 },
  // Radiant load: a 60 °C cabin is a reference dose even though the air is
  // nowhere near it.
  infrared: { floorC: 35, refC: 60 },
};

export const HEAT_PROTOCOL_LIST = Object.keys(HEAT_PROTOCOLS) as HeatProtocol[];

/** The protocol an entry assumes when none was recorded — rows written before
 *  the field existed, and the overwhelmingly common case. */
export const HEAT_DEFAULT_PROTOCOL: HeatProtocol = "sauna";

/** Below this a room is warm, not thermally stressful — a hot shower earns
 *  nothing. The DRY-SAUNA floor; each protocol has its own (HEAT_PROTOCOLS). */
export const HEAT_FLOOR_C = HEAT_PROTOCOLS.sauna.floorC;

/** The anchor: the low end of a traditional Finnish sauna, and the temperature
 *  at which an equivalent minute IS a minute. Every other protocol's reference
 *  is the air temperature that loads an athlete the way this one does. */
export const HEAT_REF_C = HEAT_PROTOCOLS.sauna.refC;

/** Ceiling on the intensity multiplier, reached at 101 °C. It exists so a
 *  mistyped 150 cannot manufacture a dose nobody sat through. */
export const HEAT_INTENSITY_MAX = 1.6;

/**
 * Plausible typed temperatures. A value outside this is REJECTED at the API
 * rather than clamped quietly: 900 is a typo, and a typo should bounce rather
 * than silently become 120 and score as the hottest sauna in the world.
 */
export const HEAT_TEMP_BOUNDS: readonly [number, number] = [40, 120];

/** Plausible typed durations, same reasoning. */
export const HEAT_MINUTES_BOUNDS: readonly [number, number] = [1, 180];

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Air temperature → dose multiplier. Zero at and below the floor, 1.00 at the
 * reference, clamped at `HEAT_INTENSITY_MAX`.
 *
 * Linear on purpose. Thermal strain does not really rise linearly with air
 * temperature, but a piecewise-linear ramp between two STATED anchors is a
 * claim the console can render and an athlete can argue with, and an
 * exponential fitted to nothing would only be false precision wearing a
 * curve. Phase 4 replaces the whole thing with the athlete's measured delta.
 */
export function heatIntensity(tempC: number, protocol: HeatProtocol = HEAT_DEFAULT_PROTOCOL): number {
  if (!Number.isFinite(tempC)) return 0;
  const { floorC, refC } = HEAT_PROTOCOLS[protocol] ?? HEAT_PROTOCOLS[HEAT_DEFAULT_PROTOCOL];
  return clamp((tempC - floorC) / (refC - floorC), 0, HEAT_INTENSITY_MAX);
}

/* ── STORING THE PROTOCOL WITHOUT A MIGRATION ─────────────────────────────── */

/**
 * The protocol rides in `Signal.source`, which is a String already carrying
 * varied values ("apple", "whoop", "manual", …). `"manual"` on its own is a dry
 * sauna, so every row written before this existed keeps its meaning and no
 * backfill is needed.
 *
 * The provenance stays the PREFIX rather than being replaced: a steam sitting
 * is still something the athlete typed, and a reader that wants to know where a
 * row came from should not have to learn a protocol vocabulary to find out.
 */
export function heatSource(protocol: HeatProtocol, provenance = "manual"): string {
  return protocol === HEAT_DEFAULT_PROTOCOL ? provenance : `${provenance}:${protocol}`;
}

/** The protocol a `source` encodes, defaulting to dry sauna. */
export function heatProtocolOf(source: string): HeatProtocol {
  const tag = source.split(":")[1];
  return tag && tag in HEAT_PROTOCOLS ? (tag as HeatProtocol) : HEAT_DEFAULT_PROTOCOL;
}

/* ── THE DOSE MODEL ────────────────────────────────────────────────────────── */

/** Most the prior may ever be worth — one fifth of the wearable's ±15. A prior
 *  must not out-vote a measurement even when the measurement is absent. */
export const HEAT_CREDIT_MAX = 3;

/** Saturation constant, in EQUIVALENT minutes: an hour is not twice a half
 *  hour. Ten equivalent minutes earns about half the cap. */
export const HEAT_TAU_MIN = 15;

/** Last night's sauna is mostly spent by tonight. Same idiom as the fatigue
 *  engine's two-day half-life. */
export const HEAT_HALF_LIFE_H = 18;

/** Beyond this it is a habit, not a statement about today — and habits are the
 *  chronic channel (`heatWeeklyFrequency`). */
export const HEAT_WINDOW_H = 48;

/** A sitting counts toward the weekly FREQUENCY only once it clears this many
 *  equivalent minutes. Five minutes in a cool cabin is not a fourth session. */
export const HEAT_SESSION_MIN_EQUIV = 10;

/** How far back the frequency tier averages. */
export const HEAT_FREQUENCY_WEEKS = 4;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/* ── REGROUPING TWO SIGNALS BACK INTO ONE SITTING ──────────────────────────── */

/**
 * One recorded sitting, rebuilt from the rows it was written as.
 *
 * A Signal carries exactly one number and a sitting is two, so a save writes
 * `sauna` (minutes) and `saunaTemp` (°C) at an IDENTICAL timestamp. That is not
 * a new pattern: `derivedFoodEntries` already reassembles the up-to-eight rows
 * one logged food writes by grouping on (exact ts, source), with a composite id
 * so deleting the entry removes every row it wrote. This is the same idiom with
 * two rows instead of eight.
 */
export interface HeatSitting {
  /** ISO of the sitting — the exact instant both rows share. */
  ts: string;
  minutes: number;
  tempC: number;
  /** Which kind of heat — it decides how the temperature is read. */
  protocol: HeatProtocol;
  /**
   * True when no `saunaTemp` row existed and the reference was assumed.
   *
   * An entry written before the field existed, or one where the athlete
   * genuinely did not know, still counts — at `HEAT_REF_C` — but it is MARKED
   * rather than silently presented as a measurement. Same distinction
   * `BiometricMetric.measured` draws, and for the same reason: a stated
   * assumption can be argued with, an invisible one cannot.
   */
  assumedTemp: boolean;
  /** minutes × heatIntensity(tempC). */
  equivMin: number;
  /** The Signal ids this sitting owns, so a delete can remove both. */
  ids: string[];
}

const iso = (ts: string | Date): string => (typeof ts === "string" ? ts : ts.toISOString());

/**
 * Group `sauna` / `saunaTemp` Signals into sittings, newest first.
 *
 * A `saunaTemp` with no `sauna` beside it is DROPPED, not treated as a
 * zero-minute sitting: a temperature on its own records nothing that happened.
 */
export function heatSittings(signals: HeatSignalRow[]): HeatSitting[] {
  type Group = { ts: string; minutes: number; tempC: number | null; protocol: HeatProtocol; ids: string[] };
  const groups = new Map<string, Group>();
  for (const s of signals) {
    if (s.kind !== "sauna" && s.kind !== "saunaTemp") continue;
    if (!Number.isFinite(s.value)) continue;
    const ts = iso(s.ts);
    if (!Number.isFinite(Date.parse(ts))) continue;
    const key = `${ts}|${s.source}`;
    let g = groups.get(key);
    if (!g) { g = { ts, minutes: 0, tempC: null, protocol: heatProtocolOf(s.source), ids: [] }; groups.set(key, g); }
    if (s.id) g.ids.push(s.id);
    if (s.kind === "sauna") g.minutes += s.value;
    // Two temperature rows at one instant is not a thing a save can produce;
    // if it somehow happens, the last one wins rather than being summed into a
    // temperature nobody sat in.
    else g.tempC = s.value;
  }
  const out: HeatSitting[] = [];
  for (const g of groups.values()) {
    if (g.minutes <= 0) continue;
    const assumedTemp = g.tempC == null;
    // A sitting with no temperature is read at ITS OWN protocol's reference —
    // assuming 80 °C for a steam room would be assuming a room nobody has.
    const tempC = g.tempC ?? HEAT_PROTOCOLS[g.protocol].refC;
    out.push({
      ts: g.ts,
      minutes: g.minutes,
      tempC,
      protocol: g.protocol,
      assumedTemp,
      equivMin: g.minutes * heatIntensity(tempC, g.protocol),
      ids: g.ids.slice().sort(),
    });
  }
  return out.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}

/* ── WHAT IS ALREADY ON THE RECORD ─────────────────────────────────────────── */

/**
 * NOTHING IS LOGGED IN THE ORDER IT HAPPENED, so a log surface has to be able
 * to ask what is already there.
 *
 * A sitting is typed AT the sitting — you come out of the sauna, you log it.
 * The session beside it arrives whenever the watch next syncs, which can be
 * eight hours later: train at 13:00, sauna at 14:00 and log it on the spot,
 * import the workout at 21:00. The app meets the two events in the opposite
 * order to the one they happened in, and it must not care.
 *
 * The ENGINES already don't. Every figure in this module reads event time
 * (`Signal.ts`, `Session.completedAt`) and never write time, so the model comes
 * out identical whichever row landed first. The ENTRY POINTS did care, and in
 * the worst possible way: the summary of a just-imported session offered
 * "finish in the sauna?" as though the evening's sauna had never been logged,
 * and the sheet behind it — pre-filled with the session's own end — would write
 * a SECOND sitting an hour off the first. `heatAdjustment` then sums both
 * inside the same 48 h window and `heatWeeklyFrequency` counts two sittings
 * where the athlete had one. An out-of-order import is exactly the case that
 * produces that duplicate, because it is the case where the invitation to log
 * arrives hours after the thing was logged.
 *
 * So both surfaces ask ONE primitive rather than each inventing a window.
 */

/**
 * Sittings recorded between two instants, newest first.
 *
 * Half-open at the bottom and closed at the top ([from, to]) so a caller
 * centring a window on an instant gets that instant's own sitting back.
 */
export function heatSittingsBetween(signals: HeatSignalRow[], from: number, to: number): HeatSitting[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  return heatSittings(signals).filter((s) => {
    const t = Date.parse(s.ts);
    return t >= from && t <= to;
  });
}

/**
 * How close two sittings have to be before they are one sauna logged twice.
 *
 * Ninety minutes, and the number is set by the FAILURE it prevents rather than
 * by physiology. Nobody sits twice inside an hour and a half and means it as
 * two entries; an athlete who genuinely does a second round has the picker to
 * say so. The cost of the two mistakes is not symmetric — a false "already
 * logged" costs one extra tap on a warning the athlete can overrule, while a
 * missed duplicate silently doubles the dose in the readiness ring and adds a
 * phantom sitting to the frequency tier that feeds MRV, with nothing on any
 * screen saying it happened.
 */
export const HEAT_DUPLICATE_MIN = 90;

/**
 * A sitting already on the record close enough to `at` that saving another
 * would be double-counting one sauna — the NEAREST such sitting, so a warning
 * can quote the one the athlete actually means.
 */
export function heatAlreadyLogged(
  signals: HeatSignalRow[],
  at: number,
  withinMin: number = HEAT_DUPLICATE_MIN,
): HeatSitting | null {
  if (!Number.isFinite(at)) return null;
  const w = withinMin * 60_000;
  const near = heatSittingsBetween(signals, at - w, at + w);
  if (near.length === 0) return null;
  return near.reduce((best, s) =>
    Math.abs(Date.parse(s.ts) - at) < Math.abs(Date.parse(best.ts) - at) ? s : best,
  );
}

/**
 * How long after a session ends a sitting still reads as "the sauna after that
 * session". Three hours, matching READ_BOUNDS.immediate — past that the session
 * has settled and the sitting is its own event rather than the tail of a
 * workout.
 */
export const HEAT_AFTER_SESSION_H = 3;

/**
 * …and how far BEFORE the recorded end a sitting still belongs to it.
 *
 * Not slack for its own sake. The sitting's instant is TYPED and the session's
 * end is MEASURED by a watch, and the two clocks are never reconciled: an
 * athlete who logs the sauna while cooling down, against a recording whose end
 * is whenever they remembered to stop the watch, produces a sitting stamped
 * minutes BEFORE the session it plainly followed. And a sitting is a span, not
 * an instant — a 20-minute sitting stamped at its start overlaps an end four
 * minutes later. Half an hour covers both and stays far inside MIN_PAIR_GAP_H,
 * so nothing here can reach into a neighbouring pair.
 */
export const HEAT_EDGE_GRACE_MIN = 30;

/**
 * The sitting this session already has recorded against it, if any — the one
 * NEAREST the session's end, so the post-session prompt names the sauna the
 * athlete took rather than one from later that evening.
 */
export function heatAfterSession(signals: HeatSignalRow[], sessionEnd: string | number | null | undefined): HeatSitting | null {
  const end = typeof sessionEnd === "number" ? sessionEnd : sessionEnd ? Date.parse(sessionEnd) : NaN;
  if (!Number.isFinite(end)) return null;
  const found = heatSittingsBetween(signals, end - HEAT_EDGE_GRACE_MIN * 60_000, end + HEAT_AFTER_SESSION_H * HOUR_MS);
  if (found.length === 0) return null;
  return found.reduce((best, s) =>
    Math.abs(Date.parse(s.ts) - end) < Math.abs(Date.parse(best.ts) - end) ? s : best,
  );
}

/* ── THE ACUTE CREDIT ──────────────────────────────────────────────────────── */

/** What the readiness term is worth today, and every figure behind it — so the
 *  Engine Room can print the substituted arithmetic rather than a total. */
export interface HeatAdjustment {
  /** 0..HEAT_CREDIT_MAX. Never negative — see the module header. */
  points: number;
  /** Equivalent minutes inside the window. */
  equivMin: number;
  /** Raw typed minutes inside the window, for the copy that quotes them back. */
  minutes: number;
  /** The saturating dose before decay. */
  dose: number;
  /** The decay factor applied to it. */
  decay: number;
  /** Hours since the most recent sitting, or null when there is none. */
  hoursSince: number | null;
  /** Sittings inside the window, newest first. */
  sittings: HeatSitting[];
  /**
   * True when a fresh wearable reading zeroed the credit. The card must SAY
   * this — a silently zeroed term is indistinguishable from a term that was
   * never computed, and the rule is the whole design.
   */
  suppressed: boolean;
  /** True when any contributing sitting had its temperature assumed. */
  assumed: boolean;
}

const EMPTY: HeatAdjustment = {
  points: 0, equivMin: 0, minutes: 0, dose: 0, decay: 0,
  hoursSince: null, sittings: [], suppressed: false, assumed: false,
};

/**
 * Today's heat credit.
 *
 * Pass `bio` — the SAME `Biometrics | undefined` readiness itself receives, so
 * the suppression rule can never disagree with the wearable term it defers to.
 */
export function heatAdjustment(
  signals: HeatSignalRow[],
  opts: { now?: number; bio?: Biometrics } = {},
): HeatAdjustment {
  const now = opts.now ?? Date.now();
  const sittings = heatSittings(signals).filter((s) => {
    const t = Date.parse(s.ts);
    return t <= now && now - t <= HEAT_WINDOW_H * HOUR_MS;
  });
  if (sittings.length === 0) return { ...EMPTY, suppressed: false };

  const equivMin = sittings.reduce((a, s) => a + s.equivMin, 0);
  const minutes = sittings.reduce((a, s) => a + s.minutes, 0);
  const hoursSince = (now - Date.parse(sittings[0]!.ts)) / HOUR_MS;

  const dose = HEAT_CREDIT_MAX * (1 - Math.exp(-equivMin / HEAT_TAU_MIN));
  const decay = Math.pow(0.5, hoursSince / HEAT_HALF_LIFE_H);
  const suppressed = !!opts.bio;

  return {
    points: suppressed ? 0 : Math.round(dose * decay),
    equivMin,
    minutes,
    dose,
    decay,
    hoursSince,
    sittings,
    suppressed,
    assumed: sittings.some((s) => s.assumedTemp),
  };
}

/* ── THE CHRONIC CHANNEL ───────────────────────────────────────────────────── */

/**
 * Sittings per week, averaged over `HEAT_FREQUENCY_WEEKS`.
 *
 * Counted in SITTINGS rather than equivalent minutes because sessions-per-week
 * is what the cohort evidence is actually expressed in — but a sitting only
 * counts once it clears `HEAT_SESSION_MIN_EQUIV`, so a token five minutes in a
 * cool cabin cannot inflate a frequency tier.
 *
 * Feeds `AthleteVolumeProfile.heat`. DERIVED, never asked: the athlete has
 * already told us by logging, and a profile question would be a worse copy of
 * an answer we hold.
 */
export function heatWeeklyFrequency(signals: HeatSignalRow[], now: number = Date.now()): number {
  const since = now - HEAT_FREQUENCY_WEEKS * 7 * DAY_MS;
  const n = heatSittings(signals).filter((s) => {
    const t = Date.parse(s.ts);
    return t > since && t <= now && s.equivMin >= HEAT_SESSION_MIN_EQUIV;
  }).length;
  return n / HEAT_FREQUENCY_WEEKS;
}

/* ── THE DAY'S LOG, IN THE ORDER IT HAPPENED ───────────────────────────────── */

/**
 * ALL A DAY'S LOG NEEDS FROM A SESSION — stated as a type rather than left
 * implicit, and kept structural so this module still imports nothing from the
 * session engine. Anything with an id and a clock qualifies.
 */
export interface HeatDaySession {
  id: string;
  startedAt: string;
  completedAt?: string | null;
}

/**
 * One line of the day's log: a session, or a sitting.
 *
 * `under` is the whole point of the type. A sitting that followed a session
 * carries that session's id and belongs directly BENEATH it — subordinate, not
 * a second workout; a standalone sitting carries null and stands on its own at
 * its place in the day.
 */
export type HeatDayRow<S extends HeatDaySession> =
  | { kind: "session"; session: S }
  | { kind: "heat"; sitting: HeatSitting; under: string | null };

/**
 * THE DAY'S LOG WITH THE SAUNA IN IT — sessions and sittings as ONE ordered
 * list, each sitting placed against the session it actually followed.
 *
 * WHY THIS EXISTS. A sitting was readable in exactly two places: the week's
 * count on Today's Heat row, and the sheet's Recent list. Neither says WHEN in
 * the day it happened, so an athlete who lifted, sat in the sauna, and then
 * swam could not see the shape of their own afternoon anywhere in the app —
 * the done floor listed two workouts and the sauna between them was invisible.
 * The record already knows the answer (`heatAfterSession` has been asking it
 * for the post-session prompt since the out-of-order pass); this hands the same
 * answer to a LIST rather than to one session.
 *
 * A SITTING IS NOT A SESSION, and the shape of the return says so. It is not
 * merged into the session list and it never becomes a row of the same rank: it
 * is attached, so the surface can render it as an accent under its parent.
 *
 * THE ATTACHMENT WINDOW IS THE ONE ALREADY IN USE — `HEAT_EDGE_GRACE_MIN`
 * before the recorded end (clamped to the session's own start, so a 15-minute
 * run cannot claim the sauna taken BEFORE it) through `HEAT_AFTER_SESSION_H`
 * after it. Written once, in `heatAfterSession`; a second window invented here
 * would put the post-session prompt and the day's list in the position of
 * disagreeing about which workout a sauna followed.
 *
 * A sitting can only hang off ONE session — the one whose end it is NEAREST,
 * the same tie-break the prompt uses — so a sauna between two workouts is never
 * printed twice. A session can hold SEVERAL: two rounds ninety minutes apart
 * are two sittings, and both belong to the workout they followed.
 *
 * ORDER. `sessions` is consumed in the order given, and the anchors are sorted
 * by event time in `order` — "desc" (newest first) by default, because that is
 * what `sessionsOnDay` returns and what the done floor renders. An UNATTACHED
 * sitting sorts among the sessions by its own instant, so a morning sauna on a
 * rest afternoon lands where it happened rather than at the end of the list.
 *
 * Only sittings on the VIEWED calendar day are placed, matching how the day's
 * sessions are selected. A sauna taken at 00:30 after a 23:00 session is its
 * own day's first event — a row that appeared on both days would be one sitting
 * counted twice by eye.
 */
export function heatDayRows<S extends HeatDaySession>(
  sessions: S[],
  signals: HeatSignalRow[],
  opts: { day?: number; order?: "desc" | "asc" } = {},
): HeatDayRow<S>[] {
  const day = opts.day ?? Date.now();
  const dir = opts.order === "asc" ? 1 : -1;
  if (!Number.isFinite(day)) return sessions.map((session) => ({ kind: "session", session }));

  const key = new Date(day).toDateString();
  const sittings = heatSittings(signals).filter((s) => new Date(s.ts).toDateString() === key);
  if (sittings.length === 0) return sessions.map((session) => ({ kind: "session", session }));

  // Each session's attachment window, computed once.
  const windows = sessions.map((s) => {
    const start = Date.parse(s.startedAt ?? "");
    const end = Date.parse(s.completedAt ?? s.startedAt ?? "");
    if (!Number.isFinite(end)) return null;
    const grace = end - HEAT_EDGE_GRACE_MIN * 60_000;
    return { id: s.id, end, from: Number.isFinite(start) ? Math.max(grace, start) : grace, to: end + HEAT_AFTER_SESSION_H * HOUR_MS };
  });

  const attached = new Map<string, HeatSitting[]>();
  const loose: HeatSitting[] = [];
  for (const sitting of sittings) {
    const t = Date.parse(sitting.ts);
    let best: { id: string; end: number } | null = null;
    for (const w of windows) {
      if (!w || t < w.from || t > w.to) continue;
      if (!best || Math.abs(t - w.end) < Math.abs(t - best.end)) best = w;
    }
    if (!best) { loose.push(sitting); continue; }
    const list = attached.get(best.id);
    if (list) list.push(sitting); else attached.set(best.id, [sitting]);
  }

  // Anchors — sessions and standalone sittings — placed on one clock, then each
  // session expanded into itself plus whatever it carries.
  type Anchor = { at: number; i: number; row: HeatDayRow<S> };
  const anchors: Anchor[] = [];
  sessions.forEach((session, i) => anchors.push({ at: Date.parse(session.startedAt ?? "") || 0, i, row: { kind: "session", session } }));
  loose.forEach((sitting, j) => anchors.push({ at: Date.parse(sitting.ts), i: sessions.length + j, row: { kind: "heat", sitting, under: null } }));
  anchors.sort((a, b) => (a.at === b.at ? a.i - b.i : (a.at - b.at) * dir));

  const out: HeatDayRow<S>[] = [];
  for (const a of anchors) {
    out.push(a.row);
    if (a.row.kind !== "session") continue;
    const mine = attached.get(a.row.session.id);
    if (!mine) continue;
    for (const sitting of mine.slice().sort((x, y) => (Date.parse(x.ts) - Date.parse(y.ts)) * dir)) {
      out.push({ kind: "heat", sitting, under: a.row.session.id });
    }
  }
  return out;
}
