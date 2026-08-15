import { describe, it, expect } from "vitest";
import { normalizeOffProduct, normalizeOffResults, offSearchUrl, offBarcodeUrl, isLikelyBarcode, parsePackQuantity, offPortions } from "./nutrition-off";

describe("normalizeOffProduct", () => {
  it("prefers per-serving nutriments when present", () => {
    const f = normalizeOffProduct({
      code: "737628064502",
      product_name: "Thai peanut noodle kit",
      brands: "Simply Asia, Sub-brand",
      serving_size: "85 g",
      nutriments: {
        "energy-kcal_100g": 379,
        "energy-kcal_serving": 322,
        "proteins_100g": 12,
        "proteins_serving": 10,
        "carbohydrates_100g": 62,
        "carbohydrates_serving": 53,
        "fat_100g": 9,
        "fat_serving": 7.5,
      },
    })!;
    expect(f.name).toBe("Thai peanut noodle kit");
    expect(f.brand).toBe("Simply Asia"); // first brand only
    expect(f.perServing).toBe(true);
    expect(f.serving).toBe("85 g");
    expect(f.kcal).toBe(322);
    expect(f.protein).toBe(10);
    expect(f.carbs).toBe(53);
    expect(f.fat).toBe(8); // 7.5 rounded
  });

  it("falls back to per-100 g when there is no serving data", () => {
    const f = normalizeOffProduct({
      code: "1",
      product_name: "Rolled oats",
      nutriments: { "energy-kcal_100g": 389, "proteins_100g": 16.9, "carbohydrates_100g": 66, "fat_100g": 6.9 },
    })!;
    expect(f.perServing).toBe(false);
    expect(f.serving).toBe("100 g");
    expect(f.kcal).toBe(389);
    expect(f.protein).toBe(17);
  });

  it("rejects products with no name or no macros", () => {
    expect(normalizeOffProduct({ code: "1", nutriments: { "energy-kcal_100g": 100 } })).toBeNull();
    expect(normalizeOffProduct({ code: "1", product_name: "Water", nutriments: {} })).toBeNull();
  });
});

describe("normalizeOffResults", () => {
  it("maps a search response, dropping unusable + deduping by code", () => {
    const foods = normalizeOffResults({
      products: [
        { code: "a", product_name: "Oats", nutriments: { "energy-kcal_100g": 389, "proteins_100g": 17 } },
        { code: "a", product_name: "Oats (dup)", nutriments: { "energy-kcal_100g": 389 } }, // dup code
        { code: "b", product_name: "", nutriments: { "energy-kcal_100g": 100 } }, // no name
        { code: "c", product_name: "Rice", nutriments: { "energy-kcal_100g": 130, "carbohydrates_100g": 28 } },
      ],
    });
    expect(foods.map((f) => f.name)).toEqual(["Oats", "Rice"]);
  });

  it("maps a single-product (barcode) response and honours the limit", () => {
    const one = normalizeOffResults({ product: { code: "x", product_name: "Bar", nutriments: { "energy-kcal_serving": 200 } } });
    expect(one).toHaveLength(1);
    expect(one[0]!.name).toBe("Bar");
    const many = normalizeOffResults(
      { products: Array.from({ length: 30 }, (_, i) => ({ code: String(i), product_name: `P${i}`, nutriments: { "energy-kcal_100g": 100 } })) },
      5,
    );
    expect(many).toHaveLength(5);
  });
});

describe("url builders + barcode check", () => {
  it("builds an escaped search url", () => {
    expect(offSearchUrl("greek yogurt")).toContain("search_terms=greek%20yogurt");
  });
  it("strips non-digits from a barcode url", () => {
    expect(offBarcodeUrl(" 737-628 064502 ")).toContain("/product/737628064502.json");
  });
  it("recognises plausible barcodes", () => {
    expect(isLikelyBarcode("737628064502")).toBe(true);
    expect(isLikelyBarcode("12345")).toBe(false);
    expect(isLikelyBarcode("greek yogurt")).toBe(false);
  });
});

describe("the pack the catalog already published", () => {
  it("reads a printed net quantity", () => {
    expect(parsePackQuantity("400 ml")).toEqual([{ size: 400, unit: "ml" }]);
    expect(parsePackQuantity("500g")).toEqual([{ size: 500, unit: "g" }]);
  });

  it("normalizes to the two units a scale and a carton are marked in", () => {
    expect(parsePackQuantity("1 kg")).toEqual([{ size: 1000, unit: "g" }]);
    expect(parsePackQuantity("1,5 l")).toEqual([{ size: 1500, unit: "ml" }]);
    expect(parsePackQuantity("33 cl")).toEqual([{ size: 330, unit: "ml" }]);
  });

  it("gives a multipack BOTH the single and the whole thing", () => {
    // Somebody drinks 250 ml; somebody else bought 1.5 l.
    expect(parsePackQuantity("6 x 250 ml")).toEqual([
      { size: 250, unit: "ml" },
      { size: 1500, unit: "ml" },
    ]);
  });

  it("refuses what it cannot read", () => {
    expect(parsePackQuantity("")).toEqual([]);
    expect(parsePackQuantity("family size")).toEqual([]);
    expect(parsePackQuantity("2 pieces")).toEqual([]); // a count is not a measure
  });

  it("DROPS a pack stated in the wrong measure for the food", () => {
    // 400 ml on a food whose serving is in grams needs a density we don't have.
    expect(offPortions({ quantity: "400 ml" }, "g")).toEqual([]);
    expect(offPortions({ quantity: "400 ml" }, "ml")).toEqual([{ label: "", size: 400, source: "catalog" }]);
  });

  it("prefers OFF's own parsed pair, and still reads the string for multipacks", () => {
    const out = offPortions({ product_quantity: 250, product_quantity_unit: "ml", quantity: "6 x 250 ml" }, "ml");
    expect(out.map((p) => p.size)).toEqual([250, 1500]);
  });

  it("carries the pack onto the normalized hit", () => {
    const hit = normalizeOffProduct({
      product_name: "Kefir",
      quantity: "400 g",
      nutriments: { "energy-kcal_100g": 50, proteins_100g: 3, carbohydrates_100g: 4, fat_100g: 2 },
    })!;
    expect(hit.portions).toEqual([{ label: "", size: 400, source: "catalog" }]);
  });

  it("leaves a product that never stated one with nothing", () => {
    const hit = normalizeOffProduct({
      product_name: "Loose spinach",
      nutriments: { "energy-kcal_100g": 23, proteins_100g: 3, carbohydrates_100g: 1, fat_100g: 0 },
    })!;
    expect(hit.portions).toEqual([]);
  });
});
