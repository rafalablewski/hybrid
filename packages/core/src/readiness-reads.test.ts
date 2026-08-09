import { describe, it, expect } from "vitest";
import {
  readGate,
  placeReads,
  decisiveRead,
  decisiveFeeling,
  readTrend,
  readClearance,
  readReports,
  undoableRead,
  READ_UNDO_MIN,
  spentFromReadiness,
  MIN_RELOG_GAP_H,
  POST_SESSION_LOCK_H,
  MAX_READS_PER_DAY,
  READINESS_PAIR_WEIGHT,
} from "./readiness-reads";
import { MIN_PAIR_GAP_H, RESIDUAL_FLOOR, expectedResidual, COST_HIGH } from "./feel-timing";
import { RECOVERY_DUE_H } from "./feel-schedule";

const H = 3_600_000;
// 08:00 on an arbitrary day — the case that prompted this: train at eight.
const T0 = Date.parse("2026-03-04T08:00:00.000Z");

describe("re-log gate", () => {
  it("borrows its floors from the pair model rather than inventing new ones", () => {
    expect(MIN_RELOG_GAP_H).toBe(MIN_PAIR_GAP_H);
    expect(POST_SESSION_LOCK_H).toBe(RECOVERY_DUE_H);
  });

  it("always allows the day's first read, however recently you trained", () => {
    const g = readGate({ lastReadAt: null, lastSessionEnd: T0 + H, now: T0 + 1.5 * H });
    expect(g.open).toBe(true);
    expect(g.reason).toBe("first");
  });

  it("holds the second read until the session has had time to drain", () => {
    // Session ends 09:00, tapped "flat" at 09:30. Cadence alone would open at
    // 13:30; the session's recovery read isn't due until 15:00.
    const end = T0 + H;
    const read = end + 0.5 * H;
    const at13 = readGate({ lastReadAt: read, lastSessionEnd: end, now: end + 4.5 * H });
    expect(at13.open).toBe(false);
    expect(at13.reason).toBe("postSession");
    expect(at13.opensAt).toBe(end + POST_SESSION_LOCK_H * H);

    const at15 = readGate({ lastReadAt: read, lastSessionEnd: end, now: end + POST_SESSION_LOCK_H * H });
    expect(at15.open).toBe(true);
    expect(at15.wanted).toBe(true);
    expect(at15.reason).toBe("recovery");
  });

  it("opens fourteen hours later — the case the athlete reported", () => {
    const end = T0 + H;
    const read = end + 0.5 * H;
    const g = readGate({ lastReadAt: read, lastSessionEnd: end, now: read + 14 * H });
    expect(g.open).toBe(true);
    expect(g.msUntilOpen).toBe(0);
  });

  it("holds a read that is simply too soon after the last one, with no session", () => {
    const g = readGate({ lastReadAt: T0, lastSessionEnd: null, now: T0 + 2 * H });
    expect(g.open).toBe(false);
    expect(g.reason).toBe("cadence");
    expect(g.opensAt).toBe(T0 + MIN_RELOG_GAP_H * H);
    expect(g.msUntilOpen).toBe(2 * H);
  });

  it("does not re-lock for a session that had already drained before the last read", () => {
    // Trained at 08:00, read at 20:00 — the session is long gone, so only the
    // cadence clock applies and it opens four hours later, not six.
    const g = readGate({ lastReadAt: T0 + 12 * H, lastSessionEnd: T0, now: T0 + 16.5 * H });
    expect(g.open).toBe(true);
    expect(g.wanted).toBe(false);
  });

  it("stops asking once the day is full", () => {
    const g = readGate({ lastReadAt: T0, readsToday: MAX_READS_PER_DAY, now: T0 + 12 * H });
    expect(g.open).toBe(false);
    expect(g.reason).toBe("dayFull");
  });

  it("stops wanting a recovery read once the window has closed", () => {
    const g = readGate({ lastReadAt: T0 - 40 * H, lastSessionEnd: T0 - 40 * H, now: T0 });
    expect(g.open).toBe(true);
    expect(g.wanted).toBe(false);
  });
});

