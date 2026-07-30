import { describe, it, expect } from "vitest";
import {
  NUTRITION_HUD_BAR_H,
  NUTRITION_HUD_HYSTERESIS,
  NUTRITION_HUD_ORDER,
  nutritionHudSlot,
  nutritionHudSlots,
  nutritionHudState,
  type NutritionHudPill,
} from "./nutrition-hud";
import { fuelToday } from "./engines/nutrition";
import type { Signal } from "./engines/signals";

// LOCAL-constructed timestamps so same-day grouping holds in any timezone.
const NOW = new Date(2026, 5, 3, 18).getTime();
const at = (hour = 12) => new Date(2026, 5, 3, hour).toISOString();
const sig = (kind: Signal["kind"], value: number, unit: string): Signal => ({
  athleteId: "u",
  kind,
  value,
  unit,
  source: "manual",
  ts: at(),
});

// The ring card ends 300 into the content, the macro card 420.
const ANCHORS = { energy: 300, macros: 420 };

describe("nutrition HUD capture", () => {
  it("shows nothing at the top of the hub", () => {
    const s = nutritionHudState(ANCHORS, 0);
    expect(s.captured).toEqual([]);
    expect(s.pinned).toBe(false);
    expect(s.tight).toBe(false);
  });

  it("captures kcal the moment the ring passes under the bar", () => {
    // one pixel short of the threshold, then one past it
    expect(nutritionHudState(ANCHORS, 300 - NUTRITION_HUD_BAR_H - 1).captured).toEqual([]);
    expect(nutritionHudState(ANCHORS, 300 - NUTRITION_HUD_BAR_H).captured).toEqual(["kcal"]);
  });

  it("captures the three macros together, since one card carries them", () => {
    const s = nutritionHudState(ANCHORS, 420 - NUTRITION_HUD_BAR_H);
    expect(s.captured).toEqual(["kcal", "protein", "carbs", "fat"]);
    expect(s.pinned).toBe(true);
    expect(s.tight).toBe(true);
  });

  it("keeps the fixed order regardless of anchor order", () => {
    const s = nutritionHudState({ energy: 900, macros: 100 }, 1000);
    expect(s.captured).toEqual([...NUTRITION_HUD_ORDER]);
  });

  it("releases later than it captured, so a resting finger can't strobe it", () => {
    const held: NutritionHudPill[] = ["kcal"];
    const edge = 300 - NUTRITION_HUD_BAR_H;
    // scrolling back up to exactly the capture point still holds the capsule
    expect(nutritionHudState(ANCHORS, edge - 1, { prev: held }).captured).toEqual(["kcal"]);
    expect(nutritionHudState(ANCHORS, edge - NUTRITION_HUD_HYSTERESIS, { prev: held }).captured).toEqual(["kcal"]);
    // one pixel past the release threshold and it lets go
    expect(nutritionHudState(ANCHORS, edge - NUTRITION_HUD_HYSTERESIS - 1, { prev: held }).captured).toEqual([]);
    // …whereas an un-held capsule at that same offset was never captured
    expect(nutritionHudState(ANCHORS, edge - 1).captured).toEqual([]);
  });

  it("retracts in the order it arrived", () => {
    const all: NutritionHudPill[] = [...NUTRITION_HUD_ORDER];
    // back above the macro card: the three macros go, kcal stays
    const s = nutritionHudState(ANCHORS, 420 - NUTRITION_HUD_BAR_H - NUTRITION_HUD_HYSTERESIS - 1, { prev: all });
    expect(s.captured).toEqual(["kcal"]);
    expect(s.tight).toBe(false);
  });

  it("never captures a card that isn't on screen at all", () => {
    const s = nutritionHudState({ energy: 300, macros: null }, 99_999);
    expect(s.captured).toEqual(["kcal"]);
  });

  it("ignores a non-finite measurement rather than pinning on NaN", () => {
    const s = nutritionHudState({ energy: Number.NaN, macros: 420 }, 99_999);
    expect(s.captured).toEqual(["protein", "carbs", "fat"]);
  });

  it("pins every capsule from the first pixel on the sub-screens", () => {
    // the picker and the libraries have no ring to scroll past
    const s = nutritionHudState({ energy: null, macros: null }, 0, { always: true });
    expect(s.captured).toEqual([...NUTRITION_HUD_ORDER]);
    expect(s.pinned).toBe(true);
    expect(s.tight).toBe(true);
  });

  it("honours a client's own bar height and a disabled hysteresis", () => {
    expect(nutritionHudState(ANCHORS, 300 - 80, { barH: 80 }).captured).toEqual(["kcal"]);
    const edge = 300 - NUTRITION_HUD_BAR_H;
    expect(nutritionHudState(ANCHORS, edge - 1, { prev: ["kcal"], hysteresis: 0 }).captured).toEqual([]);
  });
});

describe("nutrition HUD readouts", () => {
  const signals: Signal[] = [
    sig("energyIntake", 1244, "kcal"),
    sig("protein", 103, "g"),
    sig("carbs", 118, "g"),
    sig("fat", 40, "g"),
    sig("bodyMass", 82, "kg"),
  ];

  it("reports what is LEFT of every target, from the same fuel the ring draws", () => {
    const fuel = fuelToday(signals, { goal: "maintain", now: NOW });
    const slots = nutritionHudSlots(fuel);
    expect(slots.map((s) => s.key)).toEqual([...NUTRITION_HUD_ORDER]);

    const kcal = nutritionHudSlot(slots, "kcal")!;
    // the capsule and the hero ring must print the identical number
    expect(kcal.left).toBe(fuel.kcalLeft);
    expect(kcal.left).toBe(Math.round(fuel.targets.kcal - fuel.today.kcal));
    expect(kcal.pct).toBe(fuel.kcalPct);
    expect(kcal.over).toBe(false);

    const protein = nutritionHudSlot(slots, "protein")!;
    expect(protein.value).toBe(103);
    expect(protein.target).toBe(fuel.targets.protein);
    expect(protein.left).toBe(fuel.targets.protein - 103);
  });

  it("goes negative and flags a breach once a target is passed", () => {
    const fuel = fuelToday([sig("energyIntake", 1000, "kcal"), sig("fat", 500, "g"), sig("bodyMass", 82, "kg")], {
      goal: "maintain",
      now: NOW,
    });
    const fat = nutritionHudSlot(nutritionHudSlots(fuel), "fat")!;
    expect(fat.over).toBe(true);
    expect(fat.left).toBeLessThan(0);
    // a breach still reports its fill as a clamped 100, never past the track
    expect(fat.pct).toBe(100);
  });

  it("reads a fresh day as the whole target still to go", () => {
    const fuel = fuelToday([sig("bodyMass", 82, "kg")], { goal: "maintain", now: NOW });
    for (const slot of nutritionHudSlots(fuel)) {
      expect(slot.value).toBe(0);
      expect(slot.left).toBe(slot.target);
      expect(slot.over).toBe(false);
      expect(slot.pct).toBe(0);
    }
  });
});
