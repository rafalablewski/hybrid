import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { HeatSignalRow, LoggedSession } from "@hybrid/core";
import { renderScreen } from "./render";
import DoneFloor from "../components/aurora/done-floor";

/**
 * A SAUNA ON A DAY NOBODY TRAINED.
 *
 * REPORTED AS: "sauna should be displayed even if there was no workouts." It
 * was not. The done floor read a day with no sessions as an EMPTY day and drew
 * the invitation ("a match, a run, a swim — it lands here") in place of the
 * list, and the logbook rail — whose `logged` flag counts sessions and only
 * sessions — did not mount the floor on such a day at all. So a rest-day
 * sitting, the most ordinary sauna there is, appeared on no surface that names
 * the day, while the engines had already scored it into readiness and MRV.
 *
 * Core was never the problem: `heatDayRows([], signals, …)` has always returned
 * the standalone sitting (engines/heat.test.ts). The floor is what dropped it,
 * which is why this gate mounts the floor rather than the function.
 */

vi.mock("../lib/api", () => ({
  fetchFlagState: async () => ({ flags: {}, values: {} }),
  fetchTranslationOverrides: async () => ({}),
}));

/** The two Signal rows one saved sitting writes, at one instant. */
const sitting = (at: Date, minutes = 20, tempC = 90): HeatSignalRow[] => {
  const ts = at.toISOString();
  return [
    { id: `m${ts}`, kind: "sauna", value: minutes, source: "manual", ts },
    { id: `t${ts}`, kind: "saunaTemp", value: tempC, source: "manual", ts },
  ];
};

/** Local noon today — squarely inside the viewed calendar day, whatever the
 *  runner's timezone. */
const noonToday = (): Date => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0);
};

const floor = (rows: LoggedSession[], heat: HeatSignalRow[], emptyCaption = true) => (
  <DoneFloor
    rows={rows}
    planIds={new Set<string>()}
    isToday
    dayLabel={null}
    units="kg"
    bw={() => null}
    heat={heat}
    logRow={false}
    emptyCaption={emptyCaption}
    onOpen={() => {}}
    onLog={() => {}}
    onDone={() => {}}
  />
);

const INVITATION = "a match, a run, a swim — it lands here";

describe("the done floor — a day with a sauna and no workout", () => {
  it("lists the sitting", () => {
    renderScreen(floor([], sitting(noonToday())));
    expect(screen.getByText("Sauna")).toBeTruthy();
    expect(screen.getByText("20 min")).toBeTruthy();
  });

  it("drops the empty-day invitation — something did land here", () => {
    renderScreen(floor([], sitting(noonToday())));
    expect(screen.queryByText(INVITATION)).toBeNull();
  });

  it("still speaks the invitation on a day holding nothing at all", () => {
    renderScreen(floor([], []));
    expect(screen.getByText(INVITATION)).toBeTruthy();
  });

  it("draws NOTHING on an empty day whose host already said it", () => {
    // The logbook rail's empty branch: a whole block of symbol, headline,
    // sentence and both log actions. `emptyCaption={false}` keeps the floor
    // from saying it a third time — and the floor must then contribute no
    // stray gap either, so it renders null rather than its seam.
    const { container } = renderScreen(floor([], [], false));
    expect(container.firstChild).toBeNull();
  });

  it("keeps drawing the sauna there — that is the whole point of the branch", () => {
    renderScreen(floor([], sitting(noonToday()), false));
    expect(screen.getByText("Sauna")).toBeTruthy();
  });
});
