import { describe, it, expect } from "vitest";
import {
  LABEL_LEGS,
  RETENTION_GAP_WEEKS,
  weekKeyDiff,
  utcMondayKey,
  addWeeks,
  gradeAthleteWeeks,
  labeledAthleteWeeks,
  athleteWeekLedger,
  legCapture,
  bindingLeg,
  numberMovement,
  judgeEffect,
  VANITY_METRICS,
  type AthleteWeekInput,
} from "./athlete-weeks";

// Mondays, a week apart.
const W = (n: number) => new Date(Date.UTC(2026, 5, 1) + n * 7 * 86_400_000).toISOString().slice(0, 10);

const week = (userId: string, w: number, legs: Partial<Pick<AthleteWeekInput, "state" | "intervention" | "outcome">> = {}): AthleteWeekInput => ({
  userId,
  week: W(w),
  state: legs.state ?? true,
  intervention: legs.intervention ?? true,
  outcome: legs.outcome ?? true,
});

describe("weekKeyDiff", () => {
  it("counts whole weeks between Monday keys", () => {
    expect(weekKeyDiff(W(0), W(3))).toBe(3);
    expect(weekKeyDiff(W(3), W(0))).toBe(-3);
    expect(weekKeyDiff(W(2), W(2))).toBe(0);
  });

  it("is timezone-free label math across a DST boundary", () => {
    // Late Oct → early Nov crosses the EU and US clock changes.
    expect(weekKeyDiff("2026-10-19", "2026-11-09")).toBe(3);
  });
});

describe("gradeAthleteWeeks", () => {
  it("labels only the week with all three legs", () => {
    const graded = gradeAthleteWeeks([
      week("a", 0),
      week("a", 1, { outcome: false }),
      week("a", 2, { state: false, outcome: false }),
    ]);
    expect(graded.map((g) => g.labeled)).toEqual([true, false, false]);
    expect(graded[1]!.missing).toEqual(["outcome"]);
    expect(graded[2]!.missing).toEqual(["state", "outcome"]);
  });

  it("does not count an athlete's first week — labeled, but nothing has been retained yet", () => {
    const graded = gradeAthleteWeeks([week("a", 0), week("a", 1)]);
    expect(graded[0]!.labeled).toBe(true);
    expect(graded[0]!.retained).toBe(false);
    expect(graded[0]!.counts).toBe(false);
    expect(graded[1]!.counts).toBe(true);
    expect(labeledAthleteWeeks(graded)).toBe(1);
  });

  it("counts a return inside the retention gap and restarts the clock beyond it", () => {
    const inGap = gradeAthleteWeeks([week("a", 0), week("a", RETENTION_GAP_WEEKS)]);
    expect(inGap[1]!.counts).toBe(true);

    const churned = gradeAthleteWeeks([week("a", 0), week("a", RETENTION_GAP_WEEKS + 1)]);
    expect(churned[1]!.retained).toBe(false);
    expect(labeledAthleteWeeks(churned)).toBe(0);
  });

  it("tests retention against presence, not against labeling", () => {
    // Week 0 captured nothing but the intervention — the athlete was still here,
    // so week 1 is a retained week.
    const graded = gradeAthleteWeeks([
      week("a", 0, { state: false, outcome: false }),
      week("a", 1),
    ]);
    expect(graded[1]!.counts).toBe(true);
  });

  it("keeps athletes apart", () => {
    const graded = gradeAthleteWeeks([week("a", 0), week("b", 1)]);
    expect(graded.every((g) => !g.retained)).toBe(true);
    expect(labeledAthleteWeeks(graded)).toBe(0);
  });

  it("reads zero on an empty corpus rather than dividing by it", () => {
    expect(labeledAthleteWeeks(gradeAthleteWeeks([]))).toBe(0);
    expect(legCapture([]).every((l) => l.rate === null)).toBe(true);
    expect(bindingLeg([]).leg).toBe(null);
  });
});

describe("athleteWeekLedger", () => {
  const graded = gradeAthleteWeeks([
    week("a", 0),
    week("a", 1),
    week("a", 2, { outcome: false }),
    week("b", 1),
    week("b", 2),
  ]);

  it("splits each week into banked, first weeks and partials", () => {
    const ledger = athleteWeekLedger(graded);
    expect(ledger.map((r) => r.week)).toEqual([W(0), W(1), W(2)]);
    expect(ledger[0]).toMatchObject({ labeled: 0, firstWeeks: 1, partial: 0, athletes: 1 });
    expect(ledger[1]).toMatchObject({ labeled: 1, firstWeeks: 1, partial: 0, athletes: 2 });
    expect(ledger[2]).toMatchObject({ labeled: 1, firstWeeks: 0, partial: 1, athletes: 2 });
    expect(ledger[2]!.missing.outcome).toBe(1);
  });

  it("drops lookback weeks from the report without dropping them from retention", () => {
    const ledger = athleteWeekLedger(graded, W(1));
    expect(ledger.map((r) => r.week)).toEqual([W(1), W(2)]);
    // W(1) still counts for athlete a, which is only knowable from W(0).
    expect(ledger[0]!.labeled).toBe(1);
  });

  it("zero-fills a span, so a week nobody logged is a nil return and not a gap", () => {
    const ledger = athleteWeekLedger(graded, W(0), 5);
    expect(ledger.map((r) => r.week)).toEqual([W(0), W(1), W(2), W(3), W(4)]);
    expect(ledger[3]).toMatchObject({ labeled: 0, firstWeeks: 0, partial: 0, athletes: 0 });
    expect(ledger[4]!.missing).toEqual({ state: 0, intervention: 0, outcome: 0 });
  });
});

