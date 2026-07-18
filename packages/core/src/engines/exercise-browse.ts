import type { LoggedSession, SessionBlock } from "./session";
import { MOVEMENTS } from "./movements";
import { gymExercise } from "../exercise-db";

/**
 * Exercise-browse engine — powers the Exercises screen (the movement picker)
 * on BOTH clients: the decay-scored "Smart" order, the seven hybrid buckets
 * (movement-pattern-first with the muscle-group map folded in), and the
 * in-rotation / staple / stale signals. Pure; both clients consume this so the
 * list can never sort differently web vs mobile.
 */

export type ExerciseBucket = "olympic" | "legs" | "posterior" | "push" | "pull" | "core" | "engine" | "other";

/** Canonical bucket display order (the "Groups" view). */
export const EXERCISE_BUCKET_ORDER: ExerciseBucket[] = ["olympic", "legs", "posterior", "push", "pull", "core", "engine", "other"];

/** i18n key per bucket header (w.analyze.ex.bucket.*). */
export const EXERCISE_BUCKET_LABEL_KEY: Record<ExerciseBucket, string> = {
  olympic: "w.analyze.ex.bucket.olympic",
  legs: "w.analyze.ex.bucket.legs",
  posterior: "w.analyze.ex.bucket.posterior",
  push: "w.analyze.ex.bucket.push",
  pull: "w.analyze.ex.bucket.pull",
  core: "w.analyze.ex.bucket.core",
  engine: "w.analyze.ex.bucket.engine",
  other: "w.analyze.ex.bucket.other",
};

// The muscle-group heading → bucket map, used when a DB entry's pattern is
// non-directional (isolation). Pattern is the tiebreaker everywhere else — a
// deadlift filed under "Back" still lands in posterior because its pattern is
// hinge.
const CATEGORY_BUCKET: Record<string, ExerciseBucket> = {
  Chest: "push",
  Shoulders: "push",
  Triceps: "push",
  Back: "pull",
  Biceps: "pull",
  "Traps & Forearms": "pull",
  "Quads & Glutes": "legs",
  Calves: "legs",
  "Hamstrings & Glutes": "posterior",
  "Abs & Core": "core",
  "Olympic & Power": "olympic",
  "Carries & Conditioning": "engine",
};

// Keyword fallback for free-typed / plan-authored names the DB doesn't know
// ("Clean Extension", "Eccentric Snatch Deadlift", "Press"). Ordered: the
// Olympic family wins over the lift words it contains (snatch DEADLIFT).
const KEYWORD_BUCKETS: [RegExp, ExerciseBucket][] = [
  [/\b(snatch|clean|jerk)\b/, "olympic"],
  [/\b(deadlift|rdl|good morning|hip thrust|swing|hamstring|glute|nordic)\b/, "posterior"],
  [/\b(squat|lunge|step[- ]?up|pistol|leg)\b/, "legs"],
  [/\b(row|pull|chin|curl|pulldown|shrug|lat)\b/, "pull"],
  [/\b(press|push|dip|bench|fly|raise)\b/, "push"],
  [/\b(plank|carry|crunch|sit[- ]?up|hold|core|ab)\b/, "core"],
];

/** Which bucket an exercise belongs to. Cardio/conditioning always land in
 *  engine; strength resolves DB pattern → category → keyword → other. */
export function exerciseBucket(name: string, kind?: SessionBlock["kind"]): ExerciseBucket {
  if (kind && kind !== "strength") return "engine";
  const db = gymExercise(name);
  if (db) {
    switch (db.pattern) {
      case "olympic": return "olympic";
      case "squat":
      case "lunge": return "legs";
      case "hinge": return "posterior";
      case "push-h":
      case "push-v": return "push";
      case "pull-h":
      case "pull-v": return "pull";
      case "core": return "core";
      // Loaded carries read as core/trunk work; sled work is engine.
      case "carry": return db.equipment === "sled" ? "engine" : "core";
      // Jumps under Olympic & Power are power work; rope/burpee-style plyo is engine.
      case "plyo": return db.category === "Olympic & Power" ? "olympic" : "engine";
      case "isolation": return CATEGORY_BUCKET[db.category] ?? "other";
    }
  }
  const mv = MOVEMENTS[name];
  if (mv) {
    if (mv.pattern === "squat") return "legs";
    if (mv.pattern === "hinge") return "posterior";
    if (mv.pattern === "push") return "push";
    if (mv.pattern === "pull") return "pull";
    if (mv.pattern === "cond") return "engine";
  }
  const lower = name.toLowerCase();
  for (const [re, bucket] of KEYWORD_BUCKETS) if (re.test(lower)) return bucket;
  return "other";
}

/** Tile monogram: first letters of the first two words, or the first two
 *  letters of a single-word name ("Back Squat" → BS, "Snatch" → SN). */
