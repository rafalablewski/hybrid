import { describe, it, expect } from "vitest";
import {
  classifyRead,
  expectedResidual,
  reportWeight,
  feelReading,
  hoursAfterSession,
  readNoteKey,
  isStrained,
  readinessContext,
  readinessNoteKey,
  hoursSince,
  RESIDUAL_FLOOR,
  MAX_COST,
} from "./feel-timing";

describe("how long after the session the feel was logged", () => {
  it("names what the report is actually measuring", () => {
    expect(classifyRead(0.2)).toBe("immediate");
    expect(classifyRead(2.9)).toBe("immediate");
    expect(classifyRead(3)).toBe("sameDay");
    expect(classifyRead(11)).toBe("sameDay");
    expect(classifyRead(14)).toBe("nextDay");
    expect(classifyRead(35)).toBe("nextDay");
    expect(classifyRead(40)).toBe("stale");
    expect(classifyRead(null)).toBe("unknown");
    expect(classifyRead(-2)).toBe("unknown");
  });

  it("computes the lag, and refuses a report that predates the session", () => {
    const end = "2026-06-16T12:00:00.000Z";
    expect(hoursAfterSession(end, "2026-06-16T13:30:00.000Z")).toBe(1.5);
    expect(hoursAfterSession(end, "2026-06-17T00:00:00.000Z")).toBe(12);
    // A clock problem, not a negative lag.
    expect(hoursAfterSession(end, "2026-06-16T11:00:00.000Z")).toBeNull();
    expect(hoursAfterSession(null, end)).toBeNull();
    expect(hoursAfterSession(end, undefined)).toBeNull();
  });
});

