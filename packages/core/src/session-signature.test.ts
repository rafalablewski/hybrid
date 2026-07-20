import { describe, it, expect } from "vitest";
import { sessionSignature, SIGNATURE_MIN_BARS } from "./session-signature";
import type { LoggedSession } from "./engines/session";

const base = (blocks: LoggedSession["blocks"]): LoggedSession => ({
  id: "s1",
  title: "Session",
  startedAt: "2026-01-10T10:00:00.000Z",
  blocks,
});

describe("sessionSignature", () => {
  it("uses RPE when logged (rpe/10)", () => {
    const s = base([{ kind: "strength", name: "Squat", sets: [{ load: "100", reps: "5", rpe: "8" }, { load: "100", reps: "5", rpe: "10" }] }]);
    const bars = sessionSignature(s);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toBeCloseTo(0.8);
    expect(bars[1]).toBeCloseTo(1);
  });

  it("falls back to load-relative height when RPE is absent", () => {
    const s = base([{ kind: "strength", name: "Bench", sets: [{ load: "50", reps: "5" }, { load: "100", reps: "5" }] }]);
    const bars = sessionSignature(s);
    // The heavier set is the taller bar.
    expect(bars[1]).toBeGreaterThan(bars[0]!);
    expect(bars[1]).toBeCloseTo(1);
  });

  it("emits one bar per cardio/conditioning effort", () => {
    const s = base([{ kind: "cardio", name: "Run", distance: 5, minutes: 25 }]);
    expect(sessionSignature(s)).toHaveLength(1);
  });

  it("is deterministic — same session, same ribbon", () => {
    const s = base([{ kind: "strength", name: "Squat", sets: [{ load: "100", reps: "5", rpe: "7" }] }]);
    expect(sessionSignature(s)).toEqual(sessionSignature(s));
  });

  it("exposes a minimum-bars threshold for callers to gate on", () => {
    expect(SIGNATURE_MIN_BARS).toBeGreaterThan(0);
  });
});