export function exerciseInitials(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter((w) => /\p{L}/u.test(w) && !/^(and|the|of)$/i.test(w));
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

export interface ExerciseBrowseEntry {
  name: string;
  kind: SessionBlock["kind"];
  count: number;
  lastUsed: string; // ISO
  daysSince: number;
  /** Time-decayed use score: Σ 0.5^(daysAgo/14) over uses in the last 90 days. */
  score: number;
  bucket: ExerciseBucket;
  initials: string;
  /** Trained within the last 14 days — counts toward "in rotation". */
  inRotation: boolean;
  /** Trained in ≥3 distinct weeks of the last 4 — the current staples. */
  staple: boolean;
  /** An established lift (≥4 lifetime uses) untouched for ≥14 days. */
  stale: boolean;
}

const DAY = 24 * 60 * 60 * 1000;
const HALF_LIFE_DAYS = 14;
const SCORE_WINDOW_DAYS = 90;

/**
 * Every exercise the athlete has logged, in Smart order: recency tier first
 * (used this week → this month → older, so this week's rotation can never sink
 * below ancient history no matter how big the old score), then the decay score,
 * then last-used, then name. The decay half-life (14 d) means the score tracks
 * the CURRENT block — a year of a lift fades out ~a month after you stop it.
 */
export function exerciseBrowse(sessions: LoggedSession[], now: number = Date.now()): ExerciseBrowseEntry[] {
  const uses = new Map<string, { kind: SessionBlock["kind"]; times: number[]; lastUsed: string }>();
  for (const s of sessions) {
    const ts = Date.parse(s.startedAt);
    if (Number.isNaN(ts)) continue;
    for (const b of s.blocks) {
      const cur = uses.get(b.name);
      if (cur) {
        cur.times.push(ts);
        if (s.startedAt > cur.lastUsed) cur.lastUsed = s.startedAt;
      } else {
        uses.set(b.name, { kind: b.kind, times: [ts], lastUsed: s.startedAt });
      }
    }
  }
  const entries: ExerciseBrowseEntry[] = [];
  for (const [name, u] of uses) {
    let score = 0;
    const weeks = new Set<number>();
    let minDays = Infinity;
    for (const ts of u.times) {
      const d = Math.max(0, (now - ts) / DAY);
      if (d < minDays) minDays = d;
      if (d <= SCORE_WINDOW_DAYS) score += Math.pow(0.5, d / HALF_LIFE_DAYS);
      if (d <= 28) weeks.add(Math.floor(d / 7));
    }
    const daysSince = Math.floor(minDays);
    entries.push({
      name,
      kind: u.kind,
      count: u.times.length,
      lastUsed: u.lastUsed,
      daysSince,
      score,
      bucket: exerciseBucket(name, u.kind),
      initials: exerciseInitials(name),
      inRotation: daysSince <= 14,
      staple: weeks.size >= 3,
      stale: u.times.length >= 4 && daysSince >= 14,
    });
  }
  const tier = (e: ExerciseBrowseEntry) => (e.daysSince <= 7 ? 0 : e.daysSince <= 30 ? 1 : 2);
  return entries.sort(
    (a, b) => tier(a) - tier(b) || b.score - a.score || b.lastUsed.localeCompare(a.lastUsed) || a.name.localeCompare(b.name),
  );
}

export interface ExerciseBrowseSection {
  bucket: ExerciseBucket;
  labelKey: string;
  entries: ExerciseBrowseEntry[];
}

/**
 * Group Smart-ordered entries into bucket sections. "smart" orders the buckets
 * by their best-ranked entry (the active block's bucket leads); "groups" uses
 * the fixed canonical order. Rows keep their Smart order either way; empty
 * buckets are dropped.
 */
export function exerciseBrowseSections(entries: ExerciseBrowseEntry[], mode: "smart" | "groups"): ExerciseBrowseSection[] {
  const by = new Map<ExerciseBucket, ExerciseBrowseEntry[]>();
  for (const e of entries) {
    if (!by.has(e.bucket)) by.set(e.bucket, []);
    by.get(e.bucket)!.push(e);
  }
  const order = mode === "groups" ? EXERCISE_BUCKET_ORDER.filter((b) => by.has(b)) : [...by.keys()];
  return order.map((bucket) => ({ bucket, labelKey: EXERCISE_BUCKET_LABEL_KEY[bucket], entries: by.get(bucket)! }));
}

export interface ExerciseBrowseSummary {
  /** Distinct exercises trained within the last 14 days. */
  inRotation: number;
  /** Sessions logged within the last 7 days. */
  weekSessions: number;
}

/** The "This block" band numbers above the list. */
export function exerciseBrowseSummary(entries: ExerciseBrowseEntry[], sessions: LoggedSession[], now: number = Date.now()): ExerciseBrowseSummary {
  let weekSessions = 0;
  for (const s of sessions) {
    const ts = Date.parse(s.startedAt);
    if (!Number.isNaN(ts) && now - ts <= 7 * DAY && ts <= now) weekSessions++;
  }
  return { inRotation: entries.filter((e) => e.inRotation).length, weekSessions };
}
