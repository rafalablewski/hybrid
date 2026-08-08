import { describe, it, expect } from "vitest";
import {
  markerBetter,
  markerHistory,
  recordMarker,
  searchSports,
  sportIndex,
  sportForDiscipline,
  sportIndexMeta,
  sportFromSlug,
  sportSlug,
  markerNumber,
  sportDistance,
  sportPace,
  sportPageModel,
  sportPaceUnit,
  sportSessions,
  SPORT_PAGE_RECENT,
} from "./sport-page";
import { OLYMPIC_SPORTS } from "./olympic-sports";
import { SPORT_MARK_PATHS, sportMark, sportMarkPaths } from "./theme/sport-marks";
import type { LoggedSession } from "./engines/session";

const NOW = Date.parse("2026-07-31T12:00:00.000Z");
const DAY = 86_400_000;

/** One cardio effort, `daysAgo` before NOW. `device` marks it as a watch read. */
function effort(
  id: string,
  name: string,
  discipline: string,
  daysAgo: number,
  distanceKm: number,
  minutes: number,
  device?: { durationSec?: number },
): LoggedSession {
  const s: LoggedSession = {
    id,
    title: name,
    startedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    blocks: [{ kind: "cardio", name, discipline, distance: distanceKm, minutes }],
  } as LoggedSession;
  if (device) {
    (s as { device?: unknown }).device = {
      provider: "apple",
      uuid: `u-${id}`,
      activityLabel: name,
      start: s.startedAt,
      end: s.startedAt,
      durationMin: minutes,
      durationSec: device.durationSec,
      distanceKm,
    };
  }
  return s;
}

const RUNS: LoggedSession[] = [
  effort("r1", "Long run", "running", 3, 18, 98),
  effort("r2", "Threshold", "running", 5, 8, 37),
  effort("r3", "Easy run", "running", 9, 6, 38),
  effort("r4", "Parkrun", "running", 16, 5, 24),
];

const MIXED: LoggedSession[] = [
  ...RUNS,
  effort("s1", "Swim", "swimming", 2, 2.4, 45),
  effort("t1", "Tennis", "sport", 4, 0, 75),
  effort("t2", "Tennis", "sport", 11, 0, 60),
  effort("q1", "Squash", "sport", 6, 0, 45),
];

describe("sportSessions — the slice", () => {
  it("matches an endurance sport on its DISCIPLINE, whatever the move is called", () => {
    const slice = sportSessions(MIXED, "Running");
    expect(slice.map((s) => s.id).sort()).toEqual(["r1", "r2", "r3", "r4"]);
  });

  it("matches a timed sport on its NAME — every one of them shares the 'sport' tag", () => {
    expect(sportSessions(MIXED, "Tennis").map((s) => s.id)).toEqual(["t1", "t2"]);
    expect(sportSessions(MIXED, "Squash").map((s) => s.id)).toEqual(["q1"]);
  });

  it("drops the non-matching blocks rather than the whole session", () => {
    const both: LoggedSession[] = [
      {
        id: "b1",
        title: "Brick",
        startedAt: new Date(NOW - DAY).toISOString(),
        blocks: [
          { kind: "cardio", name: "Ride", discipline: "cycling", distance: 40, minutes: 80 },
          { kind: "cardio", name: "Run off the bike", discipline: "running", distance: 5, minutes: 26 },
        ],
      } as LoggedSession,
    ];
    const slice = sportSessions(both, "Running");
    expect(slice).toHaveLength(1);
    expect(slice[0]!.blocks).toHaveLength(1);
    expect(slice[0]!.blocks[0]!.name).toBe("Run off the bike");
  });

  it("reads the watch's seconds, not the rounded minutes, when one recorded it", () => {
    // 5 km logged as 20 min but recorded as 19:41 → 3:56 /km, not 4:00 /km.
    const measured = [effort("m1", "Tempo", "running", 1, 5, 20, { durationSec: 1181 })];
    const m = sportPageModel("Running", measured, { now: NOW });
    expect(m.recent[0]!.secPerKm).toBe(Math.round(1181 / 5));
    expect(m.recent[0]!.provider).toBe("apple");
  });

  it("takes the WEEK's pace from the watch's seconds too, so the trend agrees with the effort", () => {
    // Two measured weeks, each a single effort: 19:41 and 39:20 for 5 and
    // 10 km. Off the typed minutes the weeks read 240 and 234 s/km; off the
    // watch they are 236 and 236 — the same figures the effort rows print.
    const measured = [
      effort("w1", "Tempo", "running", 2, 5, 20, { durationSec: 1181 }),
      effort("w2", "Tempo", "running", 9, 10, 39, { durationSec: 2360 }),
    ];
    const m = sportPageModel("Running", measured, { now: NOW, weeks: 2 });
    expect(m.pace!.trend).toEqual([236, 236]);
  });
});