describe("the residual model", () => {
  it("starts whole and decays toward the muscle-damage floor", () => {
    expect(expectedResidual(0)).toBe(1);
    expect(expectedResidual(1)).toBeLessThan(1);
    expect(expectedResidual(10)).toBeLessThan(expectedResidual(1));
    expect(expectedResidual(48)).toBeCloseTo(RESIDUAL_FLOOR, 2);
    expect(expectedResidual(1000)).toBeGreaterThanOrEqual(RESIDUAL_FLOOR);
  });

  it("decays monotonically", () => {
    let prev = Infinity;
    for (let h = 0; h <= 48; h += 0.5) {
      const v = expectedResidual(h);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it("discounts a report only once it becomes recall", () => {
    expect(reportWeight(1)).toBe(1);
    expect(reportWeight(12)).toBe(1);
    expect(reportWeight(24)).toBeLessThan(1);
    expect(reportWeight(72)).toBeLessThan(reportWeight(24));
    // An unknown lag is not punished — we just can't adjust it.
    expect(reportWeight(null)).toBe(1);
  });
});

describe("the same answer at a different hour", () => {
  it("THE POINT: the same tap ten hours out costs far more than one hour out", () => {
    const soon = feelReading(4, 1)!;
    const late = feelReading(4, 10)!;
    expect(soon.fatigue).toBe(late.fatigue);            // identical tap
    expect(late.cost).toBeGreaterThan(soon.cost);        // different meaning
    expect(late.adjustedFatigue).toBeGreaterThan(soon.adjustedFatigue);
    expect(soon.read).toBe("immediate");
    expect(late.read).toBe("sameDay");
    // …and only the late one reads as a session that wasn't absorbed.
    expect(isStrained(soon)).toBe(false);
    expect(isStrained(late)).toBe(true);
  });

  it("at the top of the scale the DISPLAY saturates but the cost still separates", () => {
    const soon = feelReading(5, 1)!;
    const late = feelReading(5, 10)!;
    expect(soon.adjustedFatigue).toBe(5);
    expect(late.adjustedFatigue).toBe(5);   // 5 is the top; it cannot show more
    expect(late.cost).toBeGreaterThan(soon.cost); // which is why thresholds use cost
  });

  it("the strain threshold lands on the cases it was calibrated for", () => {
    expect(isStrained(feelReading(4, 1))).toBe(false);   // hard session, logged in the gym
    expect(isStrained(feelReading(5, 1))).toBe(false);   // very hard session, still just a session
    expect(isStrained(feelReading(4, 10))).toBe(true);   // still wrecked at bedtime
    expect(isStrained(feelReading(4, 20))).toBe(true);   // still wrecked the next morning
    expect(isStrained(feelReading(5, 3))).toBe(true);
  });

  it("no lag can inflate 'I feel fine' into a strain signal", () => {
    // Dividing a small number by a small number must not manufacture evidence.
    for (const h of [1, 10, 24, 48, 200]) {
      expect(isStrained(feelReading(1, h))).toBe(false);
      expect(isStrained(feelReading(2, h))).toBe(false);
    }
  });

  it("a hard session logged straight after is unremarkable", () => {
    const r = feelReading(4, 0.5)!;
    // Almost all the acute fatigue is still there, so a 4 reads as roughly a 4.
    expect(r.expected).toBeGreaterThan(0.9);
    expect(r.adjustedFatigue).toBeGreaterThan(3.5);
    expect(r.adjustedFatigue).toBeLessThan(4.6);
  });

  it("the same 4 the next morning is a much bigger disturbance", () => {
    const next = feelReading(4, 20)!;
    expect(next.read).toBe("nextDay");
    expect(next.adjustedFatigue).toBeGreaterThan(feelReading(4, 0.5)!.adjustedFatigue);
  });

  it("feeling fresh soon after says little; feeling fresh a day later says recovered", () => {
    const soon = feelReading(1, 1)!;
    const late = feelReading(1, 24)!;
    // "Fresh" is 0 cost either way — the floor of the scale can't go lower.
    expect(soon.cost).toBe(0);
    expect(late.cost).toBe(0);
    expect(late.read).toBe("nextDay");
  });

  it("bounds the cost so no lag turns one tap into a superhuman number", () => {
    const absurd = feelReading(5, 200)!;
    expect(absurd.cost).toBeLessThanOrEqual(MAX_COST);
    expect(absurd.adjustedFatigue).toBeLessThanOrEqual(5);
    // …and discounts it heavily, because it is recall.
    expect(absurd.weight).toBeLessThan(0.5);
  });

  it("without a timestamp it degrades to the raw report, never a guess", () => {
    const r = feelReading(4, null)!;
    expect(r.expected).toBe(1);
    expect(r.adjustedFatigue).toBe(4);
    expect(r.read).toBe("unknown");
    expect(r.weight).toBe(1);
  });

  it("rejects an off-scale tap", () => {
    for (const bad of [0, 6, NaN, -1]) expect(feelReading(bad, 1)).toBeNull();
  });

  it("cost rises monotonically with the lag for a fixed answer", () => {
    let prev = -1;
    for (const h of [0, 1, 3, 6, 10, 16, 24, 48]) {
      const c = feelReading(3, h)!.cost;
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it("names the note that explains the reading", () => {
    expect(readNoteKey("immediate", 5)).toBe("session.feel.noteImmediateHeavy");
    expect(readNoteKey("immediate", 2)).toBe("session.feel.noteImmediate");
    expect(readNoteKey("nextDay", 5)).toBe("session.feel.noteNextDayHeavy");
    expect(readNoteKey("stale", 5)).toBe("session.feel.noteStale");
    expect(readNoteKey("unknown", 3)).toBe("session.feel.noteUnknown");
  });
});

describe("reading today's check-in against the last session", () => {
  const NOW = Date.parse("2026-06-16T18:00:00.000Z");
  const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

  it("classifies by how long ago the athlete trained", () => {
    expect(readinessContext(hoursSince(hoursAgo(1), NOW))).toBe("postSession");
    expect(readinessContext(hoursSince(hoursAgo(6), NOW))).toBe("settling");
    expect(readinessContext(hoursSince(hoursAgo(20), NOW))).toBe("recovered");
    // Nothing recent, or nothing known — the answer is about the athlete.
    expect(readinessContext(hoursSince(hoursAgo(80), NOW))).toBe("rested");
    expect(readinessContext(null)).toBe("rested");
  });

  it("THE POINT: a low answer means something different an hour vs a day after", () => {
    // Ninety minutes after a heavy session, "wrecked" is the session talking.
    expect(readinessNoteKey(readinessContext(1.5), true)).toBe("w.home.today.ctxPostSessionLow");
    // A day later with nothing since, the same tap is a recovery signal.
    expect(readinessNoteKey(readinessContext(20), true)).toBe("w.home.today.ctxRecoveredLow");
    expect(readinessNoteKey(readinessContext(1.5), true)).not.toBe(readinessNoteKey(readinessContext(20), true));
  });

  it("says something useful when the answer is POSITIVE too", () => {
    // Feeling good soon after a hard session means it was absorbed.
    expect(readinessNoteKey(readinessContext(2), false)).toBe("w.home.today.ctxPostSessionOk");
    expect(readinessNoteKey(readinessContext(20), false)).toBe("w.home.today.ctxRecoveredOk");
  });

  it("stays quiet when there is no recent session to read against", () => {
    expect(readinessNoteKey("rested", true)).toBeNull();
    expect(readinessNoteKey("rested", false)).toBeNull();
  });

  it("ignores a session stamped in the future", () => {
    expect(hoursSince(new Date(NOW + 3_600_000).toISOString(), NOW)).toBeNull();
  });
});
