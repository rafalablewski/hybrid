import { describe, it, expect } from "vitest";
import { statSubTone } from "./stat-tile";

describe("statSubTone", () => {
  it("tones a sign-led delta", () => {
    expect(statSubTone("+124")).toBe("up");
    expect(statSubTone("↑ 3 this week")).toBe("up");
    expect(statSubTone("−12%")).toBe("down");
    expect(statSubTone("-12%")).toBe("down"); // ASCII hyphen, same intent
    expect(statSubTone("↓ 4 kg")).toBe("down");
  });

  it("keeps the admin panels' deliberate minus-marked thresholds red", () => {
    // These are not negative NUMBERS — they are copy prefixed with a minus so
    // a failing threshold reads as failing. That idiom predates this helper and
    // has to keep working.
    expect(statSubTone("−below 40")).toBe("down");
    expect(statSubTone("−runs dry")).toBe("down");
  });

  it("leaves anything that is not a delta NEUTRAL", () => {
    // The bug this exists to fix: both clients painted every non-negative sub
    // in the "good" accent, so a date, a denominator and an empty-state line
    // were all congratulated.
    expect(statSubTone("Wed 6 Aug")).toBe("flat");
    expect(statSubTone("not enough data")).toBe("flat");
    expect(statSubTone("ARR $1.2M")).toBe("flat");
    expect(statSubTone("of 1,240")).toBe("flat");
    expect(statSubTone("kg")).toBe("flat");
    expect(statSubTone("passes (≥40)")).toBe("flat");
  });

  it("treats absent or blank copy as neutral", () => {
    expect(statSubTone(undefined)).toBe("flat");
    expect(statSubTone(null)).toBe("flat");
    expect(statSubTone("")).toBe("flat");
    expect(statSubTone("   ")).toBe("flat");
  });

  it("ignores leading whitespace when reading the sign", () => {
    expect(statSubTone("  +5")).toBe("up");
    expect(statSubTone("  −5")).toBe("down");
  });
});
