// ─────────────────────────────────────────────────────────────────────────────
// THE INDIVIDUAL USER PAGE — one page per person, coach or not.
//
// WHY THIS FILE EXISTS
// A person had no page. They had two PEEKS, and the two disagreed:
//   • the profile drawer (web ProfileDrawer / mobile ProfileModal) — avatar,
//     bio, three stats, follow. It could only be opened from a row that had
//     already loaded the handle, and it had no address.
//   • the coach storefront (web CoachDetail / mobile CoachModal) — a SECOND
//     surface for the same human, reached only from the Coaches directory,
//     showing their headline, programs and reviews but NONE of their training,
//     level or stats.
// So a coach was two half-people: the athlete you could follow, and the coach
// you could hire, with no way to get from one to the other (the drawer's only
// coaching affordance was a "View coaching →" button that dumped you on the
// marketplace INDEX, not on them).
//
// THE FIX IS ONE PAGE. A coach's page is a normal athlete's page — the same
// head, the same stats, the same activity — plus the coaching the athlete
// doesn't have. Coaching is a SECTION of a person, not a different person.
//
// This module is the pure, client-agnostic half of that page: the response
// shape, which tabs exist for a given payload, which actions the viewer may
// take, and the ONE address the page answers to on each client. Both clients
// import it, so the two can't drift the way the two drawers did.
//
// Clients:  apps/web/components/user-page.tsx   (?s=user&u=<handle>)
//           apps/mobile/app/u/[handle].tsx      (/u/<handle>)
// Server:   apps/web/app/api/social/user/[handle]/route.ts
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ApiError,
  Degradable,
  FeedItemView,
  PersonCard,
  FollowState,
  PublicProfile,
  StorefrontProgram,
  StorefrontReview,
} from "./social-dto";
import type { BadgeAccent, FitnessLevel } from "./engines/fitness-level";
import type { ProfileStats, Relation } from "./social";

/* ── THE PAYLOAD ─────────────────────────────────────────────────────────── */

/** The coaching HALF of a coach's page. Null on an athlete who doesn't coach —
 *  the same field, absent, rather than a second endpoint. */
export interface UserPageCoach {
  headline: string | null;
  /** The coach's PROFESSIONAL bio, which is a different text from the social
   *  bio on the profile above it (a coach writes one for followers and one for
   *  clients). Rendered inside the coaching section, never in place of the
   *  social bio. */
  bio: string | null;
  specialties: string[];
  sports: string[];
  acceptingClients: boolean;
  priceNote: string | null;
  /** Mean of the published reviews, 1 dp — null until someone has reviewed. */
  rating: number | null;
  programs: StorefrontProgram[];
  reviews: StorefrontReview[];
  /** The viewer is an ACTIVE client of this coach. */
  isMyCoach: boolean;
  linkStatus: string | null;
}

/** The social counts under the name. Both are public — who follows whom is not
 *  gated by the results privacy, the same way it isn't on any social product. */
export interface UserPageCounts {
  followers: number;
  following: number;
}

/** GET /api/social/user/[handle] — everything the page paints, in one read. */
export interface UserPageResponse extends Degradable, ApiError {
  profile: PublicProfile;
  relation: Relation | "requested";
  followState: FollowState;
  canViewResults: boolean;
  stats: ProfileStats | null;
  /** One word and its accent — never the ratio behind it. See the public
   *  profile route for why the evidence never travels. */
  fitnessLevel: { level: FitnessLevel; accent: BadgeAccent } | null;
  counts: UserPageCounts;
  coach: UserPageCoach | null;
  /** Their recent posts, chronological, already privacy-gated server-side: an
   *  empty array whenever `canViewResults` is false. Same rows the feed
   *  renders, so a person's page and the stream can't describe one workout two
   *  ways. */
  activity: FeedItemView[];
  /** True when the timeline hit its cap and there is older training the page is
   *  NOT showing. The page says so out loud: a list that stops without saying
   *  it stopped reads as "this is everything they have done", which for an
   *  athlete of ten years is a lie by omission. */
  activityTruncated: boolean;
}

