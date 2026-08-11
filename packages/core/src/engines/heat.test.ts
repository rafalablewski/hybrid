import { describe, it, expect } from "vitest";
import {
  HEAT_CREDIT_MAX,
  HEAT_FLOOR_C,
  HEAT_INTENSITY_MAX,
  HEAT_REF_C,
  HEAT_SESSION_MIN_EQUIV,
  HEAT_WINDOW_H,
  heatAdjustment,
  heatIntensity,
  heatSittings,
  heatWeeklyFrequency,
  type HeatSignalRow,
} from "./heat";
import { computeReadiness } from "./readiness";
import { readinessDeficit } from "./readiness-deficit";
import { computeFatigue } from "./fatigue";
import { heatRecovery, personalizeLandmarks, sanitizeVolumeProfile } from "./landmark-profile";
import { measuredProfile, withMeasured, measuredFields } from "./landmark-context";
import { whatIfBio, whatIfHeat } from "./engine-room";
import { pairReads, saunaClearance } from "./recovery-pairs";
import type { LoggedSession } from "./session";
import type { RecoveryReport } from "./landmark-adapt";
import type { Biometrics } from "./types";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-08-12T07:10:00.000Z");

/** Both rows one save writes, at one exact instant. */
const sitting = (minutes: number, tempC: number | null, hoursAgo: number): HeatSignalRow[] => {
  const ts = new Date(NOW - hoursAgo * HOUR).toISOString();
  const rows: HeatSignalRow[] = [{ id: `m${hoursAgo}`, kind: "sauna", value: minutes, source: "manual", ts }];
  if (tempC !== null) rows.push({ id: `t${hoursAgo}`, kind: "saunaTemp", value: tempC, source: "manual", ts });
  return rows;
};

const bio = (): Biometrics => ({
  hrv: { today: 60, baseline: 60, unit: "ms", better: "high", measured: true, ts: "2026-08-12T06:12:00.000Z" },
  restingHr: { today: 50, baseline: 50, unit: "bpm", better: "low", measured: true },
  sleep: { today: 8, baseline: 8, unit: "h", better: "high", measured: true },
});

describe("heatIntensity — the temperature ramp", () => {
  it("is zero at and below the floor: a warm room is not a dose", () => {
    expect(heatIntensity(HEAT_FLOOR_C)).toBe(0);
    expect(heatIntensity(30)).toBe(0);
    expect(heatIntensity(-5)).toBe(0);
  });

  it("is exactly 1 at the reference — an equivalent minute IS a minute there", () => {
    expect(heatIntensity(HEAT_REF_C)).toBe(1);
  });

  it("reads the anchors the console prints", () => {
    expect(heatIntensity(55)).toBeCloseTo(0.286, 3);
    expect(heatIntensity(70)).toBeCloseTo(0.714, 3);
    expect(heatIntensity(90)).toBeCloseTo(1.286, 3);
    expect(heatIntensity(100)).toBeCloseTo(1.571, 3);
  });

  it("clamps, so a mistyped 150 cannot manufacture a dose nobody sat through", () => {
    expect(heatIntensity(101)).toBeCloseTo(HEAT_INTENSITY_MAX, 2);
    expect(heatIntensity(150)).toBe(HEAT_INTENSITY_MAX);
    expect(heatIntensity(10_000)).toBe(HEAT_INTENSITY_MAX);
  });

  it("gives a non-finite input nothing rather than the ceiling", () => {
    // Garbage in is not "the hottest sauna in the world" — the conservative
    // answer is no credit, which is the same posture the clamp takes at the
    // other end of the range.
    expect(heatIntensity(NaN)).toBe(0);
    expect(heatIntensity(Infinity)).toBe(0);
  });
});

