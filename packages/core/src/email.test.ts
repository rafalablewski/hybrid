import { describe, it, expect } from "vitest";
import {
  matchesAudience,
  renderMergeTags,
  greetingName,
  isStepDue,
  advanceEnrollment,
  firstSendTime,
  stepSendTime,
  isEmailAudience,
  isEmailTrigger,
} from "./email";

describe("email audience matching", () => {
  const free = { role: "CLIENT" as const, entitlement: "free" };
  const paid = { role: "CLIENT" as const, entitlement: "paid" };
  const coach = { role: "COACH" as const, entitlement: "paid" };
  const admin = { role: "ADMIN" as const, entitlement: "free" };

  it("matches everyone for 'all'", () => {
    expect(matchesAudience(free, "all")).toBe(true);
    expect(matchesAudience(admin, "all")).toBe(true);
  });
  it("splits free vs paid", () => {
    expect(matchesAudience(free, "free")).toBe(true);
    expect(matchesAudience(paid, "free")).toBe(false);
    expect(matchesAudience(paid, "paid")).toBe(true);
    expect(matchesAudience(free, "paid")).toBe(false);
  });
  it("splits by role", () => {
    expect(matchesAudience(coach, "coaches")).toBe(true);
    expect(matchesAudience(free, "clients")).toBe(true);
    expect(matchesAudience(admin, "admins")).toBe(true);
    expect(matchesAudience(coach, "clients")).toBe(false);
  });
});

describe("merge tags", () => {
  it("substitutes known tags and tolerates whitespace", () => {
    expect(renderMergeTags("Hi {{name}}, {{ email }}", { name: "Ada", email: "a@b.co" })).toBe("Hi Ada, a@b.co");
  });
  it("collapses unknown/empty tags to nothing", () => {
    expect(renderMergeTags("Hi {{name}}!", {})).toBe("Hi !");
    expect(renderMergeTags("X{{nope}}Y", { nope: null })).toBe("XY");
  });
});

describe("greetingName", () => {
  it("prefers first name, falls back to email local part", () => {
    expect(greetingName("Ada Lovelace", "x@y.z")).toBe("Ada");
    expect(greetingName(null, "ada@y.z")).toBe("ada");
    expect(greetingName("", "@y.z")).toBe("there");
  });
});

describe("sequence scheduling", () => {
  const steps = [
    { order: 0, delayHours: 0 },
    { order: 1, delayHours: 24 },
    { order: 2, delayHours: 48 },
  ];
  const t0 = 1_000_000_000_000;

  it("firstSendTime uses step 0 delay from enrollment", () => {
    expect(firstSendTime(steps, t0)).toBe(t0);
    expect(firstSendTime([{ order: 0, delayHours: 2 }], t0)).toBe(stepSendTime(t0, 2));
    expect(firstSendTime([], t0)).toBeNull();
  });

  it("isStepDue compares against now", () => {
    expect(isStepDue(new Date(t0), t0)).toBe(true);
    expect(isStepDue(new Date(t0 + 1000), t0)).toBe(false);
    expect(isStepDue(null, t0)).toBe(false);
  });

  it("advanceEnrollment moves one step and completes at the end", () => {
    const a = advanceEnrollment(0, steps, t0);
    expect(a).toEqual({ nextStep: 1, done: false, nextSendAtMs: stepSendTime(t0, 24) });
    const b = advanceEnrollment(2, steps, t0);
    expect(b.done).toBe(true);
    expect(b.nextSendAtMs).toBeNull();
  });
});

describe("guards", () => {
  it("validate audience + trigger ids", () => {
    expect(isEmailAudience("paid")).toBe(true);
    expect(isEmailAudience("nope")).toBe(false);
    expect(isEmailTrigger("signup")).toBe(true);
    expect(isEmailTrigger("nope")).toBe(false);
  });
});
