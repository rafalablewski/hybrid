/**
 * STREAMS — the second-by-second recording, not the summary of it.
 *
 * `Session.device` holds a DeviceWorkout: duration, distance, kcal, average and
 * peak heart rate. That is a workout SUMMARY, and a summary is a commodity —
 * every app with a HealthKit entitlement reads the same eleven numbers. What
 * WHOOP and Garmin actually own is the shape underneath: where the heart rate
 * went and when, the route, the laps the athlete pressed, the splits that fall
 * out of the distance series. None of it was landing here, and none of it can be
 * reconstructed later — a recording not read at match time is a recording the
 * athlete would have to re-import by hand.
 *
 * This module is the shared shape for that data: what a stream IS, what a lap
 * IS, how either is sanitised before it touches the database, and the pure
 * derivations that make a stream worth storing (zone time, splits, best efforts
 * inside a longer effort). Both clients and the API use exactly these; nothing
 * here knows HealthKit exists — the native read lives in
 * apps/mobile/lib/healthkit.ts and fills this shape, so a Garmin or WHOOP
 * connector later fills the same one.
 *
 * WHY ARRAYS AND NOT ROWS. A per-sample table is the obvious warehouse answer
 * and the wrong one: an hour of 1 Hz heart rate is 3 600 rows, so a single
 * athlete-year is millions and a million athletes is a table nobody can afford
 * to index. A stream is therefore stored as ONE row per (session, kind) holding
 * parallel `offsets` / `values` arrays — Postgres arrays, not an opaque blob, so
 * `unnest` still makes them queryable — with the aggregate figures (min / avg /
 * max / duration) lifted into their own columns so the common questions never
 * touch the array at all. What DOES get a row each is the LAP: laps are tens per
 * workout, not thousands, and "the fastest 5 km this athlete has ever run" has
 * to be an indexed lookup rather than a scan of every stream.
 *
 * SAMPLES ARE CAPPED, NOT TRUNCATED. A stream longer than `STREAM_MAX_SAMPLES`
 * is downsampled across its whole span (mean for rates, nearest for positions
 * and cumulatives) — never cut short. A truncated 6-hour ride would silently
 * become a 40-minute one, and every figure derived from it would be wrong in a
 * way nothing downstream could detect.
 *
 * Pure. No IO, no clock.
 */
import { olympicSport, sportPacePerMeters } from "./olympic-sports";

/**
 * What a stream MEASURES. Each kind fixes its unit, so a value never needs to
 * carry one and two providers can't store the same series in different units.
 *
 *  hr        instantaneous heart rate, bpm
 *  power     mechanical power, watts
 *  cadence   steps/min (run) or rpm (bike) — the activity says which
 *  speed     instantaneous speed, m/s (NOT pace: pace is derived, and dividing
 *            by zero at a standstill is the reason)
 *  altitude  metres above sea level (absolute — climb is the derivative)
 *  distance  CUMULATIVE distance from the start, km. The one series everything
 *            about splits, pace and best efforts is computed from.
 *  route     GPS track: `values` holds latitude, `valuesB` longitude, degrees.
 */
export type StreamKind = "hr" | "power" | "cadence" | "speed" | "altitude" | "distance" | "route";

export const STREAM_KINDS: readonly StreamKind[] = [
  "hr",
  "power",
  "cadence",
  "speed",
  "altitude",
  "distance",
  "route",
];

/** The unit each kind is stored in — fixed by the kind, never by the caller. */
export const STREAM_UNIT: Record<StreamKind, string> = {
  hr: "bpm",
  power: "W",
  cadence: "rpm",
  speed: "m/s",
  altitude: "m",
  distance: "km",
  route: "deg",
};

/**
 * How many samples a stored stream may hold. 3 000 is ~2.4 s resolution over a
 * two-hour session and ~7 s over a six-hour one — finer than any chart can draw
 * and finer than any derived figure needs, while keeping a row's arrays around
 * 50 KB rather than the 300 KB a raw 1 Hz ultra would be.
 */
export const STREAM_MAX_SAMPLES = 3000;

/** A recording longer than this is not a workout, it is a stuck sensor. */
const MAX_STREAM_SEC = 24 * 3600;

