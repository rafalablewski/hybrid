import { describe, it, expect } from "vitest";
import { mmss, ago, until } from "./format";

describe("mmss", () => {
  it("formats seconds as m:ss with a zero-padded seconds field", () => {
    expect(mmss(0)).toBe("0:00");
    expect(mmss(9)).toBe("0:09");
    expect(mmss(65)).toBe("1:05");
    expect(mmss(600)).toBe("10:00");
  });
  it("clamps a negative countdown to 0:00 (never renders -1:59)", () => {
    expect(mmss(-5)).toBe("0:00");
  });
  it("floors fractional seconds", () => {
    expect(mmss(65.9)).toBe("1:05");
  });
});

describe("ago", () => {
  const now = new Date("2026-07-11T12:00:00Z").getTime();
  it("labels the recent past", () => {
    expect(ago("2026-07-11T11:59:30Z", now)).toBe("just now");
    expect(ago("2026-07-11T11:30:00Z", now)).toBe("30m ago");
    expect(ago("2026-07-11T09:00:00Z", now)).toBe("3h ago");
    expect(ago("2026-07-09T12:00:00Z", now)).toBe("2d ago");
  });
  it("never goes negative for a future instant", () => {
    expect(ago("2026-07-11T13:00:00Z", now)).toBe("just now");
  });
  it("degrades to 'just now' on an invalid date string", () => {
    expect(ago("not-a-date", now)).toBe("just now");
  });
});

describe("until", () => {
  const now = new Date("2026-07-11T12:00:00Z").getTime();
  it("returns an em dash for null", () => {
    expect(until(null, now)).toBe("—");
  });
  it("labels the near future", () => {
    expect(until("2026-07-11T12:30:00Z", now)).toBe("in 30m");
    expect(until("2026-07-11T15:00:00Z", now)).toBe("in 3h");
    expect(until("2026-07-13T12:00:00Z", now)).toBe("in 2d");
  });
  it("reads due now once the instant has passed", () => {
    expect(until("2026-07-11T11:00:00Z", now)).toBe("due now");
  });
  it("returns an em dash on an invalid date string", () => {
    expect(until("not-a-date", now)).toBe("—");
  });
});
