import { describe, it, expect } from "vitest";
import {
  combineEndurance, enduranceEfforts, engineScore, transfer, readDiscipline,
  admissibleDiscipline, shiftedThresholds, standardFor,
  ENDURANCE_STANDARDS, TRIATHLON_CLASSES, TIER_POINTS, ELITE_SCORE, isTaggedTriathlon,
  type EnduranceDiscipline,
} from "./endurance-level";
import { estimateFitnessLevel, badgeFor } from "./fitness-level";
import type { LoggedSession, CardioBlock } from "./session";

const NOW = new Date("2026-06-16T12:00:00.000Z").getTime();
const SINCE = NOW - 180 * 86_400_000;
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const cardio = (b: Partial<CardioBlock> & { discipline: CardioBlock["discipline"] }): CardioBlock =>
  ({ kind: "cardio", name: b.name ?? "Effort", ...b }) as CardioBlock;

const S = (id: string, day: number, blocks: CardioBlock[]): LoggedSession =>
  ({ id, title: id, startedAt: daysAgo(day), blocks }) as LoggedSession;

const efforts = (sessions: LoggedSession[], opts: Parameters<typeof enduranceEfforts>[1] extends infer O ? Partial<O> : never = {}) =>
  enduranceEfforts(sessions, { since: SINCE, now: NOW, ...opts });

const readOf = (sessions: LoggedSession[], opts = {}) => combineEndurance(efforts(sessions, opts));

/* ── the currency ──────────────────────────────────────────────────────────── */

describe("the shared engine score", () => {
  const pace = [360, 300, 250, 200];

  it("puts the four tier entries exactly on the quarter marks", () => {
    expect(engineScore(360, pace, false)).toBeCloseTo(25, 5);
    expect(engineScore(300, pace, false)).toBeCloseTo(50, 5);
    expect(engineScore(250, pace, false)).toBeCloseTo(75, 5);
    expect(engineScore(200, pace, false)).toBeCloseTo(100, 5);
  });

  it("runs PAST 100, so the best athletes are not flattened into each other", () => {
    const atBar = engineScore(200, pace, false);
    const wellPast = engineScore(178, pace, false);
    expect(wellPast).toBeGreaterThan(atBar);
    expect(wellPast).toBeGreaterThan(ELITE_SCORE);
  });

  it("decays below novice rather than clamping, so slow still ranks against slow", () => {
    const slow = engineScore(420, pace, false);
    const slower = engineScore(600, pace, false);
    expect(slow).toBeGreaterThan(slower);
    expect(slower).toBeGreaterThan(0);
  });

  it("reads power the other way up, because higher watts are better", () => {
    const wkg = [2, 3, 4, 5];
    expect(engineScore(2, wkg, true)).toBeCloseTo(25, 5);
    expect(engineScore(5, wkg, true)).toBeCloseTo(100, 5);
    expect(engineScore(4.1, wkg, true)).toBeGreaterThan(engineScore(3.2, wkg, true));
  });

  it("keeps every discipline's thresholds monotone", () => {
    for (const s of ENDURANCE_STANDARDS) {
      for (let i = 1; i < 4; i++) {
        if (s.higherIsBetter) expect(s.thresholds[i]!).toBeGreaterThan(s.thresholds[i - 1]!);
        else expect(s.thresholds[i]!).toBeLessThan(s.thresholds[i - 1]!);
      }
    }
    for (const c of TRIATHLON_CLASSES) {
      for (let i = 1; i < 4; i++) expect(c.thresholds[i]!).toBeLessThan(c.thresholds[i - 1]!);
    }
  });
});

/* ── admission, per modality ───────────────────────────────────────────────── */

describe("admission is per modality, not per sport", () => {
  it("takes a ride only when it carries power", () => {
    expect(admissibleDiscipline(cardio({ discipline: "cycling", distance: 40, minutes: 80 }))).toBeNull();
    expect(admissibleDiscipline(cardio({ discipline: "cycling", minutes: 40, watts: 250 }))).toBe("cycling");
  });

  it("takes a row on the erg but not on the water", () => {
    expect(admissibleDiscipline(cardio({ discipline: "rowing", name: "Erg 2k" }))).toBe("rowing");
    expect(admissibleDiscipline(cardio({ discipline: "rowing", name: "Single scull, open water" }))).toBeNull();
  });

  it("takes freestyle but declines a named other stroke", () => {
    expect(admissibleDiscipline(cardio({ discipline: "swimming" }))).toBe("swimming");
    expect(admissibleDiscipline(cardio({ discipline: "swimming", stroke: "Free" }))).toBe("swimming");
    expect(admissibleDiscipline(cardio({ discipline: "swimming", stroke: "Breast" }))).toBeNull();
  });

  it("declines walking and everything with no table behind it", () => {
    expect(admissibleDiscipline(cardio({ discipline: "walking", distance: 6, minutes: 70 }))).toBeNull();
    expect(admissibleDiscipline(cardio({ discipline: "sport", minutes: 60 }))).toBeNull();
  });
});

