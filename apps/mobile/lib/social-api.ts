import { supabase } from "./supabase";

// Mobile client for the social + coach-marketplace API (the SAME backend the
// web app calls), with the Supabase access token as a Bearer header.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://hybrid-web-rosy.vercel.app";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function sapi<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
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
export const getMyProfile = () => sapi("/api/social/profile");
export const putMyProfile = (b: unknown) => sapi("/api/social/profile", "PUT", b);
export const getProfile = (handle: string) => sapi(`/api/social/profile/${handle}`);
export const searchPeople = (q: string) => sapi(`/api/social/search?q=${encodeURIComponent(q)}`);
export const follow = (b: unknown) => sapi("/api/social/follow", "POST", b);
export const unfollow = (b: unknown) => sapi("/api/social/follow", "DELETE", b);
export const respondFollow = (b: unknown) => sapi("/api/social/follow/respond", "POST", b);
export const setCloseFriend = (b: unknown) => sapi("/api/social/close-friend", "POST", b);
export const getConnections = () => sapi("/api/social/connections");
export const getFeed = () => sapi("/api/social/feed");
export const toggleKudos = (b: unknown) => sapi("/api/social/kudos", "POST", b);
export const getComments = (subjectType: string, subjectId: string) => sapi(`/api/social/comments?subjectType=${subjectType}&subjectId=${subjectId}`);
export const postComment = (b: unknown) => sapi("/api/social/comments", "POST", b);
export const getLeaderboard = (metric: string) => sapi(`/api/social/leaderboard?metric=${metric}`);
export const getCompare = (handle: string) => sapi(`/api/social/compare?handle=${handle}`);
export const getSuggestions = () => sapi("/api/social/suggestions");
export const blockUser = (b: unknown) => sapi("/api/social/block", "POST", b);
export const unblockUser = (b: unknown) => sapi("/api/social/block", "DELETE", b);
export const reportTarget = (b: unknown) => sapi("/api/reports", "POST", b);

// ---- marketplace
export const getCoaches = (q?: string) => sapi(`/api/coaches${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const getCoach = (handle: string) => sapi(`/api/coaches/${handle}`);
export const enrollProgram = (programId: string) => sapi("/api/coaches/enroll", "POST", { programId });
export const postReview = (handle: string, b: unknown) => sapi(`/api/coaches/${handle}/reviews`, "POST", b);
export const getCoachProfile = () => sapi("/api/coach/profile");
export const putCoachProfile = (b: unknown) => sapi("/api/coach/profile", "PUT", b);
export const getCoachPrograms = () => sapi("/api/coach/programs");
export const patchProgram = (id: string, b: unknown) => sapi(`/api/coach/programs/${id}`, "PATCH", b);
export const getEnrollments = () => sapi("/api/coach/enrollments");
export const respondEnrollment = (b: unknown) => sapi("/api/coach/enrollments", "POST", b);
