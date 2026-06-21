import { describe, it, expect } from "vitest";
import {
  OLYMPIC_SPORTS,
  OLYMPIC_SPORT_NAMES,
  olympicSport,
  sportTracksDistance,
  olympicSportsByCategory,
} from "./olympic-sports";

describe("olympic-sports catalog", () => {
  it("keys the catalog by name with every sport carrying duration", () => {
    expect(OLYMPIC_SPORT_NAMES.length).toBeGreaterThan(40);
    for (const name of OLYMPIC_SPORT_NAMES) {
      const s = OLYMPIC_SPORTS[name]!;
      expect(s.name).toBe(name);
      expect(s.icon).toBeTruthy();
      // Duration applies to every sport — it's the universal session parameter.
      expect(s.metrics).toContain("duration");
    }
  });

  it("matches the spec's per-sport parameters", () => {
    // Tennis — timed only (no distance).
    expect(sportTracksDistance("Tennis")).toBe(false);
    expect(olympicSport("Tennis")!.metrics).toEqual(["duration"]);

    // Running — time, distance AND pace.
    const running = olympicSport("Running")!;
    expect(running.metrics).toContain("distance");
    expect(running.metrics).toContain("pace");
    expect(sportTracksDistance("Running")).toBe(true);

    // Swimming — minutes and/or distance.
    expect(sportTracksDistance("Swimming")).toBe(true);
  });

  it("pace always implies distance", () => {
    for (const s of Object.values(OLYMPIC_SPORTS)) {
      if (s.metrics.includes("pace")) expect(s.metrics).toContain("distance");
    }
  });

  it("looks sports up case-insensitively", () => {
    expect(olympicSport("running")!.name).toBe("Running");
    expect(olympicSport("  TENNIS ")!.name).toBe("Tennis");
    expect(olympicSport("not a sport")).toBeUndefined();
  });

  it("groups every sport under exactly one category", () => {
    const grouped = olympicSportsByCategory();
    const total = grouped.reduce((n, g) => n + g.sports.length, 0);
    expect(total).toBe(OLYMPIC_SPORT_NAMES.length);
    for (const g of grouped) expect(g.sports.length).toBeGreaterThan(0);
  });
});
