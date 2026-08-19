import { describe, it, expect } from "vitest";
import {
  HEAT_CREDIT_MAX,
  HEAT_FLOOR_C,
  HEAT_INTENSITY_MAX,
  HEAT_REF_C,
  HEAT_AFTER_SESSION_H,
  HEAT_DUPLICATE_MIN,
  HEAT_EDGE_GRACE_MIN,
  HEAT_SESSION_MIN_EQUIV,
  HEAT_WINDOW_H,
  heatAdjustment,
  heatAfterSession,
  heatAlreadyLogged,
  heatDayRows,
  heatSittingsBetween,
  heatIntensity,
  heatSittings,
  heatWeeklyFrequency,
  HEAT_PROTOCOLS,
  heatProtocolOf,
  heatSource,
  type HeatProtocol,
  type HeatSignalRow,
} from "./heat";
import { computeReadiness } from "./readiness";
import { readinessDeficit } from "./readiness-deficit";
import { computeFatigue } from "./fatigue";
import { heatRecovery, personalizeLandmarks, sanitizeVolumeProfile } from "./landmark-profile";
import { measuredProfile, withMeasured, measuredFields } from "./landmark-context";
import { whatIfBio, whatIfHeat } from "./engine-room";
import { pairReads, recoveryReports, saunaClearance } from "./recovery-pairs";
import type { LoggedSession } from "./session";
import type { RecoveryReport } from "./landmark-adapt";
import type { Biometrics } from "./types";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-08-12T07:10:00.000Z");

/** Both rows one save writes, at one exact instant. */
const sitting = (minutes: number, tempC: number | null, hoursAgo: number, protocol: HeatProtocol = "sauna"): HeatSignalRow[] => {
  const ts = new Date(NOW - hoursAgo * HOUR).toISOString();
  const source = heatSource(protocol);
  const rows: HeatSignalRow[] = [{ id: `m${hoursAgo}`, kind: "sauna", value: minutes, source, ts }];
  if (tempC !== null) rows.push({ id: `t${hoursAgo}`, kind: "saunaTemp", value: tempC, source, ts });
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

  /* ── NOTHING IS LOGGED IN ORDER ────────────────────────────────────────── */

  it("tags a sitting logged just BEFORE the recorded end as heat — the clock, not the sauna", () => {
    // The scenario in full: trained at 13:00, sauna straight after and typed on
    // the spot, watch stopped late and the recording not imported until 21:00.
    // The sitting's instant ends up minutes before a session end it plainly
    // followed, and without the edge grace this pair does not merely drop — it
    // lands in the WITHOUT-heat bucket, putting the treatment in the control.
    const b = build([{ freshness: 3, heat: false }, { freshness: 3, heat: false }]);
    const end = Date.parse(b.sessions[0]!.completedAt!);
    const early = sittingAt(end - 10 * 60_000, 25, 90);
    const pairs = pairReads(b.sessions, b.recovery, { now: b.now, heatSignals: early });
    expect(pairs.filter((p) => p.heat === true)).toHaveLength(1);
  });

  it("never lets the grace reach past the session's own start — a PRE-workout sauna is not post-session heat", () => {
    // The fixture's sessions run an hour, so end − 30 min is mid-session and the
    // grace absorbs only the clock artefact it is for. Shorten one to 10 minutes
    // and the grace would otherwise reach back before it started, relabelling a
    // sauna taken BEFORE training as heat taken after it.
    const b = build([{ freshness: 3, heat: false }, { freshness: 3, heat: false }]);
    const end = Date.parse(b.sessions[0]!.completedAt!);
    const short = b.sessions.map((s, i) =>
      i === 0 ? { ...s, startedAt: new Date(end - 10 * 60_000).toISOString() } : s,
    );
    const before = sittingAt(end - 25 * 60_000, 25, 90); // 15 min before it started
    const pairs = pairReads(short, b.recovery, { now: b.now, heatSignals: before });
    expect(pairs.every((p) => p.heat === false)).toBe(true);
    // …and the same sitting, once the session is long enough to contain it, IS
    // the post-session sauna the grace exists for.
    const long = pairReads(b.sessions, b.recovery, { now: b.now, heatSignals: before });
    expect(long.filter((p) => p.heat === true)).toHaveLength(1);
  });

  it("still refuses a sitting from BEFORE the grace — the window is a window", () => {
    const b = build([{ freshness: 3, heat: false }, { freshness: 3, heat: false }]);
    const end = Date.parse(b.sessions[0]!.completedAt!);
    const before = sittingAt(end - (HEAT_EDGE_GRACE_MIN + 5) * 60_000, 25, 90);
    const pairs = pairReads(b.sessions, b.recovery, { now: b.now, heatSignals: before });
    expect(pairs.every((p) => p.heat === false)).toBe(true);
  });
});

