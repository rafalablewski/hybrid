import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findHooksAfterEarlyReturn } from "@hybrid/core";

/**
 * THE HOOK-ORDER GUARD — the admin panel.
 *
 * The crash this catches happened on the PHONE (see
 * apps/mobile/lib/hook-order.test.ts for the full account: the side menu
 * rendered 16 hooks shut and 18 open, and React threw the first time anyone
 * tapped their avatar). This file exists because the same mistake is available
 * here, and nothing was checking.
 *
 * WHY THERE IS A WEB HALF AT ALL, given that the web client is RETIRED and the
 * product is the mobile app: `apps/web` did not go away with it. It still hosts
 * the backend and the ONE UI surface that survived — `/admin`, which is ~23
 * components and the operator's daily tool, plus the login, the legal pages and
 * the two public landings. Those are React, they render on a client, and a hook
 * below an early return takes them down exactly as it took down the drawer.
 * A retired USER-FACING client is not an unguarded codebase.
 *
 * It is deliberately no more than this. The mobile guard carries the crash's
 * provenance and a regression-lock on the specific file; this one is the plain
 * sweep, because the admin panel has no such history and inventing ceremony for
 * it would be pretending the two surfaces matter equally. They do not — but the
 * scan is one function call over files already on disk, and the argument for
 * skipping it was only ever that nobody had written it.
 *
 * Same shared detector as the phone (@hybrid/core hook-order.ts), whose own
 * fixtures live in core beside it — an empty result is also what a broken
 * scanner returns.
 */

const WEB = resolve(__dirname, "..");

/** Every component file the browser can reach: the App Router pages and the
 *  components they mount. `.next` is build output, not source. */
function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === "__tests__") continue;
    const p = resolve(dir, e.name);
    if (e.isDirectory()) tsxFiles(p, acc);
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) acc.push(p);
  }
  return acc;
}

describe("the hook-order guard — the admin panel may not skip its own hooks", () => {
  const files = tsxFiles(WEB);

  it("reads a real tree — a scan of nothing passes trivially", () => {
    // The sweep below asserts an EMPTY list, which is also what a walker that
    // stopped finding files would produce.
    expect(files.length).toBeGreaterThan(30);
    expect(files.some((f) => f.includes("components/admin"))).toBe(true);
    expect(files.some((f) => f.endsWith("app/admin/page.tsx"))).toBe(true);
  });

  it("keeps every hook above every early return, on every surface", () => {
    const offenders = files.flatMap((f) =>
      findHooksAfterEarlyReturn(readFileSync(f, "utf8"), f.slice(WEB.length + 1)),
    );
    expect(
      offenders.map((o) => `${o.file}:${o.line} — ${o.hook}() sits below the early return on line ${o.returnLine}`),
    ).toEqual([]);
  });
});
