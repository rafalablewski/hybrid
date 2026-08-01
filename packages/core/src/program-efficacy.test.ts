import { describe, it, expect } from "vitest";
import {
  EFFICACY_WINDOW_DAYS,
  adherenceBand,
  enrollmentOutcome,
  programEfficacy,
  rankProgramCards,
  type EfficacyEnrollment,
} from "./program-efficacy";
import type { LoggedSession } from "./engines/session";

const NOW = new Date("2026-06-16T12:00:00.000Z").getTime();
const DAY = 86_400_000;
/** An enrollment that started long enough ago for the window to be closed. */
const START = NOW - (EFFICACY_WINDOW_DAYS + 7) * DAY;
const onDay = (d: number) => new Date(START + d * DAY + 10 * 3_600_000).toISOString();

/** One squat session on window day `d` at `load` × 5. */
const squat = (d: number, load: number): LoggedSession => ({
  id: `s-${d}-${load}`,
  title: "Squat day",
  startedAt: onDay(d),
  blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: String(load), reps: "5" }] }],
});

/**
 * A full run of the program: trains 3×/week for all 12 weeks, squatting with a
 * linear ramp from `from` to `to` kg. Enough sessions to clear every floor.
 */
const fullRun = (userId: string, from: number, to: number): EfficacyEnrollment => ({
  userId,
  planId: "bb-ppl-6day",
  startedAt: new Date(START).toISOString(),
  sessions: Array.from({ length: 36 }, (_, i) => {
    const d = Math.floor((i * EFFICACY_WINDOW_DAYS) / 36);
    return squat(Math.min(d, EFFICACY_WINDOW_DAYS - 1), Math.round(from + ((to - from) * i) / 35));
  }),
});

/** Stopped logging in week 4 — a dropout. */
const droppedRun = (userId: string): EfficacyEnrollment => ({
  userId,
  planId: "bb-ppl-6day",
  startedAt: new Date(START).toISOString(),
  sessions: Array.from({ length: 10 }, (_, i) => squat(i * 2, 100)),
});

describe("adherence bands", () => {
  it("cuts at 80% and 50%", () => {
    expect(adherenceBand(0.85)).toBe("high");
    expect(adherenceBand(0.8)).toBe("high");
    expect(adherenceBand(0.6)).toBe("mid");
    expect(adherenceBand(0.2)).toBe("low");
  });
});

describe("judging one enrollment", () => {
  it("returns null while the 12-week window is still open", () => {
    const e = fullRun("u1", 100, 110);
    e.startedAt = new Date(NOW - 30 * DAY).toISOString();
    expect(enrollmentOutcome(e, { now: NOW })).toBeNull();
  });

  it("measures the e1RM change from the window's first weeks to its last", () => {
    const o = enrollmentOutcome(fullRun("u1", 100, 110), { now: NOW });
    expect(o?.status).toBe("measured");
    expect(o?.deltaPct).toBeGreaterThan(0.04);
    expect(o?.lifts.map((l) => l.lift)).toContain("Back Squat");
  });

  it("marks an athlete who stopped logging before week 8 as dropped", () => {
    const o = enrollmentOutcome(droppedRun("u2"), { now: NOW });
    expect(o?.status).toBe("dropped");
    expect(o?.deltaPct).toBeNull();
  });

  it("an unknown program yields zero adherence, not a crash", () => {
    const e = { ...fullRun("u3", 100, 105), planId: "no-such-plan" };
    const o = enrollmentOutcome(e, { now: NOW });
    expect(o?.adherence).toBe(0);
  });
});

describe("the program card", () => {
  const cohort = (n: number) => Array.from({ length: n }, (_, i) => fullRun(`u${i}`, 100, 100 + 5 + i));

  it("suppresses the card below K_ANON measured athletes", () => {
    expect(programEfficacy("bb-ppl-6day", cohort(4), { now: NOW })).toBeNull();
  });

  it("publishes median outcome, adherence and dropout at n ≥ 5", () => {
    const card = programEfficacy("bb-ppl-6day", [...cohort(5), droppedRun("dx")], { now: NOW });
    expect(card).not.toBeNull();
    expect(card!.n).toBe(5);
    expect(card!.enrolled).toBe(6);
    expect(card!.dropoutRate).toBeCloseTo(1 / 6, 5);
    expect(card!.medianDeltaPct).toBeGreaterThan(0.05);
    // 36 trained days against 72 prescribed (6-day repeating program × 12 wk).
    expect(card!.medianAdherence).toBeCloseTo(0.5, 1);
    // The squat row is k-anonymous at n=5 and so publishable.
    expect(card!.lifts.find((l) => l.lift === "Back Squat")?.n).toBe(5);
  });

  it("counts each athlete once however many enrollment rows they have", () => {
    const twice = [...cohort(5), fullRun("u0", 100, 200)];
    const card = programEfficacy("bb-ppl-6day", twice, { now: NOW });
    expect(card!.n).toBe(5);
  });

  it("suppresses per-lift and per-band rows below K_ANON independently", () => {
    // Five athletes, but only two share a second lift — that row must not leak.
    const withBench = cohort(5).map((e, i) =>
      i < 2
        ? {
            ...e,
            sessions: [
              ...e.sessions,
              ...Array.from({ length: 4 }, (_, j) => ({
                id: `b-${i}-${j}`,
                title: "Bench",
                startedAt: onDay(j < 2 ? 2 + j : EFFICACY_WINDOW_DAYS - 4 + j),
                blocks: [{ kind: "strength" as const, name: "Bench Press", sets: [{ load: "80", reps: "5" }] }],
              })),
            ],
          }
        : e,
    );
    const card = programEfficacy("bb-ppl-6day", withBench, { now: NOW });
    expect(card!.lifts.some((l) => l.lift === "Bench Press")).toBe(false);
    for (const row of card!.byAdherence) expect(row.n).toBeGreaterThanOrEqual(5);
  });
});

describe("ranking", () => {
  it("orders by measured outcome, evidence breaking ties", () => {
    const a = programEfficacy("bb-ppl-6day", Array.from({ length: 5 }, (_, i) => fullRun(`a${i}`, 100, 112)), { now: NOW })!;
    const b = programEfficacy("bb-ppl-6day", Array.from({ length: 6 }, (_, i) => fullRun(`b${i}`, 100, 104)), { now: NOW })!;
    const ranked = rankProgramCards([b, a]);
    expect(ranked[0]).toBe(a);
  });
});
