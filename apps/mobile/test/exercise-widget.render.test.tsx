import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { LoggedSession, SessionBlock } from "@hybrid/core";
import { renderScreen } from "./render";
import ExerciseWidgetRail from "../components/aurora/exercise-widget";

/**
 * THE EXERCISES RAIL — the card's claim is that its percentage is CHECKABLE.
 *
 * That is the whole reason the eight-bar strip came off: the bars were
 * normalised onto a floored band, so they could not tell 62.5 kg from 70, and
 * everything they were good for lived behind a press-and-hold. What replaced
 * them is the comparison itself — the figure, its change, and the figure that
 * change was measured FROM.
 *
 * Which puts a specific burden on this file. A card printing a baseline beside
 * a percentage invites the reader to do the arithmetic, so the tests here pin
 * that the two are THE SAME COMPARISON: the trap is `spark[0]`, which is a
 * different quantity and falls back to all-time points when the window is thin.
 * Print that beside `deltaPct` and the card is inviting a check it fails.
 */

vi.mock("../lib/api", () => ({
  fetchFlagState: async () => ({ flags: {}, values: {} }),
  fetchTranslationOverrides: async () => ({}),
}));

const DAY = 86_400_000;

const lift = (id: string, daysAgo: number, load: string): LoggedSession =>
  ({
    id,
    title: "Pull",
    startedAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
    blocks: [{ kind: "strength", name: "Romanian Deadlift", sets: [{ load, reps: "5" }] }] as SessionBlock[],
  }) as LoggedSession;

const rail = (sessions: LoggedSession[]) => (
  <ExerciseWidgetRail sessions={sessions} onOpen={() => {}} onAll={() => {}} />
);

/** 100 kg eight-to-sixteen weeks back, 110 kg inside the window: +10%. */
const WITH_BASELINE = [lift("a", 70, "100"), lift("b", 5, "110")];

describe("the exercise card", () => {
  it("prints the figure the delta was measured FROM, so the percentage can be checked", () => {
    const { container } = renderScreen(rail(WITH_BASELINE));
    const text = container.textContent ?? "";
    expect(text).toContain("110");        // the window's figure
    expect(text).toContain("10%");        // its change
    expect(text).toContain("from 100 kg"); // ...and the baseline that change is against
  });

  it("carries the window on the baseline line, since the metric label no longer does", () => {
    // "Heaviest – 8 weeks" used to be the only place the rail said what period
    // it was answering for. Dropping the label cannot drop the window with it.
    const { container } = renderScreen(rail(WITH_BASELINE));
    expect(container.textContent ?? "").toMatch(/8 weeks/);
  });

  it("falls back to the metric name when there is no previous window to measure from", () => {
    // One session, so no baseline exists. The card must not print a percentage
    // it cannot show the workings for, nor an empty line where a fact goes.
    const { container } = renderScreen(rail([lift("solo", 5, "110")]));
    const text = container.textContent ?? "";
    expect(text).toContain("Heaviest");
    expect(text).not.toContain("from ");
    expect(text).not.toMatch(/[▲▼]/);
  });

  it("draws no chart — the card is name, figure, baseline", () => {
    // The strip rendered eight sibling bars inside the card. Nothing in the
    // card should be drawing a series any more; the movement's own page owns
    // the trajectory, plotted against every PR.
    const { container } = renderScreen(rail(WITH_BASELINE));
    const card = screen.getAllByRole("button").find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Romanian"));
    expect(card, "the movement card is not a button").toBeTruthy();
    // A HistoryStrip is >= 2 sibling Views with a background colour and no text.
    const bars = [...card!.querySelectorAll("div")].filter(
      (n) => n.children.length === 0 && (n.textContent ?? "") === "" && /background/.test(n.getAttribute("style") ?? ""),
    );
    expect(bars.length, "the card is still drawing bars").toBeLessThan(2);
  });

  it("speaks the baseline to a screen reader, not just to the eye", () => {
    renderScreen(rail(WITH_BASELINE));
    const card = screen.getAllByRole("button").find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Romanian"));
    expect(card!.getAttribute("aria-label")).toContain("from 100 kg");
  });

  it("opens the movement it is about", () => {
    const opened: string[] = [];
    renderScreen(<ExerciseWidgetRail sessions={WITH_BASELINE} onOpen={(n) => opened.push(n)} onAll={() => {}} />);
    const card = screen.getAllByRole("button").find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Romanian"));
    card!.click();
    expect(opened).toEqual(["Romanian Deadlift"]);
  });
});
