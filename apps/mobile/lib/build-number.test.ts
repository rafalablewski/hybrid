import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE EXPO CONFIG MUST EVALUATE THE SAME WAY TWICE.
 *
 * `app.json` sets `runtimeVersion: { policy: "fingerprint" }`, and the fingerprint
 * hashes the evaluated config. A binary is stamped with the fingerprint computed
 * when it was BUILT and accepts only updates published under that same runtime
 * version — so any value in this config that changes between two evaluations
 * silently makes over-the-air updates undeliverable.
 *
 * That is not hypothetical: app.config.js derived the build number from
 * Date.now(), so the project had a different runtime version every second, and an
 * update published from it could never match an installed build. It would report
 * success and reach nothing — a JS-only fix that "ships" and changes nothing,
 * which is the hardest kind of failure to notice.
 *
 * Probably nobody had reached it yet (publishing needs Expo auth the `eas-update`
 * capability records as never set up), which is exactly why it needs a test rather
 * than a fix alone: a trap that has not sprung looks identical to one that is not
 * there, and the cost of finding it the hard way is a release path that lies.
 *
 * So determinism is a TEST, not a comment. This is the cheapest gate in the repo
 * (evaluate a function twice) guarding one of the most expensive failures.
 */

const HERE = join(__dirname, "..");
const APP_JSON = JSON.parse(readFileSync(join(HERE, "app.json"), "utf8")).expo as Record<
  string,
  unknown
>;
const SRC = readFileSync(join(HERE, "app.config.js"), "utf8");

/** The real app.json, as Expo hands it to the dynamic config. */
const base = () => JSON.parse(JSON.stringify(APP_JSON)) as Record<string, unknown>;

type Config = (arg: { config: Record<string, unknown> }) => Record<string, unknown>;

async function evaluate(): Promise<Record<string, unknown>> {
  vi.resetModules();
  const mod = (await import("../app.config.js")) as { default: Config };
  return mod.default({ config: base() });
}

beforeEach(() => delete process.env.APP_BUILD_NUMBER);
afterEach(() => {
  vi.useRealTimers();
  delete process.env.APP_BUILD_NUMBER;
});

describe("the fingerprinted config is stable", () => {
  it("HARD — evaluates identically as the clock moves", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T10:00:00Z"));
    const first = await evaluate();
    // Far enough that any clock-derived value, at any granularity, would move.
    vi.setSystemTime(new Date("2026-08-18T17:34:56Z"));
    const second = await evaluate();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("HARD — the config never reads the clock", async () => {
    // The gate above catches a value that MOVED; this catches the mechanism
    // before it can move, including a granularity a fake clock might step over.
    // If a future field genuinely needs the time, it does not belong in a
    // fingerprinted config — stamp it in the release pipeline, after prebuild.
    expect(SRC.replace(/^\s*\/\/.*$/gm, "")).not.toMatch(/Date\.now|new Date|Date\.UTC|hrtime/);
  });

  it("leaves app.json's own build number alone", async () => {
    // The release workflow stamps the real, increasing CFBundleVersion with
    // agvtool AFTER prebuild, so the config has nothing to contribute here.
    const out = await evaluate();
    expect((out.ios as { buildNumber?: string }).buildNumber).toBe(
      (APP_JSON.ios as { buildNumber?: string }).buildNumber,
    );
    expect(out.android as Record<string, unknown>).not.toHaveProperty("versionCode");
  });
});

describe("an explicit build number still overrides", () => {
  it("takes APP_BUILD_NUMBER for both platforms", async () => {
    process.env.APP_BUILD_NUMBER = "4242";
    const out = await evaluate();
    expect((out.ios as { buildNumber?: string }).buildNumber).toBe("4242");
    expect((out.android as { versionCode?: number }).versionCode).toBe(4242);
  });

  it("is itself deterministic — a fixed integer hashes the same every time", async () => {
    // Which is the whole reason an explicit override is allowed to stay while a
    // clock-derived one is not.
    process.env.APP_BUILD_NUMBER = "4242";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T10:00:00Z"));
    const first = await evaluate();
    vi.setSystemTime(new Date("2026-08-19T03:00:00Z"));
    expect(JSON.stringify(await evaluate())).toBe(JSON.stringify(first));
  });

  it("ignores a non-numeric value rather than stamping a broken version", async () => {
    process.env.APP_BUILD_NUMBER = "v2-hotfix";
    const out = await evaluate();
    expect((out.ios as { buildNumber?: string }).buildNumber).toBe(
      (APP_JSON.ios as { buildNumber?: string }).buildNumber,
    );
  });
});

describe("the config still does its actual job", () => {
  it("passes app.json through untouched by default", async () => {
    const out = await evaluate();
    // No Apple targets flag → the plugin list is app.json's, unchanged.
    expect(out.plugins).toEqual(APP_JSON.plugins);
    expect((out.ios as { bundleIdentifier?: string }).bundleIdentifier).toBe(
      (APP_JSON.ios as { bundleIdentifier?: string }).bundleIdentifier,
    );
    // The fingerprint policy is the thing every assertion here exists to protect.
    expect(out.runtimeVersion).toEqual({ policy: "fingerprint" });
  });

  it("adds the widget/Watch targets and the App Group only when asked", async () => {
    process.env.WITH_APPLE_TARGETS = "1";
    try {
      const out = await evaluate();
      expect(out.plugins).toContain("@bacons/apple-targets");
      expect(
        (out.ios as { entitlements?: Record<string, unknown> }).entitlements,
      ).toMatchObject({ "com.apple.security.application-groups": ["group.com.hybriddomain.xyz"] });
    } finally {
      delete process.env.WITH_APPLE_TARGETS;
    }
  });
});
