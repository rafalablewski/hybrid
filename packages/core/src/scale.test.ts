import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fs, space, lh, leading, tracking, trackFigure, trackOtp, kernPad, kernLead, TRACK_FIGURE_EM, TRACK_OTP_EM, fitMonoFigure, MONO_ADVANCE_EM, type TypeRole, type SpaceToken, X_HEIGHT_EM, TYPE_REF, STEP, SCALE_RATIO, rung, measure, opticalTrackEm, OPTICAL_K, CAPS_AIR_EM } from "./scale";
import { FIGURE_INK_EM, SOHNE } from "./theme/face-metrics";
import { ALPHA, fonts, fontImportUrl } from "./theme/tokens";

/**
 * THE SCALE'S OWN GUARD.
 *
 * The design audit's root finding was that the token system is well authored and
 * not enforced — nothing failed when a call site invented a value. Motion was the
 * one healthy axis precisely because motion.test.ts holds it to its own rules.
 * This is the same guard for type, spacing, leading and tracking: it can't stop a
 * screen writing `fontSize: 21`, but it does stop the SCALE itself from growing a
 * rung that breaks the ladder's promises.
 */

// Eleven rungs on the SANS ladder. `note` (15) and `heading` (20) were retired
// in Aug 2026 — see the note on `fs` for why neither was ever chosen.
const ORDER: TypeRole[] = [
  "nano", "micro", "caption", "body", "bodyLg",
  "subtitle", "title", "headline", "display", "hero", "stat",
];

// THE LADDER IS THE WHOLE MAP AGAIN. `editorial` (33) used to sit off it — the
// serif's own rung, `display` x the x-height ratio between Söhne and ITC
// Garamond — and it went with the face in Aug 2026. A second ladder with one
// rung on it is only ever justified by a second face.

const SPACE_ORDER: SpaceToken[] = [
  "none", "xxs", "xs", "sm", "ms", "md", "lg", "xl", "xxl", "xxxl", "huge",
];