/* ── the gates ─────────────────────────────────────────────────────────────── */

describe("the gates, which act on the GOOD results", () => {
  it("lets the second best speak and keeps the best as a PR", () => {
    const list = [
      { discipline: "running" as const, label: "5 km", value: 222, score: 89, at: daysAgo(3) },
      { discipline: "running" as const, label: "5 km", value: 260, score: 70, at: daysAgo(9) },
      { discipline: "running" as const, label: "5 km", value: 266, score: 67, at: daysAgo(15) },
    ];
    const r = readDiscipline("running", list)!;
    expect(r.confirmed).toBe(true);
    expect(r.effort.score).toBe(70);
    expect(r.best!.score).toBe(89);
    expect(r.efforts).toBe(3);
  });

  it("reads a lone effort but marks it unconfirmed", () => {
    const r = readDiscipline("running", [{ discipline: "running", label: "5 km", value: 222, score: 89, at: daysAgo(3) }])!;
    expect(r.confirmed).toBe(false);
    expect(r.score).toBe(89);
  });

  it("refuses efforts outside a discipline's valid range", () => {
    // A 1 km jog and a 60 km ultra are both real, and neither is the aerobic
    // test the running table describes.
    const out = efforts([
      S("short", 3, [cardio({ discipline: "running", name: "Run", distance: 1, minutes: 4 })]),
      S("ultra", 5, [cardio({ discipline: "running", name: "Run", distance: 60, minutes: 380 })]),
    ]);
    expect(out.get("running")).toBeUndefined();
  });

  it("caps skiing on its own, and lifts the cap when something agrees", () => {
    // 10 km in 28:00 — past the ski elite bar of 3:00/km.
    const ski = S("ski", 4, [cardio({ discipline: "skiing", name: "Ski", distance: 10, minutes: 28 })]);
    const solo = combineEndurance(efforts([ski, { ...ski, id: "ski2", startedAt: daysAgo(9) }]))!;
    expect(solo.top.discipline).toBe("skiing");
    expect(solo.top.capped).toBe(true);
    expect(solo.top.score).toBeLessThan(ELITE_SCORE);

    // A run in the same class removes the ceiling: the reading is no longer
    // resting on the snow that day.
    const run = (d: number) => S(`run${d}`, d, [cardio({ discipline: "running", name: "Run", distance: 5, minutes: 17 })]);
    const corroborated = combineEndurance(efforts([ski, { ...ski, id: "ski2", startedAt: daysAgo(9) }, run(6), run(12)]))!;
    expect(corroborated.reads.find((r) => r.discipline === "skiing")!.capped).toBe(false);
  });
});

/* ── the maximum, and what the weak results are for ───────────────────────── */

