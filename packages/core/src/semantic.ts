/**
 * SEMANTIC COLOR — the one place that says what each accent MEANS.
 *
 * The HYBRID palette (theme/tokens.ts) has four accents. A 2026-grade UI spends them as
 * a *vocabulary*, not decoration: a colour should mean the same thing on every
 * screen. This module is the single source of truth for state→colour, so the
 * web and mobile clients can't drift on thresholds or meaning.
 *
 *   go       → lime    — positive / on-track / "push" (high readiness, low risk)
 *   info     → blue    — neutral-good / informational (conditioning, "ok")
 *   premium  → amber   — paid / Full-upgrade cue          ┐ SAME COLOUR,
 *   caution  → amber   — watch it / deload / moderate risk ┘ see the note below
 *   danger   → red     — hold back / flagged / high risk
 *   neutral  → ash     — muted / not-yet / no data
 *
 * Clients map a role → their own colour value (mobile: the theme palette object;
 * web: a `var(--color-*)`), via ROLE_COLOR below — see roleColor() on each client.
 */

/**
 * PREMIUM AND CAUTION DELIBERATELY SHARE `amber`, and it is worth writing down
 * rather than discovering again (audit/12 §5.9 raised it).
 *
 * NOT SPLIT, because the alternative is worse: a fifth accent bought only for
 * commerce would have to clear ΔE 18 against all four in the accent-text
 * channel, and the palette is four colours BY DECISION. A colour that exists so
 * one CTA can be a different yellow is decoration.
 *
 * WHERE IT BITES, so a reviewer can spot it: only where a caution figure and an
 * upgrade cue are in the same viewport — the nutrition hub is the realistic one,
 * where "over target" and a Go-Full strip can co-occur. The separation there is
 * carried by FORM, not hue: a caution is type on the card, an upgrade is a
 * filled pill with ink on it. If a surface ever needs the two side by side in
 * the SAME form, that is the moment to reopen this, not before.
 */
export type SemanticRole = "go" | "info" | "premium" | "caution" | "danger" | "neutral";

/** A brand accent key (a subset of ColorToken) every role maps onto. */
export type AccentKey = "lime" | "blue" | "amber" | "red" | "ash";

/**
 * THE FOUR ACCENTS WITHOUT THE NEUTRAL — the set a thing picks from when it has
 * to have a colour, rather than being allowed to stay muted.
 *
 * WHY THIS EXISTS. Eleven types across core each declared their own subset of
 * the same handful of keys — LoadColor, FeelTone, ReadinessAccent,
 * ActivityAccent, FeedAccent, CoachAccent, BadgeAccent, RecipeTint, the mood
 * tone in notes.ts, PremiumAccentPreset, and an inline one in team-compare —
 * and not one of them referenced `AccentKey` (audit/12 §5.7). Each then needed
 * its own resolver to reach a hex, which is how the clients ended up with four
 * lookups doing one job.
 *
 * They are all ALIASES now, derived from this file. That is deliberately a
 * type-only change with no runtime effect: the values were already identical,
 * and the point is that the next edit to the palette cannot leave eight of them
 * behind. Where a domain genuinely uses fewer than four — a mood is never blue —
 * it says so with `Extract`, so it stays precise AND stays derived.
 */
export type BrandAccent = Exclude<AccentKey, "ash">;

/** role → brand accent key. The ONE mapping both clients resolve against. */
export const ROLE_COLOR: Record<SemanticRole, AccentKey> = {
  go: "lime",
  info: "blue",
  premium: "amber",
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

/** Performance-State HPI band → state role. */
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

/**
 * ACWR band → state role. Both ENDS of the ratio are a state, not a failure:
 * detraining is `info` rather than `caution`, because coming back off a quiet
 * spell is a fact about the last four weeks and not something to fix today —
 * the same reading `hpiRole` gives "moderate".
 */
export function acwrRole(band: string): SemanticRole {
  if (band === "sweet-spot") return "go";
  if (band === "detraining") return "info";
  if (band === "caution") return "caution";
  if (band === "danger") return "danger";
  return "neutral";
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
