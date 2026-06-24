import { describe, it, expect } from "vitest";
import { statCountUp } from "./count-up";

describe("statCountUp", () => {
  it("parses a plain integer (minutes)", () => {
    const c = statCountUp("81");
    expect(c.target).toBe(81);
    expect(c.decimals).toBe(0);
    expect(c.format(81)).toBe("81");
    expect(c.format(40)).toBe("40");
  });

  it("parses tonnage with a decimal + unit suffix", () => {
    const c = statCountUp("5.9 t");
    expect(c.target).toBeCloseTo(5.9);
    expect(c.decimals).toBe(1);
    expect(c.format(5.9)).toBe("5.9 t");
    expect(c.format(3)).toBe("3.0 t");
  });

  it("parses a grouped value with a suffix (lb)", () => {
    const c = statCountUp("13,069 lb");
    expect(c.target).toBe(13069);
    expect(c.decimals).toBe(0);
    expect(c.format(13069)).toBe("13,069 lb");
  });

  it("re-groups in-flight integers", () => {
    expect(statCountUp("1,840").format(900)).toBe("900");
    expect(statCountUp("48,920").format(12345)).toBe("12,345");
  });

  it("is a no-op for strings without a number", () => {
    const c = statCountUp("—");
    expect(c.target).toBe(0);
    expect(c.format(123)).toBe("—");
  });
});