/** GET /api/social/user/[handle]/people?tab=… — one side of someone's follow
 *  graph. Its own read because a page should not pay for a list nobody has
 *  asked to see yet. */
export type PeopleTab = "followers" | "following";

export interface UserPagePeopleResponse extends Degradable, ApiError {
  tab: PeopleTab;
  people: PersonCard[];
  /** More than the page returns. Same honesty rule as the timeline. */
  truncated: boolean;
}

/** How many people one read returns. */
export const PEOPLE_PAGE_MAX = 100;

/* ── RELATION ────────────────────────────────────────────────────────────── */

/** What the page treats as the viewer's standing. `requested` is not a
 *  Relation — it lives in `followState` — and every one of the four surfaces
 *  that showed a person had to remember to fold it in by hand, which is why
 *  the "Requested" button was dead on two of them for a while. Folded here,
 *  once. */
export type UserPageRelation = Relation | "requested";

export function userPageRelation(d: Pick<UserPageResponse, "relation" | "followState">): UserPageRelation {
  return d.followState === "requested" ? "requested" : (d.relation ?? "none");
}

/** Is the viewer looking at their own page? */
export const isOwnUserPage = (rel: UserPageRelation): boolean => rel === "self";

/** Does the viewer already follow them (in any of the follow flavours)? */
export const followsUser = (rel: UserPageRelation): boolean =>
  rel === "following" || rel === "friend" || rel === "close";

/* ── TABS ────────────────────────────────────────────────────────────────── */

/**
 * Overview is always there. Coaching exists only for a coach. Activity and
 * People need the viewer to be allowed to look at all — a private account's
 * page shows the locked notice on Overview rather than a row of empty tabs.
 *
 * PEOPLE is last on purpose: it is the least primary thing about a person, and
 * it is normally reached by tapping the follower counts above rather than by
 * the tab itself. Its gate is the SAME `canViewResults` the stats use, which is
 * a deliberate reading of the existing privacy model rather than a new one —
 * a public account's connections are browsable, a followers-only account shows
 * them to its followers, a private account to nobody.
 */
export type UserPageTabId = "overview" | "coaching" | "activity" | "people";

export interface UserPageTab {
  id: UserPageTabId;
  /** i18n key — core names the tab, the client speaks the language. */
  labelKey: string;
}

const TAB_LABEL: Record<UserPageTabId, string> = {
  overview: "w.user.tabOverview",
  coaching: "w.user.tabCoaching",
  activity: "w.user.tabActivity",
  people: "w.user.tabPeople",
};

export function userPageTabs(d: Pick<UserPageResponse, "coach" | "canViewResults">): UserPageTab[] {
  const ids: UserPageTabId[] = ["overview"];
  if (d.coach) ids.push("coaching");
  if (d.canViewResults) ids.push("activity", "people");
  return ids.map((id) => ({ id, labelKey: TAB_LABEL[id] }));
}

/** The tab a page opens on. A coach reached from the marketplace still opens on
 *  Overview — the person first, then what they sell — but a tab that no longer
 *  exists (a coach who stopped coaching, a page that turned private) falls back
 *  rather than rendering nothing. */
export function resolveUserPageTab(
  tabs: UserPageTab[],
  want: UserPageTabId | null | undefined,
): UserPageTabId {
  return tabs.some((t) => t.id === want) ? (want as UserPageTabId) : "overview";
}

/* ── THE ONE ACTION ──────────────────────────────────────────────────────── */

/**
 * ONE BUTTON. That is the whole rule, and it exists because the first cut broke
 * it: the page carried FOUR buttons (Follow, See coaching, Compare, Share) in a
 * row, immediately above THREE tab chips of the identical shape — seven
 * pill-shaped controls, in two rows, in one costume, where two of the rows were
 * not even the same kind of thing. Buttons act; tabs navigate. Dressing them
 * alike made the page read as a field of equal choices with no centre.
 *
 * So each of the other three was put where it actually belongs:
 *
 *   • SEE COACHING was deleted outright. It navigated to the Coaching TAB —
 *     which is on screen, one row below, already. A second door to a room you
 *     can already see the door to is not an affordance, it is noise.
 *   • COMPARE moved INSIDE Overview, as an expander at the foot of the stats it
 *     fills in. It was never a page-level verb: it doesn't leave, it grows a
 *     panel in place (see the app's exit grammar — bare ＋/− grows, a ringed
 *     glyph leaves), and it belongs beside the figures it compares against.
 *   • SHARE moved to the hero rail's trailing slot, which is the app's own home
 *     for a screen-level utility, and where a share control sits in every OS
 *     the app ships on.
 *
 * What is left is the single verb the page exists to offer: the follow state.
 */
