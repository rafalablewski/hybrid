/**
 * Social engine — pure, shared by web + mobile. The follow graph's privacy
 * gate, the activity feed, friend leaderboards and head-to-head comparison, all
 * built on the EXISTING engines (recap, habits/streak, records/PRs, session
 * volume) so the social surfaces read the same numbers as the rest of the app.
 *
 * Nothing here touches the DB or fabricates data: the API computes each
 * athlete's real sessions and hands them in; these helpers only shape + rank.
 */
import {
  weeklyRecap,
  streak,
  totalVolume,
  sessionVolume,
  bestE1rmByLift,
  newPrsInSession,
  migrateBlocks,
  type LoggedSession,
} from "./engines";
import { relativeTime } from "./activity";

// ---------------------------------------------------------------- handles ----
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

/** Normalize free input to a candidate handle: lowercase, [a-z0-9_], no leading
 *  digits stripped (kept), collapse runs, trim to HANDLE_MAX. */
export function normalizeHandle(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_") // non-alnum → underscore
    .replace(/_+/g, "_") // collapse runs
    .replace(/^_+|_+$/g, "") // trim underscores
    .slice(0, HANDLE_MAX);
}

export function isValidHandle(input: string): boolean {
  return /^[a-z0-9_]+$/.test(input) && input.length >= HANDLE_MIN && input.length <= HANDLE_MAX;
}

/** Derive a starting handle from a name/email local-part. */
export function suggestHandle(seed: string): string {
  const base = normalizeHandle(seed.split("@")[0] ?? seed);
  if (base.length >= HANDLE_MIN) return base;
  return (base + "_athlete").slice(0, HANDLE_MAX);
}

// --------------------------------------------------------------- relations ---
export type Visibility = "public" | "followers" | "private";

/** How the viewer relates to a target, derived from the follow edges between
 *  them. friend = mutual active follow; close = the viewer marked them close. */
export type Relation = "self" | "none" | "following" | "follower" | "friend" | "close";

export interface FollowEdge {
  followerId: string;
  followeeId: string;
  status: string; // active | pending
  closeFriend?: boolean;
}

export function relationTo(viewerId: string, targetId: string, edges: FollowEdge[]): Relation {
  if (viewerId === targetId) return "self";
  const out = edges.find(
    (e) => e.followerId === viewerId && e.followeeId === targetId && e.status === "active",
  );
  const back = edges.find(
    (e) => e.followerId === targetId && e.followeeId === viewerId && e.status === "active",
  );
  if (out && out.closeFriend) return "close";
  if (out && back) return "friend";
  if (out) return "following";
  if (back) return "follower";
  return "none";
}

/** A friend is a mutual active follow (close counts as friend). */
export function isFriend(rel: Relation): boolean {
  return rel === "friend" || rel === "close";
}

/** The privacy gate: can `relation` see the target's RESULTS (feed/leaderboard/
 *  compare)? The profile CARD (handle/name/bio) is always visible; this gates
 *  the data behind it. */
export function canViewResults(visibility: Visibility, relation: Relation): boolean {
  if (relation === "self") return true;
  if (visibility === "public") return true;
  if (visibility === "private") return false;
  // followers-only: any approved follower (or mutual friend) can see results.
  return relation === "following" || relation === "follower" || relation === "friend" || relation === "close";
}

// ------------------------------------------------------------------- feed ----
export type FeedKind = "session" | "pr" | "recap";
export type FeedAccent = "lime" | "blue" | "violet" | "amber";

export interface FeedAuthor {
  id: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  closeFriend?: boolean;
}

export interface FeedSubjectInput {
  author: FeedAuthor;
  /** the author's recent logged sessions (already privacy-cleared by the API). */
  sessions: LoggedSession[];
}

export interface FeedItem {
  /** stable id: `${kind}-${subjectId}` (kudos/comments anchor to subjectType+subjectId). */
  id: string;
  kind: FeedKind;
  subjectType: FeedKind;
  subjectId: string;
  author: FeedAuthor;
  title: string;
  detail: string;
  /** epoch ms for sorting + relative-time. */
  at: number;
  when: string; // "2h ago"
  /** optional headline metric (e.g. PR e1RM, session volume kg). */
  metric?: number;
  accent: FeedAccent;
}

export interface FeedOptions {
  now?: number;
  /** days back of activity to include (default 14). */
  windowDays?: number;
  /** cap on returned items (default 40). */
  limit?: number;
  /** close-friends get this many hours of sort boost so they surface first (default 12). */
  closeBoostHours?: number;
}

