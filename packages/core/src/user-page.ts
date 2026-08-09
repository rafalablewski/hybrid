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
}

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

/** Overview is always there. Coaching exists only for a coach; Activity only
 *  when the viewer is allowed to see results at all — a private account's page
 *  shows the locked notice on Overview rather than an empty third tab. */
export type UserPageTabId = "overview" | "coaching" | "activity";

export interface UserPageTab {
  id: UserPageTabId;
  /** i18n key — core names the tab, the client speaks the language. */
  labelKey: string;
}

const TAB_LABEL: Record<UserPageTabId, string> = {
  overview: "w.user.tabOverview",
  coaching: "w.user.tabCoaching",
  activity: "w.user.tabActivity",
};

export function userPageTabs(d: Pick<UserPageResponse, "coach" | "canViewResults">): UserPageTab[] {
  const ids: UserPageTabId[] = ["overview"];
  if (d.coach) ids.push("coaching");
  if (d.canViewResults) ids.push("activity");
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

/* ── ACTIONS ─────────────────────────────────────────────────────────────── */

/** The verbs the page offers, in the order both clients render them. */
export type UserPageActionId = "follow" | "unfollow" | "requested" | "compare" | "coaching" | "share";

export interface UserPageAction {
  id: UserPageActionId;
  labelKey: string;
  /** Primary = filled; the rest are ghosts. Exactly one action is ever
   *  primary, so the page has one obvious next move. */
  primary: boolean;
}

/**
 * Which actions this viewer gets on this page.
 *
 * The follow verb is the primary one for a stranger; once you already follow
 * them there is no primary, because "unfollow" is not something a page should
 * be urging. Compare needs their results, so it sits behind the same gate the
 * stats do. Coaching jumps to the coaching tab — it only appears when there is
 * a coaching tab to jump to and the viewer isn't already their client.
 */
export function userPageActions(
  d: Pick<UserPageResponse, "relation" | "followState" | "canViewResults" | "coach">,
): UserPageAction[] {
  const rel = userPageRelation(d);
  const out: UserPageAction[] = [];
  if (rel === "self") {
    out.push({ id: "share", labelKey: "w.user.share", primary: false });
    return out;
  }
  if (rel === "requested") out.push({ id: "requested", labelKey: "w.social.requested", primary: false });
  else if (followsUser(rel)) out.push({ id: "unfollow", labelKey: rel === "following" ? "w.social.following" : "w.social.friends", primary: false });
  else out.push({ id: "follow", labelKey: rel === "follower" ? "w.social.followBack" : "w.social.follow", primary: true });

  if (d.coach && !d.coach.isMyCoach) out.push({ id: "coaching", labelKey: "w.user.seeCoaching", primary: false });
  if (d.canViewResults) out.push({ id: "compare", labelKey: "w.social.compare", primary: false });
  out.push({ id: "share", labelKey: "w.user.share", primary: false });
  return out;
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
