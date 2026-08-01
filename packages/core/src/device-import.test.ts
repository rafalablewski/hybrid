import { describe, it, expect } from "vitest";
import {
  DEVICE_IMPORT_MIN_MIN,
  DEVICE_IMPORT_PROVIDERS,
  deviceImportCounts,
  deviceImportMeta,
  deviceImportedSession,
  deviceWorkoutBlocks,
  deviceWorkoutTitle,
  planDeviceImport,
  sportForDeviceActivity,
} from "./device-import";
import { deviceMarkFor } from "./device-marks";
import { deviceSourceLabel, type DeviceWorkout } from "./session-device";
import type { CardioBlock, LoggedSession } from "./engines/session";

const T = (h: number, m = 0) => new Date(Date.UTC(2026, 6, 20, h, m)).toISOString();

const workout = (over: Partial<DeviceWorkout> = {}): DeviceWorkout => ({
  provider: "apple",
  uuid: "w1",
  activityLabel: "Running",
  start: T(7),
  end: T(8),
  durationMin: 60,
  ...over,
});

const session = (over: Partial<LoggedSession> = {}): LoggedSession => ({
  id: "s1",
  title: "Running",
  startedAt: T(7),
  completedAt: T(8),
  blocks: [],
  ...over,
});

describe("sportForDeviceActivity", () => {
  it("maps HealthKit activity labels onto the ONE sport catalog", () => {
    expect(sportForDeviceActivity("Running")).toBe("Running");
    expect(sportForDeviceActivity("Soccer")).toBe("Football");
    expect(sportForDeviceActivity("Cross Country Skiing")).toBe("Cross-Country Skiing");
    expect(sportForDeviceActivity("Table Tennis")).toBe("Table Tennis");
    expect(sportForDeviceActivity("Swim Bike Run")).toBe("Triathlon");
  });

  it("resolves a label that IS a catalog name without needing a mapping row", () => {
    expect(sportForDeviceActivity("Judo")).toBe("Judo");
    expect(sportForDeviceActivity("Diving")).toBe("Diving");
  });

  it("returns null rather than guessing when the device's label is ambiguous", () => {
    // HealthKit's `hockey` covers ice AND field; `skatingSports` covers speed,
    // short-track and figure. Guessing would file the session under a sport the
    // athlete doesn't play.
    expect(sportForDeviceActivity("Hockey")).toBeNull();
    expect(sportForDeviceActivity("Skating Sports")).toBeNull();
    expect(sportForDeviceActivity("Functional Strength Training")).toBeNull();
    expect(sportForDeviceActivity("")).toBeNull();
  });
});

describe("deviceWorkoutTitle / deviceWorkoutBlocks", () => {
  it("titles an unmapped recording with the device's own label", () => {
    expect(deviceWorkoutTitle(workout({ activityLabel: "Functional Strength Training" }))).toBe(
      "Functional Strength Training",
    );
  });

  it("builds one cardio block carrying the measured figures the block can hold", () => {
    const blocks = deviceWorkoutBlocks(workout({ distanceKm: 10.4, elevationM: 120, kcal: 700 }));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "cardio",
      name: "Running",
      discipline: "running",
      minutes: 60,
      distance: 10.4,
      elevation: 120,
    });
    // Calories/HR are NOT duplicated into the block — they ride on
    // Session.device, which outranks the block everywhere anyway.
    expect(JSON.stringify(blocks[0])).not.toContain("700");
  });

  it("stamps the discipline so a swim never reads as generic cardio", () => {
    expect(deviceWorkoutBlocks(workout({ activityLabel: "Swimming" }))[0]).toMatchObject({ discipline: "swimming" });
  });
});

