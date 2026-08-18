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
 * ── THE RED IS THE TIGHT ONE, AND THE NUMBER EXPLAINS THE CHOICE ───────────
 *
 * A red has to be light enough to clear AA on a near-black card AND stay ΔE 18
 * from Muskmelon, which is a bright orange sitting close to it on the wheel.
 * That squeezes hard: #d94a4a is a better red and reaches only 4.32:1 here, and
 * everything darker fails faster. #ef5b5b (Lab hue 28°) is the value that holds
 * both ends — 5.42:1 on the card, ΔE 19.5 from Muskmelon. The headroom over the
 * floor is thin ON PURPOSE and it is the reason this file has a test: if either
 * value ever moves, the pair is the first thing that breaks.
 */
import { colors } from "./tokens";
import { THEMES } from "./palette";

export type FeedbackKind = "success" | "warning" | "error" | "info";

export const FEEDBACK: Record<FeedbackKind, string> = {
  /** PANTONE Green C — Lab hue 168°, L* 62, 6.14:1 on the card. The one genuinely
   *  new hue in the system: the brand had no green at all, because Wild Lime is a
   *  yellow-green (112°). Clears ΔE 18 against every accent by a wide margin (its
   *  nearest neighbour is `ash` at 21.9), and carries near-black ink at 6.64:1.
   *
   *  NOTE FOR ANY FUTURE FILL: chalk on this is 2.65:1 and fails. A filled success
   *  surface takes ON_FEEDBACK, never a light label — which is what the guard in
   *  palette.test.ts asserts, and why it is stated here rather than discovered. */
  success: "#00ab84",
  /** Fleur De Lis, unchanged. Lab hue 83° is already the conventional yellow, so
   *  the warning channel needed no new value — only the name. */
  warning: colors.amber,
  /** Lab hue 28° — 5.42:1 on the card, ΔE 19.5 from Muskmelon. See the header. */
  error: "#ef5b5b",
  /** Lyons Blue's text tone, unchanged. */
  info: THEMES.dark.accentText.blue,
};

/**
 * The ink for text sitting ON a solid feedback fill (a filled error pill, a
 * success chip). Both fills are light enough that near-black wins on every one
 * — guarded in palette.test.ts rather than assumed.
 */
export const ON_FEEDBACK = THEMES.dark.onAccent;