/** Sane bounds per kind — a value outside these is dropped, not clamped: a
 *  clamped 500 bpm becomes a plausible 260 and poisons an average, whereas a
 *  dropped sample leaves a gap the derivations already tolerate. */
const BOUNDS: Record<StreamKind, [number, number]> = {
  hr: [20, 260],
  power: [0, 3000],
  cadence: [0, 300],
  speed: [0, 40],
  altitude: [-500, 9000],
  distance: [0, 1000],
  route: [-90, 90], // latitude; longitude is bounded separately below
};

/** Whether a kind is a RATE (averageable) or a POSITION/CUMULATIVE (not).
 *  Averaging a cumulative distance across a bucket invents a position between
 *  two real ones; averaging two GPS fixes puts the athlete off the road. */
const AVERAGEABLE: Record<StreamKind, boolean> = {
  hr: true,
  power: true,
  cadence: true,
  speed: true,
  altitude: true,
  distance: false,
  route: false,
};

/**
 * One recorded series, as stored.
 *
 * `offsets` are WHOLE SECONDS FROM `startedAt`, strictly increasing — not
 * timestamps. A 2-hour stream of absolute ISO strings is 3 000 × 24 bytes of
 * mostly-identical prefix; the offset is a small integer and the anchor is
 * stored once. `values[i]` belongs to `offsets[i]`; for `route`, `valuesB[i]` is
 * the longitude of the same fix.
 */
export interface SessionStream {
  kind: StreamKind;
  /** ISO instant `offsets` are measured from — the recording's start. */
  startedAt: string;
  /** Seconds from `startedAt`, strictly increasing, same length as `values`. */
  offsets: number[];
  values: number[];
  /** Longitude, for `route` only. Same length as `values` when present. */
  valuesB?: number[];
  /** Which connector produced it ("apple"), and that provider's id for the
   *  recording — so a re-import recognises what it already stored. */
  provider: string;
  uuid: string;
}

/** The figures lifted out of a stream into their own columns, so the common
 *  questions ("average power", "how long was it") never read the arrays. */
export interface StreamSummary {
  sampleCount: number;
  /** Span of the recording, seconds (last offset − first). */
  durationSec: number;
  /** Absent for `route`, where a min/max latitude means nothing. */
  min: number | null;
  max: number | null;
  avg: number | null;
}

/**
 * A LAP — one delimited piece of a recording.
 *
 *  lap      the athlete pressed the button (or the watch auto-lapped)
 *  split    a machine split at a round distance (every km / mile)
 *  segment  a distinct activity inside a multi-sport recording (the swim leg)
 *  best     a DERIVED best effort: the fastest window covering a catalog
 *           distance, found inside a longer effort. Stored, not computed on
 *           read, because "my fastest 5 km" must be one indexed query rather
 *           than a scan over every stream the athlete has ever recorded.
 */
export type LapKind = "lap" | "split" | "segment" | "best";

export interface SessionLap {
  kind: LapKind;
  /** Position within its kind, 0-based — laps in the order they were run. */
  index: number;
  /** Seconds from the recording's start. */
  startOffsetSec: number;
  durationSec: number;
  distanceKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgWatts: number | null;
  elevationM: number | null;
  /** Seconds per kilometre — derived here so every consumer reads one figure
   *  computed from the exact distance and the exact clock. */
  paceSecPerKm: number | null;
}

const fin = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};

const inRange = (n: number, lo: number, hi: number) => n >= lo && n <= hi;

/** Round for a column that is an integer. Null passes through. */
const intOrNull = (n: number | null): number | null => (n == null ? null : Math.round(n));

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Decimal places each kind is stored at. GPS keeps 6 (~11 cm) because a route
 *  rounded to 4 visibly zig-zags at walking pace; a heart rate keeps none. */
const DP: Record<StreamKind, number> = {
  hr: 0,
  power: 0,
  cadence: 0,
  speed: 3,
  altitude: 1,
  distance: 4,
  route: 6,
};

/**
 * Coerce arbitrary input into a clean `SessionStream`, or null when it isn't
 * one. Applied on the API boundary, so a malformed client can never write a
 * stream that later divides by zero in a derivation.
 *
 * What it enforces, in order: a known kind; a real anchor instant; paired
 * arrays; per-sample bounds (out-of-range samples are DROPPED, see BOUNDS);
 * strictly increasing offsets within the 24 h cap; monotonic non-decreasing
 * values for `distance` (a cumulative that goes backwards is a bad fix, and one
 * of those makes every split after it negative); and finally the sample cap.
 */
