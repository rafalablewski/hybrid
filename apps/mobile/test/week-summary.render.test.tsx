import { describe, expect, it, vi } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { localMondayMs, localDayKey, addLocalDays } from "@hybrid/core";
import { renderScreen } from "./render";

/**
 * THE WEEK SUMMARY — the screen behind each of History's week chapters.
 *
 * Three things are worth a gate here, and none is visible to the type-checker.
 *
 * THE WINDOW. The screen is addressed by a day KEY, and turning that key back
 * into a moment is where a week summary goes wrong quietly: `Date.parse` on a
 * bare date is UTC midnight, so west of Greenwich the screen would report the
 * week BEFORE the one whose door was tapped, with every figure plausible.
 *
 * THE SPLIT. This is a hybrid-athlete app, and the report is only honest if the
 * gym half and the endurance half are BOTH stated and stated apart. The fixture
 * is deliberately mixed — a lifting session, a run and a tennis match — because
 * a gym-only fixture cannot tell a working split from a screen that quietly
 * dropped the sport.
 *
 * THE SHARE. It is a bare circle, so its accessible NAME is the only thing that
 * says what it is — and behind it, the 9:16 card that actually leaves the app.
 *
 * THE NARRATION. The paragraph is composed in core and RESOLVED here, which
 * means the two halves of it (the key and the numbers) only meet at render: a
 * sentence can go missing, keep an unsubstituted `{slot}`, or name the wrong
 * discipline without anything else in the stack noticing.
 */

// A FINISHED week, three weeks back. The current week would be in progress —
// its comparison is truncated to the days that have elapsed, so a fixture
// session dated later in the week is a session in the future, which is a state
// no real history can be in and a poor thing to pin a screen against.
const MONDAY = localMondayMs(addLocalDays(localMondayMs(Date.now()), -21));
const START = localDayKey(MONDAY);

const at = (dayOffset: number, hour: number, mins: number) => {
  const d = new Date(addLocalDays(MONDAY, dayOffset));
  d.setHours(hour, 0, 0, 0);
  return { startedAt: d.toISOString(), completedAt: new Date(d.getTime() + mins * 60_000).toISOString() };
};

const SESSIONS = [
  {
    id: "lift",
    title: "Lower",
    ...at(1, 9, 60),
    blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }, { load: "100", reps: "5" }] }],
  },
  {
    id: "run",
    title: "Morning run",
    ...at(2, 7, 45),
    blocks: [{ kind: "cardio", name: "Running", minutes: 45, distance: 9 }],
  },
  {
    id: "tennis",
    title: "Tennis",
    ...at(5, 10, 75),
    blocks: [{ kind: "cardio", name: "Tennis", minutes: 75 }],
  },
  // The week BEFORE, so the verdict has an axis to measure from.
  {
    id: "prev",
    title: "Last week",
    ...at(-3, 9, 50),
    blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: "60", reps: "5" }] }],
  },
];

vi.mock("../lib/queries", () => ({
  useSessionsQuery: () => ({ data: SESSIONS, isPending: false, isFetching: false, isError: false, refetch: () => {} }),
}));
vi.mock("../lib/use-bodyweight", () => ({ useBodyweightLookup: () => () => 80 }));

const { default: AuroraWeekSummary } = await import("../components/aurora/week-summary");