const ms = (iso: string) => new Date(iso).getTime();

/** Build the cross-athlete activity feed from followees' sessions. Emits a
 *  "completed session" item per session and a "PR" item when that session set a
 *  new best — both anchored by (subjectType, subjectId) for kudos/comments. */
export function buildSocialFeed(subjects: FeedSubjectInput[], opts: FeedOptions = {}): FeedItem[] {
  const now = opts.now ?? Date.now();
  const windowMs = (opts.windowDays ?? 14) * 86_400_000;
  const boostMs = (opts.closeBoostHours ?? 12) * 3_600_000;
  const items: Array<FeedItem & { _sort: number }> = [];

  for (const subj of subjects) {
    const author = subj.author;
    // chronological + blocks migrated once, so PR detection compares against
    // prior sessions in the same normalized shape.
    const ordered = [...subj.sessions]
      .map((s) => ({ ...s, blocks: migrateBlocks(s.blocks) }))
      .sort((a, b) => ms(a.startedAt) - ms(b.startedAt));
    ordered.forEach((s, idx) => {
      const at = ms(s.completedAt ?? s.startedAt);
      if (!Number.isFinite(at) || at < now - windowMs || at > now + 60_000) return;
      const blocks = s.blocks;
      const vol = Math.round(sessionVolume(blocks));
      const moves = blocks.length;
      const sortAt = at + (author.closeFriend ? boostMs : 0);

      items.push({
        id: `session-${s.id}`,
        kind: "session",
        subjectType: "session",
        subjectId: s.id,
        author,
        title: `${author.displayName || "@" + author.handle} trained`,
        detail: `${s.title}${moves ? ` · ${moves} ${moves === 1 ? "exercise" : "exercises"}` : ""}${vol ? ` · ${vol.toLocaleString()} kg` : ""}`,
        at,
        when: relativeTime(at, now),
        metric: vol || undefined,
        accent: "lime",
        _sort: sortAt,
      });

      // PRs set in THIS session vs everything the athlete did before it.
      const prs = newPrsInSession(s, ordered.slice(0, idx));
      if (prs.length) {
        const top = prs.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
        items.push({
          id: `pr-${s.id}`,
          kind: "pr",
          subjectType: "pr",
          subjectId: s.id,
          author,
          title: `${author.displayName || "@" + author.handle} hit a PR`,
          detail:
            prs.length === 1
              ? `${top.lift} — ${top.e1rm} kg e1RM`
              : `${prs.length} PRs · top ${top.lift} ${top.e1rm} kg`,
          at: at + 1, // tie-break above the session card
          when: relativeTime(at, now),
          metric: top.e1rm,
          accent: "amber",
          _sort: sortAt + 1,
        });
      }
    });
  }

  items.sort((a, b) => b._sort - a._sort);
  return items.slice(0, opts.limit ?? 40).map(({ _sort, ...rest }) => rest);
}

// ------------------------------------------------------------ leaderboard ----
export type LeaderboardMetric =
  | "volume" // kg lifted this week
  | "sessions" // workouts this week
  | "distance" // km run this week
  | "activeDays" // distinct days trained this week
  | "streak" // current day-streak
  | "prs"; // PRs set this week (strength + cardio)

export interface LeaderEntry {
  id: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  sessions: LoggedSession[];
  isMe?: boolean;
}

export interface LeaderRow {
  rank: number;
  id: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  value: number;
  /** formatted value + unit, e.g. "12,400 kg" / "5 days". */
  label: string;
  isMe: boolean;
}

export const LEADERBOARD_METRICS: { key: LeaderboardMetric; label: string }[] = [
  { key: "volume", label: "Volume" },
  { key: "sessions", label: "Sessions" },
  { key: "distance", label: "Distance" },
  { key: "activeDays", label: "Active days" },
  { key: "streak", label: "Streak" },
  { key: "prs", label: "PRs" },
];

function metricValue(metric: LeaderboardMetric, sessions: LoggedSession[], now: number): number {
  const r = weeklyRecap(sessions, now);
  switch (metric) {
    case "volume":
      return Math.round(r.volume);
    case "sessions":
      return r.sessions;
    case "distance":
      return Math.round(r.distanceKm * 10) / 10;
    case "activeDays":
      return r.activeDays;
    case "streak":
      return streak(sessions, 1, now).current;
    case "prs":
      return r.prs.length + r.cardioPrs.length;
  }
}

