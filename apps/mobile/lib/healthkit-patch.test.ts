import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE HEALTHKIT PATCH IS STILL ON.
 *
 * `@kingstinct/react-native-healthkit`'s `getRouteLocations` shipped a `try!`
 * over a CheckedContinuation — two ways to call `fatalError()` for reasons that
 * are not exceptional at all (a route iCloud has not downloaded yet, a store
 * locked behind the passcode, a second callback from a route the watch is still
 * writing). A Swift abort is not an exception: it takes the process, so no
 * `.catch()` in lib/healthkit.ts and no error boundary can survive it. The app
 * simply exits — which is what the watch import was reported as.
 *
 * patches/@kingstinct__react-native-healthkit@14.0.2.patch removes both. That
 * patch is keyed to an EXACT version, and pnpm applies it silently: bump the
 * dependency past 14.0.2 and the fix is gone with no error anywhere, on a path
 * whose only symptom is a phone in somebody else's hand closing the app.
 *
 * So this reads the INSTALLED package — not the patch file, not package.json —
 * and asserts the fix is in the Swift that will actually be compiled into the
 * IPA. Same posture as expo-alignment.test.ts: the thing standing between us
 * and the next launch-day crash gets a gate that reads the real artifact.
 */

const require_ = createRequire(__filename);

const PKG = "@kingstinct/react-native-healthkit";
/** The version the patch was cut against. Moving this means re-cutting it:
 *  `pnpm patch <pkg>@<version>` → re-apply the edit → `pnpm patch-commit`. */
const PATCHED_VERSION = "14.0.2";

const installedRoot = dirname(require_.resolve(`${PKG}/package.json`));
const installed = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8")) as {
  version: string;
};
const proxy = readFileSync(join(installedRoot, "ios", "WorkoutProxy.swift"), "utf8");
/** The file's CODE. The patch's own comment quotes the `try!` it removed, and a
 *  guard that greps its own documentation is a guard that fires on the fix. */
const proxyCode = proxy.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

describe("HealthKit route read cannot abort the process", () => {
  it(`is installed at the version the patch was cut against (${PATCHED_VERSION})`, () => {
    expect(installed.version).toBe(PATCHED_VERSION);
  });

  it("carries the patch in the Swift that gets compiled", () => {
    expect(proxy).toContain("PATCHED (HYBRID)");
  });

  it("has no force-try left in the route read", () => {
    // `try!` anywhere in this file is a crash waiting for a bad route; the one
    // that shipped was the whole bug.
    expect(proxyCode).not.toMatch(/\btry!/);
  });

  it("resolves the route continuation at most once", () => {
    // A CheckedContinuation traps on a second resume, and HKWorkoutRouteQuery's
    // handler is called once per batch — so the guard, not just the try, is the
    // fix. Both halves are asserted because losing either one restores a crash.
    expect(proxy).toContain("var settled = false");
    expect(proxy).toContain("CheckedContinuation<[CLLocation], Never>");
  });
});
