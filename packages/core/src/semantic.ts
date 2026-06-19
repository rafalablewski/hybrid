/**
 * SEMANTIC COLOR — the one place that says what each accent MEANS.
 *
 * The HYBRID palette (brand.ts) has five accents. A 2026-grade UI spends them as
 * a *vocabulary*, not decoration: a colour should mean the same thing on every
 * screen. This module is the single source of truth for state→colour, so the
 * web and mobile clients can't drift on thresholds or meaning.
 *
 *   go       → lime    — positive / on-track / "push" (high readiness, low risk)
 *   info     → blue    — neutral-good / informational (conditioning, "ok")
 *   premium  → violet  — AI coach / paid / programming
 *   caution  → amber   — watch it / deload / moderate risk
 *   danger   → red     — hold back / flagged / high risk
 *   neutral  → ash     — muted / not-yet / no data
 *
 * Clients map a role → their own colour value (mobile: the theme palette object;
 * web: a `var(--color-*)`), via ROLE_COLOR below — see roleColor() on each client.
 */

export type SemanticRole = "go" | "info" | "premium" | "caution" | "danger" | "neutral";

/** A brand accent key (a subset of ColorToken) every role maps onto. */
export type AccentKey = "lime" | "blue" | "violet" | "amber" | "red" | "ash";

/** role → brand accent key. The ONE mapping both clients resolve against. */
export const ROLE_COLOR: Record<SemanticRole, AccentKey> = {
  go: "lime",
  info: "blue",
  premium: "violet",
  caution: "amber",
  danger: "red",
  neutral: "ash",
};

/** Readiness 0–100 → state role (green → amber → red). */
export function readinessRole(v: number): SemanticRole {
  if (v >= 80) return "go";
  if (v >= 60) return "info";
  if (v >= 40) return "caution";
  return "danger";
}

/** Athlete-Twin HPI band → state role. */
export function hpiRole(band: string): SemanticRole {
  if (band === "peak" || band === "primed") return "go";
  if (band === "moderate") return "info";
  if (band === "compromised") return "caution";
  return "danger";
}

/** Injury-risk band → state role (low risk is good = go). */
export function riskRole(band: string): SemanticRole {
  if (band === "low") return "go";
  if (band === "moderate") return "info";
  if (band === "elevated") return "caution";
  return "danger";
}

/** Accountability band → state role. */
export function accountabilityRole(band: string): SemanticRole {
  if (band === "thriving" || band === "steady") return "go";
  if (band === "new" || band === "wobbling") return "info";
  if (band === "at-risk") return "caution";
  return "danger";
}

/** Training-week phase kind → role (a deload/recovery week is a caution accent). */
export function phaseRole(kind: string): SemanticRole {
  return kind === "recovery" ? "caution" : "go";
}
