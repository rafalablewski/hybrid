import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COVER_SCREENS } from "@hybrid/core";

/**
 * THE DESIGN-TOKEN RATCHET.
 *
 * The design audit's root finding was not that the token system is wrong — it is
 * unusually well authored — but that NOTHING FAILED when a call site ignored it.
 * The one healthy axis was motion, and motion is healthy precisely because
 * motion.test.ts holds it to its own rules. This file is that guard for the
 * visual axes.
 *
 * Two kinds of rule:
 *
 *   HARD — the violation count is zero and must stay zero. Adding one fails.
 *
 *   RATCHET — the violation count is a known, non-zero number that we are
 *     paying down. The test asserts the count NEVER RISES. Fixing sites and
 *     lowering the ceiling is the intended workflow; the number only ever goes
 *     down, and when it reaches zero the rule graduates to HARD.
 *
 * A ratchet is deliberately unglamorous: it does not fix anything, it just makes
 * the debt visible and stops it growing while the sweeps land.
 *
 * ── AND A CEILING IS RE-TIGHTENED WHEN IT MOVES, IN THE SAME CHANGE ────────
 * A ratchet whose ceiling sits above its actual count is not a ratchet — it is
 * a budget for more of the thing. An audit in Aug 2026 found 178 sites of that
 * slack across seven rules: fontSize was at 489 with 427 sites, hex literals at
 * 136 with 82, borderRadius at 507 with 459, and the ASearch convergence had
 * quietly finished (10 → 3) with nobody lowering the number. Every one of them
 * would have swallowed dozens of new violations in silence, which is the exact
 * failure this file exists to prevent.
 *
 * The slack accumulates honestly — a sweep aimed at one rule removes sites the
 * others were counting — so the discipline is: after ANY sweep, re-measure every
 * ceiling, not just the one you meant to move. All seven are pinned to actual as
 * of that audit.
 */

const ROOT = join(__dirname, "..");
const DIRS = ["app", "components", "lib"];

function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push({ path: full.slice(ROOT.length + 1), text: readFileSync(full, "utf8") });
      }
    }
  };
  for (const d of DIRS) walk(join(ROOT, d));
  return out;
}

const FILES = sources();

/** Every `pattern` match across the tree, as "path:line" strings. */
function hits(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const { path, text } of FILES) {
    text.split("\n").forEach((line, i) => {
      for (const _ of line.matchAll(pattern)) found.push(`${path}:${i + 1}`);
    });
  }
  return found;
}

/** The source line a "path:line" hit points at — for the rules that exempt a
 *  SANCTIONED declaration from their own pattern. */
function lineAt(site: string): string {
  const path = site.slice(0, site.lastIndexOf(":"));
  const line = Number(site.slice(site.lastIndexOf(":") + 1));
  return (FILES.find((f) => f.path === path)?.text ?? "").split("\n")[line - 1] ?? "";
}

/**
 * `hits`, blind to comments — for the rules whose pattern is a piece of SYNTAX
 * rather than a word, so a file that DESCRIBES what it no longer does is not
 * failed for the description.
 *
 * This is not hypothetical tidiness: the sheet rule below went red on
 * `upgrade.tsx` for its own header comment — "It used to hand-roll its own: a
 * raw <Modal> route" — three lines above the `import Sheet from "./sheet"` that
 * proves the rule is satisfied. The house style documents what a file was
 * migrated off, so a guard that greps raw source will keep meeting the thing it
 * forbids, spelled out in prose, in exactly the files that were fixed first.
 *
 * Deliberately NOT folded into `hits` itself: most callers there are ratchets
 * with exact ceilings, and silently lowering their counts would spend debt
 * headroom nobody agreed to spend. This is opt-in, per rule.
 *
 * Line-granular, matching `hits`: a comment-ONLY line is the whole of the false
 * positive. A trailing comment after real code keeps its line, which is right —
 * that line still holds code.
 */
function codeHits(pattern: RegExp): string[] {
  return hits(pattern).filter((h) => !/^\s*(?:\/\/|\/?\*)/.test(lineAt(h)));
}

/** A ratchet: report the overage with the offending sites, so a failure tells
 *  you WHERE, not just that a number moved. */
function expectAtMost(found: string[], ceiling: number, rule: string) {
  const detail = found.length > ceiling ? `\n${rule}\nceiling ${ceiling}, found ${found.length}:\n  ${found.slice(0, 25).join("\n  ")}` : "";
  expect(found.length, detail).toBeLessThanOrEqual(ceiling);
}