export function sanitizeSessionStream(input: unknown): SessionStream | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;
  const kind = STREAM_KINDS.find((k) => k === o.kind);
  if (!kind) return null;

  const startMs = typeof o.startedAt === "string" ? Date.parse(o.startedAt) : NaN;
  if (!Number.isFinite(startMs)) return null;

  const rawOffsets = Array.isArray(o.offsets) ? o.offsets : null;
  const rawValues = Array.isArray(o.values) ? o.values : null;
  if (!rawOffsets || !rawValues || rawOffsets.length !== rawValues.length) return null;
  const rawB = kind === "route" ? (Array.isArray(o.valuesB) ? o.valuesB : null) : null;
  if (kind === "route" && (!rawB || rawB.length !== rawValues.length)) return null;

  const [lo, hi] = BOUNDS[kind];
  const offsets: number[] = [];
  const values: number[] = [];
  const valuesB: number[] = [];
  let lastOffset = -1;
  let lastValue = -Infinity;
  for (let i = 0; i < rawOffsets.length; i++) {
    const t = fin(rawOffsets[i]);
    const v = fin(rawValues[i]);
    if (t == null || v == null) continue;
    const sec = Math.round(t);
    if (sec <= lastOffset || sec < 0 || sec > MAX_STREAM_SEC) continue;
    if (!inRange(v, lo, hi)) continue;
    if (kind === "distance") {
      // A cumulative series must never go backwards. Dropping the bad fix keeps
      // every later split positive; keeping it would make one split negative and
      // the next one twice as fast.
      if (v < lastValue) continue;
      lastValue = v;
    }
    let lng = 0;
    if (kind === "route") {
      const b = fin(rawB![i]);
      if (b == null || !inRange(b, -180, 180)) continue;
      lng = b;
    }
    offsets.push(sec);
    values.push(round(v, DP[kind]));
    if (kind === "route") valuesB.push(round(lng, DP.route));
    lastOffset = sec;
  }
  // Two samples is the floor: one sample has no span, and every derivation here
  // reads a difference.
  if (offsets.length < 2) return null;

  const provider =
    typeof o.provider === "string" && o.provider.trim() ? o.provider.trim().slice(0, 24) : "apple";
  const uuid = typeof o.uuid === "string" ? o.uuid.trim().slice(0, 80) : "";
  if (!uuid) return null;

  const stream: SessionStream = {
    kind,
    startedAt: new Date(startMs).toISOString(),
    offsets,
    values,
    ...(kind === "route" ? { valuesB } : {}),
    provider,
    uuid,
  };
  return downsampleStream(stream, STREAM_MAX_SAMPLES);
}

/**
 * Reduce a stream to at most `max` samples across its WHOLE span.
 *
 * Buckets are by index, not by time, so an irregularly-sampled series (every
 * health store produces them) keeps its shape instead of collapsing wherever it
 * happened to sample densely. Rates are averaged within a bucket; positions and
 * cumulatives take the bucket's LAST sample, which is a real fix at a real
 * instant rather than an invented point between two. The first and last samples
 * always survive — they anchor the span every derivation measures against.
 */
export function downsampleStream(stream: SessionStream, max: number): SessionStream {
  const n = stream.offsets.length;
  if (n <= max || max < 2) return stream;
  const mean = AVERAGEABLE[stream.kind];
  const dp = DP[stream.kind];
  const offsets: number[] = [];
  const values: number[] = [];
  const valuesB: number[] = [];
  for (let b = 0; b < max; b++) {
    const from = Math.floor((b * n) / max);
    const to = Math.max(from + 1, Math.floor(((b + 1) * n) / max));
    const last = to - 1;
    if (mean) {
      let sum = 0;
      for (let i = from; i < to; i++) sum += stream.values[i]!;
      offsets.push(stream.offsets[last]!);
      values.push(round(sum / (to - from), dp));
    } else {
      offsets.push(stream.offsets[last]!);
      values.push(stream.values[last]!);
      if (stream.valuesB) valuesB.push(stream.valuesB[last]!);
    }
  }
  // Only `route` carries a second array, and route is never averaged — so the
  // bucket's last-sample branch above is the one that filled `valuesB`, and its
  // longitudes still pair with the latitudes beside them.
  return { ...stream, offsets, values, ...(stream.valuesB ? { valuesB } : {}) };
}

