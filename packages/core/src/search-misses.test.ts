import { describe, expect, it } from "vitest";
import {
  MAX_SEARCH_MISSES,
  MIN_MISS_LENGTH,
  normalizeSearchMisses,
  recordSearchMiss,
  searchMissSummary,
  searchMissWeight,
  topSearchMisses,
  type SearchMiss,
} from "./search-misses";

const DAY = Date.parse("2026-08-15T10:00:00Z");
const LATER = Date.parse("2026-08-16T10:00:00Z");
const rec = (list: SearchMiss[], q: string, reason: "empty" | "custom" = "empty", at = DAY) =>
  recordSearchMiss(list, q, reason, at);

describe("recording", () => {
  it("counts a query the first time and every time after", () => {
    let list = rec([], "sissy squat");
    expect(list).toEqual([{ query: "sissy squat", empty: 1, custom: 0, last: "2026-08-15" }]);
    list = rec(list, "sissy squat");
    expect(list[0]).toMatchObject({ empty: 2, custom: 0 });
  });

  it("keeps the two reasons apart on one query", () => {
    let list = rec([], "jefferson curl", "empty");
    list = rec(list, "jefferson curl", "custom");
    expect(list[0]).toMatchObject({ query: "jefferson curl", empty: 1, custom: 1 });
    expect(searchMissSummary(list[0]!)).toBe("1 empty, 1 created");
  });

  it("normalizes, so one gap is one row however it was typed", () => {
    let list = rec([], "Jefferson Curl");
    list = rec(list, "jefferson-curl");
    list = rec(list, "  JEFFERSON   CURL  ");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ query: "jefferson curl", empty: 3 });
  });

  it("refuses a query too short to be a word", () => {
    for (const q of ["", "  ", "d", "de", "!!"]) expect(rec([], q)).toEqual([]);
    expect(MIN_MISS_LENGTH).toBe(3);
    expect(rec([], "dea")).toHaveLength(1);
  });

  it("refuses a paste", () => {
    expect(rec([], "x".repeat(200))).toEqual([]);
  });

  it("moves the date forward on a later sighting", () => {
    let list = rec([], "zercher");
    list = rec(list, "zercher", "empty", LATER);
    expect(list[0]!.last).toBe("2026-08-16");
  });

  it("never mutates the list it was given", () => {
    const before = rec([], "hack squat");
    const snapshot = JSON.parse(JSON.stringify(before));
    rec(before, "hack squat");
    expect(before).toEqual(snapshot);
  });
});

describe("what rises to the top", () => {
  it("weights a hand-created movement above an empty result", () => {
    expect(searchMissWeight({ query: "a", empty: 0, custom: 1, last: "2026-08-15" })).toBe(3);
    expect(searchMissWeight({ query: "b", empty: 2, custom: 0, last: "2026-08-15" })).toBe(2);
  });

  it("sorts the strongest signal first", () => {
    let list = rec([], "belt squat");
    list = rec(list, "belt squat");
    list = rec(list, "jefferson curl", "custom");
    expect(list.map((m) => m.query)).toEqual(["jefferson curl", "belt squat"]);
  });

  it("breaks a tie on recency, then alphabetically", () => {
    let list = rec([], "beta");
    list = rec(list, "alpha");
    expect(topSearchMisses(list).map((m) => m.query)).toEqual(["alpha", "beta"]);
    list = rec(list, "beta", "empty", LATER);
    expect(topSearchMisses(list)[0]!.query).toBe("beta");
  });

  it("is a backlog, not a log — it caps", () => {
    let list: SearchMiss[] = [];
    for (let i = 0; i < MAX_SEARCH_MISSES + 20; i++) list = rec(list, `movement ${i}`);
    expect(list).toHaveLength(MAX_SEARCH_MISSES);
  });

  it("drops the weakest rows when it caps, never the strongest", () => {
    let list = rec([], "the one that matters", "custom");
    for (let i = 0; i < MAX_SEARCH_MISSES + 20; i++) list = rec(list, `noise ${i}`);
    expect(list.map((m) => m.query)).toContain("the one that matters");
    expect(list[0]!.query).toBe("the one that matters");
  });
});

describe("normalizeSearchMisses", () => {
  it("survives anything a corrupt store can hold", () => {
    expect(normalizeSearchMisses(null)).toEqual([]);
    expect(normalizeSearchMisses("nope")).toEqual([]);
    expect(normalizeSearchMisses([null, 3, "x", {}, { query: "" }])).toEqual([]);
    expect(normalizeSearchMisses([{ query: "belt squat", empty: -5, custom: "x", last: 42 }])).toEqual([]);
  });

  it("keeps a well-formed row and coerces its counts", () => {
    expect(normalizeSearchMisses([{ query: "Belt Squat", empty: 2.7, custom: 1, last: "2026-08-15" }])).toEqual([
      { query: "belt squat", empty: 2, custom: 1, last: "2026-08-15" },
    ]);
  });

  it("merges duplicate rows rather than showing the same gap twice", () => {
    expect(
      normalizeSearchMisses([
        { query: "belt squat", empty: 1, custom: 0, last: "2026-08-14" },
        { query: "Belt-Squat", empty: 2, custom: 1, last: "2026-08-15" },
      ]),
    ).toEqual([{ query: "belt squat", empty: 3, custom: 1, last: "2026-08-15" }]);
  });

  it("caps a stored list that grew past the cap in an older build", () => {
    const big = Array.from({ length: 200 }, (_, i) => ({ query: `move ${i}`, empty: 1, custom: 0, last: "2026-08-15" }));
    expect(normalizeSearchMisses(big)).toHaveLength(MAX_SEARCH_MISSES);
  });

  it("round-trips what recordSearchMiss produces", () => {
    let list = rec([], "jefferson curl", "custom");
    list = rec(list, "belt squat");
    expect(normalizeSearchMisses(JSON.parse(JSON.stringify(list)))).toEqual(list);
  });
});

describe("searchMissSummary", () => {
  it("says only what happened", () => {
    expect(searchMissSummary({ query: "a", empty: 3, custom: 0, last: "2026-08-15" })).toBe("3 empty");
    expect(searchMissSummary({ query: "a", empty: 0, custom: 2, last: "2026-08-15" })).toBe("2 created");
  });
});
