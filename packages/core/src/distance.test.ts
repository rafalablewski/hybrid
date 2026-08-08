import { describe, it, expect } from "vitest";
import { fmtKm, kmOrMeters, kmValue, roundKm } from "./distance";

describe("roundKm", () => {
  it("cuts a raw measurement to two decimals", () => {
    expect(roundKm(5.54921352352)).toBe(5.55);
    expect(roundKm(10.20593123)).toBe(10.21);
    expect(roundKm(10.234567)).toBe(10.23);
  });

  it("keeps a number, so a flat distance never grows trailing zeros", () => {
    expect(roundKm(10)).toBe(10);
    expect(kmValue(10)).toBe("10");
    expect(kmValue(8.5)).toBe("8.5");
    expect(fmtKm(5)).toBe("5 km");
  });

  it("survives zero and the sub-kilometre range", () => {
    expect(roundKm(0)).toBe(0);
    expect(kmValue(0.034)).toBe("0.03");
    expect(fmtKm(0.516)).toBe("0.52 km");
  });
});

describe("kmOrMeters", () => {
  it("reads in metres below a kilometre and in km above it", () => {
    expect(kmOrMeters(0.034)).toBe("34 m");
    expect(kmOrMeters(0.51)).toBe("510 m");
    expect(kmOrMeters(1)).toBe("1 km");
    expect(kmOrMeters(10.234567)).toBe("10.23 km");
  });
});
