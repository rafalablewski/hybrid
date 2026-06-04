import { defineConfig } from "vitest/config";

// Node-environment tests only (security static scans). These read the source
// tree with fs — no JSX/DOM transform needed — so they stay fast and isolated.
export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
});
