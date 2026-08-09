import { relationTo, canViewResults, profileStats, estimateFitnessLevel, badgeFor, type Visibility } from "@hybrid/core";
import type { BadgeAccent, FitnessLevel, LoggedSession, PublicProfile, ProfileStats, Relation, FollowState } from "@hybrid/core";
import { prisma } from "@/lib/db";
import { edgesFor, allSessionsFor, blockedIdsFor } from "@/lib/social";

/**
 * THE PUBLIC READ of one person — the card, the viewer's standing, and the
 * RESULTS behind the privacy gate.
 *
 * Two endpoints answer for a person now: the light card
 * (/api/social/profile/[handle], still used for handle-availability and by
 * anything that only needs a name) and the whole page
 * (/api/social/user/[handle]). A privacy gate spelled twice is a privacy gate
 * that will eventually be spelled two different ways, so it is spelled here.
 */
export interface PublicProfileRead {
  profile: PublicProfile;
  relation: Relation;
  followState: FollowState;
  canViewResults: boolean;
  stats: ProfileStats | null;
  fitnessLevel: { level: FitnessLevel; accent: BadgeAccent } | null;
  /** The db user id, for callers that need to keep reading (activity, coach). */
  userId: string;
  /**
   * The athlete's own history, as loaded for the stats — null behind the
   * privacy gate.
   *
   * Handed back rather than thrown away because the TIMELINE is built from it.
   * That is not an optimisation, it is a correctness requirement:
   * `buildSocialFeed` decides whether a session set a record by comparing it
   * against everything EARLIER IN THE ARRAY IT IS GIVEN, so a page built from
   * only an older slice would judge its oldest session against nothing and
   * invent a first-ever PR. Building every page from the one full history keeps
   * the badges honest — and costs one query fewer than the windowed read it
   * replaced, since this load was already happening for the stats.
   */
  sessions: LoggedSession[] | null;
}

/** `null` means "not found" as far as the viewer is concerned — including the
 *  case where a block exists in either direction, which hides the profile
 *  entirely rather than admitting it is there. */
export async function loadPublicProfile(viewerId: string, handle: string): Promise<PublicProfileRead | null> {
  const profile = await prisma.socialProfile.findUnique({
    where: { handle: handle.toLowerCase() },
    include: { user: { select: { id: true, name: true, coachVerified: true, role: true } } },
  });
  if (!profile) return null;

  const blocked = await blockedIdsFor(viewerId);
  if (blocked.has(profile.userId)) return null;

  const edges = await edgesFor(viewerId);
  const relation = relationTo(viewerId, profile.userId, edges);
  const canView = canViewResults(profile.visibility as Visibility, relation);

  // pending request state (I asked to follow a private account)
  const myEdge = edges.find((e) => e.followerId === viewerId && e.followeeId === profile.userId);

  // The sessions are fetched once and read twice — the public stats, and the
  // earned level badge. Both sit behind the SAME `canView` gate, so a private
  // account's level never leaves the server rather than being filtered by a
  // client that could simply choose not to filter it.
  const sessions = canView ? await allSessionsFor(profile.userId) : null;
  const stats = sessions ? profileStats(sessions) : null;

  // Body mass makes the strength half readable; without it the estimate still
  // scores every endurance discipline, so a runner or swimmer keeps a badge.
  const bw = sessions
    ? (await prisma.bodyMetric.findFirst({
        where: { userId: profile.userId, weightKg: { not: null } },
        orderBy: { measuredAt: "desc" },
        select: { weightKg: true },
      }))?.weightKg ?? null
    : null;
  // SEX, so the public badge is scored against the same bar the athlete's own
  // Performance card uses. Every threshold in the app is published for a male
  // athlete and shifted from there, and without this the server would hold a
  // woman to the men's bar while her own card holds her to the women's — the
  // two surfaces disagreeing about her level, which is precisely what one
  // shared estimate exists to prevent.
  //
  // Read from the talent profile because it is the only place sex is
  // PERSISTED; the volume profile lives in each device's own prefs and the
  // server cannot see it. The durable fix is persisting the volume profile
  // server-side — until then a woman who filled in only the volume profile
  // gets the right level on her own card and no worse than the old behaviour
  // in public.
  const talent = sessions
    ? await prisma.talentProfile.findUnique({ where: { userId: profile.userId }, select: { sex: true } })
    : null;
  // ONE WORD and its accent. The ratio never travels — PR loads are already
  // public tiles, and publishing the ratio beside them would let any viewer
  // divide and recover the athlete's body mass.
  const badge = sessions
    ? badgeFor(estimateFitnessLevel(sessions, { bodyweightKg: bw, sex: talent?.sex === "F" ? "F" : "M" }))
    : null;

  return {
    profile: {
      userId: profile.userId,
      handle: profile.handle,
      displayName: profile.displayName ?? profile.user.name,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      visibility: profile.visibility,
      showcase: (profile.showcase ?? {}) as Record<string, unknown>,
      coachVerified: profile.user.coachVerified,
      isCoach: profile.user.role === "COACH",
    },
    relation,
    followState: myEdge ? (myEdge.status === "pending" ? "requested" : myEdge.closeFriend ? "close" : "following") : "none",
    canViewResults: canView,
    stats,
    fitnessLevel: badge ? { level: badge.level, accent: badge.accent } : null,
    userId: profile.userId,
    sessions,
  };
}
