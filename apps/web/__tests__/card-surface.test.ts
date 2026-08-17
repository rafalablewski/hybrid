import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A CARD IS A COMPONENT, NEVER A STYLE OBJECT (mobile).
 *
 * WHAT HAPPENED. Today drew its cards on TWO MATERIALS on an iOS 26 device,
 * and nothing could see it. `ACard` mounts a native SwiftUI Liquid Glass layer
 * behind transparent RN content; three of Today's cards never imported it —
 * the check-in card, the DONE TODAY wrapper and the week verdict each spelled
 * ACard's base style out by hand instead:
 *
 *   borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card,
 *   padding: CARD_PAD, backgroundColor: C.ink2, ...cardShadow()
 *
 * Byte-for-byte the same values, and a literal `View` stays solid ink2 forever,
 * because THE MATERIAL IS NOT A STYLE PROPERTY — it is a native layer the
 * component mounts. So the Recover cluster read check-in (solid) → Heat (glass)
 * one gap apart, and the largest card on the screen sat opaque between two
 * glass ones. A copy of a component is not "the same thing written out"; it is
 * a thing that can never gain what the component gains next.
 *
 * WHY A GUARD RATHER THAN A SWEEP. The three were found by reading the screen
 * beside a bug report about something else. Nothing failed, nothing warned, and
 * `pnpm typecheck` is perfectly happy with a hand-drawn box — which is exactly
 * how three of them accumulated on one screen. This repo already fails a build
 * on this class of drift (`card-foot.test.ts` on a hand-rolled footer rule,
 * `feed-typography.test.ts` on a Text with a size and no face, `screen-gutter`
 * on a bleed that does not name its container); card SURFACES had no such rule.
 *
 * THE SHAPE IT LOOKS FOR is the pair that only ever means "this is a card":
 * a card RADIUS (`RADIUS.card`, or the literal 28 it holds) together with a
 * card FILL (`…ink2` / `…card`) in ONE style object. Padding, border and shadow
 * vary between the copies; those two do not. Objects that pin both a numeric
 * width and height are skipped — a 56×56 box at radius 28 is an avatar, not a
 * card, and a card never fixes its own height.
 *
 * IT IS A RATCHET, NOT A LINE IN THE SAND. There are 15 of these left (25 when
 * the rule was written), on screens this branch had no business rewriting, so
 * they are listed below with their counts. That makes the list do three jobs at
 * once: the cleared surfaces are pinned at zero and can never regress; a NEW
 * hand-roll anywhere fails immediately; and fixing one fails until it is
 * removed from the list, so the number can only ever go down and the remaining
 * work is visible instead of remembered. The same idiom as
 * `expo-alignment.test.ts`'s DELIBERATE map — an exception is allowed to exist,
 * but only in writing.
 *
 * The reverse check has already earned its keep: percent-program and
 * history-views were cleared in the pass after this shipped, and the suite
 * failed until both were struck off, which is exactly the moment a ratchet
 * would otherwise quietly stop ratcheting.
 *
 * TO FIX ONE: `<ACard>` if it is a read surface, `<APressCard>` if it presses
 * (that gap — ACard being a View — is what kept the two chooser cards
 * hand-rolled), `solid` on either if it is a data-dense panel where
 * translucency costs contrast. Then drop its line here.
 */

const MOBILE = join(__dirname, "..", "..", "mobile");

/** `RADIUS.card`, or the 28 it holds written as a number. */
const CARD_RADIUS = /borderRadius:\s*(?:RADIUS\.card|28)\b/;
/** The card fill — `C.ink2`, `palette.ink2`, and `C.card`, which is the same
 *  surface one shade over and is used interchangeably at these call sites. */
const CARD_FILL = /backgroundColor:\s*[A-Za-z_$][\w.]*\.(?:ink2|card)\b/;

/**
 * THE REMAINING HAND-ROLLS, by file. Ratchet only: these numbers go down.
 *
 * Everything here predates the guard. They are NOT approved — each one is a
 * card that cannot take the glass, and the sweep that fixes them is tracked in
 * capabilities.ts under `design-system-unification-sweep`. They are written
 * down so the rule can ship today and still fail on the next new one.
 */
