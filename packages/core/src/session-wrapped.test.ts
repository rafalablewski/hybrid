import { describe, it, expect } from "vitest";
import { SOHNE_ADVANCE_EM, ADVANCE_FALLBACK_EM } from "./theme/face-metrics";
import {
  sessionWrapped, wrappedDiscipline,
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
  it("lays the free basics out in the app's one figure order", () => {
    const s = strengthSession("s1", "2026-01-10T10:00:00.000Z", 60);
    const w = sessionWrapped(s, [s], { units: "kg" });
    // The discipline's priority list picks these four (sets, reps, volume,
    // time); figure-order.ts decides the sequence they read in, so a lifting
    // day's tonnage sits where it sits on every other surface rather than in
    // whichever corner this file's priority list happened to leave it.
    expect(w.basics.map((b) => b.labelKey)).toEqual([
      "summary.volumeMoved",
      "summary.sets",
      "session.wrapped.reps",
      "summary.minutes",
    ]);
    // 3 logged sets, 15 reps total.
    expect(w.basics.find((b) => b.labelKey === "summary.sets")?.value).toBe("3");
    expect(w.basics.find((b) => b.labelKey === "session.wrapped.reps")?.value).toBe("15");
  });

  it("takes the headline fallback off the PRIORITY list, not off the laid-out row", () => {
    // A circuit with no clock and no tonnage: bodyweight sets (no load, and no
    // bodyweight supplied to scale them) beside a run. Every branch above the
    // fallback misses — not endurance-with-distance, not mixed-with-volume, no
    // minutes — so the hero comes from the discipline's priority list.
    const circuit = {
      id: "m1",
      title: "Circuit",
      startedAt: "2026-01-10T10:00:00.000Z",
      blocks: [
        { kind: "strength", name: "Push-up", sets: [{ load: "", reps: "20" }, { load: "", reps: "20" }] },
        { kind: "cardio", name: "Running", discipline: "running", distance: 3 },
      ],
    } as unknown as LoggedSession;
    const w = sessionWrapped(circuit, [circuit], { units: "kg" });

    // The ROW reads in figure order — sets before the distance.
    expect(w.basics.map((b) => b.labelKey)).toEqual(["summary.sets", "session.distance"]);
    // The HERO is the mixed priority list's top, which is the distance. Reading
    // it off `basics[0]` instead would headline "2 sets" over "3 km" — a claim
    // about what the session was ABOUT, quietly decided by a sort.
    expect(w.headline.labelKey).toBe("session.distance");
  });

  it("surfaces premium facts including est-1RM, and NAMES the lift it is about", () => {
    const s = strengthSession("s1", "2026-01-10T10:00:00.000Z", 60);
    const w = sessionWrapped(s, [s], { units: "kg" });
    const labels = w.facts.map((f) => f.labelKey);
    expect(labels).toContain("session.wrapped.est1rm");
    // `topLift` picks by HIGHEST ESTIMATED MAX, which is routinely not the lift
    // the summary leads with — so an e1RM or a trend that does not say whose it
    // is reads as a claim about the session. It carries the name now.
    const e1rm = w.facts.find((f) => f.labelKey === "session.wrapped.est1rm");
    expect(e1rm?.qualifier).toBeTruthy();
  });

  it("does NOT push a coarse-bucket muscle fact", () => {
    const s = strengthSession("s1", "2026-01-10T10:00:00.000Z", 60);
    const w = sessionWrapped(s, [s], { units: "kg" });
    // This used to push the top of `volumeByMuscle` — the engine's seven coarse
    // groups — which put "BACK 7,020 kg" on the same scroll as a body ledger
    // reading "LATS 3,229 / UPPER BACK 1,787" from the twenty-muscle anatomy
    // model. Two vocabularies for one session's work, disagreeing about both
    // the name and the number. The muscle read has one home: the body section.
    expect(w.facts.map((f) => f.labelKey).some((l) => l.startsWith("muscle."))).toBe(false);
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

describe("sessionWrapped — a matched device", () => {
  const tennis: LoggedSession = {
    id: "t1",
    title: "Tennis",
    startedAt: "2026-07-29T10:00:00.000Z",
    completedAt: "2026-07-29T10:02:00.000Z",
    blocks: [{ kind: "cardio", name: "Tennis", discipline: "sport", minutes: 90 }],
    device: {
      provider: "apple",
      uuid: "hk-1",
      activityLabel: "Tennis",
      start: "2026-07-29T10:00:00.000Z",
      end: "2026-07-29T11:34:00.000Z",
      durationMin: 94,
      kcal: 677,
      avgHr: 134,
      maxHr: 165,
      avgMets: 7.5,
      source: "Apple Watch",
    },
  };

  it("headlines the measured duration and the measured burn, with no '~'", () => {
    const w = sessionWrapped(tennis, [tennis], { units: "kg", bw: 80 });
    expect(w.measured).toBe(true);
    expect(w.headline.value).toBe("94 min");
    const minutes = w.basics.find((b) => b.labelKey === "summary.minutes")!;
    expect(minutes.value).toBe("94");
    const kcal = w.basics.find((b) => b.labelKey === "session.wrapped.kcal")!;
    expect(kcal.value).toBe("677");
    expect(kcal.estimate).toBeFalsy();
    expect(w.energy!.basis).toBe("device");
    expect(w.sparse).toBe(false);
  });

  it("shows the wrist's heart rate — a figure no log can produce", () => {
    const w = sessionWrapped(tennis, [tennis], { units: "kg", bw: 80 });
    expect(w.basics.find((b) => b.labelKey === "session.device.avgHr")!.value).toBe("134");
    expect(w.facts.find((f) => f.labelKey === "session.device.maxHr")!.value).toBe("165 bpm");
  });

  it("falls back to the logged figures when nothing was matched", () => {
    const { device: _device, ...logged } = tennis;
    const w = sessionWrapped(logged, [logged], { units: "kg", bw: 80 });
    expect(w.measured).toBe(false);
    expect(w.headline.value).toBe("90 min");
    expect(w.basics.find((b) => b.labelKey === "session.wrapped.kcal")!.estimate).toBe(true);
  });

  // The reported swim: 500 m / 20 min typed, 510 m in 19:41 measured. The panel
  // beside this one reads "510 m" and "3:52 /100m" off the recording, so the
  // Wrapped has to say the same thing — it was printing the typed 500 m at
  // 4:00 /100m, which looked like the match had simply not landed.
  const swim: LoggedSession = {
    id: "sw1",
    title: "Swimming",
    startedAt: "2026-07-30T16:00:00.000Z",
    completedAt: "2026-07-30T16:01:00.000Z",
    blocks: [{ kind: "cardio", name: "Swimming", discipline: "swimming", distance: 0.5, minutes: 20 }],
    device: {
      provider: "apple",
      uuid: "hk-swim",
      activityLabel: "Swimming",
      start: "2026-07-30T16:00:00.000Z",
      end: "2026-07-30T16:19:41.000Z",
      durationMin: 20,
      durationSec: 1181,
      distanceKm: 0.51,
      kcal: 211,
      source: "Apple Watch",
    },
  };

  it("headlines the metres the watch measured, not the ones typed", () => {
    const w = sessionWrapped(swim, [swim], { units: "kg", bw: 80 });
    expect(w.headline.value).toBe("510 m");
    expect(w.basics.find((b) => b.labelKey === "session.distance")!.value).toBe("510 m");
  });

  it("paces off the measured clock to the second, so it agrees with the watch", () => {
    const w = sessionWrapped(swim, [swim], { units: "kg", bw: 80 });
    // 510 m in 19:41 — not 20 min (3:55) and not over 500 m (4:00).
    expect(w.basics.find((b) => b.labelKey === "session.pace")!.value).toBe("3:52 /100m");
  });
});

// Making the panel discipline-aware widened the value vocabulary from "11.3 t"
// to "2:20 /100m" — which wrapped, and a wrapped value drags its label out of
// line with the tiles beside it.
//
// THE WIDTHS BELOW ARE SÖHNE HALBFETT'S, and they were the previous display
// face's until Aug 2026 — a stale MEASUREMENT driving live layout rather than a
// stale comment. The old table put a space at 0.360em against Söhne's 0.202 and
// an `m` at 0.770 against 0.879, so every value carrying a space — which is most
// of the endurance vocabulary this fitter was added for — measured far too wide
// and got shrunk further than it needed to be.
//
// The visible effect of the correction is that FOUR of the values pinned here as
// overflowing now fit outright: "1.5 km" and "90 min" in a stat tile, "1500 m"
// and "10.0 km" in the hero. They were never too big; they were mismeasured.
describe("fitScale", () => {
  it("does not treat every character as the same width", () => {
    // The bug a character count would have: same length, 54% different width.
    expect("11.3 t".length).toBe("1500 m".length);
    expect(textWidthEm("1500 m")).toBeGreaterThan(textWidthEm("11.3 t") * 1.2);
  });

  it("knows a `1` is not as wide as a `0`", () => {
    // Söhne's digits are proportional across a 59% spread (0.402 to 0.639) and
    // the face carries no `tnum` feature to even them out, so a single digit
    // constant — which is what the old table had — is wrong at one end or the
    // other. "111" against "000" is the whole argument in six characters.
    expect(textWidthEm("000")).toBeGreaterThan(textWidthEm("111") * 1.5);
  });

  it("leaves a value that already fits alone", () => {
    for (const v of ["25", "255", "78", "11.3 t", "~395", "0.0 t", "1.5 km", "90 min"])
      expect(fitScale(v, STAT_FIT_EM), v).toBe(1);
    for (const v of ["11.3 t", "60 kg", "90 min", "1500 m", "10.0 km"])
      expect(fitScale(v, HERO_FIT_EM, { trackingEm: HERO_TRACKING_EM }), v).toBe(1);
  });

  it("shrinks every value that would otherwise overflow its tile", () => {
    // em widths at the tile's 22px base; STAT_FIT_EM is the room it has.
    const overflowing = ["1500 m", "2:20 /100m", "10.0 km", "5:00 /km"];
    for (const v of overflowing) {
      const s = fitScale(v, STAT_FIT_EM);
      expect(s, v).toBeLessThan(1);
      // …and having shrunk it, it fits — the property that actually matters.
      expect(textWidthEm(v) * s, v).toBeLessThanOrEqual(STAT_FIT_EM + 1e-9);
    }
  });

  it("shrinks the hero values that would otherwise wrap", () => {
    // The hero is far wider than a tile, so only the two pace formats reach it.
    const overflowing = ["2:20 /100m", "5:00 /km"];
    for (const v of overflowing) {
      const s = fitScale(v, HERO_FIT_EM, { trackingEm: HERO_TRACKING_EM });
      expect(s, v).toBeLessThan(1);
      expect(textWidthEm(v, HERO_TRACKING_EM) * s, v).toBeLessThanOrEqual(HERO_FIT_EM + 1e-9);
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

  it("over-estimates the TWO glyphs it actually serves, rather than under", () => {
    // `~` and `ß` are absent from the shipped cuts, so they render in the
    // platform fallback and are fitted at ADVANCE_FALLBACK_EM. Guessing HIGH
    // shrinks a value that would have fitted; guessing low lets one wrap, and a
    // wrapped figure drags its label out of line with the tiles beside it.
    // Both are narrow shapes — a tilde is about half an em — so 0.6 guesses up.
    expect(SOHNE_ADVANCE_EM["~"]).toBeUndefined();
    expect(SOHNE_ADVANCE_EM["ß"]).toBeUndefined();
    expect(textWidthEm("~9")).toBeCloseTo(ADVANCE_FALLBACK_EM + SOHNE_ADVANCE_EM["9"]!, 5);
  });

  it("is NOT a ceiling over the whole face, and the old assertion said it was", () => {
    // This used to assert that 0.6 was wider than everything in the table, and
    // it passed — because the table held only digits, punctuation and lowercase.
    // Completing it with the capitals put `W` at 0.943 and `M` at 0.861 in
    // range, so the fallback is now a floor for wide glyphs, not a ceiling.
    // That is fine for what it serves and MUST NOT be relied on for anything
    // else: a caps string measured through the fallback under-reads by up to
    // 14%, which is exactly how the nameplate rule came to call a name that
    // overruns its plate a fit. The invariant is stated here so nobody restores
    // the comfortable version of it.
    expect(ADVANCE_FALLBACK_EM).toBeLessThan(SOHNE_ADVANCE_EM["W"]!);
    expect(ADVANCE_FALLBACK_EM).toBeLessThan(SOHNE_ADVANCE_EM["M"]!);
    expect(ADVANCE_FALLBACK_EM).toBeGreaterThan(SOHNE_ADVANCE_EM["I"]!);
  });
});
