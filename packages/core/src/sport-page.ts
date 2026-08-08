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
// Pure and client-agnostic: apps/web/components/aurora/sport-page.tsx and
// apps/mobile/components/aurora/sport-page.tsx render the same model, so the
// two clients cannot branch differently on what a sport shows.
// ─────────────────────────────────────────────────────────────────────────────

import { deviceTrueSessions } from "./device-truth";
import { roundKm } from "./distance";
import { durationParts, formatDuration } from "./duration";
import { DISCIPLINE_META } from "./endurance";
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
import { mmss } from "./format";
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

/** One cell of the totals row. `id` names the string the client localizes. */
export interface SportTotal {
  id: "efforts" | "distance" | "hours" | "week";
  value: string;
  /** The unit to name in the label ("km" / "m"), when the cell has one. */
  unit: string | null;
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
  /** The connector that recorded it ("apple"), or null when it was typed. */
  provider: string | null;
}

/** An all-time best. `effort`-backed bests carry the session they came from. */
export interface SportBest {
  id: "fastest" | "longest" | "longestSession" | "biggestWeek";
  value: string;
  unit: string | null;
  /** ISO — the effort's date, or the week's start for `biggestWeek`. */
  at: string;
  sessionId: string | null;
  /** The recording's connector, when a device measured this best. */
  provider: string | null;
}

/** A pool exercise plus whether the chosen level has reached it. */
export interface SportPoolEntry extends PoolExercise {
  locked: boolean;
  /** The level that unlocks it — only meaningful while `locked`. */
  unlocksAt: string;
}

export interface SportPageModel {
  name: string;
  icon: string;
  category: string;
  /** The S&C family ("Endurance", "Combat", …), or null for a sport with no pool. */
  family: string | null;
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
  meta: { efforts: number; distance: string | null; distanceUnit: "km" | "m"; firstAt: string | null };
  primary: SportPrimary;
  /** The catalog's marker prompt, when the sport has one and it is unfilled. */
  markerPrompt: { label: string; ph: string } | null;
  totals: SportTotal[];
  weeks: SportWeek[];
  /** Mean of `weeks`, in the same measure. */
  weekAvg: number;
  /** Null unless the sport is paced AND something paced is logged. */
  pace: { avgSecPerKm: number; bestSecPerKm: number; trend: number[]; prIndex: number } | null;
  /** Null unless the sport is paced and the split has minutes in it. */
  split: EffortSplit | null;
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

/* ── 5. THE MODEL BUILDER ────────────────────────────────────────────────── */

export interface SportPageOptions {
  /** Level index into LEVELS — drives the transfer prescription. */
  levelIdx?: number;
  /** The sport's marker history, oldest → newest. */
  markers?: SportMarkerEntry[];
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
  const weekPaces = buckets
    .map((w) => (w.km > 0 && w.seconds > 0 ? w.seconds / w.km : null))
    .filter((p): p is number => p != null)
    .map((p) => Math.round(p));
  let pace: SportPageModel["pace"] = null;
  if (hasPace && pacedEfforts.length > 0 && weekPaces.length >= 2) {
    const best = Math.min(...pacedEfforts.map((e) => e.secPerKm!));
    const avg = Math.round(
      pacedEfforts.reduce((a, e) => a + e.secPerKm!, 0) / pacedEfforts.length,
    );
    pace = { avgSecPerKm: avg, bestSecPerKm: best, trend: weekPaces, prIndex: weekPaces.indexOf(Math.min(...weekPaces)) };
  }

  /* ── effort split: the shared zone engine, hidden when it has no minutes ── */
  const rawSplit: EffortSplit | null = hasPace ? paceEffortSplit(slice) : null;
  const split = rawSplit && rawSplit.easy + rawSplit.moderate + rawSplit.hard > 0 ? rawSplit : null;

  /* ── bests ── */
  const bests: SportBest[] = [];
  if (hasPace) {
    const fastest = pacedEfforts.reduce<SportEffort | null>(
      (b, e) => (b == null || e.secPerKm! < b.secPerKm! ? e : b),
      null,
    );
    if (fastest) {
      bests.push({
        id: "fastest",
        value: sportPace(fastest.secPerKm!, pacePer),
        unit: paceUnit,
        at: fastest.startedAt,
        sessionId: fastest.sessionId,
        provider: fastest.provider,
      });
    }
  }
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

  /* ── the one figure ── */
  const history = (opts.markers ?? []).filter((m) => m.value.trim().length > 0);
  const latest = history[history.length - 1] ?? null;
  const oldest = history[0] ?? null;
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

  /* ── totals — the distance cell exists only when the sport measures one ── */
  const thisWeek = weeks[weeks.length - 1] ?? { value: 0, efforts: 0, weekStart: new Date(now).toISOString() };
  const totals: SportTotal[] = [{ id: "efforts", value: String(totalsRaw.efforts), unit: null }];
  if (hasDistance) totals.push({ id: "distance", value: sportDistance(totalsRaw.distanceKm, distanceUnit), unit: distanceUnit });
  // Time logged reads in hours AND minutes: rounding to whole hours printed a
  // flat "1" over 67 minutes of tennis, and the athlete had logged the 7.
  totals.push({ id: "hours", value: formatDuration(totalsRaw.minutes), unit: null });
  totals.push({
    id: "week",
    value: hasDistance ? sportDistance(distanceUnit === "m" ? thisWeek.value / 1000 : thisWeek.value, distanceUnit) : formatDuration(thisWeek.value),
    unit: hasDistance ? distanceUnit : null,
  });

  /* ── the hero's meta line — facts about THIS instance ── */
  const meta = {
    efforts: totalsRaw.efforts,
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
    icon: sport?.icon ?? DISCIPLINE_META[cardioDiscipline(sportName)].emoji,
    category: sport?.category ?? "",
    family: sc?.family ?? null,
    hasDistance,
    hasPace,
    distanceUnit,
    pacePer,
    paceUnit,
    empty,
    meta,
    primary,
    markerPrompt: sc ? { label: sc.marker.label, ph: sc.marker.ph } : null,
    totals,
    weeks,
    // In the sport's own unit — metres for the pool, km for the road. Rounded
    // to the same two decimals the km figures show, so the average never
    // arrives coarser than the weeks it was taken over.
    weekAvg: roundKm(weekAvg),
    pace,
    split,
    bests,
    transfer,
    pool,
    recent: all.slice(0, SPORT_PAGE_RECENT),
  };
}

/* ── 6. THE INDEX — which sports get a page, and in what order ───────────── */

/** One row of the Sport index: a sport, plus what the athlete has done in it. */
export interface SportIndexEntry {
  name: string;
  icon: string;
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
      icon: cat?.icon ?? "🎯",
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
      icon: s.icon,
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
