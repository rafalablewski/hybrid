import { describe, it, expect } from "vitest";
import { sessionPanels, PANEL_MUSCLE_ROWS } from "./session-panels";
import type { LoggedSession, SessionBlock } from "./engines/session";

const session = (id: string, startedAt: string, blocks: SessionBlock[]): LoggedSession => ({
  id,
  title: "Session",
  startedAt,
  completedAt: new Date(Date.parse(startedAt) + 60 * 60000).toISOString(),
  blocks,
});

const bench = (n: number, load: string): SessionBlock => ({
  kind: "strength",
  name: "Bench Press",
  sets: Array.from({ length: n }, () => ({ load, reps: "8" })),
});

const pushDay = (id: string, startedAt: string, load = "70") =>
  session(id, startedAt, [
    bench(4, load),
    { kind: "strength", name: "Overhead Press", sets: [{ load: "40", reps: "8" }, { load: "40", reps: "8" }] },
    { kind: "strength", name: "Triceps Pushdown", sets: [{ load: "35", reps: "12" }] },
  ]);

const swim = (id: string, startedAt: string) =>
  session(id, startedAt, [{ kind: "cardio", name: "Swimming", minutes: 35, distance: 1.5 }]);

const kinds = (s: LoggedSession, all: LoggedSession[]) =>
  sessionPanels(s, all, { units: "kg" }).map((p) => p.kind);

describe("sessionPanels", () => {
  it("deals a gym session its overview, and a swim none", () => {
    const lift = pushDay("a", "2026-08-18T18:00:00.000Z");
    const pool = swim("b", "2026-08-18T18:00:00.000Z");
    // The bug this manifest exists to make impossible: the finish screen dealt
    // an overview card unconditionally, so a 1 500 m swim shared as "1 SET, 0.0 t".
    expect(kinds(lift, [lift])).toContain("overview");
    expect(kinds(pool, [pool])).not.toContain("overview");
  });

  it("leads with the record when there is one, and only then", () => {
    const first = pushDay("a", "2026-08-01T18:00:00.000Z", "60");
    const heavier = pushDay("b", "2026-08-18T18:00:00.000Z", "80");
    // The first ever session on a lift is itself a record.
    expect(kinds(first, [first])[0]).toBe("trophy");
    expect(kinds(heavier, [first, heavier])[0]).toBe("trophy");
    // A repeat of the same work sets nothing.
    const repeat = pushDay("c", "2026-08-20T18:00:00.000Z", "80");
    expect(kinds(repeat, [first, heavier, repeat])).not.toContain("trophy");
  });

  it("carries ONE headline figure, in the discipline's own unit", () => {
    const pool = swim("b", "2026-08-18T18:00:00.000Z");
    const stat = sessionPanels(pool, [pool], { units: "kg" }).find((p) => p.kind === "stat");
    // Never "0.0 t" for a swim, and never a second stat panel for time — the
    // review dealt the headline while the finish screen dealt tonnage + minutes.
    expect(stat).toBeDefined();
    expect(stat?.kind === "stat" && stat.value).toBe("1500 m");
    expect(sessionPanels(pool, [pool], { units: "kg" }).filter((p) => p.kind === "stat")).toHaveLength(1);
  });

  it("splits the muscle panel by the FINE vocabulary, not the seven buckets", () => {
    const lift = pushDay("a", "2026-08-18T18:00:00.000Z");
    const panel = sessionPanels(lift, [lift], { units: "kg" }).find((p) => p.kind === "muscle");
    expect(panel?.kind === "muscle" && panel.bars.map((b) => b.muscle)).toEqual(
      expect.arrayContaining(["chest", "triceps", "front-delts", "side-delts"]),
    );
    // The top mover fills the bar; everything else is a share of it.
    expect(panel?.kind === "muscle" && panel.bars[0]?.pct).toBe(100);
    expect(panel?.kind === "muscle" && panel.bars.length).toBeLessThanOrEqual(PANEL_MUSCLE_ROWS);
  });

  it("has no muscle panel for a session with no mapped lifting", () => {
    const pool = swim("b", "2026-08-18T18:00:00.000Z");
    expect(kinds(pool, [pool])).not.toContain("muscle");
  });

  it("holds the panels in one order, whichever screen is asking", () => {
    const lift = pushDay("a", "2026-08-18T18:00:00.000Z");
    const order = kinds(lift, [lift]);
    // Records first, the shape, the gym card, the figure, the bests, the body.
    expect(order.indexOf("trophy")).toBeLessThan(order.indexOf("overview"));
    expect(order.indexOf("overview")).toBeLessThan(order.indexOf("stat"));
    expect(order.indexOf("stat")).toBeLessThan(order.indexOf("prs"));
    expect(order.indexOf("prs")).toBeLessThan(order.indexOf("muscle"));
    // And it is a pure function of the session: the finish screen and the
    // review cannot be handed different decks.
    expect(sessionPanels(lift, [lift], { units: "kg" })).toEqual(
      sessionPanels(lift, [lift], { units: "kg" }),
    );
  });

  it("counts a bodyweight lift at the athlete's weight when splitting the body", () => {
    const s = session("a", "2026-08-18T18:00:00.000Z", [
      { kind: "strength", name: "Pull-Up", sets: [{ load: "0", reps: "10" }] },
    ]);
    expect(sessionPanels(s, [s], { units: "kg" }).some((p) => p.kind === "muscle")).toBe(false);
    const weighed = sessionPanels(s, [s], { units: "kg", bw: 82 }).find((p) => p.kind === "muscle");
    expect(weighed?.kind === "muscle" && weighed.bars[0]?.muscle).toBe("lats");
  });
});
