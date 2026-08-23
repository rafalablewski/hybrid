/**
 * HYBRID brand tokens — the single source of visual identity.
 * Imported by BOTH apps/web and apps/mobile so the look stays in lockstep.
 * Ported from the prototypes (HybridApp.jsx / HybridWeb.jsx).
 */

export const colors = {
  ink: "#0c0d0c", // near-black background
  //
  // ── THE RAISED SURFACE IS A PANTONE NOW, AND IT DRAGGED THE HAIRLINE ──────
  //
  //   ink2 → #212126, taken as PANTONE 19-3911 TCX Black Beauty — SEE THE
  //          ATTRIBUTION NOTE BELOW, which is weaker than it first looked.
  //   line → #2f2f36 — DERIVED from it, and the derivation is below.
  //
  // WHY THE CARD MOVED AT ALL. `ink2` was #141614, which sat ΔE 2.49 and 1.07:1
  // from `ink`. That is not a raised surface, it is the same near-black twice —
  // the identical defect that got `card` (#151715) deleted for sitting ΔE 0.3
  // from ink2, one rung further down the same ramp. Black Beauty takes the pair
  // to ΔE 7.15 / 1.22:1, so a card is finally an object ON the page rather than
  // a border drawn around part of it.
  //
  // `ink` DELIBERATELY DID NOT FOLLOW. Black Beauty is a cool blue-violet — Lab
  // (12.9, +1.3, −3.4) — and re-seating the page ground on that hue would have
  // changed nothing anyone can see: `ink` is L* 3.5, where chroma is invisible.
  // It would, however, have moved `onAccent`, `SCRIM`, every ON_FEEDBACK ink and
  // both crash fallbacks, all of which happen to share that value for unrelated
  // reasons. Hue only reads on the surfaces light enough to carry it, and those
  // are ink2 and `line`.
  //
  // ── WHY `line` HAD TO MOVE WITH IT, and this is the load-bearing part ─────
  //
  // The old hairline #242724 is L* 15.2. Black Beauty is L* 12.9. That is
  // **1.06:1** — a card border invisible against its own card, which would have
  // rebuilt the deleted-`card` mistake at the BORDER instead of the fill. So
  // `line` is Black Beauty's own hue walked up in L* until it restores the
  // border-against-card contrast the app already had: 1.204 before, 1.206 now.
  // It reads 1.47:1 against `ink`, so a hairline on the page is if anything
  // clearer than it was.
  //
  // THE GENERAL RULE, now that this has bitten once: a hairline is only a
  // hairline if you can see it, and NOTHING in the suite checked that until
  // this change — which is exactly why the collision was invisible until it was
  // measured. palette.test.ts now holds `line` against both surfaces.
  //
  // ── THE BLACK BEAUTY ATTRIBUTION IS DISPUTED, AND THE HEX IS KEPT ─────────
  //
  // A verification pass against the reference libraries puts the chip LIGHTER
  // than this token: Color-Name lists 19-3911 TCX at #27272a and Colorbook at
  // #26262a. Against #26262a this value is ΔE76 2.50 / ΔE2000 1.71; against
  // #27272a, 3.19 / 2.32. Perceptible, and the two references do not agree with
  // each other either, so "the true chip" is not one number.
  //
  // THE HEX STAYS AND THE NAME IS QUALIFIED, for a reason that is measured
  // rather than preferred. Re-keying the card to #26262a breaks two shipped
  // guards outright:
  //
  //   error text  4.73 → 4.44 on the card   (under AA — a FOURTH derivation)
  //   line        1.21 → 1.13 against it    (under the hairline floor)
  //
  // and it shaves the blue fill from 3.23 to 3.04, leaving 0.04 over the mark
  // floor. It is doable — `line` would become #343438 and the error tone
  // #d96b74 — but it moves every surface again on a reference two sources
  // disagree about, days after the palette shipped.
  //
  // SO THE HONEST STATEMENT IS THE NARROW ONE: every ratio in this file is true
  // of #212126, which is what renders. Whether #212126 IS Black Beauty is a
  // claim about a chip, and it is the part to doubt. Do not quote the Pantone
  // name as the source of a contrast figure.
  //
  // `line` MUST match THEMES.dark in palette.ts and the :root defaults in
  // apps/web/app/globals.css — it was stale (#2a2d2a) for a while, which made
  // every chart hairline draw in a different grey than every border.
  ink2: "#212126", // the card — Black Beauty attribution disputed, see above
  line: "#2f2f36", // hairline borders — derived from Black Beauty (see above)
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
  // The brand palette is four named PANTONE ACCENTS, and FOUR IS THE WHOLE SET
  // — there is no fifth accent and no separate rating gold. State meaning routes
  // through semantic.ts ROLE_COLOR; Wild Lime stays the ONE action accent.
  //
  // The NEUTRALS are separately specified and are NOT part of that count — the
  // raised surface (Black Beauty, above) and the reading colour (Stalactite,
  // below). A neutral carries no state and no role, so it competes with nothing;
  // "four" is a statement about how many things on screen can mean something.
  //
  //   lime  → PANTONE 13-0540 TCX  Wild Lime      #c3d363  (as specified)
  //   red   → PANTONE 15-1242 TCX  Muskmelon      #ec935e  (as specified)
  //   amber → PANTONE 20-0047 TPM  Fleur De Lis   #daa51d  (as specified)
  //   blue  → PANTONE 19-4340 TCX  Lyons Blue     #015871  → RENDERED #2f7893
  //                                               (derived; carries no chip of its own)
  //
  // WHY BLUE IS NOT ITS SOURCE PANTONE'S VALUE, and this is the one place the
  // set had to bend. Lyons Blue #015871 measures 2.44:1 against `ink` — below
  // even WCAG's 3:1 floor for non-text marks. It is a TCX chip, specified to be
  // read on white; on a near-black ground a chart stroke, bar, dot or border
  // drawn in it is close to invisible. So `blue` carries the value Lyons Blue
  // RESOLVES TO on this ground: its exact CIE-Lab hue angle, lifted in L* until
  // it reaches 3.63:1 on the card — the same contrast the outgoing teal held
  // (3.59), so every chart and bar already tuned around that number is unchanged.
  // #015871 itself remains correct as a FILLED SURFACE (chalk on it is 7.21:1);
  // it is not a token because nothing draws one yet, and a token with no
  // consumer is how the palette grew a `card` nobody paints.
  //
  // ── IT IS NOT PANTONE 633 C. CHECKED, AND WITHDRAWN ──────────────────────
  //
  // This block briefly recorded #2f7893 as PANTONE 633 C, on a hex→Pantone
  // lookup. An independent verification pass checked it against the reference
  // libraries and the identification does not hold:
  //
  //   PANTONE 633 C  →  #007396   (ColorXS, Columbia Omni Studio, Perbang)
  //   this token     →  #2f7893   ΔE76 5.85 from that chip, ΔE2000 3.28
  //
  // Both are well above the ΔE ≈ 2 usually treated as perceptible, and
  // Encycolorpedia's page for #2f7893 lists paint matches but NO Pantone at all.
  // It is nearer 633 U (#27829e, ΔE76 4.69) than 633 C, and not close to either.
  //
  // AND THE REAL CHIP WOULD NOT SURVIVE HERE ANYWAY, which is the useful half of
  // the finding: #007396 measures 3.61:1 on `ink` and 2.97 on the card — it
  // FAILS the 3:1 mark floor this token exists to clear. So "adopt the true
  // value" was never available; the choice was always between an accurate name
  // and a working colour, and the name is the part that was wrong.
  //
  // `blue` is therefore what it always was: a DERIVED value, Lyons Blue's Lab
  // hue angle lifted in L* until it clears the mark floor. It carries no Pantone
  // identity of its own and should not be given one. The caution written here
  // when 633 C was first recorded — that a spot-colour hex lookup is a reverse
  // match rather than a published sRGB value — turned out to be the whole story.
  //
  // ── AND WHAT `blue` MAY BE USED FOR, since 3.92:1 is the governing number ──
  //
  // 3.92 on ink and 3.23 on the card clears WCAG 1.4.11 (3:1, non-text marks)
  // and FAILS 1.4.3 (4.5:1, normal text). That is not a defect, it is the
  // token's job: `blue` is a FILL — a bar, a stroke, a dot, a ring segment — and
  // `accentText.blue` (#6bb4d4, 6.95 on the card) is the value for type. The
  // split is guarded two ways: palette.test.ts asserts the fill clears 3:1 and
  // the text clears AA, and a mobile rule asserts `blue` is not an ink-bearing
  // fill. Do not set normal-size type in this token.
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
  //
  // ── THE READING COLOUR: STALACTITE ───────────────────────────────────────
  //
  //   chalk → PANTONE 11-4101 TCX  Stalactite  #f7f6f3  (as specified)
  //
  // THIS IS NOT A FIFTH ACCENT and does not reopen the paragraph above. `chalk`
  // is the reading surface — primary type, the wordmark, the ink on the one
  // dark feedback fill — and it carries no state, no role and no meaning. The
  // accent set is still four; what changed is that the app's off-white stopped
  // being a value somebody picked by eye and became a specified one.
  //
  // It is the ONLY Pantone in this file that needed no adaptation at all, and
  // that is a fact about which END of the scale it sits on rather than luck.
  // Lyons Blue had to be lifted and Lava Falls (feedback.ts) had to be split,
  // both because a TCX chip is specified against white and this ground is
  // near-black. A near-white has the opposite problem, which is to say none:
  // every ratio it is asked for went UP when it moved — 17.61 → 18.02 on `ink`,
  // 16.45 → 16.83 on the old ink2, 6.89 → 7.04 as the ink on Lava Falls.
  //
  // WHAT IT CHANGED, in the one place it is visible. The outgoing #f3f4ef sat
  // at Lab (96.0, −1.2, +2.3) — a cool, faintly green off-white, which is what
  // put a green cast on every white surface in a palette whose accent is
  // already a yellow-green. Stalactite is (96.9, −0.2, +1.5): a hair lighter
  // and very nearly neutral, so the chartreuse now reads as the only green on
  // screen. ΔE between the two is 1.66 — visible side by side, invisible alone,
  // which is exactly the size of change a text colour is allowed to make.
  lime: "#c3d363", // Wild Lime — the primary accent (action / "go" / Train)
  chalk: "#f7f6f3", // PANTONE 11-4101 TCX Stalactite — primary text (see below)
  //
  // ── THE MUTED READING COLOUR: SLATE GRAY ─────────────────────────────────
  //
  //   ash → PANTONE 16-5804 TCX  Slate Gray  #8a9691  (as specified)
  //
  // The third specified NEUTRAL, and like the other two it is not an accent: it
  // is secondary type — captions, meta rows, every mono kicker in the app — and
  // it carries no state.
  //
  // IT WENT UP, WHICH IS THE POINT. The eyeballed #8b8f86 was the palette's
  // tightest reading at 4.86:1 on Black Beauty, and palette.ts named it as the
  // number anything lightening the card again would have to re-check first.
  // Slate Gray reads 6.35 on `ink` and **5.23 on the card**, so that floor
  // moved up by 0.37 and the tightest contrast in the system is no longer a
  // colour nobody chose.
  //
  // WHAT IT COSTS, and it is a real cost worth writing down rather than
  // discovering: Slate Gray is COOLER — Lab (61.0, −5.3, +1.1) against the old
  // (58.8, −3.2, +4.3), a hue swing from 127° to 168° — which moves it toward
  // the blue side of the palette. `ash` vs `accentText.blue` was ΔE 22.6 and is
  // now **18.31**: still over the DISTINCT_ROLE_DE floor of 18, but by three
  // tenths, and it is now the CLOSEST PAIR IN THE WHOLE PALETTE — tighter than
  // amber/red at 19.2. The guard in palette.test.ts runs `ash` against every
  // accent, so this is held rather than hoped; but any future move of either
  // `ash` or the blue text tone starts from 0.31 of headroom, not from nothing.
  ash: "#8a9691", // PANTONE Slate Gray — muted text (see above)
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
 *   `display` — Söhne, in four weights. Headings, titles, body, big figures.
 *   `mono`    — Söhne Mono, in three. Numbers, and every uppercase eyebrow.
 *
 * RETIRED — `condensed` (a narrow cut of the display face), Aug 2026. The brief specified three
 * faces and the token declared the third, but the PRODUCT is the mobile app and
 * the mobile app never loaded it: `app/_layout.tsx` calls `useFonts` with four
 * sans weights and two mono weights, and there is no
 * no package for it in package.json. So the third face
 * existed as a name in the tokens and a webfont in the browser, and nowhere in
 * the thing that ships.
 *
 * It was not unused on web — `cond` had ~30 call sites, all inside `/admin`,
 * all on the same small uppercase tracked chip/button. Which is exactly why
 * this had to be resolved rather than left: the project rule is that the two
 * admin consoles stay in step, and those chips were drawing in the narrow cut
 * on web and the standard cut on the phone, because the phone had no other option.
 *
 * The tie-break was which face is doing the condensed face's JOB. The display face
 * Narrow was declared for "labels / chips" — but the app's actual label voice
 * is the mono uppercase tracked eyebrow (the `label` tracking alone holds 216 call
 * sites), and that voice was never Narrow. A third face bought nothing but a
 * second answer to a question already answered, plus a webfont download.
 *
 * TO REVISIT IT: an argument for a genuinely condensed face has to start on
 * mobile — load it in `_layout.tsx`, give it a name in `F`, and name the job it
 * does that neither the display face nor mono already does. Re-declaring it here without
 * that just recreates the dead token.
 */
export const fonts = {
  display: "Söhne", // headings + body + figures
  mono: "Söhne Mono", // numbers / kickers
} as const;

/** Google Fonts @import string (used by the web prototype + web app). Mirror
 *  any change here in `apps/web/app/globals.css`, which carries the literal. */
/** EMPTY BY DESIGN, and it is not an oversight. Söhne is a licensed face and
 *  cannot be served from a public font host, so web SELF-HOSTS it: the
 *  @font-face blocks live in `apps/web/app/globals.css` against woff2 in
 *  `apps/web/public/fonts`. The constant stays so a caller that imported it
 *  gets an empty string rather than a missing export, and so this note has a
 *  home — a `@import` reappearing here would silently pull a public face back. */
export const fontImportUrl = "";

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
