/**
 * Open Food Facts — the free, open food database (no API key, no licence fee).
 * This module holds the PURE mapping from OFF's loosely-typed product JSON to
 * HYBRID's normalized food shape, plus the endpoint URL builders, so web +
 * mobile + the server proxy all speak one format. Networking itself lives in the
 * server route (apps/web/app/api/nutrition/search) — this file is data + math
 * only, so it stays trivially testable and shared (the parity rule).
 */

import type { MicroFacts, VerifiedStamp } from "./food-facts";

/**
 * ONE normalized search row, whatever tier it came from: an Open Food Facts
 * community entry, or a HYBRID Verified item (verified-foods.ts) — which is the
 * same shape carrying a `verified` stamp. The picker, the portion editor and the
 * logging path therefore need no special case; only the badge reads the stamp.
 *
 * The optional label fields (satFat/sugar/fiber/salt) follow the MicroFacts
 * contract: `null` means NOT STATED and must never render as 0 g.
 */
export interface FoodHit extends MicroFacts {
  /** barcode (EAN/UPC), "" when a text-search hit has none */
  code: string;
  /** stable catalog id for a verified item; absent for a community hit */
  id?: string;
  name: string;
  brand: string | null;
  /** human serving label, e.g. "30 g" or "100 g" */
  serving: string;
  /** the serving's weight in grams when known — enables per-100 g comparison */
  servingGrams?: number | null;
  kcal: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
  /** true = macros are per the serving above; false = per 100 g */
  perServing: boolean;
  /** present only on a HYBRID Verified item — what the ✓ badge renders */
  verified?: VerifiedStamp;
}

/** @deprecated name kept so existing imports keep compiling — use `FoodHit`. */
export type OffFood = FoodHit;

// OFF's nutriments block is a loose bag of optional numeric-ish keys.
type Nutriments = Record<string, number | string | undefined>;
interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  serving_size?: string;
  nutriments?: Nutriments;
}

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(x) && x >= 0 ? x : 0;
};

/** Like `n`, but keeps the NOT-STATED case as null — OFF leaves most optional
 *  label fields empty, and an empty saturates field is not a fat-free food. */
const nOrNull = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const x = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(x) && x >= 0 ? Math.round(x * 10) / 10 : null;
};

/** Read one optional label field on the SAME basis (serving vs 100 g) the macros
 *  were read on, so a panel never mixes the two. */
const micro = (nut: Nutriments, key: string, hasServing: boolean): number | null =>
  nOrNull(hasServing ? nut[`${key}_serving`] : nut[`${key}_100g`]);

/** "121 g" / "1 burger (121g)" / "330 ml" → 121 — the serving WEIGHT when OFF
 *  states one, so per-100 g comparison works on a community hit too. */
export function parseServingGrams(label: string | undefined | null): number | null {
  if (!label) return null;
  const m = /(\d+(?:[.,]\d+)?)\s*(g|gram|grams)\b/i.exec(label);
  if (!m) return null;
  const v = parseFloat(m[1]!.replace(",", "."));
  return Number.isFinite(v) && v > 0 && v < 5000 ? v : null;
}

/**
 * Map ONE OFF product to a normalized food, or null when it's too sparse to be
 * useful (no name, or no macros at all). Prefers the per-serving nutriments when
 * OFF provides them, else falls back to per-100 g — `perServing` tells the caller
 * which basis the numbers are on so the UI can label it honestly.
 */
export function normalizeOffProduct(p: OffProduct): FoodHit | null {
  const name = (p.product_name || p.product_name_en || "").trim();
  if (!name) return null;
  const nut = p.nutriments ?? {};
  const hasServing = nut["energy-kcal_serving"] != null || nut["proteins_serving"] != null;
  const kcal = hasServing ? n(nut["energy-kcal_serving"]) : n(nut["energy-kcal_100g"]);
  const protein = hasServing ? n(nut["proteins_serving"]) : n(nut["proteins_100g"]);
  const carbs = hasServing ? n(nut["carbohydrates_serving"]) : n(nut["carbohydrates_100g"]);
  const fat = hasServing ? n(nut["fat_serving"]) : n(nut["fat_100g"]);
  if (kcal <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) return null;
  const serving = hasServing && p.serving_size?.trim() ? p.serving_size.trim() : hasServing ? "1 serving" : "100 g";
  return {
    code: (p.code ?? "").trim(),
    name: name.slice(0, 80),
    brand: p.brands?.split(",")[0]?.trim() || null,
    serving: serving.slice(0, 40),
    servingGrams: parseServingGrams(hasServing ? p.serving_size : "100 g"),
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    // The label panel beyond the four macros — kept null where OFF has no value
    // so the UI can say "not stated" instead of implying a zero.
    satFat: micro(nut, "saturated-fat", hasServing),
    sugar: micro(nut, "sugars", hasServing),
    fiber: micro(nut, "fiber", hasServing),
    salt: micro(nut, "salt", hasServing),
    perServing: hasServing,
  };
}

/**
 * Map an OFF response to normalized foods — the search endpoint returns
 * `products`, the barcode endpoint a single `product`. Drops the unusable,
 * dedupes by barcode (or name when no code), and caps the list.
 */
export function normalizeOffResults(json: { products?: OffProduct[]; product?: OffProduct }, limit = 20): FoodHit[] {
  const raw = json.products ?? (json.product ? [json.product] : []);
  const out: FoodHit[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    const f = normalizeOffProduct(p);
    if (!f) continue;
    const key = f.code || f.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}

// ── Endpoint URL builders — kept here so the OFF host + field set live in ONE
//    place the server route imports. OFF asks callers to send a descriptive
//    User-Agent (the route adds it).
const OFF_HOST = "https://world.openfoodfacts.org";
const OFF_FIELDS = "code,product_name,product_name_en,brands,serving_size,nutriments";

/** Full-text product search (the legacy search.pl endpoint — the reliable text
 *  search), constrained to the fields we normalize. */
export function offSearchUrl(query: string, pageSize = 20): string {
  const q = encodeURIComponent(query.trim().slice(0, 100));
  return `${OFF_HOST}/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=${OFF_FIELDS}`;
}

/** Single-product lookup by barcode (digits only). */
export function offBarcodeUrl(barcode: string): string {
  const code = barcode.replace(/[^0-9]/g, "").slice(0, 20);
  return `${OFF_HOST}/api/v2/product/${code}.json?fields=${OFF_FIELDS}`;
}

/** A barcode is plausible when it's 8–14 digits (EAN-8 … GTIN-14). */
export function isLikelyBarcode(s: string): boolean {
  return /^\d{8,14}$/.test(s.replace(/\s/g, ""));
}
