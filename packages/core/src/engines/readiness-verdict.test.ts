import { describe, it, expect } from "vitest";
import { readinessReasons, readinessVerdict, readinessReasonsKey, readinessWhy, readinessFacts, READINESS_VERDICT_KEY } from "./performance-state";
import { readinessDeficit } from "./readiness-deficit";
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
  hrv: { today: 42, baseline: 60, unit: "ms", better: "high" },
  restingHr: { today: 58, baseline: 52, unit: "bpm", better: "low" },
  sleep: { today: 5.4, baseline: 7.6, unit: "h", better: "high" },
};

/** A wearable reading ABOVE this athlete's own baseline — it gives points back
 *  rather than taking them, which is the case with no ledger row of its own. */
const FRESH_BIO: Biometrics = {
  hrv: { today: 78, baseline: 60, unit: "ms", better: "high" },
  restingHr: { today: 47, baseline: 52, unit: "bpm", better: "low" },
  sleep: { today: 8.6, baseline: 7.6, unit: "h", better: "high" },
};

describe("readinessReasons — the lines behind the door", () => {
  it("is readinessWhy without its score line, which the ring already draws", () => {
    expect(readinessReasons(LOADED)).toEqual(readinessWhy(LOADED).slice(1));
    expect(readinessReasons(LOADED).join(" ")).not.toMatch(/^Readiness \d+\/100\./);
  });
});

/**
 * THE PROVENANCE LINE.
 *
 * The block used to close with three sentences restating the ledger's three
 * rows — the same figures, in words, in English only. They were cut. These are
 * what the rows genuinely can't carry, and the rule is that each fact is an
 * i18n KEY plus a number, never a baked sentence.
 */
