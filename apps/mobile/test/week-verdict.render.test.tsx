import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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

/**
 * THE CARD STATES ITS HEADLINE NUMBER ONCE.
 *
 * The lead used to carry the named metric's percentage at 23dp in its corner,
 * and the cell for that same metric carried the identical percentage again
 * below it. Not sometimes: `metric` is by construction one of the two ends, so
 * every marked week printed one number twice, in two sizes, in one hue, on a
 * diagonal — which is what the card looked like when it was reported as
 * unreadable. The cell's copy is the one with more in it (it says WHICH measure
 * moved by sitting on it), so the corner went and the header keeps what the
 * grid cannot say: the sentence, and the axis it was measured from.
 *
 * PAGE ONE ONLY. Page two states every metric's move by design — that is the
 * whole page — so the count is taken on the card's first page, which is what
 * `bothEnds` renders before any swipe.
 */
describe("the card's headline number", () => {
  /** How many times `needle` occurs in `hay`. */
  const times = (hay: string, needle: string) => hay.split(needle).length - 1;

  it("prints the sentence's percentage in ONE place, not in two", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    const page = container.textContent ?? "";

    // "−75%" is distance: the period's worst end AND the metric the sentence
    // names, which is exactly the case the corner figure duplicated. Page two
    // states every move by design and accounts for one of the two occurrences
    // here; a THIRD is the corner growing back.
    expect(times(page, "−75%")).toBe(2);
    // The other end, which the corner never carried, is unchanged: its cell and
    // its comparison row.
    expect(times(page, "+33%")).toBe(2);
  });

  it("keeps the sentence and its axis, which is what the corner never carried", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    const page = (container.textContent ?? "").toLowerCase();

    expect(page).toContain("is down on the week before");
    expect(page).toContain("previous 7 days");
  });
});

/**
 * THE NAMED METRIC'S CELL IS THE ONE DRAWN LARGE.
 *
 * Deleting the corner percentage removed a duplicate and, with it, the only
 * thing on the card readable at arm's length. The size goes where the number
 * already is rather than back into a second copy of it: the cell for the metric
 * the sentence names, drawn a ladder rung up, IN ITS OWN POSITION — so the card
 * keeps one hero figure and the grid keeps its constant order.
 *
 * Both assertions matter. Exactly one cell may be promoted (two heroes is no
 * hero), and it has to be the one the sentence is about (a hero figure on a
 * metric the lead never mentions is the card pointing two ways again).
 */
describe("the promoted cell", () => {
  /** Every figure's font size, keyed by the cell's metric. Scoped to the four
   *  metric names, since the period filter above the card is a row of buttons
   *  too and its segments would otherwise land in the same map. */
  const METRICS = ["Tonnage", "Sessions", "Hours", "Distance"];
  const figureSizes = (container: Element) => {
    const out: Record<string, number> = {};
    for (const cell of container.querySelectorAll('[role="button"]')) {
      const label = (cell.getAttribute("aria-label") ?? "").split(" ")[0] ?? "";
      if (!METRICS.includes(label) || label in out) continue;
      // label / figure / mark — the figure is the second text node down, and
      // the largest, which is what this reads.
      const sizes = [...cell.querySelectorAll("div,span")]
        .map((n) => parseFloat((n as HTMLElement).style.fontSize || "0"))
        .filter((n) => n > 0);
      if (sizes.length) out[label] = Math.max(...sizes);
    }
    return out;
  };

  it("draws the sentence's metric larger, and only that one", () => {
    // `bothEnds` headlines DISTANCE (down 75%, the larger of the two moves).
    const { container } = renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    const sizes = figureSizes(container);

    expect(sizes.Distance).toBeGreaterThan(sizes.Tonnage);
    // The other three hold one size between them — no second hero.
    expect(new Set([sizes.Tonnage, sizes.Sessions, sizes.Hours]).size).toBe(1);
  });

  it("promotes nothing when the card names nothing", () => {
    // A period whose previous window carried no training is COLD: the figures
    // render and the card makes no claim over them, so there is no subject to
    // draw large. Every cell holds the plain rung.
    const { container } = renderScreen(<AuroraWeekVerdict sessions={[lift(0), run(0, 5)]} units="kg" />);
    const sizes = Object.values(figureSizes(container));

    expect(sizes.length).toBeGreaterThan(1);
    expect(new Set(sizes).size).toBe(1);
  });

  it("leaves the order alone — the hero does not move to the front", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    const text = container.textContent ?? "";
    const at = (label: string) => text.indexOf(label);

    // Distance is the week's story and is still read fourth.
    expect(at("Tonnage")).toBeLessThan(at("Sessions"));
    expect(at("Sessions")).toBeLessThan(at("Hours"));
    expect(at("Hours")).toBeLessThan(at("Distance"));
  });
});

