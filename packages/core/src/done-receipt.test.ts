import { describe, it, expect } from "vitest";
import { doneReceipt, doneReceiptStats, doneReceiptHero } from "./done-receipt";
import { mergeDoneReceipts } from "./logbook-week";
import type { LoggedSession, SessionBlock } from "./engines/session";

const strength = (sets: number, load = "100", reps = "5"): SessionBlock => ({
  kind: "strength",
  name: "Back Squat",
  sets: Array.from({ length: sets }, () => ({ load, reps })),
});

const session = (over: Partial<LoggedSession> = {}): LoggedSession => ({
  id: "s1",
  title: "Upper + Engine",
  startedAt: "2026-07-16T10:30:00.000Z",
  completedAt: "2026-07-16T11:18:00.000Z",
  blocks: [strength(11)],
  ...over,
});

describe("doneReceipt", () => {
  it("trusts a plausible wall-clock span (48 min for 11 sets)", () => {
    const r = doneReceipt(session());
    expect(r.durationMin).toBe(48);
    expect(r.sets).toBe(11);
    expect(r.tonnageKg).toBe(11 * 100 * 5);
  });

  it("drops the duration when the span is the log, not the workout (the '1 MIN' lie)", () => {
    const r = doneReceipt(session({ completedAt: "2026-07-16T10:31:00.000Z" }));
    expect(r.durationMin).toBeNull();
    // the trustworthy figures survive
    expect(r.sets).toBe(11);
    expect(r.tonnageKg).toBeGreaterThan(0);
  });

  it("falls back to athlete-entered minutes when the span is implausible", () => {
    const r = doneReceipt(
      session({
        completedAt: "2026-07-16T10:31:00.000Z",
        blocks: [{ kind: "cardio", name: "Running", distance: 7.2, minutes: 40 }],
      }),
    );
    expect(r.durationMin).toBe(40);
    expect(r.distanceKm).toBe(7.2);
    expect(r.tonnageKg).toBe(0);
  });

  it("counts conditioning minutes as entered time", () => {
    const r = doneReceipt(
      session({
        completedAt: "2026-07-16T10:31:00.000Z",
        blocks: [{ kind: "conditioning", name: "Assault Bike", format: "EMOM", minutes: 12 }],
      }),
    );
    expect(r.durationMin).toBe(12);
  });

  it("has no duration without completedAt", () => {
    expect(doneReceipt(session({ completedAt: null })).durationMin).toBeNull();
  });

  // The receipt carries no finishing clock at all — a day is not one workout,
  // and the stamp reported whichever session the rail happened to build from.
  it("carries no finishing clock", () => {
    expect("finishedClock" in doneReceipt(session())).toBe(false);
  });

  // ── the device is the source of truth ──────────────────────────────────────
  const tennis = (over: Partial<LoggedSession> = {}): LoggedSession =>
    session({
      title: "Tennis",
      blocks: [{ kind: "cardio", name: "Tennis", minutes: 90 }],
      device: {
        provider: "apple",
        uuid: "hk-1",
        activityLabel: "Tennis",
        start: "2026-07-16T10:30:00.000Z",
        end: "2026-07-16T12:04:00.000Z",
        durationMin: 94,
        kcal: 677,
        source: "Apple Watch",
      },
      ...over,
    });

  it("takes the matched device's duration over the logged one", () => {
    const r = doneReceipt(tennis());
    expect(r.durationMin).toBe(94);
    expect(r.measured).toBe(true);
  });

  it("keeps the logged reading available for the comparison panel", () => {
    const r = doneReceipt(tennis(), { ignoreDevice: true });
    expect(r.durationMin).toBe(90);
    expect(r.measured).toBe(false);
  });

  it("takes the device's distance and climb, and keeps the logged ones when it recorded none", () => {
    const logged: LoggedSession = tennis({
      blocks: [{ kind: "cardio", name: "Trail Run", distance: 10, minutes: 55, elevation: 120 }],
    });
    const withDistance = doneReceipt({
      ...logged,
      device: { ...logged.device!, distanceKm: 10.4237, elevationM: 137 },
    });
    // The measured distance survives EXACTLY — rounding it to 0.1 km here is
    // what turned a 510 m pool swim into 500 m on the summary, and any finer
    // grid does the same thing one sport further down.
    expect(withDistance.distanceKm).toBe(10.4237);
    expect(withDistance.elevationM).toBe(137);
    // A tennis recording carries no distance — the logged figures stand.
    const noDistance = doneReceipt(logged);
    expect(noDistance.distanceKm).toBe(10);
    expect(noDistance.elevationM).toBe(120);
  });

  it("ignores a device row that measured no duration", () => {
    const r = doneReceipt(tennis({ device: { provider: "apple", uuid: "hk-2", activityLabel: "Tennis", start: "x", end: "y", durationMin: 0 } as LoggedSession["device"] }));
    expect(r.durationMin).toBe(90);
    expect(r.measured).toBe(false);
  });
});

