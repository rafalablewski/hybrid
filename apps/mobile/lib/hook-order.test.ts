import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findHooksAfterEarlyReturn } from "@hybrid/core";

/**
 * THE HOOK-ORDER GUARD — the phone.
 *
 * The side menu crashed the app the first time anyone tapped their avatar:
 *
 *   Error: Rendered more hooks than during the previous render.
 *     at updateMemo … at AuroraSideMenu … at AppHeader
 *
 * The drawer is MOUNTED on every tab root and bails with `if (!open) return
 * null` while shut. Two `useMemo`s — the cross-app search index and its results
 * — sat BELOW that line. So the component rendered 16 hooks closed and 18 open,
 * and React, which matches hooks by call order and nothing else, threw on the
 * render where the count changed. Every shut render was fine, which is exactly
 * why it survived to TestFlight: the bug needs the OPEN render to be the second
 * one, and the drawer's whole job is to start shut.
 *
 * The scan found a second, unshipped instance of the identical mistake in
 * app/workout.tsx — `useSafeAreaInsets()` below `if (phase === "done" &&
 * summary) return <Summary …>`, three lines under a comment that said hooks
 * must stay above the early return. That is the argument for a guard rather
 * than a fix: the rule was known, written down at the crash site, and broken
 * anyway, because nothing but a human eye was checking.
 *
 * There is no ESLint in this repo to carry `react-hooks/rules-of-hooks`, so the
 * check is a source scan in the idiom of the guards beside it (app-header,
 * expo-alignment): read the tree as DATA, fail on the shape. The detector is
 * shared — @hybrid/core hook-order.ts, with its fixtures in core beside it,
 * because an empty result is what a broken scanner returns too. The admin panel
 * runs the same scanner over its own tree (apps/web/__tests__/hook-order.test.ts).
 *
 * test/side-menu.render.test.tsx covers the same bug from the other side: it
 * mounts the drawer shut and opens it, which is the only sequence in which the
 * fault is visible at all. This one is what keeps every OTHER screen honest.
 */

const MOBILE = resolve(__dirname, "..");

/** Every component file on the phone — the app routes and the components. */
function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".expo" || e.name === "ios" || e.name === "android") continue;
    const p = resolve(dir, e.name);
    if (e.isDirectory()) tsxFiles(p, acc);
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) acc.push(p);
  }
  return acc;
}

describe("the hook-order guard — no component may skip its own hooks", () => {
  const files = tsxFiles(MOBILE);

  it("reads a real tree — a scan of nothing passes trivially", () => {
    // The guard below asserts an EMPTY list. If the walker ever stopped
    // finding files (a moved directory, a renamed folder) it would keep
    // passing while checking nothing at all.
    expect(files.length).toBeGreaterThan(80);
    expect(files.some((f) => f.endsWith("components/aurora/side-menu.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("app/workout.tsx"))).toBe(true);
  });

  it("keeps every hook above every early return, on every screen", () => {
    const offenders = files.flatMap((f) =>
      findHooksAfterEarlyReturn(readFileSync(f, "utf8"), f.slice(MOBILE.length + 1)),
    );
    expect(
      offenders.map((o) => `${o.file}:${o.line} — ${o.hook}() sits below the early return on line ${o.returnLine}`),
    ).toEqual([]);
  });

  it("still names the drawer's memos as the reason it exists", () => {
    // The two hooks the crash was about, above the bail-out that skipped them.
    const src = readFileSync(resolve(MOBILE, "components/aurora/side-menu.tsx"), "utf8");
    const searchIndex = src.indexOf("const searchIndex = useMemo");
    const found = src.indexOf("const found = useMemo");
    const bail = src.indexOf("if (!open) return null;");
    expect(searchIndex).toBeGreaterThan(-1);
    expect(found).toBeGreaterThan(-1);
    expect(bail).toBeGreaterThan(found);
    expect(found).toBeGreaterThan(searchIndex);
  });
});