describe("type scale", () => {
  it("HARD — no text below the 10dp legibility floor", () => {
    // Was 98 sites (86 at 9dp, 12 at 8dp), overwhelmingly the mono + uppercase +
    // letter-spaced kicker — the least legible combination available — including
    // 14 in the live logging screen, read one-handed mid-set. All raised to
    // fs.nano. This rule is HARD from the start: there is no size below `nano`.
    expect(hits(/fontSize:\s*[0-9](?![0-9.])/g)).toEqual([]);
  });

  it("RATCHET — raw fontSize integers give way to fs.* rungs", () => {
    // 427 → 89 → 48, in two passes with different jobs.
    //
    // THE FIRST PASS WAS A RENAME and stopped where a rename stops:
    //
    // 339 of them — 79% — were ALREADY a rung and simply were not saying so:
    // 77 at 10, 39 at 11, 38 at 18, 32 at 12, 32 at 13 … Renaming those is a
    // pure rename, verified exact against the scale before it ran, so not one
    // pixel moved. That is consistency for free and it is done.
    //
    // (The old note here said "~37% land off the ladder entirely". Measured, it
    // was 20%. Corrected rather than left — a guard that misstates its own
    // subject is how a ceiling drifts out of touch with its count.)
    //
    // 87 → 48, and the second pass is the RESTYLE the note below deferred.
    //
    // THE TWO CLUSTERS WENT FIRST, because the note was right that they were one
    // copied decision each, and right that only a person could pick the rung:
    //
    //   17 → fs.subtitle (16), 17 sites. 17 is not a near-miss of anything in
    //     this system, it is SF PRO'S BODY SIZE — iOS's default — leaking into
    //     an Archivo one, which is how the same "card title" ended up 17 here
    //     and 16 (already a rung) three files over. Every one of them is a card,
    //     sheet or section title, which is what `subtitle` is for. 1dp.
    //
    //   24 → fs.display (26), 14 sites. UP, not down, and the direction is the
    //     argument: the cluster is figures and glyphs — the amount you type into
    //     a nutrition row, the weight on the body-progress form, a stat value, a
    //     stepper's −, the invite screen's title. A figure that is the subject
    //     of its row belongs at the rung above its neighbours, not below.
    //     `headline` (22) is documented as a screen head with no hero, which is
    //     not what any of these are.
    //
    //   ABOVE 46 → fs.stat, 8 sites (48 ×2, 52, 56 ×2, 60 ×2, 68). The old note
    //     said snapping these "would be absurd" — it was reading the whole set
    //     as story/cover figures. Measured, only three are: the watermark emoji
    //     bled off a recipe tile and a plan cover (78, 96, 118), which carry no
    //     font face and are artwork, not type. The other eight were each "the
    //     one hero figure on a screen" — the definition of `stat` — typed a rung
    //     and a half higher by six different people. A 42% spread is not a
    //     missing rung. scale.ts now names the two real exceptions (hero.ts's
    //     takeover figure, and glyph artwork) instead of claiming there are none.
    //
    // WHAT IS LEFT IS NOT THE SAME KIND OF WORK, which is why it is left:
    //
    //   THE LONG TAIL, 19 through 44 — 6 at 19, 6 at 28, 6 at 30, 5 at 21, 4 at
    //     23, 4 at 44, 3 at 27, 3 at 40, and singletons at 25, 32, 38, 42. Same
    //     shape as the two clusters, without the thing that made them
    //     sweepable: no value here is the fingerprint of one copied decision,
    //     so each is sized against something specific beside it and needs its
    //     own look rather than a sweep's verdict.
    //
    //   Two FRACTIONAL sizes (11.5, 12.5) — a half-dp is a deliberate nudge, not
    //     a rung missed by half.
    //
    //   The three glyph watermarks, deliberately, per the paragraph above.
    //
    //   1 was RENAMED AND PUT BACK. home.tsx's plan-card title took fs.headline
    //     cleanly, and that tripped hub-masthead.test.ts, which bans the rung
    //     anywhere in a hub screen so none re-grows a title of its own. It is a
    //     CARD title, not the hub's head, so the ban is a false positive there —
    //     but the guard is load-bearing and a rename is not worth weakening it
    //     for. It sits as a raw 22 and is counted here, which is the honest
    //     place for a site that has no rung it is allowed to name.
    expectAtMost(hits(/fontSize:\s*\d+/g), 48, "raw fontSize → use an fs.* rung");
  });

  it("HARD — weight is a FACE (F.*), never a `fontWeight`", () => {
    // THE FONT BUG THIS RULE EXISTS FOR. `F` names six loaded faces and each is
    // registered under its OWN family name — "JetBrainsMono_400Regular",
    // "Archivo_700Bold". So `fontFamily: F.mono` declares a family with exactly
    // one face in it, and asking that family for 700 asks for a weight it does
    // not have: iOS falls back toward the system face, Android smears a
    // synthetic bold onto the regular. Either way the label stops being our
    // font, and it does so NEXT TO labels that got it right — which is what
    // "the font is inconsistent" looks like from the outside.
    //
    // There is nothing to gain by it: F.monoBold and F.bold/F.black ARE the
    // heavier faces, so every site had a token sitting right there.
    //
    // 103 → 0, in two passes: the FOOD domain first (the meal pages were the
    // worst of it at 31 sites, several stacked inside one sheet), then the
    // remaining 72 across 28 files. THE DECLARED FACE WON: where a family was
    // already named it stayed, and only `F.mono` — the sole *regular* of a
    // pair — was promoted to `F.monoBold`, which is what iOS was resolving to
    // anyway. A weight that VARIES becomes a varying face, not a varying
    // weight: `fontFamily: on ? F.monoBold : F.mono`. Text with NO family at
    // all (two coach rows, drawing in the platform UI font) got one.
    //
    // The one thing that could not simply be renamed was percent-program's ink
    // ramp: four weights (700/700/500/400) off a family holding one face. It
    // has a second, finer channel — opacity — which is what actually separated
    // its tiers, so the two heavy tiers took the bold face and opacity kept
    // doing the rest.
    //
    // THE ONE EXEMPTION, and it is a real one: components/error-boundary.tsx.
    // It is deliberately provider-free — "no theme, i18n, session or app font:
    // any of those may be the thing that failed, and a fallback that needs the
    // broken thing is not a fallback". A crash fallback that named F.* would
    // draw nothing at all when the font load is what threw. Platform font,
    // platform weight, on purpose.
    //
    // Comment-blind: the files fixed first are the ones that write down why.
    const sites = codeHits(/fontWeight:/g).filter((h) => !h.startsWith("components/error-boundary.tsx"));
    expect(sites, "fontWeight → pick the FACE (F.mono/F.monoBold, F.reg/F.semi/F.bold/F.black)").toEqual([]);
  });

  it("HARD — no TYPE above fs.stat; art and the takeover figure are not type", () => {
    // The ceiling scale.ts declares, finally holding something. It was prose for
    // as long as it existed and the app answered with eight figures at 48–68,
    // each one "the hero figure on THIS screen" typed a rung higher than the
    // last person's. They are all fs.stat now.
    //
    // WHAT THIS DELIBERATELY DOES NOT CATCH, because neither is type on the
    // reading ladder:
    //
    //   GLYPH ART — the watermark emoji bled off a recipe tile or a plan cover
    //     (78, 96, 118). No font face on the line, because there is no face: it
    //     is a picture sized to a card. The rule keys on `fontFamily` being
    //     present for exactly this reason, rather than exempting three paths by
    //     name — a fourth watermark should not have to edit this test.
    //
    //   THE TAKEOVER FIGURE — hero.ts's `HERO_FIGURE` (76), spelled as a token
    //     rather than a literal, so it is not a number in a style at all.
    //
    // A real violation therefore has to be a literal size above 46 with a face
    // beside it, which is precisely the shape of "somebody wanted this number to
    // feel important".
    const oversize = hits(/fontSize:\s*(?:4[7-9]|[5-9]\d|\d{3,})\b/g).filter((h) => /fontFamily:/.test(lineAt(h)));
    expect(oversize, "a figure above fs.stat → fs.stat (or hero.ts's HERO_FIGURE, on a takeover)").toEqual([]);
  });
});

describe("leading and tracking", () => {
  it("RATCHET — absolute lineHeight gives way to leading()", () => {
    // 287 → 77. The 210 that sat on a line with an fs.* size were DERIVED: each
    // snapped to the nearest of the four roles, and the evidence was the finding
    // itself — body/19, caption/17, bodyLg/20, caption/18 and micro/16 were all
    // "normal" body leading, written five different ways.
    //
    // Absolute leading is also why Dynamic Type could not work: the OS scales the
    // glyphs and leaves the line box where it was, so text collides with itself
    // before it clips. leading(fs.body) derives the box from the size.
    //
    // What remains has no fs.* token on the same line — a raw size, or a
    // lineHeight set apart from its fontSize — so each needs reading, not a
    // regex. Four more were left deliberately: their ratio is >0.09 from any
    // role, which means they are making a point (a 1.04 display, a 2.71 spacer)
    // rather than picking a leading.
    // 74 → 48, and the fontSize sweep is what unlocked it: the note above said
    // the remainder "has no fs.* token on the same line", and 339 lines had just
    // gained one. 26 of them turned out to be `leading(size, role)` exactly —
    // round(size × ratio) reproduces the literal — so they are a pure rename.
    //
    // WHAT IS LEFT DOES NOT TOKENIZE, and it is worth saying why rather than
    // leaving it to look like laziness. 23 of the 48 sit in a real cluster —
    // ratio 1.036 to 1.125, TIGHTER than `tight` (1.15) — and they are all big
    // FIGURES, where digits have no descenders to fill the box. That looked
    // exactly like the trackFigure finding, so it got the same test: is there
    // one ratio the cluster agrees on? There is not. The best candidate (1.10)
    // reproduces only 10 of the 23 and errs by up to 6dp, and 6dp of line box
    // under a 60dp numeral visibly moves its baseline.
    //
    // So these are hand-tuned per figure — a line box set to make a specific
    // layout meet, not a leading picked off a ladder — which is the same shape
    // as the ALPHA finding one rule down: an axis can be genuinely continuous,
    // and inventing rungs for it would be worse than leaving it legible.
    // The rest are 14 sites with no size on the line at all (each needs reading,
    // not a regex) and the deliberate outliers the original note called out — a
    // 2.71 spacer, a 1.04 display.
    // 48 → 43: the fontSize restyle took five more with it. The figures that
    // came down to fs.stat were each carrying a hand-tuned absolute box (52 on
    // 48, 56 on 52, 58 on 56, 74 on 68) — at one shared size those stop being
    // per-figure tunings and become one leading, so they read leading(fs.stat,
    // "tight") now. That is the pattern the note above describes in reverse: an
    // absolute is only untokenizable while the sizes under it disagree. (The
    // fifth is the portion stepper's −, whose box was 26 on a size of 24: once
    // the size took a rung the pair read as a 1.0 ratio, which is nobody's
    // choice, it is two numbers that used to be different.)
    expectAtMost(hits(/lineHeight:\s*\d/g), 43, "absolute lineHeight → leading(size, role)");
  });

  it("HARD — tracking names its token; a big figure derives it", () => {
    // 432 → 0. THE SHAPE OF THE ANSWER, because it is not one rule:
    //
    //   SMALL TYPE takes an ABSOLUTE rung. The eyebrows live at 10–13dp, a band
    //     narrow enough that one dp value works across all of it, and the app
    //     has exactly two: tracking.label (0.9) and tracking.caps (1.2). 298
    //     sites already were those numbers and now say so; 24 more were
    //     stragglers either side (0.4 … 0.8 under, 1.4 / 2 / 3 over) and snapped
    //     to the nearer.
    //
    //   TITLES take tracking.display (-0.5), and that was the contested call.
    //     Two tightenings were in force at the same sizes: the token at -0.019
    //     … -0.031em, and a raw -0.3 group at -0.013 … -0.023em. The token wins
    //     because it IS the token — 51 call sites plus two core contracts (the
    //     app-header wordmark, the hub masthead's title), and hub-masthead
    //     chose it deliberately over the -1 that shipped before it. A house
    //     value that has already survived one argument is the house value.
    //
    //   BIG FIGURES DERIVE IT — trackFigure(size), and this is the part an
    //     absolute could not do. They run 30–68dp, a 2.3× span, where -0.5 is
    //     -0.017em at the bottom and -0.007em at the top: nothing at all. Which
    //     is why every one of them hand-multiplied its own value instead, and
    //     why `letterSpacing: -1` appeared at 20dp AND at 48dp. In em those
    //     twelve spellings collapse onto -0.035em, so that is the constant, and
    //     trackFigure is leading()'s twin — same argument, one axis over.
    //
    // THE BOUNDARY IS THE SCALE'S OWN: fs.hero (34) is documented as
    // "mastheads / cover titles" and fs.stat (46) as "the one hero figure on a
    // screen". Titles up to hero take the rung; figures from stat take the
    // function. The four sites sitting at fs.stat under tracking.display moved
    // with it, and a 32dp food NAME moved back — it is a title that happened to
    // be large, not a figure.
    //
    // TWO EXEMPTIONS, both because the app's TYPE SCALE does not govern them:
    //
    //   lib/share.tsx — a branded card captured to a PNG at an arbitrary width.
    //     Its sizes are `width * 0.072`, fractions of the canvas rather than
    //     rungs of the app ladder, so its tracking belongs to that card's own
    //     system.
    //
    //   The one-time-code fields (login.tsx, mfa-settings.tsx) — letterSpacing
    //     at 8 and 3 is doing SEMANTIC work: it says the characters are
    //     discrete digits, to be read one at a time. A rung would delete the
    //     thing the spacing is saying.
    //
    // Both are narrow and named. A third wanting to be added is the signal that
    // the rule is wrong, not that the call site is.
    const OWN_SCALE = ["lib/share.tsx", "components/aurora/login.tsx", "components/aurora/mfa-settings.tsx"];
    const raw = hits(/letterSpacing:\s*-?\d/g).filter((h) => !OWN_SCALE.some((f) => h.startsWith(f + ":")));
    expect(raw, "letterSpacing → tracking.label/.caps/.display, or trackFigure(size)").toEqual([]);
  });
});