function metricLabel(metric: LeaderboardMetric, value: number): string {
  switch (metric) {
    case "volume":
      return `${value.toLocaleString()} kg`;
    case "distance":
      return `${value} km`;
    case "sessions":
      return `${value} ${value === 1 ? "session" : "sessions"}`;
    case "activeDays":
      return `${value} ${value === 1 ? "day" : "days"}`;
    case "streak":
      return `${value} ${value === 1 ? "day" : "days"}`;
    case "prs":
      return `${value} ${value === 1 ? "PR" : "PRs"}`;
  }
}

/** Rank friends by a metric (highest first); ties keep input order. Everyone is
 *  included even at 0 so the viewer always sees their circle. */
export function friendLeaderboard(
  entries: LeaderEntry[],
  metric: LeaderboardMetric,
  now = Date.now(),
): LeaderRow[] {
  return entries
    .map((e) => ({ e, value: metricValue(metric, e.sessions, now) }))
    .sort((a, b) => b.value - a.value)
    .map(({ e, value }, i) => ({
      rank: i + 1,
      id: e.id,
      handle: e.handle,
      displayName: e.displayName,
      avatarUrl: e.avatarUrl,
      value,
      label: metricLabel(metric, value),
      isMe: !!e.isMe,
    }));
}

// --------------------------------------------------------------- compare -----
export interface AthleteSnapshot {
  id: string;
  handle: string;
  displayName?: string | null;
  sessions: LoggedSession[];
}

export interface CompareLine {
  key: string;
  label: string;
  a: number;
  b: number;
  unit: string;
  /** which side is ahead on this line. */
  leader: "a" | "b" | "tie";
}

export interface SharedLift {
  lift: string;
  a: number;
  b: number;
  unit: "kg";
  leader: "a" | "b" | "tie";
}

export interface CompareResult {
  a: { id: string; handle: string; displayName?: string | null };
  b: { id: string; handle: string; displayName?: string | null };
  lines: CompareLine[];
  sharedLifts: SharedLift[];
  /** count of lines each side leads (excludes ties) — the headline scoreline. */
  score: { a: number; b: number };
}

const lead = (a: number, b: number): "a" | "b" | "tie" => (a > b ? "a" : b > a ? "b" : "tie");

/** Head-to-head comparison between two athletes on the week's training plus
 *  all-time bests on the lifts they BOTH train. Reuses weeklyRecap/streak/
 *  bestE1rmByLift so the numbers match every other screen. */
export function compareAthletes(
  a: AthleteSnapshot,
  b: AthleteSnapshot,
  now = Date.now(),
): CompareResult {
  const ra = weeklyRecap(a.sessions, now);
  const rb = weeklyRecap(b.sessions, now);
  const sa = streak(a.sessions, 1, now);
  const sb = streak(b.sessions, 1, now);

  const lines: CompareLine[] = [
    { key: "volume", label: "Weekly volume", a: Math.round(ra.volume), b: Math.round(rb.volume), unit: "kg", leader: lead(ra.volume, rb.volume) },
    { key: "sessions", label: "Weekly sessions", a: ra.sessions, b: rb.sessions, unit: "", leader: lead(ra.sessions, rb.sessions) },
    { key: "distance", label: "Weekly distance", a: Math.round(ra.distanceKm * 10) / 10, b: Math.round(rb.distanceKm * 10) / 10, unit: "km", leader: lead(ra.distanceKm, rb.distanceKm) },
    { key: "activeDays", label: "Active days", a: ra.activeDays, b: rb.activeDays, unit: "", leader: lead(ra.activeDays, rb.activeDays) },
    { key: "streak", label: "Current streak", a: sa.current, b: sb.current, unit: "d", leader: lead(sa.current, sb.current) },
  ];

  // all-time bests on shared lifts
  const bestA = new Map(bestE1rmByLift(a.sessions).map((r) => [r.lift, r.e1rm]));
  const bestB = new Map(bestE1rmByLift(b.sessions).map((r) => [r.lift, r.e1rm]));
  const sharedLifts: SharedLift[] = [];
  for (const [lift, ea] of bestA) {
    const eb = bestB.get(lift);
    if (eb == null) continue;
    sharedLifts.push({ lift, a: ea, b: eb, unit: "kg", leader: lead(ea, eb) });
  }
  sharedLifts.sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));

  const all = [...lines, ...sharedLifts];
  const score = {
    a: all.filter((l) => l.leader === "a").length,
    b: all.filter((l) => l.leader === "b").length,
  };

  return {
    a: { id: a.id, handle: a.handle, displayName: a.displayName },
    b: { id: b.id, handle: b.handle, displayName: b.displayName },
    lines,
    sharedLifts,
    score,
  };
}

