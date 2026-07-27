import { describe, it, expect } from "vitest";
import {
  sessionWrapped, liftStanding, wrappedDiscipline,
  fitScale, textWidthEm, HERO_FIT_EM, HERO_TRACKING_EM, STAT_FIT_EM,
} from "./session-wrapped";
import type { LoggedSession } from "./engines/session";

const strengthSession = (id: string, startedAt: string, load: number): LoggedSession => ({
  id,
  title: "Push day",
  startedAt,
  completedAt: new Date(Date.parse(startedAt) + 45 * 60000).toISOString(),
  blocks: [
    {
      kind: "strength",
      name: "Bench Press",
      sets: [
        { load: String(load), reps: "5" },
        { load: String(load), reps: "5" },
        { load: String(load), reps: "5" },
      ],
    },
  ],
});

describe("sessionWrapped", () => {
  it("returns the free basics: sets, reps, volume, time", () => {
    const s = strengthSession("s1", "2026-01-10T10:00:00.000Z", 60);
    const w = sessionWrapped(s, [s], { units: "kg" });
    const labels = w.basics.map((b) => b.labelKey);
    expect(labels).toContain("summary.sets");
    expect(labels).toContain("session.wrapped.reps");
    expect(labels).toContain("summary.volumeMoved");
    expect(labels).toContain("summary.minutes");
    // 3 logged sets, 15 reps total.
    expect(w.basics.find((b) => b.labelKey === "summary.sets")?.value).toBe("3");
    expect(w.basics.find((b) => b.labelKey === "session.wrapped.reps")?.value).toBe("15");
  });

  it("surfaces premium facts including est-1RM and the muscle split", () => {
    const s = strengthSession("s1", "2026-01-10T10:00:00.000Z", 60);
    const w = sessionWrapped(s, [s], { units: "kg" });
    const labels = w.facts.map((f) => f.labelKey);
    expect(labels).toContain("session.wrapped.est1rm");
    // volumeByMuscle attributes bench tonnage to chest.
    expect(labels.some((l) => l.startsWith("muscle."))).toBe(true);
  });

  it("adds an e1RM trend fact when the lift has prior history", () => {
    const older = strengthSession("s0", "2026-01-01T10:00:00.000Z", 50);
    const s = strengthSession("s1", "2026-01-10T10:00:00.000Z", 60);
    const w = sessionWrapped(s, [older, s], { units: "kg" });
    const trend = w.facts.find((f) => f.labelKey === "session.wrapped.trend");
    expect(trend).toBeTruthy();
    expect(trend?.tone).toBe("up");
    expect(trend?.value.startsWith("+")).toBe(true);
  });

  it("includes readiness when the session logged it", () => {
    const s = { ...strengthSession("s1", "2026-01-10T10:00:00.000Z", 60), readiness: 82 };
    const w = sessionWrapped(s, [s], { units: "kg" });
    expect(w.facts.find((f) => f.labelKey === "home.readiness")?.value).toBe("82");
  });

  it("adds an estimated calorie tile once a bodyweight is known", () => {
    const s = strengthSession("s1", "2026-01-10T10:00:00.000Z", 60);
    const plain = sessionWrapped(s, [s], { units: "kg" });
    expect(plain.energy).toBeNull();
    const withBw = sessionWrapped(s, [s], { units: "kg", bw: 80 });
    expect(withBw.energy!.kcal).toBeGreaterThan(0);
    // Strength shows four gym tiles, so kcal only reaches the panel elsewhere —
    // but the estimate itself is always available to the client.
    expect(withBw.basics.every((b) => b.value !== "")).toBe(true);
  });
});

// The bug this shape exists to kill: a 1 500 m swim rendering as "1 SET".
describe("sessionWrapped — discipline shapes", () => {
  const cardio = (
    name: string,
    extra: Partial<{ distance: number; minutes: number; rpe: number; discipline: "running" | "swimming" | "sport" }>,
  ): LoggedSession => ({
    id: "c1",
    title: name,
    startedAt: "2026-01-10T10:00:00.000Z",
    completedAt: "2026-01-10T10:40:00.000Z",
    blocks: [{ kind: "cardio", name, ...extra }],
  });

  it("classifies each kind of session", () => {
    expect(wrappedDiscipline(cardio("Swimming", { distance: 1.5, minutes: 35, discipline: "swimming" }))).toBe("endurance");
    expect(wrappedDiscipline(cardio("Tennis", { minutes: 60, discipline: "sport" }))).toBe("sport");
    expect(wrappedDiscipline(strengthSession("s", "2026-01-10T10:00:00.000Z", 60))).toBe("strength");
    const mixed: LoggedSession = {
      ...strengthSession("m", "2026-01-10T10:00:00.000Z", 60),
      blocks: [
        ...strengthSession("m", "2026-01-10T10:00:00.000Z", 60).blocks,
        { kind: "cardio", name: "Running", discipline: "running", distance: 5, minutes: 25 },
      ],
    };
    expect(wrappedDiscipline(mixed)).toBe("mixed");
    expect(
      wrappedDiscipline({
        id: "k",
        title: "Metcon",
        startedAt: "2026-01-10T10:00:00.000Z",
        blocks: [{ kind: "conditioning", name: "EMOM", rounds: 12, minutes: 12 }],
      }),
    ).toBe("conditioning");
  });

  it("never shows sets or volume for a swim", () => {
    const swim = cardio("Swimming", { distance: 1.5, minutes: 35, discipline: "swimming" });
    const w = sessionWrapped(swim, [swim], { units: "kg", bw: 78 });
    const labels = w.basics.map((b) => b.labelKey);
    expect(labels).not.toContain("summary.sets");
    expect(labels).not.toContain("summary.volumeMoved");
    expect(labels).not.toContain("session.wrapped.reps");
    expect(labels).toContain("session.distance");
    expect(labels).toContain("session.pace");
    // Distance + pace read in the pool's own unit, not "0.0 t" and not km.
    expect(w.basics.find((b) => b.labelKey === "session.distance")!.value).toContain("m");
    expect(w.basics.find((b) => b.labelKey === "session.pace")!.value).toContain("/100m");
    expect(w.headline.labelKey).toBe("session.distance");
  });

  it("summarises a timed sport by time, calories and effort", () => {
    const tennis = cardio("Tennis", { minutes: 90, rpe: 7, discipline: "sport" });
    const w = sessionWrapped(tennis, [tennis], { units: "kg", bw: 78 });
    const labels = w.basics.map((b) => b.labelKey);
    expect(labels).toEqual(["summary.minutes", "session.wrapped.kcal", "session.wrapped.effort"]);
    expect(w.basics.find((b) => b.labelKey === "session.wrapped.kcal")!.estimate).toBe(true);
    expect(w.headline.labelKey).toBe("summary.minutes");
  });

  it("marks a session sparse only when nothing measured its intensity", () => {
    const bare = cardio("Tennis", { minutes: 90, discipline: "sport" });
    expect(sessionWrapped(bare, [bare], { units: "kg" }).sparse).toBe(true);
    const paced = cardio("Running", { distance: 10, minutes: 50, discipline: "running" });
    expect(sessionWrapped(paced, [paced], { units: "kg", bw: 78 }).sparse).toBe(false);
  });

  it("caps the panel at four tiles for every discipline", () => {
    const ride = cardio("Cycling", { distance: 40, minutes: 80, rpe: 6 });
    for (const s of [ride, strengthSession("s", "2026-01-10T10:00:00.000Z", 60)])
      expect(sessionWrapped(s, [s], { units: "kg", bw: 78 }).basics.length).toBeLessThanOrEqual(4);
  });
});

