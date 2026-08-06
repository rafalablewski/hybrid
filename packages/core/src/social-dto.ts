/**
 * WIRE DTOs — the JSON response shapes of the social + coach-marketplace API as
 * they arrive over the wire (Prisma `DateTime`s are ISO strings here, not Date),
 * consumed by BOTH clients so web (jget/jsend) and mobile (sapi wrappers) stop
 * annotating responses as `any`. The route handlers under
 * apps/web/app/api/{social,coach,coaches} are the source of truth; these
 * interfaces describe that contract.
 *
 * Two cross-cutting facts folded into the types as optionals, so the clients'
 * existing `.error` checks and `?? []` fallbacks typecheck without narrowing:
 *   • any handler may return `{ error }` instead of its success body;
 *   • list/profile endpoints add `unavailable` when a table isn't migrated yet.
 */
import type { FeedReason } from "./feed-rank";
import type { LiveAthlete } from "./feed-live";
import type {
  FeedItem,
  ProfileStats,
  Relation,
  CompareResult,
  LeaderRow,
  LeaderboardMetric,
} from "./social";

/** Present on any response when the handler errored (clients check it after mutations). */
export interface ApiError {
  error?: string;
}
/** Present on list/profile responses when the backing table isn't migrated yet. */
export interface Degradable {
  unavailable?: boolean;
}

