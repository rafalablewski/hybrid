import { describe, it, expect } from "vitest";
import {
  decodeFeedCursor,
  encodeFeedCursor,
  isAfterCursor,
  pageFeedItems,
  type CursorableItem,
} from "./feed-cursor";

/** A newest-first list, the order the feed emits. */
const feed = (...spec: [number, string][]): CursorableItem[] => spec.map(([at, id]) => ({ at, id }));

const TEN = feed(
  [100, "j"], [90, "i"], [80, "h"], [70, "g"], [60, "f"],
  [50, "e"], [40, "d"], [30, "c"], [20, "b"], [10, "a"],
);

describe("encode / decode", () => {
  it("round-trips", () => {
    expect(decodeFeedCursor(encodeFeedCursor({ at: 1730000000000, id: "ckabc123" })))
      .toEqual({ at: 1730000000000, id: "ckabc123" });
  });
  it("keeps a post key's colon, since that is a real subject id", () => {
    expect(decodeFeedCursor(encodeFeedCursor({ at: 5, id: "session:abc" }))?.id).toBe("session:abc");
  });
  it("degrades to the first page rather than throwing — it comes from a URL", () => {
    for (const bad of ["", null, undefined, ".", "abc", "abc.def", ".xyz", "100.", "-5.a", "NaN.a"]) {
      expect(decodeFeedCursor(bad as string), String(bad)).toBeNull();
    }
  });
  it("rejects an id that isn't a plain id, and an absurd one", () => {
    expect(decodeFeedCursor("100../../etc/passwd")).toBeNull();
    expect(decodeFeedCursor("100.<script>")).toBeNull();
    expect(decodeFeedCursor(`100.${"a".repeat(65)}`)).toBeNull();
  });
});

describe("the total order", () => {
  it("older timestamps come after", () => {
    expect(isAfterCursor({ at: 40, id: "z" }, { at: 50, id: "a" })).toBe(true);
    expect(isAfterCursor({ at: 60, id: "a" }, { at: 50, id: "z" })).toBe(false);
  });
  it("ties break on id, so two items in the same second can't loop or vanish", () => {
    expect(isAfterCursor({ at: 50, id: "a" }, { at: 50, id: "b" })).toBe(true);
    expect(isAfterCursor({ at: 50, id: "c" }, { at: 50, id: "b" })).toBe(false);
    // the cursor item itself is never re-served
    expect(isAfterCursor({ at: 50, id: "b" }, { at: 50, id: "b" })).toBe(false);
  });
});

describe("pageFeedItems", () => {
  it("first page has no cursor and offers the next", () => {
    const p = pageFeedItems(TEN, null, 4);
    expect(p.items.map((i) => i.id)).toEqual(["j", "i", "h", "g"]);
    expect(p.nextCursor).toBe("70.g");
  });

  it("walks the whole list without repeating or skipping anything", () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const p: ReturnType<typeof pageFeedItems> = pageFeedItems(TEN, cursor, 3);
      seen.push(...p.items.map((i) => i.id));
      if (!p.nextCursor) break;
      cursor = p.nextCursor;
    }
    expect(seen).toEqual(["j", "i", "h", "g", "f", "e", "d", "c", "b", "a"]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("the LAST page offers no door onto nothing", () => {
    expect(pageFeedItems(TEN, "20.b", 5).nextCursor).toBeNull();
    expect(pageFeedItems(TEN, null, 10).nextCursor).toBeNull();
    expect(pageFeedItems([], null, 10)).toEqual({ items: [], nextCursor: null });
  });

  it("a NEW item at the top does not shift page 2 — the offset bug this replaces", () => {
    const p1 = pageFeedItems(TEN, null, 4);
    const withNew = [{ at: 999, id: "new" }, ...TEN];
    const p2 = pageFeedItems(withNew, p1.nextCursor, 4);
    expect(p2.items.map((i) => i.id)).toEqual(["f", "e", "d", "c"]);
  });

  it("a DELETED cursor item still pages — the cursor is a time, not a row", () => {
    const withoutG = TEN.filter((i) => i.id !== "g");
    expect(pageFeedItems(withoutG, "70.g", 3).items.map((i) => i.id)).toEqual(["f", "e", "d"]);
  });

  it("ties at the same timestamp page cleanly", () => {
    const tied = feed([50, "c"], [50, "b"], [50, "a"], [40, "z"]);
    const p1 = pageFeedItems(tied, null, 2);
    expect(p1.items.map((i) => i.id)).toEqual(["c", "b"]);
    expect(pageFeedItems(tied, p1.nextCursor, 2).items.map((i) => i.id)).toEqual(["a", "z"]);
  });

  it("a junk cursor serves the first page rather than an error", () => {
    expect(pageFeedItems(TEN, "not-a-cursor", 2).items.map((i) => i.id)).toEqual(["j", "i"]);
  });

  it("a limit below one still returns progress, never an empty page forever", () => {
    expect(pageFeedItems(TEN, null, 0).items).toHaveLength(1);
  });
});
