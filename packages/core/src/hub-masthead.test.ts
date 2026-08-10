import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HUB_MASTHEAD, HUB_MASTHEAD_HEIGHT, hubTitleType } from "./hub-masthead";
import { fs, space, tracking } from "./scale";

/**
 * THE HUB HEAD GUARD.
 *
 * Dashboard, Performance and Feed are one screen in three states, and their
 * heads had drifted to three of everything measurable — 34 / 32 / 22 pt titles,
 * -1 / -1 / 0 tracking, a real eyebrow / a space character / no eyebrow at all,
 * 16 / 0 / 12 of gap under the control, and a scroll collapse on exactly one of
 * them. Web drifted again on top of that, shipping 34 where mobile shipped 32
 * and no Feed head whatsoever.
 *
 * A component fixed it. This test is what keeps it fixed: a convention gets
 * re-derived, a contract with a failing test does not.
 */

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** Source with comments stripped — the guard must match CODE, not the prose
 *  that documents what the code stopped doing. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** The surfaces that render a hub head. (The web twins were retired with the
 *  web client — mobile is the product.) */
const HUB_SCREENS = [
  "apps/mobile/components/aurora/home.tsx",
  "apps/mobile/components/aurora/performance.tsx",
  "apps/mobile/components/feed-view.tsx",
];

const HEAD_COMPONENTS = ["apps/mobile/components/aurora/hub-masthead.tsx"];

describe("the hub masthead contract", () => {
  it("is built from named tokens, never hand-typed numbers", () => {
    // The three values the screens used to type by hand.
    expect(HUB_MASTHEAD.title.size).toBe(fs.hero);
    expect(HUB_MASTHEAD.title.tracking).toBe(tracking.display);
    expect(HUB_MASTHEAD.meta.tracking).toBe(tracking.label);
    expect(HUB_MASTHEAD.meta.size).toBe(fs.micro);
    // Every gap comes off the space scale.
    for (const gap of Object.values(HUB_MASTHEAD.gap)) {
      expect(Object.values(space)).toContain(gap);
    }
  });

  it("has one height, and it is the sum of its parts", () => {
    expect(HUB_MASTHEAD_HEIGHT).toBe(HUB_MASTHEAD.meta.height + HUB_MASTHEAD.gap.meta + HUB_MASTHEAD.title.lineHeight);
    expect(HUB_MASTHEAD_HEIGHT).toBe(55);
  });

  it("gives every shipped title, in every locale, the same one-line rung", () => {
    // The actual strings, EN / PL / DE. None reaches the step-down, which is
    // the point: the hub's three heads are identical at rest in every language.
    const titles = ["Today", "Dziś", "Heute", "Performance", "Wydajność", "Feed", "Kanał", "Yesterday", "Wednesday", "Mittwoch"];
    for (const title of titles) {
      const type = hubTitleType(title);
      expect(type.size, title).toBe(fs.hero);
      expect(type.lineHeight, title).toBe(36);
      expect(type.tracking, title).toBe(tracking.display);
    }
  });

  it("steps a genuinely long title down rather than running it to three lines", () => {
    const long = hubTitleType("A title well past twenty-eight characters");
    expect(long.size).toBeLessThan(fs.hero);
    expect(long.maxLines).toBe(2);
  });

  it("honours the platform text-size multiplier without changing the layout decision", () => {
    // Bigger type at 200%, but the step-down is still decided on the unscaled
    // string — a large-text user gets a bigger head, not a different one.
    expect(hubTitleType("Performance", 2).size).toBe(fs.hero * 2);
  });
});

describe("the hub head guard — no screen may draw its own", () => {
  it("renders the shared component on all six surfaces", () => {
    for (const file of HUB_SCREENS) {
      expect(code(file), file).toContain("<HubMasthead");
      expect(code(file), file).toMatch(/import \{ HubMasthead \} from/);
    }
  });

  it("takes data and not style — the escape hatch that let the three diverge", () => {
    for (const file of HEAD_COMPONENTS) {
      const src = code(file);
      expect(src, file).not.toMatch(/^\s*style\??:/m);
      expect(src, file).not.toMatch(/className\??:\s/);
    }
  });

  it("leaves no hand-rolled title rung behind", () => {
    // The exact literals the three heads shipped, and the `headline` rung Feed
    // borrowed from the section-heading ladder.
    for (const file of HUB_SCREENS) {
      const src = code(file);
      expect(src, file).not.toMatch(/fontSize:\s*(34|32)\b/);
      expect(src, file).not.toMatch(/fontSize:\s*fs\.headline\b/);
      expect(src, file).not.toMatch(/letterSpacing:\s*-1\b/);
    }
  });

  it("reserves the meta row properly instead of with a space character", () => {
    // `season || " "` and `mastCaption || " "` — invisible, 20 pt tall, and on
    // both clients. A reserved height is a height, not a glyph.
    for (const file of HUB_SCREENS) {
      expect(code(file), file).not.toMatch(/\|\|\s*"[\s ]"/);
    }
  });

  it("has retired the subtitle that only restated its own title", () => {
    // "What your friends are training." under a title that says Feed. Cut on
    // both clients, and the string deleted rather than left dangling.
    // The KEY, not the letters: `feedSubjectKey` (core/feed-actions.ts) is a
    // different word that happens to start the same way, and the feed screens
    // read it to address a post.
    for (const file of [...HUB_SCREENS, "packages/core/src/i18n-web/home.ts"]) {
      expect(read(file), file).not.toMatch(/feedSub(?!jectKey)/);
    }
  });

  it("lets the head own the gap below it", () => {
    // The subtle one. The head emits HUB_MASTHEAD.gap.below, so the block that
    // follows it must contribute NO top margin — RN does not collapse margins,
    // so a first block that kept its own would sit 16 lower than designed.
    expect(code("apps/mobile/components/aurora/home.tsx")).toContain('<GroupMark label={t("w.home.group.train")} mt={0} />');
    // The feed's first block spaces DOWNWARD, not upward.
    const inbox = code("apps/mobile/components/pr-attestation.tsx").split("Co-sign requests")[0]!.slice(-400);
    expect(inbox).toContain("marginBottom: 16");
    expect(inbox).not.toContain("marginTop: 16");
  });
});
