import { describe, expect, it } from "vitest";
import {
  QUICK_ADD_VOCAB,
  macroDraft,
  parseQuickAdd,
  quickAddDraft,
  resolveQuickAdd,
  type QuickAddCandidate,
  type QuickAddFood,
  type QuickAddMacros,
} from "./quick-add";
import type { NutritionFacts } from "./food-facts";

const facts = (over: Partial<NutritionFacts> & Pick<NutritionFacts, "kcal">): NutritionFacts => ({
  protein: 0, carbs: 0, fat: 0, satFat: null, sugar: null, fiber: null, salt: null, ...over,
});

const cand = (over: Partial<QuickAddCandidate> & Pick<QuickAddCandidate, "id" | "name" | "source">): QuickAddCandidate => ({
  servingLabel: "100 g",
  servingGrams: 100,
  facts: facts({ kcal: 165, protein: 31, fat: 3.6 }),
  ...over,
});

const library: QuickAddCandidate[] = [
  cand({ id: "p1", name: "Chicken breast", source: "product" }),
  cand({ id: "p2", name: "Chicken thigh", source: "product", facts: facts({ kcal: 209, protein: 26, fat: 11 }) }),
  cand({ id: "p3", name: "Whey scoop", source: "recent", servingLabel: "1 scoop", servingGrams: 30, facts: facts({ kcal: 120, protein: 24 }) }),
  cand({ id: "m1", name: "Big breakfast", source: "meal", servingLabel: "1 serving", servingGrams: null, facts: facts({ kcal: 620, protein: 40 }) }),
  cand({ id: "p4", name: "Olive oil", source: "product", servingLabel: "1 tbsp", servingGrams: null, facts: facts({ kcal: 119, fat: 13.5 }) }),
];

const asMacros = (s: string) => parseQuickAdd(s) as QuickAddMacros;
const asFood = (s: string) => parseQuickAdd(s) as QuickAddFood;

describe("parseQuickAdd — macros", () => {
  it("reads a bare calorie entry", () => {
    const p = asMacros("+ 500 kcal");
    expect(p.kind).toBe("macros");
    expect(p.facts.kcal).toBe(500);
    expect(p.derivedKcal).toBe(false);
  });

  it("reads the keyword before the number too", () => {
    expect(asMacros("kcal 500").facts.kcal).toBe(500);
  });

  it("splits a number glued to its keyword", () => {
    expect(asMacros("+40g protein").facts.protein).toBe(40);
  });

  it("reads several macros from one line", () => {
    const p = asMacros("300 kcal 30g protein 12g fat");
    expect(p.facts.kcal).toBe(300);
    expect(p.facts.protein).toBe(30);
    expect(p.facts.fat).toBe(12);
  });

  it("derives calories from the macros when none were typed", () => {
    const p = asMacros("40g protein 20g carbs 10g fat");
    expect(p.derivedKcal).toBe(true);
    expect(p.facts.kcal).toBe(40 * 4 + 20 * 4 + 10 * 9);
  });

  it("does not derive when calories were stated", () => {
    expect(asMacros("500 kcal 40g protein").derivedKcal).toBe(false);
  });

  it("accepts a decimal comma", () => {
    expect(asMacros("12,5 g fat").facts.fat).toBe(12.5);
  });

  it("accepts the short forms people actually type", () => {
    expect(asMacros("30 p").facts.protein).toBe(30);
    expect(asMacros("200 c").facts.carbs).toBe(200);
  });

  it("does not consume one number for two keywords", () => {
    const p = asMacros("30 protein fat");
    expect(p.facts.protein).toBe(30);
    expect(p.facts.fat).toBeUndefined();
  });
});

describe("parseQuickAdd — food", () => {
  it("reads a name with a gram weight after it", () => {
    const p = asFood("chicken 200g");
    expect(p.kind).toBe("food");
    expect(p.query).toBe("chicken");
    expect(p.amount).toBe(200);
    expect(p.unit).toBe("g");
  });

  it("reads the weight before the name", () => {
    const p = asFood("200g chicken breast");
    expect(p.query).toBe("chicken breast");
    expect(p.amount).toBe(200);
  });

  it("reads a bare count as servings", () => {
    const p = asFood("2 eggs");
    expect(p.amount).toBe(2);
    expect(p.unit).toBeNull();
    expect(p.query).toBe("eggs");
  });

  it("reads the multiplier form", () => {
    const p = asFood("3 x whey");
    expect(p.amount).toBe(3);
    expect(p.query).toBe("whey");
  });

  it("defaults to one serving with no number", () => {
    const p = asFood("porridge");
    expect(p.amount).toBe(1);
    expect(p.unit).toBeNull();
  });

  it("converts the other mass units into grams", () => {
    expect(asFood("rice 1.5kg").amount).toBe(1500);
    expect(asFood("milk 500ml").amount).toBe(500);
    expect(Math.round(asFood("steak 8oz").amount)).toBe(227);
  });

  it("keeps a unit word that has no number as part of the name", () => {
    expect(asFood("oat milk").query).toBe("oat milk");
  });

  it("returns unknown for an empty or number-only line", () => {
    expect(parseQuickAdd("").kind).toBe("unknown");
    expect(parseQuickAdd("   ").kind).toBe("unknown");
    expect(parseQuickAdd("200g").kind).toBe("unknown");
  });
});

describe("the vocabulary is a parameter", () => {
  it("reads a localized keyword set", () => {
    const pl = { ...QUICK_ADD_VOCAB, protein: ["bialko", "białko"] };
    const p = parseQuickAdd("40g białko", pl) as QuickAddMacros;
    expect(p.kind).toBe("macros");
    expect(p.facts.protein).toBe(40);
  });

  it("treats an unrecognised keyword as a food name instead", () => {
    const p = parseQuickAdd("40g białko") as QuickAddFood;
    expect(p.kind).toBe("food");
    expect(p.query).toBe("białko");
  });
});