export type UserPageActionId = "follow" | "unfollow" | "requested";

export interface UserPageAction {
  id: UserPageActionId;
  labelKey: string;
  /** Filled and unmissable. Only an OFFER is primary: once you already follow
   *  them the button stays, quietly, because "unfollow" is a thing the page
   *  must let you do and never a thing it should urge. */
  primary: boolean;
}

/** The page's one button — `null` on your own page, which has nothing to offer
 *  you that the rail and the tabs don't already carry. */
export function userPageAction(
  d: Pick<UserPageResponse, "relation" | "followState">,
): UserPageAction | null {
  const rel = userPageRelation(d);
  if (rel === "self") return null;
  if (rel === "requested") return { id: "requested", labelKey: "w.social.requested", primary: false };
  if (followsUser(rel)) {
    return { id: "unfollow", labelKey: rel === "following" ? "w.social.following" : "w.social.friends", primary: false };
  }
  return { id: "follow", labelKey: rel === "follower" ? "w.social.followBack" : "w.social.follow", primary: true };
}

/** Whether Overview offers the head-to-head expander. It reads their results,
 *  so it sits behind the same gate the stats do, and there is nothing to
 *  compare yourself against on your own page. */
export function canCompareWith(
  d: Pick<UserPageResponse, "relation" | "followState" | "canViewResults">,
): boolean {
  return d.canViewResults && userPageRelation(d) !== "self";
}

/** Only an ACTIVE client of the coach may review them, and never themselves —
 *  the same rule the reviews endpoint enforces, stated once so neither client
 *  offers a box the server will reject. */
export function canReviewCoach(d: Pick<UserPageResponse, "relation" | "followState" | "coach">): boolean {
  return !!d.coach?.isMyCoach && userPageRelation(d) !== "self";
}

/** Whether the viewer may still enrol on a coach's program: not their own page,
 *  not already enrolled, and the coach is taking clients. */
export function canEnrolProgram(
  d: Pick<UserPageResponse, "relation" | "followState" | "coach">,
  p: Pick<StorefrontProgram, "enrollmentStatus">,
): boolean {
  if (!d.coach || userPageRelation(d) === "self") return false;
  return !p.enrollmentStatus && d.coach.acceptingClients;
}

/* ── ADDRESSES ───────────────────────────────────────────────────────────── */

/** The production origin, shared with the feed's share links. */
export const USER_PAGE_ORIGIN = "https://hybrid.app";

/** The page's route on MOBILE (expo-router). */
export function userPagePath(handle: string): string {
  return `/u/${encodeURIComponent(handle.toLowerCase())}`;
}

/** The page's address in the WEB shell, whose screens live in the query string
 *  (apps/web/lib/deep-link.ts): `u` names which person is open. */
export function userPageHref(handle: string): string {
  return `/app?s=user&u=${encodeURIComponent(handle.toLowerCase())}`;
}

/** The link a shared profile carries — it lands ON the person. */
export function userPageUrl(handle: string): string {
  return `${USER_PAGE_ORIGIN}${userPageHref(handle)}`;
}

/** What the OS share sheet receives for a person. The name comes first for the
 *  same reason a shared post's does: it lands in a chat where nobody has the
 *  app's context. */
export function userShare(p: { handle: string; displayName?: string | null }): { title: string; text: string; url: string } {
  const name = p.displayName?.trim() || `@${p.handle}`;
  return { title: name, text: `${name} on HYBRID`, url: userPageUrl(p.handle) };
}
