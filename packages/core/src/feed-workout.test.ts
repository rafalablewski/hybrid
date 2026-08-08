import { describe, it, expect } from "vitest";
import { feedWorkoutView } from "./feed-workout";
import { topSetLines } from "./feed-card";
import type { LoggedSession } from "./engines";

const set = (load: string, reps: string, over: Record<string, unknown> = {}) => ({ load, reps, ...over });

const session = (over: Partial<LoggedSession> = {}): LoggedSession => ({
  id: "s1",
  title: "Lower — W4D2",
  startedAt: "2026-03-02T17:30:00.000Z",
  completedAt: "2026-03-02T18:34:00.000Z",
  blocks: [
    {
      kind: "strength",
      name: "Back Squat",
      sets: [set("60", "5", { role: "warmup" }), set("140", "5", { rpe: "8" }), set("160", "5"), set("120", "6", { drop: true })],
    },
    { kind: "strength", name: "Romanian Deadlift", sets: [set("120", "8"), set("120", "8")] },
    { kind: "strength", name: "Split Squat", sets: [set("40", "10/leg")] },
    { kind: "cardio", name: "Easy Run", distance: 5, minutes: 30 },
  ],
  ...over,
});

describe("the opened post", () => {
  it("carries EVERY exercise and every set — not just the card's top lines", () => {
    const v = feedWorkoutView(session());
    expect(v.exerciseCount).toBe(4);
    expect(v.exercises.map((e) => e.name)).toEqual(["Back Squat", "Romanian Deadlift", "Split Squat", "Easy Run"]);
    // The card shows three lines; the opened post shows the whole ledger.
    expect(topSetLines(session()).length).toBe(3);
    expect(v.setCount).toBe(7);
    expect(v.exercises[0]!.sets.length).toBe(4);
  });

  it("keeps the workout in the order it was logged, not sorted by load", () => {
    const v = feedWorkoutView(session());
    expect(v.exercises[2]!.name).toBe("Split Squat");
  });

  it("marks each set with its type badge and keeps reps verbatim", () => {
    const squat = feedWorkoutView(session()).exercises[0]!;
    expect(squat.sets.map((s) => s.badge)).toEqual(["W", "2", "3", "↓"]);
    expect(squat.sets.map((s) => s.type)).toEqual(["warmup", "working", "working", "drop"]);
    expect(squat.sets[1]!.rpe).toBe("8");
    expect(feedWorkoutView(session()).exercises[2]!.sets[0]!.reps).toBe("10/leg");
  });

  it("reports the heaviest WORKING load per exercise (a warm-up never leads)", () => {
    const v = feedWorkoutView(session());
    expect(v.exercises[0]!.topLoadKg).toBe(160);
    expect(v.exercises[1]!.topLoadKg).toBe(120);
  });

  it("summarises a non-strength block in one line instead of a set list", () => {
    const run = feedWorkoutView(session()).exercises[3]!;
    expect(run.sets).toEqual([]);
    expect(run.summary).toContain("5");
    expect(run.topLoadKg).toBeNull();
  });

  it("labels supersets so the pairing survives into the opened post", () => {
    const v = feedWorkoutView(
      session({
        blocks: [
          { kind: "strength", name: "Bench", sets: [set("100", "5")], group: "g1" },
          { kind: "strength", name: "Row", sets: [set("80", "8")], group: "g1" },
        ],
      }),
    );
    expect(v.exercises.map((e) => e.superset)).toEqual(["A1", "A2"]);
  });

  it("reads the DEVICE's figures, not the typed ones", () => {
    const withDevice = session({
      blocks: [{ kind: "cardio", name: "Easy Run", distance: 5, minutes: 30 }],
      device: {
        provider: "apple",
        uuid: "hk-1",
        activityLabel: "Running",
        start: "2026-03-02T17:30:00.000Z",
        end: "2026-03-02T17:57:52.000Z",
        durationSec: 1_672,
        durationMin: 27.9,
        distanceKm: 5.42,
        avgHr: 148,
      },
    });
    const v = feedWorkoutView(withDevice);
    expect(v.device).toBe(true);
    // The stat row is the card's own — device-measured duration and HR.
    expect(v.stats.find((s) => s.key === "duration")).toMatchObject({ value: 28, device: true });
    expect(v.stats.find((s) => s.key === "hr")).toMatchObject({ value: 148, device: true });
    // …and the ledger's run line reads the measured distance, not the typed 5.
    expect(v.exercises[0]!.summary).toContain("5.4");
  });

  it("never carries the private post-workout reflection", () => {
    const v = feedWorkoutView(session({ note: "shoulder felt off", mood: 2, tags: ["tired"] }));
    expect(JSON.stringify(v)).not.toContain("shoulder felt off");
  });
});
