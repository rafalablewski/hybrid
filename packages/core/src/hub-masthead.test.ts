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

/**
 * Source with comments stripped — the guard must match CODE, not the prose that
 * documents what the code stopped doing.
 *
 * LINE comments go FIRST, and the order is not cosmetic: a `//` comment that
 * mentions a path like `aurora/*.tsx` contains a `/*`, and stripping block
 * comments ahead of it opens a phantom block that runs to the next `*​/` and
 * swallows whatever real code lies between. That is not hypothetical — it was
 * silently blanking the feed screen's root element, so every assertion below
 * was passing on a file it could not fully see.
 */
const code = (p: string) =>
  read(p)
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

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
    expect(HUB_MASTHEAD.title.tracking).toBe(tracking(fs.hero));
    expect(HUB_MASTHEAD.meta.tracking).toBe(tracking(fs.micro, "label"));
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
      expect(type.tracking, title).toBe(tracking(type.size));
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
  it("renders the shared component on every hub surface", () => {
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

  it("never opens a tab on a marker — the run that opens a hub scroll is unnamed", () => {
    // THE RULE THE TRAIN REMOVAL LEFT BEHIND, now that Performance marks its
    // runs too: a marker names a TURN in the scroll, and the opening run turns
    // from nothing. It sits directly under a masthead that already names the
    // screen, on a tab the hub pills already label. Today lost "Train" to this;
    // Performance was built without a "State" for the same reason (it would
    // also have echoed the card below it word for word).
    for (const file of HUB_SCREENS) {
      const src = code(file);
      const head = src.indexOf("<HubMasthead");
      const mark = src.indexOf("<GroupMark", head);
      if (head < 0 || mark < 0) continue; // the Feed marks nothing at all
      // Something has to RENDER between the head and the first marker. The
      // match includes `<HubMasthead` itself, so one hit means the marker is
      // the very next thing on the screen — which is the defect.
      const rendered = src.slice(head, mark).match(/<[A-Z][A-Za-z]*/g) ?? [];
      expect(rendered.length, file).toBeGreaterThan(1);
    }
  });

  it("opens its first cluster with no marker at all", () => {
    // "Train", in the display face, directly under a masthead that says Today,
    // on a tab the hub pills already label Dashboard — a heading announcing
    // what the screen was visibly about, and the reason this hub's three views
    // didn't open alike (Performance and Feed go straight into their content).
    // A cluster marker earns its place by naming a TURN; the first cluster
    // turns from nothing. Deleted, key and all, rather than left dangling.
    // The `(?!ing)` is not decoration: `w.home.group.training` was one of the
    // three Performance-cluster labels, and this guard has to be able to tell
    // a re-added Train from a word that merely starts the same way.
    for (const file of [...HUB_SCREENS, "packages/core/src/i18n-web/home.ts"]) {
      expect(read(file), file).not.toMatch(/w\.home\.group\.train(?!ing)/);
    }
  });

  it("keeps the group labels down to the markers that actually render", () => {
    // These three (State / Training / Season) once existed as strings for
    // GroupMarks that were NOT in the code — Performance was still the numbered
    // card scroll, and the web twin died before it grew them either. Training
    // and Season are now real markers on that page and are back; `state` is
    // not, and must never be: that run opens the screen (see the guard above).
    // Every surviving w.home.group.* key must be rendered by something, so a
    // label can no longer outlive — or precede — the marker it was written for.
    const i18n = read("packages/core/src/i18n-web/home.ts");
    const keys = new Set([...i18n.matchAll(/"(w\.home\.group\.[a-zA-Z]+)"/g)].map((m) => m[1]!));
    const rendered = [
      ...HUB_SCREENS,
      "apps/mobile/components/aurora/exercise-widget.tsx",
      "apps/mobile/components/aurora/other-sports.tsx",
    ]
      .map((f) => read(f))
      .join("\n");
    for (const key of keys) expect(rendered, key).toContain(key);
  });

  it("lets the head own the gap below it", () => {
    // The subtle one. The head emits HUB_MASTHEAD.gap.below, so the block that
    // follows it must contribute NO top margin — RN does not collapse margins,
    // so a first block that kept its own would sit 16 lower than designed.
    // On the dashboard that first row is the plan hero's five-branch ternary,
    // and EVERY branch opens the row, so not one of them may carry a top
    // margin. The retired GroupMark used to absorb this with mt={0}; the
    // marker went, the invariant it was holding did not.
    const home = code("apps/mobile/components/aurora/home.tsx");
    // Branches one to three — the fetch error, the plan week rail, the logbook
    // rail — all sit between the head and the logbook rail's own element.
    const firstRow = home.slice(home.indexOf("<HubMasthead"), home.indexOf("<AuroraLogbookRail"));
    expect(firstRow).not.toContain("marginTop");
    // Branch four (the first-run chooser column) and branch five (the plan
    // hero's card) open the same row further down the chain.
    expect(home).toMatch(/firstRun \? \(\s*<View style=\{\{ gap: space\.sm \}\}>/);
    expect(home).toMatch(/\) : \(\s*<ACard>/);
    // The feed's first block spaces DOWNWARD, not upward.
    const inbox = code("apps/mobile/components/pr-attestation.tsx").split("Co-sign requests")[0]!.slice(-400);
    expect(inbox).toContain("marginBottom: 16");
    expect(inbox).not.toContain("marginTop: 16");
  });
});
