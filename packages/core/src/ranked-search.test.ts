import { describe, expect, it } from "vitest";
import { normalizeSearchText, rankEntries, searchEntry, SEARCH_WEIGHTS } from "./ranked-search";

// The exercise adapter is exercised in depth by exercise-search.test.ts. These
// tests use a deliberately NON-exercise pool, because the whole point of pulling
// the scoring out was that it stops being about exercises: if the engine only
// behaves when its entries are lifts, it is not shared, it is copied.

const PLANETS = [
  searchEntry("mercury", ["Mercury"], { terms: ["rock", "inner"], prominence: 10 }),
  searchEntry("venus", ["Venus"], { terms: ["rock", "inner"], prominence: 10 }),
  searchEntry("earth", ["Earth", "Terra", "the world"], { terms: ["rock", "inner", "home"], prominence: 60 }),
  searchEntry("mars", ["Mars", "the red planet"], { terms: ["rock", "inner"], prominence: 30 }),
  searchEntry("jupiter", ["Jupiter"], { terms: ["gas giant", "outer"], weakTerms: ["rock"], prominence: 40 }),
  searchEntry("saturn", ["Saturn"], { terms: ["gas giant", "outer", "rings"], prominence: 35 }),
];

const top = (q: string, n = 5) => rankEntries(PLANETS, q, { limit: n }).map((h) => h.value);
const first = (q: string) => top(q, 1)[0];

describe("normalizeSearchText", () => {
  it("folds case, punctuation and accents to spaced words", () => {
    expect(normalizeSearchText("Trap-Bar Deadlift")).toBe("trap bar deadlift");
    expect(normalizeSearchText("Clean & Jerk")).toBe("clean jerk");
    expect(normalizeSearchText("  Café ")).toBe("cafe");
    expect(normalizeSearchText("!!!")).toBe("");
  });
});

describe("searchEntry", () => {
  it("keeps the printed name as form 0 and drops blanks and duplicates", () => {
    const e = searchEntry("x", ["Earth", "", "Earth", "Terra"]);
    expect(e.forms.map((f) => f.norm)).toEqual(["earth", "terra"]);
    expect(e.forms[0]!.words).toEqual(["earth"]);
    expect(e.forms[0]!.compact).toBe("earth");
  });

  it("never lets a weak term shadow a strong one", () => {
    const e = searchEntry("x", ["X"], { terms: ["rock"], weakTerms: ["rock", "dust"] });
    expect(e.terms).toEqual(["rock"]);
    expect(e.weakTerms).toEqual(["dust"]);
  });

  it("keys on the printed name unless told otherwise", () => {
    expect(searchEntry("x", ["Earth"]).key).toBe("earth");
    expect(searchEntry("x", ["Earth"], { key: "planet:3" }).key).toBe("planet 3");
  });
});

describe("the bands", () => {
  it("puts an exact name above everything", () => {
    expect(first("earth")).toBe("earth");
    expect(first("mars")).toBe("mars");
  });

  it("answers a nickname as readily as the name", () => {
    expect(first("terra")).toBe("earth");
    expect(first("the red planet")).toBe("mars");
  });

  it("finds a name still being typed", () => {
    for (const q of ["j", "ju", "jup", "jupi"]) expect(first(q)).toBe("jupiter");
  });

  it("matches name tokens in any order, through punctuation", () => {
    expect(first("planet red")).toBe("mars");
    expect(first("red-planet")).toBe("mars");
    expect(first("theworld")).toBe("earth"); // run together
  });

  it("matches a term by prefix — splitting a phrase is the adapter's job", () => {
    expect(top("gas", 3)).toContain("jupiter");
    // "giant" is not the start of the term "gas giant", and this engine does not
    // guess: an adapter that wants both words searchable passes both words.
    expect(rankEntries(PLANETS, "giant")).toEqual([]);
  });

  it("falls back to what a thing IS, and never above a name match", () => {
    const hits = rankEntries(PLANETS, "rock", { limit: 6 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.tier === "meta")).toBe(true);
    // A weak term ranks below a strong one: Jupiter only incidentally "rock".
    expect(hits.map((h) => h.value).indexOf("jupiter")).toBe(hits.length - 1);
  });

  it("survives one typo, but not a word too short to be one", () => {
    expect(first("erath")).toBe("earth");
    expect(first("jupter")).toBe("jupiter");
    expect(rankEntries(PLANETS, "zzz")).toEqual([]);
  });

  it("requires every token to land", () => {
    expect(rankEntries(PLANETS, "earth zzzz")).toEqual([]);
  });
});

