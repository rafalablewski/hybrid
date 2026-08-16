import { describe, expect, it } from "vitest";
import {
  bestEffortsFromDistance,
  deriveSessionLaps,
  downsampleStream,
  lapDerivationFor,
  enrichLaps,
  hrZoneSeconds,
  sanitizeSessionLaps,
  sanitizeSessionStream,
  splitsFromDistance,
  streamSummary,
  MAX_LAPS,
  STREAM_MAX_SAMPLES,
  type SessionStream,
} from "./session-streams";

const stream = (over: Partial<SessionStream> = {}): SessionStream => ({
  kind: "hr",
  startedAt: "2026-08-01T09:00:00.000Z",
  offsets: [0, 1, 2],
  values: [120, 130, 140],
  provider: "apple",
  uuid: "hk-1",
  ...over,
});

/** A steady-pace distance series: `sec` samples at `paceSec` per km. */
const evenRun = (sec: number, paceSec: number): SessionStream =>
  stream({
    kind: "distance",
    offsets: Array.from({ length: sec + 1 }, (_, i) => i),
    values: Array.from({ length: sec + 1 }, (_, i) => i / paceSec),
  });

describe("sanitizeSessionStream", () => {
  it("accepts a well-formed stream", () => {
    const s = sanitizeSessionStream(stream());
    expect(s).not.toBeNull();
    expect(s!.kind).toBe("hr");
    expect(s!.values).toEqual([120, 130, 140]);
  });

  it("rejects an unknown kind, a bad anchor and mismatched arrays", () => {
    expect(sanitizeSessionStream({ ...stream(), kind: "temperature" })).toBeNull();
    expect(sanitizeSessionStream({ ...stream(), startedAt: "not a date" })).toBeNull();
    expect(sanitizeSessionStream({ ...stream(), values: [120, 130] })).toBeNull();
    expect(sanitizeSessionStream({ ...stream(), uuid: "" })).toBeNull();
    expect(sanitizeSessionStream(null)).toBeNull();
  });

  it("drops out-of-range samples instead of clamping them", () => {
    const s = sanitizeSessionStream(stream({ offsets: [0, 1, 2], values: [120, 500, 140] }));
    // 500 bpm is a stuck sensor. Clamping it to 260 would leave a plausible
    // number that poisons the average; dropping leaves a gap the derivations
    // already tolerate.
    expect(s!.values).toEqual([120, 140]);
    expect(s!.offsets).toEqual([0, 2]);
  });

  it("drops non-increasing offsets", () => {
    const s = sanitizeSessionStream(stream({ offsets: [0, 5, 5, 3, 9], values: [120, 125, 126, 127, 130] }));
    expect(s!.offsets).toEqual([0, 5, 9]);
  });

  it("drops a backwards fix in a CUMULATIVE distance series", () => {
    const s = sanitizeSessionStream(
      stream({ kind: "distance", offsets: [0, 10, 20, 30], values: [0, 1, 0.4, 2] }),
    );
    // Keeping the 0.4 would make one split negative and the next twice as fast.
    expect(s!.values).toEqual([0, 1, 2]);
  });

  it("needs latitude AND longitude for a route sample", () => {
    const ok = sanitizeSessionStream(
      stream({ kind: "route", offsets: [0, 1], values: [52.23, 52.24], valuesB: [21.01, 21.02] }),
    );
    expect(ok!.valuesB).toEqual([21.01, 21.02]);
    expect(sanitizeSessionStream(stream({ kind: "route", offsets: [0, 1], values: [52.23, 52.24] }))).toBeNull();
    expect(
      sanitizeSessionStream(stream({ kind: "route", offsets: [0, 1], values: [52.23, 52.24], valuesB: [21.01, 999] })),
    ).toBeNull(); // only one usable fix left — below the two-sample floor
  });

  it("rejects a stream with fewer than two usable samples", () => {
    expect(sanitizeSessionStream(stream({ offsets: [0], values: [120] }))).toBeNull();
  });

  it("caps a long recording by DOWNSAMPLING, never by truncating", () => {
    const n = 20000;
    const s = sanitizeSessionStream(
      stream({
        offsets: Array.from({ length: n }, (_, i) => i),
        values: Array.from({ length: n }, () => 150),
      }),
    );
    expect(s!.values).toHaveLength(STREAM_MAX_SAMPLES);
    // The span survives — a truncated stream would end at sample 3000 and turn
    // a 5.5-hour recording into a 50-minute one.
    expect(s!.offsets[s!.offsets.length - 1]).toBe(n - 1);
  });
});

