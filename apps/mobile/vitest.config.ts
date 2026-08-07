import { defineConfig } from "vitest/config";

/**
 * Mobile tests run in plain node — no React Native runtime, no Expo, no
 * simulator. Two kinds live here, and the include list keeps the boundary
 * explicit rather than discovering a test that can never run:
 *
 *   • PURE modules — real logic, no native import.
 *   • RENDER gates — a screen component rendered for real, with only its NATIVE
 *     edges mocked (react-native's host components, svg, the theme/i18n hooks).
 *     A render error is a THROW, so an unrendered branch is an untested one;
 *     these exist to exercise the branches a type-checker cannot reach.
 */
export default defineConfig({
  test: {
    // design-tokens.test.ts reads the source tree as TEXT rather than importing
    // it, so it stays inside that boundary while covering every screen.
    include: [
      "lib/health-quantities.test.ts",
      "lib/ui.test.ts",
      "lib/design-tokens.test.ts",
      "components/feed-card.test.tsx",
    ],
  },
});
