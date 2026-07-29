import { describe, it, expect } from "vitest";
import { parseDeepLink, applyDeepLink, verifiedFoodUrl, verifiedSourceUrl } from "../lib/deep-link";

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
