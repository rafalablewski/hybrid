import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { sportPages, type LoggedSession, type SessionBlock } from "@hybrid/core";
import { renderScreen } from "./render";

/**
 * THE ENDURANCE PAGER — one page per sport, and the three things about it that
 * are easy to regress.
 *
 * All three are faults the RAILS this replaced actually shipped with, which is
 * why they are pinned here rather than trusted to the model's own unit tests:
 *
 *   1. A ball sport is a PAGE. Tennis carries no distance, so under the lanes
 *      it was not an endurance lane at all — it lived in a second block below
 *      the fold, in a different grammar, behind a fraction nobody asked for.
 *      It is usually the sport with the most minutes in it.
 *
 *   2. A page shows what the sport HAS. Distance and pace render on the pages
 *      that carry them and are absent — not dashed — on the ones that don't.
 *      A dash is a metric-shaped hole where there was never a metric.
 *
 *   3. A page OPENS the sport. The depth the lanes spread across five tiles
 *      lives on sport-page.tsx, and the pager is worthless if it cannot get
 *      there.
 */

vi.mock("../lib/api", () => ({
  fetchFlagState: async () => ({ flags: {}, values: {} }),
  fetchTranslationOverrides: async () => ({}),
}));

const DAY = 86_400_000;

const effort = (
  id: string,
  name: string,
  discipline: "running" | "sport",
  daysAgo: number,
  distance: number,
  minutes: number,
): LoggedSession => {
  const started = Date.now() - daysAgo * DAY;
  return {
    id,
    title: name,
    startedAt: new Date(started).toISOString(),
    completedAt: new Date(started + minutes * 60_000).toISOString(),
    blocks: [{ kind: "cardio", name, discipline, minutes, distance }] as SessionBlock[],
  } as LoggedSession;
};

/* Tennis outweighs the running by time and carries no distance at all. */
const SESSIONS: LoggedSession[] = [
  effort("t1", "Tennis", "sport", 2, 0, 90),
  effort("t2", "Tennis", "sport", 9, 0, 75),
  effort("r1", "Easy run", "running", 3, 8, 46),
];

const { default: AuroraSportPages } = await import("../components/aurora/sport-pages");

const pagesOf = (sessions: LoggedSession[]) => sportPages(sessions);

describe("the endurance pager", () => {
  it("gives a ball sport a page of its own, ahead of the running it outweighs", () => {
    const pages = pagesOf(SESSIONS);
    const { container } = renderScreen(<AuroraSportPages pages={pages} />);
    const text = container.textContent ?? "";
    expect(text.indexOf("Tennis")).toBeGreaterThan(-1);
    expect(text.indexOf("Tennis")).toBeLessThan(text.indexOf("Running"));
    // The hero is MINUTES on every page — the one measure a swim, a ride and a
    // squash match all share.
    expect(text).toContain("2h 45min");
  });

  it("renders no distance and no pace for a sport that has neither", () => {
    const tennis = pagesOf(SESSIONS).filter((p) => p.sport === "Tennis");
    const { container } = renderScreen(<AuroraSportPages pages={tennis} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("km");
    // ...and shows instead the fact a timed sport actually carries.
    expect(text.toLowerCase()).toContain("longest");
  });

  it("renders distance and pace where the sport carries them", () => {
    const running = pagesOf(SESSIONS).filter((p) => p.discipline === "running");
    const { container } = renderScreen(<AuroraSportPages pages={running} />);
    expect(container.textContent ?? "").toContain("8 km");
  });

  it("opens the sport the page is about", () => {
    const opened: string[] = [];
    renderScreen(
      <AuroraSportPages pages={pagesOf(SESSIONS)} onOpen={(p) => opened.push(p.sport ?? p.discipline ?? "")} />,
    );
    const page = screen.getAllByRole("button").find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Tennis"));
    expect(page, "the Tennis page is not a button").toBeTruthy();
    fireEvent.click(page!);
    expect(opened).toEqual(["Tennis"]);
  });

  it("carries no exit when there is nowhere to go", () => {
    const { container } = renderScreen(<AuroraSportPages pages={pagesOf(SESSIONS)} />);
    // The ring-arrow is the promise that the page leaves; without an onOpen
    // there is no destination, so there must be no promise.
    expect(container.textContent ?? "").not.toContain("→");
  });

  it("renders nothing at all when the window is empty", () => {
    const { container } = renderScreen(<AuroraSportPages pages={[]} />);
    expect(container.textContent).toBe("");
  });
});
