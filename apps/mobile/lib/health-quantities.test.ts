import { describe, expect, it } from "vitest";
import {
  metaCelsius,
  metaMetres,
  metaQty,
  qtyCount,
  qtyKcal,
  qtyKm,
  qtyMinutes,
} from "./health-quantities";

/**
 * THE BRIDGE CONTRACT.
 *
 * The unit strings below are not invented — they are the literals
 * @kingstinct/react-native-healthkit's Swift side emits, read off its
 * serializers:
 *
 *   ios/WorkoutProxy.swift  `totalDistance`  → Quantity(unit: "meters", …)
 *                           `duration`       → HKUnit.second().unitString  = "s"
 *                           `totalEnergyBurned` → HKUnit.kilocalorie()     = "kcal"
 *                           `totalFlightsClimbed` / strokes → "count"
 *   ios/QuantityTypeModule.swift  statistics → the requested HKUnit's own
 *                           unitString, so a distance asked for in metres
 *                           comes back as "m" — NOT "meters"
 *   ios/Serializers.swift   metadata quantities → serializeUnknownQuantityTyped,
 *                           i.e. HKUnit.meter() = "m", degreeCelsius() = "degC"
 *
 * That one inconsistency — "meters" from the workout total, "m" from the
 * statistic — is what silently erased every device distance (and the pace
 * derived from it) until it was found. These assertions exist so the next
 * mismatch fails here instead of on someone's wrist.
 */
describe("the unit strings the native bridge actually emits", () => {
  it('reads a workout total distance, which the bridge labels "meters"', () => {
    expect(qtyKm({ unit: "meters", quantity: 510 })).toBeCloseTo(0.51, 6);
  });

  it('reads a distance STATISTIC, which the bridge labels "m"', () => {
    expect(qtyKm({ unit: "m", quantity: 510 })).toBeCloseTo(0.51, 6);
  });

  it('reads a workout duration, which the bridge labels "s"', () => {
    expect(qtyMinutes({ unit: "s", quantity: 1181 })).toBeCloseTo(19.6833, 3);
  });

  it('reads active energy, which the bridge labels "kcal"', () => {
    expect(qtyKcal({ unit: "kcal", quantity: 211 })).toBe(211);
  });

  it('reads strokes and flights, which the bridge labels "count"', () => {
    expect(qtyCount({ unit: "count", quantity: 453 })).toBe(453);
  });

  it('reads metadata lengths and temperatures ("m" / "degC")', () => {
    expect(metaMetres({ unit: "m", quantity: 84 })).toBeCloseTo(84, 6);
    expect(metaCelsius({ unit: "degC", quantity: 21.5 })).toBe(21.5);
  });
});

describe("qtyKm", () => {
  it("accepts the symbol and the spelled-out name of every length it supports", () => {
    for (const unit of ["m", "meter", "meters", "metre", "metres"])
      expect(qtyKm({ unit, quantity: 1000 })).toBeCloseTo(1, 6);
    for (const unit of ["km", "kilometer", "kilometres"]) expect(qtyKm({ unit, quantity: 5 })).toBe(5);
    expect(qtyKm({ unit: "mi", quantity: 1 })).toBeCloseTo(1.609344, 6);
    expect(qtyKm({ unit: "yd", quantity: 1000 })).toBeCloseTo(0.9144, 6);
    expect(qtyKm({ unit: "ft", quantity: 1000 })).toBeCloseTo(0.3048, 6);
    expect(qtyKm({ unit: "cm", quantity: 100000 })).toBeCloseTo(1, 6);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(qtyKm({ unit: " Meters ", quantity: 500 })).toBeCloseTo(0.5, 6);
    expect(qtyKm({ unit: "KM", quantity: 5 })).toBe(5);
  });

  it("returns null rather than a wrong number for an unknown unit", () => {
    expect(qtyKm({ unit: "furlongs", quantity: 3 })).toBeNull();
    expect(qtyKm({ unit: "", quantity: 500 })).toBeNull();
  });

  it("returns null for absent or non-finite readings", () => {
    expect(qtyKm(null)).toBeNull();
    expect(qtyKm(undefined)).toBeNull();
    expect(qtyKm({ unit: "m", quantity: NaN })).toBeNull();
    expect(qtyKm({ unit: "m", quantity: Infinity })).toBeNull();
  });
});

describe("qtyMinutes", () => {
  it("converts every time unit to minutes", () => {
    expect(qtyMinutes({ unit: "s", quantity: 90 })).toBe(1.5);
    expect(qtyMinutes({ unit: "min", quantity: 20 })).toBe(20);
    expect(qtyMinutes({ unit: "hr", quantity: 1.5 })).toBe(90);
    expect(qtyMinutes({ unit: "h", quantity: 2 })).toBe(120);
  });

  it("returns null for an unknown unit", () => {
    expect(qtyMinutes({ unit: "fortnights", quantity: 1 })).toBeNull();
  });
});

describe("qtyKcal", () => {
  it("treats HealthKit's dietary Calorie as the kilocalorie it is", () => {
    expect(qtyKcal({ unit: "Cal", quantity: 211 })).toBe(211);
    expect(qtyKcal({ unit: "kcal", quantity: 211 })).toBe(211);
  });

  it("converts joules", () => {
    expect(qtyKcal({ unit: "kJ", quantity: 4.184 })).toBeCloseTo(1, 6);
    expect(qtyKcal({ unit: "J", quantity: 4184 })).toBeCloseTo(1, 6);
  });
});

describe("metadata readings", () => {
  it("accepts a bare number or a serialized quantity", () => {
    expect(metaQty(8.6)).toEqual({ unit: "", quantity: 8.6 });
    expect(metaQty({ unit: "m", quantity: 84 })).toEqual({ unit: "m", quantity: 84 });
    expect(metaQty("84")).toBeNull();
    expect(metaQty(null)).toBeNull();
  });

  it("reads an unmarked metadata length as metres", () => {
    expect(metaMetres(84)).toBe(84);
    expect(metaMetres({ unit: "cm", quantity: 8400 })).toBeCloseTo(84, 6);
    expect(metaMetres({ unit: "ft", quantity: 100 })).toBeCloseTo(30.48, 6);
  });

  it("converts Fahrenheit and leaves Celsius alone", () => {
    expect(metaCelsius({ unit: "degF", quantity: 212 })).toBeCloseTo(100, 6);
    expect(metaCelsius({ unit: "degC", quantity: 21.5 })).toBe(21.5);
    expect(metaCelsius(21.5)).toBe(21.5);
  });
});
