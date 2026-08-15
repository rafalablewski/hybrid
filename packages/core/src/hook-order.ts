/**
 * THE HOOK-ORDER SCANNER — the analysis behind the two guards that use it.
 *
 * It lives in core, and in its own module rather than inside a test, for two
 * reasons. It is the thing being TRUSTED: a guard whose detector is wrong is
 * worse than no guard, so it is importable and carries its own fixtures
 * (hook-order.test.ts, beside it). And it has TWO callers — the phone's guard
 * (apps/mobile/lib/hook-order.test.ts) and the admin panel's
 * (apps/web/__tests__/hook-order.test.ts) — so a copy in one app's lib would
 * have had the other app importing across a package boundary to reach it.
 *
 * It is pure text analysis over source read as data: no React, no react-native,
 * nothing to run. That is what lets it sit in core beside the engines.
 *
 * What it looks for is one shape: a `use…()` call in a component's TOP-LEVEL
 * body that sits BELOW an early `return`. React counts hooks per render and
 * matches them by call order, so a component that returns before reaching one
 * of its own hooks renders a different NUMBER of hooks depending on its props —
 * and the render after the count changes throws, taking the screen down.
 *
 * Only depth-1 statements are considered. A hook inside a nested callback is a
 * different (and legal) thing, and JSX in the returned tree is deeper still.
 */

/** Source with comments and string/template contents blanked, preserving
 *  length and newlines so line numbers still line up. Strings are blanked
 *  because an unbalanced brace inside one (`"{"`) would corrupt the depth
 *  count; template expressions are balanced, so dropping them whole is safe. */
export function blankLiterals(src: string): string {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      blank(i, end === -1 ? n : end);
      i = end === -1 ? n : end;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      blank(i, end === -1 ? n : end + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let depth = 0; // nesting of ${ } inside a template
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (c === "`" && src[j] === "$" && src[j + 1] === "{") { depth++; j += 2; continue; }
        if (c === "`" && depth > 0 && src[j] === "}") { depth--; j++; continue; }
        if (depth === 0 && src[j] === c) break;
        if (c !== "`" && src[j] === "\n") break; // unterminated quote — bail
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join("");
}

const HOOK = /\buse[A-Z]\w*\s*(?:<[^<>()]*>)?\s*\(/;
/** An early exit at the top level of a component body. */
const EARLY_RETURN = /^\s*(?:\}\s*)?(?:if\s*\(.*\)\s*)?return\b/;
/** A guard clause written as a BLOCK — `if (!open) {` … `return null;` … `}`.
 *  Its return sits one level deeper than the one-liner form, so without this
 *  the commonest spelling of the bug would walk straight past the scan. */
const CONTROL_OPEN = /^\s*(?:\}\s*)?(?:if|else|switch|for|while|do|try|catch|finally)\b/;
const BLOCK_RETURN = /^\s*return\b/;
/** A declaration that opens a new top-level scope — resets the scan. */
const TOP_LEVEL_DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\b|const\b|class\b|let\b|var\b)/;

export type HookOrderFinding = {
  file: string;
  line: number;
  hook: string;
  returnLine: number;
};

/**
 * Report every top-level hook call that a component's own early return can skip.
 * `file` is echoed back into each finding so callers can scan a set of files.
 */
export function findHooksAfterEarlyReturn(src: string, file = ""): HookOrderFinding[] {
  const lines = blankLiterals(src).split("\n");
  const findings: HookOrderFinding[] = [];
  let depth = 0;
  let earlyReturn = -1;
  /** Inside a control-flow block opened at the component's top level. */
  let inGuardBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const startDepth = depth;
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }

    // Back at the file's top level: a new declaration begins, so whatever
    // early return we were tracking belonged to a scope that has closed.
    if (startDepth === 0) {
      if (TOP_LEVEL_DECL.test(line)) earlyReturn = -1;
      inGuardBlock = false;
      continue;
    }

    // The body of a top-level guard clause: its `return` exits the component
    // just as surely as the one-liner's does.
    if (inGuardBlock && startDepth === 2 && earlyReturn < 0 && BLOCK_RETURN.test(line)) earlyReturn = i;
    if (startDepth > 1 && depth <= 1) inGuardBlock = false; // the block closed

    if (startDepth !== 1) continue; // nested callback or JSX — not the hook list

    if (depth > 1 && CONTROL_OPEN.test(line)) inGuardBlock = true;

    if (earlyReturn >= 0) {
      const m = line.match(HOOK);
      if (m) {
        findings.push({
          file,
          line: i + 1,
          hook: (m[0] ?? "").replace(/\s*(?:<[^<>()]*>)?\s*\($/, ""),
          returnLine: earlyReturn + 1,
        });
      }
    } else if (EARLY_RETURN.test(line)) {
      earlyReturn = i;
    }
  }
  return findings;
}
