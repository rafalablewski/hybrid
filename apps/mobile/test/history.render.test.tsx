import { describe, expect, it, vi } from "vitest";
import { renderScreen } from "./render";

/**
 * HISTORY — the screen the docked-rail bug shipped on.
 *
 * It is the app's one `scroller` screen: it keeps its own FlatList so the
 * archived list stays virtualized, which means IT places the rail node rather
 * than the container. That makes it the only place the dock point's premise —
 * the rail is the first thing in the scroll content — can be broken by a
 * screen, so it is the one worth pinning down here.
 *
 * The data layer is mocked to an empty history: the subject is where the view
 * switcher sits, and an empty history renders it just the same.
 */

vi.mock("../lib/api", () => ({
  fetchMacrocycle: async () => null,
  fetchTranslationOverrides: async () => ({}),
}));

vi.mock("../lib/queries", () => ({
  useSessionsQuery: () => ({ data: [], isPending: false, isFetching: false, isError: false, refetch: () => {} }),
}));

vi.mock("../lib/session-actions", () => ({
  useSessionActions: () => ({ busyId: null, archive: async () => {}, confirmDelete: () => {} }),
}));

vi.mock("../lib/use-bodyweight", () => ({ useBodyweightLookup: () => () => 80 }));
vi.mock("../lib/plan-overrides", () => ({ usePlanOverrides: () => ({ overrides: [] }) }));
vi.mock("../lib/query", async () => ({ ...(await vi.importActual("../lib/query")), useRefreshOnFocus: () => {} }));

const { default: AuroraHistory } = await import("../components/aurora/history");

describe("the History screen", () => {
  it("puts the view switcher FIRST in its list header — where the dock point expects it", async () => {
    const { container, findByTestId } = renderScreen(<AuroraHistory />);
    const el = (await findByTestId("hero-rail")) as HTMLElement;

    // Nothing of the screen's own renders above it: the switcher is the first
    // thing in the scroll content, which is the premise HeroScreen derives the
    // dock point from. Put the swipe hint (or anything else) above it and this
    // fails — the switcher would dock early, with the page sliding out from
    // under it.
    expect(el.parentElement?.firstElementChild).toBe(el);
    expect(container.textContent).toContain("History");
  });

  it("offers all four layouts in the switcher", async () => {
    const { findByTestId } = renderScreen(<AuroraHistory />);
    const el = (await findByTestId("hero-rail")) as HTMLElement;
    // The four merged History x Calendar layouts, in core's order.
    for (const label of ["Agenda", "Weeks", "Timeline", "Trend"]) {
      expect(el.textContent).toContain(label);
    }
  });
});
