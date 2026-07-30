import { describe, it, expect } from "vitest";
import {
  VERIFIED_FOODS, VERIFIED_SOURCES, auditVerifiedCatalog, mergeFoodHits, searchVerifiedFoods,
  relatedVerifiedFoods, sourceCheckedOn, sourceMark, sourceMarkCredits, sourceMarkDataUri,
  verifiedFreshness, staleVerifiedFoods, VERIFIED_STALE_AFTER_DAYS,
  verifiedAtwater, verifiedFood, verifiedFoodToHit, verifiedFoodsBySource, verifiedHits, verifiedKj,
  verifiedSource,
  type SourceMark, type VerifiedSource,
} from "./verified-foods";
import type { FoodHit } from "./nutrition-off";

describe("the catalog itself", () => {
  it("is internally consistent — every item reconciles against 4·4·9", () => {
    // This is the gate on the badge: an item whose numbers were mis-transcribed
    // must fail HERE, before it can ever ship under a HYBRID Verified mark.
    expect(auditVerifiedCatalog()).toEqual([]);
  });
  it("points every item at a known business", () => {
    for (const f of VERIFIED_FOODS) expect(verifiedSource(f.sourceId)).not.toBeNull();
  });
  it("carries MAX Premium Burgers with its three checked items", () => {
    expect(VERIFIED_SOURCES.map((s) => s.id)).toContain("max-premium-burgers");
    expect(verifiedFoodsBySource("max-premium-burgers").map((f) => f.name).sort())
      .toEqual(["Cheeseburger", "Chicken Jr", "Fries (small)"]);
  });
  it("carries Lidl as a RETAILER, not a restaurant", () => {
    // The catalog's second source is a shelf, not a menu — the kind field is
    // what lets a client say so without hard-coding the business.
    expect(verifiedSource("lidl")!.kind).toBe("retailer");
    expect(verifiedFoodsBySource("lidl").map((f) => f.id)).toEqual(["lidl-rye-sourdough-bread"]);
  });
  it("states the published energy in both units", () => {
    expect(verifiedKj(verifiedFood("mpb-cheeseburger")!)).toBe(1368);
    // Lidl's pack states 830 kJ / 196 kcal, and we derive 820. Both are right:
    // an EU label computes each unit from its OWN factor table (fat 37 kJ/g vs
    // 9 kcal/g, carbohydrate 17 vs 4, fibre 8 vs 2), and those ratios are not
    // 4.184. We store the stated kcal and derive kJ from it, so on an item
    // whose kJ was computed nutrient-by-nutrient we land ~1 % under.
    expect(verifiedKj(verifiedFood("lidl-rye-sourdough-bread")!)).toBe(820);
  });
});

describe("a packaged item states more than a dish does", () => {
  const bread = () => verifiedFood("lidl-rye-sourdough-bread")!;

  it("reconciles ONLY because fibre carries energy", () => {
    // 4.06·4 + 39·4 + 1.1·9 = 182 kcal against a published 196 — a 7 % gap that
    // looked like a mis-transcription until fibre's 2 kcal/g was counted. This
    // is the test that would fail if that term were ever dropped again.
    expect(verifiedAtwater(bread())).toBe(196);
    expect(bread().facts.kcal).toBe(196);
  });

  it("declares per 100 g and carries the pack weight separately", () => {
    // A shelf label declares per 100 g. Inventing "1 slice" would be inventing
    // a slice weight the pack never publishes.
    expect(bread().servingLabel).toBe("100 g");
    expect(bread().servingGrams).toBe(100);
    expect(bread().packSize).toBe("450 g");
  });

  it("carries the ingredient + allergen statement, in English", () => {
    expect(bread().ingredients).toMatch(/rye sourdough/);
    expect(bread().mayContain).toMatch(/sesame/);
    // The pack is Polish; the app is English. Both must be true at once.
    expect(bread().nativeLocale).toBe("pl");
    expect(bread().ingredients).not.toMatch(/[\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017c\u017a]/);
  });

  it("leaves a restaurant dish without pack fields rather than empty ones", () => {
    // Absent is a fact about the food. A burger has no ingredient panel, so the
    // whole card is gone on its page — not rendered with blanks in it.
    const burger = verifiedFood("mpb-cheeseburger")!;
    expect(burger.ingredients).toBeUndefined();
    expect(burger.packSize).toBeUndefined();
  });
});

