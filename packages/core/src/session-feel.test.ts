import { describe, it, expect } from "vitest";
import {
  FEELS,
  FATIGUES,
  feelDef,
  fatigueDef,
  sanitizeFeelLevel,
  sessionRpe,
  feltSessionLoad,
  loadBand,
  LOAD_BAND_KEY,
  loadBaseline,
  relativeEffort,
  hasFeel,
  feelSamples,
  type FeelSample,
} from "./session-feel";
import type { LoggedSession } from "./engines/session";

const run = (id: string, startedAt: string, minutes: number, feel?: number, fatigue?: number): LoggedSession => ({
  id,
  title: "Easy run",
  startedAt,
  completedAt: new Date(Date.parse(startedAt) + minutes * 60000).toISOString(),
  blocks: [{ kind: "cardio", name: "Running", discipline: "running", distance: 10, minutes }],
  ...(feel != null ? { feel } : {}),
  ...(fatigue != null ? { fatigue } : {}),
});

describe("the scales", () => {
  it("runs 1..5 in both directions with a monotonic sRPE mapping", () => {
    expect(FEELS.map((f) => f.value)).toEqual([1, 2, 3, 4, 5]);
    expect(FATIGUES.map((f) => f.value)).toEqual([1, 2, 3, 4, 5]);
    const rpes = FEELS.map((f) => f.rpe);
    expect([...rpes]).toEqual([...rpes].sort((a, b) => a - b));
    expect(rpes[rpes.length - 1]).toBe(10);
  });

  it("looks levels up and rejects anything outside 1..5", () => {
    expect(feelDef(3)?.labelKey).toBe("session.feel.solid");
    expect(fatigueDef(5)?.labelKey).toBe("session.fatigue.wrecked");
    expect(feelDef(null)).toBeNull();
    expect(feelDef(9)).toBeNull();
    for (const bad of [0, 6, 2.5, "3", null, undefined, NaN]) expect(sanitizeFeelLevel(bad)).toBeNull();
    expect(sanitizeFeelLevel(4)).toBe(4);
  });
});

describe("felt training load", () => {
  it("is session RPE × minutes", () => {
    expect(sessionRpe(3)).toBe(6);
    expect(feltSessionLoad(3, 40)).toBe(240);
  });

  it("separates two athletes who logged the identical session", () => {
    // The point of the whole module: same 10 km in 40 min, different cost.
    const floated = feltSessionLoad(2, 40)!; // "steady"
    const survived = feltSessionLoad(5, 40)!; // "all out"
    expect(survived).toBeGreaterThan(floated);
    expect(survived / floated).toBe(2.5);
  });

  it("is null when either input is missing — never a defaulted middle value", () => {
    expect(feltSessionLoad(null, 40)).toBeNull();
    expect(feltSessionLoad(3, null)).toBeNull();
    expect(feltSessionLoad(3, 0)).toBeNull();
  });

  it("bands a load and names every band", () => {
    expect(loadBand(50)).toBe("recovery");
    expect(loadBand(240)).toBe("light");
    expect(loadBand(300)).toBe("moderate");
    expect(loadBand(500)).toBe("hard");
    expect(loadBand(900)).toBe("peak");
    for (const b of ["recovery", "light", "moderate", "hard", "peak"] as const)
      expect(LOAD_BAND_KEY[b]).toBeTruthy();
  });
});

describe("relative effort", () => {
  const now = Date.parse("2026-02-01T10:00:00.000Z");
  const sample = (id: string, daysAgo: number, load: number): FeelSample => ({
    sessionId: id,
    at: new Date(now - daysAgo * 86_400_000).toISOString(),
    minutes: 40,
    feel: 3,
    fatigue: 3,
    load,
    distanceKm: 10,
    tonnageKg: 0,
  });

  it("stays null until there are enough labelled sessions to mean anything", () => {
    expect(loadBaseline([sample("a", 2, 200)], { now })).toBeNull();
    expect(loadBaseline([sample("a", 2, 200), sample("b", 4, 300)], { now })).toBeNull();
  });

  it("averages the window and excludes the session being judged", () => {
    const pool = [sample("a", 2, 200), sample("b", 4, 300), sample("c", 6, 400), sample("me", 0, 9999)];
    expect(loadBaseline(pool, { now, excludeId: "me" })).toBe(300);
  });

  it("ignores samples older than the window", () => {
    const pool = [sample("a", 2, 200), sample("b", 4, 300), sample("c", 6, 400), sample("old", 90, 10_000)];
    expect(loadBaseline(pool, { now })).toBe(300);
  });

  it("reports how far above or below the athlete's own normal a session sat", () => {
    expect(relativeEffort(360, 300)).toEqual({ ratio: 1.2, pct: 20 });
    expect(relativeEffort(150, 300)!.pct).toBe(-50);
    expect(relativeEffort(300, null)).toBeNull();
    expect(relativeEffort(300, 0)).toBeNull();
  });
});

describe("feelSamples", () => {
  it("keeps only the sessions the athlete actually answered", () => {
    const sessions = [
      run("s1", "2026-01-10T10:00:00.000Z", 40, 4, 3),
      run("s2", "2026-01-12T10:00:00.000Z", 40), // never rated
    ];
    const samples = feelSamples(sessions);
    expect(samples.map((s) => s.sessionId)).toEqual(["s1"]);
    expect(samples[0]!.load).toBe(320);
    expect(samples[0]!.fatigue).toBe(3);
    expect(samples[0]!.distanceKm).toBe(10);
  });

  it("carries a missing fatigue answer through as null, not as a middle value", () => {
    const samples = feelSamples([run("s1", "2026-01-10T10:00:00.000Z", 40, 4)]);
    expect(samples[0]!.fatigue).toBeNull();
  });

  it("hasFeel reads the answered flag off a session row", () => {
    expect(hasFeel({ feel: 2 })).toBe(true);
    expect(hasFeel({ feel: null })).toBe(false);
    expect(hasFeel({})).toBe(false);
  });
});
