import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE POOLED-EVENT GATE.
 *
 * React Native recycles its synthetic events. The instant a handler returns,
 * the event goes back on the pool and `destructor()` nulls every field on it —
 * including `nativeEvent` (see the renderer's SyntheticEvent). So an event is
 * only alive for the duration of the handler that received it, and any read
 * that happens LATER reads null.
 *
 * That is exactly what crashed the Plans screen in release:
 *
 *   onLayout={(e) => setRail((r) => ({ ...r, view: e.nativeEvent.layout.width }))}
 *
 * A functional setState body does not run when you call it — React replays it
 * during the NEXT render, long after the handler returned. By then
 * `e.nativeEvent` was null, and the whole screen died with
 * "Cannot read property 'layout' of null", thrown from inside basicReducer.
 * It reproduced only in release, on a screen whose measured geometry the
 * render gate explicitly cannot reach (see vitest.config.ts) — the one class
 * of bug with no shape in the type system and no reachable value in a unit
 * test. What it DOES have is a shape in the SOURCE: the event is read from
 * inside a callback that outlives the handler.
 *
 * The fix is always the same one line — hoist the measurement out of the event
 * first, then use the plain value:
 *
 *   onLayout={(e) => { const view = e.nativeEvent.layout.width; setRail((r) => ({ ...r, view })); }}
 *
 * HARD rule: zero sites, and it stays zero.
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

/**
 * The call forms whose callback runs AFTER the handler that built it has
 * returned — i.e. after the event has been recycled.
 *
 *   set<Name>(fn)  — React replays the updater during the next render.
 *   setTimeout / setInterval / requestAnimationFrame / runAfterInteractions
 *   .then(fn)      — a microtask at the earliest, still a turn too late.
 *
 * Matched at the call's opening paren so the argument span can be balanced off
 * it. `Animated.event([{ nativeEvent: ... }])` is a declarative path
 * descriptor rather than a read, and never lands inside one of these spans.
 */
const DEFERRED = /\b(set[A-Z]\w*|setTimeout|setInterval|requestAnimationFrame|runAfterInteractions)\s*\(|\.then\s*\(/g;

/**
 * The source with every comment body and string body blanked to spaces, length
 * and line breaks preserved so indices and line numbers still line up.
 *
 * Scanning raw text reads PROSE as code. The first run of this gate reported
 * workout-wrapped.tsx for a comment reading "until then (and only when…)" —
 * `then` + `(` — and would equally have flagged the fix comment beside the
 * Plans bug, which quotes the broken line on purpose. Code is the only thing
 * this rule has an opinion about.
 */
function maskLiterals(src: string): string {
  const out = src.split("");
  const blank = (from: number, to: number) => {
    for (let i = from; i < to && i < out.length; i++) if (out[i] !== "\n") out[i] = " ";
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      blank(i, end < 0 ? src.length : end);
      i = end < 0 ? src.length : end;
    } else if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      blank(i, end < 0 ? src.length : end + 2);
      i = end < 0 ? src.length : end + 1;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && !(src[j] === c && src[j - 1] !== "\\")) j++;
      blank(i + 1, j); // keep the quotes, drop the contents
      i = j;
    }
  }
  return out.join("");
}

/** The source span of a call's arguments, from its opening paren to the paren
 *  that balances it. Runs on masked source, so a `)` inside a string or a
 *  prose comment can't end the span early. */
function argSpan(masked: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < masked.length; i++) {
    if (masked[i] === "(") depth++;
    else if (masked[i] === ")") {
      depth--;
      if (depth === 0) return masked.slice(openParen, i + 1);
    }
  }
  return masked.slice(openParen);
}

/** Every site where a synthetic event is read from inside a deferred callback,
 *  as "path:line" — so a failure says WHERE, not just that a number moved. */
function escapedEventReads(): string[] {
  const found: string[] = [];
  for (const { path, text } of sources()) {
    const masked = maskLiterals(text);
    for (const m of masked.matchAll(DEFERRED)) {
      const open = m.index! + m[0].length - 1;
      const span = argSpan(masked, open);
      // Only a callback can outlive the handler; a plain value argument is
      // already evaluated by the time the handler returns.
      if (!/=>|\bfunction\b/.test(span)) continue;
      if (!/\bnativeEvent\b/.test(span)) continue;
      found.push(`${path}:${masked.slice(0, m.index!).split("\n").length}`);
    }
  }
  return found;
}

describe("pooled synthetic events", () => {
  it("HARD — no event is read after the handler that received it returned", () => {
    const found = escapedEventReads();
    const detail = found.length
      ? `\nRN nulls \`nativeEvent\` when the handler returns — read the value out of the event FIRST, then use it in the callback:\n  ${found.join("\n  ")}`
      : "";
    expect(found, detail).toEqual([]);
  });

  it("catches the Plans crash it was written for", () => {
    // The gate is only worth its runtime if it fails against the real bug, so
    // the shipped line is checked here verbatim rather than trusted.
    const bug = `onLayout={(e) => setRail((r) => ({ ...r, view: e.nativeEvent.layout.width }))}`;
    const open = bug.indexOf("setRail(") + "setRail".length;
    const span = argSpan(bug, open);
    expect(/=>/.test(span) && /\bnativeEvent\b/.test(span)).toBe(true);

    // ...and passes the fix, so it isn't just matching the whole file.
    const fixed = `onLayout={(e) => { const view = e.nativeEvent.layout.width; setRail((r) => ({ ...r, view })); }}`;
    const fixedSpan = argSpan(fixed, fixed.indexOf("setRail(") + "setRail".length);
    expect(/\bnativeEvent\b/.test(fixedSpan)).toBe(false);
  });

  it("reads code, not prose — the false positive the first run produced", () => {
    // A comment that happens to contain `then (` is not a promise, and the
    // comment explaining this very bug quotes the broken line verbatim.
    const prose = [
      "// until then (and only when nothing is measuring) it is the prompt",
      "/* onLayout={(e) => setRail((r) => ({ ...r, view: e.nativeEvent.layout.width }))} */",
      'const label = "setTimeout(() => e.nativeEvent.layout)";',
    ].join("\n");
    const masked = maskLiterals(prose);
    expect(masked).not.toContain("nativeEvent");
    // Masking is length- and line-preserving, so reported line numbers hold.
    expect(masked.length).toBe(prose.length);
    expect(masked.split("\n").length).toBe(prose.split("\n").length);
  });
});