describe("utcMondayKey and addWeeks", () => {
  it("lands on the Monday of the UTC week, whatever day is asked", () => {
    // 2026-06-01 is a Monday; the whole week resolves to it.
    expect(utcMondayKey(Date.UTC(2026, 5, 1, 0, 0))).toBe("2026-06-01");
    expect(utcMondayKey(Date.UTC(2026, 5, 7, 23, 59))).toBe("2026-06-01");
    expect(utcMondayKey(Date.UTC(2026, 5, 8))).toBe("2026-06-08");
  });

  it("steps whole weeks in both directions, across a month and a year end", () => {
    expect(addWeeks("2026-06-01", 3)).toBe("2026-06-22");
    expect(addWeeks("2026-06-01", -1)).toBe("2026-05-25");
    expect(addWeeks("2025-12-29", 1)).toBe("2026-01-05");
  });

  it("round-trips against weekKeyDiff", () => {
    const start = utcMondayKey(Date.UTC(2026, 7, 12));
    expect(weekKeyDiff(start, addWeeks(start, 26))).toBe(26);
  });
});

describe("legCapture and bindingLeg", () => {
  it("names the leg the corpus loses the most weeks to", () => {
    const graded = gradeAthleteWeeks([
      week("a", 0, { outcome: false }),
      week("a", 1, { outcome: false }),
      week("a", 2, { state: false }),
    ]);
    const capture = legCapture(graded);
    expect(capture.map((c) => c.leg)).toEqual([...LABEL_LEGS]);
    expect(capture[2]).toMatchObject({ leg: "outcome", captured: 1, missing: 2, rate: 1 / 3 });

    const binding = bindingLeg(graded);
    expect(binding.leg).toBe("outcome");
    expect(binding.weeksBlocked).toBe(2);
  });

  it("separates weeks blocked from weeks a single fix would recover", () => {
    const graded = gradeAthleteWeeks([
      week("a", 0, { outcome: false }),
      week("a", 1, { outcome: false, state: false }),
    ]);
    const binding = bindingLeg(graded);
    expect(binding.leg).toBe("outcome");
    expect(binding.weeksBlocked).toBe(2);
    // Fixing outcome alone rescues one of them; the other is still missing state.
    expect(binding.weeksRecoverable).toBe(1);
  });

  it("names nothing when every active week is already complete", () => {
    expect(bindingLeg(gradeAthleteWeeks([week("a", 0), week("a", 1)])).leg).toBe(null);
  });
});

describe("numberMovement", () => {
  const ledger = [
    { week: W(0), labeled: 2, firstWeeks: 0, partial: 0, athletes: 2, missing: { state: 0, intervention: 0, outcome: 0 } },
    { week: W(1), labeled: 5, firstWeeks: 0, partial: 0, athletes: 5, missing: { state: 0, intervention: 0, outcome: 0 } },
    { week: W(2), labeled: 1, firstWeeks: 0, partial: 0, athletes: 1, missing: { state: 0, intervention: 0, outcome: 0 } },
  ];

  it("judges the last COMPLETE week, since the current one is still accruing", () => {
    const m = numberMovement(ledger);
    expect(m.latest).toBe(5);
    expect(m.previous).toBe(2);
    expect(m.delta).toBe(3);
    expect(m.total).toBe(8); // the cumulative total keeps the part-week
  });

  it("can be asked about the running week explicitly", () => {
    expect(numberMovement(ledger, false).latest).toBe(1);
  });

  it("has no run rate without weeks", () => {
    expect(numberMovement([]).run4).toBe(null);
  });
});

describe("judgeEffect", () => {
  it("scores work by what it did to the number", () => {
    expect(judgeEffect(10, 14)).toMatchObject({ delta: 4, pct: 0.4, verdict: "moved" });
    expect(judgeEffect(10, 10).verdict).toBe("flat");
    expect(judgeEffect(10, 6).verdict).toBe("lost");
  });

  it("refuses a percentage against a zero base, and says when the clock never started", () => {
    expect(judgeEffect(0, 3)).toMatchObject({ delta: 3, pct: null, verdict: "moved" });
    expect(judgeEffect(0, 0).verdict).toBe("unstarted");
  });
});

describe("VANITY_METRICS", () => {
  it("names every counter with the reason it is not the metric", () => {
    expect(VANITY_METRICS.length).toBeGreaterThan(0);
    expect(VANITY_METRICS.every((m) => m.label.length > 0 && m.why.length > 0)).toBe(true);
  });
});