/** The columns lifted out of a stream. `route` reports no min/avg/max — the
 *  mean of a set of latitudes is a point in a field, not a fact about a run. */
export function streamSummary(stream: SessionStream): StreamSummary {
  const n = stream.values.length;
  const durationSec = n > 0 ? stream.offsets[n - 1]! - stream.offsets[0]! : 0;
  if (stream.kind === "route" || n === 0)
    return { sampleCount: n, durationSec, min: null, max: null, avg: null };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of stream.values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const dp = DP[stream.kind];
  return { sampleCount: n, durationSec, min: round(min, dp), max: round(max, dp), avg: round(sum / n, dp) };
}

/**
 * Seconds spent in each of the five heart-rate zones, given the athlete's max HR.
 *
 * Zone edges are the conventional percentages of max — 50/60/70/80/90 — and a
 * sample's time is the gap to the NEXT sample, so an irregularly-sampled stream
 * doesn't over-count wherever the watch sampled densely. The final sample gets
 * the median gap rather than nothing, so the last few seconds of a workout are
 * not silently discarded. Anything under Z1 is not returned; a warm-up walk at
 * 45% of max is not zone time.
 *
 * Returns five numbers, Z1..Z5.
 */
export function hrZoneSeconds(stream: SessionStream, maxHr: number): [number, number, number, number, number] {
  const out: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  if (stream.kind !== "hr" || !(maxHr > 0)) return out;
  const secs = sampleSeconds(stream);
  if (secs.length === 0) return out;
  for (let i = 0; i < stream.values.length; i++) {
    const dt = secs[i]!;
    const pct = stream.values[i]! / maxHr;
    const z = pct >= 0.9 ? 5 : pct >= 0.8 ? 4 : pct >= 0.7 ? 3 : pct >= 0.6 ? 2 : pct >= 0.5 ? 1 : 0;
    if (z > 0) out[z - 1] = out[z - 1]! + dt;
  }
  return out.map((s) => Math.round(s)) as [number, number, number, number, number];
}

/**
 * SAMPLE DURATIONS — each sample owns the gap to the NEXT one, and the last
 * owns the median gap rather than nothing.
 *
 * Lifted out of `hrZoneSeconds` because three readings now need exactly this
 * weighting, and an irregularly-sampled stream over-counts wherever the watch
 * sampled densely if any of them counts samples instead of seconds.
 */
function sampleSeconds(stream: SessionStream): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < stream.offsets.length; i++) gaps.push(stream.offsets[i]! - stream.offsets[i - 1]!);
  if (gaps.length === 0) return [];
  const sorted = [...gaps].sort((a, b) => a - b);
  const tail = sorted[Math.floor(sorted.length / 2)]!;
  return stream.values.map((_, i) => (i < gaps.length ? gaps[i]! : tail));
}

/**
 * SECONDS SPENT ABOVE A HEART RATE — time-weighted, not sample-counted.
 *
 * The figure an athlete quotes about a hard session ("twenty minutes over
 * 160"), and the one that separates a session with a spike from one that lived
 * up there. Null when the stream is not a heart rate.
 */
export function secondsAbove(stream: SessionStream, bpm: number): number | null {
  if (stream.kind !== "hr" || !(bpm > 0)) return null;
  const secs = sampleSeconds(stream);
  if (secs.length === 0) return null;
  let out = 0;
  for (let i = 0; i < stream.values.length; i++) if (stream.values[i]! > bpm) out += secs[i]!;
  return Math.round(out);
}

/**
 * CARDIAC DRIFT — how much higher the heart rate ran in the second half than
 * the first, as a percentage.
 *
 * The honest version of "how much did this cost you" that a single average
 * cannot express: the same mean can come from an even hour or from a first half
 * at 130 and a second at 155, and only the second one is a session that took
 * something out of you. Positive means it climbed.
 *
 * Split by TIME, not by sample index, so a stream that sampled densely at the
 * start does not put its midpoint in the wrong place. Null when there is too
 * little either side to compare.
 */
