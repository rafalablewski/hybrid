/**
 * HYBRID brand tokens — the single source of visual identity.
 * Imported by BOTH apps/web and apps/mobile so the look stays in lockstep.
 * Ported from the prototypes (HybridApp.jsx / HybridWeb.jsx).
 */

export const colors = {
  ink: "#0c0d0c", // near-black background
  ink2: "#141614", // raised surface
  // `line` MUST match THEMES.dark in palette.ts and the :root defaults in
  // apps/web/app/globals.css — it was stale (#2a2d2a) for a while, which made
  // every chart hairline draw in a different grey than every border.
  line: "#242724", // hairline borders
  //
  // THERE IS NO `card`. It held #151715 and sat ΔE 0.3 / contrast 1.01 from
  // `ink2` — the same colour under two names (audit/12 §5.1) — and the kit never
  // used it: ACard paints `ink2`, so `card` survived only at seven hand-rolled
  // surfaces on the phone and thirteen in the admin panel, plus a third copy
  // under a third name (`CARD_DARK`) and a fourth as a local `const CARD` that
  // actually held ink2. Every one of those now reads `ink2` and renders
  // byte-identically. If a genuinely distinct third surface is ever wanted, it
  // needs a value somebody designed and a contrast to `ink2` a person can see.
  // ── THE PANTONE FOUR ─────────────────────────────────────────────────────
  //
  // The brand palette is now four named PANTONE colours, and FOUR IS THE WHOLE
  // SET — there is no fifth accent and no separate rating gold. State meaning
  // routes through semantic.ts ROLE_COLOR; Wild Lime stays the ONE action
  // accent. The surfaces above are untouched.
  //
  //   lime  → PANTONE 13-0540 TCX  Wild Lime      #c3d363  (as specified)
  //   red   → PANTONE 15-1242 TCX  Muskmelon      #ec935e  (as specified)
  //   amber → PANTONE 20-0047 TPM  Fleur De Lis   #daa51d  (as specified)
  //   blue  → PANTONE 19-4340 TCX  Lyons Blue     #015871  → RENDERED #2f7893
  //
  // WHY BLUE IS NOT ITS PANTONE VALUE, and this is the one place the set had to
  // bend. Lyons Blue #015871 measures 2.44:1 against `ink` — below even WCAG's
  // 3:1 floor for non-text marks. It is a TCX chip, specified to be read on
  // white; on a near-black ground a chart stroke, bar, dot or border drawn in it
  // is close to invisible. So `blue` carries the value Lyons Blue RESOLVES TO on
  // this ground: its exact CIE-Lab hue angle, lifted in L* until it reaches
  // 3.63:1 on the card — the same contrast the outgoing teal held (3.59), so
  // every chart and bar already tuned around that number is unchanged.
  // #015871 itself remains correct as a FILLED SURFACE (chalk on it is 7.21:1);
  // it is not a token because nothing draws one yet, and a token with no
  // consumer is how the palette grew a `card` nobody paints.
  //
  // WHY THERE IS NO `violet`. It held a steel/slate blue (#8296c4) and, before
  // that, a lavender — and it never had one job: coach, non-premium, comment,
  // fat, season bar, "not up". Lifting Lyons Blue onto this ground put the two
  // blues ΔE 14.0 apart, under the DISTINCT_ROLE_DE floor of 18 that
  // contrast.ts sets for two colours carrying different meanings side by side.
  // Rather than ship that collision its ~120 sites were reassigned by what each
  // one MEANT: a 4th categorical slot → `red`; the conditioning/other modality →
  // `amber` (which is what kindStroke already said); a quiet secondary channel →
  // `blue`; the 5th step of the ordered velocity ramp → the lighter blue tint,
  // which an ordered ramp is allowed to do (see contrast.ts on hue repeating
  // when separation is carried by weight instead).
  //
  // WHY THERE IS NO `gold`. Fleur De Lis IS the gold. The old rating gold
  // (#e6c34e) sat ΔE 8.6 from it — two golds nobody could tell apart — so the
  // coach ★ and the elite badge draw in `amber` like everything else warm.
  //
  // TO ADD A FIFTH: it has to clear ΔE 18 against all four in the accent-TEXT
  // channel (palette.test.ts checks every pair now, not a chosen three), and it
  // has to name the job no existing accent does. Both halves, or it is decoration.
  lime: "#c3d363", // Wild Lime — the primary accent (action / "go" / Train)
  chalk: "#f3f4ef", // primary text
  ash: "#8b8f86", // muted text
  blue: "#2f7893", // Lyons Blue on dark — conditioning / info accent (Feel)
  amber: "#daa51d", // Fleur De Lis — sport / caution / premium / ratings (Plan)
  red: "#ec935e", // Muskmelon — alert / injury / streak (Connect)
  // NO WASH TOKENS. `maroon` / `maroonLit` lived here for one consumer — the
  // activity card's fallen column, which sat in a dark stain so the fall would
  // outweigh the rise. It is gone (Aug 2026): a stain made that one column a
  // SURFACE while the other three were type on the card, so the row read as
  // three figures and one filled box, and the box was what the eye found first
  // whether or not the slip was the week's story. Both ends are foreground now,
  // separated by hue and by sign.
  //
  // The palette therefore has no composited surface colours at all, and that is
  // the state to keep it in: a background here is either a named SURFACE (ink /
  // ink2 / card) or a tint of a foreground colour through withAlpha(), never a
  // third kind of thing that has to be re-derived by hand whenever the surface
  // under it changes.
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Font families. The web app loads these via @import (globals.css); the mobile
 * app loads the matching expo-google-fonts packages. Names kept identical.
 *
 * TWO FACES, AND THAT IS THE WHOLE IDENTITY:
 *   `display` — Archivo, in four weights. Headings, titles, body, big figures.
 *   `mono`    — JetBrains Mono, in two. Numbers, and every uppercase eyebrow.
 *
 * RETIRED — `condensed` (Archivo Narrow), Aug 2026. The brief specified three
 * faces and the token declared the third, but the PRODUCT is the mobile app and
 * the mobile app never loaded it: `app/_layout.tsx` calls `useFonts` with four
 * Archivo weights and two JetBrains Mono weights, and there is no
 * `@expo-google-fonts/archivo-narrow` in its package.json. So the third face
 * existed as a name in the tokens and a webfont in the browser, and nowhere in
 * the thing that ships.
 *
 * It was not unused on web — `cond` had ~30 call sites, all inside `/admin`,
 * all on the same small uppercase tracked chip/button. Which is exactly why
 * this had to be resolved rather than left: the project rule is that the two
 * admin consoles stay in step, and those chips were drawing in Archivo Narrow
 * on web and Archivo on the phone, because the phone had no other option.
 *
 * The tie-break was which face is doing the condensed face's JOB. Archivo
 * Narrow was declared for "labels / chips" — but the app's actual label voice
 * is the mono uppercase tracked eyebrow (`tracking.label` alone holds 216 call
 * sites), and that voice was never Narrow. A third face bought nothing but a
 * second answer to a question already answered, plus a webfont download.
 *
 * TO REVISIT IT: an argument for a genuinely condensed face has to start on
 * mobile — load it in `_layout.tsx`, give it a name in `F`, and name the job it
 * does that neither Archivo nor mono already does. Re-declaring it here without
 * that just recreates the dead token.
 */
export const fonts = {
  display: "Archivo", // headings + body + figures
  mono: "JetBrains Mono", // numbers / kickers
} as const;

/** Google Fonts @import string (used by the web prototype + web app). Mirror
 *  any change here in `apps/web/app/globals.css`, which carries the literal. */
export const fontImportUrl =
  "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap";

/** Product surface labels. */
export const brand = {
  name: "HYBRID",
  tagline: "Strength & conditioning for hybrid athletes",
  web: "app.hybrid.app",
} as const;

/**
 * TINT STRENGTHS — the alpha rungs, for `withAlpha(colour, ALPHA.fill)`.
 *
 * Derived from 350 hand-rolled alphas, not invented. Once the colour arithmetic
 * was converted from hex suffixes to withAlpha() the values became readable as
 * a set for the first time, and the set turned out to be 58 distinct numbers
 * doing two jobs — eight of them inside the single band 7%–15%. Nobody chose
 * eight; each call site converted a percentage in its head and wrote the byte.
 *
 * TWO FAMILIES, because they tolerate completely different precision:
 *
 *   SURFACES (wash / fill / solid) are large areas, where a 4% shift is subtle
 *     but visible — so the rungs are close together, and the migration moved
 *     only 7 of 156 sites by more than 2%.
 *
 *   BORDERS (edge / line / rim) are ONE PIXEL wide. A 5% alpha shift on a
 *     hairline is not perceptible, so these can be coarser and still land.
 *
 * WHAT DELIBERATELY HAS NO RUNG, and this is the real finding: the alphas above
 * ~0.45, and every stop inside a LinearGradient. The full histogram is
 * CONTINUOUS from 0 to 1 rather than clustered, because a gradient ramp needs
 * arbitrary intermediate stops to read as smooth and a scrim is tuned against
 * the specific content behind it. Those are COMPOSITION, not a palette choice,
 * and snapping them to a ladder would be inventing a scale where none exists.
 * A token set that covers 71% of its axis honestly beats one that covers 100%
 * by pretending.
 */
export const ALPHA = {
  /** the faintest tinted surface — a hint of accent behind a row */
  wash: 0.08,
  /** the standard tinted fill — a selected chip, an active card */
  fill: 0.12,
  /** the strongest tinted fill; still a tint, not a colour */
  solid: 0.16,
  /** the quietest tinted hairline */
  edge: 0.25,
  /** the standard tinted border */
  line: 0.33,
  /** a border that has to hold against a busy ground */
  rim: 0.42,
} as const;

export type TintRole = keyof typeof ALPHA;

/**
 * THE SUGGESTED-VALUE INK — a placeholder that must NOT read as entered data.
 *
 * There are two kinds of placeholder and they want opposite things. An
 * INSTRUCTIONAL one carries real content ("you@email.com", "e.g. Chicken
 * breast") and has to clear AA, so it draws in `ash` at full strength. A
 * SUGGESTED one is a ghost of what the field would hold ("0", "8", "—") and has
 * to be legible as a hint while being unmistakably NOT a value the athlete
 * typed — so it is deliberately held below AA, and paired with italics on web.
 *
 * Web already made this distinction (globals.css `.ghost-ph`, 55%). Mobile had
 * the alpha and not the name, which is how it also grew `C.line` (1.20:1 — an
 * invisible hint) and a raw `#3a3d34` (1.64:1) doing the same job at two more
 * strengths. Naming it is what makes those two readable as bugs rather than as
 * choices (audit/12 §5.6).
 *
 * 0.55 rather than mobile's old 0.533: same perceived value, and it is the
 * number web's rule already carries, so the two clients now state one figure.
 */
export const GHOST_PLACEHOLDER_ALPHA = 0.55;

/**
 * THE SCRIM — the wash a sheet, modal or overlay lays over the screen behind it.
 *
 * Its OPACITY has been a token for a while (motion.ts `scrimWithRecede` /
 * `scrimFlat`); its COLOUR never was, so the app grew five of them: `#000` on
 * the mobile sheet, `rgba(8,9,11,.82)` in the tour, `#000a` and `#000b` on two
 * admin modals, and `rgba(0,0,0,.5/.7/.75)` elsewhere on web (audit/12 §5.11).
 * Nobody chose five — each site typed a black.
 *
 * It is `ink`, not `#000`: the app's ground is a near-black with a green cast,
 * and a scrim in pure black over it reads very slightly cold at high opacity.
 * Composited at the opacities above the difference is small, which is exactly
 * why five values could coexist unnoticed — and exactly why it needs a name
 * rather than a fresh judgement call at each new overlay.
 */
export const SCRIM = colors.ink;

/**
 * A CONTROL'S OWN OPACITY when it is not fully available.
 *
 * THE DRIFT (audit/12 §5.12): there was no token at all, so ~40 controls each
 * typed a number — 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7. Checking whether
 * that spread encoded anything is what makes this two tokens rather than one:
 * it does NOT. `busy` appears at both 0.5 and 0.6, and so does `disabled`, so
 * the same condition was being drawn two ways depending on the file.
 *
 * But the DISTINCTION underneath is real, and worth keeping now that it can be
 * stated: a DISABLED control is unavailable — pressing it does nothing, ever,
 * until something else changes. A BUSY one is alive and mid-flight; it is going
 * to come back. Drawing them the same tells the athlete a spinner is a dead end.
 *
 * The values are the ones that already dominated each meaning, so the majority
 * of call sites do not move at all and none moves by more than 0.1.
 */
export const STATE_OPACITY = {
  /** Unavailable — nothing will happen. */
  disabled: 0.5,
  /** In flight — something IS happening; still alive, just waiting. */
  busy: 0.6,
} as const;