/**
 * PAST THE CEILING, A CELL PRINTS THE STEP — never a four-digit percentage.
 *
 * The ceiling used to guard the headline corner alone, so on the very week it
 * exists for the card read "0.1 km → 6.8 km" in the lead and "+6700%" in the
 * cell three lines under it — one card, one fact, and the absurd rendering was
 * the one sitting next to the figure. With the corner gone the cell is the only
 * place a percentage is drawn, so the cell is where core's rule is asked.
 */
const thinBaseline: LoggedSession[] = [
  lift(0), run(0, 6.8),
  lift(1), run(1, 0.1),
  lift(2), run(2, 0.1),
  lift(3), run(3, 0.1),
  lift(4), run(4, 0.1),
];

describe("a move past the ceiling", () => {
  it("renders as the step it is, in the cell that made it", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={thinBaseline} units="kg" />);
    const text = container.textContent ?? "";

    expect(text).toContain("0.1 km → 6.8 km");
    // Whatever else the card says, on EITHER page, it does not say this.
    expect(text).not.toMatch(/[+−]\d{4,}%/);
  });

  it("promotes the difference on the comparison page, where PREV/NOW are the step", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={thinBaseline} units="kg" />);
    const text = container.textContent ?? "";

    // Page two's row cannot fall back to the step — its own landmark cells
    // already print it — so the real difference takes the percentage's slot.
    expect(text).toContain("+6.7 km");
    expect(text).toContain("PREV 0.1 km");
    expect(text).toContain("NOW 6.8 km");
  });
});

/**
 * A SLIP TOO SMALL FOR THE SENTENCE IS STILL THE ROW'S WORST END.
 *
 * The reported week: time up a third, tonnage up, and distance down NINE per
 * cent — the only measure that went backwards, and the only one the row said
 * nothing about, because the ends were once ranked on the SENTENCE's 15%
 * threshold. The marks rank on core's lower VERDICT_END_THRESHOLD_PCT now: a
 * claim in words needs a move worth stating, a mark only says which end of this
 * row a figure is.
 */
const shallowFall: LoggedSession[] = [
  longLift(0), run(0, 3.6),
  lift(1), run(1, 4),
  lift(2), run(2, 4),
  lift(3), run(3, 4),
  lift(4), run(4, 4),
];

describe("a faller under the sentence's threshold", () => {
  const columnFor = (prefix: string) =>
    screen.getAllByRole("button").find((b) => (b.getAttribute("aria-label") ?? "").startsWith(prefix));

  it("still takes the drop mark", () => {
    renderScreen(<AuroraWeekVerdict sessions={shallowFall} units="kg" />);

    expect(columnFor("Distance")!.getAttribute("aria-label")).toContain("biggest drop this period");
  });

  it("prints its own single-digit move, and leaves the sentence alone", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={shallowFall} units="kg" />);
    const text = container.textContent ?? "";

    expect(text).toContain("−10%");
    // The lead is still the rise — a 10% slip is not worth a claim in words.
    expect(text).toContain("+33%");
  });
});

/**
 * BOTH MARKS ARE FOREGROUND — the row carries no fill at rest.
 *
 * The fall used to sit in a maroon WASH, on the argument that a slip should be
 * the heavier of the two marks. It made one column a surface while the other
 * three were type on the card, so the row read as three figures and one filled
 * box — and the box was what the eye found first whether or not the slip was
 * the week's story. Hue and sign already separate the ends.
 *
 * So the background belongs to SELECTION alone, and these are the assertions
 * that keep the two channels from merging again: nothing is filled until a
 * finger lands, and what a finger produces is a tint of that column's own tone.
 */
