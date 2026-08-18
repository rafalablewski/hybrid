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
    // 8 at the time the rule was written, after the retint and the three that
    // this change cleared (flags' third copy of --color-card, audit's ad-hoc
    // surface ΔE 0.4 from ink, datanet's recharts stroke). What is left is the
    // two Apple brand colours, the modal scrims, and engine-room's two SVG
    // presentation attrs — every one of them a case with a real reason, and the
    // scrims have a named fix waiting (audit/12 §5.11).
    expect(
      found.length,
      `\nhex literal → a palette token\nRATCHET BROKEN — ceiling 8, found ${found.length}:${sites}`,
    ).toBeLessThanOrEqual(8);
    expect(
      found.length,
      `\nhex literal → a palette token\nSLACK — the ceiling is 8 and there are only ${found.length}. ` +
        `Lower it in this change: unclaimed headroom is room for a new violation.`,
    ).toBe(8);
  });

  it("HARD — the retired tokens cannot come back", () => {
    // `violet` held a steel blue and `gold` a second Fleur De Lis; both were
    // retired with the PANTONE retint. A CSS var or an export reintroducing
    // either is the drift this catches at the moment it is typed.
    const revived = hits(/--color-(violet|gold)\b|--violet-text\b|\bVIOLET(_T)?\b/g);
    expect(revived, "retired token → one of the four accents").toEqual([]);
  });
});