describe("taking back a mis-tap", () => {
  const read = (at: number, value = 3) => ({ at, value });

  it("offers the read just given back", () => {
    expect(undoableRead([read(T0)], T0 + 30_000)?.at).toBe(T0);
  });

  it("stops offering it once the window has run out", () => {
    expect(undoableRead([read(T0)], T0 + READ_UNDO_MIN * 60_000)).toBeNull();
    expect(undoableRead([read(T0)], T0 + 2 * H)).toBeNull();
  });

  it("only ever offers the LAST read — an earlier one is a measurement, not a slip", () => {
    const reads = [read(T0), read(T0 + 5 * H)];
    expect(undoableRead(reads, T0 + 5 * H + 60_000)?.at).toBe(T0 + 5 * H);
    // …and the morning's read is untouchable even while the evening's is fresh.
    expect(undoableRead([reads[0]!], T0 + 5 * H + 60_000)).toBeNull();
  });

  it("has nothing to offer on a day with no reads", () => {
    expect(undoableRead([], T0)).toBeNull();
  });

  it("treats a read stamped slightly ahead of the clock as just-given", () => {
    // The client stamps its own optimistic read; a skewed device must not lose
    // its undo because the server's clock is a second behind.
    expect(undoableRead([read(T0 + 2_000)], T0)?.at).toBe(T0 + 2_000);
  });
});

describe("placing a read on the shared curve", () => {
  it("reflects readiness onto the spentness scale", () => {
    expect(spentFromReadiness(5)).toBe(1); // primed = nothing to drain
    expect(spentFromReadiness(2)).toBe(4); // wrecked
  });

  it("reads the same tap differently an hour out and fourteen hours out", () => {
    const end = T0;
    const [soon, later] = placeReads(
      [
        { value: 3, at: end + 1 * H }, // flat, in the gym
        { value: 3, at: end + 14 * H }, // flat, that evening
      ],
      [end],
    );
    expect(soon!.confounded).toBe(true);
    expect(soon!.context).toBe("postSession");
    expect(later!.confounded).toBe(false);
    // Identical taps, and the later one costs materially more — the whole point.
    expect(later!.reading.cost).toBeGreaterThan(soon!.reading.cost);
    expect(soon!.reading.cost).toBeLessThan(COST_HIGH);
    expect(later!.reading.cost).toBeGreaterThan(COST_HIGH);
  });

  it("degrades to the raw report when the athlete hasn't trained", () => {
    const [r] = placeReads([{ value: 3, at: T0 }], []);
    expect(r!.hoursSinceSession).toBeNull();
    expect(r!.context).toBe("rested");
    expect(r!.reading.expected).toBe(1);
  });

  it("places against the session before it, not the newest one", () => {
    const reads = placeReads([{ value: 4, at: T0 + 5 * H }], [T0, T0 + 30 * H]);
    expect(reads[0]!.hoursSinceSession).toBe(5);
  });

  it("drops nonsense values rather than storing them", () => {
    expect(placeReads([{ value: 0, at: T0 }, { value: 9, at: T0 }, { value: 3, at: NaN }])).toEqual([]);
  });

  it("returns reads oldest first whatever order they arrive in", () => {
    const reads = placeReads([{ value: 4, at: T0 + 9 * H }, { value: 2, at: T0 }], [T0 - H]);
    expect(reads.map((r) => r.value)).toEqual([2, 4]);
  });
});

describe("the decisive read", () => {
  const end = T0;
  const day = () =>
    placeReads(
      [
        { value: 2, at: end + 1 * H }, // wrecked, straight after training
        { value: 4, at: end + 14 * H }, // good, that evening
      ],
      [end],
    );

  it("is the latest read that isn't the session talking", () => {
    expect(decisiveRead(day())!.value).toBe(4);
    expect(decisiveFeeling(day())).toBe("good");
  });

  it("does not let a fresh post-session tap overwrite the day's real read", () => {
    // Evening read logged, then a late second session and a tap right after it.
    const reads = placeReads(
      [
        { value: 4, at: end + 14 * H },
        { value: 2, at: end + 26 * H },
      ],
      [end, end + 25 * H],
    );
    expect(decisiveRead(reads)!.value).toBe(4);
  });

  it("falls back to the latest read when every read is confounded", () => {
    const reads = placeReads([{ value: 3, at: end + 1 * H }, { value: 2, at: end + 2 * H }], [end]);
    expect(decisiveRead(reads)!.value).toBe(2);
  });

  it("is null for a day with no reads", () => {
    expect(decisiveRead([])).toBeNull();
    expect(decisiveFeeling([])).toBeNull();
  });
});

