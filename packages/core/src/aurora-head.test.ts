import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fs } from "./scale";
import { heroTitleType } from "./hero";

/**
 * THE SCREEN-HEAD GUARD.
 *
 * There is already a guard for the three HUB heads (hub-masthead.test.ts): it
 * forbids a hand-rolled `fontSize: 34|32` or an `fs.headline` title on Today,
 * Performance and Feed, because those three had drifted to three of everything
 * measurable.
 *
 * The rule was right. Its blast radius was three files.
 *
 * Train is not a hub tab, so nothing watched it, and it shipped its head as
 * `<AHeading style={{ fontSize: 28 }}>` — a size on neither the type ladder nor
 * the hero's title ramp — directly beside two screens resolving to 26. The
 * drift was invisible for the same reason it was possible: no test could see
 * it.
 *
 * So this guard watches EVERY Aurora surface, and it checks the one thing that
 * lets a head leave the system: a `fontSize` passed into `AHeading`.
 *
 * WHY THE SIZE SPECIFICALLY, and not just "use a token". `AHeading` computes
 * its rung through `heroTitleType`, which STEPS A LONG TITLE DOWN so it takes
 * two lines rather than three — the thing a magazine does and the thing
 * `minimumScaleFactor` does natively. A caller that pins the size defeats the
 * step-down, so even the well-behaved `fontSize: fs.display` (five of the
 * eleven sites this guard retired) was not a no-op: it forced 26 onto exactly
 * the long titles the ramp exists to rescue. There is no size a caller can
 * pass that is better than the one the component derives.
 *
 * THE TWO SANCTIONED EXITS, so this reads as a contract and not a ban:
 *  - a head that wants the splash rung asks for it BY NAME (`rank="cover"`),
 *  - a heading below screen level is a different component (`ASection`), whose
 *    `titleStyle` is the documented escape hatch for a rung inside a card.
 */

const ROOT = resolve(__dirname, "../../..");
const MOBILE = resolve(ROOT, "apps/mobile");

/** Every .tsx under apps/mobile — the guard's whole point is that it does not
 *  keep a list of screens to fall behind. */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(p, out);
    else if (entry.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Source with comments stripped — the guard must match CODE, not the prose
 *  that documents what the code stopped doing. Line comments go FIRST: a `//`
 *  comment naming a path like `aurora/*.tsx` contains a `/*`, and stripping
 *  block comments ahead of it opens a phantom block that swallows real code.
 *  (Learned the hard way in hub-masthead.test.ts, which was silently asserting
 *  against a file it could not fully see.) */
const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** Every `<AHeading …>` opening tag in a file, attributes included. */
const headings = (src: string) => src.match(/<AHeading\b[^>]*>/g) ?? [];

describe("the screen-head guard — no head opts out of its rung", () => {
  const files = tsxFiles(MOBILE);

  it("finds the surfaces it claims to watch", () => {
    // A guard that silently walks an empty tree passes forever. It must see the
    // whole app, and it must see the screen this rule came from.
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith("components/aurora/train.tsx"))).toBe(true);
  });

  it("passes no fontSize into AHeading, anywhere", () => {
    const offenders: string[] = [];
    for (const file of files) {
      // The kit's own definition names the prop; it is the one legal mention.
      if (file.endsWith("components/aurora/kit.tsx")) continue;
      for (const tag of headings(code(file))) {
        if (/fontSize/.test(tag)) offenders.push(`${file.slice(ROOT.length + 1)} — ${tag}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("gives no bottom-nav tab root a hero", () => {
    // THE RULE, in the kit's own words twice over: AuroraScreen's `hero` prop
    // ("a root tab has nothing to pop and no title to establish, so a rail
    // there would be chrome for its own sake") and Nutrition at its own tab
    // root ("AT THE TAB ROOT there is no hero, because a tab root has nothing
    // to pop and no origin to name").
    //
    // Stated twice and enforced nowhere, it drifted twice: the since-deleted
    // Messages screen shipped a hero at its root, and Train was moved onto one
    // on the argument that Performance and Feed have one — true, but they wear
    // it as PUSHED screens. A rule that lives only in prose is a rule the next
    // reader finds by reading the exception.
    //
    // The four bottom-nav destinations, by the shape each one legitimately has:
    //  - Today, Profile and Train are tab roots END TO END — no hero at all, so
    //    the plain assertion is the whole truth for them.
    //  - Nutrition is a tab root that also hosts PUSHED sub-views, which do take
    //    a hero. It must therefore GATE the hero on not being at the root, and
    //    that gate is what is asserted instead of its absence.
    for (const file of ["components/aurora/home.tsx", "components/aurora/profile.tsx",
                        "components/aurora/train.tsx"]) {
      expect(code(resolve(MOBILE, file)), file).not.toMatch(/hero=\{/);
    }
    expect(code(resolve(MOBILE, "components/aurora/nutrition.tsx"))).toMatch(/hero=\{root &&/);
  });

  it("keeps Train's head bare — the right rung, and no hero on a tab root", () => {
    // The screen this rule came from, and the shape it settled on after the
    // hero was tried and reverted.
    //
    // THE RUNG is the point and always was: a bare AHeading resolves the same
    // `title` rung the hero does, so Train's title is identical in size to
    // Performance's and Feed's. No style prop at all — the guard above forbids
    // a fontSize, and this pins the head that started it to the bare form.
    //
    // NO HERO, because a ROOT TAB has nothing to pop and no origin to name —
    // the kit says so on AuroraScreen's `hero` prop and again at Nutrition's
    // own tab root. Handing Train to the hero system spent a fixed 132dp on a
    // box it filled only the title of, pushing today's session 34dp down the
    // screen built for one tap. If a later session is tempted again, the
    // argument is in capabilities.ts `screen-head-guard`.
    const src = code(resolve(MOBILE, "components/aurora/train.tsx"));
    expect(headings(src)).toEqual(['<AHeading>']);
    expect(src).not.toMatch(/hero=\{/);
  });

  it("has retired the footnote that pointed at the retired web client", () => {
    // "…lands in History and on the web for the deep dive", under a screen whose
    // web twin was deleted in Aug 2026. Cut, and the strings deleted rather than
    // left dangling for the next session to re-render.
    const i18n = readFileSync(resolve(ROOT, "packages/core/src/i18n.ts"), "utf8");
    expect(i18n).not.toMatch(/finishedNote/);
    expect(i18n).not.toMatch(/train\.intro/);
    // The same promise survived in History's empty state. Both clients of that
    // sentence are gone now, in all three languages.
    expect(i18n).not.toMatch(/appears here and on the web/);
    expect(i18n).not.toMatch(/i w wersji web/);
    expect(i18n).not.toMatch(/es erscheint hier und im Web/);
  });
});

describe("the rung a head resolves to", () => {
  it("is the hero's own title ramp — which is why 28 was wrong", () => {
    // Train typed 28. Performance and Feed resolve to this.
    expect(heroTitleType("Start training", "title").size).toBe(fs.display);
    expect(fs.display).toBe(26);
  });

  it("steps a long title down — the behaviour a pinned fontSize destroyed", () => {
    const short = heroTitleType("Start training", "title");
    const long = heroTitleType("Twoje grupy klientów i programy treningowe", "title");
    expect(long.size).toBeLessThan(short.size);
  });

  it("gives the splash its own named rung instead of a typed 32", () => {
    // welcome.tsx asks for `rank="cover"`; 32 was on neither ladder.
    expect(heroTitleType("Train like a hybrid athlete", "cover").size).toBeGreaterThan(fs.display);
  });
});
