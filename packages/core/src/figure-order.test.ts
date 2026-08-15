import { describe, it, expect } from "vitest";
import { FIGURE_ORDER, figureRank, orderFigures } from "./figure-order";
import { ACTIVITY_METRICS } from "./activity-window";

describe("the figure reading order", () => {
  it("extends ACTIVITY_METRICS rather than competing with it", () => {
    // The four totals keep their relative order; everything else is inserted
    // around them. If this fails, the Progress card and the rest of the app
    // have started disagreeing again, which is the whole thing this prevents.
    const four = ACTIVITY_METRICS.map((m) => figureRank(m));
    expect(four).toEqual([...four].sort((a, b) => a - b));
  });

  it("puts each figure beside the total it is a facet of", () => {
    const before = (a: string, b: string) => expect(figureRank(a)).toBeLessThan(figureRank(b));
    // Sets and reps are the grain of tonnage, so they sit with it — ahead of
    // the session count, not after the distance.
    before("tonnage", "sets");
    before("sets", "reps");
    before("reps", "sessions");
    // Active days and the streak are the session count over time.
    before("sessions", "activeDays");
    before("activeDays", "streak");
    before("streak", "hours");
    // Pace and climb are facts about the ground the distance covered.
    before("distance", "pace");
    before("pace", "elevation");
    // What it cost, then what came out of it.
    before("elevation", "kcal");
    before("kcal", "hr");
    before("hr", "prs");
  });

  it("ranks the names the same figure already travels under", () => {
    for (const [alias, canonical] of [
      ["volume", "tonnage"],
      ["duration", "hours"],
      ["minutes", "hours"],
      ["efforts", "sessions"],
      ["km", "distance"],
      ["climb", "elevation"],
      ["energy", "kcal"],
    ] as const) {
      expect(figureRank(alias), `${alias} should rank as ${canonical}`).toBe(figureRank(canonical));
    }
  });

  it("sends an unknown figure to the end instead of throwing", () => {
    expect(figureRank("strokes")).toBe(FIGURE_ORDER.length);
    const out = orderFigures([{ k: "strokes" }, { k: "tonnage" }], (x) => x.k);
    expect(out.map((x) => x.k)).toEqual(["tonnage", "strokes"]);
  });

  it("is stable, so two unranked figures keep the order they were built in", () => {
    const out = orderFigures([{ k: "strokes" }, { k: "shots" }, { k: "hours" }], (x) => x.k);
    expect(out.map((x) => x.k)).toEqual(["hours", "strokes", "shots"]);
  });

  it("orders a row without changing which figures are in it", () => {
    const row = [{ k: "pace" }, { k: "sets" }, { k: "duration" }, { k: "volume" }];
    const out = orderFigures(row, (x) => x.k);
    expect(out.map((x) => x.k)).toEqual(["volume", "sets", "duration", "pace"]);
    expect(out).toHaveLength(row.length);
  });
});
