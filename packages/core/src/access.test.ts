import { describe, it, expect } from "vitest";
import {
  isFullAccess,
  canSeeHPI,
  canEditEnrolledPlan,
  canScanFoodLabel,
  canSaveMealsAndProducts,
  canUseRecipes,
  canSaveProduct,
  canSaveMeal,
  canSaveRoutine,
  FREE_TEMPLATE_LIMIT,
  FREE_MEAL_LIMIT,
  FREE_PRODUCT_LIMIT,
} from "./access";
import type { Persona } from "./nav";

const FULL: Persona[] = ["athlete", "coach", "admin"];

describe("free-tier access gates", () => {
  it("casual (free) is locked out of every Full feature", () => {
    expect(isFullAccess("casual")).toBe(false);
    expect(canSeeHPI("casual")).toBe(false);
    expect(canEditEnrolledPlan("casual")).toBe(false);
    expect(canScanFoodLabel("casual")).toBe(false);
    expect(canSaveMealsAndProducts("casual")).toBe(false);
    expect(canUseRecipes("casual")).toBe(false);
  });

  it("athlete / coach / admin all have Full access", () => {
    for (const p of FULL) {
      expect(isFullAccess(p)).toBe(true);
      expect(canSeeHPI(p)).toBe(true);
      expect(canEditEnrolledPlan(p)).toBe(true);
      expect(canScanFoodLabel(p)).toBe(true);
      expect(canSaveMealsAndProducts(p)).toBe(true);
      expect(canUseRecipes(p)).toBe(true);
    }
  });

  it("fails closed on invalid / uninitialised personas", () => {
    expect(isFullAccess(undefined as unknown as Persona)).toBe(false);
    expect(isFullAccess(null as unknown as Persona)).toBe(false);
    expect(isFullAccess("unknown" as unknown as Persona)).toBe(false);
    expect(canSeeHPI(undefined as unknown as Persona)).toBe(false);
  });

  it("free users can save routines up to the free template limit", () => {
    expect(FREE_TEMPLATE_LIMIT).toBe(2);
    expect(canSaveRoutine("casual", 0)).toBe(true);
    expect(canSaveRoutine("casual", 1)).toBe(true);
    expect(canSaveRoutine("casual", FREE_TEMPLATE_LIMIT)).toBe(false);
    expect(canSaveRoutine("casual", FREE_TEMPLATE_LIMIT + 5)).toBe(false);
  });

  it("Full personas save routines without a limit", () => {
    for (const p of FULL) {
      expect(canSaveRoutine(p, 0)).toBe(true);
      expect(canSaveRoutine(p, 500)).toBe(true);
    }
  });

  it("canSaveRoutine fails closed on invalid personas", () => {
    expect(canSaveRoutine(undefined as unknown as Persona, 0)).toBe(false);
    expect(canSaveRoutine("unknown" as unknown as Persona, 0)).toBe(false);
  });

  it("free users can save their own meals up to the free meal limit", () => {
    expect(FREE_MEAL_LIMIT).toBe(4);
    expect(canSaveMeal("casual", 0)).toBe(true);
    expect(canSaveMeal("casual", 3)).toBe(true);
    expect(canSaveMeal("casual", FREE_MEAL_LIMIT)).toBe(false);
    expect(canSaveMeal("casual", FREE_MEAL_LIMIT + 10)).toBe(false);
  });

  it("Full personas save meals without a limit", () => {
    for (const p of FULL) {
      expect(canSaveMeal(p, 0)).toBe(true);
      expect(canSaveMeal(p, 999)).toBe(true);
    }
  });

  it("canSaveMeal fails closed on invalid personas", () => {
    expect(canSaveMeal(undefined as unknown as Persona, 0)).toBe(false);
    expect(canSaveMeal("unknown" as unknown as Persona, 0)).toBe(false);
  });

  it("free users save products up to FREE_PRODUCT_LIMIT, then it's Full", () => {
    expect(canSaveProduct("casual", 0)).toBe(true);
    expect(canSaveProduct("casual", FREE_PRODUCT_LIMIT - 1)).toBe(true);
    expect(canSaveProduct("casual", FREE_PRODUCT_LIMIT)).toBe(false);
    for (const p of FULL) expect(canSaveProduct(p, 999)).toBe(true);
    expect(canSaveProduct(undefined as unknown as Persona, 0)).toBe(false);
  });
});
