import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * THE SCREEN GUTTER, ENFORCED (mobile).
 *
 * The side gutter is ONE value — the kit's `GUTTER` (12dp), matching web's
 * `--page-pad-x`. Most screens never touch it: AuroraScreen and the hero
 * scaffold apply it for you. The exceptions are the screens that own their own
 * scroller (Today's hub, History, the logger, the finish summary, the feed) —
 * and those are exactly where it drifted.
 *
 * WHAT ACTUALLY HAPPENED, twice, in opposite directions:
 *
 *   The 16 -> 12 sweep changed the gutter everywhere the SCAFFOLD owned it, and
 *   swept the rails by grepping for the `-16`/`16` pair. So it moved every rail
 *   on Today to bleed 12 while Today's own ScrollView stayed at 16 — a 4dp
 *   sliver of gutter beside every cut card, and the hub chrome stepping 4dp
 *   sideways between Dashboard and Performance. Four more surfaces the same way.
 *
 *   Then the reverse: week-verdict's detail compartment bleeds the CARD's
 *   padding, not the screen's. Written `-16`, it was indistinguishable from a
 *   screen rail, so the sweep "fixed" it to 12 and inset the compartment 4dp
 *   from the card it lives in. (Web, where the same value is spelled
 *   `--page-pad-x` vs a literal, was never touched.)
 *
 * Both are the same defect: A BLEED THAT DOES NOT NAME ITS CONTAINER. `-12` and
 * `-16` are text; `-GUTTER` and `-CARD_PAD` are claims that can be checked. So
 * the rule is not "the gutter is 12" — a number can be swept to the wrong
 * value in either direction. The rule is that the container must be NAMED, and
 * then the sweep can see what it is about to change.
 */

const MOBILE = join(__dirname, "..", "..", "mobile");

/** The band in which a negative horizontal margin means "I am bleeding out of
 *  my container's padding" — a screen gutter (12/16) or a card's (20/24), with
 *  the ceiling at web's desktop 32, the widest padding this product has.
 *
 *  Below the floor (-4, -5, -8) is a different idiom entirely: optical nudges,
 *  grid gutters and press targets, which name nothing because they bleed
 *  nothing. Above the ceiling is not a bleed either — `marginLeft: -230`
 *  centres a 460dp glow disc on its own midpoint. Neither has a container to
 *  name, so neither is this rule's business. */
const BLEED_MIN = 12;
const BLEED_MAX = 32;

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

/** Source lines, minus comments — the rules below are necessarily quoted in the
 *  prose that documents them (this file included, and kit.tsx's GUTTER doc). */
function codeLines(file: string): { n: number; line: string }[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line, i) => ({ n: i + 1, line }))
    .filter(({ line }) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    });
}

const rel = (f: string) => f.slice(MOBILE.length + 1);

