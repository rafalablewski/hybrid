import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE WEB SIDE'S HEX RATCHET — the half that was missing.
 *
 * `apps/mobile/lib/design-tokens.test.ts` has policed hex literals on the phone
 * for months, with a dated burn-down. This side had NOTHING, and audit/12 §5.3
 * put a number on what that cost: a stale hairline sitting in the crash pages,
 * a second chartreuse in the email template, a local six-value micro-palette on
 * the invite landing, an off-palette error red in the admin panel. Every one of
 * them a value somebody typed because there was no rule saying not to.
 *
 * WHAT THIS COUNTS, and the exclusion is the interesting part: the six files in
 * fallback-palette.test.ts are DELIBERATELY hardcoded — a crash boundary cannot
 * depend on the stylesheet it may have just failed to load — and they are held
 * correct by that test instead. Counting them here would mean one rule pushing a
 * number down while another rule requires it to stay, which is how a ratchet
 * teaches people to add exemptions. Two rules, one job each.
 *
 * NOT AIMING AT ZERO EITHER. Some of the remainder is legitimate: `login/page.tsx`
 * spells out Apple's `#fff`/`#000` because those are Apple's brand and not ours,
 * and the two `#000a`/`#000b` scrims are the modal wash. Those want a token
 * (audit/12 §5.11 — one `overlay.scrim`) rather than deletion, so the number
 * comes down when that lands, not by hiding them.
 */

const ROOT = join(__dirname, "..");
/** Held correct by fallback-palette.test.ts instead — see the header. */
const GUARDED_ELSEWHERE = new Set(
  ["app/error.tsx", "app/global-error.tsx", "app/not-found.tsx", "app/page.tsx", "app/privacy/page.tsx", "app/terms/page.tsx"].map((r) =>
    join(ROOT, r),
  ),
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "__tests__") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const FILES = ["app", "components", "lib"]
  .flatMap((d) => walk(join(ROOT, d)))
  .filter((p) => !GUARDED_ELSEWHERE.has(p))
  .map((p) => ({ path: p.slice(ROOT.length + 1), text: readFileSync(p, "utf8") }));

/** A quoted hex, the same shape the mobile rule matches. */
const QUOTED_HEX = /["'`]#[0-9a-fA-F]{3,8}["'`]/g;

function hits(re: RegExp): string[] {
  const out: string[] = [];
  for (const f of FILES) {
    const lines = f.text.split("\n");
    lines.forEach((l, i) => {
      // Comment-blind, like the mobile rule: a literal quoted inside prose that
      // explains why it was removed is not a literal anybody renders.
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
      for (const m of l.match(re) ?? []) out.push(`${f.path}:${i + 1} ${m}`);
    });
  }
  return out;
}

describe("colour", () => {
  it("RATCHET — no new hex literals outside the palette", () => {
    const found = hits(QUOTED_HEX);
    const sites = `\n  ${found.join("\n  ")}`;
    // 8 when the rule was written, 5 after the three admin modal scrims became
    // one `scrim()` call. What is left is the two Apple brand colours and
    // engine-room's two SVG presentation attrs — all four with a real reason.
    // (was: 8 at the time the rule was written), after the retint and the three that
    // this change cleared (flags' third copy of --color-card, audit's ad-hoc
    // surface ΔE 0.4 from ink, datanet's recharts stroke). What is left is the
    // two Apple brand colours, the modal scrims, and engine-room's two SVG
    // presentation attrs — every one of them a case with a real reason, and the
    // scrims have a named fix waiting (audit/12 §5.11).
    expect(
      found.length,
      `\nhex literal → a palette token\nRATCHET BROKEN — ceiling 5, found ${found.length}:${sites}`,
    ).toBeLessThanOrEqual(5);
    expect(
      found.length,
      `\nhex literal → a palette token\nSLACK — the ceiling is 5 and there are only ${found.length}. ` +
        `Lower it in this change: unclaimed headroom is room for a new violation.`,
    ).toBe(5);
  });

  it("HARD — the retired tokens cannot come back", () => {
    // `violet` held a steel blue and `gold` a second Fleur De Lis; both were
    // retired with the PANTONE retint. A CSS var or an export reintroducing
    // either is the drift this catches at the moment it is typed.
    const revived = hits(/--color-(violet|gold)\b|--violet-text\b|\bVIOLET(_T)?\b/g);
    expect(revived, "retired token → one of the four accents").toEqual([]);
  });
});

/**
 * THE SPACING LADDER, WEB SIDE — the other half that was missing.
 *
 * Same story as the hex rule above, one axis over. `space` in @hybrid/core is
 * ONE map for both clients (4, 6, 8, 10, 12, 16, 20, 24, 32, 40) and the admin
 * panel reads it almost nowhere: the Aug 2026 spacing audit counted 504 raw
 * numeric paddings, margins and gaps across apps/web, 136 of them on no rung of
 * the ladder at all (130 once the six crash-boundary files the hex rule already
 * excludes come out — a crash page cannot import a token map either) — 13s, 15s, 22s, 26s, 60s, each one a number somebody tuned
 * against one panel.
 *
 * The mobile twin of this rule (apps/mobile/lib/design-tokens.test.ts, the
 * `spacing` block) carries the full argument and the same two-tier shape: an
 * off-ladder value is not a style-guide infraction, it is a value that cannot
 * be any rung, which means nothing generated it and nothing can say whether the
 * next one belongs. On-ladder literals are left alone here on purpose — they
 * are already the right size, and converting them to `space.*` is a separate,
 * lower-stakes sweep.
 *
 * The date is later than mobile's KIT tier and earlier than its screen tier, in
 * proportion to the work: 130 sites, all of them in an operator tool with no
 * App Store review between a fix and its users.
 */
describe("spacing", () => {
  const SPACING_PROPS =
    "padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingHorizontal|paddingVertical|" +
    "margin|marginTop|marginBottom|marginLeft|marginRight|marginHorizontal|marginVertical|" +
    "gap|rowGap|columnGap";
  /** POSITIVE only — a negative margin is a bleed, and bleeds are ruled on by
   *  name in screen-gutter.test.ts. See the mobile twin's note. */
  const OFF_LADDER = new RegExp(`\\b(?:${SPACING_PROPS}):\\s*(\\d+(?:\\.\\d+)?)\\b`, "g");
  const LADDER = new Set([0, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40]);

  it("RATCHET — an off-ladder padding, margin or gap gives way to a space.* rung", () => {
    const found: string[] = [];
    for (const f of FILES) {
      f.text.split("\n").forEach((l, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        for (const m of l.matchAll(OFF_LADDER)) {
          if (!LADDER.has(Number(m[1]))) found.push(`${f.path}:${i + 1} ${m[0]}`);
        }
      });
    }
    const sites = `\n  ${found.slice(0, 30).join("\n  ")}${found.length > 30 ? `\n  …and ${found.length - 30} more` : ""}`;
    expect(
      found.length,
      `\noff-ladder spacing → a space.* rung\nRATCHET BROKEN — ceiling 130, found ${found.length}:${sites}`,
    ).toBeLessThanOrEqual(130);
    expect(
      found.length,
      `\noff-ladder spacing → a space.* rung\nSLACK — the ceiling is 130 and there are only ${found.length}. ` +
        `Lower it in this change: unclaimed headroom is room for a new violation.`,
    ).toBe(130);
    expect(
      new Date().toISOString().slice(0, 10) > "2027-06-30" && found.length > 0,
      "\noff-ladder spacing → a space.* rung\nPAST DUE — this was to reach zero by 2027-06-30.",
    ).toBe(false);
  });
});
