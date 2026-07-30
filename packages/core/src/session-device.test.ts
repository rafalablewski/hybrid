import { describe, expect, it } from "vitest";
import {
  deviceComparisonRows,
  deviceMatchScore,
  deviceSourceLabel,
  isDeviceName,
  rankDeviceWorkouts,
  sanitizeDeviceWorkout,
  type DeviceWorkout,
} from "./session-device";

const watchTennis: DeviceWorkout = {
  provider: "apple",
  uuid: "hk-1",
  activityLabel: "Tennis",
  start: "2026-07-29T10:00:00.000Z",
  end: "2026-07-29T11:00:00.000Z",
  durationMin: 60,
  kcal: 540,
  avgHr: 132,
  maxHr: 171,
  source: "Apple Watch",
};

describe("sanitizeDeviceWorkout", () => {
  it("accepts a clean workout and rounds its numbers", () => {
    const out = sanitizeDeviceWorkout({ ...watchTennis, kcal: 540.6, distanceKm: 2.4567, avgHr: 132.4 });
    expect(out).not.toBeNull();
    expect(out!.kcal).toBe(541);
    expect(out!.distanceKm).toBe(2.46);
    expect(out!.avgHr).toBe(132);
    expect(out!.provider).toBe("apple");
  });

  it("rejects non-objects and rows missing the essentials", () => {
    expect(sanitizeDeviceWorkout(null)).toBeNull();
    expect(sanitizeDeviceWorkout("x")).toBeNull();
    expect(sanitizeDeviceWorkout({ ...watchTennis, uuid: "" })).toBeNull();
    expect(sanitizeDeviceWorkout({ ...watchTennis, activityLabel: "  " })).toBeNull();
    expect(sanitizeDeviceWorkout({ ...watchTennis, start: "not a date" })).toBeNull();
    expect(sanitizeDeviceWorkout({ ...watchTennis, durationMin: 0 })).toBeNull();
  });

  it("rejects an interval that ends before it starts", () => {
    expect(sanitizeDeviceWorkout({ ...watchTennis, start: watchTennis.end, end: watchTennis.start })).toBeNull();
  });

  it("drops out-of-bounds optionals instead of failing the whole row", () => {
    const out = sanitizeDeviceWorkout({ ...watchTennis, kcal: 999999, maxHr: 400, steps: -5, avgMets: 99 });
    expect(out).not.toBeNull();
    expect(out!.kcal).toBeUndefined();
    expect(out!.maxHr).toBeUndefined();
    expect(out!.steps).toBeUndefined();
    expect(out!.avgMets).toBeUndefined();
    expect(out!.avgHr).toBe(132);
  });

  it("carries the extended device read through", () => {
    const out = sanitizeDeviceWorkout({
      ...watchTennis,
      minHr: 78.6, steps: 4812.4, elevationM: 12.7, strokes: 240, flights: 3,
      avgMets: 7.24, indoor: false, tempC: 24.36,
    });
    expect(out).toMatchObject({ minHr: 79, steps: 4812, elevationM: 13, strokes: 240, flights: 3, avgMets: 7.2, indoor: false, tempC: 24.4 });
  });

  it("normalises timestamps to ISO and caps label length", () => {
    const out = sanitizeDeviceWorkout({ ...watchTennis, start: "2026-07-29T10:00:00+02:00", activityLabel: "x".repeat(200) });
    expect(out!.start).toBe("2026-07-29T08:00:00.000Z");
    expect(out!.activityLabel).toHaveLength(60);
  });
});

describe("deviceMatchScore", () => {
  // The quick-sport shape: startedAt == completedAt == the moment it was logged.
  const loggedAfter = { startedAt: "2026-07-29T12:30:00.000Z", completedAt: "2026-07-29T12:30:00.000Z", durationMin: 60 };

  it("gives an overlapping workout the top time score", () => {
    const during = { startedAt: "2026-07-29T10:20:00.000Z", completedAt: "2026-07-29T10:50:00.000Z", durationMin: 30 };
    expect(deviceMatchScore(during, watchTennis)).toBeGreaterThan(0.8);
  });

  it("still scores a workout logged hours after the fact", () => {
    const s = deviceMatchScore(loggedAfter, watchTennis);
    expect(s).toBeGreaterThan(0.4);
  });

  it("prefers the similar-duration workout over the short one at equal distance in time", () => {
    const walk: DeviceWorkout = { ...watchTennis, uuid: "hk-2", activityLabel: "Walking", start: "2026-07-29T13:59:00.000Z", end: "2026-07-29T14:09:00.000Z", durationMin: 10 };
    const tennisScore = deviceMatchScore(loggedAfter, watchTennis);
    const walkScore = deviceMatchScore(loggedAfter, walk);
    expect(tennisScore).toBeGreaterThan(walkScore);
  });

  it("zeroes anything beyond the search window", () => {
    const lastWeek = { ...watchTennis, start: "2026-07-20T10:00:00.000Z", end: "2026-07-20T11:00:00.000Z" };
    expect(deviceMatchScore(loggedAfter, lastWeek)).toBe(0);
  });
});

