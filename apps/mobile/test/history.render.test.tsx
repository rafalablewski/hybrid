import { describe, expect, it, vi } from "vitest";
import { renderScreen } from "./render";

/**
 * HISTORY — one layout, and a door on every week.
 *
 * The screen used to carry four switchable layouts behind a docked rail, and
 * this test pinned where that rail sat. Both are gone (Aug 2026): History is
 * calendar-week chapters, and each chapter ends in the door to its own week
 * summary. What is worth pinning now is that door — it is the ONLY way into
 * the week summary, so a chapter that renders without one takes the screen
 * behind it out of the app while every type-check and build stays green (the
 * exact failure mode nav-doors.test.ts exists for, one level down).
 */

const DAY = 86_400_000;
const NOW = Date.now();

const SESSIONS = [
  {
    id: "s1",
    title: "Lower",
    startedAt: new Date(NOW - 2 * DAY).toISOString(),
    completedAt: new Date(NOW - 2 * DAY + 3_600_000).toISOString(),
    blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }] }],
  },
];

vi.mock("../lib/queries", () => ({
  useSessionsQuery: () => ({ data: SESSIONS, isPending: false, isFetching: false, isError: false, refetch: () => {} }),
}));

vi.mock("../lib/session-actions", () => ({
  useSessionActions: () => ({ busyId: null, archive: async () => {}, confirmDelete: () => {} }),
}));

vi.mock("../lib/use-bodyweight", () => ({ useBodyweightLookup: () => () => 80 }));
vi.mock("../lib/query", async () => ({ ...(await vi.importActual("../lib/query")), useRefreshOnFocus: () => {} }));

const { default: AuroraHistory } = await import("../components/aurora/history");

describe("the History screen", () => {
  it("names itself and its sessions", async () => {
    const { container } = renderScreen(<AuroraHistory />);
    expect(container.textContent).toContain("History");
    expect(container.textContent).toContain("Lower");
  });

  it("ends each week chapter in the door to that week's summary", async () => {
    const { container } = renderScreen(<AuroraHistory />);
    expect(container.textContent).toContain("Week summary");
  });

  it("offers no layout switcher — there is one layout", async () => {
    const { container, queryByTestId } = renderScreen(<AuroraHistory />);
    expect(queryByTestId("hero-rail")).toBeNull();
    for (const retired of ["Agenda", "Timeline", "Trend"]) {
      expect(container.textContent).not.toContain(retired);
    }
  });
});
