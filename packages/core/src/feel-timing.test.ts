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
  recoveryCurve,
  clearanceBandHalf,
  SCALE_STEP,
  BAND_HALF_FLOOR,
  CLEARANCE_FAST,
  CLEARANCE_SLOW,
  answerBounds,
  costBounds,
  ratioBounds,
  recoveryIndex,
  clearanceFactor,
  resolutionOf,
  SCALE_STEP,
  MIN_RECOVERY_PAIRS,
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

describe("the on-track band against the scale it reads", () => {
  /** The spentness the curve wants at `gap` hours, given an immediate answer.
   *  Unrounded — the value the athlete would tap if the buttons were continuous. */
  const onCurveSpent = (immF: number, gap: number) => {
    const imm = feelReading(immF, 0.1)!;
    return 1 + 4 * imm.cost * expectedResidual(gap + 0.1);
  };

  it("THE POINT: the nearest answer the athlete CAN tap always reads on-track", () => {
    // The defect this band exists for. The reachable answers are whole numbers;
    // the curve's target almost never is. Before the band widened with the
    // scale, most (immediate, gap) combinations had NO reachable answer inside
    // the corridor at all — so an ordinary recoverer was pushed onto "fast" or
    // "slow" by rounding, and the volume ceiling moved on the strength of it.
    const gaps = [6, 8, 10, 12, 14, 18, 24];
    for (const immF of [3, 4, 5]) {
      for (const gap of gaps) {
        const target = onCurveSpent(immF, gap);
        // What the athlete would actually tap: the nearest button to the target,
        // clamped to the scale.
        const nearest = Math.min(5, Math.max(1, Math.round(target)));
        const c = recoveryCurve(feelReading(immF, 0.1)!, feelReading(nearest, gap + 0.1)!);
        expect(c, `immediate ${immF} at gap ${gap}h`).not.toBeNull();
        expect(c!.clearance, `immediate ${immF} at gap ${gap}h — tapped ${nearest}, curve wanted ${target.toFixed(2)}`).toBe("onTrack");
      }
    }
  });

  it("and a whole step past the nearest answer still reads as a departure", () => {
    // Widening the band must not swallow the signal: one button beyond the
    // nearest is a real, resolvable difference and has to keep its verdict.
    const immF = 4;
    for (const gap of [8, 12, 14, 18]) {
      const nearest = Math.round(onCurveSpent(immF, gap));
      const worse = Math.min(5, nearest + 1);
      const better = Math.max(1, nearest - 1);
      const imm = () => feelReading(immF, 0.1)!;
      expect(recoveryCurve(imm(), feelReading(worse, gap + 0.1)!)!.clearance, `gap ${gap}h, tapped ${worse}`).toBe("slow");
      expect(recoveryCurve(imm(), feelReading(better, gap + 0.1)!)!.clearance, `gap ${gap}h, tapped ${better}`).toBe("fast");
    }
  });

  it("never narrows below the population corridor", () => {
    expect(BAND_HALF_FLOOR).toBeCloseTo((CLEARANCE_SLOW - CLEARANCE_FAST) / 2, 10);
    for (const cost of [0.2, 0.5, 1, 1.5]) {
      for (const h of [0, 1, 6, 12, 24, 48]) {
        expect(clearanceBandHalf(cost, h)).toBeGreaterThanOrEqual(BAND_HALF_FLOOR);
      }
    }
  });

  it("keeps the original ±15% where the scale can actually resolve it", () => {
    // A costly session read back soon after: one button is a small move in
    // ratio terms, so the floor governs and nothing about the band changed.
    expect(clearanceBandHalf(1.5, 0)).toBe(BAND_HALF_FLOOR);
    expect(SCALE_STEP / (expectedResidual(0) * 1.5) / 2).toBeLessThan(BAND_HALF_FLOOR);
  });

  it("widens as the residual drains, because the reachable ratios spread out", () => {
    // Same session, later read: dividing a fixed 0.25 by a shrinking residual
    // is what pushes adjacent answers apart, so the band has to follow.
    const at = (h: number) => clearanceBandHalf(0.75, h);
    expect(at(24)).toBeGreaterThan(at(12));
    expect(at(12)).toBeGreaterThan(at(6));
  });

  it("reports the band it actually used, so no surface implies false precision", () => {
    const wide = recoveryCurve(feelReading(3, 0.5)!, feelReading(2, 20)!)!;
    expect(wide.bandHalf).toBeGreaterThan(BAND_HALF_FLOOR);
    const tight = recoveryCurve(feelReading(5, 0.1)!, feelReading(4, 6)!)!;
    expect(tight.bandHalf).toBeLessThan(wide.bandHalf);
  });
});


