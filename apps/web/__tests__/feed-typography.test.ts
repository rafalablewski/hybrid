import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE FEED READS THE APP'S TYPE SYSTEM.
 *
 * The feed drifted off it in three separate ways at once, and each one was
 * invisible to a reviewer reading the file on its own:
 *
 *  1. THE PROSE FACE. Neither client inherits a font by default — web sets no
 *     font-family on <body> (so unstyled text falls to the browser's default
 *     sans) and React Native has no inheritance at all outside a Text tree. So
 *     every screen root declares the face: `fontFamily: "var(--font-display)"`
 *     on web, `F.reg` on a mobile prose Text. The feed declared neither, so its
 *     captions, comments and empty states drew in the PLATFORM UI font while
 *     every other tab drew in Archivo.
 *
 *  2. THE TITLE FACE. Headings read `--font-heading` / `F.black`/`F.bold` —
 *     the Archivo display face. A post's headline is a heading, so it must
 *     draw in the same face as every other heading in the product.
 *
 *  3. THE LADDER. `fs.*` (packages/core/src/scale.ts) is the only source of
 *     sizes. A hand-picked 11.5 on web against fs.micro (11) on mobile is
 *     exactly the sub-pixel drift the shared scale exists to prevent.
 *
 * None of the three shows up in a typecheck, so they are asserted here.
 */

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const web = (f: string) => readFileSync(join(APP_ROOT, "components", f), "utf8");
const mobile = (f: string) => readFileSync(join(REPO_ROOT, "apps", "mobile", "components", f), "utf8");

const WEB_FEED = ["social-feed.tsx", "feed-card.tsx", "feed-live-strip.tsx"] as const;
const MOBILE_FEED = ["feed-view.tsx", "feed-card.tsx", "feed-live-strip.tsx"] as const;

describe("the feed's prose is drawn in the app's face, not the platform's", () => {
  it("the web feed screen declares the face on its root, like every other screen", () => {
    // Nothing above it does: no font-family on <body>, none in the app shell.
    expect(web("social-feed.tsx")).toMatch(/maxWidth: 600, fontFamily: "var\(--font-display\)"/);
  });

  it("every mobile feed Text names a fontFamily (RN inherits nothing)", () => {
    for (const file of MOBILE_FEED) {
      const src = mobile(file);
      // A style block that sets a size but no face draws in the system font.
      const faceless = [...src.matchAll(/style=\{\{[^}]*fontSize:[^}]*\}\}/g)]
        .map((m) => m[0])
        .filter((s) => !s.includes("fontFamily"));
      expect(faceless, `${file} — Text styled with a size but no face`).toEqual([]);
    }
  });
});

describe("the feed's headings read the app's TITLE face", () => {
  it("web: the post headline is set in --font-heading", () => {
    const src = web("feed-card.tsx");
    expect(src).toMatch(/const heading = "var\(--font-heading\)"/);
    // Both moments (the p0 record and the everyday session) are headings.
    const headline = src.slice(src.indexOf("const headlineStyle"), src.indexOf("// \"Why you're seeing this\""));
    expect(headline.match(/fontFamily: heading/g)?.length).toBe(2);
  });

  it("mobile: the post headline is set in the title face", () => {
    const src = mobile("feed-card.tsx");
    const headline = src.slice(src.indexOf("const headlineStyle"), src.indexOf("// \"Why you're seeing this\""));
    expect(headline.match(/fontFamily: F\.(black|bold)/g)?.length).toBe(2);
  });

  it("both clients' section heads read the title face, and stay that way", () => {
    expect(web("feed-live-strip.tsx")).toContain('fontFamily: "var(--font-heading)"');
    expect(mobile("feed-live-strip.tsx")).toContain("fontFamily: F.black");
  });
});

describe("the feed sizes off the shared ladder", () => {
  it("no hand-picked font size on either client", () => {
    for (const [file, src] of [
      ...WEB_FEED.map((f) => [`web/${f}`, web(f)] as const),
      ...MOBILE_FEED.map((f) => [`mobile/${f}`, mobile(f)] as const),
    ]) {
      const literals = [...src.matchAll(/fontSize: [0-9.]+/g)].map((m) => m[0]);
      expect(literals, `${file} — size off the fs.* ladder`).toEqual([]);
    }
  });
});
