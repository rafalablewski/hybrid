import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * THE EXPO SDK ALIGNMENT GUARD.
 *
 * Every Expo native module is Swift compiled against ExpoModulesCore, and they
 * are shipped as separate dynamic frameworks inside the .app. Nothing checks at
 * BUILD time that the core a module was compiled against is the core the app
 * links: the mismatch surfaces at LAUNCH, as dyld refusing to resolve a symbol,
 * which iOS reports as an immediate crash with no JS involved and no stack worth
 * reading.
 *
 * That is not hypothetical. Build 1.0.0 (82223058) was dead on arrival:
 *
 *   Symbol not found: _$s15ExpoModulesCore6RecordPAAE4from10dictionary…
 *   Referenced from: …/Frameworks/ExpoCamera.framework/ExpoCamera
 *   Expected in:     …/Frameworks/ExpoModulesCore.framework/ExpoModulesCore
 *
 * `Record.from(dictionary:appContext:)` was added to the `Record` protocol in
 * expo-modules-core 56.0.16. Every `struct …: Record` in expo-camera therefore
 * emits a protocol-witness reference to it — and the app linked core 56.0.14,
 * which had no such requirement. The app aborted in dyld before the first frame.
 *
 * The cause was one character of version drift. `expo@56.0.8` pins
 * `expo-camera: ~56.0.7`; the barcode work declared `~56.0.8` — npm-latest, the
 * version `pnpm add` picks and `expo install` does not — and camera 56.0.8 was
 * published against the newer core. Both halves were individually reasonable.
 *
 * So the rule is the SDK's own table, `expo/bundledNativeModules.json`: the set
 * of versions Expo builds and tests together for the installed `expo`. An
 * Expo-owned package that deviates from it is linking against a core it was not
 * compiled against, and the first symptom will be a crash on a tester's phone.
 *
 * Non-Expo packages in that table (react-native and friends) do NOT link
 * ExpoModulesCore, so they are free to diverge — but only on purpose, listed
 * below with a reason. Silent drift fails here either way.
 */

const require_ = createRequire(__filename);

/** The SDK's table: which version of each module belongs to the installed expo. */
const SDK: Record<string, string> = require_("expo/bundledNativeModules.json");

const DEPS: Record<string, string> = JSON.parse(
  readFileSync(require_.resolve("../package.json"), "utf8"),
).dependencies;

/** Expo-owned = compiled against ExpoModulesCore = must move with it. */
const isExpoOwned = (name: string) => name.startsWith("expo-") || name.startsWith("@expo/") || name === "expo";

/**
 * Deliberate divergences, non-Expo only. Each needs a reason, because the entry
 * is the thing standing between us and the next launch crash — an unexplained
 * name here is just the drift again, spelled as permission.
 */
const DELIBERATE: Record<string, string> = {
  "react-native-safe-area-context":
    "Ahead of the SDK pin: 5.8 is where `initialWindowMetrics` reports the window inset without the native tab bar folded in (lib/layout.ts sheetInsetBottom).",
  "@react-native-async-storage/async-storage":
    "A major ahead of the SDK pin (3.x vs 2.x) — the version the persisted stores were written and migrated against.",
};

describe("Expo SDK alignment", () => {
  const expoVersion = require_("expo/package.json").version;

  it(`HARD — every Expo-owned dependency matches the SDK set (expo ${expoVersion})`, () => {
    const drifted: string[] = [];
    for (const [name, declared] of Object.entries(DEPS)) {
      const want = SDK[name];
      if (!want || !isExpoOwned(name)) continue;
      if (declared !== want) drifted.push(`  ${name}: declared ${declared}, SDK wants ${want}`);
    }
    expect(
      drifted.length,
      drifted.length
        ? `\nThese link ExpoModulesCore and must match the SDK set, or the app crashes in dyld at launch.\nRun \`npx expo install --fix\` (never \`pnpm add expo-…\`, which takes npm-latest):\n${drifted.join("\n")}`
        : "",
    ).toBe(0);
  });

  it("HARD — the linked expo-modules-core is the one the SDK pins", () => {
    // Transitive, so no entry in package.json declares it — and it is precisely
    // the framework every other Expo module resolves its symbols against.
    const installed = require_("expo-modules-core/package.json").version;
    const want = require_("expo/package.json").dependencies["expo-modules-core"];
    const [, major, minor] = /^[~^]?(\d+)\.(\d+)\./.exec(want) ?? [];
    expect(
      installed.startsWith(`${major}.${minor}.`),
      `\nexpo ${expoVersion} pins expo-modules-core ${want}, but ${installed} is installed.\nEvery Expo module in the app is compiled against this framework.`,
    ).toBe(true);
  });

  it("HARD — non-Expo divergence from the SDK set is declared, with a reason", () => {
    const undeclared: string[] = [];
    for (const [name, declared] of Object.entries(DEPS)) {
      const want = SDK[name];
      if (!want || isExpoOwned(name)) continue;
      if (declared !== want && !DELIBERATE[name]) {
        undeclared.push(`  ${name}: declared ${declared}, SDK wants ${want}`);
      }
    }
    expect(
      undeclared.length,
      undeclared.length
        ? `\nEither align these with the SDK set, or add each to DELIBERATE above with the reason it is pinned elsewhere:\n${undeclared.join("\n")}`
        : "",
    ).toBe(0);
  });

  it("HARD — no stale entry in DELIBERATE", () => {
    // A reason that no longer describes a divergence is a stale note that will
    // one day excuse a real one.
    const stale = Object.keys(DELIBERATE).filter((name) => !DEPS[name] || DEPS[name] === SDK[name]);
    expect(stale.length, stale.length ? `\nNo longer diverging — drop from DELIBERATE: ${stale.join(", ")}` : "").toBe(0);
  });
});
