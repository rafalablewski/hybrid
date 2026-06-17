import { describe, it, expect } from "vitest";
import {
  NAV_ITEMS,
  navForPersona,
  navVisibleTo,
  navIsUpsell,
  upsellNavItems,
  sanitizeUpsellNav,
  resolvePersona,
  sanitizePersonaAccess,
} from "./nav";

describe("persona resolution", () => {
  it("derives coach/admin personas from the role, ignoring the client choice", () => {
    expect(resolvePersona("coach")).toBe("coach");
    expect(resolvePersona("coach", "casual")).toBe("coach");
    expect(resolvePersona("admin")).toBe("admin");
  });

  it("a client is casual by default, and only reaches athlete when paid", () => {
    expect(resolvePersona("client")).toBe("casual");
    expect(resolvePersona("client", "casual")).toBe("casual");
    // Full (athlete) is a paid upgrade — choosing it without a paid entitlement
    // does NOT unlock the athlete surface.
    expect(resolvePersona("client", "athlete")).toBe("casual");
    expect(resolvePersona("client", "athlete", "free")).toBe("casual");
    expect(resolvePersona("client", "athlete", "paid")).toBe("athlete");
    // A paid entitlement alone doesn't force Full — the client still chooses it.
    expect(resolvePersona("client", "casual", "paid")).toBe("casual");
  });

  it("entitlement never elevates a coach/admin role and never grants coach to a client", () => {
    // role outranks entitlement
    expect(resolvePersona("coach", "casual", "free")).toBe("coach");
    expect(resolvePersona("admin", "casual", "free")).toBe("admin");
    // a client can no longer self-select the coach surface at all
    // @ts-expect-error "coach" is no longer a valid ClientPersona
    expect(resolvePersona("client", "coach", "paid")).toBe("casual");
  });
});

describe("navForPersona", () => {
  it("hides athlete/coach depth from a casual retail user", () => {
    const ids = navForPersona("casual").map((i) => i.id);
    // lean set he keeps
    expect(ids).toContain("today");
    expect(ids).toContain("log");
    expect(ids).toContain("history");
    expect(ids).toContain("nutrition");
    expect(ids).toContain("settings");
    // depth + console he should NOT see
    expect(ids).not.toContain("velocity");
    expect(ids).not.toContain("periodize");
    expect(ids).not.toContain("coach");
    expect(ids).not.toContain("squad");
  });

  it("casual (Average Joe) is exactly the curated lean set — the done deal", () => {
    expect(navForPersona("casual").map((i) => i.id).sort()).toEqual(
      ["calendar", "checkin", "history", "log", "nutrition", "progress", "settings", "today"],
    );
  });

  it("freemium funnel: Cockpit is a LOCKED upsell for casual, the real thing for athlete+", () => {
    // casual can't actually see it, but it's teased (locked) rather than hidden
    expect(navVisibleTo("casual", "cockpit")).toBe(false);
    expect(navIsUpsell("casual", "cockpit")).toBe(true);
    expect(upsellNavItems("casual").map((i) => i.id)).toEqual(["cockpit"]);
    // athlete/coach/admin have it for real — nothing to upsell
    expect(navIsUpsell("athlete", "cockpit")).toBe(false);
    expect(upsellNavItems("athlete")).toEqual([]);
    expect(upsellNavItems("coach")).toEqual([]);
    // a non-funnel locked item (e.g. velocity) is NOT teased — stays hidden
    expect(navIsUpsell("casual", "velocity")).toBe(false);
  });

  it("admin can configure the casual locked set (access.upsellNav)", () => {
    // admin adds Velocity as a casual bait and drops Cockpit
    const cfg = ["velocity"];
    expect(navIsUpsell("casual", "velocity", undefined, cfg)).toBe(true);
    expect(navIsUpsell("casual", "cockpit", undefined, cfg)).toBe(false);
    expect(upsellNavItems("casual", undefined, undefined, cfg).map((i) => i.id)).toEqual(["velocity"]);
    // an item visible to casual is never an upsell, even if listed
    expect(navIsUpsell("casual", "today", undefined, ["today"])).toBe(false);
    // sanitizer keeps only known nav ids; non-arrays → []
    expect(sanitizeUpsellNav(["cockpit", "bogus", 42])).toEqual(["cockpit"]);
    expect(sanitizeUpsellNav("nope")).toEqual([]);
    expect(sanitizeUpsellNav([])).toEqual([]);
  });

  it("nests: each persona sees everything the lower one does, plus more", () => {
    const casual = new Set(navForPersona("casual").map((i) => i.id));
    const athlete = new Set(navForPersona("athlete").map((i) => i.id));
    const coach = new Set(navForPersona("coach").map((i) => i.id));
    const admin = new Set(navForPersona("admin").map((i) => i.id));

    for (const id of casual) expect(athlete.has(id)).toBe(true);
    for (const id of athlete) expect(coach.has(id)).toBe(true);
    for (const id of coach) expect(admin.has(id)).toBe(true);

    // strictly growing
    expect(athlete.size).toBeGreaterThan(casual.size);
    expect(coach.size).toBeGreaterThan(athlete.size);
    // admin sees the whole map
    expect(admin.size).toBe(NAV_ITEMS.length);
  });

  it("athlete gets the depth but not the coaching console", () => {
    const ids = navForPersona("athlete").map((i) => i.id);
    expect(ids).toContain("velocity");
    expect(ids).toContain("periodize");
    expect(ids).toContain("sport");
    expect(ids).not.toContain("coach");
    expect(ids).not.toContain("squad");
  });

  it("coach gets the console on top of the athlete depth", () => {
    const ids = navForPersona("coach").map((i) => i.id);
    expect(ids).toContain("coach");
    expect(ids).toContain("squad");
    expect(ids).toContain("velocity"); // still an athlete themselves
  });
});

describe("admin PersonaAccess overrides", () => {
  it("an admin can drop a feature to casual so a retail user sees it", () => {
    const access = { velocity: "casual" as const };
    expect(navVisibleTo("casual", "velocity")).toBe(false); // code default
    expect(navVisibleTo("casual", "velocity", access)).toBe(true); // overridden
    expect(navForPersona("casual", undefined, access).map((i) => i.id)).toContain("velocity");
  });

  it("an admin can raise a feature to hide it from a persona", () => {
    const access = { today: "athlete" as const };
    expect(navVisibleTo("casual", "today")).toBe(true);
    expect(navVisibleTo("casual", "today", access)).toBe(false);
  });

  it("sanitizePersonaAccess keeps only known ids mapped to valid personas", () => {
    const clean = sanitizePersonaAccess({
      velocity: "casual",
      today: "bogus",
      "not-an-id": "athlete",
      coach: "coach",
      junk: 5,
    });
    expect(clean).toEqual({ velocity: "casual", coach: "coach" });
    expect(sanitizePersonaAccess(null)).toEqual({});
    expect(sanitizePersonaAccess("nope")).toEqual({});
  });
});

describe("navVisibleTo", () => {
  it("matches navForPersona for individual ids", () => {
    expect(navVisibleTo("casual", "velocity")).toBe(false);
    expect(navVisibleTo("athlete", "velocity")).toBe(true);
    expect(navVisibleTo("casual", "today")).toBe(true);
    expect(navVisibleTo("coach", "squad")).toBe(true);
    expect(navVisibleTo("athlete", "squad")).toBe(false);
    expect(navVisibleTo("casual", "not-a-real-id")).toBe(false);
  });
});
