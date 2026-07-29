/**
 * HYBRID Verified — foods whose numbers our team checked at source.
 *
 * WHY THIS EXISTS. Open Food Facts (nutrition-off.ts) is broad, free and
 * crowd-sourced — and crowd-sourced is exactly its weakness: duplicate entries,
 * per-100 g numbers filed as per-serving, missing saturates, a "cheeseburger"
 * that is somebody's homemade guess. For the foods our athletes eat most often
 * that isn't good enough. A HYBRID VERIFIED item is one a human on our team
 * transcribed from the operator's own published nutrition table, reconciled
 * against 4·4·9 (auditFacts), and dated. It is the trusted tier of the same
 * search box — pinned above community results, never mixed in unmarked.
 *
 * WHAT THE BADGE PROMISES:
 *   1. the numbers come from the business that sells the food, not a guess;
 *   2. they are PER THE STATED SERVING, with the serving weight where published;
 *   3. every field shown was stated — an unstated field is `null`, never 0;
 *   4. it carries a date, so a stale entry is visible rather than silent.
 *
 * This file is DATA + pure lookup only (no I/O), so both clients and the server
 * proxy read one identical catalog (the parity rule). Adding a business is
 * adding a `VerifiedSource` + its `VerifiedFood[]` here — no migration, no
 * table, no key.
 */

import { type NutritionFacts, atwaterKcal, auditFacts, factsCompleteness, kj } from "./food-facts";
import type { FoodHit } from "./nutrition-off";

// ── Types ──────────────────────────────────────────────────────────────────

/** The business behind a verified food — a chain, a brand, a producer. */
export interface VerifiedSource {
  id: string;
  /** display name, exactly as the business writes it */
  name: string;
  kind: "restaurant" | "brand" | "retailer";
  /** ISO-3166 alpha-2 of the market these numbers are published for */
  country: string;
  /** one line of context, shown under the name on the source sheet */
  note: string;
}

/** One verified item. `facts` are PER `servingLabel`. */
export interface VerifiedFood {
  id: string;
  sourceId: string;
  /** canonical ENGLISH name — the app is English-first, menus are not */
  name: string;
  /** the item's name on the operator's own menu when it differs; also a search alias */
  menuName?: string;
  /** BCP-47 tag of `menuName` */
  menuLocale?: string;
  /** what one serving is, e.g. "1 burger (121 g)" */
  servingLabel: string;
  /** the serving's weight in grams when published — enables per-100 g comparison */
  servingGrams: number | null;
  facts: NutritionFacts;
  /** ISO date (YYYY-MM-DD) the team last checked these numbers */
  verifiedOn: string;
  /** where the numbers came from, in plain words */
  provenance: string;
}

// ── The catalog ────────────────────────────────────────────────────────────

export const VERIFIED_SOURCES: VerifiedSource[] = [
  {
    id: "max-premium-burgers",
    name: "Max Premium Burgers",
    kind: "restaurant",
    country: "PL",
    note: "Polish premium burger chain. Nutrition per the operator's published per-item table.",
  },
];

export const VERIFIED_FOODS: VerifiedFood[] = [
  {
    id: "mpb-cheeseburger",
    sourceId: "max-premium-burgers",
    name: "Cheeseburger",
    menuName: "Hamburger z serem",
    menuLocale: "pl",
    servingLabel: "1 burger (121 g)",
    servingGrams: 121,
    // 19.6·9 + 22.9·4 + 14.2·4 = 325 kcal vs the stated 327 — inside tolerance,
    // the usual rounding of a label computed from unrounded gram values.
    facts: { kcal: 327, protein: 14.2, carbs: 22.9, fat: 19.6, satFat: 7.3, sugar: 4.1, fiber: null, salt: 1.7 },
    verifiedOn: "2026-07-29",
    provenance: "Max Premium Burgers published nutrition table (PL), per 121 g portion.",
  },
  {
    id: "mpb-chicken-jr",
    sourceId: "max-premium-burgers",
    name: "Chicken Jr",
    menuName: "Kurczak Burger Junior",
    menuLocale: "pl",
    servingLabel: "1 burger (123 g)",
    servingGrams: 123,
    // Saturates, sugars and salt are NOT stated for this item — null, not zero.
    facts: { kcal: 311, protein: 10.5, carbs: 33.9, fat: 14.5, satFat: null, sugar: null, fiber: null, salt: null },
    verifiedOn: "2026-07-29",
    provenance: "Max Premium Burgers published nutrition table (PL), per 123 g portion.",
  },
  {
    id: "mpb-fries-small",
    sourceId: "max-premium-burgers",
    name: "Fries (small)",
    menuName: "Frytki małe",
    menuLocale: "pl",
    // The operator states the portion but not its weight — so we state the
    // portion and leave grams unknown rather than inventing one.
    servingLabel: "1 small portion",
    servingGrams: null,
    facts: { kcal: 172, protein: 1.9, carbs: 25.4, fat: 6.9, satFat: 0.7, sugar: 0.2, fiber: null, salt: 0.6 },
    verifiedOn: "2026-07-29",
    provenance: "Max Premium Burgers published nutrition table (PL), per small portion.",
  },
];

// ── Lookup ─────────────────────────────────────────────────────────────────

const byId = new Map(VERIFIED_SOURCES.map((s) => [s.id, s]));

/** The business behind a verified food. */
export function verifiedSource(sourceId: string): VerifiedSource | null {
  return byId.get(sourceId) ?? null;
}

