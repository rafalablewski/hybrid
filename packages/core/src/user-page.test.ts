import { describe, it, expect } from "vitest";
import {
  canEnrolProgram,
  canReviewCoach,
  followsUser,
  isOwnUserPage,
  resolveUserPageTab,
  userPageActions,
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
  it("an athlete has Overview + Activity", () => {
    expect(userPageTabs(page()).map((t) => t.id)).toEqual(["overview", "activity"]);
  });
  it("a coach gets the coaching tab, between the person and their training", () => {
    expect(userPageTabs(page({ coach: coach() })).map((t) => t.id)).toEqual(["overview", "coaching", "activity"]);
  });
  it("a private account keeps Overview (the locked notice) and drops Activity", () => {
    expect(userPageTabs(page({ canViewResults: false })).map((t) => t.id)).toEqual(["overview"]);
    expect(userPageTabs(page({ canViewResults: false, coach: coach() })).map((t) => t.id)).toEqual(["overview", "coaching"]);
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

describe("userPageActions", () => {
  it("a stranger's page leads with Follow, and it is the only primary", () => {
    const a = userPageActions(page());
    expect(a[0]).toMatchObject({ id: "follow", primary: true });
    expect(a.filter((x) => x.primary)).toHaveLength(1);
  });
  it("someone who follows me offers Follow back", () => {
    expect(userPageActions(page({ relation: "follower" }))[0].labelKey).toBe("w.social.followBack");
  });
  it("a followed page has no primary — unfollow is never urged", () => {
    const a = userPageActions(page({ relation: "following", followState: "following" }));
    expect(a[0].id).toBe("unfollow");
    expect(a.some((x) => x.primary)).toBe(false);
  });
  it("a pending request shows Requested, not Follow", () => {
    expect(userPageActions(page({ followState: "requested" }))[0].id).toBe("requested");
  });
  it("Compare sits behind the results gate", () => {
    expect(userPageActions(page()).some((x) => x.id === "compare")).toBe(true);
    expect(userPageActions(page({ canViewResults: false })).some((x) => x.id === "compare")).toBe(false);
  });
  it("the coaching jump appears for a coach, and not once you are their client", () => {
    expect(userPageActions(page({ coach: coach() })).some((x) => x.id === "coaching")).toBe(true);
    expect(userPageActions(page({ coach: coach({ isMyCoach: true }) })).some((x) => x.id === "coaching")).toBe(false);
  });
  it("my own page offers only Share — no follow, no compare with myself", () => {
    expect(userPageActions(page({ relation: "self" })).map((x) => x.id)).toEqual(["share"]);
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
