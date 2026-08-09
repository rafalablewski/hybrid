import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseDeepLink, applyDeepLink, sportPageUrl, verifiedFoodUrl, verifiedSourceUrl } from "../lib/deep-link";
import { sportFromSlug, sportSlug, userPageUrl } from "@hybrid/core";

/**
 * Deep links are the ONE place in the app where an attacker-controlled string —
 * whatever is in somebody's URL bar — is read straight into screen state, so
 * the parsing deserves tests more than most helpers do.
 */

describe("parseDeepLink", () => {
  it("reads the screen and the open verified page", () => {
    expect(parseDeepLink("?s=nutrition&food=mpb-cheeseburger"))
      .toEqual({ s: "nutrition", food: "mpb-cheeseburger" });
  });

  it("ignores params it doesn't own", () => {
    expect(parseDeepLink("?s=nutrition&utm_source=newsletter")).toEqual({ s: "nutrition" });
  });

  it("drops anything that isn't a plain id, rather than erroring", () => {
    // A link from an older build must degrade to "the app opened", never to a
    // broken screen — and none of this may reach a catalog lookup.
    for (const bad of ["../../etc/passwd", "<script>alert(1)</script>", "a b", "a/b", "'; drop--", "%00"]) {
      expect(parseDeepLink(`?food=${encodeURIComponent(bad)}`).food).toBeUndefined();
    }
  });

  it("drops an absurdly long id", () => {
    expect(parseDeepLink(`?food=${"a".repeat(200)}`).food).toBeUndefined();
  });

  it("survives junk input", () => {
    expect(parseDeepLink("")).toEqual({});
    expect(parseDeepLink("?")).toEqual({});
    expect(parseDeepLink("?food=")).toEqual({});
    expect(parseDeepLink("?&&=&")).toEqual({});
  });
});

describe("applyDeepLink", () => {
  it("mirrors state into the query string", () => {
    expect(parseDeepLink(applyDeepLink("", { s: "nutrition", food: "mpb-fries-small" })))
      .toEqual({ s: "nutrition", food: "mpb-fries-small" });
  });

  it("removes a key set to undefined, so a page you left can't linger", () => {
    const open = applyDeepLink("", { s: "nutrition", food: "mpb-fries-small" });
    expect(parseDeepLink(applyDeepLink(open, { food: undefined }))).toEqual({ s: "nutrition" });
  });

  it("leaves keys it wasn't asked about alone", () => {
    // The shell owns `s`, the nutrition screen owns `food`/`source`. Neither may
    // clobber the other's param on its own write.
    const withSource = applyDeepLink("", { s: "nutrition", source: "max-premium-burgers" });
    expect(parseDeepLink(applyDeepLink(withSource, { food: "mpb-chicken-jr" })).source)
      .toBe("max-premium-burgers");
  });

  it("drops the ? entirely when nothing is left", () => {
    const one = applyDeepLink("", { s: "nutrition" });
    expect(applyDeepLink(one, { s: undefined })).toBe("");
  });

  it("is idempotent", () => {
    const once = applyDeepLink("", { s: "nutrition", food: "mpb-cheeseburger" });
    expect(applyDeepLink(once, { s: "nutrition", food: "mpb-cheeseburger" })).toBe(once);
  });
});

describe("shareable urls", () => {
  it("builds an absolute link to a product page", () => {
    expect(verifiedFoodUrl("mpb-cheeseburger", "https://hybrid.app"))
      .toBe("https://hybrid.app/app?s=nutrition&food=mpb-cheeseburger");
  });

  it("builds an absolute link to a source page", () => {
    expect(verifiedSourceUrl("max-premium-burgers", "https://hybrid.app"))
      .toBe("https://hybrid.app/app?s=nutrition&source=max-premium-burgers");
  });

  it("round-trips through the parser it will be read back by", () => {
    const url = verifiedFoodUrl("mpb-cheeseburger", "https://hybrid.app");
    expect(parseDeepLink(url.slice(url.indexOf("?"))))
      .toEqual({ s: "nutrition", food: "mpb-cheeseburger" });
  });
});