export function hrDriftPct(stream: SessionStream): number | null {
  if (stream.kind !== "hr") return null;
  const n = stream.values.length;
  if (n < 4) return null;
  const first = stream.offsets[0]!;
  const mid = first + (stream.offsets[n - 1]! - first) / 2;
  let a = 0;
  let an = 0;
  let b = 0;
  let bn = 0;
  for (let i = 0; i < n; i++) {
    if (stream.offsets[i]! < mid) {
      a += stream.values[i]!;
      an++;
    } else {
      b += stream.values[i]!;
      bn++;
    }
  }
  if (an === 0 || bn === 0) return null;
  const meanA = a / an;
  if (!(meanA > 0)) return null;
  return Math.round(((b / bn - meanA) / meanA) * 1000) / 10;
}

/**
 * THE FALL IN THE LAST MINUTE — how far the heart rate came down over the
 * closing sixty seconds of the recording.
 *
 * DELIBERATELY NOT CALLED "RECOVERY HEART RATE". The clinical figure is the
 * drop measured one minute AFTER the effort stops, and a workout recording
 * usually ends when the effort does — so the samples that figure needs are not
 * in this data, and presenting this as that would be inventing a measurement.
 * What this is, is what the recording can honestly say: the heart rate was here
 * at the end, and a minute earlier it was there. On a session with a cool-down
 * it is the same shape as the real thing; on one that stops dead it is small,
 * which is also true.
 *
 * Null when the recording is shorter than the window it needs.
 */
export const HR_FALL_WINDOW_SEC = 60;

export function hrFallLastMinute(stream: SessionStream): number | null {
  if (stream.kind !== "hr") return null;
  const n = stream.values.length;
  if (n < 2) return null;
  const end = stream.offsets[n - 1]!;
  const from = end - HR_FALL_WINDOW_SEC;
  if (from < stream.offsets[0]!) return null;
  // The highest reading inside the window, against the last one — a fall is
  // measured from where it actually was, not from whichever sample happens to
  // sit exactly on the boundary.
  let peak = -Infinity;
  for (let i = 0; i < n; i++) if (stream.offsets[i]! >= from) peak = Math.max(peak, stream.values[i]!);
  if (!Number.isFinite(peak)) return null;
  const fall = Math.round(peak - stream.values[n - 1]!);
  return fall > 0 ? fall : null;
}

/**
 * THE ROUTE, NORMALISED — latitude/longitude reduced to points in a 0–1 box,
 * ready for any client to scale into a plot.
 *
 * A TRACE, not a map: no tiles, no basemap, no attribution and no network. The
 * SHAPE of where you went is the part that is recognisable at a glance and the
 * part that is worth posting — the streets around it are somebody else's data
 * and a licence.
 *
 * ASPECT IS PRESERVED and longitude is scaled by cos(latitude), without which
 * every route drawn north of the tropics is stretched sideways — a 5 km square
 * loop at 52° renders as a rectangle nearly twice as wide as it is tall. The
 * shorter axis is centred in the box.
 */
export function routePoints(stream: SessionStream): { x: number; y: number }[] {
  if (stream.kind !== "route" || !stream.valuesB) return [];
  const lat = stream.values;
  const lng = stream.valuesB;
  const n = Math.min(lat.length, lng.length);
  if (n < 2) return [];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (let i = 0; i < n; i++) {
    minLat = Math.min(minLat, lat[i]!);
    maxLat = Math.max(maxLat, lat[i]!);
    minLng = Math.min(minLng, lng[i]!);
    maxLng = Math.max(maxLng, lng[i]!);
  }
  const midLat = (minLat + maxLat) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180) || 1;
  const spanY = maxLat - minLat;
  const spanX = (maxLng - minLng) * kx;
  const span = Math.max(spanY, spanX) || 1;
  // Centre the shorter axis so an out-and-back does not hug one edge.
  const padX = (span - spanX) / 2;
  const padY = (span - spanY) / 2;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: (padX + (lng[i]! - minLng) * kx) / span,
      // Latitude grows northward and a plot's y grows downward.
      y: 1 - (padY + (lat[i]! - minLat)) / span,
    });
  }
  return out;
}

/** Read a cumulative distance stream at an arbitrary second, linearly
 *  interpolating between the two samples that bracket it. */