describe("one engine, many gearboxes", () => {
  const fastRun = (d: number) => S(`r${d}`, d, [cardio({ discipline: "running", name: "Run", distance: 10, minutes: 31 })]);
  const hobbySwim = (d: number) => S(`s${d}`, d, [cardio({ discipline: "swimming", name: "Swim", distance: 0.8, minutes: 17 })]);

  it("never lets a hobby drag a specialist down", () => {
    const runOnly = readOf([fastRun(3), fastRun(9)])!;
    const both = readOf([fastRun(3), fastRun(9), hobbySwim(5), hobbySwim(11)])!;
    // The swim is READ — it is real evidence and it is shown — and it changes
    // the level by exactly nothing.
    expect(both.reads.map((r) => r.discipline)).toContain("swimming");
    expect(both.top.discipline).toBe("running");
    expect(both.top.score).toBe(runOnly.top.score);

    // The average everyone reaches for would have cost her two tiers.
    const mean = both.reads.reduce((a, r) => a + r.score, 0) / both.reads.length;
    expect(mean).toBeLessThan(both.top.score - TIER_POINTS);
  });

  it("adds almost nothing to confidence for a weakly-transferring hobby", () => {
    const runOnly = readOf([fastRun(3), fastRun(9)])!;
    const withSwim = readOf([fastRun(3), fastRun(9), hobbySwim(5), hobbySwim(11)])!;
    // Corroboration is weighted by transfer, and run↔swim is the weakest pair
    // on the board — a slow swim says almost nothing either way.
    expect(withSwim.confidence).toBeCloseTo(runOnly.confidence, 1);
  });

  it("treats three agreeing disciplines as real corroboration", () => {
    const tri = [
      S("bike1", 3, [cardio({ discipline: "cycling", name: "Ride", minutes: 40, watts: 287 })]),
      S("bike2", 9, [cardio({ discipline: "cycling", name: "Ride", minutes: 40, watts: 280 })]),
      S("run1", 5, [cardio({ discipline: "running", name: "Run", distance: 10, minutes: 40 })]),
      S("run2", 11, [cardio({ discipline: "running", name: "Run", distance: 10, minutes: 41 })]),
      S("swim1", 7, [cardio({ discipline: "swimming", name: "Swim", distance: 1.5, minutes: 23 })]),
      S("swim2", 13, [cardio({ discipline: "swimming", name: "Swim", distance: 1.5, minutes: 24 })]),
    ];
    const r = readOf(tri, { bodyweightKg: 70 })!;
    expect(r.reads.length).toBe(3);
    // Nothing is carrying this alone, which is exactly what confidence is for.
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it("flags a contradiction only between disciplines that constrain each other", () => {
    // Elite running against novice SKIING — transfer .80, so the gap is worth
    // saying out loud (most often a mis-tagged session, not a marvel).
    const fast = [fastRun(3), fastRun(9)];
    const slowSki = [
      S("k1", 5, [cardio({ discipline: "skiing", name: "Ski", distance: 10, minutes: 62 })]),
      S("k2", 11, [cardio({ discipline: "skiing", name: "Ski", distance: 10, minutes: 63 })]),
    ];
    expect(readOf([...fast, ...slowSki])!.contradiction?.discipline).toBe("skiing");
    // The same gap against SWIMMING is unremarkable and is never flagged.
    expect(readOf([...fast, hobbySwim(5), hobbySwim(11)])!.contradiction).toBeUndefined();
  });

  it("never lets a contradiction lower the score itself", () => {
    const fast = [fastRun(3), fastRun(9)];
    const alone = readOf(fast)!;
    const slowSki = [
      S("k1", 5, [cardio({ discipline: "skiing", name: "Ski", distance: 10, minutes: 62 })]),
      S("k2", 11, [cardio({ discipline: "skiing", name: "Ski", distance: 10, minutes: 63 })]),
    ];
    const flagged = readOf([...fast, ...slowSki])!;
    // Confidence falls; the level does not move a point. A specialist is never
    // demoted for specialising.
    expect(flagged.top.score).toBe(alone.top.score);
    expect(flagged.confidence).toBeLessThan(alone.confidence);
  });
});

/* ── transfer ──────────────────────────────────────────────────────────────── */

describe("the transfer matrix", () => {
  it("is symmetric and bounded", () => {
    const all: EnduranceDiscipline[] = ["running", "swimming", "cycling", "rowing", "skiing", "triathlon"];
    for (const a of all) {
      expect(transfer(a, a)).toBe(1);
      for (const b of all) {
        expect(transfer(a, b)).toBe(transfer(b, a));
        expect(transfer(a, b)).toBeGreaterThan(0);
        expect(transfer(a, b)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("ranks the pairs the way the physiology does", () => {
    // Running and skiing share an engine; running and swimming barely do.
    expect(transfer("running", "skiing")).toBeGreaterThan(transfer("running", "swimming"));
    expect(transfer("running", "triathlon")).toBeGreaterThan(transfer("running", "swimming"));
    expect(transfer("cycling", "triathlon")).toBeGreaterThan(transfer("cycling", "swimming"));
  });
});

/* ── triathlon ─────────────────────────────────────────────────────────────── */

describe("triathlon is a property of the session, not of a block", () => {
  const race = (day: number, mins: [number, number, number]): LoggedSession =>
    S(`tri${day}`, day, [
      cardio({ discipline: "swimming", name: "Swim", distance: 1.5, minutes: mins[0] }),
      cardio({ discipline: "cycling", name: "Bike", distance: 40, minutes: mins[1] }),
      cardio({ discipline: "running", name: "Run", distance: 10, minutes: mins[2] }),
    ]);

  it("reads swim + bike + run at a canonical distance as one result", () => {
    const out = efforts([race(4, [26, 70, 42])], { bodyweightKg: 72 });
    const tri = out.get("triathlon")!;
    expect(tri).toHaveLength(1);
    expect(tri[0]!.label).toBe("olympic");
    expect(tri[0]!.value).toBe(138);
    // The three legs are NOT also counted as three weak standalone efforts.
    expect(out.get("running")).toBeUndefined();
    expect(out.get("swimming")).toBeUndefined();
  });

  it("declines a brick session that is not a race distance", () => {
    const brick = S("brick", 4, [
      cardio({ discipline: "swimming", name: "Swim", distance: 1, minutes: 20 }),
      cardio({ discipline: "cycling", name: "Bike", distance: 25, minutes: 45 }),
      cardio({ discipline: "running", name: "Run", distance: 5, minutes: 24 }),
    ]);
    expect(efforts([brick]).get("triathlon")).toBeUndefined();
  });
});

/* ── the whole estimate ────────────────────────────────────────────────────── */

describe("the endurance half, through the estimate", () => {
  it("gives a swimmer a level where the old engine gave them nothing", () => {
    const swim = (d: number, m: number) => S(`sw${d}`, d, [cardio({ discipline: "swimming", name: "Swim", distance: 1.5, minutes: m })]);
    const r = estimateFitnessLevel([swim(3, 22), swim(9, 23)], { now: NOW });
    expect(r.basis).toBe("endurance");
    expect(r.evidence[0]!.discipline).toBe("swimming");
    expect(r.enduranceLevel).not.toBeNull();
  });

  it("gives a cyclist a level once, and only once, there is power", () => {
    const ride = (d: number, w?: number) => S(`c${d}`, d, [cardio({ discipline: "cycling", name: "Ride", distance: 40, minutes: 40, watts: w })]);
    // Speed alone is still refused — this is the athlete the header has always
    // named as deliberately unread.
    expect(estimateFitnessLevel([ride(3), ride(9)], { bodyweightKg: 75, now: NOW }).basis).toBe("none");
    // With a meter, watts are watts. 320 W and 315 W at 75 kg is 4.27 and 4.20
    // W/kg; the SECOND best speaks, so 4.20 sets it — advanced opens at 4.0.
    const powered = estimateFitnessLevel([ride(3, 320), ride(9, 315)], { bodyweightKg: 75, now: NOW });
    expect(powered.basis).toBe("endurance");
    expect(powered.evidence[0]!.discipline).toBe("cycling");
    expect(powered.enduranceLevel).toBe("advanced");

    // And the gate bites on power exactly as it does on a pace: one 4.0 W/kg
    // ride beside a 3.93 is read at 3.93, which is a tier lower. The good day
    // is still the athlete's best; it just does not set the level.
    const oneGoodDay = estimateFitnessLevel([ride(3, 300), ride(9, 295)], { bodyweightKg: 75, now: NOW });
    expect(oneGoodDay.enduranceLevel).toBe("intermediate");
  });

  it("still refuses a cyclist with no power and no lifts", () => {
    const r = estimateFitnessLevel(
      [S("ride", 3, [cardio({ discipline: "cycling", name: "Ride", distance: 120, minutes: 210 })])],
      { bodyweightKg: 75, now: NOW },
    );
    expect(r.basis).toBe("none");
    expect(r.confidence).toBe(0);
  });

  it("shifts every discipline's bar for sex and age, not the athlete's figure", () => {
    for (const std of ENDURANCE_STANDARDS) {
      const male = shiftedThresholds(std, "M", 28);
      const female = shiftedThresholds(std, "F", 28);
      // An easier bar is a slower pace but a LOWER wattage — the direction is
      // the only thing that changes between them.
      if (std.higherIsBetter) expect(female[3]!).toBeLessThan(male[3]!);
      else expect(female[3]!).toBeGreaterThan(male[3]!);
    }
    expect(standardFor("running")!.thresholds).toEqual([360, 300, 250, 200]);
  });
});

describe("the public badge is backed by something repeatable", () => {
  const run = (d: number, m: number) => S(`r${d}`, d, [cardio({ discipline: "running", name: "Run", distance: 10, minutes: m })]);
  const swim = (d: number, m: number) => S(`s${d}`, d, [cardio({ discipline: "swimming", name: "Swim", distance: 1.5, minutes: m })]);

  it("withholds the badge when two disciplines each hold ONE effort", () => {
    // Two evidence rows, and two flukes. Counting rows alone would have called
    // this a picture; it is two single efforts, which is exactly the reading the
    // gates exist to distrust.
    const e = estimateFitnessLevel([run(3, 31), swim(9, 22)], { now: NOW });
    expect(e.evidence.length).toBeGreaterThanOrEqual(2);
    expect(e.evidence[0]!.confirmed).toBe(false);
    expect(badgeFor(e)).toBeNull();
  });

  it("grants it once the level-setting discipline repeats", () => {
    const e = estimateFitnessLevel([run(3, 31), run(9, 32), swim(11, 22)], { now: NOW });
    expect(e.evidence[0]!.confirmed).toBe(true);
    expect(badgeFor(e)).not.toBeNull();
  });

  it("still refuses when only the SUPPORTING discipline repeats", () => {
    // The swims repeat, but the run that sets the level does not — and it is the
    // level-setting result that has to be repeatable, not any result.
    const e = estimateFitnessLevel([run(3, 31), swim(9, 22), swim(15, 23)], { now: NOW });
    expect(e.evidence[0]!.discipline).toBe("running");
    expect(e.evidence[0]!.confirmed).toBe(false);
    expect(badgeFor(e)).toBeNull();
  });
});

describe("the gaps that were left open", () => {
  const runs = (m: number) => [
    S("a", 3, [cardio({ discipline: "running", name: "Run", distance: 5, minutes: m })]),
    S("b", 9, [cardio({ discipline: "running", name: "Run", distance: 5, minutes: m })]),
  ];

  it("holds a woman to the women's bar, not the men's", () => {
    // 5 km in 26:00. Against the men's table that is barely past novice; the
    // women's thresholds are 11% slower, so the same clock places her higher.
    const asMale = estimateFitnessLevel(runs(26), { sex: "M", ageYears: 30, now: NOW });
    const asFemale = estimateFitnessLevel(runs(26), { sex: "F", ageYears: 30, now: NOW });
    const order = ["untrained", "novice", "intermediate", "advanced", "elite"];
    expect(order.indexOf(asFemale.level)).toBeGreaterThan(order.indexOf(asMale.level));
    // And the default is still male, which is why leaving it unset was costing
    // every female athlete a tier.
    expect(estimateFitnessLevel(runs(26), { ageYears: 30, now: NOW }).level).toBe(asMale.level);
  });

  it("shifts the bar for sex in every discipline, not just running", () => {
    for (const std of ENDURANCE_STANDARDS) {
      const m = shiftedThresholds(std, "M", 30);
      const f = shiftedThresholds(std, "F", 30);
      for (let i = 0; i < 4; i++) {
        if (std.higherIsBetter) expect(f[i]!).toBeLessThan(m[i]!);
        else expect(f[i]!).toBeGreaterThan(m[i]!);
      }
    }
  });

  it("reads a ride the moment power arrives, from a device or by hand", () => {
    const ride = (d: number, watts?: number) =>
      S(`c${d}`, d, [cardio({ discipline: "cycling", name: "Ride", distance: 40, minutes: 40, watts })]);
    expect(efforts([ride(3), ride(9)], { bodyweightKg: 75 }).get("cycling")).toBeUndefined();
    const withPower = efforts([ride(3, 320), ride(9, 315)], { bodyweightKg: 75 }).get("cycling")!;
    expect(withPower).toHaveLength(2);
    expect(withPower[0]!.value).toBeCloseTo(320 / 75, 2);
  });

  it("recognises a triathlon tag, and will not let it invent a class", () => {
    expect(isTaggedTriathlon(["triathlon"])).toBe(true);
    expect(isTaggedTriathlon(["Tri"])).toBe(true);
    expect(isTaggedTriathlon(["trial", "trip"])).toBe(false);
    expect(isTaggedTriathlon(null)).toBe(false);

    // 44 km total is 15% off Olympic distance — declined on inference alone,
    // accepted once the athlete says it was a race.
    const legs = [
      cardio({ discipline: "swimming", name: "Swim", distance: 1.4, minutes: 25 }),
      cardio({ discipline: "cycling", name: "Bike", distance: 34, minutes: 62 }),
      cardio({ discipline: "running", name: "Run", distance: 8.6, minutes: 40 }),
    ];
    const untagged = { id: "u", title: "Brick", startedAt: daysAgo(4), blocks: legs } as LoggedSession;
    const tagged = { ...untagged, id: "t", tags: ["triathlon"] } as LoggedSession;
    expect(efforts([untagged]).get("triathlon")).toBeUndefined();
    expect(efforts([tagged]).get("triathlon")![0]!.label).toBe("olympic");

    // A tag still cannot turn a sprint-length session into an Ironman.
    const short = { id: "s", title: "Race", startedAt: daysAgo(4), tags: ["triathlon"], blocks: [
      cardio({ discipline: "swimming", name: "Swim", distance: 0.75, minutes: 15 }),
      cardio({ discipline: "cycling", name: "Bike", distance: 20, minutes: 36 }),
      cardio({ discipline: "running", name: "Run", distance: 5, minutes: 22 }),
    ] } as LoggedSession;
    expect(efforts([short]).get("triathlon")![0]!.label).toBe("sprint");
  });
});