describe("geometry", () => {
  it("RATCHET — raw borderRadius gives way to RADIUS.*", () => {
    // 459 → 166. 293 sites were ALREADY a rung — 122 at 999, 75 at 16, 57 at 12,
    // 28 at 3, 13 at 28 — and simply were not saying so. Verified exact against
    // RADIUS before the rewrite ran, so nothing moved. `999` alone was a quarter
    // of the debt: the pill idiom, spelled as a sentinel 122 times.
    //
    // WHAT IS LEFT IS MOSTLY NOT DRIFT, and this axis differs from the type ones
    // in a way that matters. A radius is frequently DERIVED rather than chosen:
    //
    //   A CIRCLE is `borderRadius = size / 2`, and there were 41 sites where the
    //     radius is provably half a width or height ON THE SAME LINE — r115 on
    //     230, r75 on 150, r85 on 170, r44 on 88, r42 on 84 — with more where
    //     the dimension sits a line away or is computed. Snapping those to
    //     RADIUS.card would not be a restyle, it would be a BUG: the circles
    //     stop being circles. There is no rung for "half of whatever this is",
    //     and there should not be one.
    //
    //   A CONCENTRIC corner is `parent - pad`, which the kit already exposes as
    //     concentric(). Those small values (4, 5, 6, 8, 10) are the arithmetic
    //     of a nested surface, not a choice from a ladder.
    //
    // So the remainder needs reading site by site — is this a circle, a
    // concentric inset, or a genuine off-ladder choice — and only the third kind
    // is sweepable. That is a different job from the rename and is not attempted
    // here.
    // 162 → 160, re-measured rather than moved: two sites went with other work
    // and nobody re-pinned. Which is the discipline in this file's header — a
    // ceiling above its count is a budget for more of the thing.
    expectAtMost(hits(/borderRadius:\s*\d/g), 160, "raw borderRadius → RADIUS.*");
  });
});

