import { describe, it, expect } from "vitest";
import { SIDE_MENU_PRIMARY, SIDE_MENU_FOOTER, SIDE_MENU_ROWS, SIDE_MENU_SCREEN_IDS, SIDE_MENU_NAMED_IDS } from "./side-menu";
import { NAV_ITEMS, groupedNavWithLocks } from "./nav";
import { AURORA_NAV_TABS } from "./nav-bar";
import { TODAY_TABS } from "./today-tabs";
import { baselineString } from "./i18n";

describe("the side menu", () => {
  it("names the six primary destinations, in order", () => {
    expect(SIDE_MENU_PRIMARY.map((r) => r.id)).toEqual([
      "profile", "history", "dashboard", "performance", "feed", "nutrition",
    ]);
  });

  it("keeps the account exits in the footer, smaller and last", () => {
    expect(SIDE_MENU_FOOTER.map((r) => r.id)).toEqual(["connections", "settings", "help"]);
  });

  it("every screen row points at a real nav destination", () => {
    const navIds = new Set(NAV_ITEMS.map((i) => i.id));
    for (const id of SIDE_MENU_SCREEN_IDS) {
      expect(navIds.has(id), `${id} is not a canonical nav id`).toBe(true);
    }
  });

  it("every hub row points at a real Today hub tab", () => {
    const hubIds = new Set(TODAY_TABS.map((t) => t.id));
    for (const row of SIDE_MENU_ROWS) {
      if (row.target.kind !== "hub") continue;
      expect(hubIds.has(row.target.tab), `${row.id} is not a hub tab`).toBe(true);
      // A hub row draws the hub's OWN glyph, so the drawer and the pill row
      // above the calendar mark the same view with the same mark.
      expect(row.hub).toBe(row.target.tab);
    }
  });

  it("gives every row exactly one glyph", () => {
    for (const row of SIDE_MENU_ROWS) {
      expect(Boolean(row.icon) !== Boolean(row.hub), `${row.id} must have icon XOR hub`).toBe(true);
    }
  });

  it("labels resolve in every shipped language rather than falling through to the key", () => {
    for (const lang of ["en", "pl", "de"] as const) {
      for (const row of SIDE_MENU_ROWS) {
        expect(baselineString(lang, row.labelKey), `${row.labelKey} missing in ${lang}`).toBeTruthy();
      }
    }
  });

  it("never lists a row it has already named inside 'All tools'", () => {
    // The expander below the primary list carries the rest of the nav, and the
    // filter that keeps it from repeating the drawer must key on the ROW IDS,
    // not on the screen targets. Performance and Feed are hub rows AND nav ids
    // resolving to the very same component, so a screen-target-only filter
    // printed each of them twice in one panel — once at the top, once under
    // Analyze/Social. Every persona, because the lock state must not change it.
    const named = new Set<string>(SIDE_MENU_NAMED_IDS);
    for (const persona of ["casual", "athlete", "coach", "admin"] as const) {
      const repeated = groupedNavWithLocks(persona)
        .flatMap((g) => g.items)
        .filter(({ item }) => !named.has(item.id))
        .filter(({ item }) => SIDE_MENU_ROWS.some((r) => r.id === item.id))
        .map(({ item }) => item.id);
      expect(repeated, `${persona}: repeated in All tools`).toEqual([]);
    }
  });

  it("does not repeat a bottom-bar tab except the two it deliberately names", () => {
    // The drawer opens FROM the hub, so Today needs no row, and Train is the
    // bar's own CTA. Nutrition and Profile are on the bar AND here on purpose:
    // a menu that names five of the six places you go and omits the sixth
    // reads as an oversight, not as restraint.
    const barIds = new Set(AURORA_NAV_TABS.map((t) => t.id) as string[]);
    const repeated = SIDE_MENU_ROWS.filter((r) => barIds.has(r.id)).map((r) => r.id);
    expect(repeated.sort()).toEqual(["nutrition", "profile"]);
  });
});
