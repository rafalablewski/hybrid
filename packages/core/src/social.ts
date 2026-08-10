/**
 * Social engine — pure, shared by web + mobile. The follow graph's privacy
 * gate, the activity feed, friend leaderboards and head-to-head comparison, all
 * built on the EXISTING engines (recap, habits/streak, records/PRs, session
 * volume) so the social surfaces read the same numbers as the rest of the app.
 *
 * Nothing here touches the DB or fabricates data: the API computes each
 * athlete's real sessions and hands them in; these helpers only shape + rank.
 */
import { type BodyweightInput } from "./bodyweight";
import {
  weeklyRecap,
  streak,
  totalVolume,
  sessionVolume,
  bestE1rmByLift,
  bestTopLoadByLift,
  newPrsInSession,
  migrateBlocks,
  type LoggedSession,
} from "./engines";
import { relativeTime } from "./activity";
import {
  FEED_STAT_LABEL_KEY,
  feedDeltaText,
  feedFigureText,
  feedStatText,
  feedTierChip,
  sessionDetail,
  postDetail,
  type FeedDetail,
} from "./feed-card";
import type { WeightUnit } from "./units";
import { roundKm } from "./distance";
import { isLive } from "./feed-live";

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
export type FeedKind = "session" | "pr" | "recap" | "post";
export type FeedAccent = "lime" | "blue" | "violet" | "amber";

/** A first-class shared post (status / PR card / workout card) from an author. */
export interface FeedPostInput {
  id: string;
  kind: "status" | "pr" | "workout";
  text?: string | null;
  data?: Record<string, unknown>;
  at: number; // epoch ms
}

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
  /** the author's recent shared posts (status updates / PR & workout cards). */
  posts?: FeedPostInput[];
}

