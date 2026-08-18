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
 * `warning` and `info` are existing brand values, because
 * they already ARE the conventional hue and inventing a second yellow to sit
 * beside Fleur De Lis would be exactly the near-duplicate this palette keeps
 * deleting (audit/12 §5.2, on the retired rating gold).
 *
 * ── THE RED IS THE TIGHT ONE, AND IT IS WHY A KIND HAS THREE VALUES ────────
 *
 * `error` is PANTONE Lava Falls, a deep brick red that measures 2.11:1 as type
 * on this ground — so it is the FILL, and the text tone is its own hue lifted.
 * The per-kind breakdown is on the entry itself; what belongs up here is the
 * shape that fell out of it: every kind carries `fill` / `ink` / `text`, and
 * `ink` is a field rather than a convention because Lava Falls is the one fill
 * dark enough to need CHALK on it while the other three need near-black.
 *
 * A colour picked for a chip printed on white will keep doing this. The palette
 * has now bent for it twice — Lyons Blue for the same reason, Lava Falls harder
 * — and the answer was the same both times: keep the specified value where it
 * can be seen, derive a relative of it where it cannot, and write the number
 * down. Where even that is not enough, take a SECOND Pantone for the second
 * job, which is what the error channel now does. The tests hold every pairing.
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
   * PANTONE Green C #00ab84 — Lab hue 168°, L* 62. 5.46:1 as type on the card,
   * and near-black on it at 6.64. The one genuinely new hue in the system: the
   * brand had no green, because Wild Lime is a yellow-green (112°).
   * Its nearest neighbour anywhere in the palette is `ash` at ΔE 20.2 — that
   * distance shortened when `ash` became PANTONE Slate Gray, which is cooler
   * and therefore closer to a green. Still clear of the ΔE 18 floor.
   */
  success: { fill: "#00ab84", ink: THEMES.dark.onAccent, text: "#00ab84" },

  /**
   * Fleur De Lis, unchanged — the warning channel needed a NAME, not a new
   * value. 7.16 as type on the card.
   *
   * IT IS A GOLDEN YELLOW, NOT "the conventional yellow", which is what this
   * comment used to say and is imprecise. Unique yellow — the hue where the
   * red/green opponent channel balances — sits at 92° in CIELAB (90° in
   * CIECAM02). Fleur De Lis measures 83.1°, so it is ~9° warm of that locus: a
   * gold leaning orange. It is still classified as a yellow, and virtually every
   * industry warning yellow is a warm gold for the same reason — pure unique
   * yellow is too light to hold contrast as type or as an icon.
   *
   * A SECOND CAVEAT ON THE SOURCE, since TPM is not TCX: 20-0047 TPM belongs to
   * Pantone's METALLIC SHIMMERS textile library, whose chips carry actual
   * shimmer pigment. A hex can only express the base tone — the metallic
   * behaviour does not survive the translation, and a screen renders #daa51d as
   * an ordinary flat gold. Citing the chip as the origin is fair; expecting the
   * "premium" quality the metal implies to arrive with the hex is not.
   */
  warning: { fill: colors.amber, ink: THEMES.dark.onAccent, text: colors.amber },

  /**
   * PANTONE 18-1552 TCX LAVA FALLS #9a2b2e — and this one is split, for the same
   * reason Lyons Blue is.
   *
   * It measures **2.11:1** as type on the card: a deep brick red, correct on the
   * white chip it is specified against and unreadable here. That matters more
   * than it did for Lyons Blue, because an error is mostly TYPE — twenty form
   * validation lines, a toast, a field that has gone wrong — and those are the
   * one thing in the product that must not be hard to read.
   *
   * But it is excellent as a SURFACE: chalk on it is 7.04:1. So Lava Falls is
   * the `fill` verbatim, with `ink: chalk` — note this is the only kind whose ink
   * is NOT near-black, which is precisely why `ink` is a field rather than a
   * convention — and `text` is a SECOND Pantone, lifted, for the reasons below.
   *
   * ── THE TEXT TONE IS A SECOND PANTONE NOW: POINSETTIA ────────────────────
   *
   *   text → derived from PANTONE 17-1654 TCX POINSETTIA #cb3441
   *
   * The error channel is DELIBERATELY two Pantones, and that is a statement
   * about the two jobs rather than a fork. A fill is found by its edge and its
   * label; text is found by being legible. Lava Falls is the best deep error
   * SURFACE in the set and cannot be read as type at any size (2.11:1 on the
   * card); Poinsettia is a true signal red that lifts cleanly. Asking one chip
   * to do both is what produced two rounds of re-derivation before this.
   *
   * AND THE TWO ARE THE SAME FAMILY, which is the finding that makes the split
   * safe rather than a second red bolted on: Poinsettia sits at Lab hue 26.1°
   * and Lava Falls at 28.9° — **2.7° apart**. So the lifted text still satisfies
   * the original guard, that the error tone holds Lava Falls' hue within 6°,
   * without that being the thing it was derived from. A banner and the sentence
   * under it are visibly the same red.
   *
   * THE CORRIDOR, unchanged and still narrow: below 4.5:1 it fails as type, and
   * the brighter it goes the closer it gets to Muskmelon — the brand's danger
   * accent at Lab hue 56° — which has to stay ΔE 18 clear so a failed save and a
   * falling figure never read as the same statement.
   *
   * #f0565c holds **4.73:1 on the card, 5.74 on ink, ΔE 20.90 from Muskmelon**,
   * and it holds Poinsettia's own hue to 0.02°. That ΔE is the part worth
   * noticing: the two values this replaced managed 19.2 and 18.98, both about a
   * point off the floor. Moving the SOURCE rather than lifting the same chip
   * harder is what bought the headroom.
   *
   * THIRD DERIVATION, AND THE REASON THERE WERE THREE. #dd5f5b (5.03:1) held
   * while the card was #141614; PANTONE Black Beauty put it at 4.47 — under AA
   * by 0.03 — and the guard below caught it, which is exactly why that guard is
   * written against `t.ink2` and not against a typed number. #e06462 fixed the
   * contrast and left ΔE 18.98, one point of headroom. Poinsettia fixes the
   * distance too. An error TONE is a function of the surface it is read on AND
   * of the accent it must not collide with; change either and re-measure.
   */
  error: { fill: "#9a2b2e", ink: colors.chalk, text: "#f0565c" },

  /** Lyons Blue's text tone, which is light enough to be its own fill too. */
  info: { fill: THEMES.dark.accentText.blue, ink: THEMES.dark.onAccent, text: THEMES.dark.accentText.blue },
};
