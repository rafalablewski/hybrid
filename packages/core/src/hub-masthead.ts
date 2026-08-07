// THE HUB MASTHEAD — the head every Today-hub tab wears, as one contract.
//
// Dashboard, Performance and Feed are not three screens; they are ONE screen in
// three states. They already share the avatar row and the segmented control
// (Today hoists them into `hubHeader` and hands them down), but the chrome
// stopped at the control and each tab invented the head beneath it. Three
// authors invented three heads, and they agreed on nothing measurable:
//
//   title      34 literal   /  32 literal  /  fs.headline 22
//   tracking   -1           /  -1          /  unset
//   eyebrow    date + meta  /  " "         /  none
//   gap        16           /  0           /  12
//   collapse   yes          /  no          /  no
//
// …and web drifted again on top of that (Performance 34 against mobile's 32,
// and no Feed head at all). This file is the fix: ONE set of numbers, imported
// by twin components on both clients (apps/{web,mobile}/components/aurora/
// hub-masthead.tsx), so a hub head cannot be authored a fourth way.
//
// WHY ITS OWN CONTRACT AND NOT A HERO RANK. The HERO SYSTEM (hero.ts) owns
// PUSHED screens: it establishes a back affordance, a rail at a fixed y, a
// collapse track and a backdrop. A hub tab is not pushed and has none of those
// — it sits under chrome that is already on screen. Sharing hero's `HeroRank`
// would mean fabricating a rail and a nav action for a head that must not have
// them. What the two DO share is the step-down rule for a long title, and that
// is imported from hero.ts rather than copied.
//
// TRACKING IS IN dp, NOT em. hero.ts states its title tracking in em because a
// hero title is set at several sizes. The hub head is set at exactly one, and
// the app's own tracking scale (scale.ts) is in dp — so the hub follows the
// scale, like AHeading and ASection do, rather than the hero's em convention.
// One number, `tracking.display`, instead of the -1 / -1 / 0 that shipped.

import { titleStepDown } from "./hero";
import { fs, space, tracking } from "./scale";

/** The resolved type for a hub title, after the long-title step-down. */
export interface HubTitleType {
  size: number;
  lineHeight: number;
  /** dp on RN, px on web — NOT em. See the note above. */
  tracking: number;
  maxLines: number;
}

/**
 * THE CONTRACT. Five numbers, and the head is fully specified.
 *
 * The order down the block is: control, `gap.control`, the meta row, `gap.meta`,
 * the title, `gap.below`, the first content row. There is deliberately NO
 * subtitle slot — see the note on `HUB_MASTHEAD_HEIGHT`.
 */
export const HUB_MASTHEAD = {
  /** The metadata row: eyebrow on the left, one state value on the right.
   *  ALWAYS rendered, at a FIXED height, even when both slots are empty — the
   *  height is what keeps the title's y identical across the three tabs, and
   *  reserving it properly is what retires `season || " "`, the space character
   *  that was doing this job invisibly on both clients. */
  meta: { size: fs.micro, tracking: tracking.label, height: 15 },
  /** The title, at the top of the ladder. `fs.hero` is the rung Dashboard
   *  already shipped and the one the hub earns as the app's front door; the
   *  other two tabs come up to it rather than Dashboard coming down. */
  title: { size: fs.hero, lineHeight: 36, tracking: tracking.display, maxLines: 2 },
  /** Every gap in the block, from the space scale. No hand-typed 2 / 6 / 12. */
  gap: { control: space.lg, meta: space.xxs, below: space.lg },
  /** The scroll collapse, previously Dashboard's alone. Both clients read the
   *  SAME scroll signal they already collapse the nav on (mobile
   *  useNavScroll().collapse, web --scroll-collapse), so the three tabs cannot
   *  compress at three rates. */
  collapse: { titleScale: 0.76 },
} as const;

/**
 * The block's height at rest: meta row + gap + one line of title.
 *
 * IDENTICAL ON ALL THREE TABS, which is the whole point — the athlete switches
 * between them constantly, and before this the first content row moved by up to
 * 22 pt on every tap.
 *
 * There is no subtitle in the head. Feed's ("What your friends are training",
 * under a title that says Feed) said nothing the title didn't; Performance's
 * verdict line was worth keeping and moved DOWN into the state card, beside the
 * freshness score it explains. Reserving an empty sub line on the two tabs that
 * have none would have cost Dashboard 28 pt of head it has nothing to put in.
 *
 * A two-line title would grow the block. No title reaches it: the longest in
 * any shipped locale is "Performance" / "Wydajność", far short of the 28-char
 * step-down, so the second line is insurance, not a case.
 */
export const HUB_MASTHEAD_HEIGHT = HUB_MASTHEAD.meta.height + HUB_MASTHEAD.gap.meta + HUB_MASTHEAD.title.lineHeight;

/**
 * The title's type for a given string — the hub's one call.
 *
 * `scale` is the platform's Dynamic Type / browser text-size multiplier, honoured
 * the same way the hero honours it: the step-down decision is taken on the
 * UNSCALED string, so a user at 200% gets bigger type, not a different layout.
 */
export function hubTitleType(title: string, scale = 1): HubTitleType {
  const stepped = titleStepDown(HUB_MASTHEAD.title, title, scale);
  return { ...stepped, tracking: HUB_MASTHEAD.title.tracking, maxLines: HUB_MASTHEAD.title.maxLines };
}

/** The tone a meta value can carry on the RIGHT of the row. `plain` is the
 *  default ash; the two accents are for a value that is a STATE, never for
 *  emphasis — the training phase (amber) and a fresh count (lime). */
export type HubMetaTone = "plain" | "accent" | "fresh";
