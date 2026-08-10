import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STREAK_MARK, STREAK_DESTINATION, STREAK_ARIA_KEY, STREAK_SUFFIX_KEY } from "./streak-mark";
import { fs, space, tracking } from "./scale";
import { baselineString, allTranslationKeys } from "./i18n";

/**
 * THE STREAK MARK GUARD.
 *
 * The day-streak was drawn in three places and no two agreed: an uppercase
 * terracotta hairline under the wordmark, a sentence-case flame spliced into
 * the done sheet's sub line, and a bare CHARTREUSE "17d" under the profile's
 * heat-map — which also swapped in a longest-WEEK number under a label reading
 * "streak" on web and "best" on mobile. Only one of the three did anything when
 * you touched it, and even that one went somewhere different (a sheet) from
 * what the number is about.
 *
 * One component fixed it. This keeps it fixed, and the part that matters most
 * is the destination: the mark GOES TO HISTORY from every surface, and no
 * caller may say otherwise.
 */

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Every surface that shows the day-streak. (The web twins were retired with
 *  the web client — mobile is the product.) */
const STREAK_SURFACES = [
  // the app header's lockup (Today + Nutrition wear it)
  "apps/mobile/components/aurora/app-header.tsx",
  // the done-today sheet
  "apps/mobile/components/aurora/home.tsx",
  // under the profile's activity heat-map
  "apps/mobile/components/aurora/profile.tsx",
];

const MARK_COMPONENTS = ["apps/mobile/components/aurora/streak-mark.tsx"];

describe("the streak mark contract", () => {
  it("is two densities of one mark, both off the scale", () => {
    expect(STREAK_MARK.inline.size).toBe(fs.micro);
    expect(STREAK_MARK.hairline.tracking).toBe(tracking.caps);
    expect(STREAK_MARK.inline.tracking).toBe(tracking.normal);
    for (const rung of Object.values(STREAK_MARK)) expect(rung.gap).toBe(space.xxs);
  });

  it("keeps the hairline rung small enough to ride inside the header row", () => {
    // It sits under a 19 pt wordmark inside a 44 pt row — see APP_HEADER. Below
    // fs.nano on purpose; the guard states it so a future "round it up to 10"
    // has to be a decision.
    expect(STREAK_MARK.hairline.size).toBeLessThan(fs.nano);
  });

  it("shouts only where it stands alone", () => {
    // Uppercase + tracked as a MARK under the wordmark; sentence-case inside a
    // running line of mono copy, where caps would shout at the words beside it.
    expect(STREAK_MARK.hairline.caps).toBe(true);
    expect(STREAK_MARK.inline.caps).toBe(false);
  });

  it("goes to the history, and says so to a screen reader", () => {
    expect(STREAK_DESTINATION).toBe("history");
    const aria = baselineString("en", STREAK_ARIA_KEY);
    expect(aria, STREAK_ARIA_KEY).toBeTruthy();
    // The count is substituted in, and the label names the destination rather
    // than leaving "17-day streak" as the whole accessible name of a link.
    expect(aria).toContain("{n}");
    expect(aria!.toLowerCase()).toContain("history");
  });

  it("has ONE key for '-day streak' — the profile's duplicate is gone", () => {
    // Same English, Polish and German behind two keys; it only escaped the
    // copy-parity guard because both clients happened to use both.
    expect(baselineString("en", STREAK_SUFFIX_KEY)).toBe("-day streak");
    expect(allTranslationKeys()).not.toContain("w.account.profile.day-streak-suffix");
    // …and the web-only "-week streak", which labelled the LONGEST week run as
    // if it were a current one. Both clients say "-week best" now.
    expect(allTranslationKeys()).not.toContain("w.account.profile.week-streak-suffix");
  });
});

describe("the streak mark guard — no screen may draw its own", () => {
  it("renders the shared component on every surface that shows a streak", () => {
    for (const file of STREAK_SURFACES) {
      expect(code(file), file).toContain("<StreakMark");
      expect(code(file), file).toMatch(/import \{ StreakMark \} from/);
    }
  });

  it("leaves no hand-rolled flame-and-count behind", () => {
    // The three copies each paired an AuroraIcon "flame" with a count. Any
    // surface that still does is a fourth costume for the same fact.
    for (const file of STREAK_SURFACES) {
      expect(code(file), file).not.toMatch(/name="flame"/);
    }
  });

  it("owns its destination — a caller may close a sheet, not choose a screen", () => {
    for (const file of MARK_COMPONENTS) {
      const src = code(file);
      expect(src, file).toContain("STREAK_DESTINATION");
      // `onDismiss` is the whole of a caller's say in the tap. An `onPress` /
      // `onStreak` escape hatch would put the destination back in the screens.
      expect(src, file).toMatch(/onDismiss\?:/);
      expect(src, file).not.toMatch(/on(Press|Streak|Open)\?:/);
    }
  });

  it("sources its own count, so no two surfaces can disagree", () => {
    for (const file of MARK_COMPONENTS) {
      // The bare call is the STRICT streak — a component passing options here
      // would be loosening the run rule for one surface only.
      expect(code(file), file).toMatch(/streak\(sessions\)/);
    }
  });

  it("points the profile's streak TILE at the same screen as the mark", () => {
    // The tile is the last place the streak appears, and it was the last inert
    // one — a figure in a grid of figures. It carries STREAK_DESTINATION rather
    // than a "history" of its own, so the tile and the mark can never point at
    // two screens, and it reuses the mark's aria key so both announce the same
    // sentence. It also keeps the long-press: a tap opens, a hold rearranges.
    const src = code("apps/mobile/components/aurora/profile.tsx");
    expect(src).toContain("to: STREAK_DESTINATION");
    expect(src).toContain("aria: t(STREAK_ARIA_KEY)");
    // The destination is on the TILE, generic, not an `hkey === "streak"`
    // special case buried in the grid.
    expect(src).toMatch(/onOpen[:=]/);
    expect(src).not.toMatch(/hkey === "streak"/);
  });

  it("never lets the grid's edit mode double as a link", () => {
    // In edit mode the press belongs to the rearrange — onPress is gated on it.
    expect(code("apps/mobile/components/aurora/profile.tsx")).toContain("tile.to && !editMode");
  });

  it("takes data and not style", () => {
    for (const file of MARK_COMPONENTS) {
      const src = code(file);
      expect(src, file).not.toMatch(/^\s*style\??:/m);
      expect(src, file).not.toMatch(/className\??:\s/);
    }
  });
});
