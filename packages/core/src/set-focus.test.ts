import { describe, it, expect } from "vitest";
import { activeSetIndex, setFocus, addSetIsNext, nextSetCursor, queuedSetCount } from "./set-focus";

describe("set-focus", () => {
  const done = { done: true };
  const todo = { done: false };

  describe("activeSetIndex", () => {
    it("is the first un-banked set", () => {
      expect(activeSetIndex([done, done, todo, todo])).toBe(2);
    });
    it("is 0 when nothing is banked", () => {
      expect(activeSetIndex([todo, todo])).toBe(0);
      expect(activeSetIndex([{}, {}])).toBe(0); // undefined done reads as not-done
    });
    it("is -1 when every set is banked", () => {
      expect(activeSetIndex([done, done])).toBe(-1);
    });
    it("is -1 for no sets", () => {
      expect(activeSetIndex([])).toBe(-1);
    });
  });

  describe("setFocus", () => {
    it("marks the plan-ahead layout: done history, one active, faded queue", () => {
      const sets = [done, done, done, todo, todo, todo]; // 3 banked, set 4 live, 2 queued
      expect(setFocus(sets, 0)).toBe("done");
      expect(setFocus(sets, 2)).toBe("done");
      expect(setFocus(sets, 3)).toBe("active");
      expect(setFocus(sets, 4)).toBe("upcoming");
      expect(setFocus(sets, 5)).toBe("upcoming");
    });
    it("marks the incremental layout: history then a single active tail", () => {
      const sets = [done, done, done, todo]; // 3 banked, set 4 live, nothing queued
      expect(setFocus(sets, 2)).toBe("done");
      expect(setFocus(sets, 3)).toBe("active");
    });
    it("keeps every banked set 'done' when the exercise is complete", () => {
      const sets = [done, done];
      expect(setFocus(sets, 0)).toBe("done");
      expect(setFocus(sets, 1)).toBe("done");
    });
    it("does not treat a banked set after a gap as active", () => {
      // an un-banked set precedes a banked one — the un-banked one is active,
      // the later banked one is still 'done'.
      const sets = [todo, done];
      expect(setFocus(sets, 0)).toBe("active");
      expect(setFocus(sets, 1)).toBe("done");
    });
  });

  describe("addSetIsNext", () => {
    it("is prominent for the one-at-a-time lifter (no queue below active)", () => {
      expect(addSetIsNext([done, done, todo])).toBe(true); // active is last set
      expect(addSetIsNext([done, done])).toBe(true); // all banked
      expect(addSetIsNext([])).toBe(true); // empty
    });
    it("is quiet for the plan-ahead lifter (a queue sits below active)", () => {
      expect(addSetIsNext([done, done, todo, todo])).toBe(false);
      expect(addSetIsNext([todo, todo, todo])).toBe(false);
    });
  });
});

describe("nextSetCursor", () => {
  const ex = (...done: boolean[]) => ({ sets: done.map((d) => ({ done: d })) });

  it("finds the first un-banked set of the first exercise that has one", () => {
    expect(nextSetCursor([ex(true, true), ex(false, false)])).toEqual({ index: 1, setIndex: 0 });
    expect(nextSetCursor([ex(true, false, false)])).toEqual({ index: 0, setIndex: 1 });
  });

  // A run or a metcon has no sets — the cursor steps over it rather than
  // stopping the dock dead on an exercise it cannot bank.
  it("skips exercises that carry no sets", () => {
    expect(nextSetCursor([{}, { sets: [] }, ex(false)])).toEqual({ index: 2, setIndex: 0 });
  });

  it("returns null when everything is banked", () => {
    expect(nextSetCursor([ex(true), ex(true, true)])).toBeNull();
    expect(nextSetCursor([])).toBeNull();
  });
});

describe("queuedSetCount", () => {
  it("counts un-banked sets across the whole session", () => {
    expect(queuedSetCount([{ sets: [{ done: true }, { done: false }] }, { sets: [{ done: false }] }])).toBe(3 - 1);
    expect(queuedSetCount([{}, { sets: [] }])).toBe(0);
  });
});