describe("heatSittings — two rows back into one sitting", () => {
  it("groups the pair written at one exact instant", () => {
    const [s] = heatSittings(sitting(22, 90, 9.5));
    expect(s).toMatchObject({ minutes: 22, tempC: 90, assumedTemp: false });
    expect(s!.equivMin).toBeCloseTo(28.29, 2);
    expect(s!.ids).toEqual(["m9.5", "t9.5"]);
  });

  it("reads a missing temperature at the reference and MARKS it assumed", () => {
    const [s] = heatSittings(sitting(20, null, 3));
    expect(s).toMatchObject({ tempC: HEAT_REF_C, assumedTemp: true });
    // Assumed still counts — it is marked, not discarded.
    expect(s!.equivMin).toBe(20);
  });

  it("drops a temperature with no minutes beside it — that records nothing", () => {
    const ts = new Date(NOW).toISOString();
    expect(heatSittings([{ kind: "saunaTemp", value: 90, source: "manual", ts }])).toEqual([]);
  });

  it("keeps two sittings on one day apart, newest first", () => {
    const rows = [...sitting(15, 80, 30), ...sitting(20, 90, 4)];
    const out = heatSittings(rows);
    expect(out).toHaveLength(2);
    expect(out[0]!.minutes).toBe(20);
    expect(out[1]!.minutes).toBe(15);
  });

  it("ignores unrelated kinds and unusable rows", () => {
    const ts = new Date(NOW).toISOString();
    const out = heatSittings([
      { kind: "hrv", value: 60, source: "apple", ts },
      { kind: "sauna", value: NaN, source: "manual", ts },
      { kind: "sauna", value: 10, source: "manual", ts: "not-a-date" },
    ]);
    expect(out).toEqual([]);
  });
});

describe("heatAdjustment — the worked morning the spec prints", () => {
  it("22 min at 90 °C, 9.5 h ago, no wearable → +2", () => {
    const h = heatAdjustment(sitting(22, 90, 9.5), { now: NOW });
    expect(h.equivMin).toBeCloseTo(28.29, 2);
    expect(h.dose).toBeCloseTo(2.545, 2);
    expect(h.decay).toBeCloseTo(0.694, 2);
    expect(h.points).toBe(2);
    expect(h.suppressed).toBe(false);
  });

  it("the SAME 22 minutes at 55 °C is worth half as much — the whole reason temperature is collected", () => {
    expect(heatAdjustment(sitting(22, 55, 9.5), { now: NOW }).points).toBe(1);
  });

  it("never exceeds the cap, however long the sitting", () => {
    const h = heatAdjustment(sitting(180, 100, 0), { now: NOW });
    expect(h.points).toBeLessThanOrEqual(HEAT_CREDIT_MAX);
  });

  it("is never negative — there is no cost term, by design", () => {
    for (const [min, t, h] of [[5, 50, 1], [60, 100, 0], [1, 45, 47]] as const) {
      expect(heatAdjustment(sitting(min, t, h), { now: NOW }).points).toBeGreaterThanOrEqual(0);
    }
  });

  it("decays: the same sitting is worth less this evening than it was this morning", () => {
    const early = heatAdjustment(sitting(30, 90, 2), { now: NOW }).points;
    const late = heatAdjustment(sitting(30, 90, 30), { now: NOW }).points;
    expect(late).toBeLessThan(early);
  });

  it("drops out entirely past the window", () => {
    const h = heatAdjustment(sitting(30, 90, HEAT_WINDOW_H + 1), { now: NOW });
    expect(h.sittings).toEqual([]);
    expect(h.points).toBe(0);
  });

  it("ignores a sitting logged in the future", () => {
    expect(heatAdjustment(sitting(30, 90, -5), { now: NOW }).sittings).toEqual([]);
  });

  /* THE RULE THE WHOLE MODULE EXISTS AROUND. */
  it("SUPPRESSES to +0 when a fresh wearable reading exists — and says so", () => {
    const h = heatAdjustment(sitting(22, 90, 9.5), { now: NOW, bio: bio() });
    expect(h.points).toBe(0);
    expect(h.suppressed).toBe(true);
    // Suppressed is not the same as never computed: every figure survives, so
    // the console can print the arithmetic AND the reason it was set aside.
    expect(h.dose).toBeCloseTo(2.545, 2);
    expect(h.equivMin).toBeCloseTo(28.29, 2);
  });

  it("reports no suppression when there was nothing to suppress", () => {
    expect(heatAdjustment([], { now: NOW, bio: bio() }).suppressed).toBe(false);
  });

  it("flags an assumed temperature so a surface can mark it", () => {
    expect(heatAdjustment(sitting(20, null, 2), { now: NOW }).assumed).toBe(true);
    expect(heatAdjustment(sitting(20, 90, 2), { now: NOW }).assumed).toBe(false);
  });
});

