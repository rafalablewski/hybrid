import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
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

/**
 * THE BREAKDOWN IS A SHEET, and the thing this pins is that it is not in the
 * CARD.
 *
 * It used to unfold inside the card, under the figure row: groups, a share bar,
 * five session rows and a "show all", several hundred points of it, appearing
 * in the middle of Today and shoving Records, the exercise rail and the whole
 * Endurance cluster off the fold — with no dismissal but pressing the same
 * column again, well off-screen by then. A sheet comes up OVER the screen and
 * moves nothing.
 *
 * So the assertion is a NEGATIVE one on the card's own subtree and a positive
 * one on the document: a breakdown that ever renders back inside `container` is
 * the drawer growing back.
 */
describe("the activity card's breakdown", () => {
  const openTonnage = () => {
    const column = screen
      .getAllByRole("button")
      .find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Tonnage"));
    expect(column, "the Tonnage column is not a button").toBeTruthy();
    fireEvent.click(column!);
  };

  /** Everything rendered OUTSIDE the card — i.e. the sheet, which a Modal
   *  portals to a sibling of the render container rather than into the tree it
   *  was written in. Reading it separately is what makes "not in the card" a
   *  real assertion rather than a spelling of "nowhere". */
  const sheetText = (container: Element, baseElement: Element) =>
    Array.from(baseElement.children)
      .filter((el) => el !== container)
      .map((el) => el.textContent ?? "")
      .join(" ");

  it("stays out of the card until a column is pressed, and then opens over it", () => {
    const { container, baseElement } = renderScreen(<AuroraWeekVerdict sessions={sessions} units="kg" />);

    // At rest: the card is the sentence and the four figures, and there is no
    // sheet at all.
    expect(container.textContent ?? "").not.toContain("Where the tonnage came from");
    expect(sheetText(container, baseElement)).toBe("");

    openTonnage();

    // The panel is in the sheet, and the card is untouched — no drawer, so
    // nothing below it on Today moved.
    expect(sheetText(container, baseElement)).toContain("Where the tonnage came from");
    expect(container.textContent ?? "").not.toContain("Where the tonnage came from");
  });

  it("restates the figure it is decomposing — the column is behind the scrim", () => {
    const { container, baseElement } = renderScreen(<AuroraWeekVerdict sessions={sessions} units="kg" />);
    openTonnage();
    const sheet = sheetText(container, baseElement);

    // The sheet is titled with the column's own label and opens on the total
    // that column printed, through the same formatter — the card it came from
    // is under the scrim by then.
    expect(sheet).toContain("Tonnage");
    expect(sheet).toContain("1.0 t");
  });
});

/**
 * THE PERIOD'S TWO ENDS, MARKED — the row carries the win AND the slip.
 *
 * The colour on this row used to follow the SENTENCE, which is one slot. A week
 * whose training time climbed while its distance collapsed put chartreuse on
 * Hours and left Distance looking exactly like the two columns that did not move
 * — the biggest fact about the week rendered in the styling of "nothing
 * happened". So the fixture below is precisely that week, and the assertion is
 * that BOTH ends are marked: core's `best` on Hours, `worst` on Distance.
 *
 * The a11y label is what it asserts on, because that is the one channel a test
 * can read AND the one an athlete who cannot separate the two hues depends on.
 */
const longLift = (weeks: number): LoggedSession => {
  const started = noonWeeksAgo(weeks);
  return { ...lift(weeks), completedAt: new Date(started + 90 * 60000).toISOString() };
};

/** Time up a third, distance down three quarters, tonnage and count flat. */
const bothEnds: LoggedSession[] = [
  longLift(0), run(0, 1),
  lift(1), run(1, 4),
  lift(2), run(2, 4),
  lift(3), run(3, 4),
  lift(4), run(4, 4),
];

describe("the activity card's marks", () => {
  const labelStarting = (prefix: string) =>
    screen.getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? "")
      .find((l) => l.startsWith(prefix)) ?? "";

  it("marks the riser and the faller at rest, not just the sentence's metric", () => {
    renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);

    expect(labelStarting("Hours")).toContain("biggest rise this period");
    expect(labelStarting("Distance")).toContain("biggest drop this period");
  });

  it("leaves the columns between the ends unmarked", () => {
    renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);

    // A mark on every column is the same as a mark on none.
    for (const prefix of ["Tonnage", "Sessions"]) {
      expect(labelStarting(prefix)).not.toContain("biggest");
    }
  });

  it("prints each end's own move beside it — the working-out for the colour", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    const text = container.textContent ?? "";

    expect(text).toContain("+33%");
    expect(text).toContain("−75%");
  });
});
