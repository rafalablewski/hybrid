import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
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
//   • mobile — an entry in lib/nav-href.ts, the id → route table
//
// A deliberate, temporary gap is allowed ONLY if it is recorded in
// capabilities.ts as `planned` or `blocked` (per the capabilities rule), and the
// allow-list below must name the capability that tracks it. So the escape hatch
// is auditable: you cannot quietly ship one client.
// ---------------------------------------------------------------------------

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

const shell = readFileSync(join(APP_ROOT, "components", "app-shell.tsx"), "utf8");
// The mobile route table used to live inside the More tab's springboard; when
// More was replaced by the side menu the table moved to lib/nav-href.ts, which
// is where a routing table belonged all along.
const navHref = readFileSync(join(REPO_ROOT, "apps", "mobile", "lib", "nav-href.ts"), "utf8");

/** Nav ids the web app-shell renders a screen for.
 *  The id class must include the HYPHEN: `volume-model` is a real nav id, and
 *  with a bare [a-z]+ the scan silently skipped BOTH clients' surfaces for it —
 *  a guard that cannot see an id cannot guard it, and the missing mobile
 *  springboard entry it should have caught went unnoticed as a result. */
const webScreens = new Set([...shell.matchAll(/screen === "([a-z-]+)"/g)].map((m) => m[1]!));

/** Nav ids the mobile app has a route for. An id absent from this map is treated
 *  by the side menu as "web-only" and OPENS THE BROWSER — which is precisely the
 *  dead-end this test exists to prevent. */