describe("downsampleStream", () => {
  it("averages a RATE within each bucket", () => {
    const s = downsampleStream(
      stream({ offsets: [0, 1, 2, 3], values: [100, 200, 100, 200] }),
      2,
    );
    expect(s.values).toEqual([150, 150]);
  });

  it("takes the bucket's LAST sample for a cumulative series", () => {
    const s = downsampleStream(
      stream({ kind: "distance", offsets: [0, 1, 2, 3], values: [0, 1, 2, 3] }),
      2,
    );
    // Never an average: 0.5 km is a position the athlete was never at, at a
    // time they were not there.
    expect(s.values).toEqual([1, 3]);
  });

  it("keeps a route's longitudes paired with its latitudes", () => {
    const s = downsampleStream(
      stream({ kind: "route", offsets: [0, 1, 2, 3], values: [1, 2, 3, 4], valuesB: [10, 20, 30, 40] }),
      2,
    );
    expect(s.values).toEqual([2, 4]);
    expect(s.valuesB).toEqual([20, 40]);
  });

  it("is a no-op below the cap", () => {
    const s = stream();
    expect(downsampleStream(s, 100)).toBe(s);
  });
});

describe("streamSummary", () => {
  it("lifts min / max / avg / span out of a stream", () => {
    const s = streamSummary(stream({ offsets: [0, 30, 60], values: [120, 150, 180] }));
    expect(s).toEqual({ sampleCount: 3, durationSec: 60, min: 120, max: 180, avg: 150 });
  });

  it("reports no min/max/avg for a route", () => {
    const s = streamSummary(stream({ kind: "route", offsets: [0, 1], values: [52.2, 52.3], valuesB: [21, 21.1] }));
    expect(s.min).toBeNull();
    expect(s.avg).toBeNull();
    expect(s.sampleCount).toBe(2);
  });
});