const RATCHET: Record<string, number> = {
  // CLEARED, and left here as a note rather than as lines: percent-program (3)
  // and history-views (3) were the two densest files on this list, then the
  // nutrition surface (nutrition 2 + pantry 1). All are at zero — see the
  // CLEARED block at the bottom of this file, which pins them the same way
  // Today's four are pinned. 25 → 19 → 16.
  "components/aurora/history.tsx": 1,
  // The rails. coach-rail also carries its own inline copy of cardShadow's
  // five values, which is the same defect one layer further down.
  "components/aurora/coach-rail.tsx": 1,
  "components/aurora/logbook-rail.tsx": 1,
  "components/aurora/week-rail.tsx": 1,
  "components/aurora/quick-start.tsx": 1,
  // Profile / settings.
  "components/aurora/profile.tsx": 1,
  "components/aurora/settings.tsx": 1,
  // The analytics + detail screens.
  "components/aurora/progress.tsx": 1,
  // sport-page.tsx is GONE from this list, and that is the ratchet working: the
  // redesign's Bests rail was its one hand-rolled surface — 176-wide bordered
  // cards on a page whose totals row was commented "facts on hairlines, no
  // cards" — and it is hairline rows now. The count went 1 → 0 and the test
  // failed until the win was locked in here, which is the whole point of it.
  "components/aurora/train.tsx": 1,
  "components/aurora/body-map.tsx": 1,
  "components/aurora/exercise-media.tsx": 1,
  "app/statistics.tsx": 1,
  "app/help.tsx": 1,
  // app/(tabs)/messages.tsx is GONE from this list because the screen is gone:
  // the Messages tab was a placeholder announcing that direct messages do not
  // exist, and its one hand-rolled card went with the slot. Deleting the screen
  // is the cheapest way to clear a ratchet entry, and the only one that also
  // gives the athlete back a quarter of the bar.
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".expo" || entry === "ios" || entry === "android") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

const FILES = [join(MOBILE, "components"), join(MOBILE, "app")].flatMap((d) => walk(d));
const rel = (f: string) => f.slice(MOBILE.length + 1).split("\\").join("/");