describe("not-stated stays not-stated", () => {
  it("keeps the Chicken Jr's unpublished saturates/sugar/salt null, never 0", () => {
    const f = verifiedFood("mpb-chicken-jr")!;
    expect(f.facts.satFat).toBeNull();
    expect(f.facts.sugar).toBeNull();
    expect(f.facts.salt).toBeNull();
    expect(f.facts.kcal).toBe(311);
  });
  it("keeps an unpublished serving weight null rather than inventing one", () => {
    expect(verifiedFood("mpb-fries-small")!.servingGrams).toBeNull();
    expect(verifiedFood("mpb-cheeseburger")!.servingGrams).toBe(121);
  });
});

describe("search", () => {
  it("finds an item by its English name", () => {
    expect(searchVerifiedFoods("cheese").map((f) => f.id)).toContain("mpb-cheeseburger");
  });
  it("finds an item by the operator's own name, accents and all", () => {
    // The menu and the pack are Polish; the app is English. A user who reads
    // either must still find the item they are holding — nativeName is a search
    // alias for exactly this, and is never rendered.
    expect(searchVerifiedFoods("frytki").map((f) => f.id)).toEqual(["mpb-fries-small"]);
    expect(searchVerifiedFoods("male").map((f) => f.id)).toEqual(["mpb-fries-small"]);
    expect(searchVerifiedFoods("chleb zytni").map((f) => f.id)).toEqual(["lidl-rye-sourdough-bread"]);
    expect(searchVerifiedFoods("zakwasie").map((f) => f.id)).toEqual(["lidl-rye-sourdough-bread"]);
  });
  it("lists everything a business sells when the business is searched", () => {
    expect(searchVerifiedFoods("max premium")).toHaveLength(3);
  });
  it("requires every term of a multi-word query to match", () => {
    expect(searchVerifiedFoods("cheese pizza")).toEqual([]);
  });
  it("ignores a query too short to mean anything", () => {
    expect(searchVerifiedFoods("c")).toEqual([]);
  });
});

describe("the search row adapter", () => {
  it("presents a verified item in the same shape as a community hit", () => {
    const hit = verifiedFoodToHit(verifiedFood("mpb-cheeseburger")!);
    expect(hit.name).toBe("Cheeseburger");
    expect(hit.brand).toBe("MAX Premium Burgers");
    expect(hit.perServing).toBe(true);
    expect(hit.salt).toBe(1.7);
    expect(hit.verified).toEqual({
      sourceId: "max-premium-burgers",
      sourceName: "MAX Premium Burgers",
      verifiedOn: "2026-07-29",
    });
  });
});

describe("mergeFoodHits", () => {
  const community: FoodHit[] = [
    { code: "1", name: "Cheeseburger", brand: "Max Premium Burgers", serving: "100 g", kcal: 250, protein: 12, carbs: 20, fat: 14, perServing: false },
    { code: "2", name: "Protein bar", brand: "Other", serving: "60 g", kcal: 220, protein: 20, carbs: 21, fat: 7, perServing: true },
  ];
  it("puts verified rows first", () => {
    const out = mergeFoodHits(verifiedHits("cheeseburger"), community);
    expect(out[0]!.verified).toBeDefined();
  });
  it("drops the community duplicate of a verified item", () => {
    const out = mergeFoodHits(verifiedHits("cheeseburger"), community);
    expect(out.filter((h) => h.name === "Cheeseburger")).toHaveLength(1);
    expect(out.map((h) => h.name)).toContain("Protein bar");
  });
  it("respects the result cap", () => {
    expect(mergeFoodHits(verifiedHits("max premium"), community, 2)).toHaveLength(2);
  });
});

describe("the product page's data", () => {
  it("offers the other items from the same business, never the item itself", () => {
    const rel = relatedVerifiedFoods("mpb-cheeseburger");
    expect(rel.map((f) => f.id).sort()).toEqual(["mpb-chicken-jr", "mpb-fries-small"]);
  });
  it("returns nothing for an unknown item rather than throwing", () => {
    expect(relatedVerifiedFoods("nope")).toEqual([]);
  });
  it("dates a source by its most recently checked item", () => {
    expect(sourceCheckedOn("max-premium-burgers")).toBe("2026-07-29");
    expect(sourceCheckedOn("nope")).toBeNull();
  });
});