describe("readiness carries the term without breaking its own laws", () => {
  const log = [{ daysAgo: 1, items: [{ move: "Back Squat", hardSets: 5, topRpe: 8 }] }];

  it("adds the credit to the score", () => {
    const f = computeFatigue(log);
    expect(computeReadiness(f, undefined, 2).score).toBe(computeReadiness(f, undefined, 0).score + 2);
  });

  it("still clamps at the ceiling", () => {
    const f = computeFatigue([]);
    expect(computeReadiness(f, undefined, HEAT_CREDIT_MAX).score).toBeLessThanOrEqual(98);
  });

  it("omitting it scores exactly what the engine scored before heat existed", () => {
    const f = computeFatigue(log);
    expect(computeReadiness(f).score).toBe(computeReadiness(f, undefined, 0).score);
  });

  /* THE SUM LAW — kept + every cost ≡ 100, with or without a credit. */
  it("keeps the deficit's sum law with a heat credit applied", () => {
    for (const heat of [0, 1, 2, 3]) {
      const d = readinessDeficit(log, undefined, heat);
      expect(d.kept + d.costs.reduce((a, c) => a + c.points, 0)).toBe(100);
    }
  });

  it("gives the credit NO arc — it shrinks the deficit instead", () => {
    const none = readinessDeficit(log, undefined, 0);
    const some = readinessDeficit(log, undefined, 3);
    expect(some.kept).toBeGreaterThan(none.kept);
    expect(some.costs.map((c) => c.kind)).toEqual(none.costs.map((c) => c.kind));
    expect(some.heatAdj).toBe(3);
  });
});

describe("the chronic channel", () => {
  const weekly = (n: number, minutes = 20, tempC = 90): HeatSignalRow[] =>
    Array.from({ length: n }, (_, i) => sitting(minutes, tempC, 6 + i * 12)).flat();

  it("averages sittings per week across the window", () => {
    // 8 sittings in the last 4 weeks = 2/wk
    expect(heatWeeklyFrequency(weekly(8), NOW)).toBe(2);
  });

  it("does not count a sitting below the equivalent-minute floor", () => {
    // 5 min at 50 °C = 0.7 equiv — a token visit is not a session.
    const token = weekly(8, 5, 50);
    expect(heatSittings(token)[0]!.equivMin).toBeLessThan(HEAT_SESSION_MIN_EQUIV);
    expect(heatWeeklyFrequency(token, NOW)).toBe(0);
  });

  it("tiers the multiplier, and caps it at 4%", () => {
    expect(heatRecovery(0)).toBe(1);
    expect(heatRecovery(1.5)).toBe(1);
    expect(heatRecovery(2)).toBe(1.02);
    expect(heatRecovery(3.9)).toBe(1.02);
    expect(heatRecovery(4)).toBe(1.04);
    expect(heatRecovery(14)).toBe(1.04);
  });

  it("raises MRV and records itself as a named factor", () => {
    const without = personalizeLandmarks({ experience: "intermediate" });
    const with4 = personalizeLandmarks({ experience: "intermediate", heat: 4 });
    expect(with4.recovery).toBeGreaterThan(without.recovery);
    const f = with4.factors.find((x) => x.key === "heat");
    expect(f).toMatchObject({ affects: "recovery", multiplier: 1.04 });
    expect(f!.value).toContain("sauna");
  });

  it("does NOT stand down for a wearable — it is a four-week timescale", () => {
    // No bio anywhere in this call: the chronic channel never consults one.
    expect(personalizeLandmarks({ heat: 4 }).recovery).toBeCloseTo(1.04, 5);
  });
});

/* ── REGRESSIONS THE REVIEW PASS FOUND ─────────────────────────────────────── */

