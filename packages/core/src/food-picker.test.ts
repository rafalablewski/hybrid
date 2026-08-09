import { describe, it, expect } from "vitest";
import {
  PICKER_SOURCES,
  dedupeCandidates,
  PROVENANCE_KEY,
  pickerAnswer,
  pickerRemoteQuery,
  pickerSourceLabelKey,
  pickerSubmit,
} from "./food-picker";
import type { QuickAddCandidate, QuickAddVocab } from "./quick-add";
import type { NutritionFacts } from "./food-facts";

const facts = (over: Partial<NutritionFacts> = {}): NutritionFacts => ({
  kcal: 100, protein: 10, carbs: 5, fat: 3,
  satFat: null, sugar: null, fiber: null, salt: null,
  ...over,
});

const cand = (over: Partial<QuickAddCandidate> & Pick<QuickAddCandidate, "id" | "name" | "source">): QuickAddCandidate => ({
  servingLabel: "100 g",
  servingGrams: 100,
  facts: facts(),
  ...over,
});

const library: QuickAddCandidate[] = [
  cand({ id: "r1", name: "Kefir Krasnystaw", source: "recent", facts: facts({ kcal: 50, protein: 3.4 }) }),
  cand({ id: "f1", name: "Whey isolate", source: "favorite", servingLabel: "30 g", servingGrams: 30, facts: facts({ kcal: 118, protein: 25 }) }),
  cand({ id: "p1", name: "Chicken breast", source: "product", facts: facts({ kcal: 165, protein: 31 }) }),
  cand({ id: "m1", name: "Owsianka + whey", source: "meal", servingLabel: "1 serving", servingGrams: null, facts: facts({ kcal: 422, protein: 34 }) }),
];

describe("the four sources", () => {
  it("keeps all four, in the order the screen shows them", () => {
    expect(PICKER_SOURCES).toEqual(["recent", "favorites", "meals", "personal"]);
  });

  it("labels them from the keys the tabs already used, so no copy moves", () => {
    expect(PICKER_SOURCES.map(pickerSourceLabelKey)).toEqual([
      "w.recovery.nutrition.tab.recent",
      "w.recovery.nutrition.tab.favorites",
      "w.recovery.nutrition.tab.meals",
      "w.recovery.nutrition.tab.personal",
    ]);
  });

  it("gives every candidate source a provenance label — one list mixing four sources must say which", () => {
    expect(Object.keys(PROVENANCE_KEY).sort()).toEqual(["favorite", "meal", "product", "recent"]);
    for (const key of Object.values(PROVENANCE_KEY)) expect(key).toMatch(/^w\.recovery\.nutrition\.tab\./);
  });
});

