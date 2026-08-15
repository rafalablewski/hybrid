/**
 * Open Food Facts — the free, open food database (no API key, no licence fee).
 * This module holds the PURE mapping from OFF's loosely-typed product JSON to
 * HYBRID's normalized food shape, plus the endpoint URL builders, so web +
 * mobile + the server proxy all speak one format. Networking itself lives in the
 * server route (apps/web/app/api/nutrition/search) — this file is data + math
 * only, so it stays trivially testable and shared (the parity rule).
 */

import type { MicroFacts, VerifiedStamp } from "./food-facts";
import { portionMeasure, dedupePortions, type FoodPortion } from "./portion";
import { resolveUnit } from "./serving-units";

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
  /** THE PACK, AS THE CATALOG PUBLISHES IT. Open Food Facts records the net
   *  quantity printed on every product it holds — and this app spent its first
   *  cut asking the athlete to type it instead, which does not scale past the
   *  few foods anybody has patience for. Source "catalog" (see portion.ts). */
  portions?: FoodPortion[];
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
  /** the net quantity as PRINTED — "400 ml", "1 kg", "6 x 250 ml" */
  quantity?: string;
  /** OFF's own parsed net quantity, when it managed to parse one */
  product_quantity?: number | string;
  /** "g" or "ml" — present on newer entries only */
  product_quantity_unit?: string;
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
 * READ THE PACK OFF THE CATALOG ENTRY.
 *
 * Every product Open Food Facts holds records its net quantity — the figure
 * printed on the pack — as a human string (`quantity`: "400 ml", "1 kg",
 * "6 x 250 ml") and, when OFF managed to parse it, as a number
 * (`product_quantity` + `product_quantity_unit`). This app's first cut of
 * portions asked the ATHLETE for that number, which is fine for the four foods
 * anybody has patience for and hopeless across a shelf.
 *
 * A MULTIPACK YIELDS TWO PORTIONS, not one. "6 x 250 ml" means somebody drinks
 * 250 ml and somebody else buys 1.5 l, and the one you want is nearly always
 * the single — so both are offered and the smaller sorts first (portion.ts).
 *
 * THE UNIT MUST MATCH THE FOOD'S OWN MEASURE. A pack stated in millilitres on a
 * food whose serving is in grams is dropped rather than converted: that needs a
 * density this app does not have, which is the same line drawn everywhere else.
 * OFF's own data is not clean enough to assume otherwise.
 */
export function parsePackQuantity(text: string | undefined | null): { size: number; unit: string }[] {
  const raw = (text ?? "").trim().toLowerCase();
  if (!raw) return [];
  // An optional "N x" multiplier, then a number and a unit word.
  const m = /(?:(\d+(?:[.,]\d+)?)\s*[x×*]\s*)?(\d+(?:[.,]\d+)?)\s*([a-zà-ÿ]+)/.exec(raw);
  if (!m) return [];
  const each = parseFloat(m[2]!.replace(",", "."));
  const unit = resolveUnit(m[3]!);
  if (!Number.isFinite(each) || each <= 0 || !unit || unit.base == null) return [];
  // Mass normalizes to grams, volume to millilitres — the two units a scale and
  // a carton are actually marked in.
  const size = Math.round(each * unit.base * 100) / 100;
  const id = unit.kind === "mass" ? "g" : "ml";
  if (size <= 0 || size > 100_000) return [];
  const count = m[1] ? parseFloat(m[1].replace(",", ".")) : 1;
  const out = [{ size, unit: id }];
  if (Number.isFinite(count) && count > 1 && count <= 100) {
    const total = Math.round(size * count * 100) / 100;
    if (total <= 100_000) out.push({ size: total, unit: id });
  }
  return out;
}

/** The catalog's portions for one product, in the food's own measure. OFF's
 *  parsed pair is preferred over the printed string — it is the same claim with
 *  the parsing already done — and the string is the fallback, which is what
 *  most of the database actually has. */
export function offPortions(p: OffProduct, measureUnit: string | null): FoodPortion[] {
  if (!measureUnit) return [];
  const parsed: { size: number; unit: string }[] = [];
  const n = typeof p.product_quantity === "number" ? p.product_quantity : parseFloat(String(p.product_quantity ?? ""));
  const parsedUnit = (p.product_quantity_unit ?? "").trim().toLowerCase();
  if (Number.isFinite(n) && n > 0 && n <= 100_000) {
    // No unit stated is the common case on older entries. OFF's own convention
    // is grams-or-millilitres to match the nutrition basis, so the food's own
    // measure is the honest reading — and it is only ever USED when it matches.
    parsed.push({ size: Math.round(n * 100) / 100, unit: parsedUnit === "ml" ? "ml" : parsedUnit === "g" ? "g" : measureUnit });
  }
  const fromText = parsePackQuantity(p.quantity);
  // The printed string is what carries multipacks, so it is always read too.
  const all = [...parsed, ...fromText];
  return dedupePortions(
    all.filter((x) => x.unit === measureUnit)
      // No label: the catalog publishes a quantity, not a word for the
      // container. Inventing an English "bottle" would put a translation
      // nobody chose into every athlete's database (portion.ts).
      .map((x) => ({ label: "", size: x.size, source: "catalog" as const })),
  );
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
  const servingGrams = parseServingGrams(hasServing ? p.serving_size : "100 g");
  // Which measure this food is sold in decides which pack figures are readable
  // at all — see offPortions.
  const measure = portionMeasure({ serving, servingGrams });
  return {
    code: (p.code ?? "").trim(),
    name: name.slice(0, 80),
    brand: p.brands?.split(",")[0]?.trim() || null,
    serving: serving.slice(0, 40),
    servingGrams,
    portions: offPortions(p, measure?.unit ?? null),
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
// `quantity` / `product_quantity` are the NET PACK SIZE. They cost nothing to
// ask for and they are the reason "log the whole bottle" works across a
// supermarket rather than across the four foods somebody typed in by hand.
const OFF_FIELDS = "code,product_name,product_name_en,brands,serving_size,quantity,product_quantity,product_quantity_unit,nutriments";

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