/** Compact person/author card (the server's AuthorCard). */
export interface ApiAuthor {
  id: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

// ---- social feed -----------------------------------------------------------

/** A feed item enriched with the viewer's kudos/comment state. */
export interface FeedItemView extends FeedItem {
  kudos: number;
  comments: number;
  kudosedByMe: boolean;
  mine: boolean;
  /** Why this card is in a RANKED feed, when the viewer doesn't already follow
   *  the author (core/feed-rank.ts). Absent means "no explanation needed". */
  reason?: FeedReason;
}
export interface FeedResponse extends Degradable, ApiError {
  feed: FeedItemView[];
  /** Who is mid-session right now (core/feed-live.ts). Absent or empty when
   *  nobody is — the strip hides rather than showing a void. */
  live?: LiveAthlete[];
}

export interface KudosResponse extends ApiError {
  kudos: number;
  kudosedByMe: boolean;
}

export interface CommentView {
  id: string;
  body: string;
  at: number;
  author: ApiAuthor;
  mine: boolean;
}
export interface CommentsResponse extends Degradable, ApiError {
  comments: CommentView[];
}

// ---- people: search, suggestions, connections ------------------------------

/** A person card fed into the discover list. Both /search and /suggestions
 *  return `userId` (the discover clients key + follow on it); /suggestions also
 *  carries the AuthorCard `id` (same value) + a `reason`. */
export interface PersonCard {
  userId: string;
  id?: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  coachVerified?: boolean;
  isCoach?: boolean;
  relation?: Relation;
  reason?: string;
}
export interface SearchResponse extends Degradable, ApiError {
  results: PersonCard[];
}
export interface SuggestionsResponse extends Degradable, ApiError {
  suggestions: PersonCard[];
}

export interface ConnectionPerson extends ApiAuthor {
  closeFriend?: boolean;
  friend?: boolean;
  followerId?: string;
}
export interface ConnectionsResponse extends Degradable, ApiError {
  following: ConnectionPerson[];
  followers: ConnectionPerson[];
  requests: ConnectionPerson[];
  friends: ConnectionPerson[];
}

// ---- profiles --------------------------------------------------------------

/** The follow-request lifecycle state (distinct from Relation). */
export type FollowState = "requested" | "close" | "following" | "none";

/** Public athlete profile (GET /api/social/profile/[handle]). `relation` also
 *  admits the literal the profile clients compare against so their (currently
 *  dead) "requested" branch keeps compiling — see the audit note; pending state
 *  actually lives in `followState`. */
export interface PublicProfile {
  userId: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  visibility: string;
  showcase: Record<string, unknown>;
  coachVerified: boolean;
  isCoach: boolean;
}
export interface PublicProfileResponse extends Degradable, ApiError {
  profile: PublicProfile;
  relation: Relation | "requested";
  followState: FollowState;
  canViewResults: boolean;
  stats: ProfileStats | null;
}

/** Own editable profile (GET/PUT /api/social/profile). */
export interface OwnProfile {
  userId: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  visibility: string;
  showcase: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export interface OwnProfileResponse extends Degradable, ApiError {
  profile: OwnProfile | null;
  suggestedHandle: string;
  stats?: ProfileStats;
}

export interface CompareResponse extends ApiError {
  compare: CompareResult;
}
export interface LeaderboardResponse extends Degradable, ApiError {
  metric: LeaderboardMetric;
  board: LeaderRow[];
}

/** Generic mutation envelope for POST/DELETE endpoints whose body the clients
 *  don't render (posts/follow/kudos-mutations) — they only read `.error`. */
export interface MutationResult extends ApiError {
  ok?: boolean;
  status?: string;
}

// ---- coach marketplace -----------------------------------------------------

/** Directory card (GET /api/coaches). */
export interface CoachCard {
  userId: string;
  handle: string;
  name: string | null;
  avatarUrl: string | null;
  headline: string | null;
  specialties: string[];
  sports: string[];
  acceptingClients: boolean;
  priceNote: string | null;
  coachVerified: boolean;
  programs: number;
  rating: number | null;
  reviews: number;
}
export interface CoachesResponse extends Degradable, ApiError {
  coaches: CoachCard[];
}

export interface ProgramPreviewItem {
  name: string;
  sr: string;
  rpe?: string;
}
export interface ProgramPreviewDay {
  day: string;
  items: ProgramPreviewItem[];
}
/** A preview week carries only `days`; the stored program week (below) may hold
 *  more, but no client reads past `days`. */
export interface ProgramPreviewWeek {
  days: ProgramPreviewDay[];
}

export interface StorefrontCoach {
  userId: string;
  handle: string;
  name: string | null;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  specialties: string[];
  sports: string[];
  acceptingClients: boolean;
  priceNote: string | null;
  coachVerified: boolean;
}
export interface StorefrontProgram {
  id: string;
  name: string;
  goal: string | null;
  summary: string | null;
  level: string | null;
  weeks: number;
  preview: ProgramPreviewWeek[];
  enrollmentStatus: string | null;
}
export interface StorefrontReview {
  id: string;
  rating: number;
  body: string | null;
  at: number;
  author: ApiAuthor;
  mine: boolean;
}
export interface CoachStorefrontResponse extends ApiError {
  coach: StorefrontCoach;
  programs: StorefrontProgram[];
  reviews: StorefrontReview[];
  rating: number | null;
  isMyCoach: boolean;
  linkStatus: string | null;
  isMe: boolean;
}

/** Own coach storefront profile (GET/PUT /api/coach/profile). */
export interface CoachProfileData {
  userId: string;
  headline: string | null;
  bio: string | null;
  specialties: string[];
  sports: string[];
  acceptingClients: boolean;
  autoAccept: boolean;
  priceNote: string | null;
  visibility: string;
  createdAt: string;
  updatedAt: string;
}
export interface CoachProfileResponse extends Degradable, ApiError {
  profile: CoachProfileData | null;
  handle: string | null;
  isCoach?: boolean;
}

export interface CoachProgramData {
  id: string;
  coachId: string;
  name: string;
  goal: string | null;
  weeks: ProgramPreviewWeek[];
  published: boolean;
  summary: string | null;
  level: string | null;
  visibility: string;
  createdAt: string;
}
export interface CoachProgramsResponse extends Degradable, ApiError {
  programs: CoachProgramData[];
}

export interface EnrollmentRow {
  id: string;
  programId: string;
  programName: string;
  status: string;
  at: number;
  client?: ApiAuthor;
  coach?: ApiAuthor;
}
export interface CoachEnrollmentsResponse extends Degradable, ApiError {
  incoming: EnrollmentRow[];
  mine: EnrollmentRow[];
}
