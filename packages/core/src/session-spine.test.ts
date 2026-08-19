import { describe, it, expect } from "vitest";
import { sessionSpine, SPINE_MIN_BARS } from "./session-spine";
import type { LoggedSession, SessionBlock, StrengthSet } from "./engines/session";

const session = (blocks: SessionBlock[]): LoggedSession => ({
  id: "s",
  title: "Session",
  startedAt: "2026-08-18T18:00:00.000Z",
  completedAt: "2026-08-18T19:30:00.000Z",
  blocks,
});

const strength = (name: string, sets: StrengthSet[]): SessionBlock => ({ kind: "strength", name, sets });

describe("sessionSpine", () => {
  it("gives every set a bar, in order, grouped by exercise", () => {
    const spine = sessionSpine(
      session([
        strength("Bench Press", [
          { load: "40", reps: "10", role: "warmup" },
          { load: "70", reps: "8" },
          { load: "70", reps: "8" },
        ]),
        strength("Overhead Press", [{ load: "40", reps: "8" }]),
      ]),
    );
    expect(spine.bars).toHaveLength(4);
    expect(spine.groups.map((g) => [g.exercise, g.from, g.count])).toEqual([
      ["Bench Press", 0, 3],
      ["Overhead Press", 3, 1],
    ]);
    expect(spine.bars.map((b) => b.group)).toEqual([0, 0, 0, 1]);
  });

  it("ghosts the warm-ups and counts neither them nor their tonnage", () => {
    const spine = sessionSpine(
      session([
        strength("Bench Press", [
          { load: "40", reps: "10", role: "warmup" },
          { load: "70", reps: "8" },
        ]),
      ]),
    );
    expect(spine.bars.map((b) => b.warmup)).toEqual([true, false]);
    expect(spine.workingSets).toBe(1);
    expect(spine.totalSets).toBe(2);
    // 70 × 8 = 560. The 400 kg warm-up is drawn and not counted.
    expect(spine.totalKg).toBe(560);
    expect(spine.cumulativeKg).toEqual([0, 560]);
  });

  it("accumulates the curve set by set", () => {
    const spine = sessionSpine(
      session([strength("Bench Press", [
        { load: "60", reps: "8" },
        { load: "70", reps: "8" },
        { load: "70", reps: "8" },
      ])]),
    );
    expect(spine.cumulativeKg).toEqual([480, 1040, 1600]);
    expect(spine.totalKg).toBe(1600);
  });

  it("flags exactly one top set — the heaviest WORKING one, first of its ties", () => {
    const spine = sessionSpine(
      session([strength("Bench Press", [
        { load: "90", reps: "1", role: "warmup" },
        { load: "70", reps: "8" },
        { load: "70", reps: "8" },
      ])]),
    );
    expect(spine.bars.filter((b) => b.top)).toHaveLength(1);
    // Not the 90 kg warm-up, and the FIRST of the two 70s.
    expect(spine.bars[1]?.top).toBe(true);
    expect(spine.topSet).toEqual({ exercise: "Bench Press", loadKg: 70, reps: 8 });
  });

  it("reports rest and effort only when they were logged", () => {
    const bare = sessionSpine(session([strength("Bench Press", [{ load: "70", reps: "8" }])]));
    expect(bare.medianRestSec).toBeNull();
    expect(bare.meanRpe).toBeNull();

    const logged = sessionSpine(
      session([strength("Bench Press", [
        { load: "70", reps: "8", rest: 120, rpe: "8" },
        { load: "70", reps: "8", rest: 180, rpe: "9" },
        { load: "70", reps: "6", rest: 150, rpe: "10" },
      ])]),
    );
    expect(logged.medianRestSec).toBe(150);
    expect(logged.meanRpe).toBe(9);
  });

  it("stands a bodyweight lift at the athlete's weight on the day", () => {
    const s = session([strength("Pull-Up", [{ load: "0", reps: "10" }])]);
    expect(sessionSpine(s).bars[0]?.loadKg).toBe(0);
    const weighed = sessionSpine(s, { bw: 82 });
    expect(weighed.bars[0]?.loadKg).toBe(82);
    expect(weighed.totalKg).toBe(820);
  });

  it("has no spine for a session with no lifting", () => {
    const spine = sessionSpine(session([{ kind: "cardio", name: "Running", minutes: 40, distance: 8 }]));
    expect(spine.bars).toEqual([]);
    expect(spine.topSet).toBeNull();
    expect(spine.totalKg).toBe(0);
    expect(spine.bars.length < SPINE_MIN_BARS).toBe(true);
  });
});
