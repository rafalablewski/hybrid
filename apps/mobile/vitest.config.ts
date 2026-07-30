import { defineConfig } from "vitest/config";

/**
 * Mobile unit tests cover the PURE modules only — the ones that hold real logic
 * but touch no native module, so they run in plain node with no React Native
 * runtime, no Expo, no simulator. Anything that imports react-native is out of
 * scope by construction; the include list keeps that boundary explicit rather
 * than discovering a test that can never run.
 */
export default defineConfig({
  test: {
    include: ["lib/health-quantities.test.ts"],
  },
});
