import { describe, it, expect } from "vitest";
import { normalizeOffProduct, normalizeOffResults, offSearchUrl, offBarcodeUrl, isLikelyBarcode } from "./nutrition-off";

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
