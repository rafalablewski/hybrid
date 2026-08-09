import { describe, it, expect } from "vitest";
import {
  canCompareWith,
  canEnrolProgram,
  canReviewCoach,
  followsUser,
  isOwnUserPage,
  resolveUserPageTab,
  userPageAction,
  userPagePath,
  userPageRelation,
  userPageTabs,
  userPageUrl,
  userShare,
  type UserPageCoach,
  type UserPageResponse,
} from "./user-page";

const coach = (over: Partial<UserPageCoach> = {}): UserPageCoach => ({
  headline: "Strength for runners",
  bio: null,
  specialties: [],
  sports: [],
  acceptingClients: true,
  priceNote: null,
  rating: 4.5,
  programs: [],
  reviews: [],
  isMyCoach: false,
  linkStatus: null,
  ...over,
});

const page = (over: Partial<UserPageResponse> = {}): UserPageResponse =>
  ({
    profile: {
      userId: "u1", handle: "ada", displayName: "Ada Ruiz", bio: null, avatarUrl: null,
      visibility: "followers", showcase: {}, coachVerified: false, isCoach: false,
    },
    relation: "none",
    followState: "none",
    canViewResults: true,
    stats: null,
    fitnessLevel: null,
    counts: { followers: 3, following: 5 },
    coach: null,
    activity: [],
    ...over,
  }) as UserPageResponse;

describe("userPageRelation", () => {
  it("folds a pending request in — it lives in followState, not relation", () => {
    expect(userPageRelation(page({ relation: "none", followState: "requested" }))).toBe("requested");
  });
  it("keeps the relation when there is no pending request", () => {
    expect(userPageRelation(page({ relation: "friend", followState: "following" }))).toBe("friend");
  });
  it("reads the follow flavours", () => {
    expect(followsUser("close")).toBe(true);
    expect(followsUser("friend")).toBe(true);
    expect(followsUser("follower")).toBe(false);
    expect(isOwnUserPage("self")).toBe(true);
  });
});

describe("userPageTabs", () => {
  it("an athlete has Overview, Activity and People", () => {
    expect(userPageTabs(page()).map((t) => t.id)).toEqual(["overview", "activity", "people"]);
  });
  it("a coach gets the coaching tab, between the person and their training", () => {
    expect(userPageTabs(page({ coach: coach() })).map((t) => t.id)).toEqual(["overview", "coaching", "activity", "people"]);
  });
  it("a private account keeps Overview (the locked notice) and drops Activity", () => {
    expect(userPageTabs(page({ canViewResults: false })).map((t) => t.id)).toEqual(["overview"]);
    expect(userPageTabs(page({ canViewResults: false, coach: coach() })).map((t) => t.id)).toEqual(["overview", "coaching"]);
    // People rides the SAME gate as Activity — a private account's follow graph
    // is no more browsable than its training.
    expect(userPageTabs(page({ canViewResults: false })).map((t) => t.id)).not.toContain("people");
  });
  it("every tab carries a label key rather than English", () => {
    for (const t of userPageTabs(page({ coach: coach() }))) expect(t.labelKey.startsWith("w.user.")).toBe(true);
  });
});

describe("resolveUserPageTab", () => {
  const tabs = userPageTabs(page({ coach: coach() }));
  it("honours a wanted tab that exists", () => {
    expect(resolveUserPageTab(tabs, "coaching")).toBe("coaching");
  });
  it("falls back to Overview when the wanted tab is gone", () => {
    expect(resolveUserPageTab(userPageTabs(page()), "coaching")).toBe("overview");
    expect(resolveUserPageTab(tabs, null)).toBe("overview");
  });
});

describe("the ONE action", () => {
  it("a stranger's page leads with Follow, and it is the primary", () => {
    expect(userPageAction(page())).toMatchObject({ id: "follow", primary: true });
  });
  it("someone who follows me offers Follow back", () => {
    expect(userPageAction(page({ relation: "follower" }))!.labelKey).toBe("w.social.followBack");
  });
  it("a followed page keeps the button but stops urging it", () => {
    const a = userPageAction(page({ relation: "following", followState: "following" }))!;
    expect(a.id).toBe("unfollow");
    expect(a.primary).toBe(false);
  });
  it("a pending request shows Requested, not Follow", () => {
    expect(userPageAction(page({ followState: "requested" }))!.id).toBe("requested");
  });
  it("my own page has no button at all", () => {
    expect(userPageAction(page({ relation: "self" }))).toBeNull();
  });
  it("is ONE control — the coaching jump and share are not page verbs", () => {
    // The first cut returned four buttons above three identically-shaped tab
    // chips. Coaching duplicated a tab that is already on screen; share belongs
    // in the hero rail; compare belongs inside Overview. This asserts the
    // signature that made those impossible: one action, or none.
    const a = userPageAction(page({ coach: coach() }));
    expect(a).not.toBeNull();
    expect(Object.keys(a!)).toEqual(["id", "labelKey", "primary"]);
  });
});

describe("canCompareWith", () => {
  it("sits behind the results gate", () => {
    expect(canCompareWith(page())).toBe(true);
    expect(canCompareWith(page({ canViewResults: false }))).toBe(false);
  });
  it("is absent on your own page — there is no head-to-head with yourself", () => {
    expect(canCompareWith(page({ relation: "self" }))).toBe(false);
  });
});

describe("coaching permissions", () => {
  it("only an active client may review, and never themselves", () => {
    expect(canReviewCoach(page({ coach: coach({ isMyCoach: true }) }))).toBe(true);
    expect(canReviewCoach(page({ coach: coach() }))).toBe(false);
    expect(canReviewCoach(page({ relation: "self", coach: coach({ isMyCoach: true }) }))).toBe(false);
    expect(canReviewCoach(page())).toBe(false);
  });
  it("enrolment needs an open coach, no existing enrolment and someone else's page", () => {
    const p = page({ coach: coach() });
    expect(canEnrolProgram(p, { enrollmentStatus: null })).toBe(true);
    expect(canEnrolProgram(p, { enrollmentStatus: "active" })).toBe(false);
    expect(canEnrolProgram(page({ coach: coach({ acceptingClients: false }) }), { enrollmentStatus: null })).toBe(false);
    expect(canEnrolProgram(page({ relation: "self", coach: coach() }), { enrollmentStatus: null })).toBe(false);
  });
});

describe("addresses", () => {
  it("mobile route, lowercased and escaped", () => {
    expect(userPagePath("Ada")).toBe("/u/ada");
    expect(userPagePath("a b")).toBe("/u/a%20b");
  });
  it("the shared link lands on the person, through the shell's own addressing", () => {
    expect(userPageUrl("Ada")).toBe("https://hybrid.app/app?s=user&u=ada");
  });
  it("the share payload leads with the name, since a chat has no app context", () => {
    expect(userShare({ handle: "ada", displayName: "Ada Ruiz" })).toEqual({
      title: "Ada Ruiz", text: "Ada Ruiz on HYBRID", url: "https://hybrid.app/app?s=user&u=ada",
    });
    expect(userShare({ handle: "ada", displayName: "  " }).title).toBe("@ada");
  });
});
