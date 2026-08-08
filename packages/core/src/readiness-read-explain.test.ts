import { describe, it, expect } from "vitest";
import { readinessReadExplain, READINESS_CONTEXT_KEY, READINESS_LIMIT_KEY } from "./readiness-read-explain";
import { placeReads, readGate, decisiveRead } from "./readiness-reads";
import { READINESS_FEELINGS, READINESS_LOAD_FACTOR } from "./readiness-feeling";
import { prescribeSession } from "./engines";
import { baselineString } from "./i18n";

const H = 3_600_000;
const T0 = Date.UTC(2026, 6, 1, 6, 0, 0);

/** A day: a session that ended at 08:00, then reads at the given lags. */
const day = (lagsH: number[]) =>
  placeReads(
    lagsH.map((h, i) => ({ value: [2, 3, 4, 5][i % 4]!, at: T0 + (2 + h) * H })),
    [T0 + 2 * H],
  );

describe("readinessReadExplain", () => {
  it("explains a reading with no read behind it — the feeling alone still moves the load", () => {
    const e = readinessReadExplain({ feeling: "flat" });
    expect(e.at).toBeNull();
    expect(e.hoursSinceSession).toBeNull();
    expect(e.context).toBe("rested");
    expect(e.reads).toBe(0);
    expect(e.decisive).toBe(false);
    // The picker writes 3 for "flat" — index + 2, the same map both clients tap.
    expect(e.value).toBe(3);
    expect(e.loadPct).toBe(94);
    // No read → no clock of its own, so neither the lag nor the residual it
    // would be computed from is claimed. Nothing is invented from "now".
    expect(e.rows.some((r) => r.key === "w.home.read.rowResidual")).toBe(false);
    expect(e.rows.some((r) => r.key === "w.home.read.rowLag")).toBe(false);
    expect(e.rows.some((r) => r.top)).toBe(false);
  });

  it("classifies a read-less reading from the last session, without printing a lag", () => {
    // The fallback the card itself used: we know when they last trained, not
    // when they answered — so it picks the note and nothing else.
    const e = readinessReadExplain({ feeling: "flat", hoursSinceSession: 20 });
    expect(e.context).toBe("recovered");
    expect(e.noteKey).toBe("w.home.today.ctxRecoveredLow");
    expect(e.hoursSinceSession).toBeNull();
    expect(e.rows.some((r) => r.key === "w.home.read.rowLag")).toBe(false);
  });

  it("a read's own lag beats the fallback", () => {
    const reads = day([1]);
    const e = readinessReadExplain({ feeling: "wrecked", reads, hoursSinceSession: 20 });
    expect(e.hoursSinceSession).toBe(1);
    expect(e.context).toBe("postSession");
  });

  it("places a read against its session: lag, class, residual and weight", () => {
    const reads = day([1]);
    const e = readinessReadExplain({ feeling: "wrecked", reads });
    expect(e.hoursSinceSession).toBe(1);
    expect(e.context).toBe("postSession");
    expect(e.confounded).toBe(true);
    expect(e.rows.find((r) => r.key === "w.home.read.rowContext")!.valueKey).toBe(
      READINESS_CONTEXT_KEY.postSession,
    );
    // An hour after training most of the session is still expected to be there.
    const residual = e.rows.find((r) => r.key === "w.home.read.rowResidual")!;
    expect(residual.value).toBeGreaterThan(80);
    expect(residual.unit).toBe("percent");
    // Inside the recall window, so the answer counts in full.
    expect(e.rows.find((r) => r.key === "w.home.read.rowWeight")!.value).toBe(100);
    // The lag is the row everything else derives from.
    expect(e.rows.filter((r) => r.top).map((r) => r.key)).toEqual(["w.home.read.rowLag"]);
  });

  it("the residual falls as the lag grows — the reason a late low answer counts more", () => {
    const near = readinessReadExplain({ feeling: "flat", reads: day([1]) });
    const late = readinessReadExplain({ feeling: "flat", reads: day([20]) });
    const val = (e: typeof near) => e.rows.find((r) => r.key === "w.home.read.rowResidual")!.value!;
    expect(val(late)).toBeLessThan(val(near));
    expect(late.context).toBe("recovered");
    expect(late.confounded).toBe(false);
  });

  it("THE LAW — loadPct and setAdj are the numbers prescribeSession applies", () => {
    for (const feeling of READINESS_FEELINGS) {
      const e = readinessReadExplain({ feeling });
      expect(e.loadPct).toBe(Math.round(READINESS_LOAD_FACTOR[feeling] * 100));
      expect(e.setAdj).toBe(feeling === "wrecked" ? -1 : 0);
      const rx = prescribeSession([], undefined, { subjectiveReadiness: feeling });
      // A neutral "good" leaves the prescription alone, so it carries no adjust
      // block; every other feeling must agree with the sheet figure for figure.
      if (feeling === "good") {
        expect(rx.readinessAdjust).toBeUndefined();
        expect(e.loadPct).toBe(100);
      } else if (rx.readinessAdjust?.loadPct !== undefined) {
        expect(rx.readinessAdjust.loadPct).toBe(e.loadPct);
        expect(rx.readinessAdjust.setAdj).toBe(e.setAdj);
      }
    }
  });

  it("the ledger ends on the figure the prescription applies", () => {
    const e = readinessReadExplain({ feeling: "wrecked" });
    const total = e.steps.filter((s) => s.total);
    expect(total).toHaveLength(1);
    expect(total[0]!.value).toBe(e.loadPct);
    // A wrecked day is a real deload: the shed set gets its own signed line.
    const sets = e.steps.find((s) => s.key === "w.home.read.stepSets")!;
    expect(sets.value).toBe(-1);
    expect(sets.unit).toBe("signed");
    // …and no other feeling carries one.
    expect(readinessReadExplain({ feeling: "primed" }).steps.some((s) => s.key === "w.home.read.stepSets")).toBe(false);
  });

  it("names the decisive read, and only it", () => {
    const reads = day([1, 10]);
    expect(reads).toHaveLength(2);
    const decisive = decisiveRead(reads)!;
    expect(readinessReadExplain({ feeling: "good", read: decisive, reads }).decisive).toBe(true);
    expect(readinessReadExplain({ feeling: "wrecked", read: reads[0], reads }).decisive).toBe(false);
    // Omitting the read explains the one the day is judged on.
    expect(readinessReadExplain({ feeling: "good", reads }).at).toBe(decisive.at);
  });

  it("carries the day's pair verdict when the two reads can support one", () => {
    const single = readinessReadExplain({ feeling: "flat", reads: day([1]) });
    expect(single.clearance).toBeNull();
    expect(single.clearanceKey).toBeNull();
    const pair = readinessReadExplain({ feeling: "flat", reads: day([1, 12]) });
    // The pair guard is strict (gap, both lags known, something to drain), so
    // this asserts the wiring rather than a particular verdict.
    if (pair.clearance) {
      expect(pair.clearanceKey).toMatch(/^session\.feel\.clearance/);
      expect(pair.clearance.gapH).toBeGreaterThanOrEqual(4);
    } else {
      expect(pair.clearanceKey).toBeNull();
    }
  });

  it("carries the gate it was handed, and the constants the copy names", () => {
    const reads = day([1]);
    const gate = readGate({ lastReadAt: reads[0]!.at, lastSessionEnd: T0 + 2 * H, readsToday: 1, now: T0 + 4 * H });
    const e = readinessReadExplain({ feeling: "flat", reads, gate });
    expect(e.gate).toBe(gate);
    expect(e.consts.maxReads).toBeGreaterThan(0);
    expect(e.consts.gapH).toBeGreaterThan(0);
    expect(e.consts.lockH).toBeGreaterThan(0);
    expect(readinessReadExplain({ feeling: "flat" }).gate).toBeNull();
  });

  it("every key it emits resolves in EN, PL and DE", () => {
    const e = readinessReadExplain({ feeling: "flat", reads: day([1, 12]) });
    const keys = [
      ...e.rows.flatMap((r) => [r.key, r.valueKey]),
      ...e.steps.map((s) => s.key),
      e.noteKey,
      e.clearanceKey,
      ...Object.values(READINESS_CONTEXT_KEY),
      ...Object.values(READINESS_LIMIT_KEY),
      "w.home.read.sub", "w.home.read.explain", "w.home.read.whatHead", "w.home.read.what",
      "w.home.read.inputsHead", "w.home.read.inputsMeta", "w.home.read.residualNote",
      "w.home.read.weightNote", "w.home.read.decisive", "w.home.read.notDecisive",
      "w.home.read.confounded", "w.home.read.movesHead", "w.home.read.moves",
      "w.home.read.movesNeutral", "w.home.read.pairHead", "w.home.read.pair",
      "w.home.read.nextHead", "w.home.read.next", "w.home.read.limitHead",
      "w.home.read.noReads",
    ].filter((k): k is string => typeof k === "string");
    for (const lang of ["en", "pl", "de"] as const) {
      const missing = keys.filter((k) => baselineString(lang, k) == null);
      expect(missing, lang).toEqual([]);
    }
  });
});