describe("deviceImportedSession", () => {
  // Exactly what the import route writes for a `create`: the recording's
  // interval as the session's, and the block built from the recording.
  const importedSession = (w: DeviceWorkout): LoggedSession =>
    session({ startedAt: w.start, completedAt: w.end, blocks: deviceWorkoutBlocks(w), device: w });

  it("recognises a session the import created — nothing there was typed", () => {
    const w = workout({ distanceKm: 1.36, elevationM: 23, kcal: 102, avgHr: 165 });
    expect(deviceImportedSession(importedSession(w))).toBe(true);
  });

  it("is false without a recording attached", () => {
    const w = workout();
    expect(deviceImportedSession({ ...importedSession(w), device: null })).toBe(false);
  });

  it("is false for a hand-logged session matched to its recording", () => {
    // Quick-logged "Running, 60 min" at 09:00, attached to the 07:00 recording:
    // same figures, but the session's stamp is the athlete's, not the watch's.
    const s = session({
      startedAt: T(9),
      completedAt: T(9),
      blocks: [{ kind: "cardio", name: "Running", minutes: 60 }],
      device: workout(),
    });
    expect(deviceImportedSession(s)).toBe(false);
  });

  it("self-heals when the athlete edits an imported figure", () => {
    const w = workout({ distanceKm: 1.36 });
    const s = importedSession(w);
    const b = s.blocks[0] as CardioBlock;
    expect(deviceImportedSession(s)).toBe(true);
    expect(deviceImportedSession({ ...s, blocks: [{ ...b, distance: 1.4 }] })).toBe(false);
    expect(deviceImportedSession({ ...s, blocks: [{ ...b, minutes: 10 }] })).toBe(false);
  });

  it("is false once the session holds more than the recording's one block", () => {
    const w = workout();
    const s = importedSession(w);
    const extra = { kind: "strength" as const, name: "Bench Press", sets: [{ load: "80", reps: "5" }] };
    expect(deviceImportedSession({ ...s, blocks: [...s.blocks, extra] })).toBe(false);
  });
});

describe("planDeviceImport", () => {
  it("creates a session for a recording nothing in the log accounts for", () => {
    const items = planDeviceImport([workout()], []);
    expect(items).toHaveLength(1);
    expect(items[0]!.action).toBe("create");
    expect(items[0]!.title).toBe("Running");
  });

  it("drops recordings too short to be a session", () => {
    const items = planDeviceImport([workout({ durationMin: DEVICE_IMPORT_MIN_MIN - 1 })], []);
    expect(items).toHaveLength(0);
  });

  it("does nothing to a recording already carried by a session", () => {
    const s = session({ device: workout() });
    const items = planDeviceImport([workout()], [s]);
    expect(items[0]!).toMatchObject({ action: "linked", sessionId: "s1" });
  });

  it("attaches to a session whose interval the recording overlaps", () => {
    // Logged 07:10–08:10 in the app, recorded 07:00–08:00 on the watch.
    const s = session({ startedAt: T(7, 10), completedAt: T(8, 10) });
    const items = planDeviceImport([workout()], [s]);
    expect(items[0]!).toMatchObject({ action: "attach", sessionId: "s1", sessionTitle: "Running" });
  });

  it("leaves a barely-overlapping recording as its own session", () => {
    // The watch's hour ends 6 minutes into the logged session — that is two
    // different pieces of training, not one.
    const s = session({ startedAt: T(7, 54), completedAt: T(9) });
    expect(planDeviceImport([workout()], [s])[0]!.action).toBe("create");
  });

  it("attaches to a POINT log with an agreeing duration", () => {
    // The quick-log sheet stamps startedAt == completedAt at typing time.
    const s = session({
      startedAt: T(9),
      completedAt: T(9),
      blocks: [{ kind: "cardio", name: "Running", minutes: 55 }],
    });
    expect(planDeviceImport([workout()], [s])[0]!).toMatchObject({ action: "attach", sessionId: "s1" });
  });

  it("will not attach a point log whose duration disagrees", () => {
    // Logged a 12-minute walk the same afternoon — not the hour-long run.
    const s = session({
      startedAt: T(9),
      completedAt: T(9),
      blocks: [{ kind: "cardio", name: "Walking", minutes: 12 }],
    });
    expect(planDeviceImport([workout()], [s])[0]!.action).toBe("create");
  });

  it("will not attach a point log stamped days from the recording", () => {
    const s = session({
      startedAt: new Date(Date.UTC(2026, 6, 25, 9)).toISOString(),
      completedAt: new Date(Date.UTC(2026, 6, 25, 9)).toISOString(),
      blocks: [{ kind: "cardio", name: "Running", minutes: 60 }],
    });
    expect(planDeviceImport([workout()], [s])[0]!.action).toBe("create");
  });

  it("will not attach a point log with no duration to go on", () => {
    const s = session({ startedAt: T(9), completedAt: T(9), blocks: [] });
    expect(planDeviceImport([workout()], [s])[0]!.action).toBe("create");
  });

  it("pairs one-to-one — two recordings can't both claim one session", () => {
    const s = session({ startedAt: T(7, 5), completedAt: T(8, 5) });
    const items = planDeviceImport(
      [workout(), workout({ uuid: "w2", start: T(7, 30), end: T(8, 30) })],
      [s],
    );
    const byUuid = Object.fromEntries(items.map((i) => [i.workout.uuid, i.action]));
    // The nearest pair settles first (w1 starts 5 min from the log's start).
    expect(byUuid.w1).toBe("attach");
    expect(byUuid.w2).toBe("create");
  });

  it("pairs one-to-one the other way — two sessions can't both claim one recording", () => {
    const items = planDeviceImport(
      [workout()],
      [session({ id: "a", startedAt: T(7, 5), completedAt: T(8, 5) }), session({ id: "b" })],
    );
    expect(items.filter((i) => i.action === "attach")).toHaveLength(1);
    // The exact-interval session (b) wins over the 5-minutes-off one.
    expect(items[0]!.sessionId).toBe("b");
  });

  it("never re-attaches a recording to a session that already carries another", () => {
    const s = session({ device: workout({ uuid: "other" }) });
    expect(planDeviceImport([workout()], [s])[0]!.action).toBe("create");
  });

  it("is idempotent — replanning after an import finds nothing left to do", () => {
    const w = workout();
    const first = planDeviceImport([w], []);
    expect(first[0]!.action).toBe("create");
    // …the import wrote a session carrying the recording; the next sync sees it.
    const after = planDeviceImport([w], [session({ device: w })]);
    expect(after[0]!.action).toBe("linked");
    expect(deviceImportCounts(after).pending).toBe(0);
  });

  it("orders newest first", () => {
    const items = planDeviceImport(
      [workout({ uuid: "old", start: T(5), end: T(6) }), workout({ uuid: "new", start: T(10), end: T(11) })],
      [],
    );
    expect(items.map((i) => i.workout.uuid)).toEqual(["new", "old"]);
  });
});

