import { describe, expect, it, vi } from "vitest";
import { addLocalDays, type LoggedSession, type SessionBlock } from "@hybrid/core";
import { renderScreen } from "./render";

/**
 * THE ACTIVITY CARD'S FOUR COLUMNS — Tonnage, Sessions, Hours, Distance, and
 * they do not move.
 *
 * The row used to sort itself with whichever metric the week's sentence was
 * about pulled to the front, so the columns rearranged themselves every time
 * the story changed: tonnage led one week, distance the next, and the figure
 * the athlete was reaching for was never twice in the same place. A row of
 * totals is found by POSITION before it is read at all.
 *
 * So the fixture below is deliberately a DISTANCE week — the one case the old
 * sort acted on — and the assertion is core's `VERDICT_METRICS` order coming
 * out the other side regardless.
 */

vi.mock("../lib/api", () => ({
  fetchFlagState: async () => ({ flags: {}, values: {} }),
  fetchTranslationOverrides: async () => ({}),
}));

/** Local noon `weeks` calendar weeks back — always the same weekday, so each
 *  fixture session lands squarely inside its own Monday-aligned window. */
const noonWeeksAgo = (weeks: number): number => {
  const now = new Date();
  const noonToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).getTime();
  return addLocalDays(noonToday, -7 * weeks);
};

const lift = (weeks: number): LoggedSession => {
  const started = noonWeeksAgo(weeks);
  return {
    id: `lift-${weeks}`,
    title: "Session",
    startedAt: new Date(started).toISOString(),
    completedAt: new Date(started + 60 * 60000).toISOString(),
    blocks: [{ kind: "strength", name: "Deadlift", sets: [{ load: "1000", reps: "1" }] }] as SessionBlock[],
  } as LoggedSession;
};

const run = (weeks: number, km: number): LoggedSession => {
  const started = noonWeeksAgo(weeks);
  return {
    id: `run-${weeks}`,
    title: "Run",
    startedAt: new Date(started).toISOString(),
    completedAt: new Date(started + 30 * 60000).toISOString(),
    blocks: [{ kind: "cardio", name: "Run", discipline: "running", minutes: 30, distance: km }] as SessionBlock[],
  } as LoggedSession;
};

/** Tonnage, session count and time flat across five weeks; distance 5 km a week
 *  and then 25 — so the card's sentence is unambiguously about DISTANCE. */
const sessions: LoggedSession[] = [
  lift(0), run(0, 25),
  lift(1), run(1, 5),
  lift(2), run(2, 5),
  lift(3), run(3, 5),
  lift(4), run(4, 5),
];

const { default: AuroraWeekVerdict } = await import("../components/aurora/week-verdict");

describe("the activity card's figure row", () => {
  it("reads Tonnage → Sessions → Hours → Distance even when distance is the week's story", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={sessions} units="kg" />);
    const text = container.textContent ?? "";

    // The column labels are Capitalised (the lead sentence's metric names are
    // lower case — "distance", "session count"), so these find the columns.
    const at = (label: string) => {
      const i = text.indexOf(label);
      expect(i, `${label} column is missing`).toBeGreaterThan(-1);
      return i;
    };
    expect(at("Tonnage")).toBeLessThan(at("Sessions"));
    expect(at("Sessions")).toBeLessThan(at("Hours"));
    expect(at("Hours")).toBeLessThan(at("Distance"));
  });

  it("gives every column the same value grammar — the figure carries its unit", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={sessions} units="kg" />);
    const text = container.textContent ?? "";

    // Distance used to print bare ("25") under a label that WAS the unit
    // ("KM") — the only one of the four split that way, and unfixable in the
    // label because tonnage's unit is the athlete's (t or lb) and has to
    // travel with the number.
    expect(text).toContain("1.0 t");
    expect(text).toContain("25 km");
  });
});
