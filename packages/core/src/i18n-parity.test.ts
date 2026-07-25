import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { baselineString, allTranslationKeys } from "./i18n";

/**
 * WEB ↔ MOBILE COPY PARITY GUARD.
 *
 * This is ONE product on two clients, so the same sentence must never live
 * under two different keys — one used only by web, the other only by mobile.
 * When it does, the two copies drift silently: a translator edits one and the
 * other keeps the old wording, and nothing fails. That is exactly what had
 * happened before this test existed — 77 strings were duplicated across the
 * clients, and 20 of them had ALREADY diverged in Polish or German while
 * still reading identically in English, so no English-only review could have
 * caught it. (One was a mistranslation: the Polish for "No sessions logged
 * yet" used "zalogowanych", the logged-IN sense.)
 *
 * The invariant: no English string may be reachable through both a web-only
 * key and a mobile-only key. Shared keys are fine — that is the goal. Keys
 * used by one client only are fine too, as long as no key on the OTHER client
 * says the same thing.
 *
 * If this test fails you have added a duplicate. Point both clients at the one
 * canonical `w.*` key. Only add to ACCEPTED_PER_SCREEN below if the two really
 * must stay separate — see the note on that list.
 */

const APPS = resolve(__dirname, "../../../apps");

/** Scans an app for the keys it uses, returning both the literal `t("…")` keys
 *  and the namespace prefixes it builds at RUNTIME (`` t(`nav.${id}`) ``).
 *
 *  The dynamic prefixes matter: a client that resolves a whole namespace from a
 *  variable never mentions those keys literally, so a literal-only scan would
 *  report them as "used by the other client only" and flag a duplicate that
 *  isn't one. Web renders its nav labels exactly this way. */
function scan(app: string): { literal: Set<string>; dynamicPrefixes: string[] } {
  const literal = new Set<string>();
  const dynamicPrefixes = new Set<string>();
  const walk = (dir: string) => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (name === "node_modules" || name === ".next" || name === ".expo" || name === "dist") continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      if (!/\.(tsx?|jsx?)$/.test(name)) continue;
      const src = readFileSync(p, "utf8");
      // `t("key")` but not `get("…")` / `fmt("…")` / `obj.t("…")`
      for (const m of src.matchAll(/(?<![A-Za-z0-9_$.])t\(\s*"([a-zA-Z0-9_.:-]+)"/g)) literal.add(m[1]);
      for (const m of src.matchAll(/(?<![A-Za-z0-9_$.])t\(\s*`([^`]*)\$\{/g)) {
        if (m[1]) dynamicPrefixes.add(m[1]);
      }
    }
  };
  walk(join(APPS, app));
  return { literal, dynamicPrefixes: [...dynamicPrefixes] };
}

/**
 * Generic one-word labels that each screen legitimately keys for itself.
 * A language may translate the same English word differently depending on what
 * it labels ("blocks" as training blocks vs as a count; "Pause" as a verb vs a
 * noun), so forcing these onto one key would make translation WORSE, not
 * better. Everything here is a single word or a short fragment — if you find
 * yourself adding a whole sentence, that's drift, not context.
 */
const ACCEPTED_PER_SCREEN = new Set([
  "+ Add exercise", "Couldn't save (HTTP ", "Loading…", "PR", "PRs", "Pause",
  "Plans", "SETS", "Saving…", "Starting…", "blocks",
]);

describe("web ↔ mobile copy parity", () => {
  const w = scan("web");
  const m = scan("mobile");
  const dynamic = [...w.dynamicPrefixes, ...m.dynamicPrefixes];
  /** A key is "used" by a client if it names it literally OR resolves its whole
   *  namespace at runtime. */
  const uses = (side: { literal: Set<string> }, k: string) =>
    side.literal.has(k) || dynamic.some((p) => k.startsWith(p));
  const web = w.literal;
  const mobile = m.literal;

  it("finds the t() call sites in both apps", () => {
    // Guards the scanner itself: if a refactor moves or renames things such
    // that this finds nothing, the parity assertion below would pass vacuously.
    expect(web.size).toBeGreaterThan(500);
    expect(mobile.size).toBeGreaterThan(500);
    expect([...web].filter((k) => mobile.has(k)).length).toBeGreaterThan(500);
  });

  it("never says the same thing through a web-only key and a mobile-only key", () => {
    const known = new Set(allTranslationKeys());
    const en = (k: string) => (known.has(k) ? baselineString("en", k) : undefined);

    const webOnly = [...web].filter((k) => !uses(m, k));
    const mobileOnly = [...mobile].filter((k) => !uses(w, k));

    const byEnglish = new Map<string, string[]>();
    for (const k of webOnly) {
      const v = en(k);
      if (v) byEnglish.set(v, [...(byEnglish.get(v) ?? []), k]);
    }

    const duplicates: string[] = [];
    for (const k of mobileOnly) {
      const v = en(k);
      if (!v || ACCEPTED_PER_SCREEN.has(v)) continue;
      const webKeys = byEnglish.get(v);
      if (webKeys) duplicates.push(`"${v}" — web ${webKeys.join(", ")} vs mobile ${k}`);
    }

    expect(duplicates).toEqual([]);
  });
});
