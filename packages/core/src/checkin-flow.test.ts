import { describe, it, expect } from "vitest";
import { CHECKIN_COOLDOWN_MS, checkinCooldownRemainingMs, CHECKIN_STEP_COUNT, CHECKIN_METRICS } from "./checkin-flow";

describe("checkin cooldown", () => {
  const now = 1_000_000_000_000;
  it("is a 6-hour window", () => {
    expect(CHECKIN_COOLDOWN_MS).toBe(6 * 60 * 60 * 1000);
  });
  it("reports the full window right after a log", () => {
    expect(checkinCooldownRemainingMs(now, now)).toBe(CHECKIN_COOLDOWN_MS);
  });
  it("counts down as time passes", () => {
    const twoHours = 2 * 60 * 60 * 1000;
    expect(checkinCooldownRemainingMs(now - twoHours, now)).toBe(4 * 60 * 60 * 1000);
  });
  it("clamps to 0 once the window is open again", () => {
    const sevenHours = 7 * 60 * 60 * 1000;
    expect(checkinCooldownRemainingMs(now - sevenHours, now)).toBe(0);
  });
  it("has one flow step per metric plus a details step", () => {
    expect(CHECKIN_STEP_COUNT).toBe(CHECKIN_METRICS.length + 1);
  });
});
