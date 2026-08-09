import { describe, it, expect } from "vitest";
import {
  activityIdentity,
  deviceActivityVerdict,
  sameActivity,
  sessionActivities,
  sportForDeviceActivity,
} from "./device-activity";
import type { LoggedSession } from "./engines/session";

const session = (over: Partial<LoggedSession> = {}): LoggedSession => ({
  id: "s1",
  title: "Cycling",
  startedAt: "2026-07-20T07:00:00.000Z",
  completedAt: "2026-07-20T08:00:00.000Z",
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

describe("sameActivity", () => {
  const id = (name: string) => activityIdentity(name);

  it("separates two catalog sports even when both are timed", () => {
    // The bug this exists for: same hour, same length, obviously not the same
    // session.
    expect(sameActivity(id("Cycling"), id("Tennis"))).toBe(false);
    // Both are racket sports and both are "timed", so a coarse comparison would
    // wave them through.
    expect(sameActivity(id("Tennis"), id("Table Tennis"))).toBe(false);
  });

  it("agrees with itself", () => {
    expect(sameActivity(id("Tennis"), id("Tennis"))).toBe(true);
    expect(sameActivity(id("Swimming"), id("Swimming"))).toBe(true);
  });

  it("recognises a generic name as the catalog sport it is", () => {
    // Logged "Bike intervals", recorded as "Cycling" — one thing.
    expect(sameActivity(id("Bike intervals"), id("Cycling"))).toBe(true);
    expect(sameActivity(id("Easy Run"), id("Running"))).toBe(true);
    expect(sameActivity(id("Treadmill"), id("Cycling"))).toBe(false);
  });

  it("treats walking as running — same feet, and the two names disagree freely", () => {
    // A ruck titled "Run", a hike the watch called "Walking", a jog that spent
    // half its minutes walking: all of them are that session's recording.
    expect(sameActivity(id("Running"), id("Walking"))).toBe(true);
    expect(sameActivity(id("Easy Run"), id("Hiking"))).toBe(true);
    expect(sameActivity(id("Ruck"), id("Running"))).toBe(true);
    expect(sameActivity(id("Walking"), id("Cycling"))).toBe(false);
  });

  it("does not let two catalog sports of one modality read as different", () => {
    // Both are catalog sports, so a name-only comparison called them a
    // contradiction — and refused the recording of the run they describe.
    expect(sameActivity(id("Marathon"), id("Running"))).toBe(true);
    expect(sameActivity(id("Race Walking"), id("Running"))).toBe(true);
  });

  it("reads the watch's strength wording as the gym session it is", () => {
    expect(sameActivity(id("Traditional Strength Training"), id("Gym"))).toBe(true);
    expect(sameActivity(id("Functional Strength Training"), id("Tennis"))).toBe(false);
  });

  it("says NOTHING rather than guessing when a side is unnamed", () => {
    // "Other" and "Morning session" are the common shapes, and a verdict here
    // would refuse matches we simply failed to understand.
    expect(sameActivity(id("Other"), id("Tennis"))).toBeNull();
    expect(sameActivity(id("Morning session"), id("Cycling"))).toBeNull();
    expect(sameActivity(id(""), id("Running"))).toBeNull();
  });

  it("prefers a block's stamped discipline over the name", () => {
    expect(sameActivity(activityIdentity("Zwift", "cycling"), activityIdentity("Cycling"))).toBe(true);
  });
});

describe("sessionActivities", () => {
  it("reads the title and every block, deduped", () => {
    const s = session({
      title: "Brick",
      blocks: [
        { kind: "cardio", name: "Cycling", minutes: 40 },
        { kind: "cardio", name: "Cycling", minutes: 10 },
        { kind: "cardio", name: "Running", minutes: 20 },
      ],
    });
    const sports = sessionActivities(s).map((i) => i.sport);
    // "Brick" says nothing, and the second cycling block is the same claim.
    expect(sports).toEqual(["Cycling", "Running"]);
  });

  it("is empty when nothing about the session names an activity", () => {
    expect(sessionActivities(session({ title: "Morning session", blocks: [] }))).toHaveLength(0);
  });

  it("counts a strength block as resistance training", () => {
    const s = session({
      title: "Session",
      blocks: [{ kind: "strength", name: "Bench Press", sets: [{ load: "80", reps: "5" }] }],
    });
    expect(sessionActivities(s)[0]).toMatchObject({ strength: true });
  });
});

describe("deviceActivityVerdict", () => {
  it("calls out the ride that is being offered a tennis match", () => {
    expect(deviceActivityVerdict(session({ title: "Cycling" }), { activityLabel: "Tennis" })).toBe("different");
  });

  it("agrees when the recording is what was logged", () => {
    expect(deviceActivityVerdict(session({ title: "Cycling" }), { activityLabel: "Cycling" })).toBe("same");
    expect(deviceActivityVerdict(session({ title: "Football" }), { activityLabel: "Soccer" })).toBe("same");
  });

  it("agrees when ANY part of a hybrid session is the recording", () => {
    const s = session({
      title: "Hybrid",
      blocks: [
        { kind: "strength", name: "Squat", sets: [{ load: "100", reps: "5" }] },
        { kind: "cardio", name: "Running", minutes: 30 },
      ],
    });
    expect(deviceActivityVerdict(s, { activityLabel: "Running" })).toBe("same");
    expect(deviceActivityVerdict(s, { activityLabel: "Tennis" })).toBe("different");
  });

  it("withholds a verdict when either side is vague", () => {
    expect(deviceActivityVerdict(session({ title: "Cycling" }), { activityLabel: "Other" })).toBe("unknown");
    expect(deviceActivityVerdict(session({ title: "Morning session" }), { activityLabel: "Tennis" })).toBe("unknown");
    expect(deviceActivityVerdict(session({ title: "Cycling" }), {})).toBe("unknown");
  });
});