describe("doneReceiptStats", () => {
  it("orders duration – volume – distance – sets, unit inside the value", () => {
    const stats = doneReceiptStats(doneReceipt(session()), "kg");
    expect(stats.map((s) => s.labelKey)).toEqual([
      "w.home.rail.duration",
      "w.home.today.volume",
      "w.home.today.sets",
    ]);
    expect(stats[0]!.value).toBe("48 min");
    expect(stats[1]!.value).toBe("5.5 t");
    expect(stats[2]!.value).toBe("11");
  });

  // ── sets are a STRENGTH figure ────────────────────────────────────────────
  it("never reports sets for a swim (a cardio effort is not a set)", () => {
    const swim = doneReceipt(
      session({
        title: "Swimming",
        completedAt: "2026-07-16T10:40:00.000Z",
        blocks: [{ kind: "cardio", name: "Swimming", distance: 0.2, minutes: 10 }],
      }),
    );
    // the effort counter still sees one effort — the display figure does not
    expect(swim.sets).toBe(1);
    expect(swim.strengthSets).toBe(0);
    expect(doneReceiptStats(swim, "kg").map((s) => s.labelKey)).toEqual([
      "w.home.rail.duration",
      "w.home.today.distance",
    ]);
  });

  it("carries the device's exact distance and rounds it only to render", () => {
    const swim = doneReceipt(
      session({
        title: "Swimming",
        completedAt: "2026-07-16T10:34:00.000Z",
        blocks: [{ kind: "cardio", name: "Swimming", distance: 10.234567, minutes: 40 }],
      }),
    );
    // The model keeps the measurement…
    expect(swim.distanceKm).toBe(10.234567);
    // …the rail stat is the one that rounds.
    expect(doneReceiptStats(swim, "kg").find((s) => s.labelKey === "w.home.today.distance")!.value).toBe("10.23 km");
  });

  it("reads a sub-kilometre distance in metres — a km figure makes it unreadable", () => {
    const swim = doneReceipt(
      session({
        title: "Swimming",
        completedAt: "2026-07-16T10:34:00.000Z",
        blocks: [{ kind: "cardio", name: "Swimming", distance: 0.034, minutes: 4 }],
      }),
    );
    expect(doneReceiptStats(swim, "kg").find((s) => s.labelKey === "w.home.today.distance")!.value).toBe("34 m");
  });

  it("never reports sets for a tennis or squash match", () => {
    for (const name of ["Tennis", "Squash"]) {
      const match = doneReceipt(
        session({ title: name, completedAt: "2026-07-16T11:30:00.000Z", blocks: [{ kind: "cardio", name, minutes: 60 }] }),
      );
      expect(match.strengthSets).toBe(0);
      expect(doneReceiptStats(match, "kg").map((s) => s.labelKey)).toEqual(["w.home.rail.duration"]);
    }
  });

  it("counts only the lifted sets on a day that lifted and swam", () => {
    const mixed = doneReceipt(
      session({ blocks: [strength(11), { kind: "cardio", name: "Swimming", distance: 1, minutes: 20 }] }),
    );
    expect(mixed.sets).toBe(12); // 11 sets + 1 swim effort
    expect(mixed.strengthSets).toBe(11);
    expect(doneReceiptStats(mixed, "kg").find((s) => s.labelKey === "w.home.today.sets")?.value).toBe("11");
  });

  it("omits what it cannot vouch for instead of rendering it", () => {
    const stats = doneReceiptStats(
      doneReceipt(session({ completedAt: "2026-07-16T10:31:00.000Z" })),
      "kg",
    );
    expect(stats.map((s) => s.labelKey)).not.toContain("w.home.rail.duration");
  });

  it("renders the climb it has always summed, beside the distance", () => {
    const run = doneReceipt(
      session({
        title: "Running",
        completedAt: "2026-07-16T11:20:00.000Z",
        blocks: [{ kind: "cardio", name: "Running", distance: 9.4, minutes: 50, elevation: 320 }],
      }),
    );
    expect(run.elevationM).toBe(320);
    const stats = doneReceiptStats(run, "kg");
    expect(stats.map((s) => s.labelKey)).toEqual([
      "w.home.rail.duration",
      "w.home.today.distance",
      "w.home.today.climb",
    ]);
    expect(stats[2]!.value).toBe("320 m");
  });

  it("says nothing about the climb on flat ground", () => {
    const flat = doneReceiptStats(
      doneReceipt(session({ blocks: [{ kind: "cardio", name: "Running", distance: 5, minutes: 30 }] })),
      "kg",
    );
    expect(flat.map((s) => s.labelKey)).not.toContain("w.home.today.climb");
  });

  // ── energy — the estimated burn, last, and only when it can be scaled ─────
  it("estimates the calories and marks them as an estimate", () => {
    const swim = doneReceipt(
      session({
        title: "Swimming",
        completedAt: "2026-07-16T10:40:00.000Z",
        blocks: [{ kind: "cardio", name: "Swimming", distance: 0.5, minutes: 10 }],
      }),
      { bodyweightKg: 80 },
    );
    expect(swim.kcal).toBeGreaterThan(0);
    expect(swim.kcalMeasured).toBe(false);
    const stats = doneReceiptStats(swim, "kg");
    // energy sits last, after everything logged or measured
    expect(stats[stats.length - 1]!.labelKey).toBe("w.home.today.energy");
    expect(stats[stats.length - 1]!.value).toBe(`~${swim.kcal} kcal`);
    expect(stats[stats.length - 1]!.estimate).toBe(true);
  });

  it("has no calories without a bodyweight to scale the model by", () => {
    const r = doneReceipt(session());
    expect(r.kcal).toBeNull();
    expect(doneReceiptStats(r, "kg").map((s) => s.labelKey)).not.toContain("w.home.today.energy");
  });

  it("drops the '~' when the device counted the calories", () => {
    const run = doneReceipt(
      session({
        title: "Running",
        blocks: [{ kind: "cardio", name: "Running", distance: 7.2, minutes: 40 }],
        device: {
          provider: "apple",
          uuid: "hk-9",
          activityLabel: "Running",
          start: "2026-07-16T10:30:00.000Z",
          end: "2026-07-16T11:10:00.000Z",
          durationMin: 40,
          kcal: 430,
        } as LoggedSession["device"],
      }),
      { bodyweightKg: 80 },
    );
    expect(run.kcal).toBe(430);
    expect(run.kcalMeasured).toBe(true);
    const energy = doneReceiptStats(run, "kg").find((s) => s.labelKey === "w.home.today.energy")!;
    expect(energy.value).toBe("430 kcal");
    expect(energy.estimate).toBe(false);
  });

  it("reads the athlete's own figures when the device is ignored", () => {
    const over = {
      title: "Running",
      blocks: [{ kind: "cardio" as const, name: "Running", distance: 7.2, minutes: 40 }],
      device: {
        provider: "apple",
        uuid: "hk-9",
        activityLabel: "Running",
        start: "2026-07-16T10:30:00.000Z",
        end: "2026-07-16T11:10:00.000Z",
        durationMin: 40,
        kcal: 430,
      } as LoggedSession["device"],
    };
    const logged = doneReceipt(session(over), { bodyweightKg: 80, ignoreDevice: true });
    expect(logged.kcalMeasured).toBe(false);
    expect(logged.kcal).toBeGreaterThan(0);
  });
});

