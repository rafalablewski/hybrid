import { describe, it, expect } from "vitest";
import { otherSportLanes, otherSportReading, sportWeekBars, otherSportTotals, OTHER_SPORT_WEEKS } from "./other-sports";
import type { LoggedSession, SessionBlock } from "./engines/session";
import { sportMark } from "./theme/sport-marks";

const NOW = Date.parse("2026-07-31T12:00:00.000Z");
const DAY = 86_400_000;

/** A session `daysAgo` back carrying one cardio block. */
function sess(daysAgo: number, name: string, minutes: number, discipline?: string): LoggedSession {
  const started = NOW - daysAgo * DAY;
  const block = { kind: "cardio", name, minutes, ...(discipline ? { discipline } : {}) } as unknown as SessionBlock;
  return {
    id: `${name}-${daysAgo}`,
    title: name,
    startedAt: new Date(started).toISOString(),
    completedAt: new Date(started + minutes * 60000).toISOString(),
    blocks: [block],
  } as LoggedSession;
}

describe("otherSportLanes", () => {
  it("is empty when nothing but endurance is logged", () => {
    const runs = [sess(1, "Run", 40, "running"), sess(3, "Swim", 30, "swimming")];
    expect(otherSportLanes(runs, NOW)).toEqual([]);
  });

  it("gives every sport its OWN lane rather than one lane called Sport", () => {
    // The whole point: these all carry discipline "sport", so grouping by the
    // tag would flatten them into a single lane.
    const lanes = otherSportLanes([
      sess(1, "Tennis", 90, "sport"),
      sess(4, "Squash", 45, "sport"),
      sess(6, "Badminton", 60, "sport"),
    ], NOW);
    expect(lanes.map((l) => l.sport).sort()).toEqual(["Badminton", "Squash", "Tennis"]);
  });

  it("carries the catalog's category, and no glyph of its own", () => {
    const [tennis] = otherSportLanes([sess(1, "Tennis", 90, "sport")], NOW);
    expect(tennis!.category).toBe("Racket");
    // The lane names the SPORT; the drawing is resolved from that name.
    expect(sportMark(tennis!.sport)).toBe("racket");
    expect(tennis).not.toHaveProperty("icon");
  });

  it("keeps an uncatalogued sport, with no category and no drawing", () => {
    const [made] = otherSportLanes([sess(1, "Kabaddi", 50, "sport")], NOW);
    expect(made!.sport).toBe("Kabaddi");
    expect(made!.category).toBeNull();
    expect(sportMark(made!.sport)).toBeNull();
  });

  it("sums efforts and minutes, and remembers the most recent effort", () => {
    const lanes = otherSportLanes([
      sess(2, "Tennis", 90, "sport"),
      sess(9, "Tennis", 60, "sport"),
      sess(20, "Tennis", 75, "sport"),
    ], NOW);
    expect(lanes[0]!.efforts).toBe(3);
    expect(lanes[0]!.minutes).toBe(225);
    expect(lanes[0]!.lastAt).toBe(new Date(NOW - 2 * DAY).toISOString());
  });

  it("orders by efforts, breaking ties on RECENCY", () => {
    // Two sports, two efforts each — squash was played more recently.
    const lanes = otherSportLanes([
      sess(10, "Tennis", 60, "sport"), sess(30, "Tennis", 60, "sport"),
      sess(2, "Squash", 45, "sport"), sess(31, "Squash", 45, "sport"),
    ], NOW);
    expect(lanes.map((l) => l.sport)).toEqual(["Squash", "Tennis"]);
  });

  it("counts this week separately from the whole history", () => {
    const lanes = otherSportLanes([
      sess(2, "Tennis", 90, "sport"),   // this week
      sess(40, "Tennis", 60, "sport"),  // long ago
    ], NOW);
    expect(lanes[0]!.efforts).toBe(2);
    expect(lanes[0]!.thisWeek).toEqual({ efforts: 1, minutes: 90 });
  });

  it("buckets the last eight weeks oldest-first and drops older history from the chart only", () => {
    const lanes = otherSportLanes([
      sess(2, "Tennis", 90, "sport"),    // week index 7 (newest)
      sess(16, "Tennis", 60, "sport"),   // 2 weeks ago → index 5
      sess(400, "Tennis", 30, "sport"),  // far outside the window
    ], NOW);
    const w = lanes[0]!.weeks;
    expect(w).toHaveLength(OTHER_SPORT_WEEKS);
    expect(w[7]).toBe(90);
    expect(w[5]).toBe(60);
    expect(w.reduce((a, b) => a + b, 0)).toBe(150);
    // The old session still counts in the totals — it just isn't charted.
    expect(lanes[0]!.efforts).toBe(3);
    expect(lanes[0]!.minutes).toBe(180);
  });

  it("classifies from the NAME when the block carries no discipline tag", () => {
    // Blocks logged before the loggers stamped a discipline still land here.
    const lanes = otherSportLanes([sess(1, "Tennis", 90)], NOW);
    expect(lanes.map((l) => l.sport)).toEqual(["Tennis"]);
  });

  it("ignores strength blocks entirely", () => {
    const lift = {
      id: "l", title: "Push", startedAt: new Date(NOW - DAY).toISOString(), completedAt: null,
      blocks: [{ kind: "strength", name: "Bench Press", sets: [{ load: 80, reps: 5 }] } as unknown as SessionBlock],
    } as LoggedSession;
    expect(otherSportLanes([lift], NOW)).toEqual([]);
  });

  it("tolerates a sport logged with no duration", () => {
    const lanes = otherSportLanes([sess(1, "Squash", 0, "sport")], NOW);
    expect(lanes[0]!.efforts).toBe(1);
    expect(lanes[0]!.minutes).toBe(0);
  });
});

