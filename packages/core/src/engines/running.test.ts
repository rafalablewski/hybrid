import { describe, it, expect } from "vitest";
import { runTotals, runStats, weeklyMileage, paceEffortSplit, pacedRunMoves, isRunMove, runningSessions, enduranceSessions } from "./running";
import { cardioDiscipline, type LoggedSession } from "./session";

const NOW = new Date("2026-06-10T12:00:00.000Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const run = (id: string, started: string, name: string, distance?: number, minutes?: number, rpe?: number): LoggedSession => ({
  id,
  title: "Run",
  startedAt: started,
  blocks: [{ kind: "cardio", name, ...(distance ? { distance } : {}), ...(minutes ? { minutes } : {}), ...(rpe ? { rpe } : {}) }],
});

const sessions: LoggedSession[] = [
  run("1", daysAgo(2), "Easy Run", 8, 48, 5),
  run("2", daysAgo(5), "Easy Run", 10, 55, 6),
  run("3", daysAgo(9), "Row Intervals", 6, 30, 8),
  run("4", daysAgo(30), "Easy Run", 5, 32, 5),
  { id: "5", title: "Lift", startedAt: daysAgo(3), blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }] }] },
];

describe("running analytics", () => {
  it("runTotals sums efforts, distance and minutes across cardio only", () => {
    const t = runTotals(sessions);
    expect(t.efforts).toBe(4);
    expect(t.distanceKm).toBe(29); // 8 + 10 + 6 + 5
    expect(t.minutes).toBe(165); // 48 + 55 + 30 + 32
  });

  it("runStats aggregates per move with best pace + longest, most distance first", () => {
    const stats = runStats(sessions);
    expect(stats[0]!.move).toBe("Easy Run"); // 23 km total
    const easy = stats.find((s) => s.move === "Easy Run")!;
    expect(easy.efforts).toBe(3);
    expect(easy.longestKm).toBe(10);
    expect(easy.bestPaceSecPerKm).toBe(330); // 55min/10km = 5:30/km is the fastest of 6:00/6:24/5:30
  });

  it("pacedRunMoves lists moves with pace data by total distance", () => {
    expect(pacedRunMoves(sessions)).toEqual(["Easy Run", "Row Intervals"]);
  });

  it("weeklyMileage buckets distance into the last N weeks, oldest first", () => {
    const wk = weeklyMileage(sessions, 2, NOW);
    expect(wk).toHaveLength(2);
    expect(wk[1]!.km).toBe(18); // this week: 8 + 10
    expect(wk[0]!.km).toBe(6); // 7-14 days ago: Row Intervals (9 days ago)
  });

  it("paceEffortSplit zones a move's minutes relative to its best pace", () => {
    // One move, real spread: 4:00/km (hard, best), 5:00/km (+25% → easy).
    const runs: LoggedSession[] = [
      run("h", daysAgo(1), "Tempo Run", 10, 40), // 4:00/km
      run("e", daysAgo(2), "Tempo Run", 10, 50), // 5:00/km, 25% slower → easy
    ];
    const e = paceEffortSplit(runs);
    expect(e.hard).toBe(40);
    expect(e.easy).toBe(50);
    expect(e.moderate).toBe(0);
  });

  it("isRunMove: foot-races are runs; swims, rackets, rides, rows are not", () => {
    // Logged Olympic sports resolve through the catalog.
    expect(isRunMove("Running")).toBe(true);
    expect(isRunMove("Marathon")).toBe(true);
    expect(isRunMove("Swimming")).toBe(false);
    expect(isRunMove("Tennis")).toBe(false);
    expect(isRunMove("Road Cycling")).toBe(false);
    expect(isRunMove("Rowing")).toBe(false);
    // Generic / custom cardio names use the keyword test.
    expect(isRunMove("Easy Run")).toBe(true);
    expect(isRunMove("Tempo Run")).toBe(true);
    expect(isRunMove("Treadmill")).toBe(true);
    // A shared word must not leak a non-running modality through.
    expect(isRunMove("Row Intervals")).toBe(false);
    expect(isRunMove("Assault Bike")).toBe(false);
    expect(isRunMove("Canoe Sprint")).toBe(false);
  });

  it("cardioDiscipline classifies modality, keeping shared words from cross-leaking", () => {
    expect(cardioDiscipline("Easy Run")).toBe("running");
    expect(cardioDiscipline("Treadmill")).toBe("running");
    expect(cardioDiscipline("Swimming")).toBe("swimming");
    expect(cardioDiscipline("Road Cycling")).toBe("cycling");
    expect(cardioDiscipline("Row Intervals")).toBe("rowing");
    expect(cardioDiscipline("Canoe Sprint")).toBe("rowing"); // not running via "sprint"
    expect(cardioDiscipline("Ski Erg")).toBe("skiing"); // not rowing via "erg"
    expect(cardioDiscipline("Race Walking")).toBe("walking"); // a foot sport, not a run
    expect(cardioDiscipline("Tennis")).toBe("sport"); // timed Olympic sport
    expect(cardioDiscipline("Football")).toBe("sport");
    expect(cardioDiscipline("Cardio")).toBe("other"); // generic, endurance but unlabelled
  });

  it("a stamped discipline tag wins over the name", () => {
    // Named ambiguously but tagged: the tag decides, no name-guessing.
    const tagged: LoggedSession[] = [
      { id: "a", title: "am", startedAt: daysAgo(1), blocks: [{ kind: "cardio", name: "Recovery", discipline: "running", distance: 5, minutes: 30 }] },
      { id: "b", title: "run club", startedAt: daysAgo(2), blocks: [{ kind: "cardio", name: "Run Club Social", discipline: "sport", minutes: 45 }] },
    ];
    expect(runTotals(runningSessions(tagged)).efforts).toBe(1); // only the tagged run
    expect(runStats(runningSessions(tagged))[0]!.move).toBe("Recovery");
    // The "sport"-tagged one is excluded from endurance too; the run stays.
    expect(runTotals(enduranceSessions(tagged)).efforts).toBe(1);
  });

  it("enduranceSessions keeps swims/rides but drops non-endurance sports (tennis)", () => {
    const mixed: LoggedSession[] = [
      run("sw", daysAgo(1), "Swimming", 1.5, 40),
      run("bk", daysAgo(2), "Road Cycling", 30, 60),
      run("tn", daysAgo(3), "Tennis", undefined, 60),
      run("rn", daysAgo(4), "Easy Run", 8, 48),
    ];
    // Endurance = swim + bike + run (3 efforts); tennis excluded.
    expect(runTotals(enduranceSessions(mixed)).efforts).toBe(3);
    // Running screen still sees only the run.
    expect(runTotals(runningSessions(mixed)).efforts).toBe(1);
  });

  it("runningSessions strips non-running cardio so swims/tennis never count as runs", () => {
    // Two pool sessions + one tennis session — zero actual runs.
    const notRuns: LoggedSession[] = [
      run("s1", daysAgo(1), "Swimming", 1.5, 40),
      run("s2", daysAgo(3), "Swimming", 1.2, 35),
      run("t1", daysAgo(5), "Tennis", undefined, 60),
    ];
    expect(runTotals(runningSessions(notRuns)).efforts).toBe(0);

    // A mixed history keeps the runs, drops the rest.
    const mixed: LoggedSession[] = [...notRuns, run("r1", daysAgo(2), "Easy Run", 8, 48)];
    const filtered = runningSessions(mixed);
    const t = runTotals(filtered);
    expect(t.efforts).toBe(1);
    expect(t.distanceKm).toBe(8);
    expect(runStats(filtered).map((r) => r.move)).toEqual(["Easy Run"]);
    expect(pacedRunMoves(filtered)).toEqual(["Easy Run"]);
    // Strength blocks in the same session survive the filter untouched.
    const withLift = runningSessions([
      { id: "m", title: "Brick", startedAt: daysAgo(1), blocks: [
        { kind: "cardio", name: "Swimming", distance: 1, minutes: 30 },
        { kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }] },
      ] },
    ]);
    expect(withLift[0]!.blocks).toHaveLength(1);
    expect(withLift[0]!.blocks[0]!.name).toBe("Back Squat");
  });

  it("paceEffortSplit calls a tightly-clustered move steady (no false hard)", () => {
    // Two easy runs ~3% apart → not enough spread to judge intensity.
    const runs: LoggedSession[] = [
      run("a", daysAgo(1), "Easy Run", 10, 60), // 6:00/km
      run("b", daysAgo(2), "Easy Run", 10, 61.5), // ~6:09/km, ~2.5% slower
    ];
    const e = paceEffortSplit(runs);
    expect(e.hard).toBe(0);
    expect(e.easy).toBe(0);
    expect(e.moderate).toBe(122); // 60 + 61.5 minutes, both steady
  });
});
