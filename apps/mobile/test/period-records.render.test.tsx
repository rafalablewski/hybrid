import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { ActivityRange, LoggedSession, SessionBlock } from "@hybrid/core";
import { renderScreen } from "./render";
import PeriodRecords from "../components/aurora/period-records";

/**
 * RECORDS — THE QUOTE, THE PAIR, THE DELTA.
 *
 * The block's whole claim is that a record says what it MOVED BETWEEN, so the
 * gate is the pair reaching the screen: a rep record and a load record printing
 * different lines from the same headline weight is the case the old block could
 * not distinguish, and it is the first test here.
 */

vi.mock("../lib/api", () => ({
  fetchFlagState: async () => ({ flags: {}, values: {} }),
  fetchTranslationOverrides: async () => ({}),
}));

const day = (n: number): number => Date.parse(`2026-06-${String(n).padStart(2, "0")}T10:00:00.000Z`);

const bench = (id: string, on: number, sets: { load: string; reps: string }[]): LoggedSession =>
  ({
    id,
    title: "Push",
    startedAt: new Date(day(on)).toISOString(),
    blocks: [{ kind: "strength", name: "Barbell Bench Press", sets }] as SessionBlock[],
  }) as LoggedSession;

/** The window the Progress filter would hand down — the second week of June. */
const range: ActivityRange = { id: "w", from: day(8), through: day(14) } as ActivityRange;

const block = (sessions: LoggedSession[]) => (
  <PeriodRecords sessions={sessions} range={range} windowName="Last 7 days" units="kg" />
);

describe("Records — the path", () => {
  it("a rep record holds the load and moves the reps", () => {
    renderScreen(block([bench("a", 1, [{ load: "70", reps: "9" }]), bench("b", 9, [{ load: "70", reps: "10" }])]));
    expect(screen.getByText("70 × 9")).toBeTruthy(); // where it came from
    expect(screen.getByText("70 × 10")).toBeTruthy(); // where it arrived
    expect(screen.getByText("+1 rep")).toBeTruthy();
  });

  it("a load record at the SAME headline weight reads completely differently", () => {
    renderScreen(block([bench("a", 1, [{ load: "65", reps: "8" }]), bench("b", 9, [{ load: "70", reps: "10" }])]));
    expect(screen.getByText("65 × 8")).toBeTruthy();
    expect(screen.getByText("+5 kg")).toBeTruthy();
    expect(screen.queryByText("+1 rep")).toBeNull();
  });

  it("80 × 1 and 70 × 10 in one session file two records, each from its own set", () => {
    renderScreen(
      block([
        bench("a", 1, [{ load: "75", reps: "1" }, { load: "70", reps: "9" }]),
        bench("b", 9, [{ load: "70", reps: "10" }, { load: "80", reps: "1" }]),
      ]),
    );
    expect(screen.getByText("+5 kg")).toBeTruthy(); // the heaviest thing lifted
    expect(screen.getByText("+1 rep")).toBeTruthy(); // the best set done
    expect(screen.getByText("75 × 1")).toBeTruthy();
    expect(screen.getByText("80 × 1")).toBeTruthy();
    expect(screen.getByText("70 × 9")).toBeTruthy();
    expect(screen.getByText("70 × 10")).toBeTruthy();
  });

  it("a lift's second record sits under its first, and is not named twice", () => {
    // The squat's +25% on reps outranks both bench records, so it takes the
    // quote and BOTH bench rows land in the ledger — adjacent, named once.
    const squat = (id: string, on: number, sets: { load: string; reps: string }[]): LoggedSession =>
      ({
        id,
        title: "Legs",
        startedAt: new Date(day(on)).toISOString(),
        blocks: [{ kind: "strength", name: "Barbell Squat", sets }] as SessionBlock[],
      }) as LoggedSession;

    renderScreen(
      block([
        bench("a", 1, [{ load: "75", reps: "1" }, { load: "70", reps: "9" }]),
        squat("sa", 1, [{ load: "100", reps: "4" }]),
        bench("b", 9, [{ load: "70", reps: "10" }, { load: "80", reps: "1" }]),
        squat("sb", 9, [{ load: "100", reps: "5" }]),
      ]),
    );
    expect(screen.getAllByText("Barbell Squat")).toHaveLength(1); // the quote
    expect(screen.getAllByText("Barbell Bench Press")).toHaveLength(1); // two rows, one name
  });

  it("a first-ever lift takes an em dash for its origin", () => {
    renderScreen(block([bench("b", 9, [{ load: "80", reps: "4" }])]));
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
  });

  it("says nothing when the period holds no records", () => {
    const { container } = renderScreen(block([bench("a", 1, [{ load: "100", reps: "5" }]), bench("b", 9, [{ load: "80", reps: "5" }])]));
    expect(container.textContent).toBe("");
  });

  it("the quote prints the load with its unit and the reps as a multiplier", () => {
    // The figure is one Text with the unit nested inside it (so the unit can be
    // small and ash beside a stat-sized number), which is why this reads the
    // rendered text rather than querying for a single node.
    const { container } = renderScreen(
      block([bench("a", 1, [{ load: "65", reps: "8" }]), bench("b", 9, [{ load: "70", reps: "10" }])]),
    );
    expect(screen.getByText("Records")).toBeTruthy();
    expect(container.textContent).toContain("70 kg");
    expect(screen.getByText("× 10")).toBeTruthy(); // the reps, as a multiplier
  });
});
