import { describe, it, expect } from "vitest";
import {
  enduranceLanes,
  orderLanes,
  nextLaneOrder,
  zonePercents,
  paceDelta,
  formatPaceDelta,
  paceDeltaArrow,
  paceTrendPoints,
  volumeBars,
  LANE_ORDERS,
  LANE_CAP,
} from "./endurance-lanes";
import type { LoggedSession } from "./engines/session";

const NOW = Date.parse("2026-07-31T12:00:00.000Z");
const DAY = 86_400_000;

/** A session holding one cardio effort, `daysAgo` before NOW. */
function effort(
  id: string,
  name: string,
  discipline: "running" | "cycling" | "swimming" | "walking",
  daysAgo: number,
  distance: number,
  minutes: number,
): LoggedSession {
  return {
    id,
    title: name,
    startedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    blocks: [{ kind: "cardio", name, discipline, distance, minutes }],
  } as LoggedSession;
}

/* A small but realistic hybrid week-set: runs are the most frequent, the bike
   carries the most distance, and one swim is the most recent thing logged. */
const SESSIONS: LoggedSession[] = [
  effort("r1", "Easy run", "running", 2, 8, 46),
  effort("r2", "Long run", "running", 9, 18, 108),
  effort("r3", "Tempo run", "running", 16, 5, 22),
  effort("b1", "Zone 2", "cycling", 4, 42, 84),
  effort("b2", "Hill repeats", "cycling", 11, 24, 60),
  effort("s1", "Threshold 100s", "swimming", 1, 1.8, 30),
];

describe("enduranceLanes", () => {
  it("gives every logged discipline a lane, most trained first", () => {
    const lanes = enduranceLanes(SESSIONS, { now: NOW });
    expect(lanes.map((l) => l.discipline)).toEqual(["running", "cycling", "swimming"]);
    expect(lanes[0]!.efforts).toBe(3);
    expect(lanes[0]!.distanceKm).toBe(31);
  });

  it("never invents a lane for a discipline with no efforts", () => {
    const lanes = enduranceLanes(SESSIONS, { now: NOW });
    expect(lanes.some((l) => l.discipline === "rowing")).toBe(false);
    expect(enduranceLanes([], { now: NOW })).toEqual([]);
  });

  it("excludes non-endurance sport, matching the hub", () => {
    const tennis = {
      id: "t1",
      title: "Tennis",
      startedAt: new Date(NOW - DAY).toISOString(),
      blocks: [{ kind: "cardio", name: "Tennis", discipline: "sport", minutes: 60 }],
    } as LoggedSession;
    expect(enduranceLanes([tennis], { now: NOW })).toEqual([]);
  });

  it("carries eight week buckets and lifts out the newest", () => {
    const [run] = enduranceLanes(SESSIONS, { now: NOW });
    expect(run!.weeks).toHaveLength(8);
    expect(run!.thisWeek).toBe(run!.weeks[7]);
    // the 8 km run two days ago is the only effort inside the current week
    expect(run!.thisWeek.km).toBe(8);
    expect(run!.thisWeek.efforts).toBe(1);
  });

  it("reads the pace trend off the SAME buckets as the volume bars", () => {
    const [run] = enduranceLanes(SESSIONS, { now: NOW });
    // three paced weeks → three trend points; 8 km in 46 min = 345 s/km
    expect(run!.paceTrend).toHaveLength(3);
    expect(Math.round(run!.paceTrend[2]!)).toBe(345);
  });

  it("picks the most recent effort as the lane's last card", () => {
    const [run] = enduranceLanes(SESSIONS, { now: NOW });
    expect(run!.last?.name).toBe("Easy run");
    expect(run!.last?.sessionId).toBe("r1");
    expect(run!.last?.secPerKm).toBe(345);
  });

  it("leaves secPerKm null for an unpaced effort", () => {
    const timed = {
      id: "x1",
      title: "Treadmill",
      startedAt: new Date(NOW - DAY).toISOString(),
      blocks: [{ kind: "cardio", name: "Treadmill", discipline: "running", minutes: 30 }],
    } as LoggedSession;
    const [lane] = enduranceLanes([timed], { now: NOW });
    expect(lane!.last?.secPerKm).toBeNull();
    expect(lane!.paceTrend).toEqual([]);
  });
});

describe("orderLanes", () => {
  const lanes = enduranceLanes(SESSIONS, { now: NOW });

  it("stacks most trained by efforts, then distance", () => {
    expect(orderLanes(lanes, "trained").map((l) => l.discipline)).toEqual(["running", "cycling", "swimming"]);
  });

  it("stacks most recent by the last logged effort", () => {
    expect(orderLanes(lanes, "recent").map((l) => l.discipline)).toEqual(["swimming", "running", "cycling"]);
  });

  it("stacks longest by total distance", () => {
    expect(orderLanes(lanes, "longest").map((l) => l.discipline)).toEqual(["cycling", "running", "swimming"]);
  });

  it("does not mutate the input", () => {
    const before = lanes.map((l) => l.discipline);
    orderLanes(lanes, "longest");
    expect(lanes.map((l) => l.discipline)).toEqual(before);
  });

  it("cycles back to where it started", () => {
    let o = LANE_ORDERS[0]!;
    for (let i = 0; i < LANE_ORDERS.length; i++) o = nextLaneOrder(o);
    expect(o).toBe(LANE_ORDERS[0]);
  });

  it("caps at three lanes before the expander", () => {
    expect(LANE_CAP).toBe(3);
  });
});

