/**
 * FEEDBACK COLOUR — what the app says back to you, in the colours everybody
 * already knows: green succeeded, yellow warned, red failed.
 *
 * ── WHY THIS IS A SEPARATE LAYER FROM THE ACCENTS ──────────────────────────
 *
 * The brand palette (theme/tokens.ts) is four PANTONE colours, and it is a DATA
 * palette: Wild Lime through Fleur De Lis to Muskmelon is a continuum, and the
 * engines spend it as one — readiness bands, %1RM load, RPE heat, ACWR, the
 * conditioning wave. That ramp is right for training data and wrong for an
 * outcome, because those two things are not the same kind of statement:
 *
 *   A hard week is a READING. It sits somewhere on a scale, it is not a
 *   failure, and the app has always been careful to say so — "going over is a
 *   fact about the day and not an injury" (nutrition-picker-gap). Painting an
 *   elevated ACWR in error-red would tell an athlete their training is broken
 *   when what it is, is heavy.
 *
 *   A failed save is an OUTCOME. It is binary, it is about the app and not
 *   about the athlete, and the convention for it is a hundred years older than
 *   this product. Wild Lime at Lab hue 112° is a yellow-green and Muskmelon at
 *   56° is an orange; neither reads as "succeeded" or "failed" to anyone who
 *   has ever used a computer.
 *
 * So the roles in semantic.ts keep driving the DATA, and these four drive the
 * FEEDBACK: toasts, form validation, sync and connection state, destructive
 * confirms, commit results. A surface belongs here if it reports what just
 * happened; it belongs in ROLE_COLOR if it reports what the numbers say.
 *
 * ── WHAT IS ACTUALLY NEW HERE ──────────────────────────────────────────────
 *
 * Two hexes, not four. `warning` and `info` are existing brand values, because
 * they already ARE the conventional hue and inventing a second yellow to sit
 * beside Fleur De Lis would be exactly the near-duplicate this palette keeps
 * deleting (audit/12 §5.2, on the retired rating gold).
 *
 * ── THE RED IS THE TIGHT ONE, AND IT IS WHY A KIND HAS THREE VALUES ────────
 *
 * `error` is PANTONE Lava Falls, a deep brick red that measures 2.37:1 as type
 * on this ground — so it is the FILL, and the text tone is its own hue lifted.
 * The per-kind breakdown is on the entry itself; what belongs up here is the
 * shape that fell out of it: every kind carries `fill` / `ink` / `text`, and
 * `ink` is a field rather than a convention because Lava Falls is the one fill
 * dark enough to need CHALK on it while the other three need near-black.
 *
 * A colour picked for a chip printed on white will keep doing this. The palette
 * has now bent twice for it — Lyons Blue for the same reason, Lava Falls harder
 * — and both times the answer was the same: keep the specified value where it
 * can be seen, derive a relative of it where it cannot, and write the number
 * down. The tests hold every one of those pairings.
 */
import { colors } from "./tokens";
import { THEMES } from "./palette";

export type FeedbackKind = "success" | "warning" | "error" | "info";

/**
 * ONE OUTCOME, THREE VALUES — because a colour that has to work as a filled
 * banner AND as a line of red text cannot be one number on this ground.
 *
 * The accents solved the same problem years ago and the shape is copied from
 * them: `colors.blue` is the fill, `accentText.blue` is the tone it takes as
 * type. A feedback kind needs one more, `ink`, because two of these fills are
 * light and one is dark — so what sits ON them is not the same colour, and
 * leaving that to each call site is how you get white-on-yellow.
 */
export interface FeedbackTone {
  /** the filled surface — a banner, a destructive button, a swipe action */
  fill: string;
  /** the ink that sits ON `fill` (guarded ≥ AA against it) */
  ink: string;
  /** the same meaning drawn as TYPE on the card (guarded ≥ AA against it) */
  text: string;
}

export const FEEDBACK: Record<FeedbackKind, FeedbackTone> = {
  /**
   * PANTONE Green C #00ab84 — Lab hue 168°, L* 62. 6.14:1 as type on the card,
   * and near-black on it at 6.64. The one genuinely new hue in the system: the
   * brand had no green, because Wild Lime is a yellow-green (112°).
   * Its nearest neighbour anywhere in the palette is `ash` at ΔE 21.9.
   */
  success: { fill: "#00ab84", ink: THEMES.dark.onAccent, text: "#00ab84" },

  /** Fleur De Lis, unchanged. Lab hue 83° is already the conventional yellow, so
   *  the warning channel needed a NAME, not a new value. 8.05 as type. */
  warning: { fill: colors.amber, ink: THEMES.dark.onAccent, text: colors.amber },

  /**
   * PANTONE 18-1552 TCX LAVA FALLS #9a2b2e — and this one is split, for the same
   * reason Lyons Blue is.
   *
   * It measures **2.37:1** as type on the card: a deep brick red, correct on the
   * white chip it is specified against and unreadable here. That matters more
   * than it did for Lyons Blue, because an error is mostly TYPE — twenty form
   * validation lines, a toast, a field that has gone wrong — and those are the
   * one thing in the product that must not be hard to read.
   *
   * But it is excellent as a SURFACE: chalk on it is 7.04:1. So Lava Falls is
   * the `fill` verbatim, with `ink: chalk` — note this is the only kind whose ink
   * is NOT near-black, which is precisely why `ink` is a field rather than a
   * convention — and `text` is Lava Falls' own Lab hue angle (29°) lifted in L*
   * until it clears AA on the card.
   *
   * WHY #e06462, AND WHY IT MOVED ONCE ALREADY. The lift is squeezed from both
   * ends: below 4.5:1 it fails as type, and the brighter it goes the closer it
   * gets to Muskmelon — the brand's danger accent, at Lab hue 56° — which has to
   * stay ΔE 18 clear so a failed save and a falling figure never read as the
   * same statement. That is a corridor, not a target, and it is narrow.
   *
   * It was #dd5f5b (5.03:1, ΔE 19.2) while the card was #141614. Moving the card
   * to PANTONE Black Beauty put it at **4.47:1** — under AA, by 0.03 — and the
   * guard below caught it, which is the entire reason that guard is written
   * against `t.ink2` rather than against a number somebody typed. #e06462 is the
   * smallest lift that clears: 4.71:1 on the card, 5.72 on ink, ΔE 18.98 from
   * Muskmelon. Still Lava Falls' own hue, still inside the corridor at both ends.
   *
   * THE LESSON, since this is the second time this value has been re-derived: an
   * error TONE is a function of the surface it is read on. Change `ink2` and
   * this number is not "probably fine", it is a thing to re-measure.
   */
  error: { fill: "#9a2b2e", ink: colors.chalk, text: "#e06462" },

  /** Lyons Blue's text tone, which is light enough to be its own fill too. */
  info: { fill: THEMES.dark.accentText.blue, ink: THEMES.dark.onAccent, text: THEMES.dark.accentText.blue },
};
