/**
 * ARCHITECTURE GUARD — "your best lift" must be the weight actually lifted.
 *
 * Issue #231 moved every headline strength figure from estimated 1RM to the
 * ACTUAL heaviest load, and a follow-up had to do it again for the workout
 * summary (the reveal hero, the per-exercise badge, PR rows, share cards,
 * Cockpit + coach rows) — the same bug twice, because nothing stopped a new
 * screen from reaching for the e1RM helpers and labelling the result "best".
 *
 * e1RM is still correct and still shipped; it is a DERIVED estimate and belongs
 * only where it is labelled as one (the premium "Est. 1RM" fact, the e1RM trend
 * charts, %e1RM intensity zones, the rep-max matrix, the velocity profile, the
 * relative-strength percentile). What it must never be is the unlabelled number
 * an athlete reads as "what I lifted".
 *
 * So: every client reference to the "best e1RM" helpers is listed below with a
 * reason. Adding a new one fails this test on purpose. If the new site really
 * does show a labelled estimate, add it here with a reason. If it is a headline
 * "best", use the topLoad family instead:
 *
 *     blockBestE1rm  → blockTopLoad          (heaviest working set in a block)
 *     bestE1rmByLift → bestTopLoadByLift     (heaviest per lift, all-time)
 *     bestE1rmMap    → topLoadMap            (heaviest per lift, as a Map)
 *
 * e1rmSeries is deliberately NOT guarded: it is a time series, and every
 * consumer plots it under an explicit "e1RM trend" label.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The "best e1RM" helpers — the ones that answer "how strong is this lift". */
const GUARDED = ["blockBestE1rm", "bestE1rmByLift", "bestE1rmMap"] as const;

/**
 * Reviewed client sites, path → why e1RM is the right number there.
 * Paths are repo-relative and use forward slashes.
 */
const REVIEWED: Record<string, string> = {
  // Feeds liftStanding, whose cohort norms are expressed in e1RM per kg of
  // bodyweight — a raw top load can't be compared against them.
  "apps/web/components/aurora/workout-wrapped.tsx":
    "topE1rm → liftStanding (benchmark norms are e1RM-based)",
  "apps/mobile/components/workout-wrapped.tsx":
    "topE1rm → liftStanding (benchmark norms are e1RM-based)",
  // Only picks WHICH lift to chart; the chart itself is titled "<lift> – e1RM".
  "apps/web/components/session-detail.tsx":
    "picks the lift for the explicitly-labelled e1RM trend chart",

  // The post now headlines topLoad; e1rm is still written ALONGSIDE it so the
  // estimate isn't lost and rows stay readable by anything expecting the old
  // shape. prPostFigure prefers topLoad and falls back to a labelled e1RM for
  // rows written before #231 — see the migration tests in social.test.ts.
  "apps/web/app/api/social/posts/route.ts":
    "writes topLoad as the headline; e1rm retained as the labelled estimate",
  // The attestation snapshot stores BOTH figures: topLoad is what the witness
  // is shown ("their Back Squat at 180 kg"); e1rm rides along as the labelled
  // estimate so the record row is complete. See core/attestation.ts.
  "apps/web/app/api/records/attest/route.ts":
    "snapshots topLoad as the witnessed headline; e1rm stored as the labelled estimate",
};

const HERE = dirname(fileURLToPath(import.meta.url));

/** Walk up to the repo root (the dir holding both apps/ and packages/). */
function repoRoot(): string {
  let d = HERE;
  for (let i = 0; i < 10; i++) {
    try {
      if (statSync(join(d, "apps")).isDirectory() && statSync(join(d, "packages")).isDirectory()) return d;
    } catch {
      /* keep walking */
    }
    d = dirname(d);
  }
  throw new Error("repo root not found from " + HERE);
}

const SKIP = new Set(["node_modules", ".next", ".expo", "dist", "build", ".git", "ios", "android"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("e1RM never becomes an unlabelled headline (guards #231)", () => {
  const root = repoRoot();

  it("has no client reference to the best-e1RM helpers outside the reviewed list", () => {
    const offenders: string[] = [];
    for (const app of ["apps/web", "apps/mobile"]) {
      for (const file of sourceFiles(join(root, app))) {
        const src = readFileSync(file, "utf8");
        const hits = GUARDED.filter((s) => new RegExp(`\\b${s}\\b`).test(src));
        if (!hits.length) continue;
        const rel = relative(root, file).split(sep).join("/");
        if (!(rel in REVIEWED)) offenders.push(`${rel} → uses ${hits.join(", ")}`);
      }
    }

    expect(
      offenders,
      offenders.length
        ? `\n\nA client file reads a "best e1RM" helper without review:\n` +
            offenders.map((o) => `  • ${o}`).join("\n") +
            `\n\nIf this is a HEADLINE "best lift", use the actual weight instead:\n` +
            `  blockBestE1rm → blockTopLoad · bestE1rmByLift → bestTopLoadByLift · bestE1rmMap → topLoadMap\n` +
            `If it is a LABELLED estimate, add the path to REVIEWED in ${relative(root, fileURLToPath(import.meta.url))} with a reason.\n`
        : undefined,
    ).toEqual([]);
  });

  it("keeps the reviewed list honest — no stale entries", () => {
    const stale = Object.keys(REVIEWED).filter((rel) => {
      let src: string;
      try {
        src = readFileSync(join(root, rel), "utf8");
      } catch {
        return true; // file moved or deleted
      }
      return !GUARDED.some((s) => new RegExp(`\\b${s}\\b`).test(src));
    });
    expect(stale, `Reviewed entries no longer using a guarded helper — delete them: ${stale.join(", ")}`).toEqual([]);
  });
});