describe("doneReceiptHero — one number earns the size", () => {
  const cardio = (name: string, distance: number, minutes: number): SessionBlock => ({
    kind: "cardio",
    name,
    distance,
    minutes,
  });

  it("splits the figures into a hero and the rest, keeping their order", () => {
    const run = doneReceipt(
      session({ title: "Running", completedAt: "2026-07-16T11:20:00.000Z", blocks: [cardio("Running", 9.4, 50)] }),
      { bodyweightKg: 80 },
    );
    const { hero, rest } = doneReceiptHero(run, "kg");
    // one discipline covered the ground, so the distance leads
    expect(hero!.labelKey).toBe("w.home.today.distance");
    expect(hero!.figure).toBe("9.4");
    expect(hero!.unit).toBe("km");
    expect(rest.map((s) => s.labelKey)).toEqual(["w.home.rail.duration", "w.home.today.energy"]);
  });

  it("carries the figure and its unit apart, and joined", () => {
    const { hero } = doneReceiptHero(doneReceipt(session()), "kg");
    expect(hero!.labelKey).toBe("w.home.today.volume");
    expect(hero!.figure).toBe("5.5");
    expect(hero!.unit).toBe("t");
    expect(hero!.value).toBe("5.5 t");
  });

  it("lets tonnage lead a day that lifted AND ran", () => {
    const mixed = doneReceipt(session({ blocks: [strength(11), cardio("Running", 5, 25)] }));
    expect(doneReceiptHero(mixed, "kg").hero!.labelKey).toBe("w.home.today.volume");
  });

  it("refuses to headline a distance made of two disciplines", () => {
    // The day the whole redesign was drawn from: a swim and a tennis match.
    // 0.2 + 2.4 km is a real total and a meaningless headline — nobody trains
    // "2.6 km" of swimming-and-tennis. The minutes they did train take it.
    const swim = doneReceipt(
      session({ id: "s1", title: "Swimming", completedAt: "2026-07-16T10:42:00.000Z", blocks: [cardio("Swimming", 0.2, 12)] }),
    );
    const tennis = doneReceipt(
      session({ id: "s2", title: "Tennis", completedAt: "2026-07-16T11:20:00.000Z", blocks: [cardio("Tennis", 2.4, 50)] }),
    );
    expect(swim.cardioLead).toBe("Swimming");
    expect(tennis.cardioLead).toBe("Tennis");

    const day = mergeDoneReceipts([swim, tennis])!;
    expect(day.cardioLead).toBeNull();
    const { hero, rest } = doneReceiptHero(day, "kg");
    expect(hero!.labelKey).toBe("w.home.rail.duration");
    expect(hero!.figure).toBe("62");
    expect(rest.map((s) => s.value)).toEqual(["2.6 km"]);
  });

  it("keeps the lead when the day's two sessions were the same discipline", () => {
    const am = doneReceipt(session({ id: "a", title: "Running", completedAt: "2026-07-16T11:00:00.000Z", blocks: [cardio("Running", 6, 30)] }));
    const pm = doneReceipt(session({ id: "b", title: "Running", completedAt: "2026-07-16T18:00:00.000Z", blocks: [cardio("Running", 4, 20)] }));
    const day = mergeDoneReceipts([am, pm])!;
    expect(day.cardioLead).toBe("Running");
    expect(doneReceiptHero(day, "kg").hero!.value).toBe("10 km");
  });

  it("marks the figures that cannot stand without their label", () => {
    const hilly = doneReceipt(
      session({ blocks: [strength(11), { kind: "cardio", name: "Running", distance: 9.4, minutes: 50, elevation: 320 }] }),
    );
    const { rest } = doneReceiptHero(hilly, "kg");
    const byKey = Object.fromEntries(rest.map((s) => [s.labelKey, s.needsLabel ?? false]));
    expect(byKey["w.home.today.climb"]).toBe(true);
    expect(byKey["w.home.today.sets"]).toBe(true);
    expect(byKey["w.home.today.distance"]).toBe(false);
  });

  it("has no hero when nothing trustworthy was logged", () => {
    const empty = doneReceipt(session({ completedAt: null, blocks: [] }));
    expect(doneReceiptHero(empty, "kg").hero).toBeNull();
  });
});
