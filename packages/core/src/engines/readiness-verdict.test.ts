import { describe, it, expect } from "vitest";
import { readinessReasons, readinessVerdict, readinessReasonsKey, readinessWhy, READINESS_VERDICT_KEY } from "./performance-state";
import type { Biometrics, TrainingLog } from "./types";

/**
 * THE FACE AND THE DOOR.
 *
 * The readiness block leads with ONE line and keeps its derivation behind a
 * disclosure. Two things must hold or the card lies: the face may never name a
 * limiter the lines behind it don't, and the door may never advertise a count
 * different from what opening it reveals.
 */

const LOADED: TrainingLog = [
  { daysAgo: 0, items: [{ move: "Back Squat", topRpe: 9, hardSets: 8 }] },
  { daysAgo: 1, items: [{ move: "Back Squat", topRpe: 9, hardSets: 8 }] },
];

const RESTED: TrainingLog = [{ daysAgo: 13, items: [{ move: "Back Squat", topRpe: 6, hardSets: 1 }] }];

const TIRED_BIO: Biometrics = {
  hrv: { today: 42, baseline: 60, better: "high" },
  restingHr: { today: 58, baseline: 52, better: "low" },
  sleep: { today: 5.4, baseline: 7.6, better: "high" },
};

describe("readinessReasons — the lines behind the door", () => {
  it("is readinessWhy without its score line, which the ring already draws", () => {
    expect(readinessReasons(LOADED)).toEqual(readinessWhy(LOADED).slice(1));
    expect(readinessReasons(LOADED).join(" ")).not.toMatch(/^Readiness \d+\/100\./);
  });
});

describe("readinessVerdict — one line, and what the door may promise", () => {
  it("names the most-loaded tissue as the limiter, agreeing with the lines behind it", () => {
    const v = readinessVerdict(LOADED);
    expect(v.kind).toBe("limiter");
    expect(v.key).toBe(READINESS_VERDICT_KEY.limiter);
    expect(v.muscle).toBe("quads");
    // The face and the derivation must name the SAME tissue.
    expect(readinessReasons(LOADED)[0]).toContain("quads fatigue");
  });

  it("flips positive when nothing carries meaningful fatigue — it does not hunt for a complaint", () => {
    const v = readinessVerdict(RESTED);
    expect(v.kind).toBe("clear");
    expect(v.muscle).toBeNull();
    expect(readinessReasons(RESTED)[0]).toContain("no meaningful residual fatigue");
  });

  it("stays honest on an empty log — nothing logged, nothing to subtract", () => {
    const v = readinessVerdict([]);
    expect(v.kind).toBe("empty");
    expect(v.muscle).toBeNull();
  });

  it("returns an i18n KEY, never a pre-baked English sentence", () => {
    for (const log of [LOADED, RESTED, [] as TrainingLog]) {
      expect(readinessVerdict(log).key).toMatch(/^w\.home\.readiness\.verdict/);
    }
  });

  it("counts exactly what opening the door reveals", () => {
    for (const log of [LOADED, RESTED]) {
      expect(readinessVerdict(log).reasons).toBe(readinessReasons(log).length);
      expect(readinessVerdict(log, TIRED_BIO).reasons).toBe(readinessReasons(log, TIRED_BIO).length);
    }
  });

  it("counts the wearable as its own reason once it has moved the score", () => {
    const withBio = readinessVerdict(LOADED, TIRED_BIO);
    const without = readinessVerdict(LOADED);
    expect(withBio.reasons).toBeGreaterThan(without.reasons);
    expect(readinessReasons(LOADED, TIRED_BIO).some((l) => l.includes("wearable"))).toBe(true);
  });

  it("asks a different question when nothing is missing — a door never points at a zero", () => {
    const short = readinessVerdict(RESTED);
    expect(short.doorKey).toBe(short.deficit > 0 ? "w.home.readiness.door" : "w.home.readiness.doorClear");
    // Whatever the log, the door's label always matches its own arithmetic.
    for (const log of [LOADED, RESTED, [] as TrainingLog]) {
      for (const bio of [undefined, TIRED_BIO]) {
        const v = readinessVerdict(log, bio);
        expect(v.doorKey).toBe(v.deficit > 0 ? "w.home.readiness.door" : "w.home.readiness.doorClear");
      }
    }
  });

  it("states the deficit as arithmetic: 100 minus the score the ring draws", () => {
    const v = readinessVerdict(LOADED, TIRED_BIO);
    expect(v.deficit).toBe(100 - Number(readinessWhy(LOADED, TIRED_BIO)[0].match(/(\d+)\/100/)![1]));
    expect(v.deficit).toBeGreaterThanOrEqual(0);
  });
});

describe("readinessReasonsKey — plural forms the engine owns, not the clients", () => {
  it("uses the singular for one", () => {
    expect(readinessReasonsKey(1)).toBe("w.home.readiness.reasonsOne");
  });

  it("uses the Polish few-form for 2 to 4", () => {
    for (const n of [2, 3, 4]) expect(readinessReasonsKey(n)).toBe("w.home.readiness.reasonsFew");
  });

  it("uses the many-form for 5+ and for the teens", () => {
    for (const n of [0, 5, 11, 12, 13, 14]) expect(readinessReasonsKey(n)).toBe("w.home.readiness.reasonsMany");
  });
});