/* ── WHAT IS ALREADY ON THE RECORD ─────────────────────────────────────────── */

describe("heatSittingsBetween / heatAlreadyLogged / heatAfterSession", () => {
  const at = (ms: number, minutes = 20, tempC = 80): HeatSignalRow[] => {
    const ts = new Date(ms).toISOString();
    return [
      { id: `m${ms}`, kind: "sauna", value: minutes, source: "manual", ts },
      { id: `t${ms}`, kind: "saunaTemp", value: tempC, source: "manual", ts },
    ];
  };
  const MIN = 60_000;

  it("returns the sittings inside the window, ends included, newest first", () => {
    const rows = [...at(NOW - 3 * HOUR), ...at(NOW - 2 * HOUR), ...at(NOW - HOUR)];
    const got = heatSittingsBetween(rows, NOW - 3 * HOUR, NOW - 2 * HOUR);
    expect(got).toHaveLength(2);
    expect(Date.parse(got[0]!.ts)).toBeGreaterThan(Date.parse(got[1]!.ts));
  });

  it("is empty rather than throwing on a window that is nonsense", () => {
    expect(heatSittingsBetween(at(NOW), NOW, NOW - HOUR)).toEqual([]);
    expect(heatSittingsBetween(at(NOW), NaN, NOW)).toEqual([]);
  });

  it("finds the sitting a second save would duplicate, and names the NEAREST one", () => {
    const rows = [...at(NOW - 80 * MIN, 30), ...at(NOW - 10 * MIN, 25)];
    expect(heatAlreadyLogged(rows, NOW)?.minutes).toBe(25);
  });

  it("does not call a sitting outside the window a duplicate", () => {
    const rows = at(NOW - (HEAT_DUPLICATE_MIN + 5) * MIN);
    expect(heatAlreadyLogged(rows, NOW)).toBeNull();
    expect(heatAlreadyLogged([], NOW)).toBeNull();
  });

  /**
   * THE OUT-OF-ORDER CASE, stated as the app meets it: the sauna row is
   * written first and the session row lands hours later, backdated. Both
   * questions have to come out the same as if they had arrived in order.
   */
  it("finds the sauna logged after a session imported long afterwards", () => {
    const end = Date.parse("2026-08-12T12:00:00.000Z"); // trained until 13:00 local
    const rows = at(end + 15 * MIN); // typed on the spot
    // The recording is imported at 21:00 — nine hours after both events — and
    // the summary asks the log, not the clock.
    expect(heatAfterSession(rows, new Date(end).toISOString())?.minutes).toBe(20);
  });

  it("accepts a sitting stamped just before the end and rejects the next evening's", () => {
    const end = Date.parse("2026-08-12T12:00:00.000Z");
    expect(heatAfterSession(at(end - 10 * MIN), end)).not.toBeNull();
    expect(heatAfterSession(at(end - (HEAT_EDGE_GRACE_MIN + 5) * MIN), end)).toBeNull();
    expect(heatAfterSession(at(end + (HEAT_AFTER_SESSION_H * 60 + 5) * MIN), end)).toBeNull();
  });

  /**
   * WHAT A MISSED DUPLICATE ACTUALLY COSTS — the reason the guard warns rather
   * than trusting the athlete to notice. Two rows for ONE sauna, an hour apart
   * because the second was written from a summary defaulted to the session's
   * end, are not merged by heatSittings: the group key is the exact instant, so
   * they are two sittings, and every figure downstream reads two.
   */
  it("would double the dose and the weekly frequency if it got through", () => {
    const one = at(NOW - 2 * HOUR, 25, 90);
    const twice = [...one, ...at(NOW - 3 * HOUR, 25, 90)];
    expect(heatSittings(twice)).toHaveLength(2);
    expect(heatAdjustment(one, { now: NOW }).minutes).toBe(25);
    expect(heatAdjustment(twice, { now: NOW }).minutes).toBe(50);
    // …and the chronic channel that feeds the MRV multiplier counts two
    // sittings the athlete never took.
    expect(heatWeeklyFrequency(one, NOW)).toBeLessThan(heatWeeklyFrequency(twice, NOW));
    // Which is exactly what heatAlreadyLogged sees before the second write.
    expect(heatAlreadyLogged(one, NOW - 3 * HOUR)).not.toBeNull();
  });

  it("returns null for a session with no usable end rather than guessing one", () => {
    expect(heatAfterSession(at(NOW), null)).toBeNull();
    expect(heatAfterSession(at(NOW), "not a date")).toBeNull();
  });
});