describe("type scale", () => {
  it("names every rung exactly once", () => {
    expect(Object.keys(fs).sort()).toEqual([...ORDER].sort());
  });

  it("keeps the x-height it derives the reference rung from", () => {
    // The measurement the ladder's seed rests on, read off the shipped binary
    // by theme/face-metrics.test.ts rather than typed here. It was a literal in
    // this file until Aug 2026, and the serif's literal (0.445) had already
    // drifted from what its binary measured (0.4409) — which is the entire
    // reason metrics stopped being literals.
    expect(X_HEIGHT_EM.sans).toBeCloseTo(0.523, 4);
  });

  it("ascends strictly — no two rungs share a size", () => {
    const sizes = ORDER.map((r) => fs[r]);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!, `${ORDER[i]} must exceed ${ORDER[i - 1]}`).toBeGreaterThan(sizes[i - 1]!);
    }
  });

  it("never dips below the legibility floor", () => {
    // 10 is `nano`, and it is the floor on purpose: below it the app's dominant
    // eyebrow style (mono + uppercase + tracked) stops being readable at arm's
    // length. The audit found 98 text nodes at 8–9px; the ladder must not be the
    // thing that legitimises them.
    for (const role of ORDER) expect(fs[role], role).toBeGreaterThanOrEqual(10);
  });

  it("IS a modular scale — every rung is the ratio raised to an integer", () => {
    // THIS REPLACED A GAP HEURISTIC, and the replacement is the point of the
    // Aug 2026 rebuild. The old assertion was that dp gaps never shrink as the
    // ladder climbs (1,1,1,1,2,2,4,4,8,12) — a property a hand-written list can
    // satisfy by accident and a real scale satisfies by construction. It also
    // could not answer the only question that matters when someone proposes a
    // new rung: does this size belong on the ladder at all.
    //
    // Now it can. Every rung is `TYPE_REF x STEP^n` for an INTEGER n, so a
    // proposed size either has an exponent or it does not, and "it felt right"
    // has nowhere left to land.
    // Note the test recovers `n` by INVERTING the ladder and rounding, then
    // re-derives the rung from it. Rounding a rung to whole dp costs up to half
    // a dp, which at `nano` is a fifth of a half-step — so the exponent cannot
    // be recovered to a tight tolerance and asserting one would be theatre. The
    // identity `fs[role] === rung(n)` is exact and is the real check.
    const seen = new Set<number>();
    for (const role of ORDER) {
      const n = Math.round(Math.log(fs[role] / TYPE_REF) / Math.log(STEP));
      expect(fs[role], `${role} must equal rung(${n}) = ${rung(n)}`).toBe(rung(n));
      expect(seen.has(n), `${role} shares exponent ${n} with an earlier rung`).toBe(false);
      seen.add(n);
    }
    // The reference rung is the reference size, by construction and not by luck.
    expect(fs.bodyLg).toBe(TYPE_REF);
    expect(rung(0)).toBe(TYPE_REF);
  });

  it("runs one ratio at two intervals, and the coarser one is on top", () => {
    // Granularity follows the eye: half-steps through the reading band, where
    // rank comes from ink and weight and the rungs only have to land near a
    // usable dp; FULL steps once type is seen rather than read, where size IS
    // the hierarchy and a level has to be unmistakable.
    const n = (role: TypeRole) => Math.round(Math.log(fs[role] / TYPE_REF) / Math.log(STEP));
    const READING: TypeRole[] = ["nano", "micro", "caption", "body", "bodyLg", "subtitle", "title", "headline"];
    for (let i = 1; i < READING.length; i++) {
      expect(n(READING[i]!) - n(READING[i - 1]!), `${READING[i]} is not one half-step above ${READING[i - 1]}`).toBe(1);
    }
    // The display band steps a full major third at a time...
    expect(n("display") - n("headline")).toBe(2);
    expect(n("hero") - n("display")).toBe(2);
    // ...and the hero FIGURE takes a step and a half, because it has to beat a
    // masthead sitting above it rather than tie with it.
    expect(n("stat") - n("hero")).toBe(3);
    expect(fs.stat / fs.hero).toBeGreaterThan(SCALE_RATIO ** 0.5);
  });

  it("ascends without ever stepping back down in RATIO terms", () => {
    // The optical property the old gap test was reaching for, stated in the
    // right unit. Equal-looking increments need proportionally larger jumps, so
    // what must never shrink is the RATIO between neighbours, not the dp gap —
    // and on a generated ladder it cannot, which is why this is cheap to hold.
    const sizes = ORDER.map((r) => fs[r]);
    const ratios = sizes.slice(1).map((v, i) => v / sizes[i]!);
    for (const r of ratios) expect(r).toBeGreaterThan(1);
    expect(Math.max(...ratios)).toBeLessThanOrEqual(SCALE_RATIO ** 1.5 + 0.01);
  });

  it("gives a measure in characters, not a hand-typed max-width", () => {
    // 66 characters is the classic centre of the 45-75 band. Turning it into a
    // width needs the face's average advance, which is a thing the system can
    // now ask instead of guess.
    expect(measure(fs.body)).toBe(Math.round(fs.body * 66 * SOHNE.buch.advanceN));
    // On a phone the reading sizes need no cap at all, and saying so is useful:
    // it is why `prose` carries no maxWidth on mobile and does on a desktop.
    expect(measure(fs.body)).toBeGreaterThan(390);
    expect(measure(fs.body, 45)).toBeLessThan(measure(fs.body, 75));
  });

  it("has retired `note` and `heading`, and cannot get them back by accident", () => {
    expect(Object.keys(fs)).not.toContain("note");
    expect(Object.keys(fs)).not.toContain("heading");
    // THE CHECK IS ON KEYS, AND IT USED TO BE ON VALUES TOO. That stopped being
    // meaningful when the ladder was regenerated: `title` is 20 now, which is
    // the dp `heading` used to hold. Those retirements were never about the
    // NUMBER 20 — they were about two names for one job (`heading` and
    // `headline` were both "the screen sub-heading"). A value assertion here
    // would now fail for a rung that is doing nothing wrong, and would have gone
    // on passing if someone re-added `heading` at 21.
  });

  it("ends at `stat` — a figure larger than this is a design smell", () => {
    expect(Math.max(...Object.values(fs))).toBe(fs.stat);
  });
});

describe("spacing scale", () => {
  it("starts at zero and ascends strictly", () => {
    const sizes = SPACE_ORDER.map((r) => space[r]);
    expect(sizes[0]).toBe(0);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!, `${SPACE_ORDER[i]} must exceed ${SPACE_ORDER[i - 1]}`).toBeGreaterThan(sizes[i - 1]!);
    }
  });

  it("is entirely even — an odd gap can't sit on a half-pixel boundary", () => {
    for (const token of SPACE_ORDER) expect(space[token] % 2, token).toBe(0);
  });
});