describe("liftStanding", () => {
  const cohort = { sport: "Hybrid", sex: "M" as const, age: 26 };

  it("returns null on invalid inputs", () => {
    expect(liftStanding(0, 80, cohort)).toBeNull();
    expect(liftStanding(140, 0, cohort)).toBeNull();
  });

  it("gives a 1..99 percentile and a top-N%% that sum to ~100", () => {
    const s = liftStanding(140, 80, cohort)!; // 1.75x bodyweight
    expect(s.percentile).toBeGreaterThanOrEqual(1);
    expect(s.percentile).toBeLessThanOrEqual(99);
    expect(s.topPct).toBe(Math.max(1, 100 - s.percentile));
  });

  it("ranks a stronger relative lift higher", () => {
    const weak = liftStanding(80, 80, cohort)!; // 1.0x
    const strong = liftStanding(160, 80, cohort)!; // 2.0x
    expect(strong.percentile).toBeGreaterThan(weak.percentile);
    expect(strong.topPct).toBeLessThan(weak.topPct);
  });
});

// Making the panel discipline-aware widened the value vocabulary from "11.3 t"
// to "2:20 /100m" — which wrapped, and a wrapped value drags its label out of
// line with the tiles beside it. Expected widths below are measured from
// Archivo Black at the slot's own size (tile 22px / 76px, hero 96px / 338px).
describe("fitScale", () => {
  it("does not treat every character as the same width", () => {
    // The bug a character count would have: same length, 29% different width.
    expect("11.3 t".length).toBe("1500 m".length);
    expect(textWidthEm("1500 m")).toBeGreaterThan(textWidthEm("11.3 t") * 1.2);
  });

  it("leaves a value that already fits alone", () => {
    for (const v of ["25", "255", "78", "11.3 t", "~395", "0.0 t"])
      expect(fitScale(v, STAT_FIT_EM), v).toBe(1);
    for (const v of ["11.3 t", "60 kg", "90 min"])
      expect(fitScale(v, HERO_FIT_EM, { trackingEm: HERO_TRACKING_EM }), v).toBe(1);
  });

  it("shrinks every value that would otherwise overflow its tile", () => {
    // px widths at 22px measured in the browser; 76px is the tile's inner room.
    const overflowing: [string, number][] = [
      ["1500 m", 85], ["2:20 /100m", 129], ["10.0 km", 92], ["5:00 /km", 99], ["1.5 km", 78], ["90 min", 78],
    ];
    for (const [v, px] of overflowing) {
      const s = fitScale(v, STAT_FIT_EM);
      expect(s, v).toBeLessThan(1);
      expect(px * s, v).toBeLessThanOrEqual(76);
    }
  });

  it("shrinks the hero values that would otherwise wrap", () => {
    const overflowing: [string, number][] = [["1500 m", 352], ["10.0 km", 381]];
    for (const [v, px] of overflowing) {
      const s = fitScale(v, HERO_FIT_EM, { trackingEm: HERO_TRACKING_EM });
      expect(s, v).toBeLessThan(1);
      expect(px * s, v).toBeLessThanOrEqual(338);
    }
  });

  it("never shrinks past the floor, however long the value", () => {
    expect(fitScale("8".repeat(200), STAT_FIT_EM)).toBe(0.5);
    expect(fitScale("8".repeat(200), STAT_FIT_EM, { floor: 0.7 })).toBe(0.7);
  });

  it("stays legible for every value the panel can actually produce", () => {
    for (const v of ["1500 m", "10.0 km", "2:20 /100m", "5:00 /km", "~395", "11.3 t", "90 min", "255", "12"])
      expect(fitScale(v, STAT_FIT_EM), v).toBeGreaterThanOrEqual(0.5);
  });
});