/** A pair whose interval ran into an end of the scale — the later read at
 *  "fresh" (bin truncated at zero) or either cost saturating at MAX_COST. Its
 *  width is small because the scale ran out, not because it measured finely. */
const clampedPair = (f0: number, fL: number, h: number): boolean => {
  const [il, ih] = costBounds(f0, 0.1);
  const [ll, lh] = costBounds(fL, h);
  return ll <= 0 || lh >= MAX_COST || il <= 0 || ih >= MAX_COST;
};

describe("an answer is a bin, not a number", () => {
  it("stands for half a level either side, clamped to the scale's own ends", () => {
    expect(answerBounds(3)).toEqual([(3 - 1.5) / 4, (3 - 0.5) / 4]);
    // "Fresh" cannot mean less than nothing, "wrecked" cannot mean more than all.
    expect(answerBounds(1)[0]).toBe(0);
    expect(answerBounds(5)[1]).toBe(1);
    // One level wide, everywhere it isn't clamped.
    expect(answerBounds(3)[1] - answerBounds(3)[0]).toBeCloseTo(SCALE_STEP, 10);
  });

  it("the bin widens in cost terms as the residual drains", () => {
    const [a6, b6] = costBounds(2, 6);
    const [a24, b24] = costBounds(2, 24);
    expect(b24 - a24).toBeGreaterThan(b6 - a6);
  });

  it("the point estimate always lies inside the pair's own interval", () => {
    for (const f0 of [3, 4, 5]) for (const fL of [1, 2, 3, 4, 5]) for (const h of [6, 12, 24]) {
      const c = recoveryCurve(feelReading(f0, 0.1)!, feelReading(fL, h)!);
      if (!c) continue;
      expect(c.ratio, `${f0}→${fL} @${h}h`).toBeGreaterThanOrEqual(c.lo - 1e-9);
      expect(c.ratio, `${f0}→${fL} @${h}h`).toBeLessThanOrEqual(c.hi + 1e-9);
      expect(c.width).toBeCloseTo(c.hi - c.lo, 6);
    }
  });

  it("THE POINT: no pair resolves anything like the band it is judged against", () => {
    // The whole reason the index cannot be trusted pair-by-pair. Measured
    // across every answer combination the app can collect, an unclamped
    // interval is 0.51 to 2.23 wide against an on-track band of 0.30.
    const band = CLEARANCE_SLOW - CLEARANCE_FAST;
    const widths: number[] = [];
    for (const f0 of [3, 4, 5]) for (const fL of [1, 2, 3, 4, 5]) for (const h of [6, 8, 10, 12, 14, 18, 24, 30]) {
      const c = recoveryCurve(feelReading(f0, 0.1)!, feelReading(fL, h)!);
      // A bound that ran into MAX_COST is narrow because the scale ran out,
      // not because the pair measured finely — excluded, and asserted below.
      if (!c || clampedPair(f0, fL, h)) continue;
      widths.push(c.width);
    }
    expect(widths.length).toBeGreaterThan(10);
    expect(Math.min(...widths)).toBeGreaterThan(band);
    expect(Math.min(...widths)).toBeGreaterThan(1.5 * band);
  });

  it("a width under the band is always the cost ceiling, never precision", () => {
    // "Wrecked in the gym → tired the next day": the later read's whole bin is
    // past MAX_COST, so the interval collapses onto the ceiling. Read a narrow
    // width there as "off the top of the scale", never as "measured finely".
    const c = recoveryCurve(feelReading(5, 0.1)!, feelReading(4, 24)!)!;
    expect(c.width).toBeLessThan(CLEARANCE_SLOW - CLEARANCE_FAST);
    const [lo, hi] = costBounds(4, 24);
    expect(hi).toBe(MAX_COST);
    expect(lo).toBe(MAX_COST);

    // Every sub-band width in the whole grid is one of these, never a genuine
    // measurement — which is what makes the previous test's claim safe.
    for (const f0 of [3, 4, 5]) for (const fL of [1, 2, 3, 4, 5]) for (const h of [6, 12, 24]) {
      const x = recoveryCurve(feelReading(f0, 0.1)!, feelReading(fL, h)!);
      if (!x || x.width >= CLEARANCE_SLOW - CLEARANCE_FAST) continue;
      expect(clampedPair(f0, fL, h), `${f0}→${fL} @${h}h is narrow without a clamp`).toBe(true);
    }
  });
});