export interface FeedItem {
  /** stable id: `${kind}-${subjectId}` (kudos/comments anchor to subjectType+subjectId). */
  id: string;
  kind: FeedKind;
  subjectType: FeedKind;
  subjectId: string;
  author: FeedAuthor;
  title: string;
  /** prose body (a post's caption / status text), or null. */
  body: string | null;
  /** structured stat pills (session/PR/workout stats) — rendered as separate
   *  chips, never a `·`-joined string that has to be split back apart. */
  chips: string[];
  /** the workout name / "PR" tag that leads the card, or null. */
  lead: string | null;
  /** epoch ms for sorting + relative-time. */
  at: number;
  when: string; // "2h ago"
  /** optional headline metric (e.g. PR e1RM, session volume kg). */
  metric?: number;
  accent: FeedAccent;
  /**
   * The CARD payload — moment class, archetype, hero figure, tier, top sets and
   * the device-true stat row (see feed-card.ts). Both clients render from this
   * one shape, so a card can never drift between web and mobile. Optional: a
   * client reading an older response still renders `title`/`chips` as text.
   */
  detail?: FeedDetail;
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

/** View model for a feed CARD (avatar header + optional prose body + stat
 *  chips), shared by web + mobile so both render the identical card. Every field
 *  is already structured on the FeedItem — no `·`-delimited string is split back
 *  apart, and nothing is re-joined with a separator for display. */
export interface FeedCardView {
  name: string;
  when: string;
  /** the workout name / "PR" tag that leads the card, or null. */
  lead: string | null;
  body: string | null;
  chips: string[];
}
export function feedCardView(
  it: {
    author: { displayName?: string | null; handle: string };
    body?: string | null;
    chips?: string[];
    lead?: string | null;
    when: string;
    detail?: FeedDetail;
  },
  /**
   * Pass the caller's `t` (and unit preference) and the view is derived from
   * the CARD MODEL instead of the legacy title/chips: the preview then speaks
   * the same language as the feed — a PR leads "Deadlift — new PR" and carries
   * its load and tier, rather than flattening into an anonymous chip. Without
   * them the legacy shape is returned unchanged, so older callers are unaffected.
   */
  /** `locale` is the ACTIVE LANGUAGE, and it is not decoration: without it the
   *  tonnage chip groups its digits against the DEVICE, so a preview under an
   *  English interface reads "5.360" on a German handset. */
  opts?: { t?: (key: string) => string; units?: WeightUnit; locale?: string },
): FeedCardView {
  // Prefer the real name; fall back to a handle only when it's a genuine one
  // (an empty handle means "no profile" — never render a bare "@").
  const name = it.author.displayName || (it.author.handle ? `@${it.author.handle}` : "Someone");
  const d = it.detail;
  if (d && opts?.t) {
    const t = opts.t;
    const units = opts.units ?? "kg";
    const lead =
      d.headlineKey === "feed.hl.session" || d.headlineKey === "feed.hl.sharedWorkout"
        ? d.headlineArg || t(d.headlineKey)
        : d.headlineArg
          ? t(d.headlineKey).replace("{lift}", d.headlineArg)
          : t(d.headlineKey);
    const chips: string[] = [];
    if (d.figureKg != null && d.figureKg > 0) {
      const f = feedFigureText(d.figureKg, units);
      chips.push(`${f.value} ${f.unit}`);
    }
    // A workout that set records leads with the loudest one — a preview of that
    // post that opened with its tonnage would bury the reason it exists.
    const pr = d.prs?.[0];
    if (pr) {
      const f = feedFigureText(pr.topLoadKg, units);
      chips.push(`${pr.lift} ${f.value} ${f.unit}`);
      if (d.prs && d.prs.length > 1) chips.push(t("feed.prCount").replace("{n}", String(d.prs.length)));
    }
    const tier = feedTierChip(d.tier);
    if (tier) chips.push(`${tier.short} ${t(tier.labelKey)}`);
    if (d.deltaPct != null) chips.push(feedDeltaText(d.deltaPct));
    for (const stat of d.stats ?? []) chips.push(`${feedStatText(stat, units, opts.locale)} ${t(FEED_STAT_LABEL_KEY[stat.key])}`);
    return { name, when: it.when, lead, body: it.body ?? null, chips: chips.slice(0, 4) };
  }
  return { name, when: it.when, lead: it.lead ?? null, body: it.body ?? null, chips: it.chips ?? [] };
}

const ms = (iso: string) => new Date(iso).getTime();

/**
 * The figure to show for a shared PR post, across both stored shapes.
 *
 * `topLoad` is what a PR post has carried since #231 — the weight actually
 * lifted. Rows written before that only have `e1rm`, and nothing can backfill
 * them (an estimate can't be reversed into a bar weight), so they render with
 * an explicit "e1RM" label rather than being silently passed off as a weight
 * the athlete lifted. Exported so tests can pin both shapes.
 */
export function prPostFigure(d: { topLoad?: unknown; e1rm?: unknown }): { text: string; value: number | undefined } {
  if (typeof d.topLoad === "number") return { text: `${d.topLoad} kg`, value: d.topLoad };
  if (typeof d.e1rm === "number") return { text: `${d.e1rm} kg e1RM`, value: d.e1rm };
  return { text: "? kg", value: undefined };
}

/**
 * Build the cross-athlete activity feed from followees' sessions.
 *
 * ONE POST PER WORKOUT. A session emits exactly one item, anchored by
 * (subjectType, subjectId) for kudos/comments — and the records it set are
 * LINES ON THAT POST (detail.prs), not posts of their own. It used to emit two
 * items for one training session: the workout, and a PR card that named only
 * the heaviest lift and reduced the rest to a count. That put the same session
 * in the stream twice, split its kudos and its comments across two threads, and
 * still never showed you the second and third records.
 */
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
      // A session still in progress is PRESENCE, not a post: it belongs in the
      // Now-training strip (feed-live.ts), and posting it as a finished card
      // would announce a workout that hasn't happened yet. A session left open
      // past the live window is a different thing — someone forgot to press
      // finish — and still reads as a card, dated when they started.
      if (isLive(s, now)) return;
      const at = ms(s.completedAt ?? s.startedAt);
      if (!Number.isFinite(at) || at < now - windowMs || at > now + 60_000) return;
      const blocks = s.blocks;
      const vol = Math.round(sessionVolume(blocks));
      const moves = blocks.length;
      const sortAt = at + (author.closeFriend ? boostMs : 0);

      // PRs set in THIS session vs everything the athlete did before it. They
      // ride ON the workout post — heaviest first, all of them.
      const prs = newPrsInSession(s, ordered.slice(0, idx));
      // Heaviest actual lift, like every other PR surface (#231).
      const top = prs.length ? prs.reduce((a, b) => (b.topLoad > a.topLoad ? b : a)) : null;

