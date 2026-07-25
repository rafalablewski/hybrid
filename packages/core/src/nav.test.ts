import { describe, it, expect } from "vitest";
import {
  NAV_ITEMS,
  navForPersona,
  navForPersonaWithLocks,
  navVisibleTo,
  resolvePersona,
  sanitizePersonaAccess,
  groupedNavWithLocks,
  isMobileOnlyNav,
  MOBILE_ONLY_NAV,
} from "./nav";

describe("navForPersonaWithLocks", () => {
  const find = (rows: ReturnType<typeof navForPersonaWithLocks>, id: string) => rows.find((r) => r.item.id === id);

  it("shows a casual user Full (athlete-tier) items LOCKED, not hidden", () => {
    const rows = navForPersonaWithLocks("casual");
    // cockpit is minPersona 'athlete' → visible but locked for a free user.
    expect(find(rows, "cockpit")).toMatchObject({ locked: true });
    // today is casual-tier → visible + unlocked.
    expect(find(rows, "today")).toMatchObject({ locked: false });
  });

  it("hides coach/admin-only tools from a casual user (not purchasable via Full)", () => {
    const rows = navForPersonaWithLocks("casual");
    expect(find(rows, "coach")).toBeUndefined();
    expect(find(rows, "squad")).toBeUndefined();
  });

  it("gives a paid athlete the Full items UNLOCKED", () => {
    const rows = navForPersonaWithLocks("athlete");
    expect(find(rows, "cockpit")).toMatchObject({ locked: false });
    // still no coach tools for an athlete
    expect(find(rows, "coach")).toBeUndefined();
  });
});

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
    // A paid client is Full (athlete) BY DEFAULT — paying shouldn't require
    // flipping a separate mode toggle (the Simple/Full switch is retired).
    expect(resolvePersona("client", undefined, "paid")).toBe("athlete");
    // …unless they've EXPLICITLY chosen Simple.
    expect(resolvePersona("client", "casual", "paid")).toBe("casual");
  });

  it("being coached does NOT grant Full — a coached client stays casual", () => {
    // A coach link no longer elevates the persona. A coached client stays casual
    // (free) and only gets a READ-ONLY view of assigned content (surfaced via the
    // separate useHasActiveCoach flag on the clients). Their OWN paid upgrade is
    // the only path to athlete — so a coach link can't be used to obtain Pro free.
    expect(resolvePersona("client", "casual", "free")).toBe("casual");
    expect(resolvePersona("client", undefined, "free")).toBe("casual");
    expect(resolvePersona("client", "athlete", "paid")).toBe("athlete");
  });

  it("entitlement never elevates a coach/admin role and never grants coach to a client", () => {
    // role outranks entitlement
    expect(resolvePersona("coach", "casual", "free")).toBe("coach");
    expect(resolvePersona("admin", "casual", "free")).toBe("admin");
    // a client can no longer self-select the coach surface at all — an invalid
    // choice on a paid account resolves to Full (athlete), never coach.
    // @ts-expect-error "coach" is no longer a valid ClientPersona
    expect(resolvePersona("client", "coach", "paid")).toBe("athlete");
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
    // The lean loop PLUS the universal lightweight tools every user gets:
    // Notifications (activity feed), the Interval timer, Statistics, the
    // per-movement Exercises dashboard (free for all), the user's
    // own Profile, the routine Builder (composing your own workout is free) —
    // and the pre-built Plan library (browse & enroll is free; periodizing it
    // is paid). PLUS the Social surface (everyone): the friends feed, find
    // friends, the friends leaderboard and the coach marketplace. (The public
    // profile lives inside the account Profile screen, not its own nav item.)
    expect(navForPersona("casual").map((i) => i.id).sort()).toEqual(
      ["builder", "calendar", "checkin", "coaches", "discover", "exercises", "feed", "history", "leaderboard", "log", "notifications", "nutrition", "plans", "profile", "progress", "runtrack", "settings", "statistics", "timer", "today"],
    );
  });

  it("casual never sees athlete+ features in nav (the upgrade lives on one page)", () => {
    const casual = navForPersona("casual").map((i) => i.id);
    expect(casual).not.toContain("cockpit");
    expect(casual).not.toContain("velocity");
    expect(navVisibleTo("casual", "cockpit")).toBe(false);
    expect(navVisibleTo("athlete", "cockpit")).toBe(true);
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

describe("mobile-only nav surfaces", () => {
  const ids = (rows: ReturnType<typeof navForPersonaWithLocks>) => rows.map((r) => r.item.id);

  it("drops mobile-only ids for the web client, at every persona", () => {
    for (const persona of ["casual", "athlete", "coach", "admin"] as const) {
      const web = ids(navForPersonaWithLocks(persona, NAV_ITEMS, undefined, "web"));
      for (const id of MOBILE_ONLY_NAV) expect(web).not.toContain(id);
    }
  });

  it("keeps them for mobile (and when no client is given)", () => {
    const mobile = ids(navForPersonaWithLocks("athlete", NAV_ITEMS, undefined, "mobile"));
    const unfiltered = ids(navForPersonaWithLocks("athlete"));
    for (const id of MOBILE_ONLY_NAV) {
      expect(mobile).toContain(id);
      expect(unfiltered).toContain(id);
    }
  });

  it("does not leak a mobile-only id as a LOCKED upsell to a free web user", () => {
    // A casual user sees athlete-tier tools locked rather than hidden — a
    // mobile-only surface must not sneak back in through that path on web.
    const web = navForPersonaWithLocks("casual", NAV_ITEMS, undefined, "web");
    expect(web.some((r) => isMobileOnlyNav(r.item.id))).toBe(false);
  });

  it("drops a group that mobile-only ids emptied, and never empties Analyze", () => {
    const groups = groupedNavWithLocks("athlete", undefined, "web");
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
    // Analyze keeps its web-hosted tools (statistics, volume, trends, ...).
    expect(groups.find((g) => g.group === "analyze")!.items.length).toBeGreaterThan(0);
  });

  it("respects an admin persona override without re-admitting a mobile-only id", () => {
    const web = navForPersonaWithLocks("casual", NAV_ITEMS, { analytics: "casual" }, "web");
    expect(web.map((r) => r.item.id)).not.toContain("analytics");
  });

  it("every mobile-only id is a real nav id", () => {
    for (const id of MOBILE_ONLY_NAV) expect(NAV_ITEMS.some((i) => i.id === id)).toBe(true);
  });
});