describe("sportWeekBars", () => {
  it("normalises against the lane's own busiest week", () => {
    expect(sportWeekBars([0, 30, 60, 0])).toEqual([0, 0.5, 1, 0]);
  });

  it("is all-zero rather than NaN for a lane with no charted minutes", () => {
    expect(sportWeekBars([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("otherSportTotals", () => {
  it("sums the block so the head doesn't make the athlete add up tiles", () => {
    const lanes = otherSportLanes([
      sess(1, "Tennis", 90, "sport"),
      sess(3, "Squash", 45, "sport"),
      sess(5, "Squash", 45, "sport"),
    ], NOW);
    expect(otherSportTotals(lanes)).toEqual({ sports: 2, efforts: 3, minutes: 180 });
  });

  it("is zero for no lanes", () => {
    expect(otherSportTotals([])).toEqual({ sports: 0, efforts: 0, minutes: 0 });
  });
});

describe("holding a tile's frequency strip", () => {
  const lanes = otherSportLanes(
    [sess(2, "Tennis", 90, "sport"), sess(9, "Tennis", 60, "sport"), sess(11, "Tennis", 45, "sport")],
    NOW,
  );
  const tennis = lanes[0]!;

  it("dates every bucket, aligned with the bars it draws", () => {
    expect(tennis.weekStarts).toHaveLength(OTHER_SPORT_WEEKS);
    expect(tennis.weekStarts).toHaveLength(tennis.weeks.length);
    // The newest bucket starts a week ago; the oldest, eight.
    expect(Date.parse(tennis.weekStarts.at(-1)!)).toBe(NOW - 7 * DAY);
    expect(Date.parse(tennis.weekStarts[0]!)).toBe(NOW - 8 * 7 * DAY);
    // …and each start really does precede the efforts bucketed into it.
    expect(Date.parse(tennis.weekStarts.at(-1)!)).toBeLessThan(NOW - 2 * DAY);
  });

  it("reads a held bar in the measure the strip actually draws — a duration", () => {
    const held = otherSportReading(tennis, tennis.weeks.length - 1)!;
    // Hours AND minutes, carrying their own units, so the readout adds none.
    expect(held.value).toBe("1h 30min");
    expect(held.unit).toBe("");
    expect(held.weekStart).toBe(tennis.weekStarts.at(-1));
    // NOT the best: the 60 + 45 sessions land in one older bucket, 105 minutes.
    expect(held.best).toBe(false);
    expect(otherSportReading(tennis, tennis.weeks.length - 2)!.value).toBe("1h 45min");
    // The buckets count minutes, so the reading claims no effort count.
    expect(held.efforts).toBeNull();
  });

  it("marks the busiest week, and never marks an empty one", () => {
    const busiest = tennis.weeks.indexOf(Math.max(...tennis.weeks));
    expect(otherSportReading(tennis, busiest)!.best).toBe(true);
    const empty = tennis.weeks.findIndex((m) => m === 0);
    expect(otherSportReading(tennis, empty)!.best).toBe(false);
    expect(otherSportReading(tennis, empty)!.value).toBe("0min");
  });

  it("returns nothing off either end of the series", () => {
    expect(otherSportReading(tennis, -1)).toBeNull();
    expect(otherSportReading(tennis, OTHER_SPORT_WEEKS)).toBeNull();
  });
});