/* ── THREE MODALITIES, THREE RAMPS ─────────────────────────────────────────── */

describe("heatIntensity per protocol — air temperature means something different in each", () => {
  it("keeps dry sauna as the anchor, unchanged", () => {
    expect(heatIntensity(80, "sauna")).toBe(1);
    expect(heatIntensity(90, "sauna")).toBeCloseTo(1.286, 3);
    // The default IS sauna, so every pre-protocol call still reads the same.
    expect(heatIntensity(90)).toBe(heatIntensity(90, "sauna"));
  });

  it("scores a steam room that the dry ramp called nothing", () => {
    // 45 °C is exactly the dry FLOOR — zero — and a real dose in steam.
    expect(heatIntensity(45, "sauna")).toBe(0);
    expect(heatIntensity(45, "steam")).toBeGreaterThan(0.7);
    expect(heatIntensity(48, "steam")).toBe(1);
  });

  it("scores an infrared cabin the dry ramp barely registered", () => {
    expect(heatIntensity(55, "sauna")).toBeCloseTo(0.286, 3);
    expect(heatIntensity(55, "infrared")).toBeCloseTo(0.8, 3);
    expect(heatIntensity(60, "infrared")).toBe(1);
  });

  it("gives every protocol a reference worth exactly 1 and a floor worth 0", () => {
    for (const p of Object.keys(HEAT_PROTOCOLS) as HeatProtocol[]) {
      expect(heatIntensity(HEAT_PROTOCOLS[p].refC, p)).toBe(1);
      expect(heatIntensity(HEAT_PROTOCOLS[p].floorC, p)).toBe(0);
      expect(heatIntensity(HEAT_PROTOCOLS[p].floorC - 5, p)).toBe(0);
    }
  });

  it("still clamps in every modality, so no entry earns an implausible dose", () => {
    for (const p of Object.keys(HEAT_PROTOCOLS) as HeatProtocol[]) {
      expect(heatIntensity(120, p)).toBe(HEAT_INTENSITY_MAX);
    }
  });
});

describe("the protocol rides in `source`, so nothing needs migrating", () => {
  it("leaves a plain 'manual' row meaning a dry sauna", () => {
    expect(heatSource("sauna")).toBe("manual");
    expect(heatProtocolOf("manual")).toBe("sauna");
    // Which is what every row written before this existed looks like.
    expect(heatSittings(sitting(20, 90, 2))[0]!.protocol).toBe("sauna");
  });

  it("round-trips the other two, keeping provenance as the prefix", () => {
    expect(heatSource("steam")).toBe("manual:steam");
    expect(heatSource("infrared", "whatif")).toBe("whatif:infrared");
    expect(heatProtocolOf("whatif:infrared")).toBe("infrared");
  });

  it("falls back to dry sauna for anything it does not recognise", () => {
    expect(heatProtocolOf("manual:banya")).toBe("sauna");
    expect(heatProtocolOf("")).toBe("sauna");
  });

  it("reads a missing temperature at ITS OWN reference, not the sauna's", () => {
    const [s] = heatSittings(sitting(20, null, 2, "steam"));
    expect(s).toMatchObject({ protocol: "steam", assumedTemp: true, tempC: HEAT_PROTOCOLS.steam.refC });
    // Assuming 80 °C here would have been assuming a room nobody has.
    expect(s!.equivMin).toBe(20);
  });

  it("scores a real steam sitting through the whole engine", () => {
    // 20 min at 45 °C steam — under the dry model this was worth exactly zero.
    const h = heatAdjustment(sitting(20, 45, 4, "steam"), { now: NOW });
    expect(h.sittings[0]!.protocol).toBe("steam");
    expect(h.points).toBeGreaterThan(0);
    expect(heatAdjustment(sitting(20, 45, 4, "sauna"), { now: NOW }).points).toBe(0);
  });
});

