// Reads packages/core/src/capabilities.ts and emits a SessionStart
// `additionalContext` block listing every capability still PLANNED
// (acknowledged but not built) or BLOCKED (built, waiting on a credential /
// decision). Surfacing it at the start of every session is what stops
// acknowledged-but-unbuilt work from getting lost between the web's ephemeral
// sessions. Pure string/regex — no build step, no dependencies.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.CLAUDE_PROJECT_DIR || resolve(here, "../..");

let src = "";
try {
  src = readFileSync(resolve(root, "packages/core/src/capabilities.ts"), "utf8");
} catch {
  process.exit(0); // no registry → nothing to surface
}

// First double-quoted value for `key:` on a line (handles escaped quotes).
const field = (line, key) => {
  const m = line.match(new RegExp(key + ':\\s*"((?:[^"\\\\]|\\\\.)*)"'));
  return m ? m[1].replace(/\\"/g, '"') : "";
};

const planned = [];
const blocked = [];
for (const line of src.split("\n")) {
  // Match the real `status` FIELD only — it's always immediately followed by a
  // comma (`status: "planned", title: …`). Requiring the comma stops prose in a
  // `detail` string that merely mentions status:"planned"/"blocked" (like this
  // hook's own entry) from being mis-counted as backlog.
  if (/status:\s*"planned"\s*,/.test(line)) {
    planned.push({ id: field(line, "id"), title: field(line, "title") });
  } else if (/status:\s*"blocked"\s*,/.test(line)) {
    blocked.push({ id: field(line, "id"), title: field(line, "title"), by: field(line, "blockedBy") });
  }
}

if (!planned.length && !blocked.length) process.exit(0);

const out = [];
out.push("# HYBRID open backlog (from packages/core/src/capabilities.ts)");
out.push("Surfaced automatically at session start so acknowledged-but-unbuilt work isn't lost between sessions. Per the project rule: when you defer something, record it here as a `planned` entry — don't bury it in prose.");
out.push("");
if (planned.length) {
  out.push(`## PLANNED — not built yet (${planned.length})`);
  for (const p of planned) out.push(`- [${p.id}] ${p.title}`);
  out.push("");
}
if (blocked.length) {
  out.push(`## BLOCKED — built, waiting on a credential/decision (${blocked.length})`);
  for (const b of blocked) {
    const by = b.by ? ` — needs: ${b.by.length > 130 ? b.by.slice(0, 130) + "…" : b.by}` : "";
    out.push(`- [${b.id}] ${b.title}${by}`);
  }
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: out.join("\n") },
}));
