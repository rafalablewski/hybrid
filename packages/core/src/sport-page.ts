// ─────────────────────────────────────────────────────────────────────────────
// THE SPORT PAGE — one page model for every sport in the catalog.
//
// WHY THIS FILE EXISTS
// The catalog holds 65 sports and none of them had a destination: the Sport
// screen was a chip picker with ONE shared body, so a sport was a filter rather
// than a place. Giving each sport a page could have meant 65 layouts, or one
// layout padded with metrics most sports do not have. It is neither. It is ONE
// model that CONFIGURES ITSELF from the sport's own catalog record:
//
//   metrics includes "distance" → the distance cell, the volume bars and the
//                                 distance bests exist; otherwise they do not.
//   metrics includes "pace"     → the pace trend and the effort split exist.
//   `sc` block present          → the transfer section exists (7 of the 65).
//
// A section is never rendered empty and never filled with an invented metric —
// the same discipline other-sports.ts holds ("inventing a pace for a squash
// match to fill a rail would be fabricating a metric the sport does not have").
//
// NO NEW AGGREGATES. Everything numeric here comes from the engines that
// already answer these questions for the Endurance hub — runTotals,
// weeklyMileage, paceEffortSplit, prescribeForSport — so a figure on the sport
// page and the same figure on Today can never disagree about what a week is,
// what an effort is, or what "hard" means. The only scan of its own is the
// per-effort one (fastest / longest / most recent), which reads the very same
// narrowed slice.
//
// DEVICE TRUTH. The slice is projected through deviceTrueSessions() BEFORE any
// aggregate runs, so every figure on the page — totals, weeks, pace, bests,
// recent efforts — is the watch's read wherever a watch recorded it, and pace
// is derived from `cardioSeconds` (second-accurate) rather than from display
// minutes.
//
// Pure and client-agnostic: apps/mobile/components/aurora/sport-page.tsx
// renders this model and decides nothing of its own. (The web twin named here
// went with the user-facing web client — the mobile page is the live one.)
// ─────────────────────────────────────────────────────────────────────────────

import type { ChartReading } from "./chart-scrub";
import { deviceTrueSessions } from "./device-truth";
import { roundKm } from "./distance";
import { durationParts, formatDuration } from "./duration";
import {
  cardioSeconds,
  cardioDiscipline,
  type CardioBlock,
  type CardioDiscipline,
  type LoggedSession,
  type SessionBlock,
} from "./engines/session";
import {
  paceEffortSplit,
  runTotals,
  weeklyMileage,
  type EffortSplit,
  type WeekMileage,
} from "./engines/running";
import { clock, mmss } from "./format";
import { OLYMPIC_SPORTS, type OlympicSport, type PoolExercise } from "./olympic-sports";
import { LEVELS, prescribeForSport, type SportPrescription } from "./sports";

/** Weeks of history the volume bars + pace trend cover. The Endurance hub's
 *  window, so the two read the same eight buckets. */
export const SPORT_PAGE_WEEKS = 8;

/** Recent efforts listed before the page defers to History. */
export const SPORT_PAGE_RECENT = 3;

/* ── 1. THE MARKER — the athlete's typed performance figure ──────────────── */

/**
 * One entry in a sport's marker history. The marker itself (a 5 km time, a
 * 100 m time, an FTP) is TYPED — the app does not derive it — so a delta can
 * only be honest if the previous typings were kept. Clients persist this list
 * (web localStorage, mobile AsyncStorage) and hand it back; with fewer than two
 * entries the page shows the figure and no trend, rather than a made-up one.
 */
export interface SportMarkerEntry {
  value: string;
  /** ISO of when it was entered. */
  at: string;
}

/**
 * A marker parsed to a comparable number: "24:30" → 1470 (seconds), "240" →
 * 240 (watts). Returns null for anything else, which is the signal to show the
 * string as typed and skip the trend.
 */
