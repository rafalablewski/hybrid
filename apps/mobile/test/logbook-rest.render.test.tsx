import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
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
 *   the day until midnight, and this card's other actions are gone in that
 *   state. It is no longer a pill — that shipped for one release and was cut
 *   as the loudest thing on a settled day — so the reversibility now rests
 *   entirely on the BLOCK being a button, which is exactly the kind of
 *   affordance that disappears in a refactor without a test on it.
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

  it("can always be taken back — the block itself is the undo", () => {
    const onDeclareRest = vi.fn();
    renderScreen(rail({ resting: true, onDeclareRest }));
    // No pill: the retraction is not a control of its own any more.
    expect(screen.queryByText("Not a rest day")).toBeNull();
    const block = screen.getByRole("button", { name: "Rest day" });
    fireEvent.click(block);
    expect(onDeclareRest).toHaveBeenCalledWith(expect.objectContaining({ isToday: true }), false);
  });

  it("puts the day's own record ABOVE the actions on an open day", () => {
    // DOM order, not presence: the floor and the pair both render either way,
    // and the bug is only ever which one comes first.
    const { container } = renderScreen(rail());
    const floor = container.querySelector('[data-testid="floor"]')!;
    expect(floor).toBeTruthy();
    // Node.compareDocumentPosition: 4 = the argument FOLLOWS the reference.
    expect(floor.compareDocumentPosition(screen.getByText("Rest")) & 4).toBeTruthy();
    expect(floor.compareDocumentPosition(screen.getByText("Gym")) & 4).toBeTruthy();
  });

  it("still ends on the record when the day is declared rest", () => {
    // Nothing to be above here — that state has no actions at all now. What
    // has to hold is the other half of the same rule: the floor is the LAST
    // thing on the card, under the day's own statement, never buried above it.
    const { container } = renderScreen(rail({ resting: true }));
    const floor = container.querySelector('[data-testid="floor"]')!;
    const block = screen.getByRole("button", { name: "Rest day" });
    expect(block.compareDocumentPosition(floor) & 4).toBeTruthy();
  });
});
