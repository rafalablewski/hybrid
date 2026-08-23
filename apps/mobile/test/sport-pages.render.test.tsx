import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { sportPages, type LoggedSession, type SessionBlock } from "@hybrid/core";
import { renderScreen } from "./render";

/**
 * THE ENDURANCE GRID — every discipline on one screen, and the things about it
 * that are easy to regress.
 *
 * These outlived two rewrites (the per-discipline RAILS, then the one-page-per-
 * sport PAGER) because they are not properties of a layout — they are promises
 * the section makes however it is drawn:
 *
 *   1. A ball sport is a FIRST-CLASS PLATE. Tennis carries no distance, so
 *      under the lanes it was not an endurance lane at all — it lived in a
 *      second block below the fold, in a different grammar. It is usually the
 *      sport with the most minutes in it, so it leads.
 *
 *   2. A plate shows what the sport HAS. A rate renders where the sport carries
 *      one and is absent — not dashed — where it doesn't; a timed sport shows
 *      its longest effort instead. A dash is a metric-shaped hole where there
 *      was never a metric.
 *
 *   3. A plate OPENS the sport. The depth lives on sport-page.tsx, and the
 *      section is worthless if it cannot get there.
 *
 * WHAT CHANGED WITH THE GRID, and why the assertions moved with it: the pager
 * spent a full screen width per sport and could afford three facts under the
 * figure. Two-up plates cannot, so the second fact is the discipline's own RATE
 * rather than its distance — informationally the same choice, since minutes are
 * already on the plate and each derives from the other, broken on which one an
 * athlete reads directly. Distance is one tap away on the sport's own page.
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

describe("the endurance grid", () => {
  it("gives a ball sport a plate of its own, ahead of the running it outweighs", () => {
    const pages = pagesOf(SESSIONS);
    const { container } = renderScreen(<AuroraSportPages pages={pages} />);
    const text = container.textContent ?? "";
    expect(text.indexOf("Tennis")).toBeGreaterThan(-1);
    expect(text.indexOf("Tennis")).toBeLessThan(text.indexOf("Running"));
    // The figure is MINUTES on every plate — the one measure a swim, a ride and
    // a squash match all share, and the reason they can be compared at all.
    expect(text).toContain("2h 45min");
  });

  it("shows every discipline at once, which is what the section is for", () => {
    // The pager this replaced could show exactly one, while its own docblock
    // said the section's job was the comparison. Both sports, one render, no
    // gesture in between.
    const { container } = renderScreen(<AuroraSportPages pages={pagesOf(SESSIONS)} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Tennis");
    expect(text).toContain("Running");
  });

  it("renders no rate at all for a sport that has none", () => {
    const tennis = pagesOf(SESSIONS).filter((p) => p.sport === "Tennis");
    const { container } = renderScreen(<AuroraSportPages pages={tennis} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("km");
    expect(text).not.toContain("—");
    // ...and shows instead the fact EVERY sport carries: how many times you
    // turned up. It was the longest effort, and "LONGEST 1h 32min" beside a
    // "14h 43min" figure measures 168dp inside a 153dp plate — it shipped
    // ellipsised, which is a plate saying a number it will not finish.
    expect(text.toLowerCase()).toContain("effort");
    expect(text).not.toMatch(/…|\.\.\./);
  });

  it("renders the rate in the discipline's OWN unit where it carries one", () => {
    const running = pagesOf(SESSIONS).filter((p) => p.discipline === "running");
    const { container } = renderScreen(<AuroraSportPages pages={running} />);
    const text = container.textContent ?? "";
    // 8 km in 46 minutes is 5:45 on the road — and it must read "/km", not the
    // pool's "/100m" or the erg's "/500m". One function knows (core's
    // formatDisciplinePace) and every surface goes through it.
    expect(text).toContain("/km");
    expect(text).toContain("5:45");
  });

  it("opens the sport the page is about", () => {
    const opened: string[] = [];
    renderScreen(
      <AuroraSportPages pages={pagesOf(SESSIONS)} onOpen={(p) => opened.push(p.sport ?? p.discipline ?? "")} />,
    );
    const page = screen.getAllByRole("button").find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Tennis"));
    expect(page, "the Tennis plate is not a button").toBeTruthy();
    fireEvent.click(page!);
    expect(opened).toEqual(["Tennis"]);
  });

  it("carries no exit when there is nowhere to go", () => {
    const { container } = renderScreen(<AuroraSportPages pages={pagesOf(SESSIONS)} />);
    // The pager drew a ring-arrow to promise that a page leaves, because a
    // full-bleed page does not look tappable. A plate is a card and a card
    // opens, so the promise IS the press target — which makes the absence of
    // one the thing to pin: with no destination, nothing here may be a button.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.textContent ?? "").not.toContain("→");
  });

  it("renders nothing at all when the window is empty", () => {
    const { container } = renderScreen(<AuroraSportPages pages={[]} />);
    expect(container.textContent).toBe("");
  });
});
