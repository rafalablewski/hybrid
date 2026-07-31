import { describe, it, expect } from "vitest";
import { weekVerdict, VERDICT_METRICS, verdictLeadKey, verdictWhyKey, type WeekVerdict } from "./week-verdict";
import type { LoggedSession, SessionBlock } from "./engines/session";

const NOW = Date.parse("2026-07-31T12:00:00.000Z");
const WEEK = 7 * 86_400_000;

/** One strength session `daysAgo` back, moving `kg` of tonnage over `minutes`. */
function s(daysAgo: number, kg: number, minutes = 60): LoggedSession {
  const started = NOW - daysAgo * 86_400_000;
  // 1 set × 1 rep × kg = kg of tonnage, so the arithmetic in each test is plain.
  const blocks: SessionBlock[] = [{ kind: "strength", name: "Deadlift", sets: [{ load: kg, reps: 1 }] } as SessionBlock];
  return {
    id: `s${daysAgo}-${kg}`,
    title: "Session",
    startedAt: new Date(started).toISOString(),
    completedAt: new Date(started + minutes * 60000).toISOString(),
    blocks,
  } as LoggedSession;
}

/** One cardio session `daysAgo` back covering `km`. */
const run = (daysAgo: number, km: number): LoggedSession => ({
  ...s(daysAgo, 0),
  id: `r${daysAgo}`,
  blocks: [{ kind: "cardio", name: "Run", discipline: "running", minutes: 30, distance: km } as SessionBlock],
});

/** Four prior weeks each carrying one session of `kg`, so the baseline is `kg`. */
const fourFlatWeeks = (kg: number) => [s(9, kg), s(16, kg), s(23, kg), s(30, kg)];

