import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// THE DEAD-POINTER GUARD
//
// A comment that names a file is a promise that the file is there. The web
// client was retired in Aug 2026, and the comments did not go with it: 116
// references across 79 files still pointed at 96 deleted web files, almost all
// of them some form of "the twin of apps/web/…" or "mirrors apps/web/…".
//
// Two costs, and the second is the expensive one. A reader follows the pointer
// and finds nothing — annoying, recoverable. But every one of those lines also
// asserted a LIVE PARITY OBLIGATION: keep this in step with the other client.
// There is no other client. So the codebase was instructing each new reader,
// in eighty places, to maintain a relationship with something that does not
// exist — which is how a retired decision gets quietly rebuilt.
//
// The references are rewritten (the mobile file is the standard now; where the
// web file was genuinely the provenance, the sentence says so in the past
// tense). This is what stops the next one: a path that looks like a repo path,
// in any source file, must resolve.
//
// SCOPE. Source and stylesheets — the files a reader treats as instructions.
// Not the three corpora that are RECORDS rather than instructions:
//   • reference/ and audit/ — the spec and the audit reports, written on the
//     dates they were written and true about the repo as it stood then.
//   • capabilities.ts — the ledger. Its entries record what shipped, and the
//     project rule is that an entry is retired, never deleted, precisely so
//     the reasoning survives. An entry describing a thing that was built on
//     two clients is not a stale pointer; it is what happened. Rewriting those
//     to hide the web client would be falsifying the log to satisfy a linter.
// ---------------------------------------------------------------------------

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Anything shaped like a repo-relative path to a source file. */
const PATHISH = /\b(?:apps|packages|prisma)\/[\w@.-]+\/[\w[\]@./-]*\.(?:tsx?|css|mjs|prisma)\b/g;

const SKIP_DIRS = new Set(["node_modules", ".next", ".expo", "ios", "android", "dist", ".git", "build"]);
const SKIP_FILES = new Set([join(REPO, "packages", "core", "src", "capabilities.ts")]);
const ROOTS = ["apps/web", "apps/mobile", "packages/core/src"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(p) && !SKIP_FILES.has(p)) out.push(p);
  }
  return out;
}

describe("dead references", () => {
  const files = ROOTS.flatMap((r) => walk(join(REPO, r)));

  it("found the source tree (the scan isn't silently empty)", () => {
    // A guard that walks nothing passes forever. This is the tripwire.
    expect(files.length).toBeGreaterThan(400);
  });

  it("HARD — every repo path named in a comment resolves to a real file", () => {
    const dead: string[] = [];
    for (const f of files) {
      const rel = f.slice(REPO.length + 1);
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        for (const m of line.match(PATHISH) ?? []) {
          // A glob or a directory-with-wildcard is a description, not a pointer.
          if (m.includes("*")) continue;
          if (!existsSync(join(REPO, m))) dead.push(`  ${rel}:${i + 1} → ${m}`);
        }
      });
    }
    expect(
      dead,
      dead.length
        ? "\nThese comments point at files that do not exist. Rewrite the sentence — " +
          "if the file was deleted, say what replaced it or state the provenance in " +
          "the past tense; do not leave a reader following a pointer to nothing:\n" +
          dead.join("\n")
        : "",
    ).toEqual([]);
  });
});
