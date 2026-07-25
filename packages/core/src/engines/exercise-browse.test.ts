import { describe, it, expect } from "vitest";
import {
  exerciseBucket,
  exerciseInitials,
  exerciseBrowse,
  exerciseBrowseSections,
  exerciseBrowseSummary,
  EXERCISE_BUCKET_ORDER,
} from "./exercise-browse";
import type { LoggedSession, SessionBlock } from "./session";

const NOW = Date.parse("2026-07-18T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

let uid = 0;
const session = (daysAgo: number, names: (string | [string, SessionBlock["kind"]])[]): LoggedSession => ({
  id: `s${uid++}`,
  title: "t",
  startedAt: new Date(NOW - daysAgo * DAY).toISOString(),
  blocks: names.map((n) => {
    const [name, kind] = Array.isArray(n) ? n : [n, "strength" as const];
    if (kind === "strength") return { kind, name, sets: [{ reps: "5", load: "100" }] };
    if (kind === "cardio") return { kind, name, minutes: 30 };
    return { kind, name, minutes: 10 };
  }),
});

describe("exerciseBucket", () => {
  it("maps DB lifts by pattern, with pattern beating the muscle-group heading", () => {
    expect(exerciseBucket("Back Squat")).toBe("legs");
    expect(exerciseBucket("Bulgarian Split Squat")).toBe("legs"); // lunge pattern
    expect(exerciseBucket("Deadlift")).toBe("posterior"); // filed under Back, hinge pattern wins
    expect(exerciseBucket("Good Morning")).toBe("posterior");
    expect(exerciseBucket("Bench Press")).toBe("push");
    expect(exerciseBucket("Barbell Row")).toBe("pull");
    expect(exerciseBucket("Snatch")).toBe("olympic");
    expect(exerciseBucket("Box Jump")).toBe("olympic"); // plyo under Olympic & Power
    expect(exerciseBucket("Plank")).toBe("core");
    expect(exerciseBucket("Farmer Carry")).toBe("core");
    expect(exerciseBucket("Sled Push")).toBe("engine"); // carry pattern, sled equipment
    expect(exerciseBucket("Jump Rope")).toBe("engine"); // plyo outside Olympic & Power
  });

  it("routes isolation lifts through their muscle-group heading", () => {
    expect(exerciseBucket("Lateral Raise")).toBe("push"); // Shoulders
    expect(exerciseBucket("DB Curl")).toBe("pull"); // Biceps
    expect(exerciseBucket("Leg Extension")).toBe("legs");
    expect(exerciseBucket("Lying Leg Curl")).toBe("posterior");
  });

  it("sends every non-strength kind to engine", () => {
    expect(exerciseBucket("Tennis", "cardio")).toBe("engine");
    expect(exerciseBucket("Mixed Metcon", "conditioning")).toBe("engine");
  });

  it("prefers a RESOLVED movement over the keyword guess", () => {
    // These names used to fall through to the keyword heuristic because nothing
    // in the catalog matched them — which also meant they logged zero load. They
    // now resolve (see the prescribed-name bridges in GYM_ALIASES), so they
    // bucket like the lift they actually ARE, agreeing with their canonical
    // entry instead of with a regex.
    expect(exerciseBucket("Clean Extension")).toBe("olympic"); // -> Clean Pull
    expect(exerciseBucket("Press")).toBe("push"); // -> Overhead Press
    // A snatch-grip pull from the floor is a hinge, and its canonical entry
    // buckets as posterior — so the eccentric/slow variants agree with it rather
    // than being pulled into "olympic" by the word "snatch".
    expect(exerciseBucket("Snatch-Grip Deadlift")).toBe("posterior");
    expect(exerciseBucket("Eccentric Snatch Deadlift")).toBe("posterior");
  });

  it("still falls back to keywords for a genuinely unknown name", () => {
    expect(exerciseBucket("Paused Competition Deadlift")).toBe("posterior");
    expect(exerciseBucket("Zercher Snatch Complex")).toBe("olympic"); // snatch beats nothing else
    expect(exerciseBucket("Some Obscure Movement")).toBe("other");
  });
});

describe("exerciseInitials", () => {
  it("takes the first letters of the first two words, skipping joiners", () => {
    expect(exerciseInitials("Back Squat")).toBe("BS");
    expect(exerciseInitials("Power Clean & Jerk")).toBe("PC");
    expect(exerciseInitials("Row Intervals")).toBe("RI");
  });
  it("takes the first two letters of a single word", () => {
    expect(exerciseInitials("Snatch")).toBe("SN");
    expect(exerciseInitials("Tennis")).toBe("TE");
  });
});

describe("exerciseBrowse — smart order", () => {
  it("lets a new block overtake a long-trained but dropped lift", () => {
    // A year of weekly rows, stopped 30 days ago; legs started this week.
    const sessions: LoggedSession[] = [];
    for (let w = 0; w < 52; w++) sessions.push(session(30 + w * 7, ["Barbell Row"]));
    sessions.push(session(2, ["Back Squat"]), session(5, ["Back Squat"]));
    const [first] = exerciseBrowse(sessions, NOW);
    expect(first!.name).toBe("Back Squat");
  });

  it("never ranks a this-week lift below something untouched for a month", () => {
    const sessions: LoggedSession[] = [];
    for (let d = 31; d < 90; d += 2) sessions.push(session(d, ["Bench Press"])); // huge old score
    sessions.push(session(5, ["Goblet Squat"])); // single recent use
    const order = exerciseBrowse(sessions, NOW).map((e) => e.name);
    expect(order.indexOf("Goblet Squat")).toBeLessThan(order.indexOf("Bench Press"));
  });

  it("decays: uses older than the 90-day window score zero", () => {
    const entries = exerciseBrowse([session(120, ["Deadlift"])], NOW);
    expect(entries[0]!.score).toBe(0);
    expect(entries[0]!.count).toBe(1);
  });

  it("flags staples (3 of the last 4 weeks) and stale established lifts", () => {
    const sessions = [
      session(2, ["Back Squat"]), session(9, ["Back Squat"]), session(16, ["Back Squat"]),
      session(21, ["Deadlift"]), session(28, ["Deadlift"]), session(35, ["Deadlift"]), session(42, ["Deadlift"]),
      session(21, ["Pallof Press"]), // only 1 use — not stale
    ];
    const by = new Map(exerciseBrowse(sessions, NOW).map((e) => [e.name, e]));
    expect(by.get("Back Squat")!.staple).toBe(true);
    expect(by.get("Back Squat")!.stale).toBe(false);
    expect(by.get("Deadlift")!.staple).toBe(false);
    expect(by.get("Deadlift")!.stale).toBe(true);
    expect(by.get("Pallof Press")!.stale).toBe(false);
  });
});

describe("exerciseBrowseSections", () => {
  const sessions = [
    session(1, ["Back Squat", ["Tennis", "cardio"]]),
    session(5, ["Snatch", "Deadlift"]),
  ];
  const entries = exerciseBrowse(sessions, NOW);

  it("smart mode orders buckets by their best-ranked entry", () => {
    const buckets = exerciseBrowseSections(entries, "smart").map((s) => s.bucket);
    expect(buckets[0]).toBe(entries[0]!.bucket);
    expect(new Set(buckets).size).toBe(buckets.length);
  });

  it("groups mode uses the canonical order and drops empty buckets", () => {
    const buckets = exerciseBrowseSections(entries, "groups").map((s) => s.bucket);
    expect(buckets).toEqual(EXERCISE_BUCKET_ORDER.filter((b) => buckets.includes(b)));
    expect(buckets).toContain("olympic");
    expect(buckets).not.toContain("push");
  });
});

describe("exerciseBrowseSummary", () => {
  it("counts in-rotation lifts and this week's sessions", () => {
    const sessions = [
      session(1, ["Back Squat"]),
      session(5, ["Snatch"]),
      session(21, ["Deadlift"]),
    ];
    const entries = exerciseBrowse(sessions, NOW);
    const sum = exerciseBrowseSummary(entries, sessions, NOW);
    expect(sum.inRotation).toBe(2);
    expect(sum.weekSessions).toBe(2);
  });
});