describe("the index stops overstating what it knows", () => {
  const slow = () => recoveryCurve(feelReading(3, 0.5)!, feelReading(4, 12)!)!;

  it("THE FIX: identical pairs no longer buy a near-zero interval", () => {
    // Three pairs that agree to the decimal have a SPREAD of zero and a real
    // uncertainty near a full ratio unit. The standard error cannot see that —
    // it measures how much the pairs disagree with each other, not how wrong
    // any of them could be. This was the least evidence in the app producing
    // the most confident claim on the screen.
    const idx = recoveryIndex([slow(), slow(), slow()]);
    expect(idx.hi - idx.lo).toBeGreaterThan(0.5);
  });

  it("coarse evidence cannot move a volume ceiling at full strength", () => {
    // Same count, same direction, different resolution: pair count was
    // measuring diligence, and this makes it measure evidence.
    const tight = () => recoveryCurve(feelReading(5, 0.1)!, feelReading(4, 6)!)!;
    const coarse = () => recoveryCurve(feelReading(3, 0.1)!, feelReading(3, 20)!)!;
    const t = recoveryIndex(Array.from({ length: 5 }, tight));
    const c = recoveryIndex(Array.from({ length: 5 }, coarse));
    expect(c.resolution).toBeLessThan(t.resolution);
    expect(c.confidence).toBeLessThan(t.confidence);
    expect(c.pairs).toBe(t.pairs);
  });

  it("resolution rises with the pair count, because the interval narrows", () => {
    const at = (n: number) => recoveryIndex(Array.from({ length: n }, slow));
    expect(at(2).resolution).toBeLessThan(at(5).resolution);
    expect(at(5).resolution).toBeLessThan(at(20).resolution);
    expect(at(40).resolution).toBeLessThanOrEqual(1);
    // …and the published interval narrows with it.
    expect(at(20).hi - at(20).lo).toBeLessThan(at(2).hi - at(2).lo);
  });

  it("still says nothing at all below the pair floor", () => {
    const none = recoveryIndex([slow()]);
    expect(none.confidence).toBe(0);
    expect(none.resolution).toBe(0);
    expect(clearanceFactor(none)).toBe(1);
    expect(MIN_RECOVERY_PAIRS).toBe(2);
  });

  it("and a consistent, well-resolved clearer still moves the ceiling", () => {
    // The damping must not become a mute: enough clean pairs and the estimate
    // is allowed to do its job.
    const many = recoveryIndex(Array.from({ length: 30 }, slow));
    expect(many.clearance).toBe("slow");
    expect(many.confidence).toBeGreaterThan(0.5);
    expect(clearanceFactor(many)).toBeLessThan(1);
  });

  it("resolution is 1 only once the mean interval reaches the band", () => {
    const band = CLEARANCE_SLOW - CLEARANCE_FAST;
    expect(resolutionOf(band, 1)).toBe(1);
    expect(resolutionOf(band * 4, 1)).toBeCloseTo(0.25, 6);
    // Four independent pairs halve the mean's width, so they double resolution.
    expect(resolutionOf(band * 4, 4)).toBeCloseTo(0.5, 6);
    expect(resolutionOf(band / 2, 1)).toBe(1);
  });
});