describe("heat reaches the volume model without being asked for", () => {
  it("is DERIVED into the profile as a measured field", () => {
    const m = measuredProfile({ heatSignals: [...sitting(20, 90, 12), ...sitting(20, 90, 36)] });
    expect(m.heat).toBeGreaterThan(0);
    expect(m.measured).toContain("heat");
    expect(withMeasured({}, m).heat).toBe(m.heat);
    expect(measuredFields({}, m).has("heat")).toBe(true);
  });

  it("says nothing when there is nothing to measure — an absence is not a finding", () => {
    const m = measuredProfile({});
    expect(m.heat).toBeUndefined();
    expect(m.measured).not.toContain("heat");
  });

  it("can never be persisted as a typed field — it is always derived", () => {
    expect(sanitizeVolumeProfile({ heat: 4, sleep: 3 })).toEqual({ sleep: 3 });
  });
});

describe("landmark confidence is not taxed by an optional practice", () => {
  const full = {
    experience: "intermediate", ageYears: 30, bodyweightKg: 80,
    sleep: 4, stress: 2, nutrition: "maintenance", daysPerWeek: 4,
  } as const;

  it("a fully-supplied profile still reads full confidence with no sauna", () => {
    expect(personalizeLandmarks(full).confidence).toBe(1);
  });

  it("…and logging a sauna does not change that confidence either way", () => {
    expect(personalizeLandmarks({ ...full, heat: 4 }).confidence)
      .toBe(personalizeLandmarks(full).confidence);
  });

  it("heat alone still counts as personalized — the multiplier really moved", () => {
    const only = personalizeLandmarks({ heat: 4 });
    expect(only.personalized).toBe(true);
    expect(only.recovery).toBeCloseTo(1.04, 5);
  });
});

describe("the what-if can ask the question most athletes are the answer to", () => {
  it("noWearable REMOVES the term rather than neutralising it", () => {
    expect(whatIfBio(bio(), { noWearable: true })).toBeUndefined();
    // Neutralising would leave `bio` defined, which is what every
    // "has this athlete been measured" gate reads — including suppression.
    expect(whatIfBio(bio(), {})).toBeDefined();
  });

  it("which is the only way to see the prior fire on an athlete who owns a watch", () => {
    const rows = sitting(25, 90, 6);
    expect(heatAdjustment(rows, { now: NOW, bio: bio() }).points).toBe(0);
    expect(heatAdjustment(rows, { now: NOW, bio: whatIfBio(bio(), { noWearable: true }) }).points).toBeGreaterThan(0);
  });

  it("whatIfHeat leaves the real log alone unless asked, and 0 means none", () => {
    const rows = sitting(25, 90, 6);
    expect(whatIfHeat(rows, {}, NOW)).toBe(rows);
    expect(whatIfHeat(rows, { heatMinutes: 0 }, NOW)).toEqual([]);
    const sim = whatIfHeat(rows, { heatMinutes: 30, heatTempC: 100, heatHoursAgo: 2 }, NOW);
    expect(heatSittings(sim)[0]).toMatchObject({ minutes: 30, tempC: 100 });
  });
});

/* ── PHASE 4: THE MEASUREMENT THAT REPLACES THE PRIOR ──────────────────────── */

