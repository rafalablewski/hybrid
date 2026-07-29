import { describe, it, expect } from "vitest";
import {
  VERIFIED_FOODS, VERIFIED_SOURCES, auditVerifiedCatalog, mergeFoodHits, searchVerifiedFoods,
  sourceMark, sourceMarkCredits, sourceMarkDataUri,
  verifiedFood, verifiedFoodToHit, verifiedFoodsBySource, verifiedHits, verifiedKj, verifiedSource,
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
  it("states the published energy in both units", () => {
    expect(verifiedKj(verifiedFood("mpb-cheeseburger")!)).toBe(1368);
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
  it("finds an item by the operator's own menu name, accents and all", () => {
    // The menu is Polish; the app is English. A user who reads the menu must
    // still find the item they are holding.
    expect(searchVerifiedFoods("frytki").map((f) => f.id)).toEqual(["mpb-fries-small"]);
    expect(searchVerifiedFoods("male").map((f) => f.id)).toEqual(["mpb-fries-small"]);
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

describe("source marks", () => {
  // A mark identifies WHOSE food this is. It is attribution, never a claim that
  // the business endorsed us — so a source must always carry the trademark line
  // that says so, with or without artwork.
  it("requires a trademark line on every source, mark or not", () => {
    for (const s of VERIFIED_SOURCES) expect(s.trademark).toBeTruthy();
    expect(verifiedSource("max-premium-burgers")!.trademark).toMatch(/Max Burgers AB/);
  });

  it("falls back to the wordmark until real artwork is dropped in", () => {
    // Nothing fabricated: we ship no approximation of someone's logo.
    expect(sourceMark("max-premium-burgers")).toBeNull();
    expect(sourceMarkCredits()).toEqual([]);
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