describe("the screen gutter is a token, never a number", () => {
  it("finds mobile source to check (guards against a silently empty sweep)", () => {
    // The accent-channel guard's own failure mode is in the backlog: regexes
    // that match less than they should read exactly like a clean codebase.
    expect(FILES.length).toBeGreaterThan(80);
  });

  it("every container bleed names what it bleeds", () => {
    const hits: string[] = [];
    for (const f of FILES) {
      for (const { n, line } of codeLines(f)) {
        for (const m of line.matchAll(/margin(?:Horizontal|Left|Right):\s*-(\d+)/g)) {
          const px = Number(m[1]);
          if (px >= BLEED_MIN && px <= BLEED_MAX) hits.push(`${rel(f)}:${n}  ${m[0]}`);
        }
      }
    }
    expect(
      hits,
      `A bleed of ${BLEED_MIN}dp or more is bleeding SOME container's padding — say which:\n` +
        `  -GUTTER     the screen (kit.tsx), for a rail sitting directly on a screen\n` +
        `  -CARD_PAD   the card it lives in — declare the card's padding as a const\n` +
        `  -SHEET_PAD  a sheet's own padding\n${hits.join("\n")}`,
    ).toEqual([]);
  });

  it("no scroller sets its side padding to a bare gutter-width number", () => {
    // The re-pad half of a bleed pair, and the gutter of any screen that owns
    // its scroller. 12 and 16 are the two values that have meant "the screen
    // gutter" in this codebase, so a literal one is always ambiguous.
    const hits: string[] = [];
    for (const f of FILES) {
      for (const { n, line } of codeLines(f)) {
        if (!line.includes("contentContainerStyle")) continue;
        for (const m of line.matchAll(/padding(?:Horizontal|Left|Right):\s*(\d+)/g)) {
          if (m[1] === "12" || m[1] === "16") hits.push(`${rel(f)}:${n}  ${m[0]}`);
        }
      }
    }
    expect(hits, `use GUTTER (or the container's named padding):\n${hits.join("\n")}`).toEqual([]);
  });

  it("a scroller that sets the `padding` shorthand overrides the side it silently set", () => {
    // `padding: 16` on a screen's own scroller sets the GUTTER as well as the
    // vertical rhythm — which is how Today, History, the logger and the summary
    // each kept a 16 gutter through a sweep that believed it had moved them.
    // The shorthand is fine; leaving the side it implies unstated is not.
    const hits: string[] = [];
    for (const f of FILES) {
      for (const { n, line } of codeLines(f)) {
        const idx = line.indexOf("contentContainerStyle");
        if (idx < 0) continue;
        const obj = line.slice(idx);
        if (/[^a-zA-Z]padding:\s*\d/.test(obj) && !/paddingHorizontal:/.test(obj)) {
          hits.push(`${rel(f)}:${n}  ${line.trim().slice(0, 110)}`);
        }
      }
    }
    expect(
      hits,
      `add \`paddingHorizontal: GUTTER\` — the shorthand set the side gutter too:\n${hits.join("\n")}`,
    ).toEqual([]);
  });
});

describe("the guard can see the screens that actually drifted", () => {
  // A rule nobody can violate is usually a rule that is scanning the wrong
  // place. These are the five surfaces that own their scroller — if the guard
  // stops finding them, it has stopped guarding anything.
  const OWN_THEIR_SCROLLER = [
    "components/aurora/home.tsx",
    "components/aurora/history.tsx",
    "components/feed-view.tsx",
    "app/workout.tsx",
  ];

  for (const f of OWN_THEIR_SCROLLER) {
    it(`${f} takes its side padding from the GUTTER token`, () => {
      const src = readFileSync(join(MOBILE, f), "utf8");
      expect(src).toMatch(/padding(?:Horizontal|Left|Right):\s*GUTTER/);
    });
  }

  it("GUTTER matches core's hero gutter, which every hero screen uses instead", () => {
    const kit = readFileSync(join(MOBILE, "components", "aurora", "kit.tsx"), "utf8");
    const hero = readFileSync(join(__dirname, "..", "..", "..", "packages", "core", "src", "hero.ts"), "utf8");
    const gutter = kit.match(/export const GUTTER = (\d+)/)?.[1];
    const edge = hero.match(/gutter:\s*\{\s*edge:\s*(\d+)/)?.[1];
    expect(gutter, "kit.tsx must export GUTTER").toBeDefined();
    expect(edge, "core hero.ts must declare gutter.edge").toBeDefined();
    expect(gutter).toBe(edge);
  });

  it("web publishes the same gutter at mobile widths", () => {
    const shell = readFileSync(join(__dirname, "..", "components", "app-shell.tsx"), "utf8");
    const kit = readFileSync(join(MOBILE, "components", "aurora", "kit.tsx"), "utf8");
    const gutter = kit.match(/export const GUTTER = (\d+)/)?.[1];
    const pad = shell.match(/"--page-pad-x":\s*isMobile\s*\?\s*"(\d+)px"/)?.[1];
    expect(pad, "app-shell must publish --page-pad-x").toBeDefined();
    expect(pad).toBe(gutter);
  });
});