describe("resolveQuickAdd", () => {
  it("finds the athlete's own food by prefix", () => {
    const m = resolveQuickAdd(parseQuickAdd("chicken 200g"), library);
    expect(m[0]!.candidate.name).toBe("Chicken breast");
  });

  it("converts grams to servings using the serving weight", () => {
    const m = resolveQuickAdd(parseQuickAdd("chicken 250g"), library);
    expect(m[0]!.qty).toBe(2.5);
    expect(m[0]!.needsPortion).toBe(false);
  });

  it("REFUSES to convert grams when the serving weight is unknown", () => {
    const m = resolveQuickAdd(parseQuickAdd("olive oil 30g"), library);
    expect(m[0]!.candidate.name).toBe("Olive oil");
    expect(m[0]!.needsPortion).toBe(true);
    // It does not silently become 1 serving of an unknown weight.
    expect(m[0]!.qty).toBe(1);
  });

  it("takes a bare count as servings without needing a weight", () => {
    const m = resolveQuickAdd(parseQuickAdd("2 x big breakfast"), library);
    expect(m[0]!.candidate.name).toBe("Big breakfast");
    expect(m[0]!.qty).toBe(2);
    expect(m[0]!.needsPortion).toBe(false);
  });

  it("prefers a recent food over a library one on an equal name match", () => {
    const both: QuickAddCandidate[] = [
      cand({ id: "a", name: "Yoghurt", source: "product" }),
      cand({ id: "b", name: "Yoghurt", source: "recent" }),
    ];
    expect(resolveQuickAdd(parseQuickAdd("yoghurt"), both)[0]!.candidate.id).toBe("b");
  });

  it("ranks an exact name above a prefix above a substring", () => {
    const set: QuickAddCandidate[] = [
      cand({ id: "a", name: "Roast chicken", source: "product" }),
      cand({ id: "b", name: "Chicken", source: "product" }),
      cand({ id: "c", name: "Chicken thigh", source: "product" }),
    ];
    const m = resolveQuickAdd(parseQuickAdd("chicken"), set);
    expect(m[0]!.candidate.id).toBe("b");
  });

  it("matches a subname when the name does not", () => {
    const set = [cand({ id: "s", name: "Shake", subname: "the usual way", source: "product" })];
    expect(resolveQuickAdd(parseQuickAdd("usual"), set)).toHaveLength(1);
  });

  it("folds accents and Polish ł", () => {
    const set = [cand({ id: "z", name: "Żurek", source: "product" }), cand({ id: "l", name: "Łosoś", source: "product" })];
    expect(resolveQuickAdd(parseQuickAdd("zurek"), set)[0]!.candidate.id).toBe("z");
    expect(resolveQuickAdd(parseQuickAdd("losos"), set)[0]!.candidate.id).toBe("l");
  });

  it("returns nothing for a name it has never seen", () => {
    expect(resolveQuickAdd(parseQuickAdd("dragonfruit"), library)).toEqual([]);
  });

  it("resolves nothing for a macro line — there is no food to find", () => {
    expect(resolveQuickAdd(parseQuickAdd("500 kcal"), library)).toEqual([]);
  });

  it("honours the result limit", () => {
    expect(resolveQuickAdd(parseQuickAdd("chicken"), library, 1)).toHaveLength(1);
  });
});

describe("drafts", () => {
  it("logs per SINGLE serving with a separate quantity", () => {
    const m = resolveQuickAdd(parseQuickAdd("chicken 250g"), library)[0]!;
    const d = quickAddDraft(m);
    expect(d.qty).toBe(2.5);
    expect(d.facts.kcal).toBe(165); // per serving, NOT the total
    expect(d.name).toBe("Chicken breast");
  });

  it("carries provenance forward", () => {
    const set = [cand({ id: "v", name: "Cheeseburger", source: "recent", verifiedId: "max:cheeseburger" })];
    const m = resolveQuickAdd(parseQuickAdd("cheeseburger"), set)[0]!;
    expect(quickAddDraft(m).verifiedId).toBe("max:cheeseburger");
  });

  it("keeps a macro line's unstated panel fields unstated", () => {
    const d = macroDraft(asMacros("500 kcal 40g protein"), "Quick entry");
    expect(d.facts.kcal).toBe(500);
    expect(d.facts.protein).toBe(40);
    expect(d.facts.carbs).toBe(0); // a required macro nobody named is 0
    expect(d.facts.sugar).toBeNull(); // a panel field nobody named is UNSTATED
    expect(d.facts.salt).toBeNull();
    expect(d.qty).toBe(1);
  });
});

describe("quickAddVocab", () => {
  it("builds the vocabulary from a client's t()", async () => {
    const { quickAddVocab } = await import("./quick-add");
    const t = (k: string) => (k.endsWith("vocabProtein") ? "bialko, białko, b" : "");
    const v = quickAddVocab(t);
    expect(v.protein).toEqual(["bialko", "białko", "b"]);
  });

  it("falls back to the default when a locale has not been translated", async () => {
    const { quickAddVocab, QUICK_ADD_VOCAB } = await import("./quick-add");
    // An untranslated key comes back AS the key — matching on "w.recovery.…"
    // would leave the parser recognising nothing at all.
    const v = quickAddVocab((k) => k);
    expect(v.protein).toEqual(QUICK_ADD_VOCAB.protein);
  });
});