describe("hrZoneSeconds", () => {
  it("buckets each sample by its share of max HR, weighted by its own gap", () => {
    // max 200 → Z1 100+, Z2 120+, Z3 140+, Z4 160+, Z5 180+
    const s = stream({ offsets: [0, 10, 20, 30], values: [110, 130, 150, 190] });
    const z = hrZoneSeconds(s, 200);
    expect(z).toEqual([10, 10, 10, 0, 10]);
  });

  it("ignores samples below zone 1", () => {
    const z = hrZoneSeconds(stream({ offsets: [0, 10], values: [80, 90] }), 200);
    expect(z).toEqual([0, 0, 0, 0, 0]);
  });

  it("returns zeros for a non-HR stream or an unknown max", () => {
    expect(hrZoneSeconds(stream({ kind: "power" }), 200)).toEqual([0, 0, 0, 0, 0]);
    expect(hrZoneSeconds(stream(), 0)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("splitsFromDistance", () => {
  it("splits a steady run into whole kilometres", () => {
    const laps = splitsFromDistance(evenRun(1500, 300), 1); // 5 km at 5:00/km
    expect(laps).toHaveLength(5);
    expect(laps.every((l) => Math.abs(l.durationSec - 300) < 1)).toBe(true);
    expect(laps.map((l) => l.index)).toEqual([0, 1, 2, 3, 4]);
    expect(laps[0]!.paceSecPerKm).toBeCloseTo(300, 0);
  });

  it("keeps the ragged tail at the distance actually covered", () => {
    const laps = splitsFromDistance(evenRun(2220, 300), 1); // 7.4 km
    expect(laps).toHaveLength(8);
    expect(laps[7]!.distanceKm).toBeCloseTo(0.4, 2);
    expect(laps[7]!.durationSec).toBeCloseTo(120, 0);
  });

  it("times the boundary by INTERPOLATION, not the nearest sample", () => {
    // A sample only every 30 s at 5:00/km — 100 m apart. Taking the nearest
    // sample could misplace a split by up to 30 s.
    const s = stream({
      kind: "distance",
      offsets: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
      values: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1],
    });
    const laps = splitsFromDistance(s, 1);
    expect(laps[0]!.durationSec).toBeCloseTo(300, 0);
  });

  it("returns nothing for a non-distance stream", () => {
    expect(splitsFromDistance(stream(), 1)).toEqual([]);
  });
});

describe("bestEffortsFromDistance — the thing a summary can never answer", () => {
  it("finds the fastest 5 km INSIDE a longer run", () => {
    // 8 km: the first 3 km at 6:00/km, then 5 km at 4:00/km.
    const offsets: number[] = [];
    const values: number[] = [];
    let t = 0;
    let km = 0;
    for (let i = 0; i < 3 * 360; i++) { offsets.push(t++); values.push((km += 1 / 360)); }
    for (let i = 0; i < 5 * 240; i++) { offsets.push(t++); values.push((km += 1 / 240)); }
    const best = bestEffortsFromDistance(stream({ kind: "distance", offsets, values }), [1, 5, 10]);
    expect(best.map((b) => b.distanceKm)).toEqual([1, 5]); // 10 km never happened
    expect(best.find((b) => b.distanceKm === 5)!.durationSec).toBeCloseTo(1200, 0);
    expect(best.find((b) => b.distanceKm === 1)!.durationSec).toBeCloseTo(240, 0);
    expect(best[0]!.kind).toBe("best");
  });

  it("never extrapolates past what was covered", () => {
    expect(bestEffortsFromDistance(evenRun(600, 300), [5, 10])).toEqual([]);
  });

  it("returns nothing for a non-distance stream", () => {
    expect(bestEffortsFromDistance(stream(), [1])).toEqual([]);
  });
});

describe("enrichLaps", () => {
  it("measures HR and climb over each lap's own window", () => {
    const hr = stream({ offsets: [0, 60, 120, 180], values: [140, 150, 170, 180] });
    const alt = stream({ kind: "altitude", offsets: [0, 60, 120, 180], values: [100, 120, 110, 140] });
    const [a, b] = enrichLaps(
      [
        { kind: "lap", index: 0, startOffsetSec: 0, durationSec: 60, distanceKm: 1, avgHr: null, maxHr: null, avgWatts: null, elevationM: null, paceSecPerKm: 60 },
        { kind: "lap", index: 1, startOffsetSec: 120, durationSec: 60, distanceKm: 1, avgHr: null, maxHr: null, avgWatts: null, elevationM: null, paceSecPerKm: 60 },
      ],
      [hr, alt],
    );
    expect(a!.avgHr).toBe(145);
    expect(a!.maxHr).toBe(150);
    expect(a!.elevationM).toBe(20);
    expect(b!.avgHr).toBe(175);
    expect(b!.elevationM).toBe(30); // only the ASCENT counts
  });

  it("leaves a figure the device already reported alone", () => {
    const hr = stream({ offsets: [0, 60], values: [140, 150] });
    const [only] = enrichLaps(
      [{ kind: "lap", index: 0, startOffsetSec: 0, durationSec: 60, distanceKm: 1, avgHr: 133, maxHr: 155, avgWatts: null, elevationM: null, paceSecPerKm: 60 }],
      [hr],
    );
    expect(only!.avgHr).toBe(133);
  });
});

describe("sanitizeSessionLaps", () => {
  it("keeps the good laps and drops the bad ones", () => {
    const laps = sanitizeSessionLaps([
      { kind: "lap", index: 0, startOffsetSec: 0, durationSec: 300, distanceKm: 1, avgHr: 150 },
      { kind: "nonsense", index: 1, startOffsetSec: 300, durationSec: 300 },
      { kind: "lap", index: 2, startOffsetSec: 600, durationSec: 0 },
      { kind: "lap", index: 3, startOffsetSec: 900, durationSec: 300, distanceKm: 1, avgHr: 900 },
    ]);
    expect(laps.map((l) => l.index)).toEqual([0, 3]);
    expect(laps[0]!.paceSecPerKm).toBe(300);
    expect(laps[1]!.avgHr).toBeNull(); // 900 bpm is not a heart rate
  });

  it("ROUNDS the heart rates, which are integer columns", () => {
    // A fractional bpm does not degrade in an Int column, it throws — and the
    // write is one transaction, so the whole recording loses its streams too.
    const [lap] = sanitizeSessionLaps([
      { kind: "lap", index: 0, startOffsetSec: 0, durationSec: 300, avgHr: 152.7, maxHr: 170.2 },
    ]);
    expect(lap!.avgHr).toBe(153);
    expect(lap!.maxHr).toBe(170);
  });

  it("de-duplicates on (kind, index)", () => {
    const laps = sanitizeSessionLaps([
      { kind: "lap", index: 0, startOffsetSec: 0, durationSec: 300 },
      { kind: "lap", index: 0, startOffsetSec: 300, durationSec: 300 },
      { kind: "split", index: 0, startOffsetSec: 0, durationSec: 300 },
    ]);
    expect(laps).toHaveLength(2);
  });

  it("is empty for junk", () => {
    expect(sanitizeSessionLaps(null)).toEqual([]);
    expect(sanitizeSessionLaps(["nope"])).toEqual([]);
  });
});

describe("lapDerivationFor — the rungs come from the CATALOG", () => {
  it("splits at the sport's own pace split", () => {
    expect(lapDerivationFor("Running").splitKm).toBe(1);
    expect(lapDerivationFor("Swimming").splitKm).toBe(0.1);
    expect(lapDerivationFor("Rowing").splitKm).toBe(0.5);
  });

  it("derives exactly the rungs the record ladder asks for", () => {
    // Not a hand-written table: these ARE OlympicSport.records, so a rung added
    // to a sport is derived on the next upload rather than silently never
    // filling.
    expect(lapDerivationFor("Running").rungsKm).toEqual([1, 5, 10, 21.0975, 42.195]);
    expect(lapDerivationFor("Swimming").rungsKm).toEqual([0.1, 0.4, 1.5]);
    expect(lapDerivationFor("Cycling").rungsKm).toEqual([10, 40, 100]);
  });

  it("derives NO rungs for a sport the catalog gives none, or an unknown name", () => {
    // Mountain Biking deliberately has no conventional distance; a hand-typed
    // activity has no catalog entry at all. Splits stay (always true), rungs do
    // not (a benchmark distance would be invented).
    expect(lapDerivationFor("Mountain Biking").rungsKm).toEqual([]);
    expect(lapDerivationFor("Backyard Sprints").rungsKm).toEqual([]);
    expect(lapDerivationFor(null).rungsKm).toEqual([]);
    expect(lapDerivationFor("Backyard Sprints").splitKm).toBe(1);
  });
});

describe("deriveSessionLaps", () => {
  it("keeps the device's laps and adds the derived splits and bests", () => {
    const distance = evenRun(1500, 300); // 5 km at 5:00/km
    const hr = stream({
      offsets: Array.from({ length: 1501 }, (_, i) => i),
      values: Array.from({ length: 1501 }, () => 160),
    });
    const laps = deriveSessionLaps(
      [distance, hr],
      [{ kind: "lap", index: 0, startOffsetSec: 0, durationSec: 1500, distanceKm: 5, avgHr: null, maxHr: null, avgWatts: null, elevationM: null, paceSecPerKm: 300 }],
      { splitKm: 1, rungsKm: [1, 5] },
    );
    expect(laps.filter((l) => l.kind === "lap")).toHaveLength(1);
    expect(laps.filter((l) => l.kind === "split")).toHaveLength(5);
    expect(laps.filter((l) => l.kind === "best")).toHaveLength(2);
    // The derived rows get their HR from the series, since nothing reported one.
    expect(laps.every((l) => l.avgHr === 160)).toBe(true);
  });

  it("drops caller-supplied rows of a kind IT derives", () => {
    const distance = evenRun(600, 300); // 2 km
    const laps = deriveSessionLaps(
      [distance],
      [
        { kind: "split", index: 0, startOffsetSec: 0, durationSec: 111, distanceKm: 1, avgHr: null, maxHr: null, avgWatts: null, elevationM: null, paceSecPerKm: 111 },
        { kind: "lap", index: 0, startOffsetSec: 0, durationSec: 600, distanceKm: 2, avgHr: null, maxHr: null, avgWatts: null, elevationM: null, paceSecPerKm: 300 },
      ],
      { splitKm: 1 },
    );
    // The supplied "split" would have collided with a derived one on
    // (kind, index) — a unique key downstream, so the collision would fail the
    // write for the whole recording, not just that row.
    expect(laps.filter((l) => l.kind === "split")).toHaveLength(2);
    expect(laps.filter((l) => l.kind === "split").every((l) => l.durationSec !== 111)).toBe(true);
    expect(laps.filter((l) => l.kind === "lap")).toHaveLength(1);
  });

  it("keeps the BESTS when the splits overflow the cap", () => {
    // A 600 km ride splits into 600 laps and MAX_LAPS is 500. Appended last,
    // the bests — the only rows the record ladder reads — were the ones
    // truncated away, so the longest rides produced no records at all.
    const sec = 600 * 60;
    const long = stream({
      kind: "distance",
      offsets: Array.from({ length: 3000 }, (_, i) => Math.round((i * sec) / 2999)),
      values: Array.from({ length: 3000 }, (_, i) => (i * 600) / 2999),
    });
    const laps = deriveSessionLaps([long], [], { splitKm: 1, rungsKm: [1, 5, 10, 21.0975, 42.195] });
    expect(laps.length).toBeLessThanOrEqual(MAX_LAPS);
    expect(laps.filter((l) => l.kind === "best")).toHaveLength(5);
  });

  it("derives nothing without a distance series", () => {
    expect(deriveSessionLaps([stream()], [], { splitKm: 1, rungsKm: [5] })).toEqual([]);
  });
});
