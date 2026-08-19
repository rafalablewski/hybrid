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
            // Reads the shipped .ttf name tables as DATA (plus ui.tsx and
            // swiftui.tsx as text), so it stays inside the boundary.
            "lib/native-face.test.ts",
            "lib/error-boundary-palette.test.ts",
            "lib/search-surfaces.test.ts",
            // Scans every .tsx for t("literal") keys and checks the dictionary
            // holds them — `t()` returns the key it cannot resolve, so a missing
            // string is invisible to every other gate here.
            "lib/i18n-keys.test.ts",
            "lib/event-pooling.test.ts",
            // Reads every .tsx on the phone as TEXT to count brace depth, so
            // it covers the whole app from inside the pure boundary.
            "lib/hook-order.test.ts",
            // Greps source text for the label-swap pattern that resizes a
            // commit button, so it reads files as DATA like the two below.
            "lib/commit-state.test.ts",
            // Reads package.json + the SDK's own version table as DATA, so it
            // stays inside the boundary while covering every native module.
            "lib/expo-alignment.test.ts",
            // EVALUATES app.config.js twice with the clock moved. The runtime
            // version is a fingerprint of that config, so a value that changes
            // between evaluations makes every OTA update undeliverable — silently,
            // and for the life of the app.
            "lib/build-number.test.ts",
            // Reads the INSTALLED HealthKit pod's Swift as text, to prove the
            // patch that removed its two fatalError()s is still applied.
            "lib/healthkit-patch.test.ts",
            // Reads healthkit.ts as text to pin WHICH types each permission ask
            // carries — the split that keeps the crashing ask off the tap path.
            "lib/healthkit-auth.test.ts",
            // The watchdog RUNS here: a stack, a JSON blob and one AsyncStorage
            // key, no native module anywhere in it. It is the only witness to a
            // crash that leaves nothing else behind, so it is the one part of
            // this path a test can actually settle rather than pin as text.
            "lib/healthkit-watchdog.test.ts",
            // Reads the Create Food form's default serving out of the source as
            // TEXT and then runs it through the real core readers, so it proves
            // a screen invariant without importing the screen.
            "lib/nutrition-form.test.ts",
            // Reads the tab layout as TEXT to prove the bottom-accessory SLOT
            // is gated on the draft. The slot IS the bar — a child rendering
            // null still leaves an empty one over the nav pill — and the render
            // project cannot mount this file (its `expo-router` alias swallows
            // native tabs too).
            "lib/nav-accessory.test.ts",
            // Reads the live logger as TEXT to prove every set-list mutation
            // arms a layout animation before it commits. A missing one is the
            // quietest bug we can ship — correct code, passing tests, an app
            // that just feels cheap — and it is only visible on a device.
            "lib/list-motion.test.ts",
            // The recovery reminder's glue: that a second ask is actually
            // scheduled, that a second session REPLACES it rather than stacking
            // a second question on one lock screen, and that answering cancels
            // it. The clock it reads is core's and is tested there; only the
            // scheduling can be checked here. It touches expo-notifications and
            // AsyncStorage and nothing else native, which is why those two get
            // aliases below and react-native still does not.
            "lib/recovery-reminder.test.ts",
          ],
        },
        resolve: {
          alias: {
            // The ONLY two native modules inside the pure boundary. The
            // notifications stub is its own file precisely so it can be used
            // here — native.tsx imports react-native and cannot be.
            "expo-notifications": stub("notifications.ts"),
            "@react-native-async-storage/async-storage": stub("async-storage.ts"),
          },
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
            "expo-file-system": stub("native.tsx"),
            "expo-sharing": stub("native.tsx"),
            "expo-notifications": stub("native.tsx"),
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
