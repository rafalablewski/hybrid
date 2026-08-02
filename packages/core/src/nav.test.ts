import { describe, it, expect } from "vitest";
import {
  NAV_ITEMS,
  navForPersona,
  navForPersonaWithLocks,
  groupedNavWithLocks,
  navVisibleTo,
  resolvePersona,
  effectiveClientChoice,
  sanitizePersonaAccess,
  analyticsScopesFor,
  resolveAnalyticsScope,
  analyticsScopeLabelKey,
  analyticsScopePrivacyKey,
} from "./nav";

describe("navForPersonaWithLocks", () => {
  const find = (rows: ReturnType<typeof navForPersonaWithLocks>, id: string) => rows.find((r) => r.item.id === id);

  it("shows a casual user Full (athlete-tier) items LOCKED, not hidden", () => {
    const rows = navForPersonaWithLocks("casual");
    // performance is minPersona 'athlete' → visible but locked for a free user.
    expect(find(rows, "performance")).toMatchObject({ locked: true });
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
    expect(find(rows, "performance")).toMatchObject({ locked: false });
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

describe("effectiveClientChoice", () => {
  it("drops a free-era 'casual' once the account is paid (the paywall-after-upgrade bug)", () => {
    // The device holds the onboarding answer; the account has since gone paid
    // (bought on another client, restored an IAP, or granted by an admin).
    // That stale answer must NOT keep a paying user on the free surface.
    expect(effectiveClientChoice("casual", false, "paid")).toBeUndefined();
    expect(resolvePersona("client", effectiveClientChoice("casual", false, "paid"), "paid")).toBe("athlete");
  });

  it("honours a 'casual' chosen deliberately WHILE paid (Settings → Simple)", () => {
    expect(effectiveClientChoice("casual", true, "paid")).toBe("casual");
    expect(resolvePersona("client", effectiveClientChoice("casual", true, "paid"), "paid")).toBe("casual");
  });

  it("leaves a free account's choice exactly as stored", () => {
    expect(effectiveClientChoice("casual", false, "free")).toBe("casual");
    expect(effectiveClientChoice("athlete", false, "free")).toBe("athlete");
    expect(resolvePersona("client", effectiveClientChoice("athlete", false, "free"), "free")).toBe("casual");
  });

  it("passes 'athlete' and 'never chosen' straight through", () => {
    expect(effectiveClientChoice("athlete", false, "paid")).toBe("athlete");
    expect(effectiveClientChoice(null, false, "paid")).toBeUndefined();
    expect(effectiveClientChoice(undefined, false, "free")).toBeUndefined();
    // Defaults to the free reading when no entitlement is passed.
    expect(effectiveClientChoice("casual", false)).toBe("casual");
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
    expect(casual).not.toContain("performance");
    expect(casual).not.toContain("velocity");
    expect(navVisibleTo("casual", "performance")).toBe(false);
    expect(navVisibleTo("athlete", "performance")).toBe(true);
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

describe("analytics scopes", () => {
  it("gives a client only their own dashboard", () => {
    expect(analyticsScopesFor("client")).toEqual(["athlete"]);
  });

  it("gives a coach their roster AND their own training (a coach trains too)", () => {
    expect(analyticsScopesFor("coach")).toEqual(["athlete", "coach"]);
  });

  it("gives an admin all three", () => {
    expect(analyticsScopesFor("admin")).toEqual(["athlete", "coach", "operator"]);
  });

  it("never lets a lower role reach a higher scope", () => {
    expect(analyticsScopesFor("client")).not.toContain("coach");
    expect(analyticsScopesFor("client")).not.toContain("operator");
    expect(analyticsScopesFor("coach")).not.toContain("operator");
  });

  it("resolves a held scope the role has lost back to athlete", () => {
    // A coach demoted to client must not stay on the roster dashboard.
    expect(resolveAnalyticsScope("client", "coach")).toBe("athlete");
    expect(resolveAnalyticsScope("client", "operator")).toBe("athlete");
    expect(resolveAnalyticsScope("coach", "operator")).toBe("athlete");
    // A scope the role still holds is kept as-is.
    expect(resolveAnalyticsScope("coach", "coach")).toBe("coach");
    expect(resolveAnalyticsScope("admin", "operator")).toBe("operator");
  });

  it("every scope has a label + privacy string key", () => {
    for (const scope of analyticsScopesFor("admin")) {
      expect(analyticsScopeLabelKey(scope)).toBe(`analytics.scope.${scope}`);
      expect(analyticsScopePrivacyKey(scope)).toBe(`analytics.privacy.${scope}`);
    }
  });
});

describe("promoted destinations", () => {
  const ids = (persona: "athlete" | "admin") =>
    groupedNavWithLocks(persona).flatMap((g) => g.items.map((x) => x.item.id));

  it("keeps a promoted item out of every menu group", () => {
    // Endurance now renders inline as the sport lanes at the bottom of Today,
    // so offering it in More as well would be the same thing twice.
    expect(ids("athlete")).not.toContain("endurance");
    expect(ids("admin")).not.toContain("endurance");
  });

  it("leaves the route, the gate and the registry entry intact", () => {
    // Not a delete: on web the nav id is also the screen id, so the screen has
    // to stay reachable — and its persona gate has to keep meaning something.
    const item = NAV_ITEMS.find((i) => i.id === "endurance");
    expect(item?.promotedTo).toBe("today");
    expect(navVisibleTo("athlete", "endurance")).toBe(true);
    expect(navVisibleTo("casual", "endurance")).toBe(false);
    expect(sanitizePersonaAccess({ endurance: "casual" })).toEqual({ endurance: "casual" });
  });

  it("drops nothing else from the menus", () => {
    const listed = ids("admin");
    for (const item of NAV_ITEMS) {
      if (item.promotedTo) continue;
      expect(listed).toContain(item.id);
    }
  });
});