describe("rankDeviceWorkouts", () => {
  it("sorts best first and drops zero scores", () => {
    const session = { startedAt: "2026-07-29T12:30:00.000Z", completedAt: "2026-07-29T12:30:00.000Z", durationMin: 60 };
    const walk: DeviceWorkout = { ...watchTennis, uuid: "hk-2", activityLabel: "Walking", start: "2026-07-29T08:00:00.000Z", end: "2026-07-29T08:10:00.000Z", durationMin: 10 };
    const stale: DeviceWorkout = { ...watchTennis, uuid: "hk-3", start: "2026-07-01T10:00:00.000Z", end: "2026-07-01T11:00:00.000Z" };
    const ranked = rankDeviceWorkouts(session, [walk, stale, watchTennis]);
    expect(ranked.map((r) => r.workout.uuid)).toEqual(["hk-1", "hk-2"]);
  });
});

describe("deviceComparisonRows", () => {
  it("pairs the app estimate with the device measurement", () => {
    const rows = deviceComparisonRows({ device: watchTennis, durationMin: 60, estimatedKcal: 495 });
    const kcal = rows.find((r) => r.labelKey === "session.device.calories")!;
    expect(kcal.app).toBe("495 kcal");
    expect(kcal.appEstimate).toBe(true);
    expect(kcal.device).toBe("540 kcal");
    const avg = rows.find((r) => r.labelKey === "session.device.avgHr")!;
    expect(avg.app).toBeNull();
    expect(avg.device).toBe("132 bpm");
  });

  it("drops rows with nothing on either side and formats short distances in metres", () => {
    const noHr: DeviceWorkout = { ...watchTennis, avgHr: undefined, maxHr: undefined, kcal: undefined, distanceKm: 0.4 };
    const rows = deviceComparisonRows({ device: noHr, durationMin: null, estimatedKcal: null });
    expect(rows.map((r) => r.labelKey)).toEqual(["session.device.duration", "session.device.distance", "session.pace"]);
    expect(rows[1]!.device).toBe("400 m");
  });

  it("derives each column's pace from its OWN distance and time, and surfaces the extended read", () => {
    const run: DeviceWorkout = { ...watchTennis, activityLabel: "Running", distanceKm: 10.2, durationMin: 55, steps: 8890, elevationM: 84, avgMets: 9.8 };
    const rows = deviceComparisonRows({ device: run, durationMin: 60, estimatedKcal: 600, distanceKm: 10 });
    const paceRow = rows.find((r) => r.labelKey === "session.pace")!;
    expect(paceRow.app).toBe("6:00 /km");
    expect(paceRow.device).toBe("5:24 /km");
    expect(rows.find((r) => r.labelKey === "session.device.steps")!.device).toBe("8,890");
    expect(rows.find((r) => r.labelKey === "session.wrapped.elevation")!.device).toBe("84 m");
    expect(rows.find((r) => r.labelKey === "session.device.avgMets")!.device).toBe("9.8");
    expect(rows.some((r) => r.labelKey === "session.device.strokes")).toBe(false);
  });

  it("reads a pool swim in the pool's units — metres and a /100m split", () => {
    // The exact recording behind the bug report: 510 m in 19:41, which the
    // watch's own summary calls 3'52"/100m. Rounded to 20 min it would read
    // 3:55, so the pace row takes the measured seconds when they're there.
    const swim: DeviceWorkout = {
      ...watchTennis,
      activityLabel: "Swimming",
      distanceKm: 0.51,
      durationMin: 20,
      durationSec: 1181,
      strokes: 453,
    };
    const rows = deviceComparisonRows({ device: swim, durationMin: 20, estimatedKcal: 160, distanceKm: 0.5 });
    expect(rows.find((r) => r.labelKey === "session.device.distance")!.device).toBe("510 m");
    const paceRow = rows.find((r) => r.labelKey === "session.pace")!;
    expect(paceRow.device).toBe("3:52 /100m");
    expect(paceRow.app).toBe("4:00 /100m");
  });

  it("falls back to whole minutes for a recording with no measured seconds", () => {
    const swim: DeviceWorkout = { ...watchTennis, activityLabel: "Swimming", distanceKm: 0.51, durationMin: 20 };
    const rows = deviceComparisonRows({ device: swim, durationMin: null, estimatedKcal: null });
    expect(rows.find((r) => r.labelKey === "session.pace")!.device).toBe("3:55 /100m");
  });

  it("shows the measured duration on the device's own clock, the typed one in minutes", () => {
    const swim: DeviceWorkout = { ...watchTennis, activityLabel: "Swimming", durationMin: 20, durationSec: 1181 };
    const row = deviceComparisonRows({ device: swim, durationMin: 20, estimatedKcal: null }).find(
      (r) => r.labelKey === "session.device.duration",
    )!;
    expect(row.device).toBe("19:41");
    expect(row.app).toBe("20 min");
  });

  it("carries the hour on a long recording, and falls back to minutes without seconds", () => {
    const long: DeviceWorkout = { ...watchTennis, durationMin: 94, durationSec: 5652 };
    const withSec = deviceComparisonRows({ device: long, durationMin: null, estimatedKcal: null });
    expect(withSec.find((r) => r.labelKey === "session.device.duration")!.device).toBe("1:34:12");
    const noSec = deviceComparisonRows({ device: watchTennis, durationMin: null, estimatedKcal: null });
    expect(noSec.find((r) => r.labelKey === "session.device.duration")!.device).toBe(`${watchTennis.durationMin} min`);
  });

  it("marks the app column's DERIVED figures as estimates — nothing measured them", () => {
    const run: DeviceWorkout = { ...watchTennis, activityLabel: "Running", distanceKm: 10.2, durationMin: 55 };
    const rows = deviceComparisonRows({ device: run, durationMin: 60, estimatedKcal: 600, distanceKm: 10 });
    expect(rows.find((r) => r.labelKey === "session.pace")!.appEstimate).toBe(true);
    expect(rows.find((r) => r.labelKey === "session.device.calories")!.appEstimate).toBe(true);
    // What the athlete TYPED is a self-report, not a model — no "~" on it.
    expect(rows.find((r) => r.labelKey === "session.device.duration")!.appEstimate).toBeFalsy();
    expect(rows.find((r) => r.labelKey === "session.device.distance")!.appEstimate).toBeFalsy();
  });

  it("keeps km sports on the /km split", () => {
    const row = deviceComparisonRows({
      device: { ...watchTennis, activityLabel: "Cycling", distanceKm: 30, durationMin: 60, durationSec: 3600 },
      durationMin: null,
      estimatedKcal: null,
    }).find((r) => r.labelKey === "session.pace")!;
    expect(row.device).toBe("2:00 /km");
  });
});

