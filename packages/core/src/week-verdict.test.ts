import { describe, it, expect } from "vitest";
import { activityVerdict, weekVerdict, VERDICT_METRICS, VERDICT_PCT_CEILING, VERDICT_THRESHOLD_PCT, VERDICT_END_THRESHOLD_PCT, figureDeltaPct, figureDirection, figureShowsStep, activityComparison, comparisonBar, comparisonAverageMark, comparisonHeadKey, COMPARE_SCALE_PCT, verdictLeadKey, verdictShowsStep, verdictWhyKey, type ActivityVerdict } from "./week-verdict";
import { resolveActivityRange } from "./activity-window";
import { addLocalDays } from "./day-key";
import type { LoggedSession, SessionBlock } from "./engines/session";

// A local-noon anchor, so every window boundary below is the same distance away
// whatever timezone the suite runs in (the ranges are LOCAL-midnight aligned).
const NOW = new Date(2026, 6, 31, 12, 0, 0).getTime();
const at = (daysAgo: number) => addLocalDays(NOW, -daysAgo);
const d7 = (now = NOW) => resolveActivityRange("d7", now);

/** One strength session `daysAgo` back, moving `kg` of tonnage over `minutes`. */
function s(daysAgo: number, kg: number, minutes = 60): LoggedSession {
  const started = at(daysAgo);
  // 1 set × 1 rep × kg = kg of tonnage, so the arithmetic in each test is plain.
  // A StrengthSet's load/reps are the athlete's typed DISPLAY strings, not numbers.
  const blocks: SessionBlock[] = [{ kind: "strength", name: "Deadlift", sets: [{ load: String(kg), reps: "1" }] }];
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

describe("activityVerdict — the rolling seven days", () => {
  it("is cold with no sessions at all, and still returns three figures", () => {
    const v = activityVerdict([], d7());
    expect(v.cold).toBe(true);
    expect(v.metric).toBeNull();
    expect(v.direction).toBe("flat");
    // No endurance anywhere → no distance column for a pure lifter.
    expect(v.figures.map((f) => f.metric)).toEqual(["tonnage", "sessions", "hours"]);
    expect(v.figures.every((f) => f.value === 0 && f.baseline === 0)).toBe(true);
  });

  it("is cold exactly when the PREVIOUS period carried no training", () => {
    // The axis is one window now, so the gate is the plainest form of the old
    // one: a percentage against a week nobody trained is not a number.
    const gap = activityVerdict([s(2, 1000), s(16, 100), s(23, 100)], d7());
    expect(gap.cold).toBe(true);
    expect(gap.baselinePeriods).toBe(2);

    // …and one trained week immediately before is all it takes.
    const near = activityVerdict([s(2, 1000), s(9, 100)], d7());
    expect(near.cold).toBe(false);
    expect(near.baselinePeriods).toBe(1);
  });

  it("names the metric and the direction when tonnage falls past the threshold", () => {
    // baseline 10 000 kg/wk, this week 7 900 → −21%.
    const v = activityVerdict([s(2, 7900), ...fourFlatWeeks(10_000)], d7());
    expect(v.metric).toBe("tonnage");
    expect(v.direction).toBe("down");
    expect(v.deltaPct).toBe(-21);
    expect(v.cold).toBe(false);
  });

  it("reads the same rise as up", () => {
    const v = activityVerdict([s(2, 12_000), ...fourFlatWeeks(10_000)], d7());
    expect(v.metric).toBe("tonnage");
    expect(v.direction).toBe("up");
    expect(v.deltaPct).toBe(20);
  });

  it("says nothing when every metric sits inside the threshold", () => {
    // 10 800 vs a 10 000 baseline is +8% — real, but not worth a sentence.
    const v = activityVerdict([s(2, 10_800, 60), ...fourFlatWeeks(10_000)], d7());
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
    const v = activityVerdict([s(2, 8000), ...prior], d7());
    expect(v.metric).toBe("sessions");
    expect(v.deltaPct).toBe(-50);
  });

  it("counts an empty prior week into the LANDMARK, which is still a mean", () => {
    // Trained weeks 2, 3, 4 at 10 000; the week immediately before is off. The
    // mean is 30 000 / 4 = 7 500 and still carries the empty week — a fortnight
    // off is part of your average. But the AXIS is that empty week, so the card
    // is cold: there is nothing to measure from, whatever the mean says.
    const v = activityVerdict([s(2, 10_000), s(16, 10_000), s(23, 10_000), s(30, 10_000)], d7());
    expect(v.baselinePeriods).toBe(3);
    expect(v.figures[0]!.baseline).toBe(7500);
    expect(v.figures[0]!.previous).toBe(0);
    expect(v.cold).toBe(true);
  });

  it("ignores a metric with no baseline instead of dividing by zero", () => {
    // Prior weeks logged sessions with zero tonnage (cardio-only), so the
    // tonnage baseline is 0 and only `sessions` can carry the verdict.
    const cardio = (daysAgo: number): LoggedSession => ({
      ...s(daysAgo, 0),
      blocks: [{ kind: "cardio", name: "Run", discipline: "running", minutes: 30, distance: 5 } as SessionBlock],
    });
    const v = activityVerdict([s(2, 5000), s(3, 5000), s(4, 5000), cardio(9), cardio(16)], d7());
    expect(Number.isFinite(v.deltaPct)).toBe(true);
    expect(v.metric).toBe("sessions");
  });

  it("only carries a distance column for an athlete who logs endurance", () => {
    const lifter = activityVerdict([s(2, 10_000), ...fourFlatWeeks(10_000)], d7());
    expect(lifter.figures.some((f) => f.metric === "distance")).toBe(false);

    const hybrid = activityVerdict([s(2, 10_000), run(3, 8), ...fourFlatWeeks(10_000)], d7());
    const dist = hybrid.figures.find((f) => f.metric === "distance");
    expect(dist?.value).toBe(8);
    // Order is VERDICT_METRICS order — distance sits last.
    expect(hybrid.figures.map((f) => f.metric)).toEqual([...VERDICT_METRICS]);
  });

  it("lets distance carry the verdict when it is the metric that moved", () => {
    // Same session count, same time on feet, 8 km instead of the usual 20 —
    // only the distance moved, so only distance has a sentence to offer.
    const v = activityVerdict([run(2, 8), run(9, 20), run(16, 20), run(23, 20), run(30, 20)], d7());
    expect(v.metric).toBe("distance");
    expect(v.direction).toBe("down");
    expect(v.deltaPct).toBe(-60);
  });

  it("keeps the distance column for a runner who took this week off", () => {
    // Ran the four prior weeks, nothing this week — the column has to survive,
    // or the week they most need to see is the week the number disappears.
    const v = activityVerdict([run(9, 20), run(16, 20), run(23, 20), run(30, 20)], d7());
    const dist = v.figures.find((f) => f.metric === "distance");
    expect(dist?.value).toBe(0);
    expect(dist?.baseline).toBe(20);
    // Sessions and distance are BOTH −100%; VERDICT_METRICS order breaks the
    // tie, and "your session count" is the truer sentence for a week off.
    expect(v.metric).toBe("sessions");
    expect(v.deltaPct).toBe(-100);
  });

  it("is stable across the window edges — a session a week and a minute old is prior", () => {
    const older: LoggedSession = { ...s(7, 10_000), startedAt: new Date(at(7) - 60_000).toISOString() };
    const edge = activityVerdict([older, ...fourFlatWeeks(10_000)], d7());
    expect(edge.figures[0]!.value).toBe(0);
  });

  it("weekVerdict() is the same read, without having to name a range", () => {
    const range = activityVerdict([s(2, 12_000), ...fourFlatWeeks(10_000)], d7(NOW));
    const short = weekVerdict([s(2, 12_000), ...fourFlatWeeks(10_000)], NOW);
    expect(short.metric).toBe(range.metric);
    expect(short.deltaPct).toBe(range.deltaPct);
  });
});

describe("activityVerdict — other periods", () => {
  it("a MONTH is compared against the three months before it, not four weeks", () => {
    const july = resolveActivityRange("m:2026-07", NOW);
    const v = activityVerdict([s(2, 10_000)], july);
    expect(v.range.kind).toBe("month");
    expect(v.baselineOf).toBe(3);
    // The working-out has to name the period it compared against.
    expect(verdictWhyKey({ ...v, cold: false, metric: "tonnage" })).toBe("w.home.act.vsMonths");
  });

  it("a year-to-date read isn't permanently cold for want of four windows", () => {
    // Only two prior years exist to compare with, so the cold threshold has to
    // fall to what the range can actually offer.
    const ytd = resolveActivityRange("ytd", NOW);
    const lastYear = new Date(2025, 2, 3, 12).getTime();
    const v = activityVerdict(
      [s(2, 10_000), { ...s(2, 4000), id: "ly", startedAt: new Date(lastYear).toISOString(), completedAt: new Date(lastYear + 3.6e6).toISOString() }],
      ytd,
    );
    expect(v.baselineOf).toBe(2);
    expect(v.cold).toBe(false);
  });

  it("speaks in period-neutral words outside a week", () => {
    const month = resolveActivityRange("m:2026-07", NOW);
    const v: ActivityVerdict = {
      range: month, figures: [], metric: "tonnage", best: "tonnage", worst: null,
      direction: "up", deltaPct: 30, cold: false, baselinePeriods: 3, baselineOf: 3,
    };
    expect(verdictLeadKey(v)).toBe("w.home.act.upLeadP");
    expect(verdictLeadKey({ ...v, direction: "down" })).toBe("w.home.act.downLeadP");
    expect(verdictLeadKey({ ...v, metric: null })).toBe("w.home.act.flatLeadP");
    // …and in the week's own words inside one.
    expect(verdictLeadKey({ ...v, range: d7() })).toBe("w.home.week.upLead");
  });
});

describe("verdict i18n key helpers", () => {
  const base: ActivityVerdict = {
    range: d7(), figures: [], metric: null, best: null, worst: null,
    direction: "flat", deltaPct: 0, cold: false, baselinePeriods: 4, baselineOf: 4,
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

describe("activityVerdict — a thin baseline can't hijack the sentence (A1)", () => {
  // Every week here carries the SAME shape — one lift and one run — so session
  // count and training time are flat and only tonnage and distance can move.
  // Four prior weeks of real lifting beside a token 0.1 km jog: distance's
  // four-week mean is 0.1 km, tonnage's is 5200 kg. Raw-ratio ranking handed
  // the headline to distance at +6700% every single time.
  const priors = [
    ...[9, 16, 23, 30].map((d) => s(d, 5200)),
    ...[9, 16, 23, 30].map((d) => run(d, 0.1)),
  ];

  it("ranks the measure with a real baseline, not the one with the smallest one", () => {
    const v = activityVerdict([...priors, s(2, 7200), run(2, 6.8)], d7());
    expect(v.metric).toBe("tonnage");
    expect(v.deltaPct).toBe(38);
  });

  it("still names a thin-baseline measure when nothing else moved — as the FALLBACK", () => {
    const v = activityVerdict([...priors, s(2, 5200), run(2, 6.8)], d7());
    expect(v.metric).toBe("distance");
  });

  it("prints the fallback as a STEP, never as a four-digit percentage", () => {
    const v = activityVerdict([...priors, s(2, 5200), run(2, 6.8)], d7());
    expect(Math.abs(v.deltaPct)).toBeGreaterThan(VERDICT_PCT_CEILING);
    expect(verdictShowsStep(v)).toBe(true);
  });

  it("keeps the percentage for an ordinary move", () => {
    const v = activityVerdict([...priors, s(2, 7200), run(2, 0.1)], d7());
    expect(v.metric).toBe("tonnage");
    expect(verdictShowsStep(v)).toBe(false);
    expect(v.deltaPct).toBe(38);
  });

  it("a measure trained in one of four prior windows can't outrank one trained in all four", () => {
    // 8 km in a single prior week: the MEAN (2 km) clears the floor, but the
    // metric was present in one window out of four, so coverage rejects it.
    // The zero-distance runs keep session count and hours flat.
    const sparse = [
      ...[9, 16, 23, 30].map((d) => s(d, 5200)),
      run(9, 0), run(16, 0), run(23, 0), run(30, 8),
    ];
    const v = activityVerdict([...sparse, s(2, 7200), run(2, 20)], d7());
    expect(v.metric).toBe("tonnage");
  });

  it("distance wins outright once it has a baseline of its own", () => {
    const trained = [
      ...[9, 16, 23, 30].map((d) => s(d, 5200)),
      ...[9, 16, 23, 30].map((d) => run(d, 10)),
    ];
    const v = activityVerdict([...trained, s(2, 5200), run(2, 30)], d7());
    expect(v.metric).toBe("distance");
    expect(v.deltaPct).toBe(200);
    expect(verdictShowsStep(v)).toBe(false);
  });
});

/* ── A COLUMN'S OWN MOVE ───────────────────────────────────────────────────
   A figure restated away from the row it was ranked in — the breakdown sheet
   carries the pressed column's total behind a scrim — has to be able to say
   what IT did, independently of the metric the sentence named, which may be a
   different one moving the other way. */
describe("figureDirection / figureDeltaPct", () => {
  // The AXIS is `previous`; `baseline` is the mean, which is now a landmark and
  // measures nothing. The helper names the axis to keep that straight.
  const f = (value: number, previous: number) => ({ metric: "hours" as const, value, previous, baseline: previous });

  it("no previous period is not a flat move", () => {
    expect(figureDeltaPct(f(120, 0))).toBeNull();
    expect(figureDirection(f(120, 0))).toBe("flat");
    // …and the distinction survives: a figure that appeared from nothing must
    // not print "0%" as if it had held steady.
    expect(figureDeltaPct(f(0, 0))).toBeNull();
  });

  it("reads the signed move against the period before it", () => {
    expect(figureDeltaPct(f(120, 100))).toBe(20);
    expect(figureDeltaPct(f(80, 100))).toBe(-20);
    expect(figureDirection(f(120, 100))).toBe("up");
    expect(figureDirection(f(80, 100))).toBe("down");
  });

  it("takes the MARK's threshold, so a lit column opens into a sheet of the same hue", () => {
    const under = 100 + VERDICT_END_THRESHOLD_PCT - 1;
    expect(figureDirection(f(under, 100))).toBe("flat");
    expect(figureDirection(f(100 + VERDICT_END_THRESHOLD_PCT, 100))).toBe("up");
    expect(figureDirection(f(100 - VERDICT_END_THRESHOLD_PCT, 100))).toBe("down");
  });

  it("a move under the sentence's bar still has a direction", () => {
    // The whole point of the two bars: −9% is not worth a claim in words, and
    // it is absolutely worth a hue on the column it belongs to.
    expect(VERDICT_END_THRESHOLD_PCT).toBeLessThan(VERDICT_THRESHOLD_PCT);
    expect(figureDirection(f(91, 100))).toBe("down");
    expect(figureDirection(f(109, 100))).toBe("up");
  });

  it("carries the ceiling too, so a cell can't print what the lead refuses to", () => {
    // The card's lead prints "0.1 → 6.8 km" past VERDICT_PCT_CEILING because a
    // four-digit percentage reads as a bug. The receipt cell prints that same
    // metric's own signed percentage, and it was printing it RAW — so the one
    // card carried an honest step and a "+7849%" three lines apart.
    expect(figureShowsStep(f(680, 10))).toBe(true);
    expect(figureShowsStep(f(120, 100))).toBe(false);
    // Exactly ON the ceiling is still a percentage — the step is for what is
    // PAST it, the same strict comparison the sentence's version always used.
    expect(figureShowsStep(f(100 * (1 + VERDICT_PCT_CEILING / 100), 100))).toBe(false);
    // No axis is not an enormous move; it is no move to render either way.
    expect(figureShowsStep(f(680, 0))).toBe(false);
  });

  it("the sentence's ceiling IS the named figure's — one rule, asked twice", () => {
    // The A1 fixture: four prior weeks of real lifting beside a token 0.1 km
    // jog, then a week that holds the tonnage and runs 6.8 km — nothing else
    // moved, so the thin-baselined distance takes the sentence as the FALLBACK
    // and lands past the ceiling.
    const priors = [
      ...[9, 16, 23, 30].map((d) => s(d, 5200)),
      ...[9, 16, 23, 30].map((d) => run(d, 0.1)),
    ];
    const v = activityVerdict([...priors, s(2, 5200), run(2, 6.8)], d7());
    expect(v.metric).toBe("distance");
    expect(verdictShowsStep(v)).toBe(figureShowsStep(v.figures.find((x) => x.metric === "distance")!));
    expect(verdictShowsStep(v)).toBe(true);
  });

  it("a column may move opposite to the metric the sentence named", () => {
    // Tonnage climbing while the hours behind it fall: the card's headline is
    // the rise, but opening Hours has to read terracotta.
    const priors = [9, 16, 23, 30].map((d) => s(d, 5000, 90));
    const v = activityVerdict([...priors, s(2, 9000, 45)], d7());
    expect(v.metric).toBe("tonnage");
    expect(v.direction).toBe("up");

    const hours = v.figures.find((x) => x.metric === "hours")!;
    expect(figureDirection(hours)).toBe("down");
    expect(figureDirection(v.figures.find((x) => x.metric === "tonnage")!)).toBe("up");
  });

  it("every figure the card renders can be asked, including the named one", () => {
    const priors = [9, 16, 23, 30].map((d) => s(d, 5000));
    const v = activityVerdict([...priors, s(2, 9000)], d7());
    for (const fig of v.figures) expect(["up", "down", "flat"]).toContain(figureDirection(fig));
    // The named metric's own direction agrees with the sentence's.
    const namedFig = v.figures.find((x) => x.metric === v.metric)!;
    expect(figureDirection(namedFig)).toBe(v.direction);
  });
});

/* ── THE PERIOD'S TWO ENDS ─────────────────────────────────────────────────
   `metric` is one slot, so it can only ever name the biggest move. `best` and
   `worst` rank the two directions separately, which is what lets the figure row
   light the win and the slip at once. */
describe("activityVerdict — best / worst", () => {
  it("marks the biggest riser and the biggest faller", () => {
    // Tonnage climbing while the hours behind it fall.
    const priors = [9, 16, 23, 30].map((d) => s(d, 5000, 90));
    const v = activityVerdict([...priors, s(2, 9000, 45)], d7());
    expect(v.best).toBe("tonnage"); // +80%
    expect(v.worst).toBe("hours");  // −50%
  });

  it("lights the drop the sentence had no room for", () => {
    // The week the card was built to stop hiding: training time up, distance
    // down by three quarters. The sentence gets the bigger of the two; the row
    // has to carry BOTH, or the 4 km → 1 km never appears in colour anywhere.
    const priors = [9, 16, 23, 30].flatMap((d) => [s(d, 5000, 60), run(d, 4)]);
    const v = activityVerdict([...priors, s(2, 5000, 90), run(2, 1)], d7());
    expect(v.best).toBe("hours");
    expect(v.worst).toBe("distance");
  });

  it("the sentence's metric is always one of the two ends", () => {
    const priors = [9, 16, 23, 30].flatMap((d) => [s(d, 5000, 60), run(d, 4)]);
    const v = activityVerdict([...priors, s(2, 5000, 90), run(2, 1)], d7());
    expect(v.metric).not.toBeNull();
    expect([v.best, v.worst]).toContain(v.metric);
  });

  it("marks the faller the SENTENCE has no room for, even under the sentence's bar", () => {
    // The reported week, in miniature: training time and tonnage up, and the
    // only measure that went BACKWARDS down a single digit. A claim needs 15%;
    // being the worst end of your own row does not, and on one shared bar this
    // week lit the rise and left the slip looking like the figures that held.
    const priors = [9, 16, 23, 30].flatMap((d) => [s(d, 5000, 60), run(d, 4)]);
    const v = activityVerdict([...priors, s(2, 9000, 60), run(2, 3.6)], d7());
    const distance = v.figures.find((x) => x.metric === "distance")!;
    expect(figureDeltaPct(distance)).toBe(-10);
    expect(Math.abs(figureDeltaPct(distance)!)).toBeLessThan(VERDICT_THRESHOLD_PCT);
    expect(v.worst).toBe("distance");
    expect(v.best).toBe("tonnage");
    // …and the sentence stays off it: a 10% slip is still not worth a claim.
    expect(v.metric).toBe("tonnage");
    expect(v.direction).toBe("up");
  });

  it("still leaves the ends to noise — round-off is not a slip", () => {
    const priors = [9, 16, 23, 30].flatMap((d) => [s(d, 5000, 60), run(d, 4)]);
    const v = activityVerdict([...priors, s(2, 9000, 60), run(2, 3.92)], d7());
    expect(figureDeltaPct(v.figures.find((x) => x.metric === "distance")!)).toBe(-2);
    expect(v.worst).toBeNull();
  });

  it("leaves an end empty when nothing moved that way", () => {
    const v = activityVerdict([...fourFlatWeeks(5000), s(2, 9000, 60)], d7());
    expect(v.best).toBe("tonnage");
    expect(v.worst).toBeNull();
  });

  it("marks neither end while the card is cold", () => {
    const v = activityVerdict([s(2, 9000)], d7());
    expect(v.cold).toBe(true);
    expect(v.best).toBeNull();
    expect(v.worst).toBeNull();
  });

  it("a thin-axis rise does not take the mark off a metric with a real one", () => {
    // 0.4 km in the week before against 6 km this week is +1400%. It is the
    // same figure the SENTENCE refuses to headline, so it must not take the
    // chartreuse either — the card's brightest mark cannot land on the figure
    // it trusts least while a metric with a real previous week is up 80%.
    const priors = [16, 23, 30].map((d) => s(d, 5000, 60));
    const v = activityVerdict([...priors, s(9, 5000, 60), run(9, 0.4), s(2, 9000, 60), run(2, 6)], d7());
    const distance = v.figures.find((x) => x.metric === "distance")!;
    expect(figureDeltaPct(distance)!).toBeGreaterThan(VERDICT_PCT_CEILING);
    expect(v.best).toBe("tonnage");
    expect(v.metric).toBe("tonnage");
  });

  it("an end never contradicts that figure's own direction", () => {
    const priors = [9, 16, 23, 30].flatMap((d) => [s(d, 5000, 60), run(d, 4)]);
    const v = activityVerdict([...priors, s(2, 5000, 90), run(2, 1)], d7());
    for (const fig of v.figures) {
      if (fig.metric === v.best) expect(figureDirection(fig)).toBe("up");
      if (fig.metric === v.worst) expect(figureDirection(fig)).toBe("down");
    }
  });
});

/* ── THE COMPARISON PAGE ───────────────────────────────────────────────────
   The figure row marks two of four metrics, because the two ENDS are all a row
   of totals has room to argue about. The other two comparisons were computed
   and thrown away on every render; the second page keeps them. */
describe("activityComparison", () => {
  it("carries every figure the row carries, in the row's order", () => {
    const priors = [9, 16, 23, 30].flatMap((d) => [s(d, 5000, 60), run(d, 4)]);
    const v = activityVerdict([...priors, s(2, 9000, 60), run(2, 3.6)], d7());
    const rows = activityComparison(v);

    // Same population, same order — a chart that re-sorted itself would be the
    // sorted-columns mistake the card already made once and fixed.
    expect(rows.map((r) => r.metric)).toEqual(v.figures.map((f) => f.metric));
  });

  it("states the move three ways, and the difference needs no baseline", () => {
    const priors = [9, 16, 23, 30].flatMap((d) => [s(d, 5000, 60), run(d, 4)]);
    const v = activityVerdict([...priors, s(2, 9000, 60), run(2, 3.6)], d7());
    const tonnage = activityComparison(v).find((r) => r.metric === "tonnage")!;

    expect(tonnage.baseline).toBe(5000);
    expect(tonnage.value).toBe(9000);
    expect(tonnage.deltaPct).toBe(80);
    expect(tonnage.diff).toBe(4000);
  });

  it("agrees with the row above it about the two ends", () => {
    const priors = [9, 16, 23, 30].flatMap((d) => [s(d, 5000, 60), run(d, 4)]);
    const v = activityVerdict([...priors, s(2, 9000, 60), run(2, 3.6)], d7());
    const rows = activityComparison(v);

    expect(rows.find((r) => r.end === "best")!.metric).toBe(v.best);
    expect(rows.find((r) => r.end === "worst")!.metric).toBe(v.worst);
    // …and nothing else is marked: a chart that lit every rise would put
    // chartreuse on a column the row one swipe away leaves in ash.
    expect(rows.filter((r) => r.end !== null)).toHaveLength(2);
  });

  it("uses the SAME percentage the figure row prints", () => {
    const priors = [9, 16, 23, 30].flatMap((d) => [s(d, 5000, 60), run(d, 4)]);
    const v = activityVerdict([...priors, s(2, 9000, 90), run(2, 3.6)], d7());
    for (const r of activityComparison(v)) {
      const fig = v.figures.find((f) => f.metric === r.metric)!;
      expect(r.deltaPct).toBe(figureDeltaPct(fig));
    }
  });

  it("draws no bar where there is no baseline to draw an axis against", () => {
    const v = activityVerdict([s(2, 9000, 60)], d7());
    expect(v.cold).toBe(true);
    for (const r of activityComparison(v)) {
      expect(r.deltaPct).toBeNull();
      expect(comparisonBar(r)).toBeNull();
      // The figures survive — a cold card shows them and makes no claim.
      expect(Number.isFinite(r.value)).toBe(true);
      expect(Number.isFinite(r.diff)).toBe(true);
    }
  });

  it("pins the bar past the scale and lets the figure keep counting", () => {
    const priors = [16, 23, 30].map((d) => s(d, 5000, 60));
    const v = activityVerdict([...priors, s(9, 5000, 60), run(9, 0.4), s(2, 9000, 60), run(2, 6)], d7());
    const distance = activityComparison(v).find((r) => r.metric === "distance")!;

    expect(distance.deltaPct!).toBeGreaterThan(COMPARE_SCALE_PCT);
    expect(comparisonBar(distance)).toBe(1);
  });

  it("maps a move onto the half-track, signed", () => {
    const at = (pct: number) => comparisonBar({
      metric: "hours", value: 0, previous: 0, baseline: 0, deltaPct: pct, diff: 0, end: null,
    });
    expect(at(0)).toBe(0);
    expect(at(COMPARE_SCALE_PCT)).toBe(1);
    expect(at(-COMPARE_SCALE_PCT)).toBe(-1);
    expect(at(COMPARE_SCALE_PCT / 2)).toBeCloseTo(0.5);
    expect(at(-100)).toBe(-1);
  });
});

/* ── THE HEAD ──────────────────────────────────────────────────────────────
   One line, and it says what the AXIS is. It must name the period it compares
   against for the same reason the verdict's working-out does: a month's chart
   quoting four weeks is a chart about the wrong thing. */
describe("comparisonHeadKey", () => {
  const forRange = (id: string) => comparisonHeadKey(activityVerdict([], resolveActivityRange(id, NOW)));

  it("names the period it is drawn against", () => {
    expect(forRange("week")).toBe("w.home.cmp.vsAvg");
    expect(forRange("d7")).toBe("w.home.cmp.vsAvg");
    expect(forRange("d30")).toBe("w.home.cmp.vsD30");
    // A month is addressed by its own id ("m:YYYY-MM"), not the word.
    expect(forRange("m:2026-06")).toBe("w.home.cmp.vsMonths");
    expect(forRange("ytd")).toBe("w.home.cmp.vsYears");
  });
});

/* ── THE AXIS IS THE PERIOD BEFORE ─────────────────────────────────────────
   Pick "last 7 days" and the question is about the 7 days before it. The card
   used to answer with a four-week mean, which is a true sentence about the
   wrong window. The mean survives as a LANDMARK the comparison page draws
   beside the mark, so "up on last week" and "still under your normal" can both
   be read off one row. */
describe("the previous period as the axis", () => {
  it("measures from the window immediately before, not the mean of four", () => {
    // Last week 5 000 kg; the three before it 10 000. A mean would read this
    // week's 6 000 as DOWN (-29% against 8 750); against last week it is UP.
    const v = activityVerdict([s(2, 6000), s(9, 5000), s(16, 10_000), s(23, 10_000), s(30, 10_000)], d7());
    const tonnage = v.figures.find((f) => f.metric === "tonnage")!;

    expect(tonnage.previous).toBe(5000);
    expect(tonnage.baseline).toBe(8750);
    expect(figureDeltaPct(tonnage)).toBe(20);
    expect(v.direction).toBe("up");
  });

  it("keeps the mean as a landmark, and puts it on the same track", () => {
    const v = activityVerdict([s(2, 6000), s(9, 5000), s(16, 10_000), s(23, 10_000), s(30, 10_000)], d7());
    const tonnage = activityComparison(v).find((r) => r.metric === "tonnage")!;

    expect(tonnage.previous).toBe(5000);
    expect(tonnage.baseline).toBe(8750);
    // The mean sits +75% above the axis — past the scale, so its notch pins
    // exactly as a bar would.
    expect(comparisonAverageMark(tonnage)).toBe(1);
  });

  it("places the landmark on the side it actually falls", () => {
    // This time the mean is BELOW last week: three quiet weeks, one big one.
    const v = activityVerdict([s(2, 12_000), s(9, 10_000), s(16, 5000), s(23, 5000), s(30, 5000)], d7());
    const tonnage = activityComparison(v).find((r) => r.metric === "tonnage")!;

    expect(tonnage.baseline).toBeLessThan(tonnage.previous);
    expect(comparisonAverageMark(tonnage)!).toBeLessThan(0);
  });

  it("draws no landmark when the mean IS the previous period", () => {
    // Four identical weeks: a notch would land under the axis it duplicates.
    const v = activityVerdict([s(2, 12_000), ...fourFlatWeeks(10_000)], d7());
    const tonnage = activityComparison(v).find((r) => r.metric === "tonnage")!;

    expect(tonnage.baseline).toBe(tonnage.previous);
    expect(comparisonAverageMark(tonnage)).toBeNull();
  });

  it("draws no landmark, and no bar, without an axis to place them against", () => {
    const v = activityVerdict([s(2, 9000, 60)], d7());
    expect(v.cold).toBe(true);
    for (const r of activityComparison(v)) {
      expect(comparisonBar(r)).toBeNull();
      expect(comparisonAverageMark(r)).toBeNull();
    }
  });

  it("states the difference against the axis, not the mean", () => {
    const v = activityVerdict([s(2, 6000), s(9, 5000), s(16, 10_000), s(23, 10_000), s(30, 10_000)], d7());
    const tonnage = activityComparison(v).find((r) => r.metric === "tonnage")!;
    // 6 000 against last week's 5 000 — the figure an athlete acts on.
    expect(tonnage.diff).toBe(1000);
  });
});
