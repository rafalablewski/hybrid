import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { LoggedSession } from "@hybrid/core";
import { renderScreen } from "./render";
import AuroraLogbookRail from "../components/aurora/logbook-rail";

/**
 * THE DAY THE ATHLETE CALLED, and where what they DID sits on the card.
 *
 * A logbook day had exactly two states — it held training, or it was empty —
 * and those are not the same as "I rested". An empty day is the app NOT
 * KNOWING, and it draws the invitation to log something, every day, at an
 * athlete who has decided today is for recovering. The plan rail has always had
 * a rest day because a program can prescribe one; the plan-less athlete had no
 * vocabulary for the same fact.
 *
 * Two structural things are checked here rather than by eye, because both
 * shipped wrong once already:
 *
 *   THE ORDER. The done floor went in under the action pair, which put a
 *   statement of what the athlete DID beneath two offers of what they could do
 *   — the card answering its own question after asking it. What happened comes
 *   first; the offer closes the block. Asserted on DOM order, since both nodes
 *   render either way and only their sequence carries the mistake.
 *
 *   THE RETRACTION. A rest day that cannot be taken back is a tap that traps
 *   the day, and this card's only other actions are gone in that state.
 */

vi.mock("../lib/api", () => ({
  fetchFlagState: async () => ({ flags: {}, values: {} }),
  fetchTranslationOverrides: async () => ({}),
}));

const noonToday = (): number => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0).getTime();
};

/** A session on ANOTHER day, so the account has history (the empty block's
 *  first-run tense) while today itself stays open. */
const older = (): LoggedSession => {
  const at = noonToday() - 3 * 86_400_000;
  return {
    id: "old",
    title: "Session",
    startedAt: new Date(at).toISOString(),
    completedAt: new Date(at + 3_600_000).toISOString(),
    blocks: [],
  } as unknown as LoggedSession;
};

/** The local day key the rail builds for today — what `restDays` holds. */
const todayKey = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

const FLOOR = <div data-testid="floor">Sauna 20 min</div>;

const rail = (opts: { resting?: boolean; onDeclareRest?: (d: unknown, r: boolean) => void } = {}) => (
  <AuroraLogbookRail
    sessions={[older()]}
    onLog={() => {}}
    onLogSport={() => {}}
    restDays={opts.resting ? new Set([todayKey()]) : new Set()}
    onDeclareRest={opts.onDeclareRest ?? (() => {})}
    doneFloor={FLOOR}
  />
);

describe("the logbook day — declaring rest", () => {
  it("offers Rest beside Gym and Sport on an open day", () => {
    renderScreen(rail());
    expect(screen.getByText("Gym")).toBeTruthy();
    expect(screen.getByText("Sport")).toBeTruthy();
    expect(screen.getByText("Rest")).toBeTruthy();
  });

  it("replaces the invitation with the rest day once declared", () => {
    renderScreen(rail({ resting: true }));
    expect(screen.getByText("Rest day")).toBeTruthy();
    expect(screen.queryByText("No training logged")).toBeNull();
    // …and it stops asking: a day just called a rest day must not still be
    // offering the two ways to train it.
    expect(screen.queryByText("Gym")).toBeNull();
    expect(screen.queryByText("Sport")).toBeNull();
  });

  it("can always be taken back", () => {
    renderScreen(rail({ resting: true }));
    expect(screen.getByText("Not a rest day")).toBeTruthy();
  });

  it("puts the day's own record ABOVE the actions, in both states", () => {
    // DOM order, not presence: the floor and the pair both render either way,
    // and the bug is only ever which one comes first.
    for (const resting of [false, true]) {
      const { container, unmount } = renderScreen(rail({ resting }));
      const floor = container.querySelector('[data-testid="floor"]')!;
      const action = screen.getByText(resting ? "Not a rest day" : "Rest");
      expect(floor).toBeTruthy();
      // Node.compareDocumentPosition: 4 = the argument FOLLOWS the reference.
      expect(floor.compareDocumentPosition(action) & 4).toBeTruthy();
      unmount();
    }
  });
});