describe("sanitizeDeviceWorkout — measured seconds", () => {
  it("keeps the second-accurate duration beside the whole minutes", () => {
    const out = sanitizeDeviceWorkout({ ...watchTennis, durationSec: 1181.4 })!;
    expect(out.durationSec).toBe(1181);
    expect(out.durationMin).toBe(watchTennis.durationMin);
  });

  it("drops an out-of-range or absent seconds reading", () => {
    expect(sanitizeDeviceWorkout({ ...watchTennis, durationSec: 0 })!.durationSec).toBeUndefined();
    expect(sanitizeDeviceWorkout({ ...watchTennis, durationSec: "1181" })!.durationSec).toBeUndefined();
    expect(sanitizeDeviceWorkout(watchTennis)!.durationSec).toBeUndefined();
  });
});

describe("device names", () => {
  it("reads a real device name and rejects the bridge's class name", () => {
    expect(isDeviceName("Apple Watch")).toBe(true);
    expect(isDeviceName("Rafał's Apple Watch")).toBe(true);
    // The Nitro hybrid object's own `name` — what shipped before the fix.
    expect(isDeviceName("SourceProxy")).toBe(false);
    expect(isDeviceName("sourceproxy")).toBe(false);
    expect(isDeviceName("[object Object]")).toBe(false);
    expect(isDeviceName("   ")).toBe(false);
    expect(isDeviceName(undefined)).toBe(false);
  });

  it("names the device, falling back to the provider's hardware", () => {
    expect(deviceSourceLabel(watchTennis)).toBe("Apple Watch");
    expect(deviceSourceLabel({ ...watchTennis, source: "Rafał's Apple Watch" })).toBe("Rafał's Apple Watch");
    // A row matched before the native read was fixed still carries the junk.
    expect(deviceSourceLabel({ ...watchTennis, source: "SourceProxy" })).toBe("Apple Watch");
    expect(deviceSourceLabel({ ...watchTennis, source: undefined })).toBe("Apple Watch");
    expect(deviceSourceLabel({ provider: "whoop" })).toBe("WHOOP");
    expect(deviceSourceLabel({ provider: "mystery-band" })).toBeNull();
    expect(deviceSourceLabel(null)).toBeNull();
  });

  it("never stores a bridge class name as the source", () => {
    expect(sanitizeDeviceWorkout({ ...watchTennis, source: "SourceProxy" })!.source).toBeUndefined();
    expect(sanitizeDeviceWorkout({ ...watchTennis, source: "Apple Watch" })!.source).toBe("Apple Watch");
  });
});
