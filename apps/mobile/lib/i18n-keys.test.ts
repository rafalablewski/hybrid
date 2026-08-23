import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allTranslationKeys, baselineString } from "@hybrid/core";

/**
 * EVERY KEY A SCREEN ASKS FOR EXISTS.
 *
 * `t()` does not throw on a key it does not know — it returns the key, so a
 * missing string renders as `w.train.sportPage.transfer` in the middle of the
 * UI and every type-checker and test suite stays green. Nothing was watching
 * that gap, and it cost exactly what you would expect: the sport-page redesign
 * retired the keys its own screen had stopped using, one of which the Sport
 * INDEX was still rendering as a badge. Seven rows printed the raw key, and it
 * took a code review to notice.
 *
 * So: scan every source file for `t("literal")` and assert the dictionary holds
 * it. Only literal keys can be checked this way — a handful of call sites build
 * the key at runtime (the record ladder's `w.train.sportPage.${r.name}`), and
 * those are listed below with the keys they can produce, because a guard that
 * silently skips what it cannot parse is a guard you stop trusting.
 */

const ROOT = join(__dirname, "..");
/** The SCREENS and their helpers — not the build config, which is not UI. */
const SCAN = ["app", "components", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".expo", "ios", "android", "dist", "build"]);

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** The file's CODE. A guard that greps prose fires on its own documentation —
 *  this test's first run reported `t("literal")` out of the sentence describing
 *  what it matches. Same idiom as search-surfaces.test.ts. */
const code = (file: string): string =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

/** `t("some.key")` — the literal form, which is nearly all of them. */
const LITERAL = /\bt\(\s*"([a-z][a-zA-Z0-9_.]*)"/g;

/**
 * The keys that are assembled at runtime, and every value they can take. Add to
 * this when you add a template — the point of listing them is that the set is
 * small enough to enumerate, and a template whose arms are not enumerable is a
 * template that should not be built out of a key.
 */
const TEMPLATED: string[] = [
  // sport-page.tsx — rungLabel(): `w.train.sportPage.${r.name}` over the
  // SportBenchmark `name` union.
  "w.train.sportPage.half",
  "w.train.sportPage.marathon",
  // train.tsx — the draft's exercise count, through pluralForm().
  "workout.exercises.one",
  "workout.exercises.few",
  "workout.exercises.many",
  // declare-event.tsx (the kind picker) and calendar.tsx (an unnamed event's
  // fallback name) — `w.home.band.noun.${kind}` over TRAINING_KINDS. The band
  // itself builds the same keys inside core, where this guard cannot see them,
  // which is the other half of why they are enumerated here.
  "w.home.band.noun.gym",
  "w.home.band.noun.running",
  "w.home.band.noun.cycling",
  "w.home.band.noun.swimming",
  "w.home.band.noun.rowing",
  "w.home.band.noun.skiing",
  "w.home.band.noun.walking",
  "w.home.band.noun.sport",
  "w.home.band.noun.other",
  // records-board.tsx — readSentence(): `w.home.rb.read.${kind}` over
  // RecordReadKind, with the three directional kinds taking a pace variant so
  // a run is never told it has been "building".
  "w.home.rb.read.none",
  "w.home.rb.read.thin",
  "w.home.rb.read.first",
  "w.home.rb.read.atBest",
  "w.home.rb.read.climbing",
  "w.home.rb.read.holding",
  "w.home.rb.read.slipping",
  "w.home.rb.read.paceClimbing",
  "w.home.rb.read.paceHolding",
  "w.home.rb.read.paceSlipping",
  // records-board.tsx — the fold's evidence line, through pluralForm().
  "w.home.rb.sessN.one",
  "w.home.rb.sessN.few",
  "w.home.rb.sessN.many",
];

describe("i18n keys", () => {
  const known = new Set(allTranslationKeys());

  it("resolves every literal key the app asks for", () => {
    const missing: string[] = [];
    const files = SCAN.flatMap((d) => sources(join(ROOT, d)));
    // A guard that silently scanned nothing would pass forever.
    expect(files.length).toBeGreaterThan(100);
    for (const file of files) {
      const src = code(file);
      for (const m of src.matchAll(LITERAL)) {
        const key = m[1]!;
        if (!known.has(key)) missing.push(`${file.slice(ROOT.length + 1)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("resolves the keys the runtime templates can build", () => {
    expect(TEMPLATED.filter((k) => !known.has(k))).toEqual([]);
  });

  it("has an ENGLISH string for every key, not just an entry", () => {
    // A key present only in Polish still renders as the key for everyone else.
    const hollow = [...known].filter((k) => (baselineString("en", k) ?? "").length === 0);
    expect(hollow).toEqual([]);
  });
});