function distanceAt(stream: SessionStream, sec: number): number {
  const { offsets, values } = stream;
  if (sec <= offsets[0]!) return values[0]!;
  const n = offsets.length;
  if (sec >= offsets[n - 1]!) return values[n - 1]!;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid]! <= sec) lo = mid;
    else hi = mid;
  }
  const span = offsets[hi]! - offsets[lo]!;
  if (span <= 0) return values[lo]!;
  return values[lo]! + ((values[hi]! - values[lo]!) * (sec - offsets[lo]!)) / span;
}

/**
 * Even SPLITS out of a cumulative distance stream — every `everyKm` of the
 * effort as its own lap, plus the ragged remainder at the end.
 *
 * The split's time is read by interpolating the distance series at the
 * boundary, not by taking the nearest sample: at 3:30 /km a sample every 5 s is
 * 23 m, and a kilometre split placed at the nearest sample can be off by nearly
 * five seconds — which is the entire difference athletes look at splits for.
 *
 * The trailing remainder is returned as a lap with the distance it actually
 * covered, never rounded up to a whole split: a 7.4 km run has seven splits and
 * a 400 m tail, not eight.
 */
export function splitsFromDistance(stream: SessionStream, everyKm = 1): SessionLap[] {
  if (stream.kind !== "distance" || everyKm <= 0) return [];
  const { offsets, values } = stream;
  const total = values[values.length - 1]! - values[0]!;
  if (!(total > 0)) return [];
  const base = values[0]!;
  const t0 = offsets[0]!;
  const tEnd = offsets[offsets.length - 1]!;

  /** The first second at which the cumulative series reaches `km`. */
  const timeAt = (km: number): number => {
    let lo = t0;
    let hi = tEnd;
    // 30 halvings over a 24 h span resolves to well under a millisecond; the
    // series itself is coarser than that, so this is exact for our purposes.
    for (let i = 0; i < 30 && hi - lo > 0.01; i++) {
      const mid = (lo + hi) / 2;
      if (distanceAt(stream, mid) - base >= km) hi = mid;
      else lo = mid;
    }
    return hi;
  };

  const laps: SessionLap[] = [];
  let prevT = t0;
  let index = 0;
  for (let km = everyKm; km <= total + 1e-9; km += everyKm) {
    const t = timeAt(km);
    const durationSec = Math.round((t - prevT) * 10) / 10;
    if (durationSec > 0)
      laps.push(lap("split", index++, Math.round(prevT), durationSec, everyKm));
    prevT = t;
  }
  const remainder = total - Math.floor((total + 1e-9) / everyKm) * everyKm;
  if (remainder > 0.005) {
    const durationSec = Math.round((tEnd - prevT) * 10) / 10;
    if (durationSec > 0)
      laps.push(lap("split", index++, Math.round(prevT), durationSec, round(remainder, 4)));
  }
  return laps;
}

function lap(
  kind: LapKind,
  index: number,
  startOffsetSec: number,
  durationSec: number,
  distanceKm: number | null,
): SessionLap {
  return {
    kind,
    index,
    startOffsetSec,
    durationSec,
    distanceKm,
    avgHr: null,
    maxHr: null,
    avgWatts: null,
    elevationM: null,
    paceSecPerKm: distanceKm != null && distanceKm > 0 ? round(durationSec / distanceKm, 1) : null,
  };
}

/**
 * THE FASTEST WINDOW covering each catalog distance, found INSIDE the recording.
 *
 * This is the thing a summary can never answer: an 8 km run contains a 5 km, and
 * until the distance series landed there was no way to say what it was run in —
 * the record ladder could only count efforts logged AT the distance (see
 * sport-page.ts `sportRecords` and the RECORD_BAND rule it explains). With the
 * series, the answer is a two-pointer sweep: for every start sample, advance the
 * end until the window covers the rung, and keep the shortest time.
 *
 * The window's time is interpolated at both ends, so a 5 km best is the time to
 * cover exactly 5 km rather than the time to reach whichever sample first passed
 * it. Rungs longer than the effort return nothing — no rounding up, no
 * extrapolation, ever.
 *
 * Returned as `best` laps so they store in the same table as real laps and a
 * personal record becomes one indexed query.
 */
