import { describe, expect, it } from "vitest";
import {
  TODAY_RAIL_BAR_H,
  TODAY_RAIL_HYSTERESIS,
  TODAY_RAIL_MAX,
  TODAY_RAIL_MOTION,
  TODAY_RAIL_MOTION_REDUCED,
  TODAY_RAIL_ORDER,
  railCurve,
  railMotion,
  todayDoneIsAccented,
  todayDoneState,
  todayRailState,
  type TodayRailSource,
} from "./today-rail";

// Bottoms roughly matching the real Today page: the week strip inside the
// logbook card, the result block under it, then the check-in further down.
const SOURCES: TodayRailSource[] = [
  { key: "date", bottom: 240 },
  { key: "done", bottom: 400 },
  { key: "ready", bottom: 700 },
];

describe("todayRailState", () => {
  it("pins nothing while the masthead is still on screen", () => {
    const s = todayRailState(SOURCES, 0);
    expect(s.captured).toEqual([]);
    expect(s.pinned).toBe(false);
    expect(s.tight).toBe(false);
  });

  it("captures a pill once its source's bottom edge passes under the bar", () => {
    // one pixel short of the threshold, then exactly on it
    expect(todayRailState(SOURCES, 240 - TODAY_RAIL_BAR_H - 1).captured).toEqual([]);
    expect(todayRailState(SOURCES, 240 - TODAY_RAIL_BAR_H).captured).toEqual(["date"]);
  });

  it("accretes in scroll order and never reshuffles", () => {
    expect(todayRailState(SOURCES, 200).captured).toEqual(["date"]);
    expect(todayRailState(SOURCES, 360).captured).toEqual(["date", "done"]);
    expect(todayRailState(SOURCES, 660).captured).toEqual(["date", "done", "ready"]);
  });

  it("contracts only at the ceiling", () => {
    expect(todayRailState(SOURCES, 360).tight).toBe(false);
    const full = todayRailState(SOURCES, 660);
    expect(full.tight).toBe(true);
    expect(full.captured).toHaveLength(TODAY_RAIL_MAX);
  });

  it("retracts in reverse on the way back up", () => {
    const down = todayRailState(SOURCES, 660);
    expect(down.captured).toEqual(["date", "done", "ready"]);
    expect(todayRailState(SOURCES, 360, { prev: down.captured }).captured).toEqual(["date", "done"]);
    expect(todayRailState(SOURCES, 200, { prev: ["date", "done"] }).captured).toEqual(["date"]);
    expect(todayRailState(SOURCES, 0, { prev: ["date"] }).captured).toEqual([]);
  });

  it("releases later than it captures, so a pill cannot strobe on the threshold", () => {
    const edge = 240 - TODAY_RAIL_BAR_H;
    // held: still captured just below the capture point…
    expect(todayRailState(SOURCES, edge - 1, { prev: ["date"] }).captured).toEqual(["date"]);
    // …but gone once past the release margin.
    expect(todayRailState(SOURCES, edge - TODAY_RAIL_HYSTERESIS - 1, { prev: ["date"] }).captured).toEqual([]);
  });

  it("skips a pill whose source card is not on the page", () => {
    const noCheckin: TodayRailSource[] = [
      { key: "date", bottom: 240 },
      { key: "done", bottom: 400 },
      { key: "ready", bottom: null },
    ];
    const s = todayRailState(noCheckin, 9999);
    expect(s.captured).toEqual(["date", "done"]);
    expect(s.tight).toBe(false);
  });

  it("ignores sources that have not been measured yet", () => {
    expect(todayRailState([{ key: "date", bottom: Number.NaN }], 9999).captured).toEqual([]);
  });

  it("keeps the captured list in canonical order regardless of source order", () => {
    const shuffled = [...SOURCES].reverse();
    expect(todayRailState(shuffled, 9999).captured).toEqual([...TODAY_RAIL_ORDER]);
  });
});

describe("todayDoneState", () => {
  it("reads done the moment anything is logged, plan or no plan", () => {
    expect(todayDoneState({ loggedToday: true })).toBe("done");
    expect(todayDoneState({ loggedToday: true, planStatus: "rest" })).toBe("done");
  });

  it("gives the plan-less athlete an honest binary", () => {
    expect(todayDoneState({ loggedToday: false })).toBe("none");
    expect(todayDoneState({ loggedToday: false, planStatus: null })).toBe("none");
  });

  it("reads the plan's own verdict when one is enrolled", () => {
    expect(todayDoneState({ loggedToday: false, planStatus: "today" })).toBe("left");
    expect(todayDoneState({ loggedToday: false, planStatus: "missed" })).toBe("left");
    expect(todayDoneState({ loggedToday: false, planStatus: "rest" })).toBe("rest");
  });

  it("accents only a finished day", () => {
    expect(todayDoneIsAccented("done")).toBe(true);
    for (const s of ["left", "rest", "none"] as const) expect(todayDoneIsAccented(s)).toBe(false);
  });
});

describe("rail motion", () => {
  it("moves everything out faster than it moves anything in", () => {
    expect(TODAY_RAIL_MOTION.retract.ms).toBeLessThan(TODAY_RAIL_MOTION.bloom.ms);
  });

  it("gives every arrival the same overshoot voice", () => {
    expect(TODAY_RAIL_MOTION.bloom.bezier).toEqual(TODAY_RAIL_MOTION.rerate.bezier);
    expect(TODAY_RAIL_MOTION.bloom.bezier[1]).toBeGreaterThan(1); // overshoots
  });

  it("never overshoots the contraction — a bouncing date reads as a glitch", () => {
    expect(TODAY_RAIL_MOTION.contract.bezier[1]).toBeLessThanOrEqual(1);
    expect(TODAY_RAIL_MOTION.contract).toEqual(TODAY_RAIL_MOTION.expand);
  });

  it("collapses to a plain fade under reduced motion", () => {
    expect(railMotion("bloom", true)).toEqual(TODAY_RAIL_MOTION_REDUCED);
    expect(railMotion("bloom", false)).toEqual(TODAY_RAIL_MOTION.bloom);
  });

  it("prints a CSS curve", () => {
    expect(railCurve(TODAY_RAIL_MOTION.pin)).toBe("cubic-bezier(0.2,0.8,0.2,1)");
  });
});
