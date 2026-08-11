import { describe, it, expect } from "vitest";
import { emptyDayCopy } from "./empty-day";

describe("emptyDayCopy", () => {
  it("uses ONE title key in every tense — that is the whole point", () => {
    const keys = new Set([
      emptyDayCopy({ isToday: true, hasHistory: false }).titleKey,
      emptyDayCopy({ isToday: true, hasHistory: true }).titleKey,
      emptyDayCopy({ isToday: false, hasHistory: true }).titleKey,
    ]);
    expect(keys.size).toBe(1);
  });

  it("separates a first run from an open today by the description alone", () => {
    const first = emptyDayCopy({ isToday: true, hasHistory: false });
    const open = emptyDayCopy({ isToday: true, hasHistory: true });
    expect(first.tense).toBe("firstRun");
    expect(open.tense).toBe("today");
    expect(first.bodyKey).not.toBe(open.bodyKey);
    expect(first.symbol).toBe(open.symbol);
    expect(first.quiet).toBe(false);
    expect(open.quiet).toBe(false);
  });

  it("stands a past day down, and never offers to start a session in it", () => {
    const past = emptyDayCopy({ isToday: false, hasHistory: true });
    expect(past.tense).toBe("past");
    expect(past.quiet).toBe(true);
    expect(past.canStartSession).toBe(false);
  });

  it("still offers the live logger on any today, history or not", () => {
    expect(emptyDayCopy({ isToday: true, hasHistory: false }).canStartSession).toBe(true);
    expect(emptyDayCopy({ isToday: true, hasHistory: true }).canStartSession).toBe(true);
  });

  it("a past day with no history anywhere is still a past day", () => {
    expect(emptyDayCopy({ isToday: false, hasHistory: false }).tense).toBe("past");
  });
});