describe("the row's backgrounds", () => {
  const columnFor = (prefix: string) =>
    screen.getAllByRole("button").find((b) => (b.getAttribute("aria-label") ?? "").startsWith(prefix));
  const bare = (bg: string) => bg === "" || bg === "rgba(0, 0, 0, 0)" || bg === "transparent";

  it("leaves EVERY column unfilled at rest, the fall included", () => {
    renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    for (const prefix of ["Tonnage", "Sessions", "Hours", "Distance"]) {
      const bg = columnFor(prefix)!.style.backgroundColor;
      expect(bare(bg), `${prefix} is filled at rest — got "${bg}"`).toBe(true);
    }
  });

  it("still marks the fall — in the foreground, where both marks now live", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    expect(columnFor("Distance")!.getAttribute("aria-label")).toContain("biggest drop this period");
    expect(container.textContent ?? "").toContain("−75%");
  });

  it("fills only under a finger, in that column's own tone", () => {
    renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    fireEvent.click(columnFor("Distance")!);
    // 9% of terracotta (#e58a5c) — selection's channel, not the mark's.
    expect(columnFor("Distance")!.style.backgroundColor).toBe("rgba(229, 138, 92, 0.09)");
    // …and it is the ONLY column filled: selection travels, the marks do not.
    for (const prefix of ["Tonnage", "Sessions", "Hours"]) {
      expect(bare(columnFor(prefix)!.style.backgroundColor)).toBe(true);
    }
  });
});

/**
 * THE SECOND PAGE — every metric against its own average.
 *
 * The figure row marks TWO of four metrics, because `best` and `worst` are the
 * period's two ends and a row of totals has no room to argue about the middle.
 * The other two comparisons were computed on every render and thrown away. The
 * assertions here are that page two keeps them, that it says the same thing
 * about the same week as the row one drag away, and that colour still marks
 * only the two ends — a chart that lit every rise would put chartreuse on a
 * column the row leaves in ash.
 */
describe("the comparison page", () => {
  const textOf = () => (screen.getByText(/four-week average/i).closest("div")?.textContent ?? "");

  it("carries a row for every figure, not just the two the row marks", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    const text = container.textContent ?? "";

    // All four metrics named, and all four moves stated — the two the sentence
    // and the row can never get to are +0% and -0% nowhere: they are printed.
    for (const label of ["Tonnage", "Sessions", "Hours", "Distance"]) {
      expect(text).toContain(label);
    }
    expect(text).toContain("+33%");  // hours, the rise
    expect(text).toContain("−75%");  // distance, the fall
  });

  it("wears the by-muscle head — a title, and a meta that names the axis", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    const text = (container.textContent ?? "").toLowerCase();
    // Display-face title left, mono meta right, exactly as Volume's "By muscle"
    // sets it. The meta names the AXIS and nothing else — the WINDOW is
    // deliberately absent, since the section head above the card already names
    // it and printing it twice is the redundancy the Progress sweep catches.
    expect(text).toContain("by metric");
    expect(text).toContain("vs previous 7 days");
  });

  it("puts three landmarks in the scale's grammar, as MEV / MAV / MRV are three", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    const text = container.textContent ?? "";
    // Where you were, where you are, what your normal is — a quiet label and a
    // loud figure each, pinned left so the values align down the whole list.
    expect(text).toContain("PREV");
    expect(text).toContain("NOW");
    expect(text).toContain("AVG");
  });

  it("spells a row out for a screen reader, difference included", () => {
    renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    const labels = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? "");
    const row = labels.find((l) => l.includes("difference of"));
    expect(row).toBeTruthy();
    // A screen reader gets neither the bar's direction nor its length, so the
    // sentence has to carry the percentage, both figures and the difference.
    expect(row).toMatch(/%/);
    expect(row).toMatch(/from .+ to /);
  });

  it("puts the page indicator under the card, as a pair", () => {
    const { container } = renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    // Two dots, and the active one is the chartreuse pill (20dp wide).
    const dots = [...container.querySelectorAll("div")].filter((d) => {
      const s = (d as HTMLElement).style;
      return s.height === "7px" && (s.width === "7px" || s.width === "20px");
    });
    expect(dots).toHaveLength(2);
    expect(dots.filter((d) => (d as HTMLElement).style.width === "20px")).toHaveLength(1);
  });

  it("teaches the swipe once — the only thing on the card you cannot see", async () => {
    // The hint starts hidden and can only ever appear (never flash in), so it
    // arrives with the stored flag rather than on the first frame.
    const { container } = renderScreen(<AuroraWeekVerdict sessions={bothEnds} units="kg" />);
    await waitFor(() =>
      expect((container.textContent ?? "").toLowerCase()).toContain("swipe for every metric"));
  });
});
