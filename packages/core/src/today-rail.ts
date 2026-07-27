import type { PlanDayStatus } from "./plan-schedule";
import type { ReadinessFeeling } from "./readiness-feeling";

// ============================================================
//  Today's pill rail — the sticky element the home screen leaves behind.
//
//  Scrolling past the logbook on Today used to drop every anchor at once: the
//  date, the week, the streak and the wordmark all left together and the rest
//  of the page floated with no sense of when it was. This engine owns the rule
//  that replaces them — a contracted rail, at most three pills, where each pill
//  is the RESIDUE OF A CARD YOU HAVE ALREADY READ:
//
//    date   ← the week strip        "when am I"
//    done   ← today's result        "did I train"
//    ready  ← the daily check-in    "how do I feel"
//
//  A pill is captured the moment its source card's bottom edge passes under the
//  bar, and released the moment that edge comes back — so the rail is always a
//  mirror of how far down the page you are, and it retracts in the order it
//  arrived. Pure and client-agnostic: web measures with getBoundingClientRect,
//  mobile with onLayout, and both feed the SAME numbers in here so the two
//  clients capture at identical points (see today-rail.tsx on both clients).
// ============================================================

/** The three pills, in the only order they may ever appear. */
export type TodayPillKey = "date" | "done" | "ready";

/** Fixed capture order — pills arrive left to right and never reshuffle. */
export const TODAY_RAIL_ORDER: readonly TodayPillKey[] = ["date", "done", "ready"] as const;

/** A fourth pill would make this a toolbar rather than a contracted capsule. */
export const TODAY_RAIL_MAX = 3;

/** The bar's own height (dp/px) — a source is "under the bar" once its bottom
 *  edge passes this far into the viewport. */
export const TODAY_RAIL_BAR_H = 46;

/** Release happens slightly LATER than capture so a pill can't strobe when the
 *  athlete rests a finger exactly on the threshold. */
export const TODAY_RAIL_HYSTERESIS = 6;

/** One source card, measured in content space (not viewport space): the
 *  distance from the top of the scrollable content to that card's bottom edge.
 *  `null` when the card isn't rendered at all (no check-in on screen, say) —
 *  that pill then never captures. */
export interface TodayRailSource {
  key: TodayPillKey;
  bottom: number | null;
}

export interface TodayRailState {
  /** captured pills, always a prefix-ordered subset of TODAY_RAIL_ORDER. */
  captured: TodayPillKey[];
  /** the bar itself is visible (≥1 pill). */
  pinned: boolean;
  /** at the ceiling, so the date sheds its month and dot track to make room. */
  tight: boolean;
}

export interface TodayRailOpts {
  /** override the bar height when a client's chrome differs. */
  barH?: number;
  /** release margin; 0 disables hysteresis. */
  hysteresis?: number;
  /** the previous frame's captured list, so release can lag capture. */
  prev?: readonly TodayPillKey[];
}

/**
 * Resolve the rail for a scroll position.
 *
 * A pill captures at `bottom - barH` and releases at `bottom - barH -
 * hysteresis`, so the two thresholds never coincide.
 */
export function todayRailState(
  sources: readonly TodayRailSource[],
  scrollY: number,
  opts: TodayRailOpts = {},
): TodayRailState {
  const barH = opts.barH ?? TODAY_RAIL_BAR_H;
  const hysteresis = Math.max(0, opts.hysteresis ?? TODAY_RAIL_HYSTERESIS);
  const prev = opts.prev ?? [];
  const captured: TodayPillKey[] = [];

  for (const key of TODAY_RAIL_ORDER) {
    const source = sources.find((s) => s.key === key);
    if (!source || source.bottom == null || !Number.isFinite(source.bottom)) continue;
    // Held pills use the looser threshold, so coming back up releases a touch
    // later than going down captured it.
    const threshold = source.bottom - barH - (prev.includes(key) ? hysteresis : 0);
    if (scrollY >= threshold) captured.push(key);
  }

  return {
    captured,
    pinned: captured.length > 0,
    tight: captured.length >= TODAY_RAIL_MAX,
  };
}

/** What the `done` pill says. `none` is the plan-less athlete who hasn't logged
 *  yet — the pill becomes a prompt rather than a verdict. */
export type TodayDoneState = "done" | "left" | "rest" | "none";

/**
 * Today's training verdict, from whichever of the two rails is mounted.
 *
 * Logbook mode passes no plan status and gets the honest binary; an enrolled
 * athlete gets the plan's own reading of the day.
 */
export function todayDoneState(opts: {
  loggedToday: boolean;
  planStatus?: PlanDayStatus | null;
}): TodayDoneState {
  if (opts.loggedToday) return "done";
  if (opts.planStatus === "rest") return "rest";
  if (opts.planStatus === "today" || opts.planStatus === "missed" || opts.planStatus === "upcoming") return "left";
  return "none";
}

/** Only a finished day earns the accent — the other states stay quiet so the
 *  rail reports rather than nags. */
export function todayDoneIsAccented(state: TodayDoneState): boolean {
  return state === "done";
}

/** The readiness pill's value. `null` — not checked in yet — is the state that
 *  matters most in the evening: the pill becomes the prompt. */
export type TodayReadyState = ReadinessFeeling | null;

// ── Motion ───────────────────────────────────────────────────────────────────
// Six named transitions and no others. Everything IN shares one overshoot
// curve so the rail has a single voice; everything OUT is roughly half the
// duration and flat, because a pill leaving should not ask to be watched.
// Contraction deliberately gets no overshoot — a bouncing date reads as a
// glitch rather than a decision.

/** A cubic-bézier's four control values, shared so web can print a
 *  `cubic-bezier(...)` string and mobile can feed `Easing.bezier(...)`. */
export type Bezier = readonly [number, number, number, number];

export interface RailMotion {
  ms: number;
  bezier: Bezier;
}

export const TODAY_RAIL_MOTION = {
  /** the bar arrives: fades up 7dp with its blur and hairline. */
  pin: { ms: 240, bezier: [0.2, 0.8, 0.2, 1] },
  /** a pill lands: 0.68 scale and zero width to full, with a slight overshoot. */
  bloom: { ms: 340, bezier: [0.34, 1.42, 0.64, 1] },
  /** the date sheds its month and dot track — no overshoot. */
  contract: { ms: 300, bezier: [0.4, 0, 0.2, 1] },
  /** the date's month and dots return, same curve. */
  expand: { ms: 300, bezier: [0.4, 0, 0.2, 1] },
  /** a pill leaves: half the bloom, and flat. */
  retract: { ms: 170, bezier: [0.4, 0, 1, 1] },
  /** the readiness value changes under a scale pulse. */
  rerate: { ms: 340, bezier: [0.34, 1.42, 0.64, 1] },
} as const satisfies Record<string, RailMotion>;

export type TodayRailMotionKey = keyof typeof TODAY_RAIL_MOTION;

/** Under reduced motion every transition above collapses to this: a short
 *  opacity fade, no scale, no overshoot. The rail still tells you exactly what
 *  it knows, it just stops performing. */
export const TODAY_RAIL_MOTION_REDUCED: RailMotion = { ms: 120, bezier: [0, 0, 1, 1] };

/** `cubic-bezier(…)` for a CSS transition. */
export const railCurve = (m: RailMotion): string => `cubic-bezier(${m.bezier.join(",")})`;

/** The transition timing for one named motion, honouring reduced motion. */
export function railMotion(key: TodayRailMotionKey, reduced = false): RailMotion {
  return reduced ? TODAY_RAIL_MOTION_REDUCED : TODAY_RAIL_MOTION[key];
}
