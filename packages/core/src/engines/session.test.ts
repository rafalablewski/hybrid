import { describe, it, expect } from "vitest";
import {
  e1rm,
  sessionVolume,
  totalVolume,
  e1rmSeries,
  bestE1rmByLift,
  liftNames,
  toTrainingLog,
} from "./session";
import type { LoggedSession } from "./session";

const sessions: LoggedSession[] = [
  {
    id: "1",
    title: "Lower",
    startedAt: "2026-05-20T10:00:00.000Z",
    blocks: [
      { kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }, { load: "110", reps: "3" }] },
      { kind: "conditioning", name: "Row Intervals", minutes: 16, rpe: 8 },
    ],
  },
  {
    id: "2",
    title: "Lower",
    startedAt: "2026-05-27T10:00:00.000Z",
    blocks: [
      { kind: "strength", name: "Back Squat", sets: [{ load: "120", reps: "3", rpe: "8" }] },
    ],
  },
];

describe("session stats", () => {
  it("e1rm uses the Epley formula", () => {
    expect(Math.round(e1rm(100, 5))).toBe(117);
    expect(e1rm(100, 0)).toBe(0);
  });

  it("sessionVolume sums load × reps over strength sets", () => {
    expect(sessionVolume(sessions[0]!.blocks)).toBe(100 * 5 + 110 * 3);
  });

  it("totalVolume sums across sessions", () => {
    expect(totalVolume(sessions)).toBe(100 * 5 + 110 * 3 + 120 * 3);
  });

  it("e1rmSeries returns points oldest→newest for a lift", () => {
    const s = e1rmSeries(sessions, "Back Squat");
    expect(s).toHaveLength(2);
    expect(s[0]!.e1rm).toBeLessThan(s[1]!.e1rm); // progress
  });

  it("bestE1rmByLift returns the all-time best per lift", () => {
    const prs = bestE1rmByLift(sessions);
    expect(prs[0]!.lift).toBe("Back Squat");
    expect(prs[0]!.e1rm).toBe(Math.round(e1rm(120, 3)));
  });

  it("liftNames lists distinct lifts", () => {
    expect(liftNames(sessions)).toEqual(["Back Squat"]);
  });

  it("toTrainingLog produces engine input with daysAgo + items", () => {
    const log = toTrainingLog(sessions, new Date("2026-05-28T10:00:00.000Z").getTime());
    expect(log).toHaveLength(2);
    expect(log[1]!.daysAgo).toBe(1);
    const squat = log[1]!.items.find((i) => i.move === "Back Squat");
    expect(squat?.e1rm).toBe(Math.round(e1rm(120, 3)));
    expect(squat?.topRpe).toBe(8);
  });
});