describe("sportPageModel — the page configures itself from the catalog", () => {
  it("gives a paced sport its pace, its split and its distance cells", () => {
    const m = sportPageModel("Running", RUNS, { now: NOW });
    expect(m.hasDistance && m.hasPace).toBe(true);
    expect(m.distanceUnit).toBe("km");
    expect(m.paceUnit).toBe("/km");
    expect(m.pace).not.toBeNull();
    expect(m.totals.map((t) => t.id)).toEqual(["efforts", "distance", "hours", "week"]);
    expect(m.bests.map((b) => b.id)).toContain("fastest");
    expect(m.bests.map((b) => b.id)).toContain("longest");
  });

  it("gives a TIMED sport no pace, no distance and no invented metric", () => {
    const m = sportPageModel("Tennis", MIXED, { now: NOW });
    expect(m.hasDistance).toBe(false);
    expect(m.hasPace).toBe(false);
    expect(m.pace).toBeNull();
    expect(m.split).toBeNull();
    expect(m.totals.map((t) => t.id)).toEqual(["efforts", "hours", "week"]);
    expect(m.bests.map((b) => b.id)).not.toContain("fastest");
    expect(m.bests.map((b) => b.id)).toContain("longestSession");
    // Duration is the truth it does have, so the one figure falls back to it.
    expect(m.primary.kind).toBe("time");
  });

  it("reads a pool sport in METRES at a per-hundred pace", () => {
    const swims = [effort("s1", "Threshold set", "swimming", 2, 2.4, 45)];
    const m = sportPageModel("Swimming", swims, { now: NOW });
    expect(m.distanceUnit).toBe("m");
    expect(m.paceUnit).toBe("/100m");
    expect(m.totals.find((t) => t.id === "distance")!.value).toBe("2\u2009400");
  });

  it("has no transfer section for the 58 sports with no pool", () => {
    expect(sportPageModel("Tennis", MIXED, { now: NOW }).transfer).toBeNull();
    expect(sportPageModel("Tennis", MIXED, { now: NOW }).pool).toEqual([]);
  });

  it("prescribes the transfer work for a sport that has one, and re-doses by level", () => {
    const beginner = sportPageModel("Swimming", [], { now: NOW, levelIdx: 0 });
    const elite = sportPageModel("Swimming", [], { now: NOW, levelIdx: 3 });
    expect(beginner.transfer!.setScheme).toBe("3×8");
    expect(elite.transfer!.setScheme).toBe("5×3");
    // The pool gates on level rather than hiding — a locked entry names its rung.
    expect(beginner.pool.find((e) => e.name === "Pull-up")!.locked).toBe(true);
    expect(beginner.pool.find((e) => e.name === "Pull-up")!.unlocksAt).toBe("Intermediate");
    expect(elite.pool.every((e) => !e.locked)).toBe(true);
  });

  it("states the week's own measure — distance for a measured sport, minutes for a timed one", () => {
    expect(sportPageModel("Running", RUNS, { now: NOW }).weeks).toHaveLength(8);
    expect(sportPageModel("Running", RUNS, { now: NOW }).weeks.at(-1)!.value).toBe(26); // 18 + 8 km
    expect(sportPageModel("Tennis", MIXED, { now: NOW }).weeks.at(-1)!.value).toBe(75); // minutes
  });

  it("caps the recent list and orders it newest first", () => {
    const m = sportPageModel("Running", RUNS, { now: NOW });
    expect(m.recent).toHaveLength(SPORT_PAGE_RECENT);
    expect(m.recent[0]!.name).toBe("Long run");
  });

  it("is empty-safe — a sport with nothing logged still renders a page", () => {
    const m = sportPageModel("Swimming", [], { now: NOW });
    expect(m.empty).toBe(true);
    expect(m.pace).toBeNull();
    expect(m.bests).toEqual([]);
    expect(m.primary.kind).toBe("time");
    expect(m.meta.efforts).toBe(0);
  });

  it("never marks an AGGREGATE as measured — a week has no single recording behind it", () => {
    const measured = [effort("m1", "Tempo", "running", 1, 5, 20, { durationSec: 1181 })];
    const m = sportPageModel("Running", measured, { now: NOW });
    expect(m.bests.find((b) => b.id === "fastest")!.provider).toBe("apple");
    expect(m.bests.find((b) => b.id === "biggestWeek")!.provider).toBeNull();
    expect(m.bests.find((b) => b.id === "biggestWeek")!.sessionId).toBeNull();
  });
});