export function bestEffortsFromDistance(stream: SessionStream, rungsKm: number[]): SessionLap[] {
  if (stream.kind !== "distance") return [];
  const { offsets, values } = stream;
  const n = offsets.length;
  if (n < 2) return [];
  const total = values[n - 1]! - values[0]!;
  const out: SessionLap[] = [];
  let index = 0;

  for (const km of [...rungsKm].sort((a, b) => a - b)) {
    if (!(km > 0) || km > total + 1e-9) continue;
    let bestSec = Infinity;
    let bestStart = 0;
    let j = 0;
    for (let i = 0; i < n; i++) {
      if (j < i) j = i;
      while (j < n && values[j]! - values[i]! < km) j++;
      if (j >= n) break;
      // Both ends interpolated: the window starts where the athlete was at
      // sample i and ends the instant they had covered exactly `km` more, which
      // is somewhere between samples j−1 and j.
      const target = values[i]! + km;
      const prev = j > 0 ? j - 1 : 0;
      const dv = values[j]! - values[prev]!;
      const endT =
        dv > 0
          ? offsets[prev]! + ((offsets[j]! - offsets[prev]!) * (target - values[prev]!)) / dv
          : offsets[j]!;
      const sec = endT - offsets[i]!;
      if (sec > 0 && sec < bestSec) {
        bestSec = sec;
        bestStart = offsets[i]!;
      }
    }
    if (Number.isFinite(bestSec))
      out.push(lap("best", index++, Math.round(bestStart), Math.round(bestSec * 10) / 10, km));
  }
  return out;
}

/**
 * Attach heart-rate and power figures to laps that have none, by reading the
 * other streams over each lap's window. The device reports these per-lap for
 * real laps; a derived split or best effort has to be measured from the series.
 */
export function enrichLaps(laps: SessionLap[], streams: SessionStream[]): SessionLap[] {
  const hr = streams.find((s) => s.kind === "hr");
  const power = streams.find((s) => s.kind === "power");
  const alt = streams.find((s) => s.kind === "altitude");
  if (!hr && !power && !alt) return laps;
  return laps.map((l) => {
    const from = l.startOffsetSec;
    const to = from + l.durationSec;
    const window = (s: SessionStream | undefined): number[] =>
      s ? s.values.filter((_, i) => s.offsets[i]! >= from && s.offsets[i]! <= to) : [];
    const hrs = l.avgHr == null ? window(hr) : [];
    const watts = l.avgWatts == null ? window(power) : [];
    const alts = l.elevationM == null ? window(alt) : [];
    let climb = 0;
    for (let i = 1; i < alts.length; i++) {
      const d = alts[i]! - alts[i - 1]!;
      if (d > 0) climb += d;
    }
    return {
      ...l,
      avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : l.avgHr,
      maxHr: hrs.length ? Math.round(Math.max(...hrs)) : l.maxHr,
      avgWatts: watts.length ? Math.round(watts.reduce((a, b) => a + b, 0) / watts.length) : l.avgWatts,
      elevationM: alts.length ? Math.round(climb) : l.elevationM,
    };
  });
}

/** How many laps one recording may store. Real laps are tens; the cap is a
 *  guard against a malformed client, not a product limit. */
export const MAX_LAPS = 500;

/** Coerce arbitrary input into clean laps. Malformed entries are dropped
 *  individually — one bad lap must not cost the athlete the other forty. */
