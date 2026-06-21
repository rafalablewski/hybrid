import { describe, it, expect } from "vitest";
import { athleteId } from "./athlete-id";

describe("athleteId", () => {
  it("renders the 0xHHHH·NN shape", () => {
    expect(athleteId("a@b.com")).toMatch(/^0x[0-9A-F]{4}·\d{2}$/);
  });

  it("is stable for the same seed", () => {
    expect(athleteId("rafal@hybrid.app")).toBe(athleteId("rafal@hybrid.app"));
  });

  it("differs across seeds", () => {
    expect(athleteId("a@b.com")).not.toBe(athleteId("c@d.com"));
  });

  it("falls back to 'guest' for an empty/blank seed (no 0x0000 collapse)", () => {
    expect(athleteId("")).toBe(athleteId("guest"));
    expect(athleteId("   ")).toBe(athleteId("guest"));
  });
});
