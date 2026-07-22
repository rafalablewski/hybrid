/**
 * Open Food Facts — the free, open food database (no API key, no licence fee).
 * This module holds the PURE mapping from OFF's loosely-typed product JSON to
 * HYBRID's normalized food shape, plus the endpoint URL builders, so web +
 * mobile + the server proxy all speak one format. Networking itself lives in the
 * server route (apps/web/app/api/nutrition/search) — this file is data + math
 * only, so it stays trivially testable and shared (the parity rule).
 */

export interface OffFood {
  /** barcode (EAN/UPC), "" when a text-search hit has none */
  code: string;
  name: string;
  brand: string | null;
  /** human serving label, e.g. "30 g" or "100 g" */
  serving: string;
  kcal: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
  /** true = macros are per the serving above; false = per 100 g */
  perServing: boolean;
}

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

/**
 * Map ONE OFF product to a normalized food, or null when it's too sparse to be
 * useful (no name, or no macros at all). Prefers the per-serving nutriments when
 * OFF provides them, else falls back to per-100 g — `perServing` tells the caller
 * which basis the numbers are on so the UI can label it honestly.
 */
export function normalizeOffProduct(p: OffProduct): OffFood | null {
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
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    perServing: hasServing,
  };
}

/**
 * Map an OFF response to normalized foods — the search endpoint returns
 * `products`, the barcode endpoint a single `product`. Drops the unusable,
 * dedupes by barcode (or name when no code), and caps the list.
 */
export function normalizeOffResults(json: { products?: OffProduct[]; product?: OffProduct }, limit = 20): OffFood[] {
  const raw = json.products ?? (json.product ? [json.product] : []);
  const out: OffFood[] = [];
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