describe("leading", () => {
  it("ascends from tight to relaxed", () => {
    expect(lh.tight).toBeLessThan(lh.snug);
    expect(lh.snug).toBeLessThan(lh.normal);
    expect(lh.normal).toBeLessThan(lh.relaxed);
  });

  it("is expressed as a RATIO, so a scaled size carries its line box with it", () => {
    // The Dynamic Type failure mode: an absolute lineHeight leaves the line box
    // where it was when the OS scales the glyphs. Doubling the size must double
    // the leading.
    expect(leading(fs.body)).toBe(Math.round(fs.body * lh.normal));
    expect(leading(fs.body * 2)).toBe(Math.round(fs.body * 2 * lh.normal));
  });

  it("always clears the font size — a line box can't be shorter than its glyphs", () => {
    for (const role of ORDER) {
      expect(leading(fs[role], "tight"), role).toBeGreaterThan(fs[role]);
    }
  });

  it("returns whole dp so text lands on the pixel grid", () => {
    expect(Number.isInteger(leading(15, "relaxed"))).toBe(true);
  });

  it("defaults to `normal`", () => {
    expect(leading(fs.body)).toBe(leading(fs.body, "normal"));
  });
});

describe("tracking", () => {
  it("takes air out of large type and adds it to caps", () => {
    // THE BANDS, and the direction of each: large type gets air taken OUT,
    // small copy gets a trace back IN, and uppercase always gets more.
    expect(tracking(fs.hero)).toBeLessThan(0);
    expect(tracking(fs.display)).toBeLessThan(0);
    expect(tracking(fs.body)).toBe(0);
    expect(tracking(fs.caption)).toBeGreaterThan(0);
    expect(tracking(fs.nano, "caps")).toBeGreaterThan(tracking(fs.nano, "label"));
  });

  it("trackFigure tightens proportionally, where the absolute rung cannot", () => {
    // The whole point: -0.5 is -0.017em at 30dp and -0.007em at 68dp, so one
    // absolute value cannot serve a 2.3x span. This one scales with the figure.
    // Equal em across the span, to within the 0.1dp rounding — which at 30dp
    // is worth ~0.002em, so `2` is the honest precision here, not `3`.
    expect(trackFigure(30) / 30).toBeCloseTo(trackFigure(68) / 68, 2);
    // And every figure in the band is tighter than the absolute rung would be.
    for (const size of [30, 40, 46, 56, 68]) {
      expect(trackFigure(size), `${size}dp`).toBeLessThan(tracking(fs.display));
    }
  });

  it("lands on what the biggest figures were already drawn at", () => {
    // fs.stat carried -1.6 by hand at three sites before this existed; the
    // constant was derived from that cluster, so it has to return it AT THE
    // SIZE THOSE SITES WERE DRAWN AT. The ladder moved `stat` 46 -> 49 in Aug
    // 2026 and the tracking followed it to -1.7, which is the whole reason this
    // is an em and not a dp: the intent survives a change of size, and the dp
    // is recomputed rather than re-guessed.
    expect(trackFigure(46)).toBe(-1.6);
    expect(trackFigure(fs.stat)).toBe(-1.7);
    // Rounded to 0.1dp — RN takes fractional letterSpacing, and at this size
    // the tenth is visible.
    expect(trackFigure(46)).toBe(Math.round(46 * TRACK_FIGURE_EM * 10) / 10);
  });

  it("kernPad gives back exactly the kern a negative tracking never draws", () => {
    // The defect it exists for: a tracking is applied after the LAST glyph
    // too, so a run lays out |track| narrower than it draws, and a TextInput
    // — which clips to its bounds, unlike a Text — cuts the difference off the
    // last character. At the app's biggest figure that is 1.7dp of the last
    // digit, which is what the workout logger's set editor was shaving.
    expect(kernPad(trackFigure(fs.stat))).toBe(1.7);
    expect(kernPad(trackFigure(fs.stat))).toBe(-trackFigure(fs.stat));
    // EXACT, not a fudge — the pad IS the tracking, negated, at every size.
    for (const size of [27, 30, 46, 49, 68]) {
      expect(kernPad(trackFigure(size)), `${size}dp`).toBe(-trackFigure(size));
      expect(kernPad(tracking(size)), `${size}dp`).toBe(-tracking(size));
    }
    // ZERO FOR A POSITIVE TRACK, and that is the definition rather than a
    // clamp on a bad input: a positive tracking leaves a real trailing gap
    // inside the box, so nothing is clipped. What it breaks is centring, and
    // that compensation belongs to the opposite edge.
    expect(kernPad(8)).toBe(0);
    expect(kernPad(tracking(fs.nano, "label"))).toBe(0);
    expect(kernPad(0)).toBe(0);
  });

  it("kernLead is the same kern from the other end — the centring half", () => {
    // A positive tracking is never clipped; the trailing gap lands INSIDE the
    // box, so a centred run sits half a gap left of centre. The one-time-code
    // fields are the only shape in the app that does it, and 8dp of tracking
    // on six centred digits is 4dp of drift.
    expect(kernLead(8)).toBe(8);
    expect(kernLead(3)).toBe(3);
    // ZERO FOR A NEGATIVE TRACK — that one is kernPad's, and it is a clip, not
    // a drift. The pair is exhaustive and never both non-zero: whichever edge
    // the trailing kern took from, exactly one of them gives it back.
    expect(kernLead(trackFigure(fs.stat))).toBe(0);
    for (const track of [-1.7, -0.3, 0, 3, 8]) {
      expect(Math.min(kernPad(track), kernLead(track)), `${track}`).toBe(0);
      expect(kernPad(track) + kernLead(track), `${track}`).toBe(Math.abs(track));
    }
  });

  it("trackOtp is the third tracking — semantic, and one em for three sites", () => {
    // ONE INTENT, THREE SPELLINGS, no two agreeing: mobile login 8dp at 28
    // (0.286em), web login .3em at 22, mobile MFA 3dp at 18 (0.167em). The
    // first two are the same decision written twice; the third is half of it
    // for no reason anybody wrote down. 0.29em is the band the two agreeing
    // sites sit in, which is why adopting it costs them nothing.
    expect(trackOtp(fs.display)).toBe(8.1);   // was 8   — under the rounding
    expect(trackOtp(fs.headline)).toBe(6.4);  // was 6.6 — .3em at 22
    // AND THE ONE SITE THAT MOVES, which is the point of doing this at all.
    expect(trackOtp(fs.subtitle)).toBe(5.2);  // was 3
    // Proportional, like its two siblings — one dp cannot serve 18, 22 and 28.
    expect(trackOtp(28) / 28).toBeCloseTo(trackOtp(18) / 18, 3);
    expect(trackOtp(46)).toBe(Math.round(46 * TRACK_OTP_EM * 10) / 10);
    // POSITIVE at every size, so it is kernLead's case and never kernPad's —
    // a code field cannot clip, it can only sit off centre.
    for (const size of [10, 18, 22, 28, 49]) {
      expect(trackOtp(size), `${size}dp`).toBeGreaterThan(0);
      expect(kernPad(trackOtp(size)), `${size}dp`).toBe(0);
    }
    // WIDER THAN THE OPTICAL TRACKINGS AT EVERY SIZE, which is the whole
    // reason it is its own function: it is not a refinement of how the text
    // reads, it is the thing the text is saying.
    for (const size of [18, 22, 28]) {
      expect(trackOtp(size), `${size}dp`).toBeGreaterThan(Math.abs(tracking(size)));
      expect(trackOtp(size), `${size}dp`).toBeGreaterThan(tracking(size, "caps"));
    }
  });

  it("codifies the two eyebrow trackings already in use", () => {
    // 0.9 (216 sites) and 1.2 (137 sites) at the time of the audit. Changing
    // either is a deliberate restyle of every kicker in the app, not a tweak.
    //
    // THE CONVERSION PROOF, NOW ACROSS TWO CONVERSIONS. These survived tracking
    // becoming an em (Aug 2026) and they survive it becoming a CURVE: the
    // uppercase voices compose caps air with the optical curve, and at `fs.nano`
    // the curve contributes exactly the +0.0089em that keeps both landing where
    // they shipped. That is the evidence the composition is the same intent
    // spelled properly rather than a new one.
    expect(tracking(fs.nano, "label")).toBe(0.9);   // 201 sites
    expect(tracking(fs.nano, "caps")).toBe(1.2);    //  72 sites
    // THE ONE THAT MOVES, and it moves the way the model says it always should
    // have: 48 sites at `fs.micro` go 0.9 -> 1.0, because smaller capitals need
    // MORE air, and a flat em could not say so.
    expect(tracking(fs.micro, "label")).toBe(1.0);
    expect(tracking(fs.micro, "label")).toBeGreaterThan(CAPS_AIR_EM.label * fs.micro);
    // The reference rung takes no correction at all, by construction — this is
    // the curve's zero and the ladder's origin, and they are the same number.
    expect(tracking(fs.bodyLg)).toBe(0);
    expect(opticalTrackEm(TYPE_REF)).toBe(0);
  });
});

