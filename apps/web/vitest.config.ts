import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Node-environment tests. Two kinds live here:
//   • STATIC scans that read the source tree with fs (security, parity, the
//     typography and dead-zone guards) — no DOM, no imports of the app.
//   • RENDER gates (*.test.tsx) that render a component for real with
//     renderToStaticMarkup. A render error is a THROW, so an unrendered branch
//     is an untested one; these cover what a type-checker cannot reach.
// The `@/` alias and the JSX transform are for the second kind — Next owns
// both in the app itself (tsconfig `jsx: preserve`), so vitest states them here
// rather than inheriting a config meant for the bundler.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
  },
});
