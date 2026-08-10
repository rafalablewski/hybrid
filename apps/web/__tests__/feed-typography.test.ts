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
 *  1. THE PROSE FACE. React Native has no font inheritance outside a Text
 *     tree, so every prose Text names the face (`F.reg`). The feed declared
 *     none, so its captions, comments and empty states drew in the PLATFORM UI
 *     font while every other tab drew in Archivo.
 *
 *  2. THE TITLE FACE. Headings read `serifIf(scheme, …)`, which is Archivo
 *     under Aurora and the Shippori Mincho serif under Kyoto Hour. A post's
 *     headline is a heading. Hard-coding the sans left the feed as the one tab
 *     still in sans on the light theme — with its own "Now training" head,
 *     which does swap, sitting directly above it.
 *
 *  3. THE LADDER. `fs.*` (packages/core/src/scale.ts) is the only source of
 *     sizes. A hand-picked size against the shared scale is exactly the
 *     sub-pixel drift the scale exists to prevent.
 *
 * None of the three shows up in a typecheck, so they are asserted here.
 * (This guard covered both clients until the web client was retired — web now
 * ships only the admin panel, so the mobile feed is the whole set.)
 */

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const mobile = (f: string) => readFileSync(join(REPO_ROOT, "apps", "mobile", "components", f), "utf8");

const MOBILE_FEED = ["feed-view.tsx", "feed-card.tsx", "feed-live-strip.tsx"] as const;

describe("the feed's prose is drawn in the app's face, not the platform's", () => {
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
  it("the post headline is set through serifIf", () => {
    const src = mobile("feed-card.tsx");
    const headline = src.slice(src.indexOf("const headlineStyle"), src.indexOf("// \"Why you're seeing this\""));
    // Both moments (the p0 record and the everyday session) are headings.
    expect(headline.match(/fontFamily: serifIf\(scheme, F\.(black|bold)\)/g)?.length).toBe(2);
  });

  it("the section head already swaps, and stays that way", () => {
    expect(mobile("feed-live-strip.tsx")).toContain("fontFamily: serifIf(scheme, F.black)");
  });
});

describe("the feed sizes off the shared ladder", () => {
  it("no hand-picked font size", () => {
    for (const file of MOBILE_FEED) {
      const src = mobile(file);
      const literals = [...src.matchAll(/fontSize: [0-9.]+/g)].map((m) => m[0]);
      expect(literals, `${file} — size off the fs.* ladder`).toEqual([]);
    }
  });
});
