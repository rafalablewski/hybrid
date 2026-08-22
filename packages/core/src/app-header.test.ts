import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_HEADER, APP_HEADER_HEIGHT, APP_HEADER_LOCKUP_HEIGHT, avatarInitials, unreadLabel } from "./app-header";
import { fs, tracking } from "./scale";

/**
 * THE APP HEADER GUARD.
 *
 * The lockup row was written twice — once in Today on each client — under a
 * comment on each side saying it mirrored the other. It did not: 42dp tiles
 * against 44px (and 42 is under the platform's minimum tap target), and a
 * nameless athlete got "·" on the phone and "A" in the browser. Two files, one
 * row, no contract.
 *
 * A component fixed it, and this is what keeps it fixed — including the part
 * that made the fix worth doing: the header is a TAB-ROOT thing, and there are
 * two tab roots that wear it (Today and Nutrition), on both clients.
 */

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** Source with comments stripped — the guard must match CODE, not the prose
 *  that documents what the code stopped doing. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Every surface that wears the header: the two tab roots. (The web twins
 *  were retired with the web client — mobile is the product.) */
const TAB_ROOTS = [
  "apps/mobile/components/aurora/home.tsx",
  "apps/mobile/components/aurora/nutrition.tsx",
];

const HEADER_COMPONENTS = ["apps/mobile/components/aurora/app-header.tsx"];

describe("the app header contract", () => {
  it("is built from named tokens, never hand-typed numbers", () => {
    expect(APP_HEADER.wordmark.tracking).toBe(tracking(19));
    expect(APP_HEADER.badge.text).toBe(fs.nano);
  });

  it("gives both flanks a tile that clears the minimum tap target", () => {
    // 44, not the 42 the phone shipped. The row's height is the tile's.
    expect(APP_HEADER.tile.size).toBeGreaterThanOrEqual(44);
    expect(APP_HEADER_HEIGHT).toBe(APP_HEADER.tile.size);
  });

  it("fits the whole lockup inside the row the tiles set", () => {
    // Wordmark + the streak's top gap + the mark's line must not grow the row —
    // that is why the streak became a second LINE rather than a pill in the
    // flank, and why the mark's hairline rung sits below the type scale's
    // smallest.
    expect(APP_HEADER_LOCKUP_HEIGHT).toBeLessThanOrEqual(APP_HEADER_HEIGHT);
  });

  it("has ONE placeholder for a nameless athlete, and it is not someone's initial", () => {
    expect(avatarInitials("Rafal Ablewski")).toBe("RA");
    expect(avatarInitials("rafal")).toBe("R");
    expect(avatarInitials("  Ada  Byron  King ")).toBe("AB");
    // Web shipped "A", which reads as a real initial belonging to someone else.
    expect(avatarInitials("")).toBe("·");
    expect(avatarInitials(null)).toBe("·");
    expect(avatarInitials(undefined)).toBe("·");
  });

  it("caps the unread badge so two digits can never widen the tile", () => {
    expect(unreadLabel(1)).toBe("1");
    expect(unreadLabel(9)).toBe("9");
    expect(unreadLabel(10)).toBe("9+");
    expect(unreadLabel(348)).toBe("9+");
  });
});

describe("the app header guard — no screen may draw its own", () => {
  it("renders the shared component on every tab root", () => {
    for (const file of TAB_ROOTS) {
      expect(code(file), file).toContain("<AppHeader");
      expect(code(file), file).toMatch(/import \{ AppHeader \} from/);
    }
  });

  it("takes data and not style — the escape hatch that let the two diverge", () => {
    for (const file of HEADER_COMPONENTS) {
      const src = code(file);
      expect(src, file).not.toMatch(/^\s*style\??:/m);
      expect(src, file).not.toMatch(/className\??:\s/);
    }
  });

  it("leaves no hand-rolled lockup behind", () => {
    // The wordmark is the component's now. A screen that still spells it out
    // is a second copy of the row by definition.
    for (const file of TAB_ROOTS) {
      expect(code(file), file).not.toContain("HYBRID<");
    }
  });

  it("sources its own data rather than being handed a figure to draw", () => {
    // The point of the extraction: a second tab root wears the identical head
    // by rendering the component, so there is no `streak`/`initials`/`unread`
    // prop to thread — and therefore no way for two tabs to disagree. The
    // streak arrives the same way, one level down: the shared mark sources it.
    for (const file of HEADER_COMPONENTS) {
      const src = code(file);
      expect(src, file).toContain("<StreakMark");
      expect(src, file).toContain("avatarInitials");
      expect(src, file).toMatch(/unread/);
    }
  });

  it("keeps the drawer with the header, not with the hub", () => {
    // The side menu opens from the avatar, so it belongs to the row that draws
    // the avatar. Left in Today, the second tab root would have had a header
    // whose avatar opened nothing.
    for (const file of HEADER_COMPONENTS) {
      expect(code(file), file).toContain("<AuroraSideMenu");
    }
    expect(code("apps/mobile/components/aurora/home.tsx")).not.toContain("<AuroraSideMenu");
  });

  it("lets the hub rows off the hub go somewhere real", () => {
    // `onHubTab` is optional now: on Nutrition there is no hub control on
    // screen to switch, so the three rows route to the standalone screens
    // instead of silently doing nothing.
    const src = code("apps/mobile/components/aurora/side-menu.tsx");
    expect(src).toMatch(/onHubTab\?:/);
    expect(src).toMatch(/activeHub\?:/);
    expect(src).toContain('"dashboard" ? "today"');
  });
});