describe("the marker — typed, so a trend needs a kept history", () => {
  it("parses a clock and a bare number, and knows which way is better", () => {
    expect(markerNumber("24:30")).toBe(1470);
    expect(markerNumber("1:25")).toBe(85);
    expect(markerNumber("240")).toBe(240);
    expect(markerNumber("nonsense")).toBeNull();
    expect(markerBetter("24:30")).toBe("lower");
    expect(markerBetter("240")).toBe("higher");
  });

  it("shows the figure with NO trend until a second entry exists", () => {
    const one = sportPageModel("Running", RUNS, {
      now: NOW,
      markers: [{ value: "25:42", at: new Date(NOW - 60 * DAY).toISOString() }],
    });
    expect(one.primary.kind).toBe("marker");
    expect(one.primary.value).toBe("25:42");
    expect(one.primary.label).toBe("Current 5k time");
    expect(one.primary.delta).toBeNull();
    expect(one.primary.trend).toEqual([]);
  });

  it("reads a faster clock as an improvement and a bigger wattage as one too", () => {
    const run = sportPageModel("Running", RUNS, {
      now: NOW,
      markers: [
        { value: "25:42", at: new Date(NOW - 60 * DAY).toISOString() },
        { value: "24:30", at: new Date(NOW - 2 * DAY).toISOString() },
      ],
    });
    expect(run.primary.delta).toBe("−1:12");
    expect(run.primary.improving).toBe(true);
    expect(run.primary.trend).toEqual([1542, 1470]);

    const bike = sportPageModel("Cycling", [], {
      now: NOW,
      markers: [
        { value: "228", at: new Date(NOW - 60 * DAY).toISOString() },
        { value: "240", at: new Date(NOW - DAY).toISOString() },
      ],
    });
    expect(bike.primary.delta).toBe("+12");
    expect(bike.primary.improving).toBe(true);
  });

  it("falls back to the best pace when the sport has a marker slot but no entry", () => {
    const m = sportPageModel("Running", RUNS, { now: NOW });
    expect(m.primary.kind).toBe("pace");
    expect(m.markerPrompt!.label).toBe("Current 5k time");
  });
});