describe("touch targets", () => {
  it("HARD — every interactive PRIMITIVE declares the 44dp floor", () => {
    // The audit measured five selectable pills across five screens at ~25–31dp,
    // built from three horizontal paddings, four vertical ones and three type
    // sizes — and found exactly ONE minHeight: 44 in the whole app. Padding
    // cannot fix it: a chip's height is set by its label, so the floor has to be
    // declared. These are the components every screen reaches through; a screen
    // that hand-rolls a touchable is still on its own, which is the argument for
    // reaching through them.
    const PRIMITIVES = [
      "components/aurora/kit.tsx",       // APill, AChip, ASegment
      "components/admin/_kit.tsx",       // PillBtn — the compact admin action
    ];
    for (const path of PRIMITIVES) {
      const file = FILES.find((f) => f.path === path);
      expect(file, `${path} not found`).toBeDefined();
      expect(file!.text, `${path} must declare HIT_TARGET`).toContain("HIT_TARGET");
    }
  });

  it("HARD — there is ONE component kit; a second one is a build failure", () => {
    // THE FINDING: "Four component vocabularies coexist: the principal kit, a
    // social kit whose primary button — 23 call sites — sits below the app's own
    // 44-point touch floor, unlabeled for VoiceOver and INVISIBLE TO THE
    // ENFORCEMENT RATCHETS BY NAME; a nutrition kit shipping a duplicate icon
    // set defaulting to off-palette white; and an admin kit."
    //
    // The clause that matters is the one about the ratchets. Every guard in this
    // file polices the shared primitives BY NAME — the chip ratchet counts
    // hand-rolled chips against `AChip`, the 44dp rule reads the files listed
    // above. A second kit is not merely duplication: it is a blind spot, and
    // everything inside it is unregulated by construction. That is why SButton
    // could sit 8dp under the touch floor at 23 call sites for months while a
    // test named "every interactive PRIMITIVE declares the 44dp floor" passed.
    //
    // THE PRESCRIPTION WAS EXPLICIT — retired "by build failure, not by ratchet
    // ceiling". A ratchet would have said "no MORE sub-44 buttons", which is a
    // budget for the 23 that exist. This says the file cannot exist.
    //
    // What was actually wrong was not the callers' taste: APill had no size
    // class, and all 23 sites are buttons in a ROW. Told to choose between the
    // shared primitive at the wrong size and the right size hand-rolled, six
    // screens chose the second. APill has `size="compact"` now — content-sized
    // and quieter, with `minHeight: HIT_TARGET` on the same node as `regular`,
    // so the drawing shrinks and the target does not.
    const RETIRED = [
      { path: "components/social-kit.tsx", was: "SButton + Avatar/Stars/Empty → aurora/kit.tsx" },
    ];
    const back = RETIRED.filter((k) => FILES.some((f) => f.path === k.path));
    expect(back.map((k) => `${k.path} is back — ${k.was}`)).toEqual([]);

    // …and its button with it. A name check, because the failure mode is a
    // helpful re-extraction: "these six screens all need a small button, let me
    // pull one out", which is precisely how the first one appeared.
    const sbutton = codeHits(/\bSButton\b/g);
    expect(sbutton, `\nSButton is retired — use <APill size="compact" />:\n  ${sbutton.join("\n  ")}`).toEqual([]);
  });

  it("HARD — a button primitive is drawn by APill, wherever it lives", () => {
    // The generalisation of the rule above: a component whose NAME says button
    // and whose body hand-rolls a Pressable with its own padding is a shadow
    // primitive being born, whatever file it is in. The two sanctioned button
    // primitives declare the floor; everything else routes through them.
    //
    // `PillBtn` is the admin kit's compact action and is the one exception,
    // recorded rather than hidden: it already declares HIT_TARGET (the rule
    // above checks it), and folding it onto APill's `compact` is the
    // `admin-kit-merge` capability — 66 call sites across 13 files, a visible
    // change to every operator screen, and it wants a device to verify.
    // `aurora/swiftui.tsx` is the third exception and a different KIND of one:
    // GlassNavButton and GlassMenuButton are bridges onto a NATIVE control
    // (Liquid Glass, the system menu). They hand-roll no padding and declare no
    // geometry — the platform owns both, which is the entire reason to use
    // them — so there is nothing here for APill to own. A native control
    // wearing the app's own drawn button would be the drift, not the fix.
    const SANCTIONED = /components\/aurora\/kit\.tsx|components\/admin\/_kit\.tsx|components\/aurora\/swiftui\.tsx/;
    const bad: string[] = [];
    for (const { path, text } of FILES) {
      if (SANCTIONED.test(path.split("\\").join("/"))) continue;
      text.split("\n").forEach((line, i) => {
        // `export function XButton(` / `export const XBtn = (` — a declared
        // button component outside the sanctioned kits.
        if (/export\s+(?:function|const)\s+[A-Z]\w*(?:Button|Btn)\b/.test(line)) bad.push(`${path}:${i + 1}`);
      });
    }
    expect(bad, `\na button primitive outside the kit — use <APill />:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("RATCHET — chip implementations converge on Chip + AChip", () => {
    // Eighteen at audit time, disagreeing on fill alpha, radius, padding, size,
    // face and border — two of them painting their label with the RAW accent
    // instead of txt(), which failed contrast on the card. What
    // survives is the pair (static tag, selectable filter) plus the genuinely
    // different objects, renamed to say so: MetaPill (a status readout),
    // RailAction (an animated rail item), DayChip ×2 (date tiles), PillBtn (the
    // compact admin action), PlanDockPill (a stateful docked CTA) and
    // ActionPill (a card's one non-unfolding action — deliberately no shared
    // vocabulary with the link beside it, so a footer control never has to be
    // read to know what it will do).
    // Component declarations only — a capitalised name. `toggleTag`,
    // `saveTags` and the like are handlers, not components.
    //
    // DockChip is EXEMPT rather than counted, and the ceiling stays where it
    // was. This ratchet counts chip IMPLEMENTATIONS — a pill hand-rolled where
    // the shared one should have been — and DockChip is a shared one: the third
    // sanctioned primitive beside Chip (a static tag) and AChip (an in-content
    // filter). It is the RAIL chip, and it is genuinely a different object from
    // AChip rather than a ninth spelling of it: a rail is chrome, so it speaks
    // the hero's mono voice, where AChip lives in the content column and speaks
    // Archivo. Borrowing AChip for the rail is precisely why mobile History drew
    // Archivo 13 in a band where the other three rails drew mono 12. It arrived
    // by RETIRING four hand-rolled rails (History and Plans, both clients) and
    // it carries a stricter guard of its own than this one —
    // apps/web/__tests__/dock-rail.test.ts, which checks both clients together.
    // AND THE RULE WAS COUNTING ITS OWN ANSWER. `APill`, `AChip` and
    // `ActionPill` are the shared primitives this ratchet exists to drive call
    // sites TOWARDS — the comment above names two of them as the destination —
    // and their declarations in kit.tsx were being reported as violations of
    // themselves. `GlassPillRow` is a native SwiftUI leaf owned by swiftui.tsx
    // under the one-owner rule below, not a hand-rolled chip.
    //
    // That is not a cosmetic miscount: a ratchet whose floor is the number of
    // canonical components can NEVER reach zero, so it can never graduate to
    // HARD, which is the entire point of the mechanism. 9 → 5, and the 5 are
    // real: LaneOrderChip, DayChip (twice — the logbook rail and the week rail
    // draw the same object separately), MetaPill, PlanDockPill.
    const SANCTIONED = /\b(?:DockChip|APill|AChip|ActionPill|GlassPillRow)\b/;
    const decls = hits(/^\s*(?:export )?(?:function|const) [A-Z][A-Za-z]*(?:Chip|Pill|Tag)[A-Za-z]*\s*[=(]/gm)
      .filter((site) => !SANCTIONED.test(lineAt(site)));
    expectAtMost(decls, 5, "chip-shaped component → Chip, AChip or DockChip");
  });
});

describe("section headers", () => {
  it("RATCHET — one section head, to the documented standard", () => {
    // CLAUDE.md already NAMES the standard: a bold display-face title in chalk,
    // any meta or action as small mono uppercase on the RIGHT of the same row,
    // never a decorative marker on the left. It was then reimplemented eight
    // times — SHead, SecHead, SubHead, RailHead, SectionHead, SectionHeader,
    // SectionLabel ×2 — each agreeing on the shape and disagreeing on everything
    // measurable: title 18 / fs.bodyLg / fs.title / fs.note, serif-swapped or
    // not, meta at nano vs micro, tracking 0.9 vs 1.2, top margin 6/16/24/28.
    //
    // A standard that lives in prose gets re-derived. ASection is that standard
    // as a component. What still matches this pattern are genuinely different
    // objects: ColHead (a table column), WeekHeader, PickerSection, FieldLabel,
    // AppleHealthSection and LeavePlanSection (whole sections, not their heads).
    //
    // AppHeader is NOT a section head and is excluded rather than counted. It
    // is the app's identity row — the lockup every tab root wears — and it is
    // itself the shared component for that thing (packages/core/src/
    // app-header.ts plus the two twins, guarded by app-header.test.ts), the
    // same standing DockChip has in the chip rule above. The pattern reaches it
    // only because "Header" contains "Head", and admitting it by raising the
    // ceiling would spend a RATCHET on the very kind of component the ratchet
    // exists to produce.
    // ASection and AHeading join AppHeader as exemptions, for a stronger reason
    // than his: they are what this rule points AT. The canonical section head
    // was being counted as a hand-rolled section head, which put a floor under
    // the ratchet at the size of the design system and made zero unreachable.
    const SANCTIONED = /\b(?:AppHeader|ASection|AHeading)\b/;
    const decls = hits(/^\s*(?:export )?function [A-Z][A-Za-z]*(?:Section|Head|SubHead)[A-Za-z]*\s*\(/gm)
      .filter((site) => !SANCTIONED.test(lineAt(site)));
    expectAtMost(decls, 6, "section-header component → ASection");
  });
});

describe("meters", () => {
  it("RATCHET — labelled proportions converge on AMeter", () => {
    // The audit counted 13 "bar/meter implementations", and reading them split
    // the number three ways. FIVE were the same labelled horizontal proportion
    // (MeterRow, MeterRows, BarRow ×2, MuscleBar) disagreeing on track height
    // (3 / 7 / 8dp), radius (2 vs 4), where the value sits and whether the label
    // is mono or sans. THREE were vertical COLUMN charts — a different object,
    // with real differences (pace inversion, a muted state, highlight-last).
    // And FIVE were not bars at all: a rail container, a face stroke, a sized
    // rectangle, an animated share-card fill. Those are renamed for what they
    // are (RailSurface, FaceStroke, Rule), because the same misnaming is what
    // hid `Pill` from the chip merge — a wrong name invites a wrong merge as
    // readily as it hides a right one.
    // AMeter itself was in this count — the answer, filed as a violation of
    // itself, putting a floor under the ratchet that made zero unreachable.
    //
    // `UndoBar` was too, and it is not a meter at all: it is the pantry's undo
    // TOAST. This rule's own comment argues that "a wrong name invites a wrong
    // merge as readily as it hides a right one", and that is exactly what had
    // happened, so it is now `UndoToast` — the code moved, not the rule.
    //
    // 8 → 6. What remains are the vertical COLUMN charts the comment above
    // already calls "a different object, with real differences" — StackBar,
    // MuscleBar, DayBars, VolumeBars, EffortSplitBar, MuscleBarFill. They stay
    // counted rather than exempted because "is this a column chart or a
    // labelled proportion" is a judgement per site, and a pinned ceiling keeps
    // them visible without pretending the question is settled.
    const SANCTIONED = /\bAMeter\b/;
    const decls = hits(/^\s*(?:export )?function [A-Z][A-Za-z]*(?:Bar|Bars|Meter)[A-Za-z]*\s*\(/gm)
      .filter((site) => !SANCTIONED.test(lineAt(site)));
    expectAtMost(decls, 6, "labelled proportion → AMeter");
  });
});

describe("fields", () => {
  it("RATCHET — search fields converge on ASearch", () => {
    // Thirteen screens had a search field and none of them shared it: vertical
    // padding 0 / 12 / 16, size fs.body / fs.bodyLg / fs.subtitle / a raw 15,
    // some drawing their own bordered row and some sitting inside one, one set
    // in the MONO face. Not one of the thirteen had a clear button — the
    // affordance an iOS user reaches for without looking, and the only one that
    // matters when a query returns nothing.
    //
    // The four standalone ones are ASearch. The rest sit INSIDE a bespoke row
    // (nutrition's three, the exercise picker, quick-sport) where converting
    // means restructuring the parent, so they are counted here rather than
    // rushed.
    const searches = hits(/placeholder=\{?["']?[^"'}]*[Ss]earch/g);
    expectAtMost(searches, 3, "search field → <ASearch>");
  });
});

describe("loading", () => {
  it("RATCHET — spinners are for ACTIONS; arriving content gets a skeleton", () => {
    // The app had no skeleton at all. All 33 `<Loading />` sites were the shape
    // `if (data === null) return <Loading />` — arriving CONTENT — and rendered a
    // centred spinner, so a section collapsed to nothing and then popped in fully
    // formed. On a phone, where a list IS most of the screen, that reads as a
    // jump rather than an arrival.
    //
    // Loading() is now a skeleton, which fixed all 33 without touching them. What
    // this ratchet bounds is the RAW ActivityIndicator: legitimate inside a
    // button while it saves, wrong as a stand-in for a list. Seven content-shaped
    // ones have moved; the rest are in-flight actions.
    //
    // 19 → 22, and the direction is deliberate rather than a concession. All
    // four additions are the permitted kind — a spinner inside a button while
    // it works — and each REPLACED a label that changed text mid-flight, which
    // resized the button under the finger (audit §17). APill's commit state
    // accounts for one; nutrition's three scan buttons moved the in-flight
    // state into a fixed-size glyph slot so the word beside it can hold still.
    // A raise here bought a layout fix in four places; a raise for a spinner
    // standing in for a list still fails.
    // 19 → 17, and THE 17 ARE THE FLOOR rather than a target. Reading all
    // nineteen, three were still content-shaped — a centred spinner in a 40pt
    // block while a coach list arrived, and two `phase === "loading"` spinners
    // waiting on the watch's workouts — and those are now <Loading />. One of
    // them was drawing the wrong thing half the time: `(phase === "loading" ||
    // phase === "importing")` put ONE spinner behind two different meanings,
    // the list arriving (content) and the import running (an action), so it is
    // split — which is why this went to 17 and not 16: the split KEEPS a
    // legitimate spinner for the importing half.
    //
    // The remaining 17 are all the permitted kind: a spinner inside a button
    // while it saves, scans, exports, deletes or subscribes. THIS RATCHET IS
    // NOT AIMING AT ZERO — in-flight actions will always want a spinner, so its
    // floor is legitimate usage, not debt. Do not force it down; check that a
    // new one sits inside a control, and raise it if that buys a layout fix
    // (see the four that did).
    // 17 → 18: the import sheet's trace row. It is a control — tapping it asks
    // for the series types and fetches the recordings behind what just landed —
    // and its right-hand slot otherwise holds a word that changes ("Allow" →
    // "3 fetched"), so the spinner sits exactly where the permitted four do:
    // in-flight state inside a control, in a slot that holds its own size.
    expectAtMost(hits(/<ActivityIndicator/g), 18, "content ActivityIndicator → <Loading />");
  });
});

describe("colour", () => {
  it("RATCHET — no new hex literals outside the palette", () => {
    // 36 distinct literals at audit time. The ones that mattered were #0e0f0d
    // and #0e100d: ad-hoc surfaces between ink and ink2 that were NOT tokens —
    // in feel-prompt.tsx one sat on the same line as C.ink2, putting two states
    // of one control on two different surfaces.
    // Paid down from 148 → 136 by resolving the #0e0f0d / #0e100d family: the
    // themed-screen uses became palette tokens and the Wrapped takeover's
    // became the named, deliberately fixed-dark HERO_TAKEOVER_INK /
    // HERO_TAKEOVER_RAISED.
    // 82 → 75, and the small number is the finding rather than a shortfall.
    // Only 13 of the 82 duplicated a token at all — this axis is NOT mostly
    // drift, unlike the type and geometry ones. What the rest actually are:
    //
    //   43 are #fff / #000 / #ffffff. Pure white and pure black are NOT in the
    //     palette — `chalk` is #f3f4ef, a cool off-white — so they are gradient
    //     stops, scrims and ink on cover art, not colours that lost their name.
    //     (8 of them ARE text, and might want chalk; that is a look, not a
    //     rename, so it is left.)
    //   12 are ink with an alpha suffix inside a LinearGradient stop
    //     (#0c0d0c00 … #0c0d0ccc). Those want withAlpha(), a separate job.
    //   6 are the exercise-page anatomy RAMP — derived shades climbing to the
    //     accent. Its last stop was the accent's hex and now names it.
    //
    // THE ONE THING THIS SWEEP ACTUALLY FOUND was not in this count at all: the
    // CRASH FALLBACK's hardcoded palette had gone stale in two places. It is
    // exempt from this rule by design (provider-free — see its header), and an
    // exemption with nothing watching it is exactly how its LINE drifted to the
    // #2a2d2a that tokens.ts names as the stale hairline, and its CHALK to
    // #eae3d4 — the GROUND colour of "Clay & Sage on Oat", a light theme
    // deleted whole in Aug 2026 — used as TEXT. The screen a user sees only
    // when everything else has broken was the last one painted in a retired
    // theme. Both corrected, still literal, and now held by
    // lib/error-boundary-palette.test.ts, which is the half of that exemption
    // that was missing. The same #eae3d4 was drawing the web /terms and
    // /privacy pages and went with it.
    // 75 → 61: the 12 eight-digit ones went to withAlpha() with the rest of the
    // colour arithmetic — see the alpha rule below, which is the one that
    // actually covers this axis.
    expectAtMost(hits(/["'`]#[0-9a-fA-F]{3,8}["'`]/g), 61, "hex literal → a palette token");
  });
});

describe("colour arithmetic", () => {
  it("RATCHET — a tint names its rung; a ramp keeps its own stops", () => {
    // Converting the hex suffixes made the alphas readable, and reading them
    // showed 58 distinct values doing two jobs. ALPHA (packages/core/src/theme/
    // tokens.ts) names the six rungs those two jobs actually need — wash / fill
    // / solid for tinted SURFACES, edge / line / rim for tinted BORDERS — and
    // 230 sites now say which one they mean.
    //
    // The scale was derived from the histogram, not chosen: 82 of the 230 did
    // not move at all, 112 moved by 2% or less, and exactly ONE moved by more
    // than 4% (the worst shift in the whole migration is 0.040). Two families
    // rather than one because they tolerate different precision — a surface is
    // a large area where 4% is visible, a hairline is one pixel where it is not.
    //
    // WHAT KEEPS A RAW NUMBER, and this is why the rule is a ratchet and not
    // HARD: the histogram is CONTINUOUS from 0 to 1, not clustered. Above ~0.45
    // it is scrims tuned against specific content, and inside a LinearGradient
    // every stop is a position on a ramp that has to read as smooth. Neither is
    // a palette choice, and snapping them to rungs would be inventing a scale
    // where none exists. The remaining count is those two things, and it should
    // fall only if one of them turns out to be a tint in disguise — NOT by
    // adding rungs until the number reaches zero.
    expectAtMost(codeHits(/withAlpha\((?:[^()]|\([^()]*\))*?,\s*[\d.]+\)/g), 119,
      "a tint → ALPHA.*; a ramp stop or scrim may keep its number");
  });

  it("HARD — alpha is withAlpha(), never a hex suffix", () => {
    // THE RULE ABOVE COULD NOT SEE THIS, which is the point of adding it. The
    // hex-literal ratchet matches QUOTED hex, and 235 of the 247 hand-rolled
    // alphas in this app were TEMPLATE literals — `${C.lime}55` — so 95% of the
    // colour arithmetic in the codebase sat outside the one rule that was
    // supposed to police colour. The 12 it could see looked like a rounding
    // error on a tidy axis; the 235 it could not were the actual debt.
    //
    // AND THE DEBT WAS DRIFT: 45 distinct suffixes for what is really a handful
    // of tints. Eight different values sat in the "barely-there wash" band
    // alone — 0x12, 0x14, 0x1a, 0x1c, 0x1f, 0x22, 0x24, 0x26, which is 7% 8%
    // 10% 11% 12% 13% 14% 15%. Nobody chose eight; each call site converted a
    // percentage in its head and wrote down the byte. Expressed as
    // withAlpha(C.lime, 0.08) the duplicates are finally legible as duplicates.
    //
    // The conversion was byte-identical by construction — withAlpha emits
    // round(a * 255), so each decimal was picked as the shortest one that
    // round-trips to the same byte, and every one of the 247 was verified
    // against its removed form before this rule went HARD.
    //
    // Comment-blind: the sites fixed first are the ones that explain themselves.
    const suffix = codeHits(/`\$\{(?:[^{}]|\{[^{}]*\})+\}[0-9a-fA-F]{2}`/g);
    const eight = codeHits(/["'`]#[0-9a-fA-F]{8}["'`]/g);
    expect([...suffix, ...eight], "hex alpha suffix → withAlpha(color, 0.xx)").toEqual([]);
  });
});

describe("icons", () => {
  /**
   * THE PICTOGRAPHIC RANGES — colour emoji, the things a platform draws for you.
   *
   * Deliberately NOT "every non-ASCII character". The app's vocabulary includes
   * TYPOGRAPHIC marks that are monochrome, take the text colour, and are set in
   * a font: the geometric plan/goal emblems (▲ ◈ ◉ ⬡ ◍ ✚), the ✦ premium
   * signifier the house rules sanction by name, ✓ ✕ ★ ☆, the arrows, ⌁, ☰. Those
   * are TYPE and stay. What is banned is the pictograph — a picture the OS
   * substitutes its own artwork for, in colours the palette does not contain,
   * at a weight nobody chose, differently on every device.
   */
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;
  // The typographic marks that fall inside those blocks and are NOT pictographs.
  const TYPE_MARKS = new Set("✓✦★☆✕✗→←↑↓↔⇄↺↻↳↗↦⇒⬡⬢❚✎♥⚑↯❖⦿⬗⌁☰✚➔➜".split(""));

  it("HARD — the app draws its own marks; no emoji anywhere on the glass", () => {
    // THE FINDING (design audit, Aug 2026): "Three icon languages share one
    // product: 94 custom line glyphs, hand-drawn sport marks used at exactly two
    // sites, and Apple emoji everywhere else — medals on the leaderboard,
    // trophies in the logger, sometimes framed inside the app's own bespoke
    // mark tiles."
    //
    // The emoji were STRUCTURAL, not sprinkled. A dozen core data types declared
    // `icon: string` / `emoji: string` holding a literal pictograph — the sport
    // catalog's 65, the achievements, the recipes, the meal parts, the effort
    // and fatigue and mood scales, the fun-fact tiers — and every renderer drew
    // them with <Text>. Sweeping call sites would have left the fields and the
    // fields would have refilled. So the FIELDS changed type to core's `Mark`
    // (theme/mark.ts), a closed union of the two languages that survive: a
    // glyph name, or a sport. `string` is not a member, so a pictograph can no
    // longer be typed into one at all.
    //
    // HARD from the start, and it has to be: this is the rule a single hurried
    // commit re-breaks, and one emoji beside the drawn set is more visibly
    // wrong than twenty were when twenty was the house style.
    const bad: string[] = [];
    for (const { path, text } of FILES) {
      text.split("\n").forEach((line, i) => {
        if (/^\s*(?:\/\/|\/?\*)/.test(line)) return; // a comment may NAME what it replaced
        const found = [...line.matchAll(EMOJI)].map((m) => m[0]).filter((c) => !TYPE_MARKS.has(c));
        if (found.length) bad.push(`${path}:${i + 1}  ${found.join("")}`);
      });
    }
    expect(bad, `\nemoji on the glass — draw it with <Glyph>, <SportMark> or <Mark>:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("HARD — a mark is drawn by the shared renderer, never by a <Text>", () => {
    // The other half of the rule. Banning the CHARACTER is not enough if a
    // screen can still put a `glyph`/`icon` string into a <Text> and size it
    // like art — that is how the recipe tile came to watermark a dish at
    // fontSize 78 and a plan cover at 118, the two sizes the type ratchet had
    // to except as "artwork, not type".
    //
    // A `<Text>` whose ONLY child is a bare `{x.icon}` / `{x.emoji}` / `{x.glyph}`
    // expression is that shape. The typographic emblem families are the
    // exception and they say so by name: plan-hero's `cover.glyph`, the
    // guidance sections, the chooser cards.
    const EXEMPT = /cover\.glyph|GLYPHS\[|s\.icon\b/;
    const bad = FILES.flatMap(({ path, text }) =>
      text.split("\n").flatMap((line, i) =>
        /<Text[^>]*>\{[a-zA-Z]+\.(icon|emoji)\}<\/Text>/.test(line) && !EXEMPT.test(line)
          ? [`${path}:${i + 1}`]
          : [],
      ),
    );
    expect(bad, `\na mark rendered as type — use <Mark mark={…} />:\n  ${bad.join("\n  ")}`).toEqual([]);
  });
});

describe("presentation", () => {
  it("HARD — no system alerts; the app draws its own decisions", () => {
    // Was 34 Alert.alert calls plus an iOS-only Alert.prompt. They were not
    // incidental sites: delete a session, erase an account, block a person, deny
    // a coach application. All now run through components/aurora/confirm.tsx on
    // the app's own Sheet. HARD, not a ratchet — reintroducing one puts the most
    // consequential moment in the product back in the hands of the OS.
    const src = FILES.filter((f) => !f.path.endsWith("aurora/confirm.tsx"));
    const alerts: string[] = [];
    for (const { path, text } of src) {
      text.split("\n").forEach((line, i) => {
        if (/\bAlert\.(alert|prompt)\(/.test(line)) alerts.push(`${path}:${i + 1}`);
      });
    }
    expect(alerts).toEqual([]);
  });

  it("RATCHET — bespoke chartreuse pills give way to APill", () => {
    // capabilities `cta-pill-convergence`: ~35 hand-rolled `backgroundColor:
    // lime` Pressables that never went through APill, each picking its own
    // padding (8-16), radius (14/16/999) and face (mono/bold/black). Pure
    // design-system drift — and NOT an argument for a native button: the brand
    // CTA deliberately stays the app's own drawing (a `.glassProminent`
    // GlassPillButton wore these once and was reverted; see `swiftui-kit`).
    // APill already owns the hard parts — four variants, the `soft` one on real
    // Liquid Glass, and a commit state that holds its width so a button cannot
    // resize under a finger mid-save. The work is adoption, not replacement.
    //
    // A ratchet rather than a HARD rule, because a handful of these are
    // legitimately not pills (today's chartreuse day-disc). It may only ever
    // fall.
    // THE RADIUS ALTERNATION MUST NAME THE TOKENS TOO. This pattern was written
    // against raw integers (999, 1x, 2x), so when the borderRadius sweep renamed
    // those to RADIUS.* the guard simply stopped seeing two of its own sites and
    // the count fell 31 → 29 with nothing fixed. A rename must never be able to
    // shrink another rule's coverage; `inner` (12) and `field` (16) are the two
    // rungs inside the old 1x/2x range, so they are spelled here as well.
    const RAD = String.raw`(?:999|RADIUS\.(?:pill|inner|field)|1[0-9]\b|2[0-9]\b)`;
    const found = hits(new RegExp(
      String.raw`backgroundColor:\s*(?:C|palette)\.lime[^\n]*borderRadius:\s*${RAD}` +
      String.raw`|borderRadius:\s*${RAD}[^\n]*backgroundColor:\s*(?:C|palette)\.lime`, "g"));
    expectAtMost(found, 31, "hand-rolled lime pill → <APill />");
  });

  it("HARD — Today offers 'log a sport' ONCE per surface", () => {
    // This shipped broken. The action pair landed on the logbook rail's EMPTY
    // days while the done floor kept its own dashed +-tile, so an empty today
    // drew two controls forty pixels apart saying "Log a sport" — and a LOGGED
    // day got no pair at all, which left a past day with training on it no way
    // to add the match it forgot. Three static invariants, because the failure
    // was structural and a screenshot caught it a release later than a test
    // would have:
    const file = (needle: string) => FILES.find((f) => f.path.endsWith(needle));

    // 1. The floor draws no dashed tile. A dashed border is a web affordance,
    //    and the +-square read as one more row in the list it ended.
    const floor = file("aurora/done-floor.tsx")!;
    expect(floor.text).not.toMatch(/borderStyle:\s*"dashed"/);

    // 2. The rail offers the pair in BOTH day states — logged and empty.
    const rail = file("aurora/logbook-rail.tsx")!;
    expect(rail.text.match(/<AActionPair/g) ?? []).toHaveLength(2);

    // 3. And the screen suppresses the floor's own row wherever the rail
    //    already carries one, so the two can never both render.
    const home = file("aurora/home.tsx")!;
    expect(home.text).toMatch(/logRow=\{!logbookMode\}/);
  });

  it("HARD — the two week rails wear ONE separation device", () => {
    // The logbook rail and the plan week rail are the SAME object in two modes:
    // enrolling changes the card's fill, never its shape. Their surface used to
    // be said four times over — a fill AND a 1px border AND a drop shadow AND
    // three inner hairlines — and the two were free to drift, which they did.
    // The fill says it once now. HARD, not a ratchet: a border or a shadow
    // reappearing on either one immediately puts the two rails on different
    // chrome, which is the drift this exists to stop.
    const rails = FILES.filter((f) => /aurora\/(logbook-rail|week-rail)\.tsx$/.test(f.path));
    expect(rails).toHaveLength(2);
    const offences: string[] = [];
    for (const { path, text } of rails) {
      text.split("\n").forEach((line, i) => {
        if (/\b(shadowOpacity|shadowRadius|elevation)\s*:/.test(line)) offences.push(`${path}:${i + 1} — a drop shadow`);
      });
    }
    expect(offences).toEqual([]);
  });

  it("HARD — every bottom sheet is THE Sheet", () => {
    // Eleven surfaces hand-rolled `<Modal animationType="slide">` with their own
    // scrim, panel, radius, drag-handle glyph and safe-area padding — the
    // exercise picker, session editor, device match and import, quick sport, the
    // share sheet, the social and coach profiles, the RPE guide, the anatomy
    // viewer. Each was a re-draw of Sheet MINUS its drag, detents, velocity
    // release and parent recede, so the gesture a user learns on Today died on
    // the controls they touch most. All eleven now present through Sheet.
    //
    // THREE exemptions, and none is a bottom sheet — each is a different
    // presentation with no panel to drag:
    //   • tour.tsx — a full-screen coach-mark overlay.
    //   • hold-menu.tsx — the app's ONE anchored menu card: the post's ⋯ menu
    //     and the long-press that deletes a saved food, a saved meal, a recent
    //     or a remembered pack. It has to be a Modal for a reason Sheet can't
    //     solve: drawn inline it would be clipped by the list it sits in (and by
    //     the row itself on Android), so it renders in its own native window and
    //     is placed from the anchor's measured rect. Presenting it as a sheet is
    //     what an earlier change REVERSED — see the file header. It moved out of
    //     feed-menu.tsx when the hold arrived, so the two could not draw two
    //     cards; feed-menu.tsx now holds no Modal of its own and is no longer
    //     exempt.
    //   • side-menu.tsx — the side DRAWER behind the Today header's avatar. It
    //     is anchored to the LEFT edge and full-height; Sheet is bottom-anchored
    //     with vertical detents, so there is no panel here for its drag,
    //     detents or velocity release to act on. It must be a Modal so it draws
    //     over the native tab bar, which no in-tree view can.
    //
    // `codeHits`, not `hits`: a `<Modal` inside a comment is prose, not a
    // presentation, and the files most likely to describe one are the very
    // files that were converted off it.
    const EXEMPT = ["components/aurora/sheet.tsx", "components/tour.tsx", "components/hold-menu.tsx", "components/aurora/side-menu.tsx"];
    const raw = codeHits(/<Modal\b/g).filter((h) => !EXEMPT.some((f) => h.startsWith(f)));
    expect(raw).toEqual([]);
  });

  it("HARD — and an exempt Modal is not a bottom sheet wearing a different hat", () => {
    // The exemption above is per FILE, which on its own would let a later edit
    // quietly grow a hand-rolled sliding panel inside one of them and keep the
    // suite green. `animationType="slide"` is the tell — it is what all eleven
    // converted surfaces used, and what neither a fading overlay nor an anchored
    // card has any use for. Sheet drives its own animation, so it never sets it.
    // Comment-blind for the same reason as its sibling above — this rule's own
    // explanation quotes the attribute it forbids, and a source file explaining
    // the same thing would fail for saying so.
    const sliding = codeHits(/animationType=["{']?["']?slide/g).filter(
      (h) => !h.startsWith("components/aurora/sheet.tsx"),
    );
    expect(sliding).toEqual([]);
  });

  it("HARD — a Sheet with a flexing body passes `fill`", () => {
    // The cost of the Modal→Sheet conversion above, learned the hard way. The
    // hand-rolled panels were `flex: 1` full-height boxes; Sheet is CONTENT-SIZED
    // for a single detent. A `flex: 1` ScrollView in a content-sized column has
    // nothing to fill, so it collapses to zero height — the exercise picker and
    // the sport chooser opened to a title, a search field and a void. The picker
    // is the only way to put a movement in a session, so the regression read as
    // "I can't add an exercise". Sheet's `fill` gives the panel a real height.
    const tagEnd = (t: string, i: number) => {
      let depth = 0;
      for (let j = i; j < t.length; j++) {
        const c = t[j];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === ">" && depth === 0) return j;
      }
      return t.length;
    };
    const bad: string[] = [];
    for (const { path, text } of FILES) {
      if (path.endsWith("aurora/sheet.tsx")) continue;
      let i = 0;
      while ((i = text.indexOf("<Sheet", i)) !== -1) {
        const gt = tagEnd(text, i);
        const close = text.indexOf("</Sheet>", gt);
        const body = text.slice(gt + 1, close === -1 ? text.length : close);
        const flexes = /<ScrollView[^>]*style=\{[^>]*flex:\s*1/.test(body);
        if (flexes && !/\bfill\b/.test(text.slice(i, gt + 1))) {
          bad.push(`${path}:${text.slice(0, i).split("\n").length}`);
        }
        i = gt + 1;
      }
    }
    expect(bad).toEqual([]);
  });

  it("HARD — one component owns each native leaf", () => {
    // The SwiftUI leaves are the app's most copyable objects: a screen that
    // wants a glass circle can mount `GlassNavButton` itself, pick its own
    // diameter and its own fallback, and look native while agreeing with
    // nothing. That is exactly what the live logger did — a 34pt nav circle at
    // chalk-6% whose comment claimed it was "the same control family as
    // HeroNav's back circle" (HeroNav draws 40 in a 44 hit box from HERO.nav),
    // and a 44pt dock satellite beside a 54pt summary orb that were the same
    // button drawn twice in one file.
    //
    // So each leaf has exactly ONE owner, and the owner is the component that
    // also draws the floor: the nav button is HeroNav's, the satellite is
    // ASatellite's. A screen composes those, never the leaf.
    const OWNER: Record<string, string> = {
      GlassNavButton: "components/aurora/hero.tsx",
      GlassSatellite: "components/aurora/satellite.tsx",
    };
    const bad: string[] = [];
    for (const [leaf, owner] of Object.entries(OWNER)) {
      for (const h of codeHits(new RegExp(`<${leaf}\\b`, "g"))) {
        if (!h.startsWith(owner)) bad.push(`${h} — ${leaf} belongs to ${owner}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("HARD — the segmented control is never a native Picker", () => {
    // A SwiftUI `Host` sizes its RN box from the SwiftUI content ONCE, at mount
    // (`matchContents`, the prop's own documented limit). Every segmented
    // control in this app mounts before it knows its content — the labels are
    // translated asynchronously by `useLang`, the date filter's segments are
    // derived from the session history, and the Today hub REMOUNTS on every
    // selection because the tab swaps the whole screen tree. So the DRAWN frame
    // never tracked the LAYOUT frame, and it missed differently at each call
    // site: the hub pills painted ~70pt below their box, onto "Tuesday, 11
    // August", while the This-week filter painted above its row's centre, into
    // the card's head. One component, two unrelated misses.
    //
    // A control that is one line of prose ("where an element maps to a real
    // system control, it goes native") away from being re-added needs a guard
    // rather than the prose. The segmented control is `ASegment` → `LiquidSeg`,
    // laid out entirely by Yoga, on every platform. The other native leaves are
    // unaffected: they size against content they already have, or sit in a
    // sheet that gives them a height.
    expect(codeHits(/\bGlassSegment\b/g)).toEqual([]);
    expect(codeHits(/pickerStyle\(\s*["']segmented["']\s*\)/g)).toEqual([]);
  });

  it("HARD — a tab row is the shared control, never a hand-drawn one", () => {
    // The other half of the rule above, and the one that actually kept getting
    // broken. Forbidding the NATIVE segmented control says nothing about the
    // four surfaces that drew their own instead — the nutrition picker's
    // sources, the profile's tabs, the public profile's tabs and the day card's
    // session toggle — and every one of them was written by somebody who had
    // read the rules and concluded, reasonably, that a track was too heavy
    // there. Four reasonable local decisions are how an app ends up switching
    // four ways.
    //
    // A tab row is `ASegment`. The one file allowed to spell tabs by hand is
    // the shared control's own implementation, which has to.
    //
    // NOTE FOR THE NEXT ARGUMENT, because it will be made again and it is a
    // GOOD argument: "a track inside a card is a second surface." That is true
    // of a RAISED track and it is why the card case sat unconverted longest —
    // the answer is `surface: 'card'`, which recesses the track into the card
    // instead of stacking one on it. Reach for that before reaching for a
    // bespoke row.
    const SHARED = "components/aurora/liquid-seg.tsx";
    const byHand = codeHits(/accessibilityRole=\{?\s*["']tab(?:list)?["']/g).filter((h) => !h.startsWith(SHARED));
    expect(byHand).toEqual([]);
  });

  it("HARD — the underline selection rule gives way to the shared control", () => {
    // THE SAME DEFECT, SPELLED WITHOUT THE ROLE — and the reason the rule above
    // is not the whole guard. A hand-drawn tab row that never sets
    // `accessibilityRole` is invisible to it, and writing this one found two
    // that nobody had counted: the period switches in `trends.tsx` and
    // `exercise-page.tsx`. Both were a row of labels with a 2dp CHARTREUSE
    // bottom border under the selected one — a segmented control with the track
    // taken off, and the accent spent on a control that goes nowhere.
    //
    // It shipped as a RATCHET at 2 for one honest reason: the Trends switch
    // shares a band row WITH ITS SECTION LABEL, so dropping a track in changes
    // that row's shape, and that is a design decision a guard has no business
    // making. The decision was made — the label keeps its natural width, the
    // track takes the rest of the row — so the ceiling is zero and this is HARD,
    // exactly as the ratchet said it would be.
    //
    // The pattern is deliberately narrow — width 2 AND a colour ternary on the
    // same line — so it catches the SELECTED/not idiom and leaves plain 2dp
    // dividers alone.
    expect(codeHits(/borderBottomWidth:\s*2\b[^\n]*borderBottomColor:[^\n]*\?/g)).toEqual([]);
  });

  it("HARD — a COVER pads itself; no native SafeAreaView inside a fullScreenModal", () => {
    // A cover (@hybrid/core COVER_SCREENS — on mobile the live logger, and
    // nothing else) is presented in its OWN view controller. A native
    // SafeAreaView mounted in there never applies its top edge, whatever the
    // provider was seeded with, so the logger shipped a whole TestFlight build
    // with its header across the status bar: the lift's name and the clock on
    // the carrier row, the chevron in the notch band. The seed fixed the HOOK
    // (which is why the dock's bottom pad was right in the same build) and
    // nothing else, which is exactly what made the remaining half easy to miss.
    //
    // So a cover reads the hook and pads itself — lib/layout `coverInsets`. The
    // route list comes from core rather than a filename typed here, for the
    // reason the layout takes it from there too: a mode is a mode on both
    // clients, and `log` means different things on each.
    const covers = COVER_SCREENS.filter((r) => r !== "log").map((r) => `app/${r}.tsx`);
    expect(covers.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const path of covers) {
      const file = FILES.find((f) => f.path === path);
      expect(file, `${path} — a cover route with no source file`).toBeTruthy();
      file!.text.split("\n").forEach((line, i) => {
        if (/<SafeAreaView\b/.test(line)) bad.push(`${path}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});

describe("screens", () => {
  /**
   * HARD — EVERY SCREEN SITS ON THE AURORA FIELD.
   *
   * The motion audit ran four waves across this app and reached the onboarding
   * wizard in none of them, which nothing noticed for one structural reason:
   * the screen never asked for the shell. It painted `backgroundColor: ink` on
   * a bare SafeAreaView of its own, so it was the only route in the product
   * with no ambient field behind it and no fade+rise on entry — and BECAUSE it
   * held no shared component, every sweep that worked by touching the shared
   * ones passed straight over it. A screen that opts out of the scaffold opts
   * out of everything the scaffold is later taught.
   *
   * So the rule is about REACH, not about a style: a route must arrive at
   * `AuroraScreen` (or the hero shell it dispatches to), or render the field
   * itself if it genuinely owns its own scaffold — the live logger and Today
   * both do, legitimately, and both carry `useEntrance` with it.
   *
   * The check follows a route's DEFAULT IMPORTS one hop, because half the
   * routes here are a five-line re-export of the component that is the actual
   * screen (`app/onboarding.tsx` → `components/aurora/onboarding.tsx`). One
   * hop, and default imports only: a named import is a part, not the screen.
   */
  it("HARD — a route reaches the Aurora shell, or draws the field itself", () => {
    // The two that are not screens, and are exempt in writing rather than by
    // being quietly skipped:
    //   • index — the entry GATE. It decides where you are going and renders a
    //     flat holding view for the frame it takes to decide; a field and an
    //     entrance there would animate a screen nobody is meant to see.
    //   • upgrade — the paywall route is a TRANSPARENT pane for the shared
    //     Sheet to present over (see app/_layout.tsx). It has no background of
    //     its own on purpose: the screen behind it is the background.
    const EXEMPT = new Set(["app/index.tsx", "app/upgrade.tsx"]);
    const SHELL = /AuroraScreen|HeroScreen|AuroraField/;

    const routes = FILES.filter(
      (f) => f.path.startsWith("app/") && f.path.endsWith(".tsx") && !/_layout|\+not-found/.test(f.path),
    );
    // A regex that matches nothing reads exactly like a clean codebase.
    expect(routes.length).toBeGreaterThan(40);

    const byPath = new Map(FILES.map((f) => [f.path.split("\\").join("/"), f.text]));
    /** `../components/aurora/onboarding` from `app/onboarding.tsx`, as a repo
     *  path — with the extension the import omits put back. */
    const resolve = (from: string, spec: string): string | undefined => {
      const dir = from.slice(0, from.lastIndexOf("/"));
      const parts = `${dir}/${spec}`.split("/");
      const out: string[] = [];
      for (const p of parts) {
        if (p === "." || p === "") continue;
        else if (p === "..") out.pop();
        else out.push(p);
      }
      const base = out.join("/");
      return [`${base}.tsx`, `${base}/index.tsx`].find((c) => byPath.has(c));
    };

    const bad: string[] = [];
    for (const { path, text } of routes) {
      if (EXEMPT.has(path)) continue;
      let reach = text;
      for (const m of text.matchAll(/^import\s+[A-Z][A-Za-z0-9_]*(?:\s*,\s*\{[^}]*\})?\s+from\s+"(\.[^"]+)"/gm)) {
        const target = resolve(path, m[1]!);
        if (target) reach += `\n${byPath.get(target)}`;
      }
      if (!SHELL.test(reach)) bad.push(path);
    }
    expect(bad, `\na screen off the shell — render it inside <AuroraScreen>:\n  ${bad.join("\n  ")}\n`).toEqual([]);
  });

  it("HARD — a screen that draws its own scaffold draws the ENTRANCE with it", () => {
    // The other half of the same rule. Opting out of AuroraScreen is allowed —
    // Today and the live logger both have real reasons — but the shell is a
    // PAIR: the field behind the screen and the fade+rise the content enters
    // on. Onboarding is the proof that half of it is easy to miss; it rendered
    // neither, and its own header comment described a "stepped, rounded
    // wizard" as though that were a scaffold.
    //
    // `app/workout.tsx` is exempt and is the one case where the omission is
    // right: the logger is a COVER (@hybrid/core COVER_SCREENS), presented by
    // the navigator with its own rise from the bottom edge. A second entrance
    // inside it would play over the presentation.
    const EXEMPT = new Set(["app/workout.tsx"]);
    const owns = FILES.filter((f) => /<AuroraField\b/.test(f.text) && !EXEMPT.has(f.path));
    expect(owns.length).toBeGreaterThan(2);
    const bad = owns.filter((f) => !/useEntrance\b/.test(f.text)).map((f) => f.path);
    expect(bad, `\nowns its scaffold but not its entrance:\n  ${bad.join("\n  ")}\n`).toEqual([]);
  });

  it("HARD — the measure row is a component, not a shape two screens both know", () => {
    // Volume's "By muscle" list and the Progress card's comparison page ask the
    // identical question — a measure, where it sits, and the landmarks that
    // give the mark meaning — and the second was built as a hand-rolled copy of
    // the first. aurora/measure-row.tsx is now the one definition of that row's
    // head line, its rail and its landmark scale, so a change to any of the
    // three lands on both screens or on neither.
    //
    // The rail's own geometry is what this pins, because it is the piece most
    // easily re-typed: an 11dp track is the field a measure is marked in, and a
    // second file stating it is a second rail that will drift.
    const rail = FILES.filter((f) => /height:\s*11\b[\s\S]{0,80}?backgroundColor:\s*C\.ink\b/.test(f.text))
      .map((f) => f.path)
      .filter((p) => p !== "components/aurora/measure-row.tsx");
    expect(rail, `\nthe measure rail is re-typed outside measure-row.tsx:\n  ${rail.join("\n  ")}\n`).toEqual([]);

    // …and both screens really do read it, so this rule is guarding something
    // that exists rather than a file nobody imports.
    const readers = FILES.filter((f) => /from "\.\/measure-row"/.test(f.text)).map((f) => f.path);
    expect(readers).toContain("components/aurora/volume.tsx");
    expect(readers).toContain("components/aurora/activity-compare.tsx");
  });
});