/** One verified food by its stable id (what a log stores as provenance). */
export function verifiedFood(id: string): VerifiedFood | null {
  return VERIFIED_FOODS.find((f) => f.id === id) ?? null;
}

// Letters that carry their mark INSIDE the glyph, so NFD can't split them off.
// Polish "\u0142" is the one that matters here (Frytki ma\u0142e) \u2014 without this, stripping
// non-ASCII would turn "ma\u0142e" into "ma e" and a search for "male" would miss.
const FOLD: Record<string, string> = { \u0142: "l", \u0111: "d", \u00f0: "d", \u00f8: "o", \u00e6: "ae", \u0153: "oe", \u00df: "ss", \u00fe: "th" };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\u0142\u0111\u00f0\u00f8\u00e6\u0153\u00df\u00fe]/g, (c) => FOLD[c] ?? c)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Search the verified catalog. Matches the English name, the operator's own
 * menu name (so a Polish query for "frytki" finds "Fries (small)") and the
 * business name (so "max premium" lists everything they sell).
 *
 * Ranked: a name that STARTS with the query beats one that merely contains it,
 * which beats a business-name-only match; ties break on how label-complete the
 * item is. Every term in a multi-word query must match somewhere.
 */
export function searchVerifiedFoods(query: string, limit = 8): VerifiedFood[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const terms = q.split(" ");
  const scored: { f: VerifiedFood; score: number }[] = [];
  for (const f of VERIFIED_FOODS) {
    const name = norm(f.name);
    const menu = f.menuName ? norm(f.menuName) : "";
    const src = norm(verifiedSource(f.sourceId)?.name ?? "");
    const hay = `${name} ${menu} ${src}`;
    if (!terms.every((t) => hay.includes(t))) continue;
    let score = 1;
    if (name.includes(q) || menu.includes(q)) score = 2;
    if (name.startsWith(q) || menu.startsWith(q)) score = 3;
    scored.push({ f, score: score + factsCompleteness(f.facts) });
  }
  return scored.sort((a, b) => b.score - a.score || a.f.name.localeCompare(b.f.name)).slice(0, limit).map((s) => s.f);
}

/** Every verified item a business sells. */
export function verifiedFoodsBySource(sourceId: string): VerifiedFood[] {
  return VERIFIED_FOODS.filter((f) => f.sourceId === sourceId);
}

// ── Adapter into the shared search row ─────────────────────────────────────

/**
 * Present a verified item as the SAME `FoodHit` row the Open Food Facts proxy
 * returns, so the picker, the portion editor and the logging path need no
 * special case — only the `verified` stamp, which is what the badge renders.
 */
export function verifiedFoodToHit(f: VerifiedFood): FoodHit {
  const src = verifiedSource(f.sourceId);
  return {
    code: "",
    id: f.id,
    name: f.name,
    brand: src?.name ?? null,
    serving: f.servingLabel,
    kcal: f.facts.kcal,
    protein: f.facts.protein,
    carbs: f.facts.carbs,
    fat: f.facts.fat,
    satFat: f.facts.satFat ?? null,
    sugar: f.facts.sugar ?? null,
    fiber: f.facts.fiber ?? null,
    salt: f.facts.salt ?? null,
    servingGrams: f.servingGrams,
    perServing: true,
    verified: src ? { sourceId: src.id, sourceName: src.name, verifiedOn: f.verifiedOn } : undefined,
  };
}

/** The verified catalog as search rows — used to pin verified hits above OFF. */
export function verifiedHits(query: string, limit = 8): FoodHit[] {
  return searchVerifiedFoods(query, limit).map(verifiedFoodToHit);
}

/**
 * ONE result list for the single search box: verified items first, then the
 * community database. A community row that describes the SAME item as a
 * verified one (same brand + same name) is dropped — otherwise the trusted row
 * and a stranger's guess would sit side by side and the user would have to pick.
 */
export function mergeFoodHits(verified: FoodHit[], community: FoodHit[], limit = 24): FoodHit[] {
  const key = (h: FoodHit) => `${norm(h.brand ?? "")}|${norm(h.name)}`;
  const taken = new Set(verified.map(key));
  const out = [...verified];
  for (const h of community) {
    if (out.length >= limit) break;
    const k = key(h);
    if (taken.has(k)) continue;
    taken.add(k);
    out.push(h);
  }
  return out.slice(0, limit);
}

// ── Catalog integrity ──────────────────────────────────────────────────────

/**
 * Audit the whole catalog: unique ids, a known source, and numbers that
 * reconcile. This is asserted in the unit tests, so a mis-transcribed item can
 * never ship under the badge — the badge is only worth something if adding to
 * this file is harder than adding to a spreadsheet.
 */
export function auditVerifiedCatalog(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const f of VERIFIED_FOODS) {
    if (seen.has(f.id)) problems.push(`${f.id}: duplicate id`);
    seen.add(f.id);
    if (!verifiedSource(f.sourceId)) problems.push(`${f.id}: unknown source "${f.sourceId}"`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.verifiedOn)) problems.push(`${f.id}: verifiedOn must be YYYY-MM-DD`);
    for (const p of auditFacts(f.facts)) problems.push(`${f.id}: ${p}`);
  }
  return problems;
}

/** Energy in kJ for a verified item — the second unit EU labels must state. */
export function verifiedKj(f: VerifiedFood): number {
  return kj(f.facts.kcal);
}

/** The 4·4·9 cross-check for a verified item, exposed for the source sheet. */
export function verifiedAtwater(f: VerifiedFood): number {
  return atwaterKcal(f.facts);
}