describe("ALPHA — the tint scale", () => {
  it("rises, and splits into a surface family and a border family", () => {
    expect(ALPHA.wash).toBeLessThan(ALPHA.fill);
    expect(ALPHA.fill).toBeLessThan(ALPHA.solid);
    expect(ALPHA.solid).toBeLessThan(ALPHA.edge);
    expect(ALPHA.edge).toBeLessThan(ALPHA.line);
    expect(ALPHA.line).toBeLessThan(ALPHA.rim);
  });

  it("keeps the SURFACE rungs close and lets the BORDER rungs breathe", () => {
    // The two families tolerate different precision. A surface is a large area
    // where a 4% shift is subtle but visible; a border is ONE PIXEL wide, where
    // it is not. So the surface steps must stay tighter than the border steps —
    // that asymmetry IS the scale, and flattening it would break the migration's
    // guarantee that nothing moved by more than 0.04.
    const surface = ALPHA.solid - ALPHA.wash;
    const border = ALPHA.rim - ALPHA.edge;
    expect(surface).toBeLessThan(border);
    expect(ALPHA.fill - ALPHA.wash).toBeLessThanOrEqual(0.05);
    expect(ALPHA.solid - ALPHA.fill).toBeLessThanOrEqual(0.05);
  });

  it("stops where the axis stops being a scale", () => {
    // Nothing above ~0.45 has a rung, deliberately: the measured histogram runs
    // CONTINUOUS from 0 to 1 because gradient ramps need arbitrary intermediate
    // stops and scrims are tuned against the content behind them. A token set
    // covering 71% of its axis honestly beats one covering 100% by pretending.
    for (const v of Object.values(ALPHA)) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(0.45);
    }
  });
});

