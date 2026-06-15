import { describe, it, expect } from "vitest";
import {
  NAV_ITEMS,
  navForPersona,
  navVisibleTo,
  resolvePersona,
  sanitizePersonaAccess,
} from "./nav";

describe("persona resolution", () => {
  it("derives coach/admin personas from the role, ignoring the client choice", () => {
    expect(resolvePersona("coach")).toBe("coach");
    expect(resolvePersona("coach", "casual")).toBe("coach");
    expect(resolvePersona("admin")).toBe("admin");
  });

  it("a client is casual by default and athlete when they choose it", () => {
    expect(resolvePersona("client")).toBe("casual");
    expect(resolvePersona("client", "casual")).toBe("casual");
    expect(resolvePersona("client", "athlete")).toBe("athlete");
  });

  it("a client can self-serve opt into the coach experience", () => {
    expect(resolvePersona("client", "coach")).toBe("coach");
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
