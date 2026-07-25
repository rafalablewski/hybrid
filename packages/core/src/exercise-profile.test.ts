import { describe, it, expect } from "vitest";
import { exerciseProfile, hasField } from "./exercise-profile";

describe("exerciseProfile", () => {
  it("running: pace + distance + time in km, plus elevation and zone", () => {
    const p = exerciseProfile("Running");
    expect(p.kind).toBe("cardio");
    expect(p.fields).toEqual(["distance", "duration", "elevation", "zone"]);
    expect(p.pace).toBe(true);
    expect(p.distanceUnit).toBe("km");
    expect(p.paceLabel).toBe("/km");
  });

  it("swimming: metre distances, /100m pace, stroke — never incline or elevation", () => {
    const p = exerciseProfile("Swimming");
    expect(p.fields).toEqual(["distance", "duration", "stroke", "zone"]);
    expect(p.distanceUnit).toBe("m");
    expect(p.paceLabel).toBe("/100m");
    expect(hasField("Swimming", "incline")).toBe(false);
    expect(hasField("Swimming", "elevation")).toBe(false);
  });

  it("rowing paces per 500 m", () => {
    const p = exerciseProfile("Rowing");
    expect(p.distanceUnit).toBe("m");
    expect(p.paceLabel).toBe("/500m");
  });

  it("tennis: time only (plus HR zone) — no distance, no pace", () => {
    const p = exerciseProfile("Tennis");
    expect(p.fields).toEqual(["duration", "zone"]);
    expect(p.pace).toBe(false);
  });

  it("treadmill: incline instead of elevation, even though it's a run", () => {
    const p = exerciseProfile("Treadmill Run");
    expect(p.fields).toContain("incline");
    expect(p.fields).not.toContain("elevation");
  });

  it("cycling gets elevation", () => {
    expect(hasField("Cycling", "elevation")).toBe(true);
    expect(hasField("Mountain Biking", "elevation")).toBe(true);
  });

  it("strength and conditioning names resolve to their kind with no cardio fields", () => {
    expect(exerciseProfile("Back Squat")).toMatchObject({ kind: "strength", fields: [], pace: false });
    expect(exerciseProfile("EMOM Circuit").kind).toBe("conditioning");
  });

  it("custom cardio names still resolve sensibly", () => {
    expect(exerciseProfile("Morning Run").fields).toContain("elevation");
    expect(exerciseProfile("Incline Walk").fields).toContain("incline");
    expect(exerciseProfile("Freestyle Swim").fields).toContain("stroke");
    expect(exerciseProfile("Open Water Swimming").fields).toContain("stroke");
  });
});
