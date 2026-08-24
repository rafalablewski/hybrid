import { describe, expect, it, vi } from "vitest";
import { localMondayMs, localDayKey, addLocalDays } from "@hybrid/core";
import { renderScreen } from "./render";

/**
 * THE WEEK SUMMARY — the screen behind each of History's week chapters.
 *
 * Two things are worth a gate here, and neither is visible to the type-checker.
 *
 * THE WINDOW. The screen is addressed by a day KEY, and turning that key back
 * into a moment is where a week summary goes wrong quietly: `Date.parse` on a
 * bare date is UTC midnight, so west of Greenwich the screen would report the
 * week BEFORE the one whose door was tapped, with every figure plausible. The
 * fixture puts a session in this week and one in the week before, and asserts
 * only the first is counted.
 *
 * THE SHARE. The user asked for it "in the right top like it's in the workout
 * summary", and it is the screen's whole reason for existing as a destination
 * rather than a card. It is a bare circle, so its accessible NAME is the only
 * thing that says so.
 */

const MONDAY = localMondayMs(Date.now());
const START = localDayKey(MONDAY);

const at = (dayOffset: number, hour: number) => {
  const d = new Date(addLocalDays(MONDAY, dayOffset));
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const SESSIONS = [
  {
    id: "in",
    title: "Lower",
    startedAt: at(1, 9),
    completedAt: at(1, 10),
    blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }, { load: "100", reps: "5" }] }],
  },
  {
    id: "out",
    title: "Last week",
    startedAt: at(-3, 9),
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
    // "1 session", not "1 sessions" — the count goes through the shared
    // plural helper, which is the other thing this line pins.
    expect(container.textContent).toContain("1 session");
    expect(container.textContent).not.toContain("Last week");
  });

  it("carries share in the hero rail, named", () => {
    const { getAllByLabelText } = renderScreen(<AuroraWeekSummary startKey={START} />);
    expect(getAllByLabelText(/Share your week/).length).toBeGreaterThan(0);
  });

  it("says so, rather than printing zeros, for a week nobody trained", () => {
    const empty = localDayKey(addLocalDays(MONDAY, -70));
    const { container } = renderScreen(<AuroraWeekSummary startKey={empty} />);
    expect(container.textContent).toContain("No sessions");
  });
});
