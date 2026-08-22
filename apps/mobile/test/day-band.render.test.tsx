import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import type { DayBand } from "@hybrid/core";
import AuroraDayBand from "../components/aurora/day-band";
import { renderScreen } from "./render";

/**
 * THE DAY BAND'S TREE — what nests inside what, and which page carries a
 * control.
 *
 * The engine's own decisions are settled in core (day-band.test.ts, 4k+ of
 * them); nothing here re-litigates a rung. What this gate holds is the part
 * core cannot see: that page 1 carries NO commit control and every other page
 * carries exactly one, that the commit reports the page's own index, that the
 * numeral speaks its scale rather than its punctuation, and that the deck's
 * chrome only appears when there IS a deck.
 *
 * The index is the whole hazard. `onPick(i)` is read by the host as "reject
 * everything ranked above page i", so an off-by-one there does not draw wrong —
 * it silently teaches the rotation the opposite of what the athlete chose, on
 * a store that is scoped to the day and gone by tomorrow.
 *
 * WHAT THIS GATE CANNOT SEE, and it is worth writing down next to what it can:
 * `accessible` grouping. React Native takes a grouped view's whole subtree out
 * of the a11y tree; react-native-web does not, so a control buried inside an
 * `accessible` view is reachable here and unreachable on the phone. That is
 * held as a source registry instead — lib/a11y-grouping.test.ts.
 */

vi.mock("../lib/api", () => ({
  fetchFlagState: async () => ({ flags: {}, values: {} }),
  fetchTranslationOverrides: async () => ({}),
}));

/** A page of the deck. Written out rather than run through `dayBandDeck()` on
 *  purpose: this file is about the TREE, and a fixture that has to be coaxed
 *  out of a rotation is a fixture whose failure mode is the engine's. */
const page = (over: Partial<DayBand> = {}): DayBand => ({
  rung: "single",
  fill: "go",
  voice: "suggests",
  source: "inferred",
  figure: 62,
  head: { key: "w.home.band.singleDue", parts: { noun: "w.home.band.noun.swimming" } },
  say: [{ key: "w.home.band.saySince", values: { n: 5 } }],
  mark: "swimming",
  kinds: ["swimming"],
  ask: null,
  ...over,
});

const DECK: DayBand[] = [
  page(),
  page({
    head: { key: "w.home.band.singleDue", parts: { noun: "w.home.band.noun.running" } },
    mark: "running",
    kinds: ["running"],
  }),
  page({
    head: { key: "w.home.band.singleDue", parts: { noun: "w.home.band.noun.cycling" } },
    mark: "cycling",
    kinds: ["cycling"],
  }),
];

const commits = (container: HTMLElement) =>
  [...container.querySelectorAll("*")].filter((el) => el.textContent === "Train this instead" && !el.firstElementChild);

describe("the day band", () => {
  it("says the day, and says the scale of the number it says it with", () => {
    const { container } = renderScreen(<AuroraDayBand deck={[page()]} onExplain={() => {}} />);
    expect(container.textContent).toContain("A swim is due.");
    expect(container.textContent).toContain("5 days since your last one");
    // "69/100" is notation. The numeral prints it; the reader is told the words.
    expect(container.textContent).toContain("/100");
    expect(container.querySelector('[aria-label="62 out of 100"]')).toBeTruthy();
  });

  it("draws no deck chrome for a single page", () => {
    const { container } = renderScreen(
      <AuroraDayBand deck={[page()]} onExplain={() => {}} onPick={() => {}} />,
    );
    // An indicator that always shows one dot is decoration that means nothing,
    // and a page that IS the answer has nothing to commit to.
    expect(commits(container)).toHaveLength(0);
  });

  it("gives every page but the first exactly one commit", () => {
    const { container } = renderScreen(
      <AuroraDayBand deck={DECK} onExplain={() => {}} onPick={() => {}} />,
    );
    expect(container.textContent).toContain("A swim is due.");
    expect(container.textContent).toContain("A ride is due.");
    expect(commits(container)).toHaveLength(DECK.length - 1);
  });

  it("reports the page's OWN index, so the host rejects what ranked above it", () => {
    const onPick = vi.fn();
    const { container } = renderScreen(
      <AuroraDayBand deck={DECK} onExplain={() => {}} onPick={onPick} />,
    );
    const [first, second] = commits(container);
    fireEvent.click(first!);
    expect(onPick).toHaveBeenLastCalledWith(1);
    fireEvent.click(second!);
    expect(onPick).toHaveBeenLastCalledWith(2);
  });

  it("offers no commit at all when the host cannot take one", () => {
    const { container } = renderScreen(<AuroraDayBand deck={DECK} onExplain={() => {}} />);
    expect(commits(container)).toHaveLength(0);
  });

  it("asks for a rating only on the rung that asks for one", () => {
    const quiet = renderScreen(
      <AuroraDayBand deck={[page()]} onExplain={() => {}} onRate={() => {}} />,
    );
    expect(quiet.container.textContent).not.toContain("Rate");

    const asking = renderScreen(
      <AuroraDayBand
        deck={[page({ rung: "done", ask: "rate", head: { key: "w.home.band.doneRate" }, say: [] })]}
        onExplain={() => {}}
        onRate={() => {}}
      />,
    );
    expect(asking.container.textContent).toContain("How did that feel?");
    expect(asking.container.textContent).toContain("Rate");
  });

  it("renders nothing at all on the `none` rung", () => {
    const { container } = renderScreen(
      <AuroraDayBand deck={[page({ rung: "none", head: null, say: [] })]} onExplain={() => {}} />,
    );
    expect(container.textContent).toBe("");
  });
});
