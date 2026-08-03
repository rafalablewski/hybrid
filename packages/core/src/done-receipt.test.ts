import { describe, it, expect } from "vitest";
import { doneReceipt, doneReceiptStats } from "./done-receipt";
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

  it("has no duration and no finish clock without completedAt", () => {
    const r = doneReceipt(session({ completedAt: null }));
    expect(r.durationMin).toBeNull();
    expect(r.finishedClock).toBeNull();
  });

  it("stamps the local finish clock", () => {
    expect(doneReceipt(session()).finishedClock).toMatch(/\d{1,2}[:.]\d{2}/);
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
    expect(doneReceiptStats(swim, "kg").find((s) => s.labelKey === "w.home.today.distance")!.value).toBe("10.2 km");
  });

  it("reads a sub-kilometre distance in metres — tenths of a km round it to nothing", () => {
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
});
