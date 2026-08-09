import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * PRESS FEEDBACK COVERAGE.
 *
 * The audit's highest-volume finding: `.pressable` sat on 41 of 618 web buttons
 * and PressScale on 31 of 510 mobile Pressables, so ~93% of tap targets in the
 * app answered a touch with nothing at all. Both primitives were correct and
 * simply un-adopted.
 *
 * A one-off sweep fixes that once. This keeps it fixed — a new screen with
 * twenty silent buttons fails here rather than shipping.
 */

const WEB = join(__dirname, "..");
const MOBILE = join(__dirname, "..", "..", "mobile");

// Surfaces whose press motion is owned by a parent (or which are full-bleed).
const EXEMPT_WEB = ["swipe-row.tsx", "liquid-seg.tsx", "sheet.tsx"];
// `side-menu.tsx` joins for the same reason `sheet.tsx` is here: its raw
// Pressable is the full-screen SCRIM, which must not scale or dim under a
// finger — every row inside it uses PressScale.
const EXEMPT_MOBILE = ["swipe-row.tsx", "liquid-seg.tsx", "sheet.tsx", "side-menu.tsx", "upgrade.tsx", "drag-handle.tsx", "ui.tsx"];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Index of the `>` closing a tag opened at `i`, honouring nested braces and
 *  strings — a JSX attribute can contain `>` (an arrow function, a comparison),
 *  and scanning for the next `>` truncates the tag there. */
function tagEnd(s: string, i: number): number {
  let depth = 0;
  let quote: string | null = null;
  while (i < s.length) {
    const c = s[i]!;
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\") i++;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{" || c === "(") depth++;
    else if (c === "}" || c === ")") depth--;
    else if (c === ">" && depth === 0) return i;
    i++;
  }
  return -1;
}

describe("web buttons acknowledge a press", () => {
  it("carries .pressable on every static-className button", () => {
    const silent: string[] = [];
    for (const f of walk(join(WEB, "components")).concat(walk(join(WEB, "app")))) {
      if (EXEMPT_WEB.some((e) => f.endsWith(e))) continue;
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/<button(?![A-Za-z])/g)) {
        const end = tagEnd(s, m.index! + m[0].length);
        if (end < 0) continue;
        const attrs = s.slice(m.index! + m[0].length, end);
        // A computed className can't be checked statically; leave those be.
        if (/className=\{/.test(attrs)) continue;
        if (!attrs.includes("pressable")) {
          silent.push(`${f.replace(WEB, "")}:${s.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    expect(silent, `buttons with no press feedback:\n${silent.join("\n")}`).toEqual([]);
  });
});

describe("mobile taps acknowledge a press", () => {
  it("never imports the raw Pressable where it renders one", () => {
    // RN's Pressable has NO default feedback. Files render `<Pressable>` but
    // import it as `PressScale as Pressable` from lib/ui, so adopting the
    // primitive costs one import line rather than touching every JSX site.
    const raw: string[] = [];
    for (const f of walk(join(MOBILE, "components")).concat(walk(join(MOBILE, "app")))) {
      if (EXEMPT_MOBILE.some((e) => f.endsWith(e))) continue;
      const s = readFileSync(f, "utf8");
      if (!s.includes("<Pressable")) continue;
      const rn = s.match(/import \{([^}]*)\} from "react-native";/s);
      if (rn && /\bPressable\b/.test(rn[1]!)) raw.push(f.replace(MOBILE, ""));
    }
    expect(raw, `files rendering the raw, feedback-less Pressable:\n${raw.join("\n")}`).toEqual([]);
  });
});