describe("dedupeCandidates — the four lists overlap by design", () => {
  it("keeps one row for a food that is recent AND favourite AND a product", () => {
    const out = dedupeCandidates([
      cand({ id: "r", name: "Twaróg półtłusty", source: "recent" }),
      cand({ id: "f", name: "Twaróg półtłusty", source: "favorite" }),
      cand({ id: "p", name: "Twaróg półtłusty", source: "product" }),
    ]);
    expect(out).toHaveLength(1);
    // First occurrence wins, so the row keeps the provenance that ranked it.
    expect(out[0]!.source).toBe("recent");
  });

  it("matches on the folded name, since a recent is written from a product under a different id", () => {
    const out = dedupeCandidates([
      cand({ id: "r", name: "Twaróg półtłusty", source: "recent" }),
      cand({ id: "p", name: "TWAROG POLTLUSTY", source: "product" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("keeps two rows when the SERVING differs — 100 g and 250 g are different answers", () => {
    const out = dedupeCandidates([
      cand({ id: "a", name: "Kefir", source: "recent", servingLabel: "100 g" }),
      cand({ id: "b", name: "Kefir", source: "product", servingLabel: "250 g" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("leaves distinct foods alone", () => {
    expect(dedupeCandidates(library)).toHaveLength(library.length);
  });
});

describe("pickerAnswer", () => {
  it("rests when nothing is typed", () => {
    expect(pickerAnswer("", library).kind).toBe("resting");
    expect(pickerAnswer("   ", library).kind).toBe("resting");
  });

  it("still reads a macro line — quick add is what the field does first", () => {
    const a = pickerAnswer("40g protein", library);
    expect(a.kind).toBe("macros");
    if (a.kind !== "macros") throw new Error("expected macros");
    expect(a.macros.facts.protein).toBe(40);
    // 4·4·9, and it says it derived them
    expect(a.macros.derivedKcal).toBe(true);
    expect(a.macros.facts.kcal).toBe(160);
  });

  it("still converts grams against a known serving weight", () => {
    const a = pickerAnswer("whey 60g", library);
    if (a.kind !== "matches") throw new Error("expected matches");
    expect(a.matches[0]!.candidate.id).toBe("f1");
    expect(a.matches[0]!.qty).toBe(2);
    expect(a.matches[0]!.needsPortion).toBe(false);
  });

  it("refuses to invent a quantity when the serving weight is unknown", () => {
    const a = pickerAnswer("owsianka 200g", library);
    if (a.kind !== "matches") throw new Error("expected matches");
    expect(a.matches[0]!.needsPortion).toBe(true);
  });

  it("ranks across ALL FOUR sources at once, not just the list you are on", () => {
    const a = pickerAnswer("e", library);
    if (a.kind !== "matches") throw new Error("expected matches");
    const sources = a.matches.map((m) => m.candidate.source);
    expect(new Set(sources).size).toBeGreaterThan(1);
  });

  it("puts a recent above a favourite above a product on an otherwise equal name", () => {
    const same = [
      cand({ id: "m", name: "Yoghurt", source: "meal" }),
      cand({ id: "p", name: "Yoghurt", source: "product" }),
      cand({ id: "r", name: "Yoghurt", source: "recent" }),
      cand({ id: "f", name: "Yoghurt", source: "favorite" }),
    ];
    const a = pickerAnswer("yoghurt", same);
    if (a.kind !== "matches") throw new Error("expected matches");
    expect(a.matches.map((m) => m.candidate.id)).toEqual(["r", "f", "p", "m"]);
  });

  it("still lets a better NAME match beat a better source", () => {
    const set = [
      cand({ id: "recent-loose", name: "Chicken thigh curry", source: "recent" }),
      cand({ id: "meal-exact", name: "Chicken", source: "meal" }),
    ];
    const a = pickerAnswer("chicken", set);
    if (a.kind !== "matches") throw new Error("expected matches");
    expect(a.matches[0]!.candidate.id).toBe("meal-exact");
  });

  it("returns an empty match list rather than a wrong one", () => {
    const a = pickerAnswer("zupa", library);
    if (a.kind !== "matches") throw new Error("expected matches");
    expect(a.matches).toEqual([]);
    expect(a.query).toBe("zupa");
  });

  it("carries bare digits through as the query — a typed barcode is still a question", () => {
    const a = pickerAnswer("5900512345678", library);
    if (a.kind !== "matches") throw new Error("expected matches");
    expect(a.query).toBe("5900512345678");
    expect(a.matches).toEqual([]);
  });

  it("ranks more than the old three-row peek, because the picker is a whole screen now", () => {
    const many = Array.from({ length: 12 }, (_, i) => cand({ id: `x${i}`, name: `Chicken ${i}`, source: "product" }));
    const a = pickerAnswer("chicken", many);
    if (a.kind !== "matches") throw new Error("expected matches");
    expect(a.matches.length).toBe(8);
    expect(pickerAnswer("chicken", many, { limit: 3 }).kind).toBe("matches");
  });
});

describe("a one-letter macro keyword surrounded by prose is a word, not a keyword", () => {
  // Polish "w" is both the carbs abbreviation and the commonest preposition in
  // the language. Since the picker merged its two fields, a misread costs the
  // only input on the screen — not just a wrong row under a working search box.
  const PL: QuickAddVocab = {
    kcal: ["kcal", "kalorie", "kal"],
    protein: ["bialko", "białko", "bialka", "białka", "protein", "b"],
    carbs: ["wegle", "węgle", "weglowodany", "węglowodany", "w"],
    fat: ["tluszcz", "tłuszcz", "tluszcze", "tłuszcze", "t"],
    times: ["x", "×"],
  };

  it("reads 'tuńczyk 170 g w oleju' as a FOOD, not 170 g of carbohydrate", () => {
    const a = pickerAnswer("tuńczyk 170 g w oleju", library, { vocab: PL });
    expect(a.kind).toBe("matches");
    if (a.kind !== "matches") throw new Error("expected matches");
    expect(a.query).toBe("tuńczyk w oleju");
    // …and it still reaches the database, which is the whole point.
    expect(pickerRemoteQuery(a)).toBe("tuńczyk w oleju");
  });

  it("still honours the abbreviation in the terse form it exists for", () => {
    const a = pickerAnswer("170 g w", library, { vocab: PL });
    if (a.kind !== "macros") throw new Error("expected macros");
    expect(a.macros.facts.carbs).toBe(170);
  });

  it("leaves MULTI-letter keywords alone — 'obiad 800 kcal' is still a macro line", () => {
    const a = pickerAnswer("obiad 800 kcal", library, { vocab: PL });
    if (a.kind !== "macros") throw new Error("expected macros");
    expect(a.macros.facts.kcal).toBe(800);
  });

  it("keeps the English terse forms working", () => {
    const a = pickerAnswer("40g p", library);
    if (a.kind !== "macros") throw new Error("expected macros");
    expect(a.macros.facts.protein).toBe(40);
  });

  it("reads 'chicken 200 g c' as a food line, not 200 g of carbohydrate", () => {
    const a = pickerAnswer("chicken 200 g c", library);
    if (a.kind !== "matches") throw new Error("expected matches");
    // The stray letter stays in the NAME — it is a word here, so it is part of
    // what was asked for, and the question still reaches the database.
    expect(a.query).toBe("chicken c");
    expect(pickerRemoteQuery(a)).toBe("chicken c");
  });
});

describe("pickerRemoteQuery — the network is the last resort", () => {
  it("never fires for a macro line: there is no food in '40g protein' to look up", () => {
    expect(pickerRemoteQuery(pickerAnswer("40g protein", library))).toBeNull();
  });

  it("never fires at rest", () => {
    expect(pickerRemoteQuery(pickerAnswer("", library))).toBeNull();
  });

  it("does not fire on one character — that is a keystroke, not a search", () => {
    expect(pickerRemoteQuery(pickerAnswer("k", library))).toBeNull();
  });

  it("sends the parsed NAME, not the raw phrase — '200g' is not part of the question", () => {
    expect(pickerRemoteQuery(pickerAnswer("kefir 200g", library))).toBe("kefir");
  });

  it("sends a typed barcode", () => {
    expect(pickerRemoteQuery(pickerAnswer("5900512345678", library))).toBe("5900512345678");
  });
});

describe("pickerSubmit — Enter commits what is on screen", () => {
  it("commits a macro line", () => {
    expect(pickerSubmit(pickerAnswer("500 kcal", library)).kind).toBe("macros");
  });

  it("commits the FIRST match, never a second-best the reader cannot see", () => {
    const s = pickerSubmit(pickerAnswer("whey", library));
    if (s.kind !== "log") throw new Error("expected log");
    expect(s.match.candidate.id).toBe("f1");
  });

  it("routes an uncomputable quantity to the portion editor instead of logging", () => {
    expect(pickerSubmit(pickerAnswer("owsianka 200g", library)).kind).toBe("portion");
  });

  it("does nothing when nothing was understood", () => {
    expect(pickerSubmit(pickerAnswer("zupa", library)).kind).toBe("none");
    expect(pickerSubmit(pickerAnswer("", library)).kind).toBe("none");
  });
});
