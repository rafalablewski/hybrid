import { describe, it, expect } from "vitest";
import {
  ACCOUNT_NOTIF_DEFAULTS,
  ACCOUNT_NOTIF_ROWS,
  PUSH_KINDS,
  PUSH_PREF_KEY,
  PUSH_ROUTE,
  NUDGE_GIVE_UP,
  NUDGE_HOUR,
  NUDGE_WINDOW_HOURS,
  checkinNudgePush,
  coachAssignmentPush,
  cosignRequestPush,
  normalizePushKind,
  normalizePushRoute,
  nudgeDecision,
  type NudgeInput,
} from "./index";

describe("the three notifications, and only three", () => {
  it("ships exactly three kinds", () => {
    // The ratchet on the whole feature: "ship exactly three notifications first
    // and nothing else until those prove themselves". A fourth kind has to come
    // through this test, which means through a decision.
    expect(PUSH_KINDS).toEqual(["checkin", "coach", "cosign"]);
  });

  it("gives every kind a route and a preference switch", () => {
    for (const kind of PUSH_KINDS) {
      expect(PUSH_ROUTE[kind]).toMatch(/^\/[a-z-]+$/);
      expect(PUSH_PREF_KEY[kind]).toBeTruthy();
    }
  });

  it("matches each preference key to a real account switch", () => {
    // A gate the sender applies against a key no athlete can see is a channel
    // that cannot be turned off. Both directions: no orphan switch either.
    const rows = ACCOUNT_NOTIF_ROWS.map((r) => r.key).sort();
    expect(Object.values(PUSH_PREF_KEY).sort()).toEqual(rows);
    expect(Object.keys(ACCOUNT_NOTIF_DEFAULTS).sort()).toEqual(rows);
  });

  it("defaults every notification switch ON", () => {
    // Three notifications, each about something that happened to the athlete —
    // the OS permission prompt is the opt-in, not a second set of switches.
    for (const key of Object.values(PUSH_PREF_KEY)) expect(ACCOUNT_NOTIF_DEFAULTS[key]).toBe(true);
  });
});

describe("the copy", () => {
  it("renders the morning nudge, collapsed so two mornings can't stack", () => {
    const m = checkinNudgePush();
    expect(m.kind).toBe("checkin");
    expect(m.route).toBe("/checkin");
    expect(m.collapseId).toBeTruthy();
    expect(m.title.length).toBeGreaterThan(0);
  });

  it("names the coach and the session, and survives a missing day label", () => {
    const dated = coachAssignmentPush({ coach: "Ada", session: "Upper A", when: "Monday" });
    expect(dated.title).toContain("Ada");
    expect(dated.body).toBe("Upper A – Monday");
    // Never collapsed: two assignments are two facts, not a repeated one.
    expect(dated.collapseId).toBeUndefined();
    expect(coachAssignmentPush({ coach: "Ada", session: "Upper A" }).body).toBe("Upper A");
  });

  it("falls back to a generic actor rather than leaving a hole", () => {
    expect(coachAssignmentPush({ coach: "   ", session: "Upper A" }).title).toContain("Your coach");
    expect(cosignRequestPush({ from: "", lift: "Squat" }).body).toContain("Someone");
  });

  it("drops the load when there isn't one", () => {
    const withLoad = cosignRequestPush({ from: "@ada", lift: "Squat", load: "180 kg" });
    expect(withLoad.body).toContain("180 kg");
    const without = cosignRequestPush({ from: "@ada", lift: "Squat" });
    expect(without.body).toContain("Squat");
    expect(without.body).not.toMatch(/\bat\b\s*\./);
  });

  it("localizes off the device's reported language", () => {
    const pl = checkinNudgePush({ lang: "pl" });
    const en = checkinNudgePush({ lang: "en" });
    expect(pl.title).not.toBe(en.title);
    // Placeholders are filled in every language, never shipped raw.
    for (const lang of ["en", "pl", "de"] as const) {
      const m = coachAssignmentPush({ coach: "Ada", session: "Upper A", when: "Monday", lang });
      const c = cosignRequestPush({ from: "@ada", lift: "Squat", load: "180 kg", lang });
      expect(m.title + m.body).not.toMatch(/[{}]/);
      expect(c.title + c.body).not.toMatch(/[{}]/);
      expect(m.title).toContain("Ada");
    }
  });

  it("uses no middot anywhere in the copy", () => {
    const all = [
      checkinNudgePush(),
      coachAssignmentPush({ coach: "Ada", session: "Upper A", when: "Monday" }),
      cosignRequestPush({ from: "@ada", lift: "Squat", load: "180 kg" }),
    ];
    for (const m of all) expect(m.title + m.body).not.toMatch(/[·•|]/);
  });
});