const mobileRoutes = new Set(
  // Hyphenated ids must be QUOTED as object keys, so the quotes are optional here.
  [...navHref.slice(navHref.indexOf("export const NAV_HREF")).matchAll(/^\s*"?([a-z-]+)"?:\s*"/gm)].map((m) => m[1]!),
);

/**
 * Known, ACCEPTED gaps — each must name the capability that tracks it. Removing
 * a surface from one client without building it on the other means adding an
 * entry here AND a planned/blocked capability, not silently deleting code.
 */
// squad, teamcompare and org used to sit here under `mobile-team-surfaces`;
// they are built on mobile now, and this test's own "listed as an accepted gap
// but now ships on both" assertion is what required removing them. `volume-model`
// followed: the Performance rebuild gave web its own editor route
// (components/aurora/volume-model.tsx) and neither this list nor the
// `volume-model-web` capability was updated, so the guard had been red on main.
const ACCEPTED_GAPS: Record<string, { missing: "web" | "mobile"; capability: string }> = {};

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
      expect(mobileRoutes.has(id), `${id} missing from the mobile route table`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// THE SHEET ELONGATES ON BOTH CLIENTS
//
// A sheet grows to full on one drag up and shortens on the way back. That is
// one behaviour built out of three pieces which are easy to lose one at a time,
// and losing any one of them is silent: the handle still draws, the sheet still
// opens, and only the upward direction quietly stops doing anything.
//   • the panel is laid out at the FULL height and translated down to its stop
//     (a content-SIZED panel has no room above it to grow into),
//   • the stops come from core's `sheetSnaps`, so `0` — full — is always one of
//     them, on both clients,
//   • the drag is claimed in BOTH directions (mobile's PanResponder had a
//     downward-only gate, which is exactly how this would regress).
// ---------------------------------------------------------------------------
describe("the sheet's elongation", () => {
  const webSheet = readFileSync(join(APP_ROOT, "components", "aurora", "sheet.tsx"), "utf8");
  const mobileSheet = readFileSync(join(REPO_ROOT, "apps", "mobile", "components", "aurora", "sheet.tsx"), "utf8");

  it("takes its stops from core on both clients", () => {
    for (const [name, src] of [["web", webSheet], ["mobile", mobileSheet]] as const) {
      expect(src, `${name} sheet no longer reads core's sheetSnaps`).toMatch(/sheetSnaps\(/);
      // A local sort of hand-built detent offsets is how the two drifted before.
      expect(src, `${name} sheet computes its own detent offsets again`).not.toMatch(/detents\[[^\]]+\]\s*\)\s*\.sort/);
    }
  });

  it("lays the panel out at the full height rather than sizing it to content", () => {
    // Web: a fixed vh height on the panel, not a maxHeight that hugs content.
    expect(webSheet).toMatch(/height: `\$\{sheetGesture\.detents\.large \* 100\}vh`/);
    expect(webSheet).not.toMatch(/maxHeight: `\$\{sheetGesture\.detents/);
    // Mobile: the panel's height IS panelH, the same number the dismiss uses.
    expect(mobileSheet).toMatch(/const panelH = Math\.round\(screenH \* sheetGesture\.detents\.large\)/);
    expect(mobileSheet).toMatch(/height: panelH,/);
  });

  it("claims the drag in both directions", () => {
    // The gate was `g.dy > 6` — down only. Up must be claimed too, or the
    // elongation is unreachable however the stops are computed.
    const gate = mobileSheet.match(/onMoveShouldSetPanResponder: \(_, g\) =>([^\n]+)/)?.[1] ?? "";
    expect(gate).toContain("Math.abs(g.dy)");
    expect(gate).not.toMatch(/[^.]\bg\.dy >/);
  });

  it("forgets a held gesture's speed before deciding where to land", () => {
    // Drag up, hold to read what you uncovered, let go — the release must not
    // fire on the velocity from a moment ago and take the sheet away.
    for (const [name, src] of [["web", webSheet], ["mobile", mobileSheet]] as const) {
      expect(src, `${name} sheet releases on a stale velocity`).toMatch(/releaseVelocity\(/);
    }
  });
});

// ---------------------------------------------------------------------------
// A SHEET NEVER RESERVES THE TAB BAR
//
// The rule is old and was already written down: a sheet is presented over the
// bottom bar and covers it, so it must not pad for it. What made that rule
// unobeyable on mobile is that the number it was handed already had the bar in
// it — a screen inside the iOS 26 native tab bar reports a bottom safe-area
// inset of bar + accessory + home indicator, and `sheetPadBottom` MAXes against
// exactly that. Every sheet in the app grew a dead band the height of the bar,
// which is what the second bug report was: "the text disappears behind a black
// element at the bottom".
//
// So the pad's input is now the WINDOW's inset (lib/layout.ts
// `sheetInsetBottom`), and this test holds every mobile sheet surface to it.
// ---------------------------------------------------------------------------
describe("a sheet's bottom pad", () => {
  const MOBILE_ROOT = join(REPO_ROOT, "apps", "mobile");
  const walkTsx = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".expo") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walkTsx(full, out);
      else if (/\.tsx?$/.test(name)) out.push(full);
    }
    return out;
  };

  it("takes the WINDOW's inset on mobile, never the screen's", () => {
    const offenders: string[] = [];
    for (const file of walkTsx(MOBILE_ROOT)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/sheetPadBottom\(([^)]*)\)/g)) {
        const arg = (m[1] ?? "").trim();
        // No argument at all is fine (the pad falls back to its floor); an
        // argument must have gone through sheetInsetBottom.
        if (arg && !arg.startsWith("sheetInsetBottom(")) {
          offenders.push(`${file.split("apps/mobile/")[1]}: sheetPadBottom(${arg})`);
        }
      }
    }
    expect(
      offenders,
      "a sheet covers the tab bar — pass sheetInsetBottom(insets.bottom), not the screen's inset",
    ).toEqual([]);
  });

  it("keeps the pad a MAX against the inset, never a sum", () => {
    // The original bug this token exists for. `insets.bottom + 20` is what put
    // 54dp under every mobile sheet before sheetPadBottom existed.
    const scale = readFileSync(join(REPO_ROOT, "packages", "core", "src", "scale.ts"), "utf8");
    expect(scale).toMatch(/sheetPadBottom = \(insetBottom = 0\) => Math\.max\(/);
  });
});

describe("the stat tile", () => {
  // ONE stat tile per client, and the two agree about which figures MOVE.
  //
  // Web has had a single `Stat` since it was written, so teaching it to roll
  // reached thirty-one screens in one edit. Mobile drew the same anatomy —
  // mono label over a big figure — by hand on every screen, so the same change
  // would have been thirty-one edits and would have drifted again on the next
  // one. Until `AStat` existed there was nothing to sweep onto, which is why
  // the audit could only record the gap rather than close it.
  const webUi = readFileSync(join(APP_ROOT, "lib", "ui.tsx"), "utf8");
  const kit = readFileSync(join(REPO_ROOT, "apps", "mobile", "components", "aurora", "kit.tsx"), "utf8");

  it("exists on both clients", () => {
    expect(webUi, "web lost its shared Stat").toMatch(/export function Stat\(/);
    expect(kit, "mobile has no AStat — the tiles have nothing to sweep onto").toMatch(/export function AStat\(/);
  });

  it("rolls a FIGURE and renders a composed node verbatim, on both", () => {
    // The rule that keeps the clients agreeing about which values travel: a
    // bare string/number is a figure and rolls; a caller-composed tree (a unit,
    // an icon) is rendered as given, because rolling an arbitrary tree is
    // nonsense. Written twice, so it is asserted twice.
    for (const [name, src] of [["web Stat", webUi], ["mobile AStat", kit]] as const) {
      const body = src.slice(src.indexOf(name === "web Stat" ? "export function Stat(" : "export function AStat("));
      expect(body.slice(0, 2000), `${name} must gate the roll on the value's TYPE`)
        .toMatch(/typeof value === "string" \|\| typeof value === "number"/);
      expect(body.slice(0, 2000), `${name} must render the figure through RollingNumber`)
        .toMatch(/RollingNumber/);
    }
  });

  it("reads a leading minus as a LOSS on both clients", () => {
    // The sub-line's sign picks its colour. A tile that coloured a drop green
    // on one client and red on the other would be worse than no colour at all.
    expect(webUi).toMatch(/sub\.startsWith\("−"\)/);
    expect(kit).toMatch(/sub\.startsWith\("−"\)/);
  });
});