describe("formatting stays in the sport's own unit", () => {
  it("renders distance in metres for the pool and kilometres for the road", () => {
    expect(sportDistance(2.4, "m")).toBe("2\u2009400");
    expect(sportDistance(74.2, "m")).toBe("74\u2009200");
    expect(sportDistance(8.25, "km")).toBe("8.25");
    expect(sportDistance(812.4, "km")).toBe("812");
  });

  it("renders pace at the sport's own split", () => {
    expect(sportPace(312, 1000)).toBe("5:12");
    // 1120 s/km over 100 m is 1:52 /100m — the swim's split, not the road's.
    expect(sportPace(1120, 100)).toBe("1:52");
    expect(sportPaceUnit(500)).toBe("/500m");
    expect(sportPageModel("Rowing", [], { now: NOW }).paceUnit).toBe("/500m");
  });
});

describe("the index — which sports get a page", () => {
  it("names the SPORT, not the move: a Long run is Running", () => {
    const { yours } = sportIndex(MIXED);
    expect(yours.map((e) => e.name)).toEqual(["Running", "Tennis", "Swimming", "Squash"]);
    expect(yours[0]!.efforts).toBe(4);
    expect(yours[0]!.hasTransfer).toBe(true);
  });

  it("offers the prescribable sports the athlete has not logged, without repeating one", () => {
    const { yours, prescribable } = sportIndex(MIXED);
    const logged = new Set(yours.map((e) => e.name));
    expect(prescribable.every((e) => !logged.has(e.name))).toBe(true);
    expect(prescribable.every((e) => e.hasTransfer)).toBe(true);
    expect(prescribable.map((e) => e.name)).not.toContain("Running");
  });

  it("reaches the whole catalog by search, so every sport has an address", () => {
    expect(searchSports("").length).toBeGreaterThan(60);
    expect(searchSports("fenc").map((e) => e.name)).toContain("Fencing");
    expect(searchSports("aquatics").map((e) => e.name)).toContain("Diving");
    expect(searchSports("zzzz")).toEqual([]);
  });
});

describe("the marker store — shared by both clients", () => {
  it("keeps a history, and re-typing the same value adds no point", () => {
    let store = recordMarker(null, "Running", "25:42", "2026-05-01T00:00:00.000Z");
    store = recordMarker(store, "Running", "24:30", "2026-07-29T00:00:00.000Z");
    store = recordMarker(store, "Running", "24:30", "2026-07-30T00:00:00.000Z");
    expect(markerHistory(store, "Running").map((m) => m.value)).toEqual(["25:42", "24:30"]);
    expect(store.markers!["Running"]).toBe("24:30");
  });

  it("reads a marker typed before the log existed, so nobody loses their figure", () => {
    expect(markerHistory({ markers: { Cycling: "240" } }, "Cycling")).toEqual([{ value: "240", at: "" }]);
    expect(markerHistory({}, "Cycling")).toEqual([]);
  });

  it("clearing a marker removes both the value and its history", () => {
    const store = recordMarker(recordMarker(null, "Running", "24:30", "x"), "Running", "  ", "y");
    expect(markerHistory(store, "Running")).toEqual([]);
    expect(store.markers!["Running"]).toBeUndefined();
  });
});

describe("an index row says something useful about a sport with no efforts", () => {
  it("names the category, unless the sport IS its category", () => {
    const by = (n: string) => searchSports(n).find((e) => e.name === n)!;
    expect(sportIndexMeta(by("Boxing"))).toBe("Combat");
    // "Cycling — Cycling" reads as a bug, so it falls back to the S&C family.
    expect(sportIndexMeta(by("Cycling"))).toBe("Endurance");
  });
});

