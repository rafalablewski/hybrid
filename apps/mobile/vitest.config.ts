import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const stub = (p: string) => fileURLToPath(new URL(`./test/stubs/${p}`, import.meta.url));

/**
 * TWO PROJECTS, one boundary each.
 *
 * `pure` — modules that hold real logic but touch no native module, run in
 *   plain node. Anything importing react-native is out of scope BY
 *   CONSTRUCTION; the explicit include list keeps that boundary visible rather
 *   than discovering a test that can never run. (design-tokens.test.ts reads
 *   the source tree as TEXT, so it stays inside the boundary while covering
 *   every screen.)
 *
 * `render` — the gate that ACTUALLY RENDERS. React Native itself can't run in
 *   node (its source ships as Flow), so `react-native` resolves to
 *   `react-native-web`, which renders the same component tree to a DOM we can
 *   assert on. That trade is deliberate and bounded: it proves the tree we
 *   BUILD — what nests inside what, in what order, with which props — which is
 *   where the layout bugs this repo has actually shipped live. It proves
 *   nothing about native rendering, and there is no layout engine behind it,
 *   so measured geometry (onLayout, ResizeObserver) is out of reach; a
 *   position that depends on a measurement is a position this gate cannot
 *   check, which is its own argument for deriving positions instead.
 *
 * JSDOM IS PINNED TO THE MAJOR CI CAN RUN. jsdom 30 depends on undici 8, whose
 * engines are `>=22.19.0`; .github/workflows/ci.yml runs Node 20, so every
 * render file died there with `webidl.util.markAsUncloneable is not a function`
 * while passing locally on Node 22. jsdom 29 keeps undici 7 (`>=20.18.1`).
 * Before bumping it, check the transitive undici's engines against CI's Node —
 * the failure surfaces as a worker that won't start, not as a version error.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "pure",
          environment: "node",
          include: [
            "lib/health-quantities.test.ts",
            "lib/ui.test.ts",
            "lib/design-tokens.test.ts",
            "lib/event-pooling.test.ts",
            // Greps source text for the label-swap pattern that resizes a
            // commit button, so it reads files as DATA like the two below.
            "lib/commit-state.test.ts",
            // Reads package.json + the SDK's own version table as DATA, so it
            // stays inside the boundary while covering every native module.
            "lib/expo-alignment.test.ts",
          ],
        },
      },
      {
        resolve: {
          alias: {
            "react-native-svg": stub("svg.tsx"),
            "react-native-safe-area-context": stub("native.tsx"),
            "@react-native-async-storage/async-storage": stub("async-storage.ts"),
            "@expo/ui/swift-ui/modifiers": stub("swift-ui.tsx"),
            "@expo/ui/swift-ui": stub("swift-ui.tsx"),
            "expo-blur": stub("native.tsx"),
            "expo-linear-gradient": stub("native.tsx"),
            "expo-status-bar": stub("native.tsx"),
            "expo-haptics": stub("native.tsx"),
            "expo-router": stub("native.tsx"),
            "expo-secure-store": stub("native.tsx"),
            // LAST: a prefix alias, so every entry above wins over it.
            "react-native": "react-native-web",
          },
        },
        test: {
          name: "render",
          environment: "jsdom",
          setupFiles: ["./test/setup.ts"],
          include: ["test/**/*.render.test.tsx"],
        },
      },
    ],
  },
});
