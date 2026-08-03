import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE DESIGN-TOKEN RATCHET.
 *
 * The design audit's root finding was not that the token system is wrong — it is
 * unusually well authored — but that NOTHING FAILED when a call site ignored it.
 * The one healthy axis was motion, and motion is healthy precisely because
 * motion.test.ts holds it to its own rules. This file is that guard for the
 * visual axes.
 *
 * Two kinds of rule:
 *
 *   HARD — the violation count is zero and must stay zero. Adding one fails.
 *
 *   RATCHET — the violation count is a known, non-zero number that we are
 *     paying down. The test asserts the count NEVER RISES. Fixing sites and
 *     lowering the ceiling is the intended workflow; the number only ever goes
 *     down, and when it reaches zero the rule graduates to HARD.
 *
 * A ratchet is deliberately unglamorous: it does not fix anything, it just makes
 * the debt visible and stops it growing while the sweeps land.
 */

const ROOT = join(__dirname, "..");
const DIRS = ["app", "components", "lib"];

function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push({ path: full.slice(ROOT.length + 1), text: readFileSync(full, "utf8") });
      }
    }
  };
  for (const d of DIRS) walk(join(ROOT, d));
  return out;
}

const FILES = sources();

/** Every `pattern` match across the tree, as "path:line" strings. */
function hits(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const { path, text } of FILES) {
    text.split("\n").forEach((line, i) => {
      for (const _ of line.matchAll(pattern)) found.push(`${path}:${i + 1}`);
    });
  }
  return found;
}

/** A ratchet: report the overage with the offending sites, so a failure tells
 *  you WHERE, not just that a number moved. */
function expectAtMost(found: string[], ceiling: number, rule: string) {
  const detail = found.length > ceiling ? `\n${rule}\nceiling ${ceiling}, found ${found.length}:\n  ${found.slice(0, 25).join("\n  ")}` : "";
  expect(found.length, detail).toBeLessThanOrEqual(ceiling);
}

describe("type scale", () => {
  it("HARD — no text below the 10dp legibility floor", () => {
    // Was 98 sites (86 at 9dp, 12 at 8dp), overwhelmingly the mono + uppercase +
    // letter-spaced kicker — the least legible combination available — including
    // 14 in the live logging screen, read one-handed mid-set. All raised to
    // fs.nano. This rule is HARD from the start: there is no size below `nano`.
    expect(hits(/fontSize:\s*[0-9](?![0-9.])/g)).toEqual([]);
  });

  it("RATCHET — raw fontSize integers give way to fs.* rungs", () => {
    // The ladder has 13 named rungs. Every raw integer here is a call site that
    // decided for itself; ~37% of them land off the ladder entirely.
    expectAtMost(hits(/fontSize:\s*\d+/g), 489, "raw fontSize → use an fs.* rung");
  });
});

describe("leading and tracking", () => {
  it("RATCHET — absolute lineHeight gives way to leading()", () => {
    // 29 distinct absolute dp values at audit time. Absolute leading is also why
    // Dynamic Type cannot work: the OS scales glyphs and leaves the line box, so
    // text collides with itself before it clips. leading(fs.body) derives the box
    // from the size, so a scaled size carries its leading with it.
    expectAtMost(hits(/lineHeight:\s*\d/g), 287, "absolute lineHeight → leading(size, role)");
  });

  it("RATCHET — raw letterSpacing gives way to tracking.*", () => {
    // 18 distinct values, of which 0.9 and 1.2 are the same eyebrow drawn twice.
    expectAtMost(hits(/letterSpacing:\s*-?\d/g), 480, "raw letterSpacing → tracking.*");
  });
});

describe("geometry", () => {
  it("RATCHET — raw borderRadius gives way to RADIUS.*", () => {
    // 36 distinct radii against a 5-rung vocabulary (mark/inner/field/card/pill).
    expectAtMost(hits(/borderRadius:\s*\d/g), 507, "raw borderRadius → RADIUS.*");
  });
});

describe("colour", () => {
  it("RATCHET — no new hex literals outside the palette", () => {
    // 36 distinct literals at audit time. The ones that matter are #0e0f0d and
    // #0e100d: ad-hoc surfaces between ink and ink2 that are NOT tokens and so do
    // not flip in Kyoto Hour — in feel-prompt.tsx one sits on the same line as
    // C.ink2, putting two states of one control at opposite ends of the value
    // scale in the light theme.
    // Paid down from 148 → 136 by resolving the #0e0f0d / #0e100d family: the
    // themed-screen uses became palette tokens (they were a real Kyoto Hour
    // break) and the Wrapped takeover's became the named, deliberately
    // fixed-dark HERO_TAKEOVER_INK / HERO_TAKEOVER_RAISED.
    expectAtMost(hits(/["'`]#[0-9a-fA-F]{3,8}["'`]/g), 136, "hex literal → a palette token");
  });
});

describe("presentation", () => {
  it("HARD — no system alerts; the app draws its own decisions", () => {
    // Was 34 Alert.alert calls plus an iOS-only Alert.prompt. They were not
    // incidental sites: delete a session, erase an account, block a person, deny
    // a coach application. All now run through components/aurora/confirm.tsx on
    // the app's own Sheet. HARD, not a ratchet — reintroducing one puts the most
    // consequential moment in the product back in the hands of the OS.
    const src = FILES.filter((f) => !f.path.endsWith("aurora/confirm.tsx"));
    const alerts: string[] = [];
    for (const { path, text } of src) {
      text.split("\n").forEach((line, i) => {
        if (/\bAlert\.(alert|prompt)\(/.test(line)) alerts.push(`${path}:${i + 1}`);
      });
    }
    expect(alerts).toEqual([]);
  });

  it("RATCHET — raw Modals give way to <Sheet>", () => {
    // Twelve surfaces present as `<Modal animationType="slide">` — the exercise
    // picker, session editor, device match, share sheet — so the drag gesture a
    // user learns on Today is dead on the controls they touch most.
    const raw = hits(/<Modal\b/g).filter((h) => !h.startsWith("components/aurora/sheet.tsx"));
    expectAtMost(raw, 12, "<Modal> → <Sheet>");
  });
});