      items.push({
        id: `session-${s.id}`,
        kind: "session",
        subjectType: "session",
        subjectId: s.id,
        author,
        title: `${author.displayName || "@" + author.handle} trained`,
        body: null,
        lead: s.title,
        // The legacy text shape (only rendered when a client can't read
        // `detail`) leads with the record, because that's what the post is
        // about the moment there is one.
        chips: [
          ...(top ? [prs.length === 1 ? `PR ${top.lift} — ${top.topLoad} kg` : `${prs.length} PRs – top ${top.lift} ${top.topLoad} kg`] : []),
          ...(moves ? [`${moves} ${moves === 1 ? "exercise" : "exercises"}`] : []),
          ...(vol ? [`${vol.toLocaleString()} kg`] : []),
        ],
        at,
        when: relativeTime(at, now),
        // A record is the headline figure when there is one; otherwise the
        // session's tonnage, as before.
        metric: top ? top.topLoad : vol || undefined,
        accent: top ? "amber" : "lime",
        detail: sessionDetail(s, prs),
        _sort: sortAt,
      });
    });

    // First-class shared posts (status / PR card / workout card).
    const nm = author.displayName || "@" + author.handle;
    for (const post of subj.posts ?? []) {
      if (!Number.isFinite(post.at) || post.at < now - windowMs || post.at > now + 60_000) continue;
      const d = post.data ?? {};
      let title: string;
      let body: string | null = null;
      let lead: string | null = null;
      let chips: string[] = [];
      let accent: FeedAccent;
      let metric: number | undefined;
      if (post.kind === "pr") {
        title = `${nm} shared a PR`;
        lead = "PR";
        // Posts written before #231 stored only an e1RM. Read whichever shape
        // is on the row and LABEL IT for what it is, so a legacy post stays
        // honest ("133 kg e1RM") instead of being relabelled as a weight the
        // athlete never actually lifted. New posts carry topLoad.
        const shared = prPostFigure(d);
        chips = [`${d.lift ?? "Lift"} — ${shared.text}`];
        accent = "amber";
        metric = shared.value;
      } else if (post.kind === "workout") {
        title = `${nm} shared a workout`;
        lead = String(d.title ?? "Workout");
        chips = d.volume ? [`${Number(d.volume).toLocaleString()} kg`] : [];
        accent = "lime";
      } else {
        title = `${nm} posted`;
        body = post.text || null;
        accent = "violet";
      }
      // a caption on a shared card becomes the prose body above the summary
      if (post.text && post.kind !== "status") body = post.text;
      items.push({
        id: `post-${post.id}`,
        kind: "post",
        subjectType: "post",
        subjectId: post.id,
        author,
        title,
        body,
        chips,
        lead,
        at: post.at,
        when: relativeTime(post.at, now),
        metric,
        accent,
        detail: postDetail(post.kind, d),
        _sort: post.at + (author.closeFriend ? boostMs : 0),
      });
    }
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
      return roundKm(r.distanceKm);
    case "activeDays":
      return r.activeDays;
    case "streak":
      return streak(sessions, { now }).current;
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
  const sa = streak(a.sessions, { now });
  const sb = streak(b.sessions, { now });

  const lines: CompareLine[] = [
    { key: "volume", label: "Weekly volume", a: Math.round(ra.volume), b: Math.round(rb.volume), unit: "kg", leader: lead(ra.volume, rb.volume) },
    { key: "sessions", label: "Weekly sessions", a: ra.sessions, b: rb.sessions, unit: "", leader: lead(ra.sessions, rb.sessions) },
    { key: "distance", label: "Weekly distance", a: roundKm(ra.distanceKm), b: roundKm(rb.distanceKm), unit: "km", leader: lead(ra.distanceKm, rb.distanceKm) },
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
  /** heaviest ACTUAL load per lift (kg) — not an estimate (#231) */
  topLifts: { lift: string; topLoad: number }[];
}

export function profileStats(sessions: LoggedSession[], now = Date.now(), bw?: BodyweightInput): ProfileStats {
  return {
    totalSessions: sessions.length,
    totalVolumeKg: Math.round(totalVolume(sessions, bw)),
    currentStreak: streak(sessions, { now }).current,
    topLifts: bestTopLoadByLift(sessions).slice(0, 3).map((r) => ({ lift: r.lift, topLoad: r.weightKg })),
  };
}

// ------------------------------------------------ social notifications ------
export type SocialNotifKind =
  | "follow" // someone followed me
  | "follow_request" // someone asked to follow my private profile (actionable)
  | "kudos" // someone cheered my workout/PR
  | "comment" // someone commented on my item
  | "enroll_request" // a client wants to start my program (coach, actionable)
  | "enroll_active" // my coach accepted my enrolment
  | "enroll_declined"; // my coach declined my enrolment

