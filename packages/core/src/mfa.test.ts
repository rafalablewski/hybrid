import { describe, it, expect } from "vitest";
import { mfaEnrolled, stepUpRequired, isValidTotpCode } from "./mfa";

describe("mfaEnrolled", () => {
  it("true only with a verified factor", () => {
    expect(mfaEnrolled([{ status: "verified" }])).toBe(true);
    expect(mfaEnrolled([{ status: "unverified" }])).toBe(false);
    expect(mfaEnrolled([{ status: "unverified" }, { status: "verified" }])).toBe(true);
    expect(mfaEnrolled([])).toBe(false);
    expect(mfaEnrolled(null)).toBe(false);
    expect(mfaEnrolled(undefined)).toBe(false);
  });
});

describe("stepUpRequired", () => {
  it("requires step-up when current < next", () => {
    expect(stepUpRequired("aal1", "aal2")).toBe(true);
  });
  it("no step-up when already satisfied or no factor", () => {
    expect(stepUpRequired("aal2", "aal2")).toBe(false);
    expect(stepUpRequired("aal1", "aal1")).toBe(false);
    expect(stepUpRequired(null, null)).toBe(false);
    expect(stepUpRequired("aal1", null)).toBe(false);
    expect(stepUpRequired(undefined, "aal2")).toBe(false);
  });
});

describe("isValidTotpCode", () => {
  it("accepts exactly six digits", () => {
    expect(isValidTotpCode("123456")).toBe(true);
    expect(isValidTotpCode(" 000000 ")).toBe(true);
  });
  it("rejects anything else", () => {
    for (const bad of ["12345", "1234567", "12345a", "", "abcdef", 123456, null, undefined]) {
      expect(isValidTotpCode(bad as unknown)).toBe(false);
    }
  });
});