describe("DEVICE_IMPORT_PROVIDERS", () => {
  it("names every provider the strip offers, and only one is readable today", () => {
    expect(DEVICE_IMPORT_PROVIDERS.map((p) => p.id)).toEqual(["apple", "garmin"]);
    expect(DEVICE_IMPORT_PROVIDERS.filter((p) => p.status === "live").map((p) => p.id)).toEqual(["apple"]);
  });

  it("can name AND draw every provider it lists — a placeholder is not an excuse", () => {
    for (const p of DEVICE_IMPORT_PROVIDERS) {
      expect(deviceSourceLabel({ provider: p.id }), p.id).toBeTruthy();
      expect(deviceMarkFor(p.id), p.id).not.toBeNull();
    }
  });

  it("plans a placeholder provider's recording exactly like a live one", () => {
    // The point of the placeholder: nothing downstream branches on the
    // provider, so the day Garmin gains a reader no planning code changes.
    const g = workout({ uuid: "g1", provider: "garmin", activityLabel: "Cycling" });
    const items = planDeviceImport([g], []);
    expect(items[0]!).toMatchObject({ action: "create", title: "Cycling" });
    expect(deviceWorkoutBlocks(g)[0]).toMatchObject({ kind: "cardio", discipline: "cycling" });
  });
});

describe("deviceImportCounts / deviceImportMeta", () => {
  it("counts what a tap would actually change", () => {
    const items = planDeviceImport(
      [workout(), workout({ uuid: "w2", start: T(12), end: T(13) })],
      [session({ device: workout() })],
    );
    expect(deviceImportCounts(items)).toMatchObject({ create: 1, linked: 1, pending: 1 });
  });

  it("renders sub-kilometre distances in metres and never joins with a middot", () => {
    const meta = deviceImportMeta(workout({ distanceKm: 0.4, kcal: 300, avgHr: 148 }));
    expect(meta).toEqual(["60 min", "400 m", "300 kcal", "♥ 148"]);
    expect(meta.join(" – ")).not.toContain("·");
  });

  it("speaks the ACTIVITY's own distance unit, like the summary's device panel", () => {
    // The import row and the comparison panel describe the SAME recording, so a
    // pool swim reading in metres on one and kilometres on the other would look
    // like two different numbers. A 1.2 km swim is 1200 m on both.
    expect(deviceImportMeta(workout({ activityLabel: "Swimming", distanceKm: 1.2 }))).toContain("1200 m");
    // A distance sport measured in km keeps km.
    expect(deviceImportMeta(workout({ activityLabel: "Running", distanceKm: 10.4 }))).toContain("10.4 km");
    // An activity the catalog doesn't know falls back to km.
    expect(deviceImportMeta(workout({ activityLabel: "Functional Strength Training", distanceKm: 2.5 }))).toContain("2.5 km");
  });
});
