import { describe, it, expect } from "vitest";
import {
  isFullAccess,
  canSeeHPI,
  canEditEnrolledPlan,
  canScanFoodLabel,
  canSaveMealsAndProducts,
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
  });

  it("athlete / coach / admin all have Full access", () => {
    for (const p of FULL) {
      expect(isFullAccess(p)).toBe(true);
      expect(canSeeHPI(p)).toBe(true);
      expect(canEditEnrolledPlan(p)).toBe(true);
      expect(canScanFoodLabel(p)).toBe(true);
      expect(canSaveMealsAndProducts(p)).toBe(true);
    }
  });
});