/**
 * THE BACK BUTTON CONTRACT.
 *
 * These are static assertions over the source rather than DOM tests (this suite
 * runs in the node environment), and they guard the two ways the fix for "Back
 * exits the app" can silently rot:
 *
 *  1. the shell stops PUSHING on navigation, at which point there is once again
 *     nothing for Back to return to and it leaves the app from any depth;
 *  2. the direction counter grows a second home. The first cut of this had a
 *     `last` index living in a closure inside onDeepLinkChange, updated only on
 *     popstate — so after three forward pushes it still held the index from
 *     subscribe time and the first Back was reported as a Forward, playing the
 *     wrong transition. One counter, owned by the shell.
 */
describe("browser history contract", () => {
  const read = (p: string) =>
    readFileSync(new URL(p, import.meta.url), "utf8");

  it("pushes a history entry on forward navigation", () => {
    const shell = read("../components/app-shell.tsx");
    expect(shell).toMatch(/writeDeepLink\(\s*\{ s: to === "today" \? undefined : to \}[\s\S]{0,80}push: true/);
  });

  it("does not re-push while applying a Back or Forward", () => {
    // popTo exists precisely so the pop path cannot call onNavigate; if it did,
    // every Back would append an entry and take two presses.
    const hook = read("../lib/use-screen-transition.ts");
    const popTo = hook.slice(hook.indexOf("const popTo"), hook.indexOf("return { setScreen"));
    expect(popTo).not.toMatch(/navRef\.current\?\.\(/);
  });

  it("keeps exactly one direction counter, owned by the shell", () => {
    // onDeepLinkChange must REPORT the landed index, never decide direction
    // from a stale local copy of it.
    const dl = read("../lib/deep-link.ts");
    const fn = dl.slice(dl.indexOf("export function onDeepLinkChange"));
    expect(fn).not.toMatch(/\blet last\b/);
    expect(fn).toMatch(/fn\(readDeepLink\(\), typeof s\?\.hybridIdx/);
    expect(read("../components/app-shell.tsx")).toMatch(/const back = idx < navIdx\.current/);
  });
});

describe("a sport page has an address", () => {
  it("carries the sport as a slug, which the parser already accepts", () => {
    expect(parseDeepLink("?s=sportpage&sport=open-water-swimming"))
      .toEqual({ s: "sportpage", sport: "open-water-swimming" });
  });

  it("builds a shareable link from the display name, and reads back to it", () => {
    const url = sportPageUrl("Track & Field", "https://app.hybrid.app");
    expect(url).toBe("https://app.hybrid.app/app?s=sportpage&sport=track-and-field");
    const parsed = parseDeepLink(url.slice(url.indexOf("?")));
    expect(parsed.s).toBe("sportpage");
    expect(sportFromSlug(parsed.sport!)).toBe("Track & Field");
  });

  it("every catalog sport survives the round trip through a URL", () => {
    for (const name of ["Running", "Swimming", "Open Water Swimming", "Table Tennis", "Track & Field"]) {
      const parsed = parseDeepLink(`?s=sportpage&sport=${sportSlug(name)}`);
      expect(parsed.sport, name).toBeDefined();
      expect(sportFromSlug(parsed.sport!)).toBe(name);
    }
  });

  it("drops a mangled sport param rather than passing it to a lookup", () => {
    expect(parseDeepLink("?s=sportpage&sport=../../etc/passwd").sport).toBeUndefined();
    expect(sportFromSlug("../../etc/passwd")).toBeNull();
  });

  it("leaving the page drops the slug, so a stale address can't point at it", () => {
    const open = applyDeepLink("", { s: "sportpage", sport: "swimming" });
    expect(parseDeepLink(applyDeepLink(open, { s: "today", sport: undefined }))).toEqual({ s: "today" });
  });
});

describe("a person has an address", () => {
  it("carries the handle, which the parser already accepts", () => {
    expect(parseDeepLink("?s=user&u=ada")).toEqual({ s: "user", u: "ada" });
  });

  it("the shared profile link reads back through the parser that will land it", () => {
    const url = userPageUrl("Ada");
    expect(parseDeepLink(url.slice(url.indexOf("?")))).toEqual({ s: "user", u: "ada" });
  });

  it("drops a mangled handle rather than passing it to a lookup", () => {
    expect(parseDeepLink("?s=user&u=../../etc/passwd").u).toBeUndefined();
    expect(parseDeepLink("?s=user&u=<script>").u).toBeUndefined();
  });

  it("leaving the page drops the handle, so a stale address can't point at it", () => {
    const open = applyDeepLink("", { s: "user", u: "ada" });
    expect(parseDeepLink(applyDeepLink(open, { s: "feed", u: undefined }))).toEqual({ s: "feed" });
  });
});