describe("payload coercion", () => {
  it("accepts only the routes push publishes", () => {
    expect(normalizePushRoute("/checkin")).toBe("/checkin");
    expect(normalizePushRoute("/feed")).toBe("/feed");
    // A route is a navigation instruction arriving over the network.
    expect(normalizePushRoute("/admin")).toBeNull();
    expect(normalizePushRoute("https://evil.example/x")).toBeNull();
    expect(normalizePushRoute(42)).toBeNull();
    expect(normalizePushRoute(undefined)).toBeNull();
  });

  it("coerces the kind", () => {
    expect(normalizePushKind("coach")).toBe("coach");
    expect(normalizePushKind("streak")).toBeNull();
    expect(normalizePushKind(null)).toBeNull();
  });
});

describe("the morning nudge's clock", () => {
  const base: NudgeInput = {
    localHour: NUDGE_HOUR,
    localDay: "2026-08-17",
    lastCheckinDay: "2026-08-16",
    lastNudgeDay: null,
    nudgeStreak: 0,
    active: true,
  };

  it("sends at the athlete's own 07:00", () => {
    expect(nudgeDecision(base).send).toBe(true);
  });

  it("stays quiet before the window and after it", () => {
    expect(nudgeDecision({ ...base, localHour: NUDGE_HOUR - 1 }).send).toBe(false);
    expect(nudgeDecision({ ...base, localHour: NUDGE_HOUR + NUDGE_WINDOW_HOURS }).send).toBe(true);
    expect(nudgeDecision({ ...base, localHour: NUDGE_HOUR + NUDGE_WINDOW_HOURS + 1 }).send).toBe(false);
    // Hour 2 is the failure the timezone column exists to prevent.
    expect(nudgeDecision({ ...base, localHour: 2 }).send).toBe(false);
  });

  it("never nudges about a read already given today", () => {
    const d = nudgeDecision({ ...base, lastCheckinDay: base.localDay });
    expect(d.send).toBe(false);
    expect(d.why).toContain("already checked in");
  });

  it("never nudges twice in one local day", () => {
    // The window spans hours so a missed cron run doesn't cost the day — which
    // means the same day must be blocked by the last-nudge stamp, not the hour.
    const sent = nudgeDecision(base);
    expect(sent.send).toBe(true);
    const again = nudgeDecision({
      ...base,
      localHour: NUDGE_HOUR + 1,
      lastNudgeDay: base.localDay,
      nudgeStreak: sent.streak,
    });
    expect(again.send).toBe(false);
    expect(again.why).toContain("already nudged");
  });

  it("says nothing to an account with no history", () => {
    expect(nudgeDecision({ ...base, active: false }).send).toBe(false);
  });

  it("counts unanswered mornings and gives up", () => {
    let streak = 0;
    let day = 17;
    for (let i = 0; i < NUDGE_GIVE_UP; i++) {
      const d = nudgeDecision({
        ...base,
        localDay: `2026-08-${day}`,
        lastCheckinDay: "2026-08-16",
        lastNudgeDay: i === 0 ? null : `2026-08-${day - 1}`,
        nudgeStreak: streak,
      });
      expect(d.send).toBe(true);
      streak = d.streak;
      day++;
    }
    expect(streak).toBe(NUDGE_GIVE_UP);
    const done = nudgeDecision({
      ...base,
      localDay: `2026-08-${day}`,
      lastNudgeDay: `2026-08-${day - 1}`,
      nudgeStreak: streak,
    });
    expect(done.send).toBe(false);
    expect(done.why).toContain("stopped asking");
  });

  it("restarts the moment the athlete checks in again", () => {
    // A check-in AFTER the last nudge is an answer: the count is over, and the
    // loop is available again the next morning.
    const answered = nudgeDecision({
      ...base,
      localDay: "2026-08-25",
      lastNudgeDay: "2026-08-24",
      lastCheckinDay: "2026-08-25",
      nudgeStreak: NUDGE_GIVE_UP,
    });
    expect(answered.send).toBe(false); // checked in today already
    expect(answered.streak).toBe(0);
    const next = nudgeDecision({
      ...base,
      localDay: "2026-08-26",
      lastNudgeDay: "2026-08-24",
      lastCheckinDay: "2026-08-25",
      nudgeStreak: NUDGE_GIVE_UP,
    });
    expect(next.send).toBe(true);
    expect(next.streak).toBe(1);
  });
});