/**
 * THE FACES — two, and the guard is here because the third one died quietly.
 *
 * `fonts.condensed` (a narrow cut) was declared in the brand tokens and
 * specified in the build brief for two years, and the mobile app — the product —
 * never loaded it: four sans weights and two mono weights in
 * `useFonts`, no package for it anywhere. Nothing failed,
 * because a declared-but-unloaded family is not an error on either platform: RN
 * falls back to the system face and CSS falls through to the next name in the
 * stack. So the identity read as three faces in the tokens and shipped as two,
 * and the web admin's chips drew in a face the phone's admin console could not.
 *
 * These assertions exist so re-declaring the face is a deliberate act with a
 * loading step attached, rather than a line in a token file that looks true.
 */
describe("the type faces", () => {
  it("declares exactly the faces the app loads", () => {
    expect(Object.keys(fonts).sort()).toEqual(["display", "mono"]);
  });

  it("serves exactly the faces it declares, and from nowhere public", () => {
    // THIS USED TO CHECK `fontImportUrl` against `fonts`, because web pulled
    // both faces from Google. Söhne is licensed and cannot come from a public
    // host, so the import is gone and the declaration moved into globals.css —
    // the rule has to follow the declaration or it is guarding an empty string.
    //
    // The original intent survives intact: a face declared and not loaded is
    // how the narrow cut stayed alive on web after mobile had already decided
    // against it, and a face loaded and not declared is a download for nothing.
    expect(fontImportUrl, "a public @import cannot serve a licensed face").toBe("");
    const css = readFileSync(join(__dirname, "..", "..", "..", "apps", "web", "app", "globals.css"), "utf8");
    const declared = new Set([...css.matchAll(/@font-face\{font-family:"([^"]+)"/g)].map((m) => m[1]!));
    // WEB SERVES BOTH, and the list is no longer filtered. It used to exclude
    // `fonts.serif`: the editorial voice was a CONSUMER surface, and the web
    // deployment has no consumer surfaces left (see the mobile-first rule in
    // CLAUDE.md), so declaring the face here would have shipped a webfont
    // download nothing on the domain could ever paint. The face was deleted in
    // Aug 2026 and the exclusion went with it — there are two faces and both
    // are drawn on both clients.
    expect([...declared].sort()).toEqual(Object.values(fonts).slice().sort());
    expect(css, "no public font host").not.toMatch(/fonts\.googleapis\.com/);
  });
});

/**
 * FITTING A FIGURE, RATHER THAN GUESSING AT ONE.
 *
 * The activity card shipped four figures in four quarter-width columns and two
 * of them broke mid-word on a phone. Nothing was wrong with the code that a
 * reviewer could see; what was missing was the multiplication that says whether
 * a mono figure fits before a size is committed to. These pin that arithmetic,
 * including the two answers that are easy to get backwards: an UNMEASURED
 * container gets the caller's first choice (not the floor, which would render
 * every figure small for a frame and then jump), and a figure past the floor
 * gets the floor (the caller owns what happens past it).
 */
describe("fitMonoFigure", () => {
  const ladder = [26, 22, 20] as const;
  /** What a string of `n` glyphs costs at `size`, by the same arithmetic. */
  const cost = (n: number, size: number) => n * size * MONO_ADVANCE_EM;

  /** A receipt cell's type width on a 390dp screen: the card's 326dp inner
   *  width, halved, less the cell's own 8dp inset. */
  const CELL = 155;

  it("takes the largest rung that fits", () => {
    expect(fitMonoFigure("15.3 t", CELL, ladder)).toBe(26);
    expect(cost(6, 26)).toBeLessThanOrEqual(CELL);
    // A nine-glyph span still clears the top rung, which is the point of asking
    // rather than assuming: the pessimistic guess would have shrunk it.
    expect(fitMonoFigure("10h 15min", CELL, ladder)).toBe(26);
  });

  it("steps down exactly when the next rung stops fitting", () => {
    // Eleven glyphs — a year-to-date span — is where 26 goes over and 22 does not.
    expect(cost(11, 26)).toBeGreaterThan(CELL);
    expect(cost(11, 22)).toBeLessThanOrEqual(CELL);
    expect(fitMonoFigure("1240h 55min", CELL, ladder)).toBe(22);
  });

  it("lands on the floor rather than off the ladder", () => {
    expect(fitMonoFigure("10240h 55min", CELL, ladder)).toBe(20);
  });

  it("answers the caller's first choice while the container is unmeasured", () => {
    for (const w of [0, -1, Number.NaN]) expect(fitMonoFigure("15.3 t", w, ladder)).toBe(26);
  });

  it("asks the question at the athlete's own text size", () => {
    // The same figure that fits at 1x need not fit at 1.4x, and a layout that
    // asks only about 1x is a layout that breaks for the people who most need
    // it not to.
    expect(fitMonoFigure("6h 52min", CELL, ladder)).toBe(26);
    expect(fitMonoFigure("6h 52min", CELL, ladder, 1.4)).toBe(22);
  });

  it("keeps the PLAIN figure inside the cell at the largest scale it allows", () => {
    // The other three cells do not step — they are fixed at fs.headline — so the
    // grid only holds if that rung clears the cell at the multiplier the text
    // is capped to. This is the assertion the four-column row never had.
    expect(cost("6h 52min".length, 20) * 1.4).toBeLessThanOrEqual(CELL);
    expect(cost("1240h 55min".length, 20) * 1.15).toBeLessThanOrEqual(CELL);
  });

  it("is monotonic in width — more room never yields a smaller figure", () => {
    let last = 0;
    for (let w = 40; w <= 400; w += 4) {
      const got = fitMonoFigure("6h 52min", w, ladder);
      expect(got).toBeGreaterThanOrEqual(last);
      last = got;
    }
  });
});

/**
 * THE RETIRED FACES STAY RETIRED — and this guard is about more than tidiness.
 *
 * Archivo and JetBrains Mono were replaced by Söhne and Söhne Mono, and the
 * binaries went with them. What did NOT go was their NAMES: 67 mentions across
 * 30 files of live source, several of them false by then — globals.css opened
 * with "Two faces, and that is the identity — Archivo and JetBrains Mono",
 * `fonts.mono` was documented as "JetBrains Mono, in two" while the app loads
 * three Söhne Mono cuts, and the mobile kit described itself as built on
 * "Archivo type".
 *
 * A comment naming the wrong face is not cosmetic. It is the same class of
 * defect `dead-references.test.ts` exists for: the next session reads it,
 * believes it, and builds on it. And it HID a real one — the Wrapped's figure
 * fitter was still sizing type from a table of the old face's advances, and no
 * reader would question that while every comment around it agreed.
 *
 * NOTHING IS EXEMPT ANY MORE EXCEPT THIS FILE. `reference/`, `design/` and
 * `capabilities.ts` were exempt on the CLAUDE.md grounds that they are records
 * rather than instructions — and that was the right default until the records
 * were checked. They were not carrying history; `reference/` and `design/` were
 * carrying 66 mockups that LOADED the retired families from Google Fonts and
 * rendered in them, and fourteen that embedded the binaries outright. That is
 * not a memory of a font, it is a live dependency on one. Every mention is
 * rewritten so the ARGUMENT survives without the dead name, and the mockups now
 * draw the product's real faces from the repo's own bundle.
 *
 * THIS FILE IS THE ONE EXEMPTION, because a guard has to name what it forbids:
 * the patterns below spell the retired faces, so the rule would fail on its own
 * declaration. A loophole exactly one file wide, and it is the file whose whole
 * job is to close the others.
 */
describe("the retired faces", () => {
  const RETIRED = [/\bArchivo\b/i, /\bJetBrains\s*Mono\b/i, /\bJetBrainsMono/i];
  const REPO = join(__dirname, "..", "..", "..");
  const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage"]);

  function sources(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name) || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) sources(p, out);
      // ONE EXEMPTION: this file, which must spell the retired faces in order
      // to forbid them. Everything else is in scope, including the ledger and
      // the mockup archives — see the note above for why they stopped being
      // records the moment they started fetching fonts.
      else if (/\.(ts|tsx|css|json|html|md|mjs|cjs|jsx|js|py)$/.test(e.name) && p !== __filename) out.push(p);
    }
    return out;
  }

  it("HARD — no live source names a face the app does not load", () => {
    const hits: string[] = [];
    for (const dir of ["apps", "packages", "reference", "design"]) {
      for (const file of sources(join(REPO, dir))) {
        readFileSync(file, "utf8").split("\n").forEach((line, i) => {
          if (RETIRED.some((re) => re.test(line))) hits.push(`${file.slice(REPO.length + 1)}:${i + 1}  ${line.trim().slice(0, 96)}`);
        });
      }
    }
    expect(hits, `a retired face is named in live source:\n  ${hits.join("\n  ")}`).toEqual([]);
  });

  it("sees the whole app AND both archives, so it cannot pass on an empty tree", () => {
    expect(sources(join(REPO, "apps")).length).toBeGreaterThan(100);
    expect(sources(join(REPO, "reference")).length).toBeGreaterThan(50);
    expect(sources(join(REPO, "design")).length).toBeGreaterThan(50);
  });

  it("HARD — no archived mockup fetches a font from a public host", () => {
    // The mockups pulled the two retired families off Google Fonts, so opening
    // any of them downloaded a face the product abandoned. They draw the repo's
    // own bundled cuts now, by relative path — which also means they render with
    // no network at all, and cannot silently start showing a different face
    // because somebody's CDN changed.
    const bad: string[] = [];
    for (const dir of ["reference", "design"]) {
      for (const file of sources(join(REPO, dir))) {
        const src = readFileSync(file, "utf8");
        if (/fonts\.googleapis\.com\/css2\?[^"')]*family=(Archivo|JetBrains)/i.test(src)) bad.push(file.slice(REPO.length + 1));
      }
    }
    expect(bad, `still fetching a retired face:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("names the faces that ARE loaded, so this is a swap and not a ban", () => {
    // The point is not that the words are forbidden — it is that the app's own
    // source should describe the app. If a future swap retires Söhne, this list
    // moves in the same change and the guard goes on doing its job.
    expect(Object.values(fonts)).toEqual(["Söhne", "Söhne Mono"]);
  });
});
