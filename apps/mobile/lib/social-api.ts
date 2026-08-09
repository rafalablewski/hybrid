import type {
  OwnProfileResponse,
  PublicProfileResponse,
  UserPageResponse,
  SearchResponse,
  SuggestionsResponse,
  ConnectionsResponse,
  FeedResponse,
  SavedFeedResponse,
  FeedPostResponse,
  KudosResponse,
  CommentsResponse,
  LeaderboardResponse,
  CompareResponse,
  CoachesResponse,
  CoachStorefrontResponse,
  CoachProfileResponse,
  CoachProgramsResponse,
  CoachEnrollmentsResponse,
  MutationResult,
} from "@hybrid/core";
import { supabase } from "./supabase";
import { fetchWithTimeout } from "./fetch";

// Mobile client for the social + coach-marketplace API (the SAME backend the
// web app calls), with the Supabase access token as a Bearer header.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://hybrid-web-rosy.vercel.app";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function sapi<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  try {
    const res = await fetchWithTimeout(`${API_URL}${path}`, {
      method,
      headers: { ...(await authHeaders()), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

// ---- social
export const getMyProfile = () => sapi<OwnProfileResponse>("/api/social/profile");
export const putMyProfile = (b: unknown) => sapi<MutationResult>("/api/social/profile", "PUT", b);
export const getProfile = (handle: string) => sapi<PublicProfileResponse>(`/api/social/profile/${handle}`);
/** THE PERSON — the whole page in one read: their card, their privacy-gated
 *  results, their follow counts, their coaching if they coach, and their recent
 *  posts. The individual user page's only fetch, so a link to somebody works
 *  with nothing else loaded. */
export const getUserPage = (handle: string) => sapi<UserPageResponse>(`/api/social/user/${encodeURIComponent(handle)}`);
export const searchPeople = (q: string) => sapi<SearchResponse>(`/api/social/search?q=${encodeURIComponent(q)}`);
export const follow = (b: unknown) => sapi<MutationResult>("/api/social/follow", "POST", b);
export const unfollow = (b: unknown) => sapi<MutationResult>("/api/social/follow", "DELETE", b);
export const respondFollow = (b: unknown) => sapi<MutationResult>("/api/social/follow/respond", "POST", b);
export const setCloseFriend = (b: unknown) => sapi<MutationResult>("/api/social/close-friend", "POST", b);
export const getConnections = () => sapi<ConnectionsResponse>("/api/social/connections");
export const getFeed = () => sapi<FeedResponse>("/api/social/feed");
/** Resolve saved (subjectType:subjectId) keys back into cards. POST because
 *  the key list is the request body, not because it mutates anything. */
export const getSavedFeed = (keys: string[]) => sapi<SavedFeedResponse>("/api/social/saved", "POST", { keys });
/** ONE POST — the card AND the whole workout behind it, in one privacy-gated
 *  read (a post the viewer may not see never arrives). The post screen's only
 *  fetch, so a shared link lands with nothing else loaded. */
export const getFeedPost = (subjectType: string, subjectId: string) =>
  sapi<FeedPostResponse>(`/api/social/post/${encodeURIComponent(subjectType)}/${encodeURIComponent(subjectId)}`);
export const createPost = (b: unknown) => sapi<MutationResult>("/api/social/posts", "POST", b);
export const deletePost = (id: string) => sapi<MutationResult>(`/api/social/posts/${id}`, "DELETE");
export const toggleKudos = (b: unknown) => sapi<KudosResponse>("/api/social/kudos", "POST", b);
export const getComments = (subjectType: string, subjectId: string) => sapi<CommentsResponse>(`/api/social/comments?subjectType=${subjectType}&subjectId=${subjectId}`);
export const postComment = (b: unknown) => sapi<MutationResult>("/api/social/comments", "POST", b);
export const getLeaderboard = (metric: string) => sapi<LeaderboardResponse>(`/api/social/leaderboard?metric=${metric}`);
export const getCompare = (handle: string) => sapi<CompareResponse>(`/api/social/compare?handle=${handle}`);
export const getSuggestions = () => sapi<SuggestionsResponse>("/api/social/suggestions");
export const blockUser = (b: unknown) => sapi<MutationResult>("/api/social/block", "POST", b);
export const unblockUser = (b: unknown) => sapi<MutationResult>("/api/social/block", "DELETE", b);
export const reportTarget = (b: unknown) => sapi<MutationResult>("/api/reports", "POST", b);

// ---- marketplace
export const getCoaches = (q?: string) => sapi<CoachesResponse>(`/api/coaches${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const getCoach = (handle: string) => sapi<CoachStorefrontResponse>(`/api/coaches/${handle}`);
export const enrollProgram = (programId: string) => sapi<MutationResult>("/api/coaches/enroll", "POST", { programId });
export const postReview = (handle: string, b: unknown) => sapi<MutationResult>(`/api/coaches/${handle}/reviews`, "POST", b);
export const getCoachProfile = () => sapi<CoachProfileResponse>("/api/coach/profile");
export const putCoachProfile = (b: unknown) => sapi<MutationResult>("/api/coach/profile", "PUT", b);
export const getCoachPrograms = () => sapi<CoachProgramsResponse>("/api/coach/programs");
export const patchProgram = (id: string, b: unknown) => sapi<MutationResult>(`/api/coach/programs/${id}`, "PATCH", b);
export const getEnrollments = () => sapi<CoachEnrollmentsResponse>("/api/coach/enrollments");
export const respondEnrollment = (b: unknown) => sapi<MutationResult>("/api/coach/enrollments", "POST", b);
