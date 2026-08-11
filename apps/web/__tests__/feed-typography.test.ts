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

/**
 * THE FEED'S GRAMMAR — one qualifier, one accent, a footer rather than a table.
 *
 * These are the rules the row kept breaking quietly, because each break looked
 * reasonable in the file it lived in. A record line had grown SIX type
 * treatments on one baseline; the tier chip wore the accent that the delta two
 * columns away was also wearing; the aggregates were a three-column table
 * arguing with the content above them; and two of the four actions wore words
 * while the other two stood bare.
 *
 * Every decision now lives in packages/core/src/feed-card.ts. What is asserted
 * here is that the CLIENTS keep reading it rather than re-growing their own.
 */
describe("the feed's grammar stays in core", () => {
  const card = mobile("feed-card.tsx");

  it("gives a figure ONE qualifier slot, not a delta beside a sentence", () => {
    expect(card).toContain("cardQualifier");
    // "first time trained" is prose doing a badge's job. It belongs to the
    // opened post, where a line has room for a sentence — never to the row.
    expect(card).not.toContain('t("feed.firstEver")');
  });

  it("never draws the tier chip in the accent — provenance is not a score", () => {
    // ONE accent per row, and it marks the improvement. The chip is ash, in the
    // footer, because provenance qualifies the POST rather than one lift in it.
    expect(card).not.toMatch(/Chip tone=\{colors\.lime\}/);
  });

  it("draws the aggregates as a footer line, not the two-row table", () => {
    expect(card).toContain("feedStatParts");
    // FEED_STAT_LABEL_KEY is the table's second row — the descriptive label
    // under each figure. The opened post still uses it; the row must not.
    expect(card).not.toContain("FEED_STAT_LABEL_KEY");
  });

  it("formats every figure in the APP's language, never the device's", () => {
    // THE DEFECT: toLocaleString() with no locale groups against the handset,
    // so 5360 kg reads "5.360" under an English interface on a German phone.
    // Core keeps the parameter optional for pure callers, so the guard has to
    // live at the CALL SITES — both of them.
    const callers = [
      ["mobile/feed-card.tsx", card],
      ["mobile/feed-workout.tsx", mobile("feed-workout.tsx")],
    ] as const;
    let seen = 0;
    for (const [name, src] of callers) {
      for (const call of src.match(/feedStat(?:Text|Parts)\([^)]*\)/g) ?? []) {
        seen += 1;
        expect(call, `${name} — ${call} must pass the active language`).toMatch(/,\s*lang\)$/);
      }
    }
    // A guard that quietly stops matching reads exactly like a clean codebase.
    expect(seen, "no feedStat* call sites found — the guard has lost its target").toBe(2);
  });

  it("labels the actions for screen readers instead of on screen", () => {
    // Four glyphs, one visual class. The words are gone and a count takes their
    // place only when there IS one — "0" beside a bolt is worse than silence —
    // so the label has to exist somewhere, and the somewhere is a11y.
    expect(card).toContain('accessibilityLabel={t("feed.kudos")}');
    // The old shape: the visible text WAS the label, so removing it without
    // this would have taken the only name the control had.
    expect(card).not.toContain('String(item.kudos) : t("feed.kudos")');
  });
  it("lets the MOMENT set the row's height, from core rather than a literal", () => {
    // The last uniform thing about a row. Weight had lived in type size alone,
    // which reads on one card and vanishes across twenty — a stream of
    // identical heights gives the eye no rhythm to catch on, and that flatness
    // is what "the feed is chaos" actually describes.
    expect(card).toContain("FEED_ROW_PAD[moment]");
    // The literal the row container used to carry.
    expect(card).not.toMatch(/paddingVertical: 12\b/);
  });

  it("translates a clock-written session title rather than printing it in English", () => {
    // defaultSessionTitle produces STORED data and stays English, so every
    // surface that shows a session's name resolves it on the way out. Missing
    // it means a Polish athlete's history reads "Afternoon session" down the
    // page in an otherwise translated app.
    expect(mobile("aurora/history-views.tsx")).toContain("sessionTitleText(s.title, t)");
  });
  it("reveals the composer's toolbar by intent, and survives the blur-before-click race", () => {
    // A disabled Share pill held open through every read of the feed is a band
    // of chrome advertising something you are not doing. It reveals on focus OR
    // on content — focus is not optional, since a PR attached with no words is
    // a valid post and content-only gating would make the glyph unreachable.
    expect(mobile("feed-view.tsx")).toContain("const composing = composerFocused || !!text.trim() || attachPr;");
    // The blur-before-tap race is answered by the list, which delivers a
    // handled tap without dismissing the keyboard first.
    expect(mobile("feed-view.tsx")).toContain('keyboardShouldPersistTaps="handled"');
  });
});