describe("the adjustments", () => {
  it("prefers the more prominent of two equal matches", () => {
    // Both are exact-tier "inner rock" planets; only prominence separates them.
    const hits = rankEntries(PLANETS, "inner", { limit: 6 }).map((h) => h.value);
    expect(hits.indexOf("earth")).toBeLessThan(hits.indexOf("mercury"));
  });

  it("lifts something the athlete has used, without letting it beat an exact name", () => {
    const plain = rankEntries(PLANETS, "inner", { limit: 6 }).map((h) => h.value);
    const boosted = rankEntries(PLANETS, "inner", { limit: 6, uses: { venus: 20 } }).map((h) => h.value);
    expect(boosted.indexOf("venus")).toBeLessThan(plain.indexOf("venus"));
    expect(rankEntries(PLANETS, "earth", { limit: 6, uses: { venus: 999 } })[0]!.value).toBe("earth");
  });

  it("matches the used-key case- and punctuation-blind", () => {
    const boosted = rankEntries(PLANETS, "inner", { limit: 6, uses: { VENUS: 20 } }).map((h) => h.value);
    expect(boosted.indexOf("venus")).toBeLessThan(
      rankEntries(PLANETS, "inner", { limit: 6 }).map((h) => h.value).indexOf("venus"),
    );
  });
});

describe("the shape of the result", () => {
  it("returns nothing for an empty query", () => {
    expect(rankEntries(PLANETS, "")).toEqual([]);
    expect(rankEntries(PLANETS, "  ")).toEqual([]);
  });

  it("honours the cap and descends by score", () => {
    const hits = rankEntries(PLANETS, "rock", { limit: 3 });
    expect(hits).toHaveLength(3);
    expect([...hits.map((h) => h.score)].sort((a, b) => b - a)).toEqual(hits.map((h) => h.score));
  });

  it("is deterministic — an equal score breaks on the value", () => {
    const a = rankEntries(PLANETS, "inner", { limit: 6 }).map((h) => h.value);
    const b = rankEntries(PLANETS, "inner", { limit: 6 }).map((h) => h.value);
    expect(a).toEqual(b);
  });

  it("ties break on a name/title when the value is an object", () => {
    const objs = [
      searchEntry({ name: "Beta" }, ["Thing"], { prominence: 1 }),
      searchEntry({ name: "Alpha" }, ["Thing"], { prominence: 1 }),
    ];
    expect(rankEntries(objs, "thing").map((h) => h.value.name)).toEqual(["Alpha", "Beta"]);
  });
});

describe("the weights are the product decision", () => {
  it("keeps the bands far enough apart that quality dominates", () => {
    const W = SEARCH_WEIGHTS;
    expect(W.exact).toBeGreaterThan(W.wholeWord);
    expect(W.wholeWord).toBeGreaterThan(W.wordPrefix);
    expect(W.wordPrefix).toBeGreaterThan(W.inWord);
    expect(W.inWord).toBeGreaterThan(W.meta);
    expect(W.meta).toBeGreaterThan(W.fuzzy);
    // No adjustment may carry a result across a band boundary.
    const widest = W.startsWith + W.primaryMeta + W.used + W.perUse * 30 + W.prominence * 120;
    expect(widest).toBeLessThan(W.exact - W.wholeWord);
  });
});
