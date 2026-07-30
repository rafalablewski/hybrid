import type { FuelToday } from "./engines/nutrition";

// ============================================================
//  Nutrition HUD — the sticky element the nutrition screens leave behind.
//
//  The calorie ring answers "how much is left?" ONCE, at the top of the hub.
//  Scroll past it into the diary, your meals, your products or the food picker
//  and the answer is gone — you choose food with no budget on screen. This
//  engine owns the rule that keeps it there: a contracted rail of at most four
//  capsules, where each capsule is THE RESIDUE OF A CARD YOU HAVE ALREADY READ:
//
//    kcal                  ← the calorie ring     "how much energy is left"
//    protein / carbs / fat ← the macro card       "left of each"
//
//  A capsule is captured the moment its source card's bottom edge passes under
//  the bar and released the moment that edge comes back, so the rail is always
//  a mirror of how far down the page you are.
//
//  The picker and the library screens have NO ring to scroll past — there the
//  bar is the only budget on screen, so they pass `always` and the rail is
//  pinned from the first pixel. That is not a special case bolted on; it is the
//  same state machine with every source already behind you.
//
//  Pure and client-agnostic: web measures with getBoundingClientRect, mobile
//  with onLayout, and both feed the SAME numbers in here so the two clients
//  capture at identical points (see aurora/nutrition-hud.tsx on both clients).
//  Deliberately shaped like today-rail.ts — this is the same idiom, and the two
//  should read as one product.
// ============================================================

/** The four capsules, in the only order they may ever appear. */
export type NutritionHudPill = "kcal" | "protein" | "carbs" | "fat";

/** Fixed capture order — capsules arrive left to right and never reshuffle. */
export const NUTRITION_HUD_ORDER: readonly NutritionHudPill[] = ["kcal", "protein", "carbs", "fat"] as const;

/** The three that ride the macro card, so one anchor drives all of them. */
export const NUTRITION_HUD_MACROS: readonly NutritionHudPill[] = ["protein", "carbs", "fat"] as const;

/** The bar's own height (dp/px) — a source is "under the bar" once its bottom
 *  edge passes this far into the viewport. Matches TODAY_RAIL_BAR_H on purpose:
 *  two rails at different heights would read as two different products. */
export const NUTRITION_HUD_BAR_H = 46;

/** Release happens slightly LATER than capture so a capsule can't strobe when
 *  the athlete rests a finger exactly on the threshold. */
export const NUTRITION_HUD_HYSTERESIS = 6;

/**
 * The bottom edge of each source card, in content space (the distance from the
 * top of the scrollable content to that card's bottom edge) — NOT viewport
 * space. `null` when the card isn't rendered at all; that capsule then never
 * captures. `0` pins from the first pixel.
 */
export interface NutritionHudAnchors {
  /** the calorie-ring card — feeds the kcal capsule. */
  energy: number | null;
  /** the macro card — feeds protein, carbs and fat together. */
  macros: number | null;
}

export interface NutritionHudState {
  /** captured capsules, always a prefix-ordered subset of NUTRITION_HUD_ORDER. */
  captured: NutritionHudPill[];
  /** the bar itself is visible (≥1 capsule). */
  pinned: boolean;
  /** at the ceiling, so the macro capsules shed their `g` to make room. The
   *  kcal capsule keeps its "left" — that word is the whole feature. */
  tight: boolean;
}

export interface NutritionHudOpts {
  /** override the bar height when a client's chrome differs. */
  barH?: number;
  /** release margin; 0 disables hysteresis. */
  hysteresis?: number;
  /** the previous frame's captured list, so release can lag capture. */
  prev?: readonly NutritionHudPill[];
  /** the sub-screens: no ring to scroll past, so every capsule is already
   *  behind you. Anchors and scroll position are ignored. */
  always?: boolean;
}

/**
 * Resolve the rail for a scroll position.
 *
 * A capsule captures at `bottom - barH` and releases at
 * `bottom - barH - hysteresis`, so the two thresholds never coincide.
 */
export function nutritionHudState(
  anchors: NutritionHudAnchors,
  scrollY: number,
  opts: NutritionHudOpts = {},
): NutritionHudState {
  if (opts.always) {
    return { captured: [...NUTRITION_HUD_ORDER], pinned: true, tight: true };
  }

  const barH = opts.barH ?? NUTRITION_HUD_BAR_H;
  const hysteresis = Math.max(0, opts.hysteresis ?? NUTRITION_HUD_HYSTERESIS);
  const prev = opts.prev ?? [];
  const captured: NutritionHudPill[] = [];

  const passed = (bottom: number | null, key: NutritionHudPill) => {
    if (bottom == null || !Number.isFinite(bottom)) return false;
    // Held capsules use the looser threshold, so coming back up releases a
    // touch later than going down captured it.
    return scrollY >= bottom - barH - (prev.includes(key) ? hysteresis : 0);
  };

  for (const key of NUTRITION_HUD_ORDER) {
    const bottom = key === "kcal" ? anchors.energy : anchors.macros;
    if (passed(bottom, key)) captured.push(key);
  }

  return {
    captured,
    pinned: captured.length > 0,
    tight: captured.length >= NUTRITION_HUD_ORDER.length,
  };
}

/** One capsule's readout. */
export interface NutritionHudSlot {
  key: NutritionHudPill;
  /** what's LEFT — the number the athlete came for. Negative once past target. */
  left: number;
  /** logged so far. */
  value: number;
  target: number;
  /** consumed ÷ target as a 0–100 fill, clamped. */
  pct: number;
  /** strictly past the target, so the capsule reads as a breach. */
  over: boolean;
}

/**
 * The four readouts, derived from the SAME fuelToday() the hero ring renders —
 * so the rail and the ring can never disagree about the day. Feed it
 * `fuelToday(signals, { goal, trainingKcal })`.
 */
export function nutritionHudSlots(fuel: FuelToday): NutritionHudSlot[] {
  const slot = (key: NutritionHudPill, value: number, target: number, pct: number): NutritionHudSlot => {
    const left = Math.round(target - value);
    return { key, left, value: Math.round(value), target: Math.round(target), pct, over: left < 0 };
  };
  return [
    slot("kcal", fuel.today.kcal, fuel.targets.kcal, fuel.kcalPct),
    slot("protein", fuel.macros.protein.value, fuel.macros.protein.target, fuel.macros.protein.pct),
    slot("carbs", fuel.macros.carbs.value, fuel.macros.carbs.target, fuel.macros.carbs.pct),
    slot("fat", fuel.macros.fat.value, fuel.macros.fat.target, fuel.macros.fat.pct),
  ];
}

/** A slot by key, for clients that render the capsules positionally. */
export function nutritionHudSlot(slots: readonly NutritionHudSlot[], key: NutritionHudPill): NutritionHudSlot | undefined {
  return slots.find((s) => s.key === key);
}

/** The single-letter prefix the three macro capsules carry, so a 46dp bar can
 *  hold four numbers without four words. Energy has no letter — it is the
 *  headline number and reads as itself. */
export const NUTRITION_HUD_LETTER: Record<NutritionHudPill, string> = {
  kcal: "",
  protein: "P",
  carbs: "C",
  fat: "F",
};

/** Which brand accent a capsule wears. Mirrors the macro card beneath it — the
 *  capsule is that row's residue, so it must not recolour it. */
export const NUTRITION_HUD_ACCENT: Record<NutritionHudPill, "lime" | "blue" | "amber" | "violet"> = {
  kcal: "lime",
  protein: "blue",
  carbs: "amber",
  fat: "violet",
};
