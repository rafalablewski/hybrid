import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { monoWidthDp, fs, type ActivityRange, type LoggedSession, type SessionBlock } from "@hybrid/core";
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
    const { container } = renderScreen(
      block([bench("a", 1, [{ load: "70", reps: "9" }]), bench("b", 9, [{ load: "70", reps: "10" }])]),
    );
    const text = container.textContent ?? "";
    // The single record takes the QUOTE, whose arrival is the headline figure —
    // so the line beneath states the one thing the headline cannot, and states
    // it ONCE. (It used to reprint the whole pair under a figure that had just
    // said the same number 30dp above.)
    expect(text).toContain("from 70 × 9"); // where it came from
    expect(text).toContain("70");          // where it arrived — the hero
    expect(text).toContain("× 10");
    expect(screen.getByText("+1 rep")).toBeTruthy();
    expect(text).not.toContain("70 × 9 →"); // the pair is not printed twice
  });

  it("a load record at the SAME headline weight reads completely differently", () => {
    const { container } = renderScreen(
      block([bench("a", 1, [{ load: "65", reps: "8" }]), bench("b", 9, [{ load: "70", reps: "10" }])]),
    );
    expect(container.textContent ?? "").toContain("from 65 × 8");
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
    const text = document.body.textContent ?? "";
    expect(screen.getByText("+5 kg")).toBeTruthy(); // the heaviest thing lifted
    expect(screen.getByText("+1 rep")).toBeTruthy(); // the best set done
    // The rep record outranks the load one, so it takes the QUOTE and states
    // its origin as a sentence; the load record lands in the LEDGER, where the
    // pair stays a column because that is what lines records up against each
    // other. Both forms, one block, each carrying its own set.
    expect(text).toContain("from 70 × 9");        // the quote's origin
    expect(text).toContain("× 10");               // ...its arrival, the hero
    expect(screen.getByText("75 × 1")).toBeTruthy();  // the ledger's origin
    expect(screen.getByText("80 × 1")).toBeTruthy();  // ...and its arrival
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

  it("a debut says NEW once, and prints no origin it does not have", () => {
    // The em dash is the LEDGER's device: there the pair is a shape, so a first
    // record keeps the same shape as every other row instead of becoming a
    // special case. The quote is a sentence, and a sentence with no origin says
    // nothing — printing "New" as the origin AND as the delta, 8dp apart, is
    // exactly the doubling this block was rebuilt to remove.
    const { container } = renderScreen(block([bench("b", 9, [{ load: "80", reps: "4" }])]));
    expect(screen.getAllByText("New")).toHaveLength(1);
    expect(container.textContent ?? "").not.toContain("from ");
  });

  it("the LEDGER still gives a first-ever lift its em dash", () => {
    // Two lifts, so one takes the quote and the debut lands in the ledger.
    const squat = (id: string, on: number, sets: { load: string; reps: string }[]): LoggedSession =>
      ({
        id, title: "Legs", startedAt: new Date(day(on)).toISOString(),
        blocks: [{ kind: "strength", name: "Barbell Squat", sets }] as SessionBlock[],
      }) as LoggedSession;
    renderScreen(
      block([
        squat("sa", 1, [{ load: "100", reps: "4" }]),
        squat("sb", 9, [{ load: "100", reps: "9" }]),   // +125% reps → the quote
        bench("b", 9, [{ load: "80", reps: "4" }]),      // a debut → the ledger
      ]),
    );
    expect(screen.getByText("—")).toBeTruthy();
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

/**
 * THE LEDGER'S COLUMNS, MEASURED — the guard the confident comments were not.
 *
 * Every width in period-records.tsx was a guess with a note attached, and the
 * note was wrong: the arrival column reserved 62dp and claimed "`120.5 × 12`
 * is the widest real pair", which is 84dp of Söhne Mono at `fs.body`. It did
 * not fit, and neither did "100 × 10" — so the column was too narrow for the
 * ORDINARY case and had been cutting the figure it exists to show since it
 * shipped.
 *
 * jsdom does not truncate, so no render assertion can see this. Only
 * arithmetic can, and mono makes the arithmetic trivial: the width IS the
 * length, at a flat 0.6em.
 */
describe("the ledger's columns hold what the ledger can print", () => {
  /** `point()` = `${load} × ${reps}`. Ten characters is the cap: five for the
   *  load ("120.5", or "1,240" in pounds), three for " × ", two for the reps. */
  const PAIRS = ["120.5 × 12", "1,240 × 12", "100 × 10", "62.5 × 8", "7.5 × 20", "265 × 10"];
  /** Every delta the column can hold, in all three languages. */
  const DELTAS = [
    "+1 rep", "+12 reps", "+1 powt.", "+12 powt.", "+1 Wdh.", "+12 Wdh.",
    "New", "Nowy", "Neu", "+2.5 kg", "+12.5 kg", "+120.5 kg", "+5 lb", "+55 lb",
  ];
  const ORIGIN_W = 66, ARRIVAL_W = 92, DELTA_W = 78;

  it("holds every pair the ORIGIN column can print", () => {
    for (const p of PAIRS) expect(monoWidthDp(p, fs.nano), p).toBeLessThanOrEqual(ORIGIN_W);
  });

  it("holds every pair the ARRIVAL column can print", () => {
    for (const p of PAIRS) expect(monoWidthDp(p, fs.body), p).toBeLessThanOrEqual(ARRIVAL_W);
  });

  it("holds every delta, in all three languages", () => {
    for (const d of DELTAS) expect(monoWidthDp(d, fs.caption), d).toBeLessThanOrEqual(DELTA_W);
  });

  it("KNOWS THE OLD WIDTHS DID NOT, so the guard is known to be able to fail", () => {
    expect(monoWidthDp("120.5 × 12", fs.body)).toBeGreaterThan(62);   // the old ARRIVAL_W
    expect(monoWidthDp("100 × 10", fs.body)).toBeGreaterThan(62);     // ...and the ordinary case
    expect(monoWidthDp("120.5 × 12", fs.nano)).toBeGreaterThan(52);   // the old ORIGIN_W
    expect(monoWidthDp("+1 powt.", fs.caption)).toBeGreaterThan(58);  // the old DELTA_W
  });

  it("leaves the NAME a line it can never be cut on", () => {
    // The row stacks now, so the name shares its line with the delta only.
    // 366dp content column, less the delta's column and one 8dp gap.
    const forName = 366 - DELTA_W - 8;
    // The widest name in the catalogue, at fs.body. Measured with the SANS
    // table (the name is proportional), which is why this one uses a number
    // rather than a formula — see nameplate.test.ts for the ruler.
    expect(forName).toBeGreaterThan(170);
    // ...and on one line with the whole path, which is what it used to do, it
    // could not: 166 (name) + 162 (path) + 71 (delta) + 22 (gaps) = 421.
    expect(166 + ORIGIN_W + 18 + ARRIVAL_W + DELTA_W + 22).toBeGreaterThan(366);
  });
});
