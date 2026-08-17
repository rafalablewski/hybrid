import { describe, it, expect } from "vitest";
import {
  OLYMPIC_SPORTS,
  OLYMPIC_SPORT_NAMES,
  olympicSport,
  sportTracksDistance,
  olympicSportsByCategory,
  sportDistanceUnit,
  displaySportDistance,
  parseSportDistance,
  formatSportDistance,
  suggestedSports,
  timedSportOnly,
} from "./olympic-sports";
import { cardioPace, formatCardioPr, type LoggedSession } from "./engines/session";

describe("olympic-sports catalog", () => {
  it("keys the catalog by name with every sport carrying duration", () => {
    expect(OLYMPIC_SPORT_NAMES.length).toBeGreaterThan(40);
    for (const name of OLYMPIC_SPORT_NAMES) {
      const s = OLYMPIC_SPORTS[name]!;
      expect(s.name).toBe(name);
      // NO `icon` field — a sport's drawing is resolved from its name; the
      // catalog carrying one is what made it the app's biggest emoji source.
      expect(s).not.toHaveProperty("icon");
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

  it("timedSportOnly flags only KNOWN sports that don't track distance", () => {
    expect(timedSportOnly("Tennis")).toBe(true); // known + no distance
    expect(timedSportOnly("Running")).toBe(false); // known + distance
    expect(timedSportOnly("Run")).toBe(false); // unknown/custom cardio keeps distance
  });

  it("formats a cardio PR in the move's unit (shared by web + both mobile lines)", () => {
    // Distance PR — metres for swimming, with the gain in the same unit.
    expect(formatCardioPr({ kind: "distance", move: "Swimming", value: 1.5, previous: 1.2 }, "first!")).toBe("Swimming 1500 m (+300 m)");
    expect(formatCardioPr({ kind: "distance", move: "Running", value: 10, previous: null }, "first!")).toBe("Running 10 km (first!)");
    // Pace PR — value/previous are sec/km; swimming shows /100m and a scaled delta.
    expect(formatCardioPr({ kind: "pace", move: "Swimming", value: 1200, previous: 1300 }, "first!")).toBe("Swimming 2:00 /100m (−0:10)");
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

  it("shows distance in the sport's natural unit but stores km", () => {
    // Swimming enters/shows metres; storage is km.
    expect(sportDistanceUnit("Swimming")).toBe("m");
    expect(displaySportDistance(0.4, "Swimming")).toBe("400");
    expect(parseSportDistance("400", "Swimming")).toBeCloseTo(0.4);
    expect(formatSportDistance(0.4, "Swimming")).toBe("400 m");

    // Running stays in km.
    expect(sportDistanceUnit("Running")).toBe("km");
    expect(displaySportDistance(8, "Running")).toBe("8");
    expect(parseSportDistance("8", "Running")).toBe(8);
    expect(formatSportDistance(8, "Running")).toBe("8 km");
  });

  it("paces metre sports by their split, km sports per km", () => {
    // 0.4 km in 8 min → 1200 s/km → 120 s/100m → "2:00 /100m".
    expect(cardioPace({ name: "Swimming", distance: 0.4, minutes: 8 })).toBe("2:00 /100m");
    // Rowing is /500m.
    expect(cardioPace({ name: "Rowing", distance: 0.5, minutes: 2 })?.endsWith("/500m")).toBe(true);
    // Plain run is /km.
    expect(cardioPace({ name: "Running", distance: 10, minutes: 50 })).toBe("5:00 /km");
    // No distance → no pace.
    expect(cardioPace({ name: "Tennis", minutes: 60 })).toBeNull();
  });

  it("suggests recently-logged sports first, then tops up with defaults", () => {
    const mk = (name: string, daysAgo: number): LoggedSession => ({
      id: name + daysAgo,
      title: name,
      startedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
      completedAt: null,
      blocks: [{ kind: "cardio", name }],
      readiness: null,
    });
    // Newest (Tennis) first, then Swimming; unknown custom names are ignored.
    const got = suggestedSports([mk("Swimming", 3), mk("Tennis", 1), mk("My Jog", 0)]);
    expect(got[0]).toBe("Tennis");
    expect(got[1]).toBe("Swimming");
    expect(got).not.toContain("My Jog");
    expect(got).toContain("Running"); // topped up with defaults
    expect(got).toContain("Football");
    // No history → pure defaults.
    expect(suggestedSports([])[0]).toBe("Running");
  });

  it("groups every sport under exactly one category", () => {
    const grouped = olympicSportsByCategory();
    const total = grouped.reduce((n, g) => n + g.sports.length, 0);
    expect(total).toBe(OLYMPIC_SPORT_NAMES.length);
    for (const g of grouped) expect(g.sports.length).toBeGreaterThan(0);
  });
});