describe("source marks", () => {
  // A mark identifies WHOSE food this is. It is attribution, never a claim that
  // the business endorsed us — so a source must always carry the trademark line
  // that says so, with or without artwork.
  it("requires a trademark line on every source, mark or not", () => {
    for (const s of VERIFIED_SOURCES) expect(s.trademark).toBeTruthy();
    expect(verifiedSource("max-premium-burgers")!.trademark).toMatch(/Max Burgers AB/);
  });

  it("carries MAX's own wordmark, self-contained and credited", () => {
    const m = sourceMark("max-premium-burgers")!;
    expect(m).not.toBeNull();
    expect(m.svg).toMatch(/^<svg/);
    expect(m.alt).toBe("MAX");
    // Traced from the operator's artwork — 1000 × 627.6, so a 26px-high mark
    // lays out at ~41px wide without the renderer having to measure anything.
    expect(m.aspect).toBeCloseTo(1.593, 2);
    // The keylines between the letterforms are HOLES, not painted white: that
    // is what keeps the mark legible on the charcoal card and the washi one.
    expect(m.svg).toContain('fill-rule="evenodd"');
    expect(sourceMarkCredits().find((c) => c.sourceId === "max-premium-burgers")!.credit)
      .toMatch(/Max Burgers AB/);
  });

  it("carries Lidl's roundel in its brand colours, self-contained and credited", () => {
    const m = sourceMark("lidl")!;
    expect(m.svg).toMatch(/^<svg/);
    expect(m.alt).toBe("Lidl");
    expect(m.aspect).toBe(1); // the roundel is square
    // A SOLID badge, not knockouts: it carries its own ground, so it reads the
    // same on the AURORA charcoal card and the Kyoto Hour washi one.
    for (const hex of ["#0050AA", "#FFF000", "#E60A14"]) expect(m.svg).toContain(hex);
    // The geometry is not ours, and the credit has to say so — including that
    // CC0 waives copyright and NOT the trademark.
    const credit = sourceMarkCredits().find((c) => c.sourceId === "lidl")!;
    expect(credit.credit).toMatch(/simple-icons/);
    expect(credit.credit).toMatch(/CC0/);
    expect(credit.credit).toMatch(/trademark/);
  });

  it("enumerates a credit for every mark it displays", () => {
    expect(sourceMarkCredits().map((c) => c.sourceId).sort()).toEqual(["lidl", "max-premium-burgers"]);
  });

  it("keeps a source without artwork a supported state, not a broken one", () => {
    expect(sourceMark("no-such-source")).toBeNull();
  });

  it("renders a mark as a data URI, so no markup is ever injected", () => {
    const mark: SourceMark = { svg: '<svg viewBox="0 0 2 1"><rect width="2" height="1"/></svg>', aspect: 2, alt: "X", credit: "test" };
    const uri = sourceMarkDataUri(mark);
    expect(uri.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    expect(uri).toContain("%3Csvg");
  });

  it("rejects a mark that would reach out to the network", () => {
    // Guard on auditVerifiedCatalog's own logic by exercising the source shape
    // it checks: a remote reference must be a catalog failure, not a broken box
    // rendered in front of an athlete.
    const bad: VerifiedSource = {
      id: "x", name: "X", kind: "brand", country: "PL", note: "n", trademark: "t",
      mark: { svg: '<svg><image href="https://example.com/logo.png"/></svg>', aspect: 1, alt: "X", credit: "c" },
    };
    VERIFIED_SOURCES.push(bad);
    try {
      const problems = auditVerifiedCatalog().join(" ");
      expect(problems).toMatch(/self-contained/);
    } finally {
      VERIFIED_SOURCES.pop();
    }
  });

  it("keeps the catalog clean with the mark checks in place", () => {
    expect(auditVerifiedCatalog()).toEqual([]);
  });
});

describe("freshness — the date finally does something", () => {
  const DAY = 86_400_000;
  const checkedAt = Date.parse("2026-07-29T00:00:00Z");

  it("ages a check in days", () => {
    expect(verifiedFreshness(verifiedFood("mpb-cheeseburger")!, checkedAt + 10 * DAY).ageDays).toBe(10);
  });

  it("holds a check good for a year", () => {
    const f = verifiedFood("mpb-cheeseburger")!;
    expect(verifiedFreshness(f, checkedAt + VERIFIED_STALE_AFTER_DAYS * DAY).stale).toBe(false);
    expect(verifiedFreshness(f, checkedAt + (VERIFIED_STALE_AFTER_DAYS + 1) * DAY).stale).toBe(true);
  });

  it("never reports a negative age for a check dated today", () => {
    expect(verifiedFreshness(verifiedFood("mpb-cheeseburger")!, checkedAt - DAY).ageDays).toBe(0);
  });

  it("lists the re-check worklist once items age out", () => {
    expect(staleVerifiedFoods(checkedAt)).toEqual([]);
    expect(staleVerifiedFoods(checkedAt + 400 * DAY)).toHaveLength(4);
  });
});
