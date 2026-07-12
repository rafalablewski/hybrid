import { describe, it, expect } from "vitest";
import {
  ROLE_COLOR,
  readinessRole,
  hpiRole,
  riskRole,
  accountabilityRole,
  phaseRole,
} from "./semantic";

describe("semantic colour vocabulary", () => {
  it("maps every role to a brand accent", () => {
    expect(ROLE_COLOR.go).toBe("lime");
    expect(ROLE_COLOR.info).toBe("blue");
    expect(ROLE_COLOR.premium).toBe("amber");
    expect(ROLE_COLOR.caution).toBe("amber");
    expect(ROLE_COLOR.danger).toBe("red");
    expect(ROLE_COLOR.neutral).toBe("ash");
  });

  it("readiness follows green → amber → red", () => {
    expect(readinessRole(95)).toBe("go");
    expect(readinessRole(80)).toBe("go");
    expect(readinessRole(72)).toBe("info");
    expect(readinessRole(50)).toBe("caution");
    expect(readinessRole(20)).toBe("danger");
  });

  it("HPI / risk / accountability bands agree on meaning", () => {
    expect(hpiRole("peak")).toBe("go");
    expect(hpiRole("compromised")).toBe("caution");
    expect(hpiRole("depleted")).toBe("danger");
    // low injury risk is GOOD → go (not danger)
    expect(riskRole("low")).toBe("go");
    expect(riskRole("high")).toBe("danger");
    expect(accountabilityRole("thriving")).toBe("go");
    expect(accountabilityRole("at-risk")).toBe("caution");
  });

  it("a deload/recovery week reads as caution, a load week as go", () => {
    expect(phaseRole("recovery")).toBe("caution");
    expect(phaseRole("load")).toBe("go");
  });
});
