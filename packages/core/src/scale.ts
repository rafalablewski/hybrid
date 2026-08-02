// Shared TYPE + SPACING scale — the single source of truth for sizing across
// BOTH clients (web + mobile). Before this, every fontSize/gap was an inline
// magic number duplicated in two separate trees with no shared definition,
// which is exactly how the admin console drifted ~1px smaller than the consumer
// app (same widths, smaller text → it read miniature). Screens now reference a
// named rung (fs.body, space.lg) so the two surfaces can't silently diverge.
//
// ONE map serves both clients. The data showed web and mobile already use the
// SAME integer ladder (11/12/13/14/16/18/26 …); they differed only in WHICH
// rungs each screen picked, not in the rungs available — so a single map is both
// accurate and the strongest guarantee against drift. If a genuine per-platform
// need ever appears, split into WEB_FS / MOBILE_FS here and the call sites
// (fs.body, …) won't have to change.

export type TypeRole =
  | "nano" //   10 — micro mono eyebrow labels (uppercase, tracked)
  | "micro" //  11 — tiny secondary labels
  | "caption" // 12 — meta / secondary text
  | "body" //   13 — default reading text
  | "bodyLg" // 14 — emphasised body / primary list line
  | "note" //   15 — small lead
  | "subtitle" //16 — small headings
  | "title" //  18 — section titles
  | "heading" //20 — screen sub-headings
  | "display" //26 — screen headings
  | "hero" //   34 — mastheads / cover titles
  | "stat"; //  46 — the one hero figure on a screen (ring kcal, exercise 1RM)

/** Font-size scale (fs.body = the default reading size). px on web, dp on RN.
 *  The ladder ends at `stat` on purpose: there is no rung above it, so a figure
 *  larger than 46 is a design smell, not a missing token. */
export const fs: Record<TypeRole, number> = {
  nano: 10,
  micro: 11,
  caption: 12,
  body: 13,
  bodyLg: 14,
  note: 15,
  subtitle: 16,
  title: 18,
  heading: 20,
  display: 26,
  hero: 34,
  stat: 46,
};

export type SpaceToken =
  | "none"
  | "xxs" //  4
  | "xs" //   6
  | "sm" //   8
  | "ms" //  10
  | "md" //  12
  | "lg" //  16
  | "xl" //  20
  | "xxl" // 24
  | "xxxl" //32
  | "huge"; //40

/** Spacing scale — gaps, padding, margins. Identical on both clients. */
export const space: Record<SpaceToken, number> = {
  none: 0,
  xxs: 4,
  xs: 6,
  sm: 8,
  ms: 10,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
};