describe("readinessFacts — the inputs the ledger's rows can't show", () => {
  it("says nothing at all on an empty log — there is no provenance to state", () => {
    expect(readinessFacts([])).toEqual([]);
  });

  it("returns keys and figures, never prose", () => {
    for (const f of readinessFacts(LOADED, TIRED_BIO)) {
      expect(f.key).toMatch(/^w\.home\.readiness\.fact/);
      expect(Number.isFinite(f.value)).toBe(true);
    }
  });

  it("names the tissue the face names, with the fatigue the row can't show", () => {
    const v = readinessVerdict(LOADED);
    const tissue = readinessFacts(LOADED).find((f) => f.key === "w.home.readiness.factTissue");
    expect(tissue?.muscle).toBe(v.muscle);
    // The row says the tissue term cost N points; this says the tissue reads
    // 0..100 — a different number, and the one that decides tomorrow.
    expect(tissue!.value).toBeGreaterThan(0);
    expect(tissue!.value).toBeLessThanOrEqual(100);
  });

  it("keeps a POSITIVE wearable visible — the one input with no row of its own", () => {
    // A positive nudge takes no arc and no ledger row (it shrinks every other
    // share instead), so without this fact a wearable that was read and did
    // move the score would show nothing anywhere on the card.
    const d = readinessDeficit(LOADED, FRESH_BIO);
    expect(d.bioAdj).toBeGreaterThan(0);
    expect(d.costs.some((c) => c.kind === "wearable")).toBe(false);
    const fact = readinessFacts(LOADED, FRESH_BIO).find((f) => f.key === "w.home.readiness.factWearable");
    expect(fact?.value).toBe(d.bioAdj);
  });

  it("stays silent about a wearable that isn't there", () => {
    expect(readinessFacts(LOADED).some((f) => f.key === "w.home.readiness.factWearable")).toBe(false);
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
    expect(readinessReasons(RESTED)[0]).toContain("cleared to train");
  });

  it("names the ENGINE when conditioning is what took the points", () => {
    // A runner's log doses fatigue.systems, never fatigue.muscles, so the face
    // used to have nothing to name and the block reported an all-clear on a
    // day the athlete had run themselves into the ground.
    const running: TrainingLog = [
      { daysAgo: 0, items: [{ move: "Run", minutes: 65, rpe: 8, system: "threshold" }] },
      { daysAgo: 1, items: [{ move: "Run", minutes: 95, rpe: 7, system: "aerobic" }] },
      { daysAgo: 3, items: [{ move: "Run", minutes: 50, rpe: 9, system: "anaerobic" }] },
    ];
    const v = readinessVerdict(running);
    expect(v.kind).toBe("engine");
    expect(v.muscle).toBeNull();
    expect(v.deficit).toBeGreaterThan(10);
    // And the prose must not hand out an all-clear beside that cost.
    const reasons = readinessReasons(running);
    expect(reasons[0]).not.toContain("cleared to train");
    expect(reasons.some((l) => l.includes("counts against today's number"))).toBe(true);
  });

  it("names RECOVERY when the wearable is the biggest cause", () => {
    const v = readinessVerdict(RESTED, TIRED_BIO);
    expect(v.kind).toBe("recovery");
  });

  it("never names a cause the ring doesn't draw biggest", () => {
    for (const [log, bio] of [[LOADED, undefined], [LOADED, TIRED_BIO], [RESTED, TIRED_BIO]] as const) {
      const v = readinessVerdict(log, bio);
      if (v.kind === "clear" || v.kind === "empty") continue;
      const top = [...readinessDeficit(log, bio).costs].sort((a, b) => b.points - a.points)[0]!;
      const expected = { tissue: "limiter", conditioning: "engine", fuel: "fuel", wearable: "recovery", ceiling: "clear" }[top.kind];
      expect(v.kind).toBe(expected);
    }
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

  // The door opens onto the LEDGER now, not onto prose: the three sentences
  // that used to sit behind it restated the three rows above them, in English
  // only, and were cut. The count has to follow what is actually revealed —
  // both numbers were 3 on a typical day, which is exactly how a door that
  // promises three of something no longer there would have shipped unnoticed.
  it("counts exactly what opening the door reveals — the ledger's rows", () => {
    for (const log of [LOADED, RESTED]) {
      expect(readinessVerdict(log).reasons).toBe(readinessDeficit(log).costs.length);
      expect(readinessVerdict(log, TIRED_BIO).reasons).toBe(readinessDeficit(log, TIRED_BIO).costs.length);
    }
  });

  it("counts the wearable as its own reason once it has moved the score", () => {
    const withBio = readinessVerdict(LOADED, TIRED_BIO);
    const without = readinessVerdict(LOADED);
    expect(withBio.reasons).toBeGreaterThan(without.reasons);
    expect(readinessDeficit(LOADED, TIRED_BIO).costs.some((c) => c.kind === "wearable")).toBe(true);
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
    expect(v.deficit).toBe(100 - Number(readinessWhy(LOADED, TIRED_BIO)[0]!.match(/(\d+)\/100/)![1]));
    expect(v.deficit).toBeGreaterThanOrEqual(0);
  });

  it("reads the SAME day the ring does — the heat prior reaches the door too", () => {
    // THE DEFECT THIS PINS. `readinessDeficit` has always taken the heat
    // credit; `readinessVerdict` did not, so it computed a second split from a
    // different reading of one day. The door's label comes off the verdict and
    // the ledger behind it comes off the deficit, so on any day with a logged
    // sauna the door promised "Where the 33 went" and opened onto rows summing
    // to 28 — with "Spent 28" printed on the bar between them.
    //
    // A credit big enough to move the score, chosen so the assertion is about
    // agreement rather than about a rounding tie.
    const heat = 3;
    const withHeat = readinessVerdict(LOADED, undefined, heat);
    const ring = readinessDeficit(LOADED, undefined, heat);
    expect(withHeat.deficit).toBe(ring.deficit);
    expect(withHeat.reasons).toBe(ring.costs.length);
    // And the credit is genuinely doing something here, so the equality above
    // is not two identical calls agreeing by accident.
    expect(withHeat.deficit).toBeLessThan(readinessVerdict(LOADED).deficit);
  });

  it("agrees with the ring for every heat credit the engine can hand it", () => {
    // The whole 0..HEAT_CREDIT_MAX range, on a log with a real deficit and with
    // and without a wearable — the door's promise must equal the ledger's sum
    // and its count must equal the number of rows, always.
    for (const heat of [0, 1, 2, 3]) {
      for (const bio of [undefined, TIRED_BIO]) {
        const v = readinessVerdict(LOADED, bio, heat);
        const d = readinessDeficit(LOADED, bio, heat);
        expect(v.deficit, `heat ${heat}`).toBe(d.deficit);
        expect(v.reasons, `heat ${heat}`).toBe(d.costs.length);
        expect(v.doorKey).toBe(v.deficit > 0 ? "w.home.readiness.door" : "w.home.readiness.doorClear");
      }
    }
  });

  it("defaults the credit to nothing, so an unwired caller reads exactly as before", () => {
    expect(readinessVerdict(LOADED, TIRED_BIO)).toEqual(readinessVerdict(LOADED, TIRED_BIO, 0));
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