describe("weekVerdict", () => {
  it("is cold with no sessions at all, and still returns three figures", () => {
    const v = weekVerdict([], NOW);
    expect(v.cold).toBe(true);
    expect(v.metric).toBeNull();
    expect(v.direction).toBe("flat");
    // No endurance anywhere → no distance column for a pure lifter.
    expect(v.figures.map((f) => f.metric)).toEqual(["tonnage", "sessions", "hours"]);
    expect(v.figures.every((f) => f.value === 0 && f.baseline === 0)).toBe(true);
  });

  it("stays cold until two of the four prior weeks carry training", () => {
    // One prior week only — a percentage off that is a coin flip.
    const one = weekVerdict([s(2, 1000), s(9, 100)], NOW);
    expect(one.cold).toBe(true);
    expect(one.baselineWeeks).toBe(1);

    const two = weekVerdict([s(2, 1000), s(9, 100), s(16, 100)], NOW);
    expect(two.cold).toBe(false);
    expect(two.baselineWeeks).toBe(2);
  });

  it("names the metric and the direction when tonnage falls past the threshold", () => {
    // baseline 10 000 kg/wk, this week 7 900 → −21%.
    const v = weekVerdict([s(2, 7900), ...fourFlatWeeks(10_000)], NOW);
    expect(v.metric).toBe("tonnage");
    expect(v.direction).toBe("down");
    expect(v.deltaPct).toBe(-21);
    expect(v.cold).toBe(false);
  });

  it("reads the same rise as up", () => {
    const v = weekVerdict([s(2, 12_000), ...fourFlatWeeks(10_000)], NOW);
    expect(v.metric).toBe("tonnage");
    expect(v.direction).toBe("up");
    expect(v.deltaPct).toBe(20);
  });

  it("says nothing when every metric sits inside the threshold", () => {
    // 10 800 vs a 10 000 baseline is +8% — real, but not worth a sentence.
    const v = weekVerdict([s(2, 10_800, 60), ...fourFlatWeeks(10_000)], NOW);
    expect(v.metric).toBeNull();
    expect(v.direction).toBe("flat");
    expect(v.deltaPct).toBe(0);
    expect(v.cold).toBe(false);
    // The figures still render — the card never goes blank.
    expect(v.figures[0]!.value).toBe(10_800);
  });

  it("picks the LARGEST absolute move when several cross the threshold", () => {
    // Tonnage −20%, session count −50%: the count is the louder story.
    const prior = [
      s(9, 5000), s(10, 5000),
      s(16, 5000), s(17, 5000),
      s(23, 5000), s(24, 5000),
      s(30, 5000), s(31, 5000),
    ];
    const v = weekVerdict([s(2, 8000), ...prior], NOW);
    expect(v.metric).toBe("sessions");
    expect(v.deltaPct).toBe(-50);
  });

  it("counts an empty prior week into the baseline rather than dropping it", () => {
    // Trained weeks 2, 3, 4 at 10 000; week 1 off. Baseline = 30 000 / 4 = 7 500,
    // so this week's 10 000 reads as +33% — a real return, not a flat week.
    const v = weekVerdict([s(2, 10_000), s(16, 10_000), s(23, 10_000), s(30, 10_000)], NOW);
    expect(v.baselineWeeks).toBe(3);
    expect(v.figures[0]!.baseline).toBe(7500);
    expect(v.direction).toBe("up");
    expect(v.deltaPct).toBe(33);
  });

  it("ignores a metric with no baseline instead of dividing by zero", () => {
    // Prior weeks logged sessions with zero tonnage (cardio-only), so the
    // tonnage baseline is 0 and only `sessions` can carry the verdict.
    const cardio = (daysAgo: number): LoggedSession => ({
      ...s(daysAgo, 0),
      blocks: [{ kind: "cardio", name: "Run", discipline: "running", minutes: 30, distance: 5 } as SessionBlock],
    });
    const v = weekVerdict([s(2, 5000), s(3, 5000), s(4, 5000), cardio(9), cardio(16)], NOW);
    expect(Number.isFinite(v.deltaPct)).toBe(true);
    expect(v.metric).toBe("sessions");
  });

  it("only carries a distance column for an athlete who logs endurance", () => {
    const lifter = weekVerdict([s(2, 10_000), ...fourFlatWeeks(10_000)], NOW);
    expect(lifter.figures.some((f) => f.metric === "distance")).toBe(false);

    const hybrid = weekVerdict([s(2, 10_000), run(3, 8), ...fourFlatWeeks(10_000)], NOW);
    const dist = hybrid.figures.find((f) => f.metric === "distance");
    expect(dist?.value).toBe(8);
    // Order is VERDICT_METRICS order — distance sits last.
    expect(hybrid.figures.map((f) => f.metric)).toEqual([...VERDICT_METRICS]);
  });

  it("lets distance carry the verdict when it is the metric that moved", () => {
    // Same session count, same time on feet, 8 km instead of the usual 20 —
    // only the distance moved, so only distance has a sentence to offer.
    const v = weekVerdict([run(2, 8), run(9, 20), run(16, 20), run(23, 20), run(30, 20)], NOW);
    expect(v.metric).toBe("distance");
    expect(v.direction).toBe("down");
    expect(v.deltaPct).toBe(-60);
  });

  it("keeps the distance column for a runner who took this week off", () => {
    // Ran the four prior weeks, nothing this week — the column has to survive,
    // or the week they most need to see is the week the number disappears.
    const v = weekVerdict([run(9, 20), run(16, 20), run(23, 20), run(30, 20)], NOW);
    const dist = v.figures.find((f) => f.metric === "distance");
    expect(dist?.value).toBe(0);
    expect(dist?.baseline).toBe(20);
    // Sessions and distance are BOTH −100%; VERDICT_METRICS order breaks the
    // tie, and "your session count" is the truer sentence for a week off.
    expect(v.metric).toBe("sessions");
    expect(v.deltaPct).toBe(-100);
  });

  it("is stable across the window edges — a session exactly a week old is prior", () => {
    const edge = weekVerdict([s(7.001, 10_000), ...fourFlatWeeks(10_000)], NOW);
    expect(edge.figures[0]!.value).toBe(0);
  });
});

describe("verdict i18n key helpers", () => {
  const base: WeekVerdict = {
    figures: [], metric: null, direction: "flat", deltaPct: 0, cold: false, baselineWeeks: 4,
  };

  it("maps every state to its own sentence and working-out", () => {
    expect(verdictLeadKey({ ...base, cold: true })).toBe("w.home.week.coldLead");
    expect(verdictLeadKey(base)).toBe("w.home.week.flatLead");
    expect(verdictLeadKey({ ...base, metric: "tonnage", direction: "down" })).toBe("w.home.week.downLead");
    expect(verdictLeadKey({ ...base, metric: "tonnage", direction: "up" })).toBe("w.home.week.upLead");

    expect(verdictWhyKey({ ...base, cold: true })).toBe("w.home.week.coldWhy");
    expect(verdictWhyKey(base)).toBe("w.home.week.flatWhy");
    expect(verdictWhyKey({ ...base, metric: "hours", direction: "up" })).toBe("w.home.week.vsAvg");
  });
});
