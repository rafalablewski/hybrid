import { describe, it, expect } from "vitest";
import { workoutFunFact, sessionFunFact, funFactAmount, funFactText } from "./comparisons";
import type { SessionBlock } from "./session";

describe("workoutFunFact", () => {
  it("picks the highest volume tier (1 t → the hippo)", () => {
    const f = workoutFunFact({ volume: 1200, reps: 0, distanceKm: 0 });
    expect(f).not.toBeNull();
    expect(f!.metric).toBe("volume");
    expect(f!.key).toBe("funfact.vol.3");
  });

  it("escalates with magnitude", () => {
    expect(workoutFunFact({ volume: 120, reps: 0, distanceKm: 0 })!.key).toBe("funfact.vol.0");
    expect(workoutFunFact({ volume: 6000, reps: 0, distanceKm: 0 })!.key).toBe("funfact.vol.5");
    expect(workoutFunFact({ volume: 50000, reps: 0, distanceKm: 0 })!.key).toBe("funfact.vol.6");
  });

  it("returns null only for a totally empty workout", () => {
    expect(workoutFunFact({ volume: 0, reps: 0, distanceKm: 0 })).toBeNull();
  });

  it("always returns a fact for any non-empty workout (entry tier)", () => {
    // a light bodyweight set: no load (volume 0) but a few reps → reps entry tier
    expect(workoutFunFact({ volume: 0, reps: 12, distanceKm: 0 })).toMatchObject({ metric: "reps", key: "funfact.reps.s" });
    // a single light loaded set → volume entry tier
    expect(workoutFunFact({ volume: 40, reps: 0, distanceKm: 0 })).toMatchObject({ metric: "volume", key: "funfact.vol.s" });
    // a short walk → distance entry tier
    expect(workoutFunFact({ volume: 0, reps: 0, distanceKm: 1 })).toMatchObject({ metric: "distance", key: "funfact.dist.s" });
  });

  it("surfaces distance for a long run with little tonnage", () => {
    const f = workoutFunFact({ volume: 0, reps: 0, distanceKm: 21 });
    expect(f!.metric).toBe("distance");
    expect(f!.key).toBe("funfact.dist.3");
  });

  it("surfaces reps for a high-rep, low-load session", () => {
    const f = workoutFunFact({ volume: 0, reps: 250, distanceKm: 0 });
    expect(f!.metric).toBe("reps");
    expect(f!.key).toBe("funfact.reps.2");
  });

  it("breaks ties in favour of volume, then distance", () => {
    // volume tier 0 vs reps tier 0 → volume wins
    expect(workoutFunFact({ volume: 100, reps: 50, distanceKm: 0 })!.metric).toBe("volume");
    // distance tier 0 vs reps tier 0 (no volume) → distance wins
    expect(workoutFunFact({ volume: 0, reps: 50, distanceKm: 3 })!.metric).toBe("distance");
  });
});

describe("sessionFunFact", () => {
  it("computes volume from working sets and ignores warm-ups", () => {
    const blocks: SessionBlock[] = [
      {
        kind: "strength",
        name: "Back Squat",
        sets: [
          { load: "50", reps: "10", role: "warmup" }, // excluded
          { load: "100", reps: "5" },
          { load: "100", reps: "5" },
        ],
      },
    ];
    // working volume = 100*5 + 100*5 = 1000 → the hippo tier
    expect(sessionFunFact(blocks)!.key).toBe("funfact.vol.3");
  });

  it("sums cardio distance", () => {
    const blocks: SessionBlock[] = [{ kind: "cardio", name: "Easy Run", distance: 10, minutes: 50 }];
    const f = sessionFunFact(blocks);
    expect(f!.metric).toBe("distance");
    expect(f!.key).toBe("funfact.dist.2");
  });
});

describe("funFactAmount / funFactText", () => {
  const t = (k: string) => (k === "funfact.vol.3" ? "You moved {amount} — over a tonne, about a small hippo." : k);

  it("formats the amount per metric", () => {
    expect(funFactAmount({ metric: "volume", value: 1200, key: "funfact.vol.3", emoji: "🦛" }, "kg")).toBe("1.2 t");
    expect(funFactAmount({ metric: "distance", value: 10, key: "funfact.dist.2", emoji: "🔥" }, "kg")).toBe("10 km");
    expect(funFactAmount({ metric: "reps", value: 250, key: "funfact.reps.2", emoji: "🔁" }, "kg")).toBe("250");
  });

  it("renders the localized one-liner with {amount} filled in", () => {
    const text = funFactText({ metric: "volume", value: 1200, key: "funfact.vol.3", emoji: "🦛" }, "kg", t);
    expect(text).toBe("You moved 1.2 t — over a tonne, about a small hippo.");
  });
});
