/**
 * Achievements — real, earned training milestones (the Profile's badges).
 *
 * Pure + deterministic: everything is computed straight from the athlete's
 * logged sessions (no fabricated state). Each category is tiered; we surface the
 * highest tier already EARNED plus the next tier still LOCKED (with progress),
 * so the badge rail shows both what you've banked and what's in reach.
 */

import type { LoggedSession } from "./session";
import { bwAt, type BodyweightInput } from "../bodyweight";
import { sessionVolume } from "./session";
import { bestE1rmMap, lifetimePrCount } from "./records";
import { deviceTrueSessions } from "../device-truth";
import { fmtKm } from "../distance";

const DAY = 86_400_000;

export interface Achievement {
  /** stable id, e.g. "strength-200" */
  id: string;
  /** short title, e.g. "200kg Club" */
  label: string;
  /** emoji glyph rendered identically on both clients */
  icon: string;
  /** true once the milestone is banked */
  earned: boolean;
  /** human detail, e.g. "best e1RM 221 kg" */
  detail: string;
  /** progress toward the tier, 0..1 (1 when earned) */
  progress: number;
}

/** Longest run of consecutive calendar weeks that each held ≥1 session. */
export function longestWeekStreak(sessions: LoggedSession[]): number {
  const weeks = new Set<number>();
  for (const s of sessions) weeks.add(Math.floor(Date.parse(s.startedAt) / DAY / 7));
  if (weeks.size === 0) return 0;
  const sorted = [...weeks].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i]! - sorted[i - 1]! === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** Furthest single cardio effort ever logged, in km. */
function longestRunKm(sessions: LoggedSession[]): number {
  let max = 0;
  // The furthest you actually went — the device's distance when it measured it.
  for (const s of deviceTrueSessions(sessions))
    for (const b of s.blocks)
      if (b.kind === "cardio" && typeof b.distance === "number") max = Math.max(max, b.distance);
  return max;
}

interface Cat {
  key: string;
  icon: string;
  value: number;
  tiers: number[];
  /** badge title for a tier threshold */
  label: (tier: number) => string;
  /** detail line (gets the athlete's current value) */
  detail: (value: number, tier: number) => string;
}

function badgesFor(c: Cat): Achievement[] {
  const out: Achievement[] = [];
  let earnedTier = 0;
  for (const t of c.tiers) if (c.value >= t) earnedTier = t;
  if (earnedTier > 0)
    out.push({ id: `${c.key}-${earnedTier}`, label: c.label(earnedTier), icon: c.icon, earned: true, detail: c.detail(c.value, earnedTier), progress: 1 });
  const next = c.tiers.find((t) => t > earnedTier);
  if (next != null)
    out.push({ id: `${c.key}-${next}`, label: c.label(next), icon: c.icon, earned: false, detail: c.detail(c.value, next), progress: Math.min(1, c.value / next) });
  return out;
}

/**
 * The athlete's achievement set — earned badges first (most recent tier per
 * category), then the next locked tier in each category with its progress.
 */
export function computeAchievements(sessions: LoggedSession[], bw?: BodyweightInput): Achievement[] {
  const tonnage = sessions.reduce((n, s) => n + sessionVolume(s.blocks, false, bwAt(bw, s.startedAt)), 0);
  const maxE1rm = Math.max(0, ...bestE1rmMap(sessions, bw).values());
  const prs = lifetimePrCount(sessions);
  const weekRun = longestWeekStreak(sessions);
  const runKm = longestRunKm(sessions);

  const cats: Cat[] = [
    {
      key: "strength",
      icon: "🏆",
      value: maxE1rm,
      tiers: [100, 140, 180, 220],
      label: (t) => `${t}kg Club`,
      detail: (v) => `best e1RM ${Math.round(v)} kg`,
    },
    {
      key: "streak",
      icon: "🔥",
      value: weekRun,
      tiers: [4, 8, 12, 26, 52],
      label: (t) => `${t}-week streak`,
      detail: (v) => `${v} weeks in a row`,
    },
    {
      key: "sessions",
      icon: "📒",
      value: sessions.length,
      tiers: [25, 50, 100, 250, 500],
      label: (t) => `${t} sessions`,
      detail: (v) => `${v} logged`,
    },
    {
      key: "tonnage",
      icon: "🏋️",
      value: tonnage,
      tiers: [50_000, 100_000, 500_000, 1_000_000],
      label: (t) => (t >= 1_000_000 ? "Million kg" : `${Math.round(t / 1000)}t moved`),
      detail: (v) => `${(v / 1000).toFixed(1)}t lifted all-time`,
    },
    {
      key: "prs",
      icon: "⚡",
      value: prs,
      tiers: [5, 10, 25, 50],
      label: (t) => `${t} PRs`,
      detail: (v) => `${v} records broken`,
    },
    {
      key: "run",
      icon: "🏃",
      value: runKm,
      tiers: [5, 10, 21, 42],
      label: (t) => (t >= 42 ? "Marathon" : t >= 21 ? "Half marathon" : `${t}K run`),
      detail: (v) => (v > 0 ? `furthest ${fmtKm(v)}` : "no runs yet"),
    },
  ];

  const all = cats.flatMap(badgesFor);
  // Earned first (preserving category order), then locked next-tiers.
  return [...all.filter((a) => a.earned), ...all.filter((a) => !a.earned)];
}
