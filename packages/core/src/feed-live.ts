/**
 * NOW TRAINING — live presence, and the argument against stories.
 *
 * Every social product eventually ships stories, and in a lifting app they are
 * a bad fit twice over: they are AUTHORED ephemera (someone has to decide to
 * film themselves between sets, which almost nobody will), and they answer a
 * question nobody asked. The question athletes actually ask is "who's at the
 * gym right now?" — and that is not content, it is STATE, which the app
 * already holds.
 *
 * A session that has been started and not finished IS the live signal. No new
 * schema, no authoring step, no extra query: the feed already loads recent
 * sessions, and the in-progress ones are sitting in that same payload.
 *
 * TWO HONESTY RULES make this trustworthy rather than creepy:
 *
 *   1. A forgotten session is not a live one. People walk out without pressing
 *      finish, so presence EXPIRES (`windowMin`, default 180). After that the
 *      athlete simply isn't shown — we never claim someone is training because
 *      a row was left open overnight.
 *   2. Presence is only ever shown to people the viewer already follows, and
 *      the caller applies the same block list as the feed. Broadcasting "this
 *      person is at their gym right now" to strangers is a safety problem, and
 *      no amount of engagement is worth it (see the spec's privacy review).
 *
 * Pure: the API hands in the same subjects it built the feed from.
 */
import { migrateBlocks, type LoggedSession, type SessionBlock } from "./engines";
import type { FeedAccent, FeedAuthor, FeedSubjectInput } from "./social";

/** One athlete, mid-session. */
export interface LiveAthlete {
  author: FeedAuthor;
  sessionId: string;
  /** the session's title, as the athlete named it. */
  title: string;
  /** whole minutes since they started. */
  elapsedMin: number;
  /** what they're on right now — the last block they logged into, or null when
   *  they've started but haven't logged anything yet. */
  currentExercise: string | null;
  /** discipline accent, from the work itself: strength lime, conditioning teal. */
  accent: FeedAccent;
  /** epoch ms, for sorting. */
  startedAt: number;
}

export interface LiveOptions {
  now?: number;
  /** how long a session stays "live" before we stop believing it (default 180). */
  windowMin?: number;
  /** cap the strip (default 12). */
  limit?: number;
  /** the viewer's own id — you are never in your own presence strip. */
  viewerId?: string;
}

/** Default minutes before an unfinished session stops counting as live. Shared
 *  with buildSocialFeed so the two can never disagree about which sessions are
 *  in progress. */
export const LIVE_WINDOW_MIN = 180;

/** Is this session still plausibly happening right now? */
export function isLive(session: Pick<LoggedSession, "startedAt" | "completedAt">, now: number, windowMin = LIVE_WINDOW_MIN): boolean {
  if (session.completedAt) return false;
  const started = Date.parse(session.startedAt);
  if (!Number.isFinite(started)) return false;
  const elapsed = now - started;
  // Not in the future (clock skew), and not so long ago that "live" is a lie.
  return elapsed >= 0 && elapsed <= windowMin * 60_000;
}

/** The block the athlete is currently working through — the LAST one with any
 *  logged work in it, which is where the live logger writes. */
function currentBlock(blocks: SessionBlock[]): SessionBlock | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (b.kind === "strength" ? b.sets.length > 0 : true) return b;
  }
  return null;
}

const accentFor = (b: SessionBlock | null): FeedAccent =>
  b == null ? "lime" : b.kind === "cardio" || b.kind === "conditioning" ? "blue" : "lime";

/**
 * Who is training right now, newest start first. Takes the SAME subjects the
 * feed was built from, so the strip costs nothing extra.
 */
export function buildLiveNow(subjects: FeedSubjectInput[], opts: LiveOptions = {}): LiveAthlete[] {
  const now = opts.now ?? Date.now();
  const windowMin = opts.windowMin ?? LIVE_WINDOW_MIN;
  const out: LiveAthlete[] = [];

  for (const subj of subjects) {
    if (opts.viewerId && subj.author.id === opts.viewerId) continue; // you know you're training
    // One entry per athlete: if somehow two sessions are open, the newest is
    // the one they're actually in.
    const live = subj.sessions
      .filter((s) => isLive(s, now, windowMin))
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
    if (!live) continue;

    const blocks = migrateBlocks(live.blocks);
    const block = currentBlock(blocks);
    const startedAt = Date.parse(live.startedAt);
    out.push({
      author: subj.author,
      sessionId: live.id,
      title: live.title,
      elapsedMin: Math.max(0, Math.round((now - startedAt) / 60_000)),
      currentExercise: block?.name ?? null,
      accent: accentFor(block),
      startedAt,
    });
  }

  return out.sort((a, b) => b.startedAt - a.startedAt).slice(0, opts.limit ?? 12);
}

/** Elapsed time as the strip shows it: mm:ss is false precision for something
 *  polled on a refresh, so a live session reads in minutes and rolls to hours. */
export function liveElapsedText(elapsedMin: number): string {
  if (elapsedMin < 60) return `${elapsedMin}m`;
  const h = Math.floor(elapsedMin / 60);
  const m = elapsedMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
