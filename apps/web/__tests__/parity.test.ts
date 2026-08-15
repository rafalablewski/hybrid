import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NAV_ITEMS, CAPABILITIES } from "@hybrid/core";

// ---------------------------------------------------------------------------
// MOBILE NAV COVERAGE GUARDRAIL
//
// This file was the web ↔ mobile parity guard. The web client is retired —
// web ships only the API and the admin panel now, and mobile is the product —
// so "every surface on both clients" is no longer the rule. What remains
// essential is the half that can still drift: every canonical nav id must
// resolve to a REAL mobile route. An id absent from the route table used to be
// treated as "web-only" and opened the browser; with no web app behind it,
// that dead-end now lands on nothing at all.
//
// A deliberate, temporary gap is allowed ONLY if it is recorded in
// capabilities.ts as `planned` or `blocked` (per the capabilities rule), and
// the allow-list below must name the capability that tracks it. So the escape
// hatch stays auditable: you cannot quietly drop a surface.
// ---------------------------------------------------------------------------

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

// The mobile route table used to live inside the More tab's springboard; when
// More was replaced by the side menu the table moved to lib/nav-href.ts, which
// is where a routing table belonged all along.
const navHref = readFileSync(join(REPO_ROOT, "apps", "mobile", "lib", "nav-href.ts"), "utf8");

/** Nav ids the mobile app has a route for. */
const mobileRoutes = new Set(
  // Hyphenated ids must be QUOTED as object keys, so the quotes are optional here.
  [...navHref.slice(navHref.indexOf("export const NAV_HREF")).matchAll(/^\s*"?([a-z-]+)"?:\s*"/gm)].map((m) => m[1]!),
);

/**
 * Known, ACCEPTED gaps — each must name the capability that tracks it.
 * Removing a mobile surface means adding an entry here AND a planned/blocked
 * capability, not silently deleting code.
 */
const ACCEPTED_GAPS: Record<string, { capability: string }> = {};

describe("mobile nav coverage", () => {
  it("found the mobile route table (the scan itself isn't silently empty)", () => {
    // Guards against a refactor that renames the HREF map and turns every
    // assertion below into a vacuous pass.
    expect(mobileRoutes.size).toBeGreaterThan(20);
  });

  it("every nav item has a mobile route (or a tracked gap)", () => {
    const violations: string[] = [];
    for (const { id } of NAV_ITEMS) {
      const onMobile = mobileRoutes.has(id);
      const accepted = ACCEPTED_GAPS[id];
      if (onMobile) {
        if (accepted) violations.push(`${id}: listed as an accepted gap but now ships — remove it from ACCEPTED_GAPS`);
        continue;
      }
      if (!accepted) {
        violations.push(`${id}: no mobile route — build it, or record a planned/blocked capability and add it to ACCEPTED_GAPS`);
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

  it("Analytics and Endurance ship on mobile", () => {
    // The two surfaces the original parity guardrail was written for —
    // regression-locked by name so a future removal has to face this test.
    for (const id of ["analytics", "endurance"]) {
      expect(mobileRoutes.has(id), `${id} missing from the mobile route table`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// THE SHEET ELONGATES
//
// A sheet grows to full on one drag up and shortens on the way back. That is
// one behaviour built out of three pieces which are easy to lose one at a time,
// and losing any one of them is silent: the handle still draws, the sheet still
// opens, and only the upward direction quietly stops doing anything.
//   • the panel is laid out at the FULL height and translated down to its stop
//     (a content-SIZED panel has no room above it to grow into),
//   • the stops come from core's `sheetSnaps`, so `0` — full — is always one of
//     them,
//   • the drag is claimed in BOTH directions (the PanResponder had a
//     downward-only gate, which is exactly how this would regress).
// ---------------------------------------------------------------------------
describe("the sheet's elongation", () => {
  const mobileSheet = readFileSync(join(REPO_ROOT, "apps", "mobile", "components", "aurora", "sheet.tsx"), "utf8");

  it("takes its stops from core", () => {
    expect(mobileSheet, "sheet no longer reads core's sheetSnaps").toMatch(/sheetSnaps\(/);
    // A local sort of hand-built detent offsets is how the clients drifted before.
    expect(mobileSheet, "sheet computes its own detent offsets again").not.toMatch(/detents\[[^\]]+\]\s*\)\s*\.sort/);
  });

  it("lays the panel out at the full height rather than sizing it to content", () => {
    // The panel's height IS panelH, the same number the dismiss uses. It is the
    // `large` detent, and the ONE thing allowed to shorten it is the keyboard:
    // a `fill` sheet that let the KeyboardAvoidingView pad it instead overflowed
    // off the TOP, taking the grab handle, the title and the field with it.
    // Anything else subtracted here means the panel is being sized to what it
    // holds, which is the drift this guard exists for.
    expect(mobileSheet).toMatch(/const panelH = Math\.round\(\s*Math\.min\(screenH \* sheetGesture\.detents\.large, screenH - keyboardH\)\s*\)/);
    expect(mobileSheet).toMatch(/height: panelH,/);
  });

  it("measures the keyboard only for a sheet that FILLS, never for a short one", () => {
    // A short sheet is lifted by the KeyboardAvoidingView and needs no
    // measurement; adding listeners for it would be cost with no effect.
    expect(mobileSheet).toMatch(/useKeyboardHeight\(render && fill\)/);
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
    expect(mobileSheet, "sheet releases on a stale velocity").toMatch(/releaseVelocity\(/);
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

  it("tones the sub-line from the SHARED rule, not a hand-rolled one", () => {
    // A tile that coloured a drop green on one client and red on the other
    // would be worse than no colour at all, so the rule lives in core
    // (`statSubTone`) and both clients read it. Asserting the shared CALL
    // rather than the old inline `sub.startsWith("−")` is the point: the
    // inline version is exactly what drifted, and it is what painted a date
    // in the "good" accent on web.
    for (const [name, src] of [["web Stat", webUi], ["mobile AStat", kit]] as const) {
      expect(src, `${name} must tone its sub through core statSubTone`).toMatch(/statSubTone\(/);
      expect(src, `${name} is hand-rolling the sign rule again`).not.toMatch(/sub\.startsWith\(/);
    }
  });
});