/** Blank out comments, preserving offsets so line numbers stay true. The rules
 *  are necessarily quoted in the prose that documents them — this file's own
 *  header included, and ACard's. */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
    } else if (src[i] === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      const end = close < 0 ? src.length : close + 2;
      for (let k = i; k < end; k++) out += src[k] === "\n" ? "\n" : " ";
      i = end;
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

/** Every style object literal in a file, brace-matched so a multi-line one is
 *  read whole. A line-based scan would miss exactly the week-verdict shape,
 *  which spelled its box across three lines. */
function styleObjects(src: string): { text: string; at: number }[] {
  const out: { text: string; at: number }[] = [];
  // `style={{…}}`, `style: {…}` (a StyleSheet entry or a spread-in const), and
  // a card HOISTED INTO A CONST, which is the copy one step further along —
  // both files that did it were caught only because their object happened to
  // open on `backgroundColor`. The alternation lists every property a card
  // object plausibly opens with, so the detector does not depend on the order
  // the author happened to type them in.
  const re = /style\s*=\s*\{\s*\{|style:\s*\{|=\s*\{\s*(?:backgroundColor|borderRadius|borderWidth|borderColor|padding)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = src.lastIndexOf("{", m.index + m[0].length - 1);
    if (open < 0) continue;
    let depth = 0;
    let j = open;
    for (; j < src.length && j - open < 4000; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") { depth--; if (depth === 0) { j++; break; } }
    }
    out.push({ text: src.slice(open, j), at: open });
  }
  return out;
}

function handRolled(file: string): string[] {
  const src = stripComments(readFileSync(file, "utf8"));
  const hits: string[] = [];
  for (const o of styleObjects(src)) {
    // A box that pins BOTH dimensions is an avatar / tile / glyph plate, and
    // 28 is then just half of 56. A card never fixes its own height.
    const pinned = /width:\s*\d/.test(o.text) && /height:\s*\d/.test(o.text);
    if (pinned) continue;
    if (CARD_RADIUS.test(o.text) && CARD_FILL.test(o.text)) {
      hits.push(`${rel(file)}:${src.slice(0, o.at).split("\n").length}`);
    }
  }
  return hits;
}

describe("a card comes from the kit", () => {
  it("finds mobile source to check (guards against a silently empty sweep)", () => {
    // A regex that matches less than it should reads exactly like a clean
    // codebase — the failure mode the accent-channel guard already has logged.
    expect(FILES.length).toBeGreaterThan(80);
  });

  it("the detector still recognises a hand-rolled card when it sees one", () => {
    // Fed ACard's own base style, the rule must fire. If this passes while the
    // sweep below finds nothing, the rule has stopped being a rule.
    const sample = `style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, padding: CARD_PAD, backgroundColor: C.ink2 }}`;
    const [obj, ...rest] = styleObjects(sample);
    expect(rest).toEqual([]);
    expect(obj).toBeDefined();
    expect(CARD_RADIUS.test(obj!.text) && CARD_FILL.test(obj!.text)).toBe(true);
  });

  it("no NEW hand-rolled card surfaces, and the listed ones have not multiplied", () => {
    const found: Record<string, string[]> = {};
    for (const f of FILES) {
      const hits = handRolled(f);
      if (hits.length) found[rel(f)] = hits;
    }

    const problems: string[] = [];
    for (const [file, hits] of Object.entries(found)) {
      const allowed = RATCHET[file] ?? 0;
      if (hits.length > allowed) {
        problems.push(
          allowed === 0
            ? `NEW hand-rolled card in ${file} — use <ACard> (or <APressCard> if it presses):\n    ${hits.join("\n    ")}`
            : `${file} grew from ${allowed} to ${hits.length} hand-rolled cards:\n    ${hits.join("\n    ")}`,
        );
      }
    }
    // The other direction: a file that got fixed must leave the list, or the
    // ratchet stops ratcheting and quietly re-permits what was just removed.
    for (const [file, allowed] of Object.entries(RATCHET)) {
      const n = found[file]?.length ?? 0;
      if (n < allowed) {
        problems.push(
          `${file} is down to ${n} (listed as ${allowed}) — good. Now lower it in RATCHET so the win is locked in.`,
        );
      }
    }

    expect(problems, `\n${problems.join("\n\n")}\n`).toEqual([]);
  });
});

describe("the surfaces this rule was written for stay on the kit", () => {
  /**
   * CLEARED — every file that has been taken to zero, pinned so it stays there.
   *
   * The first four are where the material split was found (Today). The rest
   * came off the ratchet in the passes after this rule shipped, densest first.
   * `nutrition.tsx` is the one that best makes the case: it already rendered
   * EIGHT real ACards beside its two hand-rolls, so on iOS 26 the material
   * split was inside a single screen. A file only joins this list by
   * reaching zero, and
   * once it is here the ratchet's `?? 0` fallback would catch a regression
   * anyway — the point of naming them is that a REVIEWER can see what is done,
   * and that the second assertion below can check they still draw cards at all.
   */
  const CLEARED = [
    "components/aurora/home.tsx",
    "components/aurora/week-verdict.tsx",
    "components/aurora/heat-row.tsx",
    "components/aurora/protocol.tsx",
    "components/percent-program.tsx",
    "components/aurora/history-views.tsx",
    "components/aurora/nutrition.tsx",
    "components/aurora/pantry.tsx",
    // The recommended-plan card — the payoff of the whole wizard, and the one
    // card a brand-new athlete sees first. It was drawn by hand, so on iOS 26
    // the app introduced itself with the only opaque card in the product.
    "components/aurora/onboarding.tsx",
  ];

  for (const f of CLEARED) {
    it(`${f} draws no card by hand`, () => {
      expect(handRolled(join(MOBILE, f))).toEqual([]);
    });
  }

  it("every one of them renders a kit card", () => {
    // Zero hand-rolls is also what an empty file looks like. These must be
    // drawing cards, from the kit.
    for (const f of CLEARED) {
      const src = readFileSync(join(MOBILE, f), "utf8");
      expect(src, `${f} should render ACard or APressCard`).toMatch(/<ACard|<APressCard/);
    }
  });

  it("APressCard exists, and is a press target rather than a View", () => {
    // The gap that made hand-rolling look reasonable: ACard is a View, so a
    // card that had to be tappable had nowhere to come from. If this primitive
    // goes away, the two chooser cards will be hand-rolled again within a week.
    const kit = readFileSync(join(MOBILE, "components", "aurora", "kit.tsx"), "utf8");
    expect(kit).toMatch(/export function APressCard/);
    const body = kit.slice(kit.indexOf("export function APressCard"));
    expect(body.slice(0, 2000)).toMatch(/<PressScale/);
    // It must offer the same material as ACard, or it is a third card family.
    expect(body.slice(0, 2000)).toMatch(/GlassSurface/);
  });
});