/* ── ONE MAPPING, SO THE PHONE AND THE CONSOLE CANNOT DISAGREE ─────────────── */

describe("recoveryReports — the check-in history on the engine's own terms", () => {
  const DAY_ISO = "2026-08-01T00:00:00.000Z";

  it("keeps a single-read day as ONE report carrying its own answers", () => {
    const out = recoveryReports([
      { weekOf: DAY_ISO, soreness: 4, sleep: 3, energy: 4, mood: 3, createdAt: DAY_ISO,
        reads: [{ metric: "energy", value: 4, loggedAt: DAY_ISO }] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ soreness: 4, sleep: 3, mood: 3 });
  });

  it("SPLITS a day that holds two reads — which is the whole instrument", () => {
    // "wrecked at 09:30" and "good at 22:00" is the pair a clearance is measured
    // from, and one stored value could never express it.
    const out = recoveryReports([
      { weekOf: DAY_ISO, soreness: 2, sleep: 3, energy: 2, mood: 3, createdAt: DAY_ISO,
        reads: [
          { metric: "energy", value: 2, loggedAt: "2026-08-01T09:30:00.000Z" },
          { metric: "energy", value: 4, loggedAt: "2026-08-01T22:00:00.000Z" },
        ] },
    ]);
    expect(out.length).toBeGreaterThan(1);
    // The day keeps freshness/sleep/mood; the timed reads carry the energy.
    expect(out[0]!.soreness).toBe(2);
    expect(out.slice(1).map((r) => r.energy)).toEqual([2, 4]);
  });

  it("ignores reads for other metrics", () => {
    const out = recoveryReports([
      { weekOf: DAY_ISO, energy: 3, createdAt: DAY_ISO,
        reads: [
          { metric: "mood", value: 5, loggedAt: "2026-08-01T09:00:00.000Z" },
          { metric: "mood", value: 1, loggedAt: "2026-08-01T21:00:00.000Z" },
        ] },
    ]);
    expect(out).toHaveLength(1);
  });

  it("survives a day with no reads at all — the pre-migration shape", () => {
    expect(recoveryReports([{ weekOf: DAY_ISO, energy: 3, createdAt: DAY_ISO }])).toHaveLength(1);
    expect(recoveryReports([{ weekOf: DAY_ISO, energy: 3, createdAt: DAY_ISO, reads: null }])).toHaveLength(1);
  });

  it("gives the SAME reports to a client and a server holding the same rows", () => {
    // The reason this lives in core at all: the athlete's phone and the admin
    // console must compute one athlete's clearance from identical inputs, and a
    // mapping written twice is how they would come to disagree.
    const rows = [
      { weekOf: DAY_ISO, soreness: 2, sleep: 3, energy: 2, mood: 3, createdAt: DAY_ISO,
        reads: [
          { metric: "energy", value: 2, loggedAt: "2026-08-01T09:30:00.000Z" },
          { metric: "energy", value: 4, loggedAt: "2026-08-01T22:00:00.000Z" },
        ] },
    ];
    const ends = [Date.parse("2026-08-01T08:00:00.000Z")];
    expect(recoveryReports(rows, ends)).toEqual(recoveryReports(rows, ends));
  });

  it("is not re-shaped by session context — `sessionEnds` only ever FILTERS", () => {
    // Verified rather than assumed, because it is easy to believe otherwise:
    // placeReads computes a lag, a context and a reading for every answer, and
    // readReports then emits only { date, energy, loggedAt }. So the session
    // clock cannot change what a surviving read LOOKS like — it can only drop
    // one whose reading feelReading refuses to give. Callers that have the
    // session list should still pass it (the drop is real), but a caller
    // without one gets the same reports for every read that survives.
    const rows = [
      { weekOf: DAY_ISO, energy: 3, createdAt: DAY_ISO,
        reads: [
          { metric: "energy", value: 2, loggedAt: "2026-08-01T09:30:00.000Z" },
          { metric: "energy", value: 4, loggedAt: "2026-08-01T22:00:00.000Z" },
        ] },
    ];
    expect(recoveryReports(rows, [Date.parse("2026-08-01T08:00:00.000Z")]))
      .toEqual(recoveryReports(rows, []));
  });

  it("hands straight to saunaClearance without a second mapping step", () => {
    const c = saunaClearance([], recoveryReports([]), []);
    expect(c.confidence).toBe(0);
    expect(c.delta).toBe(0);
  });
});

/* ── THE DAY'S LOG, IN THE ORDER IT HAPPENED ───────────────────────────────── */

describe("heatDayRows", () => {
  const DAY = "2026-08-12";
  const at = (hhmm: string) => Date.parse(`${DAY}T${hhmm}:00.000Z`);
  const sat = (ms: number, minutes = 20, tempC = 90): HeatSignalRow[] => {
    const ts = new Date(ms).toISOString();
    return [
      { id: `m${ms}`, kind: "sauna", value: minutes, source: "manual", ts },
      { id: `t${ms}`, kind: "saunaTemp", value: tempC, source: "manual", ts },
    ];
  };
  const sess = (id: string, from: string, to: string) => ({
    id,
    startedAt: new Date(at(from)).toISOString(),
    completedAt: new Date(at(to)).toISOString(),
  });

  // The reported case, exactly: gym, then the sauna, then a swim.
  const gym = sess("gym", "09:00", "10:00");
  const swim = sess("swim", "16:00", "17:00");
  const day = at("12:00");

  it("hangs the sitting off the session it followed, not the one after it", () => {
    const rows = heatDayRows([swim, gym], sat(at("10:20")), { day });
    expect(rows.map((r) => (r.kind === "session" ? r.session.id : `heat:${r.under}`)))
      .toEqual(["swim", "gym", "heat:gym"]);
  });

  it("keeps the caller's newest-first reading, and can be asked for the other one", () => {
    const asc = heatDayRows([gym, swim], sat(at("10:20")), { day, order: "asc" });
    expect(asc.map((r) => (r.kind === "session" ? r.session.id : `heat:${r.under}`)))
      .toEqual(["gym", "heat:gym", "swim"]);
  });

  it("places a sauna that followed nothing at its own place in the day", () => {
    const rows = heatDayRows([swim, gym], sat(at("14:00")), { day });
    expect(rows.map((r) => (r.kind === "session" ? r.session.id : `heat:${r.under}`)))
      .toEqual(["swim", "heat:null", "gym"]);
  });

  it("gives one sitting to ONE session — the nearest end — never to both", () => {
    // A cool-down walk logged straight after the gym: the 10:20 sitting falls
    // inside BOTH windows, and belongs to the end it is nearest.
    const walk = sess("walk", "10:10", "10:35");
    const rows = heatDayRows([walk, gym], sat(at("10:20")), { day });
    const heat = rows.filter((r) => r.kind === "heat");
    expect(heat).toHaveLength(1);
    expect(heat[0]!.kind === "heat" && heat[0]!.under).toBe("walk");
  });

  it("lets one session carry two rounds, in the list's own direction", () => {
    const rows = heatDayRows([gym], [...sat(at("10:15"), 15), ...sat(at("11:45"), 10)], { day });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => (r.kind === "heat" ? r.sitting.minutes : 0))).toEqual([0, 10, 15]);
  });

  it("reads the same window the post-session prompt reads", () => {
    const end = at("10:00");
    // Just inside the grace before the recorded end — the watch was stopped late.
    expect(heatDayRows([gym], sat(end - 10 * 60_000), { day })
      .some((r) => r.kind === "heat" && r.under === "gym")).toBe(true);
    // Past the tail: its own event, not the workout's.
    expect(heatDayRows([gym], sat(end + (HEAT_AFTER_SESSION_H * 60 + 5) * 60_000), { day })
      .some((r) => r.kind === "heat" && r.under === "gym")).toBe(false);
  });

  it("does not reach back past a short session's start for a sauna taken BEFORE it", () => {
    const sprint = sess("sprint", "09:50", "10:00");
    const rows = heatDayRows([sprint], sat(at("09:45")), { day });
    expect(rows.some((r) => r.kind === "heat" && r.under === "sprint")).toBe(false);
  });

  it("places only the viewed day's sittings, so none is printed on two days", () => {
    const lateNight = sat(Date.parse("2026-08-13T00:30:00.000Z"));
    expect(heatDayRows([gym], lateNight, { day }).filter((r) => r.kind === "heat")).toHaveLength(0);
    expect(heatDayRows([], lateNight, { day: Date.parse("2026-08-13T09:00:00.000Z") })).toHaveLength(1);
  });

  it("is exactly the session list when there is no heat to place", () => {
    expect(heatDayRows([swim, gym], [], { day })).toEqual([
      { kind: "session", session: swim },
      { kind: "session", session: gym },
    ]);
  });
});