describe("zonePercents", () => {
  it("always sums to 100", () => {
    for (const z of [
      { easy: 1, moderate: 1, hard: 1 },
      { easy: 10, moderate: 20, hard: 3 },
      { easy: 7, moderate: 0, hard: 0 },
      { easy: 100, moderate: 33, hard: 67 },
    ]) {
      const p = zonePercents(z);
      expect(p.easy + p.moderate + p.hard).toBe(100);
    }
  });

  it("reads 100/0/0 when every minute is easy", () => {
    expect(zonePercents({ easy: 90, moderate: 0, hard: 0 })).toEqual({ easy: 100, moderate: 0, hard: 0, any: true });
  });

  it("flags nothing paced", () => {
    expect(zonePercents({ easy: 0, moderate: 0, hard: 0 }).any).toBe(false);
  });
});

describe("paceDelta", () => {
  it("calls a falling seconds-per-km faster, on any discipline", () => {
    expect(paceDelta([360, 350, 340])).toEqual({ secPerKm: 20, faster: true, fromSecPerKm: 360, toSecPerKm: 340 });
  });

  it("calls a rising seconds-per-km slower", () => {
    expect(paceDelta([300, 320])).toEqual({ secPerKm: -20, faster: false, fromSecPerKm: 300, toSecPerKm: 320 });
  });

  it("needs two points", () => {
    expect(paceDelta([300])).toBeNull();
    expect(paceDelta([])).toBeNull();
  });
});

describe("formatPaceDelta", () => {
  it("scales the delta into the discipline's own split", () => {
    // 20 s/km faster is 2 s/100m to a swimmer — showing them 20 would be wrong.
    expect(formatPaceDelta(paceDelta([360, 340])!, "running")).toBe("20s/km");
    expect(formatPaceDelta(paceDelta([1000, 980])!, "swimming")).toBe("2s/100m");
    expect(formatPaceDelta(paceDelta([240, 220])!, "rowing")).toBe("10s/500m");
  });

  it("reads a bike as a change in speed, not in seconds", () => {
    // 120 s/km = 30 km/h → 115.2 s/km = 31.25 km/h
    expect(formatPaceDelta(paceDelta([120, 115.2])!, "cycling")).toBe("1.3 km/h");
  });

  it("reports magnitude only — direction is the caller's arrow", () => {
    expect(formatPaceDelta(paceDelta([340, 360])!, "running")).toBe("20s/km");
    expect(formatPaceDelta(paceDelta([115.2, 120])!, "cycling")).toBe("1.3 km/h");
  });
});

describe("paceDeltaArrow", () => {
  it("points the way the DISPLAYED number moved, not the stored one", () => {
    const quicker = paceDelta([360, 340])!;
    const slower = paceDelta([340, 360])!;
    // a pace FALLS as you get quicker …
    expect(paceDeltaArrow(quicker, "running")).toBe("↓");
    expect(paceDeltaArrow(slower, "running")).toBe("↑");
    // … but a speed RISES, off the very same fall in seconds-per-km.
    expect(paceDeltaArrow(quicker, "cycling")).toBe("↑");
    expect(paceDeltaArrow(slower, "cycling")).toBe("↓");
  });

  it("leaves the faster/slower judgement itself untouched", () => {
    const quicker = paceDelta([360, 340])!;
    expect(quicker.faster).toBe(true); // colour keys off this, the arrow does not
  });
});

describe("paceTrendPoints", () => {
  it("puts the fastest week at the top", () => {
    const pts = paceTrendPoints([360, 300, 330]);
    expect(pts[1]).toBe(0); // fastest → top
    expect(pts[0]).toBe(1); // slowest → bottom
    expect(pts[2]).toBeCloseTo(0.5, 5);
  });

  it("rests a flat series on the midline", () => {
    expect(paceTrendPoints([300, 300, 300])).toEqual([0.5, 0.5, 0.5]);
  });

  it("handles an empty series", () => {
    expect(paceTrendPoints([])).toEqual([]);
  });
});

describe("volumeBars", () => {
  it("scales against the lane's own best week", () => {
    const bars = volumeBars([
      { weekStart: "", km: 10, minutes: 60, efforts: 1 },
      { weekStart: "", km: 20, minutes: 120, efforts: 2 },
    ]);
    expect(bars).toEqual([0.5, 1]);
  });

  it("is all-zero when nothing has distance", () => {
    expect(volumeBars([{ weekStart: "", km: 0, minutes: 30, efforts: 1 }])).toEqual([0]);
  });
});