describe("saunaClearance — does heat help THIS athlete?", () => {
  const DAY = 86_400_000;
  const T0 = Date.parse("2026-08-01T18:00:00.000Z");

  /**
   * One clean pair: a session that drained, then a recovery read the next
   * morning, with an optional sauna in between.
   *
   * `freshness` is the CHECK-IN COLUMN'S OWN SENSE — 5 = muscles feel fresh —
   * because that is what the column stores and what `sorenessFromCheckin`
   * flips on read. Getting that backwards is exactly how the volume estimator
   * once shipped inverted, so the fixture speaks the column's language rather
   * than a convenient one: HIGHER freshness = less residual = faster clearance
   * = a LOWER index.
   */
  const day = (i: number, freshness: number, heat: boolean): { session: LoggedSession; read: RecoveryReport; heat: HeatSignalRow[] } => {
    const end = T0 + i * DAY;
    const readAt = new Date(end + 13 * 3_600_000).toISOString();
    return {
      session: {
        id: `s${i}`, title: "Lower", startedAt: new Date(end - 3_600_000).toISOString(),
        completedAt: new Date(end).toISOString(), blocks: [],
        fatigue: 4, feelLoggedAt: new Date(end + 10 * 60_000).toISOString(),
      },
      read: { date: readAt, loggedAt: readAt, soreness: freshness, energy: freshness },
      heat: heat ? sittingAt(end + 3_600_000, 25, 90) : [],
    };
  };
  const sittingAt = (ms: number, minutes: number, tempC: number): HeatSignalRow[] => {
    const ts = new Date(ms).toISOString();
    return [
      { id: `hm${ms}`, kind: "sauna", value: minutes, source: "manual", ts },
      { id: `ht${ms}`, kind: "saunaTemp", value: tempC, source: "manual", ts },
    ];
  };
  const build = (spec: { freshness: number; heat: boolean }[]) => {
    const days = spec.map((x, i) => day(i * 2, x.freshness, x.heat));
    return {
      sessions: days.map((d) => d.session),
      recovery: days.map((d) => d.read),
      heatSignals: days.flatMap((d) => d.heat),
      now: T0 + spec.length * 2 * DAY + DAY,
    };
  };

  it("says nothing at all until BOTH sides clear the pair floor", () => {
    const b = build([{ freshness: 5, heat: true }, { freshness: 2, heat: false }, { freshness: 2, heat: false }]);
    const c = saunaClearance(b.sessions, b.recovery, b.heatSignals, { now: b.now });
    expect(c.withSamples.length).toBeLessThan(2);
    expect(c.confidence).toBe(0);
    // Not a direction it cannot support — a flat nothing.
    expect(c.delta).toBe(0);
  });

  it("tags a pair by whether heat fell INSIDE its gap, not merely nearby", () => {
    const b = build([{ freshness: 3, heat: true }, { freshness: 3, heat: false }]);
    const pairs = pairReads(b.sessions, b.recovery, { now: b.now, heatSignals: b.heatSignals });
    expect(pairs.filter((p) => p.heat === true)).toHaveLength(1);
    expect(pairs.filter((p) => p.heat === false)).toHaveLength(1);
  });

  it("leaves `heat` UNDEFINED when no heat log was supplied — absent is not false", () => {
    const b = build([{ freshness: 3, heat: false }, { freshness: 3, heat: false }]);
    for (const p of pairReads(b.sessions, b.recovery, { now: b.now })) {
      expect(p.heat).toBeUndefined();
    }
  });

  it("ignores a token sitting that could not plausibly have changed anything", () => {
    const b = build([{ freshness: 3, heat: false }, { freshness: 3, heat: false }]);
    const end = Date.parse(b.sessions[0]!.completedAt!);
    // 5 min at 50 °C = 0.7 equivalent minutes, under HEAT_SESSION_MIN_EQUIV.
    const token = sittingAt(end + 3_600_000, 5, 50);
    const pairs = pairReads(b.sessions, b.recovery, { now: b.now, heatSignals: token });
    expect(pairs.every((p) => p.heat === false)).toBe(true);
  });

  it("reports a direction once both sides have evidence", () => {
    const b = build([
      { freshness: 5, heat: true }, { freshness: 5, heat: true }, { freshness: 5, heat: true },
      { freshness: 2, heat: false }, { freshness: 2, heat: false }, { freshness: 2, heat: false },
    ]);
    const c = saunaClearance(b.sessions, b.recovery, b.heatSignals, { now: b.now });
    expect(c.withSamples.length).toBeGreaterThanOrEqual(2);
    expect(c.withoutSamples.length).toBeGreaterThanOrEqual(2);
    expect(c.confidence).toBeGreaterThan(0);
    // The heat group reported FRESH (5) the next morning and the other group
    // reported sore (2), so the heat group cleared more of the same session —
    // a lower ratio against the population curve, so a negative delta.
    expect(c.delta).toBeLessThan(0);
  });
});