export function markerNumber(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  if (v.includes(":")) {
    const parts = v.split(":").map((p) => Number(p.trim()));
    if (parts.some((n) => !Number.isFinite(n))) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Which direction is an improvement. A CLOCK marker (mm:ss) improves downward;
 * a bare number (watts, kg, reps) improves upward. Reading it off the format
 * the athlete typed keeps the catalog free of a per-marker polarity flag that
 * would be one more thing to get wrong when a sport is added.
 */
export function markerBetter(value: string): "lower" | "higher" {
  return value.includes(":") ? "lower" : "higher";
}

/* ── 2. THE MODEL ────────────────────────────────────────────────────────── */

/** The ONE figure at the top of the page, and where it came from. */
export interface SportPrimary {
  /**
   * `marker`   — the sport's own catalog marker, as the athlete typed it.
   * `pace`     — their best pace, when the sport is paced but has no marker yet.
   * `distance` — total distance, when the sport measures distance but not pace.
   * `time`     — total time, the truth every sport has.
   */
  kind: "marker" | "pace" | "distance" | "time";
  /** Formatted for display, already in the sport's own unit. */
  value: string;
  /** Trailing unit ("km", "m", "/100m"), or null when the value carries none —
   *  a duration always does, so `time` never sets one. */
  unit: string | null;
  /** The marker's own label from the catalog — `marker` kind only. */
  label: string | null;
  /** Signed change since the oldest kept marker, formatted ("−1:12", "+12 W"). */
  delta: string | null;
  /** Whether that change is an improvement. Null when there is no change to show. */
  improving: boolean | null;
  /** Marker history as comparable numbers, oldest → newest. Empty below two points. */
  trend: number[];
  /** When the marker was last typed, ISO. */
  at: string | null;
}

/** A week bucket, in the sport's own measure. */
export interface SportWeek {
  /** ISO start of the 7-day bucket. */
  weekStart: string;
  /** Distance in the sport's display unit for a measured sport, else minutes. */
  value: number;
  efforts: number;
}

/** A single logged effort — a row, a best, or the tap target back to History. */
export interface SportEffort {
  name: string;
  startedAt: string;
  sessionId: string;
  distanceKm: number;
  minutes: number;
  /** Canonical seconds per km, or null when the effort was not paced. */
  secPerKm: number | null;
  /** The effort's exact duration in SECONDS — the device's own clock where one
   *  recorded it. A record is a finishing time, so it reads this rather than
   *  `minutes`: rounding a 22:41 to 23 min would lose the record by 19s. */
  seconds: number | null;
  /** The connector that recorded it ("apple"), or null when it was typed. */
  provider: string | null;
}

/** An all-time best. `effort`-backed bests carry the session they came from. */
export interface SportBest {
  id: "longest" | "longestSession" | "biggestWeek";
  value: string;
  unit: string | null;
  /** ISO — the effort's date, or the week's start for `biggestWeek`. */
  at: string;
  sessionId: string | null;
  /** The recording's connector, when a device measured this best. */
  provider: string | null;
}

/* ── 2b. THE RECORD LADDER — a time at a distance ────────────────────────── */

/**
 * How far PAST a rung an effort may run and still count for it.
 *
 * The asymmetry is the whole rule, and it is deliberate. An effort counts when
 * it covered AT LEAST the rung and no more than 5% over:
 *
 *   5.2 km counts as a 5 km, because the extra 200 m can only make the time
 *   WORSE — the figure understates the athlete, never the reverse.
 *   4.9 km never counts, because calling it a 5 km would flatter them.
 *
 * So a rung is a FLOOR: never better than the truth, occasionally a little
 * worse. That is the right direction for a number somebody might quote out
 * loud, and it is why the band has no lower half.
 *
 * WHERE THE BAND DOES NOT APPLY — and this is the part to get right now that
 * there are two kinds of candidate. The band exists because a LOGGED effort
 * lands on a ragged distance: nobody runs exactly 5.000 km, so 5.2 has to be
 * allowed to stand for 5. A `best` lap has no such problem — it is the fastest
 * window covering EXACTLY the rung, measured off the recording's distance
 * series (session-streams.ts `bestEffortsFromDistance`). Applying a 5% band to a
 * figure that is already exact would let a 5.25 km window fill the 5 km rung
 * and understate the athlete for no reason. So: efforts match on the band,
 * segments match on equality. See `sportRecords`.
 */
export const RECORD_BAND = 1.05;

/**
 * A BEST EFFORT taken from inside a recording — the fastest window covering
 * exactly one catalog distance, as `SessionLap` stores it (kind `best`).
 *
 * This is what closes the ladder's old hole: an 8 km run contains a 5 km, and
 * until the distance series was imported there was no way to say what it was
 * run in. The window is found and stored on upload; the ladder just reads it.
 *
 * Deliberately minimal — no date, no provider. Both come from the SESSION, and
 * core resolves them from the slice it already holds rather than trusting a
 * caller to pair them up correctly (see `sportPageModel`).
 */
export interface SportSegmentBest {
  /** The session the window was found in — how it is dated and attributed. */
  sessionId: string;
  /** The rung it covers, km. Exact by construction. */
  distanceKm: number;
  /** The window's time, seconds. */
  seconds: number;
}

/** One rung of a sport's record ladder, filled or waiting. */
export interface SportRecord {
  /** The rung, in km — the catalog's own figure, and the stable key. */
  km: number;
  /** The rung as a FIGURE in the sport's display unit ("5", "100"), or null
   *  when the distance goes by a name instead. */
  value: string | null;
  /** The display unit for `value`; null alongside a named rung. */
  unit: "km" | "m" | null;
  /** The name a distance goes by, when it has one. Clients localize it — the
   *  model states which distance it is, never what to call it in English. */
  name: "half" | "marathon" | null;
  /** The finishing time ("22:41", "1:52:10"), or null while the rung is unset. */
  time: string | null;
  /** What that time paces at, in the sport's own split. Null when unset, and
   *  null on a TYPED rung — a typed 5 km time has no measured distance behind
   *  it, so deriving a pace from it would be arithmetic on a claim. */
  pace: string | null;
  /** When it was set, ISO. */
  at: string | null;
  sessionId: string | null;
  /** The connector that recorded it; null when typed or unset. */
  provider: string | null;
  /** True when the figure is the athlete's typed marker, not a logged effort. */
  typed: boolean;
  /**
   * True when the time was measured over EXACTLY this distance inside a
   * recording, rather than being the clock of a whole logged effort.
   *
   * Not a disclaimer — the opposite. A segment figure is the more precise of
   * the two: it covers the rung exactly, where a logged effort covers it plus
   * whatever ragged remainder the athlete actually ran. Clients mark it so an
   * athlete can tell a rung taken from a race apart from one found inside a
   * long run, which is a real distinction to them even though both are true.
   */
  segment: boolean;
  /** Improvement over the previous best at THIS rung ("−1:12"), or null when
   *  it is the first one set. */
  delta: string | null;
  /** True for the ONE rung the page states large — see `primary` on the model,
   *  which carries the same figure. A client renders the big figure from
   *  `primary` and skips this rung in the ladder, so it can never print twice. */
  promoted: boolean;
}

/** A pool exercise plus whether the chosen level has reached it. */
export interface SportPoolEntry extends PoolExercise {
  locked: boolean;
  /** The level that unlocks it — only meaningful while `locked`. */
  unlocksAt: string;
}

export interface SportPageModel {
  name: string;
  /** NO `icon`. The page knows the sport's NAME, and a sport's drawing is
   *  resolved from that by `sportMark()` — see OlympicSport. A stored glyph
   *  beside a resolver is a second answer waiting to disagree with the first,
   *  and the stored one here was an emoji. */
  category: string;
  /** The S&C family ("Endurance", "Combat", …), or null for a sport with no pool. */
  family: string | null;
  /**
   * WHICH CHANNEL THIS SPORT IS ON — the catalog's own answer, so a client
   * never re-derives it from the name.
   *
   * The app already codes activity two ways, and both surfaces that push into
   * this page have picked a side: the Endurance lanes draw running/cycling/
   * swimming/rowing/skiing in TEAL (the conditioning channel), and the Today
   * "Other sports" tiles draw the `"sport"` bucket — racket, team, combat — in
   * SAND, because "teal already means cardio on the lanes directly above this
   * block". A page reached from either one has to arrive in the colour it was
   * tapped in, which it cannot do off `category` alone ("Athletics" holds both
   * a marathon and a shot put).
   */
  discipline: CardioDiscipline;
  hasDistance: boolean;
  hasPace: boolean;
  /** The sport's display distance unit — storage is always km. */
  distanceUnit: "km" | "m";
  /** The pace split this sport reads in, in metres (1000, 100, 500). */
  pacePer: number;
  /** How that split is named ("/km", "/100m", "/500m"). */
  paceUnit: string;
  /** True when nothing has ever been logged for this sport. */
  empty: boolean;
  /** The FACTS the hero's meta line states. Clients localize each one and join
   *  them with heroMetaLine() — the model never bakes English into a hero. */
  meta: { efforts: number; sessions: number; distance: string | null; distanceUnit: "km" | "m"; firstAt: string | null };
  primary: SportPrimary;
  /** The catalog's marker prompt, when the sport has one and it is unfilled. */
  markerPrompt: { label: string; ph: string } | null;
  weeks: SportWeek[];
  /** Mean of `weeks`, in the same measure. */
  weekAvg: number;
  /** Null unless the sport is paced AND something paced is logged.
   *  `weekStarts` is aligned with `trend` — the trend SKIPS the weeks with
   *  nothing paced in them, so a held point can only name its own week if the
   *  model says which week each point came from. */
  pace: { avgSecPerKm: number; bestSecPerKm: number; trend: number[]; weekStarts: string[]; prIndex: number } | null;
  /** Null unless the sport is paced and the split has minutes in it. */
  split: EffortSplit | null;
  /**
   * THE RECORD LADDER, ascending — empty for a sport the catalog gives no
   * benchmark distances.
   *
   * WHICH FIGURE A CLIENT STATES LARGE, in one rule: the rung flagged
   * `promoted` when there is one, else `primary`. A ladder is a stronger
   * headline than anything `primary` can offer — "22:41 for 5 km" against "best
   * pace 4:32 /km" — so `primary` is the fallback for the sports that have no
   * ladder, or have one with nothing on it yet.
   */
  records: SportRecord[];
  /** True when the athlete HAS typed a marker and no rung is carrying it — an
   *  FTP in watts, or a figure the ladder could not read as a time. The client
   *  gives it its own line; false means a rung already states it. */
  markerAside: boolean;
  bests: SportBest[];
  /** Null for the 58 sports with no `sc` block — there is no strength to prescribe. */
  transfer: SportPrescription | null;
  pool: SportPoolEntry[];
  recent: SportEffort[];
}

/* ── 3. THE SLICE — this sport's sessions, device-true ───────────────────── */

const isCardio = (b: { kind: string }): b is CardioBlock => b.kind === "cardio";

/** The discipline tag a block carries, or the one its name implies. */
const blockDiscipline = (b: CardioBlock): CardioDiscipline => b.discipline ?? cardioDiscipline(b.name);

/**
 * The sessions narrowed to THIS SPORT's cardio, device-true.
 *
 * Two matching rules, because the catalog holds two kinds of sport:
 *  • an ENDURANCE sport (running, swimming, cycling, rowing, …) owns a
 *    discipline tag, and every move under it counts — a "Long run", a
 *    "Threshold" and a "Parkrun" are all Running. Matching on the tag is what
 *    the Endurance hub already does.
 *  • a TIMED sport (tennis, football, boxing, …) shares ONE tag ("sport") with
 *    every other one, so the tag cannot separate them. The block's NAME is the
 *    key, exactly as the Today block groups them.
 *
 * Blocks that do not match are dropped from the session rather than the session
 * being dropped whole, so a swim logged in the same session as a run counts
 * once, under the right sport.
 */
export function sportSessions(sessions: LoggedSession[], sportName: string): LoggedSession[] {
  const discipline = cardioDiscipline(sportName);
  const byName = discipline === "sport" || discipline === "other";
  const key = sportName.trim().toLowerCase();
  const keep = (b: CardioBlock): boolean =>
    byName ? b.name.trim().toLowerCase() === key : blockDiscipline(b) === discipline;

  const out: LoggedSession[] = [];
  for (const s of deviceTrueSessions(sessions)) {
    const blocks = s.blocks.filter((b) => !isCardio(b) || keep(b));
    if (!blocks.some((b) => isCardio(b))) continue;
    out.push(blocks.length === s.blocks.length ? s : { ...s, blocks });
  }
  return out;
}

/** Every matching effort, newest first — the source for recent + the bests. */
function efforts(slice: LoggedSession[]): SportEffort[] {
  const out: SportEffort[] = [];
  for (const s of slice) {
    const provider = s.device?.provider ?? null;
    for (const b of s.blocks) {
      if (!isCardio(b)) continue;
      const distanceKm = b.distance && b.distance > 0 ? b.distance : 0;
      const sec = cardioSeconds(b);
      out.push({
        name: b.name,
        startedAt: s.startedAt,
        sessionId: s.id,
        distanceKm,
        minutes: b.minutes && b.minutes > 0 ? Math.round(b.minutes) : 0,
        // Derived from the device's exact seconds where there is a recording —
        // a pace computed off rounded minutes contradicts the panel beside it.
        secPerKm: distanceKm > 0 && sec != null && sec > 0 ? Math.round(sec / distanceKm) : null,
        seconds: sec != null && sec > 0 ? sec : b.minutes && b.minutes > 0 ? Math.round(b.minutes * 60) : null,
        provider,
      });
    }
  }
  return out.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

/* ── 4. FORMATTING, IN THE SPORT'S OWN UNIT ──────────────────────────────── */

/** Group a figure with thin spaces — "74 200". Locale-free on purpose: a
 *  thousands separator that changes with the device locale would make the same
 *  swim read differently on two phones in the same household. */
function grouped(n: number): string {
  const s = String(Math.round(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** The distance FIGURE alone, in the sport's natural unit (storage is km). */
export function sportDistance(km: number, unit: "km" | "m"): string {
  if (unit === "m") return grouped(km * 1000);
  return km >= 100 ? String(Math.round(km)) : String(roundKm(km));
}

/** The pace split a sport reads in, in metres — 1000 (/km), 100 (/100m). */
export function sportPacePer(sport: OlympicSport | undefined): number {
  return sport?.pacePer ?? 1000;
}

/** How that split is named. */
export function sportPaceUnit(pacePer: number): string {
  return pacePer === 1000 ? "/km" : `/${pacePer}m`;
}

/** Seconds-per-km rendered at the sport's own split — 1:52 /100m, not 18:40 /km. */
export function sportPace(secPerKm: number, pacePer: number): string {
  return mmss(Math.round((secPerKm * pacePer) / 1000));
}

/** "31h 40min" — the exact figure, for the one place that shows total time big.
 *  The split itself is the shared one, so a sport's hero figure and a sport
 *  tile on Today can't round the same minutes two different ways. */
export const sportDuration = durationParts;

/** A signed marker delta, formatted the way the marker itself is written. */
function markerDelta(from: string, to: string): { delta: string; improving: boolean } | null {
  const a = markerNumber(from);
  const b = markerNumber(to);
  if (a == null || b == null || a === b) return null;
  const diff = b - a;
  const better = markerBetter(to);
  const improving = better === "lower" ? diff < 0 : diff > 0;
  const sign = diff < 0 ? "−" : "+";
  const body = to.includes(":") ? mmss(Math.abs(diff)) : String(Math.round(Math.abs(diff) * 100) / 100);
  return { delta: `${sign}${body}`, improving };
}

/**
 * THE RECORD LADDER for one sport — the athlete's best time at each distance
 * the catalog says this sport is measured at.
 *
 * `all` is the sport's efforts NEWEST-FIRST (as `efforts()` returns them),
 * already device-true. `markers` is the typed marker history, oldest → newest.
 * `segments` are the athlete's stored `best` laps for THIS sport's sessions —
 * the fastest window covering each rung, found inside a recording.
 *
 * Four things this does, in order of how easy they are to get wrong:
 *
 *  1. MATCHES TWO WAYS, because there are two kinds of candidate. A logged
 *     EFFORT matches on `RECORD_BAND` — at least the rung, at most 5% over,
 *     because nobody runs exactly 5.000 km. A SEGMENT matches on equality: it
 *     is already the exact rung, and banding an exact figure would let a
 *     5.25 km window stand for a 5 km and understate the athlete for nothing.
 *  2. Walks CHRONOLOGICALLY so "the previous best" means the best that stood
 *     before this one beat it. A delta computed against the second-fastest-ever
 *     would say the same thing on a rung you improved in one jump as on a rung
 *     you have been chipping at for a year.
 *  3. Prefers the SEGMENT when one session offers both. A 5.02 km parkrun with
 *     a route produces an effort candidate AND a segment candidate, and they
 *     are the same run measured twice — keeping both would make the ladder show
 *     the athlete beating themselves by four seconds on a run they did once.
 *     The segment wins because it covers the rung exactly.
 *  4. Lets the TYPED marker fill its own rung, and only its own — a runner who
 *     knows their parkrun time should see it — but only when it beats what was
 *     measured, and never without saying it was typed. Beat it with a logged
 *     effort and the rung flips to the measurement on its own.
 */
/**
 * How near a stored `best` lap must be to a rung to BE that rung, km.
 *
 * Half a metre — a float-comparison tolerance, not a band. A segment is derived
 * at the catalog's own figure (session-streams.ts `lapDerivationFor` reads the
 * same `OlympicSport.records`), so the two numbers are the same number and this
 * only absorbs the round trip through storage. Anything looser would quietly
 * become a second, undocumented band.
 */
const RUNG_EPSILON_KM = 0.0005;

/** One thing that could fill a rung — a logged effort or a stored segment,
 *  reduced to the fields the walk and the row need. */
interface RecordCandidate {
  seconds: number;
  at: string;
  sessionId: string;
  provider: string | null;
  secPerKm: number | null;
  segment: boolean;
}

export function sportRecords(
  sport: OlympicSport | undefined,
  all: SportEffort[],
  markers: SportMarkerEntry[],
  distanceUnit: "km" | "m",
  pacePer: number,
  segments: SportSegmentBest[] = [],
): SportRecord[] {
  const ladder = sport?.records ?? [];
  if (ladder.length === 0) return [];

  // Oldest → newest, so a running best can name what it displaced.
  const chron = [...all].reverse();
  // The ROAD ladder is SHARED, and its `marker: true` flag means "the rung this
  // sport's sc.marker states". Marathon and Race Walking have no `sc` and no
  // marker, so the flag is not about them — honouring it there would let a
  // catalog fact from another sport decide this page's headline.
  const markerRung = sport?.sc ? (ladder.find((r) => r.marker) ?? null) : null;
  // THE TYPED RUNG TAKES THE BEST TYPING, NOT THE LAST ONE. A rung is labelled
  // "Best 5 km"; reading the most recent entry would put 25:00 there the day
  // after a 22:41 was typed, which is the athlete's CURRENT figure and not
  // their record. The marker history exists precisely so this can be a record.
  //
  // A typed rung has to be a CLOCK. "Blue belt, 2 yrs" is a marker too, and it
  // is not a time at a distance — markerNumber would happily turn "240" into a
  // 4-minute 5 km.
  const typedClocks = markers
    .filter((m) => m.value.trim().length > 0 && m.value.includes(":"))
    .map((m) => ({ sec: markerNumber(m.value), at: m.at }))
    .filter((m): m is { sec: number; at: string } => m.sec != null);
  // Walked in the order they were typed, so "the previous best" means the one
  // that stood before this beat it — the same rule the measured rungs follow,
  // rather than a baseline on the first-ever typing.
  let typedSec: number | null = null;
  let typedAt: string | null = null;
  let typedPrev: number | null = null;
  for (const t of typedClocks) {
    if (typedSec == null || t.sec < typedSec) {
      if (typedSec != null) typedPrev = typedSec;
      typedSec = t.sec;
      typedAt = t.at;
    }
  }

  // WHEN a session happened and WHAT recorded it, by session id. A stored
  // segment carries neither — both are facts about the session, and a segment
  // that names a session this sport never held is simply not this sport's (the
  // caller may hand over the athlete's whole `best` set; the absence of a
  // session here is what filters it).
  const sessionMeta = new Map<string, { at: string; provider: string | null }>();
  for (const e of all)
    if (!sessionMeta.has(e.sessionId)) sessionMeta.set(e.sessionId, { at: e.startedAt, provider: e.provider });

  const rows: SportRecord[] = ladder.map((rung) => {
    // A logged effort matches on the BAND (see RECORD_BAND); a segment matches
    // on EQUALITY, because it was measured over exactly this distance.
    const fromEfforts: RecordCandidate[] = [];
    for (const e of chron) {
      if (e.seconds == null || e.seconds <= 0) continue;
      if (e.distanceKm < rung.km || e.distanceKm > rung.km * RECORD_BAND) continue;
      fromEfforts.push({
        seconds: e.seconds,
        at: e.startedAt,
        sessionId: e.sessionId,
        provider: e.provider,
        secPerKm: e.secPerKm,
        segment: false,
      });
    }
    const fromSegments: RecordCandidate[] = [];
    for (const s of segments) {
      if (!(s.seconds > 0)) continue;
      if (Math.abs(s.distanceKm - rung.km) > RUNG_EPSILON_KM) continue;
      const meta = sessionMeta.get(s.sessionId);
      if (!meta) continue;
      fromSegments.push({
        seconds: s.seconds,
        at: meta.at,
        sessionId: s.sessionId,
        provider: meta.provider,
        // Exact by construction: the window covers precisely `rung.km`.
        secPerKm: Math.round(s.seconds / rung.km),
        segment: true,
      });
    }

    // ONE RUN, ONE CANDIDATE. A 5.02 km parkrun with a route yields both an
    // effort candidate (the whole 5.02 km) and a segment candidate (the fastest
    // 5.00 km inside it) — the same run, measured twice. Left in, the
    // chronological walk would report the athlete beating themselves by four
    // seconds on a run they did once. The segment wins: it covers the rung
    // exactly, so it is the truer figure of the two. Efforts from OTHER
    // sessions are untouched, and a session holding two efforts of this sport
    // (a brick) still contributes both, exactly as it always has.
    const claimed = new Set(fromSegments.map((c) => c.sessionId));
    const merged = [...fromEfforts.filter((c) => !claimed.has(c.sessionId)), ...fromSegments].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );

    let best: RecordCandidate | null = null;
    let prevSec: number | null = null;
    for (const c of merged) {
      if (best == null) { best = c; continue; }
      if (c.seconds < best.seconds) { prevSec = best.seconds; best = c; }
    }

    const isMarkerRung = markerRung != null && rung.km === markerRung.km;
    const typedWins = isMarkerRung && typedSec != null && (best == null || typedSec < best.seconds);

    const base = {
      km: rung.km,
      value: rung.name ? null : sportDistance(rung.km, distanceUnit),
      unit: rung.name ? null : distanceUnit,
      name: rung.name ?? null,
      promoted: false,
    };

    if (typedWins) {
      return {
        ...base,
        time: clock(typedSec!),
        // No measured distance behind a typed time, so no pace derived from it.
        pace: null,
        at: typedAt,
        sessionId: null,
        provider: null,
        typed: true,
        segment: false,
        delta: typedPrev != null && typedPrev > typedSec! ? `−${clock(typedPrev - typedSec!)}` : null,
      };
    }
    if (best == null) {
      return { ...base, time: null, pace: null, at: null, sessionId: null, provider: null, typed: false, segment: false, delta: null };
    }
    // A rung AT the pace split states its own pace: a 1 km time on a /km sport
    // and a 100 m time on a /100m sport ARE the pace, so printing both puts the
    // same figure on the row twice — the exact repetition this ladder replaced.
    const rungIsSplit = Math.round(rung.km * 1000) === pacePer;
    return {
      ...base,
      time: clock(best.seconds),
      pace: best.secPerKm != null && !rungIsSplit ? sportPace(best.secPerKm, pacePer) : null,
      at: best.at,
      sessionId: best.sessionId,
      provider: best.provider,
      typed: false,
      segment: best.segment,
      delta: prevSec != null && prevSec > best.seconds ? `−${clock(prevSec - best.seconds)}` : null,
    };
  });

  // THE PROMOTED RUNG — the one the page states large. The sport's own marker
  // distance when it has one, else the shortest rung that has been set. A
  // ladder with nothing on it promotes nothing: an empty page has no headline
  // record to state, and inventing one from the shortest EMPTY rung would put
  // a blank where the biggest figure on the screen goes.
  const promoted =
    rows.find((r) => markerRung != null && r.km === markerRung.km && r.time != null) ??
    rows.find((r) => r.time != null) ??
    null;
  if (promoted) promoted.promoted = true;
  return rows;
}

/* ── 5. THE MODEL BUILDER ────────────────────────────────────────────────── */

export interface SportPageOptions {
  /** Level index into LEVELS — drives the transfer prescription. */
  levelIdx?: number;
  /** The sport's marker history, oldest → newest. */
  markers?: SportMarkerEntry[];
  /**
   * The athlete's stored `best` laps — the fastest window covering each catalog
   * distance, found inside a recording (SessionLap kind `best`).
   *
   * Pass ALL of them, for every sport. The model attributes each one by its
   * session id against the slice it has already narrowed, so a swim's 400 m
   * best cannot land on the running page — and a caller that tried to pre-filter
   * by sport would have to reimplement that narrowing, which is exactly the
   * thing this file exists to keep in one place.
   */
  segmentBests?: SportSegmentBest[];
  weeks?: number;
  now?: number;
}

/**
 * The whole page for one sport. `sessions` is the athlete's raw log; the
 * narrowing, the device projection and every aggregate happen in here, so a
 * client only picks a sport and renders.
 */
export function sportPageModel(
  sportName: string,
  sessions: LoggedSession[],
  opts: SportPageOptions = {},
): SportPageModel {
  const sport = OLYMPIC_SPORTS[sportName];
  const sc = sport?.sc ?? null;
  const metrics = sport?.metrics ?? ["duration"];
  const hasDistance = metrics.includes("distance");
  const hasPace = metrics.includes("pace");
  const distanceUnit = sport?.distanceUnit ?? "km";
  const pacePer = sportPacePer(sport);
  const paceUnit = sportPaceUnit(pacePer);
  const weeksWanted = opts.weeks ?? SPORT_PAGE_WEEKS;
  const now = opts.now ?? Date.now();
  const levelIdx = Math.min(Math.max(opts.levelIdx ?? 0, 0), LEVELS.length - 1);

  const slice = sportSessions(sessions, sportName);
  const totalsRaw = runTotals(slice);
  const buckets: WeekMileage[] = weeklyMileage(slice, weeksWanted, now);
  const all = efforts(slice);
  const empty = all.length === 0;

  /* ── the week series, in the sport's own measure ── */
  const weeks: SportWeek[] = buckets.map((w) => ({
    weekStart: w.weekStart,
    value: hasDistance ? (distanceUnit === "m" ? Math.round(w.km * 1000) : roundKm(w.km)) : w.minutes,
    efforts: w.efforts,
  }));
  const weekAvg = weeks.length ? weeks.reduce((a, w) => a + w.value, 0) / weeks.length : 0;

  /* ── pace: only for a paced sport, and only once two weeks carry one ── */
  const pacedEfforts = all.filter((e) => e.secPerKm != null);
  // Divides by the bucket's exact `seconds`, not the whole minutes the volume
  // bars draw — the same device-truth rule the effort paces above follow.
  const pacedWeeks = buckets
    .map((w) => (w.km > 0 && w.seconds > 0 ? { weekStart: w.weekStart, secPerKm: Math.round(w.seconds / w.km) } : null))
    .filter((p): p is { weekStart: string; secPerKm: number } => p != null);
  const weekPaces = pacedWeeks.map((p) => p.secPerKm);
  let pace: SportPageModel["pace"] = null;
  if (hasPace && pacedEfforts.length > 0 && weekPaces.length >= 2) {
    const best = Math.min(...pacedEfforts.map((e) => e.secPerKm!));
    const avg = Math.round(
      pacedEfforts.reduce((a, e) => a + e.secPerKm!, 0) / pacedEfforts.length,
    );
    pace = {
      avgSecPerKm: avg,
      bestSecPerKm: best,
      trend: weekPaces,
      weekStarts: pacedWeeks.map((p) => p.weekStart),
      prIndex: weekPaces.indexOf(Math.min(...weekPaces)),
    };
  }

  /* ── effort split: the shared zone engine, hidden when it has no minutes ── */
  const rawSplit: EffortSplit | null = hasPace ? paceEffortSplit(slice) : null;
  const split = rawSplit && rawSplit.easy + rawSplit.moderate + rawSplit.hard > 0 ? rawSplit : null;

  /* ── bests ──
     No FASTEST card. Best pace used to sit here, and it was the same figure the
     page had already stated twice: as the headline and again as Pace › Best.
     Every sport now states it exactly once — a sport with a ladder states it
     per rung (a 5 km time carries its own pace), and a paced sport without one
     states it as `primary`. What is left here are the three maxima neither of
     those can express. */
  const bests: SportBest[] = [];
  if (hasDistance) {
    const longest = all.reduce<SportEffort | null>((b, e) => (b == null || e.distanceKm > b.distanceKm ? e : b), null);
    if (longest && longest.distanceKm > 0) {
      bests.push({
        id: "longest",
        value: sportDistance(longest.distanceKm, distanceUnit),
        unit: distanceUnit,
        at: longest.startedAt,
        sessionId: longest.sessionId,
        provider: longest.provider,
      });
    }
  } else {
    const longest = all.reduce<SportEffort | null>((b, e) => (b == null || e.minutes > b.minutes ? e : b), null);
    if (longest && longest.minutes > 0) {
      bests.push({
        id: "longestSession",
        value: formatDuration(longest.minutes),
        unit: null,
        at: longest.startedAt,
        sessionId: longest.sessionId,
        provider: longest.provider,
      });
    }
  }
  const biggest = weeks.reduce<SportWeek | null>((b, w) => (b == null || w.value > b.value ? w : b), null);
  if (biggest && biggest.value > 0) {
    bests.push({
      id: "biggestWeek",
      value: hasDistance ? sportDistance(distanceUnit === "m" ? biggest.value / 1000 : biggest.value, distanceUnit) : formatDuration(biggest.value),
      unit: hasDistance ? distanceUnit : null,
      at: biggest.weekStart,
      // An aggregate is neither typed nor measured — it has no single session
      // behind it, so it carries no provenance mark.
      sessionId: null,
      provider: null,
    });
  }

  /* ── the record ladder ── */
  const records = sportRecords(
    sport,
    all,
    opts.markers ?? [],
    distanceUnit,
    pacePer,
    opts.segmentBests ?? [],
  );

  /* ── the one figure ── */
  const history = (opts.markers ?? []).filter((m) => m.value.trim().length > 0);
  const latest = history[history.length - 1] ?? null;
  const oldest = history[0] ?? null;

  // A TYPED MARKER NO RUNG IS CARRYING needs a line of its own, and this has to
  // be the RUNTIME fact rather than a catalog one. Two ways it happens:
  //   • the marker is not a distance at all (Cycling's FTP, in watts), so the
  //     catalog gives it no rung to fill;
  //   • the marker IS a rung, but what was typed is not a clock ("sub 25") or a
  //     logged effort beat it — either way `sportRecords` left the rung
  //     measured, and the typed figure has nowhere else to go.
  // Gating this on the catalog alone hid the athlete's own figure in the second
  // case. Where a rung IS carrying it, printing it again above would be the
  // repetition this whole change removes.
  const markerAside = latest != null && !records.some((r) => r.typed);
  let primary: SportPrimary;
  if (sc && latest) {
    const d = oldest && oldest !== latest ? markerDelta(oldest.value, latest.value) : null;
    const trendNums = history.map((m) => markerNumber(m.value)).filter((n): n is number => n != null);
    primary = {
      kind: "marker",
      value: latest.value,
      unit: null,
      label: sc.marker.label,
      delta: d?.delta ?? null,
      improving: d?.improving ?? null,
      trend: trendNums.length >= 2 ? trendNums : [],
      at: latest.at,
    };
  } else if (pace) {
    primary = { kind: "pace", value: sportPace(pace.bestSecPerKm, pacePer), unit: paceUnit, label: null, delta: null, improving: null, trend: [], at: null };
  } else if (hasDistance && totalsRaw.distanceKm > 0) {
    primary = { kind: "distance", value: sportDistance(totalsRaw.distanceKm, distanceUnit), unit: distanceUnit, label: null, delta: null, improving: null, trend: [], at: null };
  } else {
    // Hours AND minutes, in one string — "1:07 h" was a clock time wearing a
    // duration's unit, and the alternative it replaced ("1.1 h") was tenths of
    // an hour. The figure carries its own units, so it takes no separate one.
    primary = { kind: "time", value: formatDuration(totalsRaw.minutes), unit: null, label: null, delta: null, improving: null, trend: [], at: null };
  }

  // NO TOTALS ROW. It printed efforts / hours / distance / this week, and the
  // hero's own meta line states efforts, distance and since — two of the four,
  // two hundred points above it. On a TIMED sport the third was worse than a
  // repeat: `primary` falls through to total time, so the 46px headline and the
  // 20px "Hours" cell printed the same string. `thisWeek` survives as the
  // volume axis's own label, which is where a week belongs.
  //
  /* ── the hero's meta line — facts about THIS instance ── */
  const meta = {
    efforts: totalsRaw.efforts,
    // `efforts` counts cardio BLOCKS (a brick session holds two), which is the
    // right figure for "how many times have I run". `sessions` is the row count
    // in History, so a door that opens History has to promise this one — the
    // two differ exactly when a session holds more than one block of a sport.
    sessions: slice.length,
    distance: hasDistance && totalsRaw.distanceKm > 0 ? sportDistance(totalsRaw.distanceKm, distanceUnit) : null,
    distanceUnit,
    // The oldest effort in the slice — `all` is newest-first.
    firstAt: all.length ? all[all.length - 1]!.startedAt : null,
  };

  /* ── transfer — only the sports that carry a pool ── */
  const transfer = sc ? prescribeForSport(sportName, levelIdx, { sessions }) : null;
  const pool: SportPoolEntry[] = (sc?.pool ?? []).map((e) => ({
    ...e,
    locked: e.lvl > levelIdx,
    unlocksAt: LEVELS[e.lvl] ?? LEVELS[LEVELS.length - 1]!,
  }));

  return {
    name: sportName,
    category: sport?.category ?? "",
    family: sc?.family ?? null,
    // The same resolver `sportSessions` narrows the slice with — one answer for
    // "what kind of activity is this", used for the slice and for the paint.
    discipline: cardioDiscipline(sportName),
    hasDistance,
    hasPace,
    distanceUnit,
    pacePer,
    paceUnit,
    empty,
    meta,
    primary,
    markerPrompt: sc ? { label: sc.marker.label, ph: sc.marker.ph } : null,
    weeks,
    // In the sport's own unit — metres for the pool, km for the road. Rounded
    // to the same two decimals the km figures show, so the average never
    // arrives coarser than the weeks it was taken over.
    weekAvg: roundKm(weekAvg),
    pace,
    split,
    records,
    markerAside,
    bests,
    transfer,
    pool,
    recent: all.slice(0, SPORT_PAGE_RECENT),
  };
}

/* ── 5b. HOLDING A CHART — what one held point says ──────────────────────── */

/**
 * The figure under a held finger, in the sport's own unit.
 *
 * The charts on this page draw NUMBERS, not labels — the volume bars are km or
 * minutes depending on the sport, and the pace trend is seconds-per-km rendered
 * at the sport's own split. The shape is the one every held chart uses
 * (chart-scrub.ts `ChartReading`); this alias is here so a reader of the sport
 * page finds it under the name the page's own functions return.
 */
export type SportChartReading = ChartReading;

/** One week of the volume bars, held. Null when the index is off the series. */
export function sportVolumeReading(m: SportPageModel, index: number): SportChartReading | null {
  const w = m.weeks[index];
  if (!w) return null;
  const max = Math.max(...m.weeks.map((x) => x.value), 0);
  return {
    index,
    weekStart: w.weekStart,
    // A timed sport's week is a DURATION, so it brings its own units and the
    // readout adds none — the same string the totals row prints.
    value: m.hasDistance
      ? sportDistance(m.distanceUnit === "m" ? w.value / 1000 : w.value, m.distanceUnit)
      : formatDuration(w.value),
    unit: m.hasDistance ? m.distanceUnit : "",
    efforts: w.efforts,
    best: w.value > 0 && w.value === max,
  };
}

/** One week of the pace trend, held. The trend skips the weeks with nothing
 *  paced in them, so the week named here comes from the trend's OWN alignment
 *  (`pace.weekStarts`), never from the volume bars' index. */
export function sportPaceReading(m: SportPageModel, index: number): SportChartReading | null {
  const sec = m.pace?.trend[index];
  if (m.pace == null || sec == null) return null;
  return {
    index,
    weekStart: m.pace.weekStarts[index] ?? "",
    value: sportPace(sec, m.pacePer),
    unit: m.paceUnit,
    efforts: null,
    best: index === m.pace.prIndex,
  };
}

/* ── 6. THE INDEX — which sports get a page, and in what order ───────────── */

/** One row of the Sport index: a sport, plus what the athlete has done in it. */
export interface SportIndexEntry {
  name: string;
  category: string;
  /** The S&C family ("Endurance", "Combat", …), or null without a pool. */
  family: string | null;
  /** True for the sports that carry an `sc` pool (the transfer section exists). */
  hasTransfer: boolean;
  efforts: number;
  minutes: number;
  distanceKm: number;
  /** ISO of the most recent effort, or null when nothing is logged. */
  lastAt: string | null;
}

/**
 * The catalog sport each endurance discipline IS.
 *
 * Named explicitly rather than inferred. The first pass took the first catalog
 * entry whose name resolves to the discipline, and `cardioDiscipline`'s skiing
 * pattern matches "skate" — so a logged cross-country ski came out as
 * SKATEBOARDING. A six-line map cannot drift like that.
 *
 * `walking` has no entry on purpose: the catalog's only walking sport is Race
 * Walking, a track event, and filing somebody's hike under it would be a lie a
 * link then repeats. A discipline with no sport simply has no page, and the
 * lanes fall back to the index.
 */
const CANONICAL_BY_DISCIPLINE: Partial<Record<CardioDiscipline, string>> = {
  running: "Running",
  cycling: "Cycling",
  swimming: "Swimming",
  rowing: "Rowing",
  skiing: "Cross-Country Skiing",
};

/**
 * The catalog sport an endurance DISCIPLINE is — "running" → "Running". The
 * Endurance lanes are keyed by discipline and the sport page by name, so this
 * is the one place the two vocabularies meet.
 */
export function sportForDiscipline(d: CardioDiscipline): string | null {
  return CANONICAL_BY_DISCIPLINE[d] ?? null;
}

/** Which sport a logged cardio block belongs to, or null when it names none. */
export function sportForBlock(b: CardioBlock): string | null {
  const d = blockDiscipline(b);
  if (d === "sport" || d === "other") return b.name.trim() || null;
  return CANONICAL_BY_DISCIPLINE[d] ?? null;
}

/**
 * Every sport the athlete actually trains, most-trained first, followed by the
 * sports the app can prescribe strength for. This is the Sport screen's index —
 * the list that lifts into a page. The rest of the catalog is reachable through
 * `searchSports`, so all 65 have an address without 65 rows on one screen.
 */
export function sportIndex(sessions: LoggedSession[]): { yours: SportIndexEntry[]; prescribable: SportIndexEntry[] } {
  const acc = new Map<string, { efforts: number; minutes: number; km: number; lastAt: number }>();
  for (const s of deviceTrueSessions(sessions)) {
    const at = new Date(s.startedAt).getTime();
    for (const b of s.blocks) {
      if (!isCardio(b)) continue;
      const name = sportForBlock(b);
      if (!name) continue;
      const cur = acc.get(name) ?? { efforts: 0, minutes: 0, km: 0, lastAt: 0 };
      cur.efforts += 1;
      if (b.minutes && b.minutes > 0) cur.minutes += b.minutes;
      if (b.distance && b.distance > 0) cur.km += b.distance;
      if (Number.isFinite(at) && at > cur.lastAt) cur.lastAt = at;
      acc.set(name, cur);
    }
  }

  const entry = (name: string, v?: { efforts: number; minutes: number; km: number; lastAt: number }): SportIndexEntry => {
    const cat = OLYMPIC_SPORTS[name];
    return {
      name,
      category: cat?.category ?? "",
      family: cat?.sc?.family ?? null,
      hasTransfer: !!cat?.sc,
      efforts: v?.efforts ?? 0,
      minutes: Math.round(v?.minutes ?? 0),
      distanceKm: roundKm(v?.km ?? 0),
      lastAt: v?.lastAt ? new Date(v.lastAt).toISOString() : null,
    };
  };

  const yours = [...acc.entries()]
    .map(([name, v]) => entry(name, v))
    .sort((a, b) => b.efforts - a.efforts || (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
  const logged = new Set(yours.map((e) => e.name));
  const prescribable = Object.values(OLYMPIC_SPORTS)
    .filter((s) => s.sc && !logged.has(s.name))
    .map((s) => entry(s.name));
  return { yours, prescribable };
}

/** The whole catalog, filtered by a typed query (name or category). Empty query
 *  returns the catalog in its own order — the picker, not a ranking. */
export function searchSports(query: string): SportIndexEntry[] {
  const q = query.trim().toLowerCase();
  return Object.values(OLYMPIC_SPORTS)
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
    .map((s) => ({
      name: s.name,
      category: s.category,
      family: s.sc?.family ?? null,
      hasTransfer: !!s.sc,
      efforts: 0,
      minutes: 0,
      distanceKm: 0,
      lastAt: null,
    }));
}

/* ── 7. THE STORE — the sport selection both clients persist ─────────────── */

/**
 * What a client keeps under "hybrid.sport" (web localStorage, mobile
 * AsyncStorage). The shape is HERE rather than in either client because both
 * write it and Today reads it: three copies of this object is how the level on
 * one client stops matching the level on the other.
 *
 * `markers` (value-per-sport) is the ORIGINAL field and stays, because Today's
 * reconciliation already reads it. `markerLog` is the history the sport page
 * needs to show a delta honestly — a marker is typed, not derived, so without
 * the previous typings there is no trend that isn't invented.
 */
export interface SportStore {
  sport?: string;
  levelIdx?: number;
  markers?: Record<string, string>;
  markerLog?: Record<string, SportMarkerEntry[]>;
}

/** How many typings a sport keeps. Enough for a trend line, bounded so the
 *  store can't grow without limit on a device that never syncs. */
export const MARKER_LOG_CAP = 24;

/** A sport's kept typings, oldest → newest. An athlete who typed a marker
 *  BEFORE the log existed still has one point, so their figure survives. */
export function markerHistory(store: SportStore | null | undefined, sport: string): SportMarkerEntry[] {
  const log = store?.markerLog?.[sport];
  if (log && log.length) return log;
  const legacy = store?.markers?.[sport];
  return legacy && legacy.trim() ? [{ value: legacy, at: "" }] : [];
}

/**
 * Record a typed marker. Re-typing the SAME value is not a new data point (it
 * would flatten the trend with duplicates), so it updates nothing.
 */
export function recordMarker(store: SportStore | null | undefined, sport: string, value: string, at: string): SportStore {
  const base: SportStore = { ...(store ?? {}) };
  const v = value.trim();
  const log = { ...(base.markerLog ?? {}) };
  const markers = { ...(base.markers ?? {}) };
  if (!v) {
    delete markers[sport];
    delete log[sport];
  } else {
    const prev = log[sport] ?? markerHistory(base, sport);
    const last = prev[prev.length - 1];
    log[sport] = last && last.value === v ? prev : [...prev, { value: v, at }].slice(-MARKER_LOG_CAP);
    markers[sport] = v;
  }
  base.markerLog = log;
  base.markers = markers;
  return base;
}

/* ── 8. STARTING THE TRANSFER SESSION ────────────────────────────────────── */

/**
 * The prescription as logger-ready blocks. Both clients hand these to the live
 * logger when the athlete starts today's transfer session, so the session that
 * opens on a phone is the same session that opens in a browser: one block per
 * prescribed lift, pre-filled with the dosed sets, reps and working load (blank
 * where the movement is bodyweight and there is no load to state).
 */
export function transferSessionBlocks(rx: SportPrescription): SessionBlock[] {
  return rx.blocks.map((b) => ({
    kind: "strength" as const,
    name: b.name,
    // The per-set field is whatever the exercise is MEASURED in — the logger
    // labels it "reps" / "s" / "m" off exerciseProfile — so a hold seeds its
    // seconds and a carry its metres, not a rep count neither one has.
    sets: Array.from({ length: b.sets }, () => ({ load: b.load != null ? String(b.load) : "", reps: String(b.amount) })),
  }));
}

/** What an index row says about a sport it has no efforts for. The category
 *  usually names it best ("Combat", "Racket") — but a handful of sports ARE
 *  their category ("Cycling"), and repeating the name reads as a bug, so those
 *  fall back to the S&C family. */
export function sportIndexMeta(e: SportIndexEntry): string {
  if (e.category && e.category !== e.name) return e.category;
  return e.family ?? e.category;
}

/* ── 9. ADDRESSES — one slug, both clients ───────────────────────────────── */

/**
 * A sport's URL slug: "Open Water Swimming" → "open-water-swimming".
 *
 * Sport NAMES are display strings — they carry spaces, ampersands and slashes
 * ("Track & Field", "Canoe Slalom"), and the web shell's deep-link parser
 * deliberately accepts only `[A-Za-z0-9_-]` because that parser is the one
 * place an attacker-controlled string is read into screen state. A slug is what
 * gets both: a link that survives a URL bar, and a value that never has to be
 * loosened past that pattern.
 *
 * The slug is DERIVED, never stored, so adding a sport to the catalog gives it
 * an address for free.
 */
export function sportSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A link's sport, resolved back to the catalog. Accepts EITHER form — the slug
 * a shared link carries, or the display name a client already holds — so one
 * resolver serves the web query param, the mobile route param and any link
 * written by an older build. Unknown input returns null rather than a guess:
 * the caller shows the index, never a page for a sport that does not exist.
 */
export function sportFromSlug(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (OLYMPIC_SPORTS[raw]) return raw;
  const slug = sportSlug(raw);
  if (!slug) return null;
  for (const s of Object.values(OLYMPIC_SPORTS)) if (sportSlug(s.name) === slug) return s.name;
  return null;
}