export function sanitizeSessionLaps(input: unknown): SessionLap[] {
  if (!Array.isArray(input)) return [];
  const kinds: LapKind[] = ["lap", "split", "segment", "best"];
  const out: SessionLap[] = [];
  const seen = new Set<string>();
  for (const raw of input.slice(0, MAX_LAPS * 2)) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    const kind = kinds.find((k) => k === o.kind);
    const index = fin(o.index);
    const start = fin(o.startOffsetSec);
    const duration = fin(o.durationSec);
    if (!kind || index == null || start == null || duration == null) continue;
    if (index < 0 || start < 0 || start > MAX_STREAM_SEC) continue;
    if (!(duration > 0) || duration > MAX_STREAM_SEC) continue;
    const key = `${kind}:${Math.round(index)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const distanceKm = fin(o.distanceKm);
    const dist = distanceKm != null && distanceKm > 0 && distanceKm <= 1000 ? round(distanceKm, 4) : null;
    const bounded = (v: unknown, lo: number, hi: number): number | null => {
      const n = fin(v);
      return n != null && inRange(n, lo, hi) ? n : null;
    };
    out.push({
      kind,
      index: Math.round(index),
      startOffsetSec: Math.round(start),
      durationSec: round(duration, 1),
      distanceKm: dist,
      // ROUNDED: both are `Int` columns, and a fractional value does not
      // degrade there, it throws — taking the whole transaction with it, so a
      // recording would lose its streams over a decimal in one lap's heart rate.
      avgHr: intOrNull(bounded(o.avgHr, 20, 260)),
      maxHr: intOrNull(bounded(o.maxHr, 20, 260)),
      avgWatts: bounded(o.avgWatts, 0, 3000),
      elevationM: bounded(o.elevationM, 0, 10000),
      paceSecPerKm: dist != null ? round(duration / dist, 1) : null,
    });
    if (out.length >= MAX_LAPS) break;
  }
  return out;
}

/**
 * Everything one recording contributes beyond its summary: the streams, plus
 * every lap — the device's own, the splits derived from the distance series, and
 * the best efforts found inside it.
 *
 * ONE function so the API and both clients agree on what a recording turns into.
 * Splits and best efforts are DERIVED HERE and STORED, not computed on read: the
 * whole reason the distance series is worth keeping is that the questions it
 * answers become indexed rows.
 */
/**
 * WHAT TO DERIVE FOR AN ACTIVITY — the split interval and the record rungs,
 * both read from the sport CATALOG rather than from a table written here.
 *
 * That is not tidiness. A stored `best` lap only ever gets read by the record
 * ladder, and the ladder asks for the catalog's own rungs — so a rung derived
 * at any other distance is a row nothing will ever look at, and a catalog rung
 * with no row is a record that silently never fills. Reading `OlympicSport`
 * makes the two the same list by construction: add a rung to a sport and the
 * next upload derives it.
 *
 * The split follows the sport's own pace split (`pacePer`), so a pool splits at
 * 100 m, an erg at 500 m and the road at 1 km — the same unit each sport's
 * paces are already printed in.
 *
 * An unknown activity (a hand-typed name, a sport the catalog doesn't carry)
 * gets kilometre splits and NO rungs: splits are descriptive and always true,
 * while a rung is a claim about a benchmark distance, and inventing benchmark
 * distances is exactly what the catalog exists to prevent.
 */
export function lapDerivationFor(activityLabel: string | null | undefined): {
  splitKm: number;
  rungsKm: number[];
} {
  const sport = activityLabel ? olympicSport(activityLabel) : undefined;
  return {
    splitKm: sportPacePerMeters(sport?.name ?? "") / 1000,
    rungsKm: (sport?.records ?? []).map((r) => r.km),
  };
}

export function deriveSessionLaps(
  streams: SessionStream[],
  deviceLaps: SessionLap[],
  opts: { splitKm?: number; rungsKm?: number[] } = {},
): SessionLap[] {
  const distance = streams.find((s) => s.kind === "distance");
  const splits =
    distance && opts.splitKm && opts.splitKm > 0 ? splitsFromDistance(distance, opts.splitKm) : [];
  const bests =
    distance && opts.rungsKm?.length ? bestEffortsFromDistance(distance, opts.rungsKm) : [];
  // A DEVICE reports laps and segments; splits and bests are OURS to compute.
  // A caller that hands over rows of a derived kind is either confused or
  // hostile, and either way the two sets would collide on (kind, index) — which
  // downstream is a unique key, so the collision is a failed write for the whole
  // recording rather than one odd lap. Dropped here, at the one place that
  // knows which kinds are derived.
  const own = deviceLaps.filter((l) => l.kind === "lap" || l.kind === "segment");
  // ORDERED BY WHAT SURVIVES THE CAP, because the cap is not hypothetical: a
  // 600 km ride splits into 600 laps, and MAX_LAPS is 500. Appended last, the
  // BESTS were the rows truncated away — the only ones the record ladder reads,
  // and a handful per recording where splits are hundreds. So bests go first
  // (they can never fill the cap alone — there are at most as many as the sport
  // has rungs), the device's own laps next, and the splits take what is left.
  return enrichLaps([...bests, ...own, ...splits], streams).slice(0, MAX_LAPS);
}
