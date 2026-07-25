import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NAV_ITEMS, CAPABILITIES } from "@hybrid/core";

// ---------------------------------------------------------------------------
// WEB ↔ MOBILE PARITY GUARDRAIL
//
// The project rule: this is ONE product on two clients, so whatever ships for
// web must also ship for mobile and vice versa. That rule was previously only
// prose, and it drifted twice — the Running screen was deleted from web without
// a web Endurance hub to replace it, and Analytics was removed from web while
// mobile had no Analytics screen at all, which left the dashboard with NO live
// surface on either client.
//
// This test makes the rule mechanical. Every canonical nav id must resolve to a
// real surface on BOTH clients:
//   • web    — an app-shell `screen === "<id>"` branch
//   • mobile — an entry in the More springboard's HREF route map
//
// A deliberate, temporary gap is allowed ONLY if it is recorded in
// capabilities.ts as `planned` or `blocked` (per the capabilities rule), and the
// allow-list below must name the capability that tracks it. So the escape hatch
// is auditable: you cannot quietly ship one client.
// ---------------------------------------------------------------------------

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

const shell = readFileSync(join(APP_ROOT, "components", "app-shell.tsx"), "utf8");
const more = readFileSync(join(REPO_ROOT, "apps", "mobile", "app", "(tabs)", "more.tsx"), "utf8");

/** Nav ids the web app-shell renders a screen for. */
const webScreens = new Set([...shell.matchAll(/screen === "([a-z]+)"/g)].map((m) => m[1]!));

/** Nav ids the mobile springboard has a route for. An id absent from this map is
 *  treated by More as "web-only" and OPENS THE BROWSER — which is precisely the
 *  dead-end this test exists to prevent. */
const mobileRoutes = new Set(
  [...more.slice(more.indexOf("const HREF"), more.indexOf("const GROUP_LABEL")).matchAll(/^\s*([a-z]+):\s*"/gm)].map((m) => m[1]!),
);

/**
 * Known, ACCEPTED gaps — each must name the capability that tracks it. Removing
 * a surface from one client without building it on the other means adding an
 * entry here AND a planned/blocked capability, not silently deleting code.
 */
const ACCEPTED_GAPS: Record<string, { missing: "web" | "mobile"; capability: string }> = {
  squad: { missing: "mobile", capability: "mobile-team-surfaces" },
  teamcompare: { missing: "mobile", capability: "mobile-team-surfaces" },
  org: { missing: "mobile", capability: "mobile-team-surfaces" },
};

describe("web ↔ mobile parity", () => {
  it("found both clients' surface maps (the scan itself isn't silently empty)", () => {
    // Guards against a refactor that renames the screen switch or the HREF map
    // and turns every assertion below into a vacuous pass.
    expect(webScreens.size).toBeGreaterThan(20);
    expect(mobileRoutes.size).toBeGreaterThan(20);
  });

  it("every nav item has a surface on BOTH clients (or a tracked gap)", () => {
    const violations: string[] = [];
    for (const { id } of NAV_ITEMS) {
      const onWeb = webScreens.has(id);
      const onMobile = mobileRoutes.has(id);
      const accepted = ACCEPTED_GAPS[id];
      if (onWeb && onMobile) {
        if (accepted) violations.push(`${id}: listed as an accepted gap but now ships on both — remove it from ACCEPTED_GAPS`);
        continue;
      }
      const missing = !onWeb ? "web" : "mobile";
      if (!accepted) {
        violations.push(`${id}: missing on ${missing} — build it there, or record a planned/blocked capability and add it to ACCEPTED_GAPS`);
      } else if (accepted.missing !== missing) {
        violations.push(`${id}: accepted gap says '${accepted.missing}' but it is actually missing on '${missing}'`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("every accepted gap is backed by a planned/blocked capability", () => {
    for (const [id, { capability }] of Object.entries(ACCEPTED_GAPS)) {
      const cap = CAPABILITIES.find((c) => c.id === capability);
      expect(cap, `${id}: no capability '${capability}' in capabilities.ts`).toBeDefined();
      // A gap tracked by a SHIPPED capability is a lie — the work isn't done.
      expect(["planned", "blocked"], `${id}: capability '${capability}' is '${cap!.status}'`).toContain(cap!.status);
    }
  });

  it("Analytics and Endurance ship on both clients", () => {
    // The two surfaces this guardrail was written for — regression-locked by
    // name so a future "make it mobile-only" change has to face this test.
    for (const id of ["analytics", "endurance"]) {
      expect(webScreens.has(id), `${id} missing from web app-shell`).toBe(true);
      expect(mobileRoutes.has(id), `${id} missing from the mobile springboard`).toBe(true);
    }
  });
});