/** Lifetime headline stats for a profile card (cheap, from sessions only). */
export interface ProfileStats {
  totalSessions: number;
  totalVolumeKg: number;
  currentStreak: number;
  topLifts: { lift: string; e1rm: number }[];
}

export function profileStats(sessions: LoggedSession[], now = Date.now()): ProfileStats {
  return {
    totalSessions: sessions.length,
    totalVolumeKg: Math.round(totalVolume(sessions)),
    currentStreak: streak(sessions, 1, now).current,
    topLifts: bestE1rmByLift(sessions).slice(0, 3).map((r) => ({ lift: r.lift, e1rm: r.e1rm })),
  };
}

// ------------------------------------------------- coach discovery rail ------
export type CoachAccent = "lime" | "blue" | "violet" | "amber";

/** A coach card for the "Follow a coach" rail on Today — shared shape for both
 *  the real marketplace coaches AND the placeholder people shown before any
 *  coach has published a storefront. */
export interface DiscoverCoach {
  /** real coaches: their User id (followable); placeholders: undefined. */
  userId?: string;
  handle: string;
  name: string;
  headline: string;
  specialties: string[];
  rating: number | null;
  reviews?: number;
  verified: boolean;
  accent: CoachAccent;
  /** true → not a real account; the card routes to the marketplace instead of following. */
  placeholder?: boolean;
}

/** Seed people for the Today coach rail until real coaches publish storefronts.
 *  Deliberately diverse + clearly illustrative; the rail swaps to live coaches
 *  the moment the marketplace returns any. */
export const PLACEHOLDER_COACHES: DiscoverCoach[] = [
  { handle: "priya_nair", name: "Priya Nair", headline: "Olympic weightlifting · 10y", specialties: ["Olympic lifting", "Peaking"], rating: 4.9, reviews: 128, verified: true, accent: "violet", placeholder: true },
  { handle: "marcus_bell", name: "Marcus Bell", headline: "Hybrid & Hyrox specialist", specialties: ["Hyrox", "Conditioning"], rating: 4.7, reviews: 64, verified: true, accent: "lime", placeholder: true },
  { handle: "sofia_almeida", name: "Sofia Almeida", headline: "Marathon & 5k coach", specialties: ["Running", "Endurance"], rating: 4.8, reviews: 91, verified: false, accent: "blue", placeholder: true },
  { handle: "dmitri_volkov", name: "Dmitri Volkov", headline: "Powerlifting · raw totals", specialties: ["Powerlifting", "Strength"], rating: 4.6, reviews: 42, verified: false, accent: "amber", placeholder: true },
  { handle: "lena_hoffmann", name: "Lena Hoffmann", headline: "Fat loss & physique", specialties: ["Bodybuilding", "Fat loss"], rating: 5.0, reviews: 73, verified: true, accent: "violet", placeholder: true },
  { handle: "coach_bray", name: "Coach Bray", headline: "Tactical & military prep", specialties: ["Tactical", "Strength"], rating: 4.4, reviews: 37, verified: false, accent: "lime", placeholder: true },
];

const RAIL_ACCENTS: CoachAccent[] = ["lime", "blue", "violet", "amber"];

/** Map the marketplace API's coach cards into the rail shape; falls back to the
 *  placeholder people when the marketplace is empty (no coaches yet / schema not
 *  run). One source of truth shared by web + mobile. */
export function coachRailItems(apiCoaches?: Array<Record<string, unknown>> | null): DiscoverCoach[] {
  if (!apiCoaches || apiCoaches.length === 0) return PLACEHOLDER_COACHES;
  return apiCoaches.slice(0, 12).map((c, i) => ({
    userId: typeof c.userId === "string" ? c.userId : undefined,
    handle: String(c.handle ?? ""),
    name: String(c.name ?? c.handle ?? "Coach"),
    headline: String(c.headline ?? (Array.isArray(c.specialties) ? (c.specialties as string[]).join(" · ") : "") ?? ""),
    specialties: Array.isArray(c.specialties) ? (c.specialties as string[]) : [],
    rating: typeof c.rating === "number" ? c.rating : null,
    reviews: typeof c.reviews === "number" ? c.reviews : undefined,
    verified: c.coachVerified === true,
    accent: RAIL_ACCENTS[i % RAIL_ACCENTS.length]!,
    placeholder: false,
  }));
}