export interface SocialNotifActor {
  handle?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface SocialNotifEvent {
  kind: SocialNotifKind;
  at: number; // epoch ms
  actor?: SocialNotifActor;
  /** program name, comment snippet, or "PR"/"workout" for kudos. */
  text?: string;
  /** route target (a profile/coach @handle). */
  handle?: string;
  /** present + actionable: approve/deny a follow request. */
  followerId?: string;
  /** present + actionable: accept/decline an enrolment request. */
  enrollmentId?: string;
}

export interface SocialNotifItem extends SocialNotifEvent {
  id: string;
  title: string;
  when: string;
  accent: FeedAccent;
  actionable: boolean;
}

function notifActorName(a?: SocialNotifActor): string {
  return a?.displayName || (a?.handle ? `@${a.handle}` : "Someone");
}

/** Format + sort social/coaching events into a notification list (newest first).
 *  Pure — the API gathers the raw events from the DB and hands them in. */
export function buildSocialNotifications(events: SocialNotifEvent[], now = Date.now()): SocialNotifItem[] {
  const items = events.map((e): SocialNotifItem => {
    const who = notifActorName(e.actor);
    let title = "";
    let accent: FeedAccent = "blue";
    let actionable = false;
    switch (e.kind) {
      case "follow": title = `${who} followed you`; accent = "blue"; break;
      case "follow_request": title = `${who} requested to follow you`; accent = "blue"; actionable = true; break;
      case "kudos": title = `${who} cheered your ${e.text || "workout"}`; accent = "lime"; break;
      case "comment": title = `${who} commented: "${(e.text || "").slice(0, 80)}"`; accent = "violet"; break;
      case "enroll_request": title = `${who} wants to start ${e.text || "your program"}`; accent = "amber"; actionable = true; break;
      case "enroll_active": title = `${who} accepted your enrolment in ${e.text || "the program"}`; accent = "lime"; break;
      case "enroll_declined": title = `${who} declined your enrolment in ${e.text || "the program"}`; accent = "amber"; break;
    }
    return {
      ...e,
      id: `${e.kind}-${e.followerId ?? e.enrollmentId ?? e.handle ?? e.at}`,
      title,
      when: relativeTime(e.at, now),
      accent,
      actionable,
    };
  });
  return items.sort((a, b) => b.at - a.at);
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
  /** A short athlete-review pull-quote for the marquee card; the card falls
   *  back to the coach's own `headline` when absent (real coaches until the
   *  storefront exposes a featured review). */
  quote?: string;
  /** Years coaching, for the proof strip; the cell is dropped when unknown. */
  years?: number;
  /** true → not a real account; the card routes to the marketplace instead of following. */
  placeholder?: boolean;
}

/** Seed people for the Today coach rail until real coaches publish storefronts.
 *  Deliberately diverse + clearly illustrative; the rail swaps to live coaches
 *  the moment the marketplace returns any. */
export const PLACEHOLDER_COACHES: DiscoverCoach[] = [
  { handle: "priya_nair", name: "Priya Nair", headline: "Olympic weightlifting, 10y", specialties: ["Olympic lifting", "Peaking"], rating: 4.9, reviews: 128, verified: true, accent: "violet", placeholder: true, quote: "She rebuilt my snatch from scratch in twelve weeks. Worth every session.", years: 10 },
  { handle: "marcus_bell", name: "Marcus Bell", headline: "Hybrid & Hyrox specialist", specialties: ["Hyrox", "Conditioning"], rating: 4.7, reviews: 64, verified: true, accent: "lime", placeholder: true, quote: "Took nine minutes off my Hyrox time without losing my squat.", years: 7 },
  { handle: "sofia_almeida", name: "Sofia Almeida", headline: "Marathon & 5k coach", specialties: ["Running", "Endurance"], rating: 4.8, reviews: 91, verified: false, accent: "blue", placeholder: true, quote: "First marathon under four hours, still lifting twice a week.", years: 8 },
  { handle: "dmitri_volkov", name: "Dmitri Volkov", headline: "Powerlifting, raw totals", specialties: ["Powerlifting", "Strength"], rating: 4.6, reviews: 42, verified: false, accent: "amber", placeholder: true, quote: "Forty kilos on my total in one prep. The man is a spreadsheet.", years: 12 },
  { handle: "lena_hoffmann", name: "Lena Hoffmann", headline: "Fat loss & physique", specialties: ["Bodybuilding", "Fat loss"], rating: 5.0, reviews: 73, verified: true, accent: "violet", placeholder: true, quote: "Leaner than ever and stronger in every single lift.", years: 6 },
  { handle: "coach_bray", name: "Coach Bray", headline: "Tactical & military prep", specialties: ["Tactical", "Strength"], rating: 4.4, reviews: 37, verified: false, accent: "lime", placeholder: true, quote: "Passed selection with room to spare. The rucks were dialled.", years: 15 },
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
    headline: String(c.headline ?? (Array.isArray(c.specialties) ? (c.specialties as string[]).join(", ") : "") ?? ""),
    specialties: Array.isArray(c.specialties) ? (c.specialties as string[]) : [],
    rating: typeof c.rating === "number" ? c.rating : null,
    reviews: typeof c.reviews === "number" ? c.reviews : undefined,
    verified: c.coachVerified === true,
    accent: RAIL_ACCENTS[i % RAIL_ACCENTS.length]!,
    quote: typeof c.quote === "string" && c.quote.trim() ? c.quote : undefined,
    years: typeof c.years === "number" && c.years > 0 ? c.years : undefined,
    placeholder: false,
  }));
}

