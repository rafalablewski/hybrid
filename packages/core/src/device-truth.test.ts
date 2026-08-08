import { describe, expect, it } from "vitest";
import { deviceTrueSession, deviceTrueSessions } from "./device-truth";
import { cardioPace, sessionCardioSummary, toTrainingLog } from "./engines/session";
import { runTotals, runningSessions, weeklyMileage } from "./engines/running";
import { newCardioPrsInSession } from "./engines/records";
import { sessionHeadline } from "./engines/history-views";
import type { DeviceWorkout, LoggedSession } from "./index";

const watch = (over: Partial<DeviceWorkout> = {}): DeviceWorkout => ({
  provider: "apple",
  uuid: "hk-1",
  activityLabel: "Running",
  start: "2026-07-29T10:00:00.000Z",
  end: "2026-07-29T10:55:00.000Z",
  durationMin: 55,
  kcal: 620,
  distanceKm: 10.42,
  source: "Apple Watch",
  ...over,
});

const run = (over: Partial<LoggedSession> = {}): LoggedSession => ({
  id: "s1",
  title: "Morning run",
  startedAt: "2026-07-29T10:00:00.000Z",
  completedAt: "2026-07-29T11:00:00.000Z",
  blocks: [{ kind: "cardio", name: "Running", discipline: "running", distance: 10, minutes: 50, elevation: 100 }],
  device: watch(),
  ...over,
});

describe("deviceTrueSession", () => {
  it("rewrites the single timed block to what the device measured", () => {
    const b = deviceTrueSession(run()).blocks[0]!;
    expect(b.kind === "cardio" && b.minutes).toBe(55);
    expect(b.kind === "cardio" && b.distance).toBe(10.42);
    expect(b.kind === "cardio" && b.elevation).toBe(100); // the recording had none
  });

  it("carries the measured clock to the second, so a derived pace matches the watch", () => {
    const swim = run({
      blocks: [{ kind: "cardio", name: "Swimming", discipline: "swimming", distance: 0.5, minutes: 20 }],
      device: watch({ activityLabel: "Swimming", durationMin: 20, durationSec: 1181, distanceKm: 0.51 }),
    });
    const b = deviceTrueSession(swim).blocks[0]!;
    expect(b.kind === "cardio" && b.minutes).toBe(20);
    expect(b.kind === "cardio" && b.seconds).toBe(1181);
    // 510 m in 19:41 → 3:52 /100m. Off whole minutes it would read 3:55.
    expect(cardioPace(b as { name: string; distance?: number; minutes?: number; seconds?: number })).toBe("3:52 /100m");
  });

  it("leaves the block without seconds when the recording had none", () => {
    const b = deviceTrueSession(run()).blocks[0]!;
    expect(b.kind === "cardio" && b.seconds).toBeUndefined();
  });

  it("takes the device's climb when it recorded one", () => {
    const s = run({ device: watch({ elevationM: 137 }) });
    const b = deviceTrueSession(s).blocks[0]!;
    expect(b.kind === "cardio" && b.elevation).toBe(137);
  });

  it("keeps everything subjective — RPE, name, discipline stay the athlete's", () => {
    const s = run({ blocks: [{ kind: "cardio", name: "Running", discipline: "running", distance: 10, minutes: 50, rpe: 8, zone: 3 }] });
    const b = deviceTrueSession(s).blocks[0]!;
    expect(b.kind === "cardio" && b.rpe).toBe(8);
    expect(b.kind === "cardio" && b.zone).toBe(3);
    expect(b.name).toBe("Running");
  });

  it("leaves strength blocks alone and returns the SAME object when there is nothing to project", () => {
    const unmatched = run({ device: null });
    expect(deviceTrueSession(unmatched)).toBe(unmatched);
    // a lift + one cardio effort: only the cardio block is the device's to speak for
    const mixed = run({
      blocks: [
        { kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }] },
        { kind: "cardio", name: "Running", discipline: "running", distance: 10, minutes: 50 },
      ],
    });
    const out = deviceTrueSession(mixed);
    expect(out.blocks[0]).toBe(mixed.blocks[0]);
    expect(out.blocks[1]!.kind === "cardio" && out.blocks[1]!.minutes).toBe(55);
  });

  it("refuses to split one recording across two efforts", () => {
    const two = run({
      blocks: [
        { kind: "cardio", name: "Running", discipline: "running", distance: 10, minutes: 50 },
        { kind: "cardio", name: "Rowing", discipline: "rowing", distance: 2, minutes: 10 },
      ],
    });
    expect(deviceTrueSession(two)).toBe(two);
  });

  it("is idempotent, and a whole unmatched history is returned untouched", () => {
    const once = deviceTrueSession(run());
    expect(deviceTrueSession(once)).toEqual(once);
    const plain = [run({ device: null }), run({ id: "s2", device: null })];
    expect(deviceTrueSessions(plain)).toBe(plain);
  });
});

describe("the engines read the measurement", () => {
  it("weekly mileage and totals count the measured distance", () => {
    const sessions = runningSessions([run()]);
    expect(runTotals(sessions).distanceKm).toBe(10.42);
    expect(runTotals(sessions).minutes).toBe(55);
    const wk = weeklyMileage(sessions, 1, Date.parse("2026-07-29T20:00:00.000Z"));
    expect(wk[0]!.km).toBe(10.42);
  });

  it("a PR is set by the measured distance, not the typed one", () => {
    const prior = [run({ id: "old", startedAt: "2026-07-01T10:00:00.000Z", device: null, blocks: [{ kind: "cardio", name: "Running", discipline: "running", distance: 10.2, minutes: 52 }] })];
    // typed 10 km would have LOST to the 10.2 km prior; measured 10.42 wins.
    const hits = newCardioPrsInSession(run(), prior);
    expect(hits[0]).toMatchObject({ move: "Running", kind: "distance", value: 10.42 });
  });

  it("the history row headlines the measured distance and minutes", () => {
    const h = sessionHeadline(run(), "kg");
    expect(h.kind).toBe("distance");
    expect(h.value).toBe("10.42");
    expect(h.minutes).toBe(55);
  });

  it("the fatigue/injury training log carries the measured minutes and distance", () => {
    const log = toTrainingLog([run()], Date.parse("2026-07-29T20:00:00.000Z"));
    expect(log[0]!.items[0]).toMatchObject({ move: "Running", minutes: 55, distance: 10.42 });
  });

  it("session cardio totals read the device", () => {
    expect(sessionCardioSummary(run())).toMatchObject({ distanceKm: 10.42, minutes: 55 });
  });

  it("session cardio totals derive pace from the measured seconds, not whole minutes", () => {
    // 1.36 km in 7:52 (472 s) → 347 s/km (5:47). Off the rounded 8 min it
    // would read 353 s/km (5:53) and disagree with the watch's own summary.
    const short = run({ device: watch({ durationMin: 8, durationSec: 472, distanceKm: 1.36 }) });
    expect(sessionCardioSummary(short)).toMatchObject({ minutes: 8, secPerKm: 347 });
  });
});