describe("the week summary", () => {
  it("reports THIS week's sessions, not the neighbouring week's", () => {
    const { container } = renderScreen(<AuroraWeekSummary startKey={START} />);
    expect(container.textContent).toContain("3 sessions");
    expect(container.textContent).not.toContain("Last week");
  });

  it("carries share in the hero rail, named", () => {
    const { getAllByLabelText } = renderScreen(<AuroraWeekSummary startKey={START} />);
    expect(getAllByLabelText(/Share your week/).length).toBeGreaterThan(0);
  });

  it("states the week whole, in the one measure both halves pay into", () => {
    const { container } = renderScreen(<AuroraWeekSummary startKey={START} />);
    // 60 + 45 + 75 = 180 minutes. The clock leads because a tonnage hero would
    // tell a lifter-who-also-runs their week was about the barbell every week.
    // The numerals and their units are separate nodes on one baseline — the
    // figure is laid out, not printed as a string — so the text runs together.
    expect(container.textContent).toContain("3h00min");
  });

  it("SPLITS the week — the gym and the sport are both named, and apart", () => {
    const { container } = renderScreen(<AuroraWeekSummary startKey={START} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Gym");
    // SPORT, not "Endurance & sport": the athlete's word for the half, and the
    // one the paragraph uses.
    expect(text).toContain("Sport");
    // the gym half's own figure, and the ground the other half covered
    expect(text).toContain("1.0 t");
    expect(text).toContain("9 km");
  });

  it("names every discipline and sport, rather than summing them into one row", () => {
    const { queryAllByLabelText } = renderScreen(<AuroraWeekSummary startKey={START} />);
    // A week of running and squash that says "9 km" and names neither is the
    // row this section replaced.
    expect(queryAllByLabelText(/^Running,/).length).toBe(1);
    expect(queryAllByLabelText(/^Tennis,/).length).toBe(1);
    // The timed sport covered no ground and still gets a row — a week that was
    // three squash matches must not read as empty.
    expect(queryAllByLabelText(/^Tennis, 1h 15m/).length).toBe(1);
  });

  it("keeps the gym ledger to gym facts, and does not restate the half's figure", () => {
    const { queryAllByLabelText } = renderScreen(<AuroraWeekSummary startKey={START} />);
    // TWO squat sets — not four. The week's own set count gives every block a
    // grain and so counts the run and the tennis match, which is right for a
    // whole-week figure and wrong under a heading that says GYM.
    expect(queryAllByLabelText(/^SETS, 2$/).length).toBe(1);
    // The tonnage is set at size above the ledger; a row for it would be the
    // grid-of-tiles habit coming back one row at a time.
    expect(queryAllByLabelText(/^VOLUME,/)).toHaveLength(0);
  });

  it("concludes exactly once, and only when there is a week to compare against", () => {
    const { container } = renderScreen(<AuroraWeekSummary startKey={START} />);
    expect(container.textContent).toMatch(/on the week before|Tracking with the week before/);
  });

  it("READS THE WEEK OUT — the figures again, in sentences", () => {
    const { container } = renderScreen(<AuroraWeekSummary startKey={START} />);
    const text = container.textContent ?? "";
    // How much, how often, and how it divided.
    expect(text).toContain("3 sessions across 3 days");
    // Each half in its own words: what was lifted, what was covered.
    expect(text).toContain("1.0 t");
    // EVERY SPORT NAMED, each with its own figures and its own rate — not a
    // total with the biggest one credited for it. The pace belongs to the run;
    // the tennis match is time, and reporting "0 km of tennis" was the bug.
    expect(text).toContain("9 km of running at 5:00 /km");
    expect(text).toContain("1h 15min of tennis");
    // Every slot substituted — an unresolved template is the failure mode a
    // key-plus-numbers contract has and a formatted string does not.
    expect(text).not.toMatch(/\{[a-z]+\}/);
  });

  it("concludes ONCE — the verdict leads the paragraph, it does not repeat inside it", () => {
    const { container } = renderScreen(<AuroraWeekSummary startKey={START} />);
    const text = container.textContent ?? "";
    expect(text.split("on the week before").length - 1).toBeLessThanOrEqual(1);
  });

  it("shares the CARD, and the card carries the paragraph out of the app", () => {
    const { getAllByLabelText, container, baseElement } = renderScreen(<AuroraWeekSummary startKey={START} />);
    act(() => { fireEvent.click(getAllByLabelText(/Share your week/)[0]!); });

    // The PREVIEW is in the sheet, which a Modal portals to a sibling of the
    // render container rather than into the tree it was written in.
    const sheet = Array.from(baseElement.children)
      .filter((el) => el !== container)
      .map((el) => el.textContent ?? "")
      .join(" ");
    // The 9:16 card is what leaves — the brand, and the SAME sentences the
    // screen prints. A card of four figures says nothing to whoever sees it,
    // which is why the paragraph is on it.
    expect(sheet).toContain("HYBRID");
    expect(sheet).toContain("3 sessions across 3 days");
    expect(sheet).toContain("Tracked with HYBRID.");
    // And the conclusion, which the screen sets at its own rank above the
    // paragraph and the card has no second rank for.
    expect(sheet).toMatch(/on the week before|Tracking with the week before/);

    // AND THE COPY BEING PHOTOGRAPHED, off-screen at export width — one
    // component, one props object, one prop apart, which is what makes the
    // preview trustworthy as the thing that will be posted.
    expect(container.textContent ?? "").toContain("Tracked with HYBRID.");
  });

  it("says so, rather than printing zeros, for a week nobody trained", () => {
    const empty = localDayKey(addLocalDays(MONDAY, -70));
    const { container } = renderScreen(<AuroraWeekSummary startKey={empty} />);
    expect(container.textContent).toContain("No sessions");
    // and neither half's section appears at all
    expect(container.textContent).not.toContain("Sport");
  });
});