describe("the day's trend", () => {
  it("has no direction from a single read", () => {
    expect(readTrend(placeReads([{ value: 3, at: T0 }], [T0 - H]))).toBeNull();
  });

  it("names a day that recovered and one that didn't", () => {
    const up = readTrend(placeReads([{ value: 2, at: T0 }, { value: 4, at: T0 + 10 * H }], [T0 - H]));
    expect(up!.trend).toBe("climbing");
    expect(up!.delta).toBe(2);
    const down = readTrend(placeReads([{ value: 4, at: T0 }, { value: 2, at: T0 + 10 * H }], [T0 - H]));
    expect(down!.trend).toBe("sinking");
  });
});

describe("clearance from a day's two reads", () => {
  const end = T0;

  it("measures an athlete still carrying the session against one who cleared it", () => {
    const stillThere = readClearance(
      placeReads([{ value: 2, at: end + 1 * H }, { value: 2, at: end + 14 * H }], [end]),
    );
    expect(stillThere!.clearance).toBe("slow");
    const cleared = readClearance(
      placeReads([{ value: 2, at: end + 1 * H }, { value: 5, at: end + 14 * H }], [end]),
    );
    expect(cleared!.clearance).toBe("fast");
  });

  it("counts for less than a direct session report", () => {
    const c = readClearance(placeReads([{ value: 2, at: end + 1 * H }, { value: 3, at: end + 14 * H }], [end]))!;
    expect(c.weight).toBeLessThanOrEqual(READINESS_PAIR_WEIGHT);
  });

  it("refuses a pair the maths cannot support", () => {
    // Reads too close together.
    expect(
      readClearance(placeReads([{ value: 2, at: end + 1 * H }, { value: 3, at: end + 3 * H }], [end])),
    ).toBeNull();
    // Nothing to drain: the athlete walked out fine.
    expect(
      readClearance(placeReads([{ value: 5, at: end + 1 * H }, { value: 4, at: end + 14 * H }], [end])),
    ).toBeNull();
    // One read is no pair.
    expect(readClearance(placeReads([{ value: 2, at: end + 1 * H }], [end]))).toBeNull();
  });
});

describe("what the engine is handed", () => {
  const end = T0;
  const day = { date: "2026-03-04T00:00:00.000Z", soreness: 3, sleep: 4, energy: 2, mood: 3 };

  it("passes a read-less day through untouched", () => {
    expect(readReports(day, [])).toEqual([day]);
  });

  it("gives every value the clock it was actually answered on", () => {
    const reads = placeReads([{ value: 2, at: end + 1 * H }, { value: 4, at: end + 14 * H }], [end]);
    const [base, ...rest] = readReports({ ...day, loggedAt: new Date(end + 1 * H).toISOString() }, reads);
    // THE REGRESSION THIS GUARDS: freshness/sleep/mood are answered once, in one
    // sitting. Stamping them with the newest read would re-read a freshness
    // answer given an hour after training as one given fourteen hours after it
    // — and cost divides by the residual expected at that lag, so it would
    // inflate by ~2x for no reason but bookkeeping.
    expect(base!.sleep).toBe(4);
    expect(Date.parse(base!.loggedAt!)).toBe(end + 1 * H);
    expect(base!.energy).toBeNull();
    // …and each read travels on its own clock, carrying nothing it didn't answer.
    expect(rest.map((r) => [r.energy, Date.parse(r.loggedAt!) - end] as const)).toEqual([
      [2, 1 * H],
      [4, 14 * H],
    ]);
    for (const r of rest) {
      expect(r.soreness).toBeUndefined();
      expect(r.sleep).toBeUndefined();
      expect(r.mood).toBeUndefined();
    }
  });

  it("answers freshness, sleep and mood exactly once however many reads there are", () => {
    const reads = placeReads(
      [{ value: 2, at: end + 1 * H }, { value: 3, at: end + 7 * H }, { value: 4, at: end + 14 * H }],
      [end],
    );
    const reports = readReports(day, reads);
    expect(reports).toHaveLength(4); // the day, plus one per read
    expect(reports.filter((r) => r.sleep != null)).toHaveLength(1);
    expect(reports.filter((r) => r.energy != null)).toHaveLength(3);
  });

  it("passes a single-read day through exactly as the engine always saw it", () => {
    const reads = placeReads([{ value: 3, at: end + 9 * H }], [end]);
    expect(readReports(day, reads)).toEqual([day]);
  });
});

describe("the curve these reads are placed on", () => {
  it("is the one feel-timing already owns", () => {
    expect(expectedResidual(0)).toBe(1);
    expect(expectedResidual(1000)).toBeCloseTo(RESIDUAL_FLOOR, 5);
  });
});
