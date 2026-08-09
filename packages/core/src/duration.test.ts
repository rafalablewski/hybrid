import { describe, it, expect } from "vitest";
import { durationParts, formatDuration } from "./duration";

describe("duration — hours and minutes, never decimal hours", () => {
  it("splits canonical minutes into whole hours + a 0…59 remainder", () => {
    expect(durationParts(67)).toEqual({ hours: 1, minutes: 7 });
    expect(durationParts(90)).toEqual({ hours: 1, minutes: 30 });
    expect(durationParts(45)).toEqual({ hours: 0, minutes: 45 });
    expect(durationParts(120)).toEqual({ hours: 2, minutes: 0 });
  });

  it("rounds the TOTAL before splitting, so a remainder can never reach 60", () => {
    expect(durationParts(59.7)).toEqual({ hours: 1, minutes: 0 });
    expect(durationParts(119.6)).toEqual({ hours: 2, minutes: 0 });
    expect(durationParts(67.4)).toEqual({ hours: 1, minutes: 7 });
  });

  it("is safe on nothing, and never prints a negative span", () => {
    expect(durationParts(0)).toEqual({ hours: 0, minutes: 0 });
    expect(durationParts(-5)).toEqual({ hours: 0, minutes: 0 });
    expect(formatDuration(0)).toBe("0min");
  });

  it("prints the shape the athlete reads", () => {
    // The bug this module exists for: 67 logged minutes printed "1.1 h".
    expect(formatDuration(67)).toBe("1h 7min");
    expect(formatDuration(77)).toBe("1h 17min");
    expect(formatDuration(90)).toBe("1h 30min");
    expect(formatDuration(45)).toBe("45min");
    // On the hour the minutes are dropped, not printed as a hollow "0min".
    expect(formatDuration(120)).toBe("2h");
  });

  it("takes the caller's units when it has localised ones", () => {
    expect(formatDuration(90, { h: "g", min: "m" })).toBe("1g 30m");
  });
});
