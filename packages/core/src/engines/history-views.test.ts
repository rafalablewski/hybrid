import { describe, it, expect } from "vitest";
import { weekChapters, sessionHeadline } from "./history-views";
import type { LoggedSession } from "./session";

// 2026-07-16 (Thu) noon LOCAL — the fixed "now" for every test. All fixture
// timestamps are LOCAL-constructed so the day-grouping expectations hold in
// any timezone the tests run in (day keys are local calendar days).
const NOW = new Date(2026, 6, 16, 12).getTime();
const at = (day: number, hour: number) => new Date(2026, 6, day, hour).toISOString(); // July 2026, local time

const lift = (id: string, iso: string, title = "Lower", load = "100"): LoggedSession => ({
  id, title, startedAt: iso,
  blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load, reps: "5", rpe: "8" }, { load, reps: "5", rpe: "8" }] }],
});
const run = (id: string, iso: string, title = "Morning run"): LoggedSession => ({
  id, title, startedAt: iso,
  blocks: [{ kind: "cardio", name: "Run", minutes: 30, rpe: 6, distance: 5 }],
});

const FIXTURE: LoggedSession[] = [
  run("t1", at(16, 8), "Tennis"), // Thu (today)
  lift("d2", at(13, 18), "Soviet 8-Week Peaking – Week 2, Day 2", "120"), // Mon
  lift("d1", at(13, 8), "Soviet 8-Week Peaking – Week 2, Day 1", "110"),
  lift("aft", at(13, 20), "Afternoon workout", "60"),
  lift("w1", at(9, 8), "Soviet 8-Week Peaking – Week 1, Day 5", "100"), // prev Thu
  run("r1", at(9, 18)),
];

describe("weekChapters", () => {
  const weeks = weekChapters(FIXTURE, { now: NOW });

  it("groups Mon–Sun weeks newest-first and marks the current one", () => {
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ startKey: "2026-07-13", endKey: "2026-07-19", isCurrent: true });
    expect(weeks[1]).toMatchObject({ startKey: "2026-07-06", isCurrent: false });
  });

  it("builds 7 sparkline days with discipline flags + totals", () => {
    const w = weeks[0]!;
    expect(w.days).toHaveLength(7);
    expect(w.days[0]).toMatchObject({ dateKey: "2026-07-13", hasStrength: true, hasCardio: false });
    expect(w.days[0]!.load).toBeGreaterThan(0);
    expect(w.days[1]!.load).toBe(0); // Tue rest
    expect(w.days[3]).toMatchObject({ dateKey: "2026-07-16", hasCardio: true, hasStrength: false });
    expect(w.totals.sessions).toBe(4);
    expect(w.sessions[0]!.id).toBe("t1"); // newest first
  });

  it("uses the injected prs lookup instead of re-detecting", () => {
    const w2 = weekChapters(FIXTURE, { now: NOW, prs: () => 1 });
    expect(w2[0]!.totals.prs).toBe(w2[0]!.totals.sessions);
  });
});

describe("sessionHeadline", () => {
  it("lifting leads with tonnage and a lift count, never a pace", () => {
    // 2 sets × 100 kg × 5 reps = 1000 kg = 1.0 t
    const h = sessionHeadline(lift("x", at(13, 8)), "kg");
    expect(h).toMatchObject({ kind: "tonnage", value: "1.0", unit: "t", accent: "strength", lifts: 1, pace: null });
  });

  it("lb units format the same volume in pounds", () => {
    const h = sessionHeadline(lift("x", at(13, 8)), "lb");
    expect(h.kind).toBe("tonnage");
    expect(h.unit).toBe("lb");
    expect(Number(h.value.replace(/,/g, ""))).toBeGreaterThan(2000); // 1000 kg ≈ 2205 lb
  });

  it("distance cardio leads with the distance; pace + minutes stay meta", () => {
    const h = sessionHeadline(run("x", at(16, 8)), "kg"); // 5 km in 30 min
    expect(h).toMatchObject({ kind: "distance", value: "5", unit: "km", accent: "cardio", minutes: 30, lifts: 0 });
    expect(h.pace).toBe("6:00 /km");
  });

  it("metre sports (swimming) render in metres with a split pace", () => {
    const swim: LoggedSession = {
      id: "sw", title: "Swimming", startedAt: at(16, 7),
      blocks: [{ kind: "cardio", name: "Swimming", minutes: 31, distance: 0.612 }],
    };
    const h = sessionHeadline(swim, "kg");
    expect(h.value).toBe("612");
    expect(h.unit).toBe("m");
    expect(h.pace).toBe("5:04 /100m");
  });

  it("a timed sport leads with minutes — kind flags the meta copy as forbidden", () => {
    const tennis: LoggedSession = {
      id: "tn", title: "Tennis", startedAt: at(16, 9),
      blocks: [{ kind: "cardio", name: "Tennis", minutes: 75 }],
    };
    const h = sessionHeadline(tennis, "kg");
    expect(h).toMatchObject({ kind: "minutes", value: "75", unit: "min", accent: "cardio", minutes: 75 });
  });

  it("mixed sessions lead with tonnage and keep cardio minutes for the meta line", () => {
    const mixed: LoggedSession = {
      id: "mx", title: "Hybrid day", startedAt: at(16, 11),
      blocks: [
        { kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5", rpe: "8" }] },
        { kind: "cardio", name: "Run", minutes: 20, distance: 4 },
      ],
    };
    const h = sessionHeadline(mixed, "kg");
    expect(h).toMatchObject({ kind: "tonnage", value: "0.5", accent: "strength", lifts: 1, minutes: 20, pace: null });
  });

  it("multi-block distance days sum km and drop the pace (a summed pace would lie)", () => {
    const brick: LoggedSession = {
      id: "br", title: "Brick", startedAt: at(16, 12),
      blocks: [
        { kind: "cardio", name: "Cycling", minutes: 40, distance: 20 },
        { kind: "cardio", name: "Running", minutes: 15, distance: 3.05 },
      ],
    };
    const h = sessionHeadline(brick, "kg");
    expect(h).toMatchObject({ kind: "distance", value: "23.05", unit: "km", pace: null, minutes: 55 });
  });

  it("falls back to the block count when a session carries no metric at all", () => {
    const bare: LoggedSession = {
      id: "bb", title: "Walk", startedAt: at(16, 13),
      blocks: [{ kind: "cardio", name: "Walking" }],
    };
    const h = sessionHeadline(bare, "kg");
    expect(h).toMatchObject({ kind: "blocks", value: "1", unit: "" });
  });
});
