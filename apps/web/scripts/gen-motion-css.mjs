/**
 * Regenerate the motion-token block in app/globals.css from
 * packages/core/src/motion.ts.
 *
 * CSS cannot call JavaScript, so the spring curves have to be pasted in — and a
 * pasted number is exactly the kind of thing that rots silently. Two guards
 * meet here: __tests__/motion-tokens.test.ts FAILS if the stylesheet drifts
 * from core by so much as a millisecond, and this script is how you fix that
 * failure. Never hand-edit the numbers.
 *
 *   node apps/web/scripts/gen-motion-css.mjs        # rewrite the block
 *   node apps/web/scripts/gen-motion-css.mjs --check # exit 1 if it would change
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, "..", "app", "globals.css");
const motionTs = join(here, "..", "..", "..", "packages", "core", "src", "motion.ts");

// Bundle motion.ts to a data URL so we read the REAL tokens rather than a copy.
const out = await build({
  entryPoints: [motionTs],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});
const mod = await import(
  "data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64")
);
const { springs, easings, durations, skeleton, springToCss, springDurationMs } = mod;

const START = "/* ─ GENERATED: motion tokens — node apps/web/scripts/gen-motion-css.mjs ─ */";
const END = "/* ─ END GENERATED ─ */";

const lines = [START, ":root {"];
for (const [name, s] of Object.entries(springs)) {
  const r = String(s.response).replace(/^0/, "");
  const d = s.dampingFraction.toFixed(2).replace(/^0/, "");
  lines.push(`  /* spring.${name} — response ${r} / damping ${d}, settles in ${springDurationMs(s)}ms */`);
  lines.push(`  --e-${name}: ${easings.fade};`);
  lines.push(`  --e-${name}: ${springToCss(s)};`);
  lines.push(`  --d-${name}: ${springDurationMs(s)}ms;`);
}
lines.push("  /* opacity-only — nothing positional, so nothing to interrupt */");
lines.push(`  --e-fade: ${easings.fade};`);
lines.push(`  --e-exit: ${easings.exit};`);
lines.push(`  --d-fast: ${durations.fast}ms;`);
lines.push(`  --d-dissolve: ${durations.dissolve}ms;`);
lines.push(`  --d-collapse: ${durations.collapse}ms;`);
lines.push(`  --d-crossfade: ${durations.crossfade}ms;`);
lines.push("  /* the Reduce Motion cross-dissolve SUBSTITUTION — never zero */");
lines.push(`  --d-reduced: ${durations.reduced}ms;`);
lines.push("  /* the skeleton breath — one rate for both clients */");
lines.push(`  --skel-pulse: ${skeleton.pulseMs}ms;`);
lines.push(`  --skel-dim: ${skeleton.dim};`);
lines.push(`  --skel-bright: ${skeleton.bright};`);
lines.push(`  --skel-still: ${skeleton.still};`);
lines.push("}", END);
const block = lines.join("\n");

const css = readFileSync(cssPath, "utf8");
const a = css.indexOf(START);
const b = css.indexOf(END);
if (a < 0 || b < 0) {
  console.error(`Could not find the generated block markers in globals.css.\nExpected:\n  ${START}\n  …\n  ${END}`);
  process.exit(2);
}
const next = css.slice(0, a) + block + css.slice(b + END.length);

if (process.argv.includes("--check")) {
  if (next !== css) {
    console.error("globals.css motion tokens are STALE — run: node apps/web/scripts/gen-motion-css.mjs");
    process.exit(1);
  }
  console.log("motion tokens in sync");
} else {
  writeFileSync(cssPath, next);
  console.log(`wrote ${Object.keys(springs).length} springs to globals.css`);
}