describe("a sport has an address", () => {
  it("slugs a display name down to what a URL can carry", () => {
    expect(sportSlug("Running")).toBe("running");
    expect(sportSlug("Open Water Swimming")).toBe("open-water-swimming");
    expect(sportSlug("Track & Field")).toBe("track-and-field");
    expect(sportSlug("Table Tennis")).toBe("table-tennis");
  });

  it("every catalog sport slugs to something unique — no two share an address", () => {
    const slugs = searchSports("").map((e) => sportSlug(e.name));
    expect(slugs.every((s) => /^[a-z0-9-]+$/.test(s))).toBe(true);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("resolves either form back to the catalog, and refuses to guess", () => {
    expect(sportFromSlug("open-water-swimming")).toBe("Open Water Swimming");
    expect(sportFromSlug("Swimming")).toBe("Swimming");
    expect(sportFromSlug("track-and-field")).toBe("Track & Field");
    expect(sportFromSlug("not-a-sport")).toBeNull();
    expect(sportFromSlug("")).toBeNull();
    expect(sportFromSlug(undefined)).toBeNull();
  });
});

describe("a discipline names the sport it IS", () => {
  it("maps each endurance discipline to its catalog sport", () => {
    expect(sportForDiscipline("running")).toBe("Running");
    expect(sportForDiscipline("swimming")).toBe("Swimming");
    expect(sportForDiscipline("rowing")).toBe("Rowing");
  });

  it("does not file a cross-country ski under Skateboarding", () => {
    // cardioDiscipline's skiing pattern matches "skate", so scanning the
    // catalog in order picked the wrong sport. The map is explicit for this.
    expect(sportForDiscipline("skiing")).toBe("Cross-Country Skiing");
  });

  it("leaves a discipline with no honest catalog sport unmapped", () => {
    // The only walking sport in the catalog is Race Walking, a track event —
    // filing somebody's hike under it would be a lie a link then repeats.
    expect(sportForDiscipline("walking")).toBeNull();
    expect(sportForDiscipline("other")).toBeNull();
  });

  it("indexes a logged ski as skiing, not as skateboarding", () => {
    const ski: LoggedSession[] = [
      { id: "k1", title: "Ski", startedAt: new Date(NOW - DAY).toISOString(),
        blocks: [{ kind: "cardio", name: "Ski tour", discipline: "skiing", distance: 22, minutes: 140 }] } as LoggedSession,
    ];
    expect(sportIndex(ski).yours.map((e) => e.name)).toEqual(["Cross-Country Skiing"]);
  });
});

describe("the cover art is a drawn mark, not an emoji", () => {
  it("gives every catalog sport a mark", () => {
    const missing = searchSports("").filter((e) => !sportMark(e.name));
    expect(missing.map((e) => e.name)).toEqual([]);
  });

  it("draws the sport's own instrument where it has one, its category's otherwise", () => {
    expect(sportMark("Rowing")).toBe("oar");
    expect(sportMark("Canoe Sprint")).toBe("oar");
    expect(sportMark("Swimming")).toBe("water");
    // Tennis and Squash are the same drawing on purpose — there are not 65
    // distinctive silhouettes, and the title already says which sport it is.
    expect(sportMark("Tennis")).toBe(sportMark("Squash"));
  });

  it("has no mark for a name the catalog does not hold, so the caller can fall back", () => {
    expect(sportMark("Underwater Basket Weaving")).toBeNull();
    expect(sportMarkPaths("Underwater Basket Weaving")).toEqual([]);
  });

  it("draws every closed shape with two arcs — a self-returning arc renders nothing", () => {
    // The first cut used "A24 24 0 1 0 36 12.01Z" for a circle; two of the
    // marks came out empty and it took a screenshot to notice.
    for (const [name, paths] of Object.entries(SPORT_MARK_PATHS)) {
      for (const d of paths) {
        const arcs = d.match(/A[\d. ]+/g) ?? [];
        const closed = d.trim().endsWith("Z");
        // A closed path whose ONLY curve is a single arc is the degenerate case.
        expect(!(closed && arcs.length === 1 && !/[LHVC]/.test(d)), `${name}: ${d}`).toBe(true);
      }
    }
  });
});
