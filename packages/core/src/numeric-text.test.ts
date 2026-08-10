import { describe, it, expect } from "vitest";
import { numericDiff, numericRolls } from "./numeric-text";

const chars = (s: string, t: string) => numericDiff(s, t).cells.map((c) => c.char).join("");
const changed = (s: string, t: string) =>
  numericDiff(s, t).cells.map((c) => (c.changed ? "^" : ".")).join("");

describe("numericDiff", () => {
  it("renders the new value verbatim", () => {
    expect(chars("80", "82.5")).toBe("82.5");
  });

  it("moves in the VALUE's direction, not the digit's", () => {
    // 80 → 79: the units digit 0 → 9 is arithmetically an increase, and rolling
    // it up while the number falls is the classic odometer-emulation bug.
    expect(numericDiff("80", "79").dir).toBe(-1);
    expect(numericDiff("79", "80").dir).toBe(1);
  });

  it("compares as NUMBERS, so 99 → 100 goes up", () => {
    // Sorted as strings, "100" < "99".
    expect(numericDiff("99", "100").dir).toBe(1);
    expect(numericDiff("100", "99").dir).toBe(-1);
  });

  it("aligns from the RIGHT so a new digit is new", () => {
    // 99 → 100: the two 9s roll to 0 and the hundreds column is genuinely new.
    // Left-aligned, a "1" would appear at the end from nowhere.
    const d = numericDiff("99", "100");
    expect(d.cells.map((c) => c.prev)).toEqual([null, "9", "9"]);
    expect(changed("99", "100")).toBe("^^^");
  });

  it("keeps the units column the units column when the number grows", () => {
    // Keyed from the right, so a client does not remount every cell on 9 → 10.
    expect(numericDiff("9", "10").cells.map((c) => c.key)).toEqual(["r1", "r0"]);
    expect(numericDiff("9", "9").cells.map((c) => c.key)).toEqual(["r0"]);
  });

  it("leaves unchanged positions alone", () => {
    expect(changed("82.5", "82.0")).toBe("...^");
  });

  it("does not roll punctuation, units or signs", () => {
    const d = numericDiff("1:59", "2:00");
    const colon = d.cells.find((c) => c.char === ":")!;
    expect(colon.rolls).toBe(false);
    expect(d.cells.filter((c) => c.rolls).map((c) => c.char).join("")).toBe("200");
  });

  it("reads a clock falling, which parses as no number at all", () => {
    // "1:59" → "2:00" strips to 159 → 200: same digit count, so the higher
    // string is the higher value.
    expect(numericDiff("1:59", "2:00").dir).toBe(1);
    expect(numericDiff("2:00", "1:59").dir).toBe(-1);
    // A minute boundary that loses a digit still falls.
    expect(numericDiff("1:00", "59").dir).toBe(-1);
  });

  it("rolls nothing when the value did not change", () => {
    const d = numericDiff("82.5", "82.5");
    expect(d.dir).toBe(0);
    expect(d.cells.every((c) => !c.rolls)).toBe(true);
    expect(d.cells.every((c) => !c.changed)).toBe(true);
  });
});

describe("numericRolls", () => {
  it("does not roll the FIRST render — there is nothing to leave", () => {
    expect(numericRolls(null, "82.5")).toBe(false);
    expect(numericRolls("", "82.5")).toBe(false);
  });

  it("does not roll a figure that changed its SHAPE", () => {
    // "—" becoming a weight is one thing replaced by a different thing, not one
    // value becoming another; rolling it animates a relationship that is absent.
    expect(numericRolls("—", "82.5")).toBe(false);
    expect(numericRolls("82.5", "—")).toBe(false);
    expect(numericRolls("Rest", "Go")).toBe(false);
  });

  it("rolls one figure becoming another", () => {
    expect(numericRolls("80", "82.5")).toBe(true);
    expect(numericRolls("1:59", "1:58")).toBe(true);
  });

  it("does not roll a value onto itself", () => {
    expect(numericRolls("80", "80")).toBe(false);
  });
});
