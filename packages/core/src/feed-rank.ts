/**
 * FEED RANKING v1 — moment first, relationship second, the clock third.
 *
 * Engagement-probability ranking, left to itself, converges on whatever
 * provokes a reaction; that is X's lesson and it is not a lesson worth
 * repeating in a training app. Pure recency is the opposite failure: a friend's
 * first-ever pull-up buried under nine ordinary Tuesdays (Strava's).
 *
 * So the score leads with MOMENT — an editorial judgment, set by product in
 * feed-card.ts and never learned — and treats predicted engagement as a CAPPED
 * multiplier that can break a tie but can never set the agenda:
 *
 *     score = M x (1 + A) x (1 + F) x E x D(t)
 *
 *   M  moment    p0 interrupts, p1 leads, p2 fills, p3 seasons; a verified PR
 *                outranks a claimed one, and a first-ever outranks a repeat.
 *   A  affinity  the relationship, TWO-WAY only — being followed by someone
 *                popular earns nothing. Interaction history compounds it.
 *   F  fit       why a stranger can outrank a friend: your coach, your gym,
 *                your strength band, your program.
 *   E  engagement CLAMPED to [0.8, 1.5]. v1 has no model and passes 1.
 *   D  decay     per-family half-life — a PR stays interesting for days, a
 *                live session for minutes. One global half-life is why other
 *                feeds read as either stale or frantic.
 *
 * GUARDRAILS are not tuning parameters: author diversity is capped so one
 * prolific week cannot own the feed, and every card that is NOT from someone
 * you follow must be able to say why it's there in a few words — if we can't
 * name the reason, we don't show the card.
 *
 * v1 is deliberately heuristic and server-side. The signals a caller cannot
 * honestly supply yet (gym, program, strength band — none of which are
 * modelled) are simply absent, and absent means "no boost", never a guess.
 */
import type { FeedItem } from "./social";
import type { Relation } from "./social";

/** What the server knows about the viewer's relationship to one author. Every
 *  field is optional: a signal we can't compute honestly is left out, and
 *  contributes nothing rather than being invented. */
export interface FeedSignals {
  relation?: Relation;
  /** kudos + comments exchanged BOTH ways in the recent window (count). */
  interactions?: number;
  /** the author coaches the viewer (or the viewer coaches them). */
  coach?: boolean;
  /** the author is the viewer. */
  mine?: boolean;
  /** same gym — not modelled yet; accepted so the shape is ready. */
  sameGym?: boolean;
  /** running the same program right now. */
  sameProgram?: boolean;
  /** 0..1, how close the author's strength is to the viewer's on this lift. */
  strengthProximity?: number;
  /** predicted p(engagement), 0..1. v1 passes nothing and the term is 1. */
  engagement?: number;
}

/** Why a card is in the feed, as an i18n key (+ its argument). Shown on any
 *  card the viewer does not already follow. */
export interface FeedReason {
  key: string;
  arg?: string;
}

export interface RankOptions {
  now?: number;
  /** max cards from one author in the returned list (default 2). */
  maxPerAuthor?: number;
  limit?: number;
}

// ---- the terms --------------------------------------------------------------

/** M — the editorial term. Moment class leads; evidence and rarity modulate it
 *  WITHIN the class, never across (a verified Tuesday is still a Tuesday). */
export function momentWeight(item: FeedItem): number {
  const d = item.detail;
  const base = d?.moment === "p0" ? 4 : d?.moment === "p1" ? 2.4 : d?.moment === "p3" ? 0.6 : 1;
  let m = base;
  // Provenance pays only where a claim is actually being made. A tier badge on
  // a PR means the number survived scrutiny; the same badge on a session card
  // would just be rewarding people for owning a watch.
  if (d?.archetype === "stat" && d.tier) m *= 1 + Math.min(d.tier, 2) * 0.12;
  // A lift never trained before is rarer than another 2.5 kg on a bar you have
  // loaded a hundred times — and it is the card that keeps a beginner posting.
  if (d?.firstEver) m *= 1.2;
  // A big jump over your own previous best, not a big absolute number: this is
  // how a beginner's card can outrank an elite's without a special case.
  if (d?.deltaPct) m *= 1 + Math.min(d.deltaPct, 15) / 100;
  return m;
}

/** A — affinity. Two-way relationships only. */
export function affinity(s: FeedSignals): number {
  const rel =
    s.relation === "close" ? 1
    : s.relation === "friend" ? 0.7
    : s.relation === "following" ? 0.4
    : s.relation === "self" ? 0.5 // your own training is worth seeing, not chasing
    : s.relation === "follower" ? 0.1
    : 0;
  // Interactions compound the edge but saturate: ten kudos exchanged is a real
  // bond, a hundred is the same bond.
  const inter = Math.min(s.interactions ?? 0, 10) * 0.05;
  return rel + inter;
}

/** F — fit. The term that lets a stranger outrank a friend when they're more
 *  useful to the viewer's own training. */
export function fit(s: FeedSignals): number {
  let f = 0;
  if (s.coach) f += 0.5; // your coach speaking to you is not "content"
  if (s.sameGym) f += 0.35;
  if (s.sameProgram) f += 0.3;
  if (s.strengthProximity) f += Math.max(0, Math.min(1, s.strengthProximity)) * 0.3;
  return f;
}

/** E — predicted engagement, CLAMPED. The clamp is the entire point: this term
 *  exists to break ties between comparable cards, not to choose what the feed
 *  is about. */
export function engagementMultiplier(s: FeedSignals): number {
  if (s.engagement == null) return 1;
  return Math.max(0.8, Math.min(1.5, 0.8 + s.engagement * 0.7));
}

/** Half-life in hours, per family. Different content ages differently. */
export function halfLifeHours(item: FeedItem): number {
  if (item.kind === "pr") return 72;
  if (item.kind === "recap") return 120;
  if (item.kind === "post") return 168;
  return 18; // a session
}

/** D(t) — freshness. Exponential decay on the item's own half-life. */
export function decay(item: FeedItem, now: number): number {
  const ageH = Math.max(0, (now - item.at) / 3_600_000);
  return Math.pow(0.5, ageH / halfLifeHours(item));
}

/** The composed score for one item. Exported so a debug surface (and the
 *  tests) can explain any position in the feed. */
export function scoreItem(item: FeedItem, s: FeedSignals, now: number): number {
  return momentWeight(item) * (1 + affinity(s)) * (1 + fit(s)) * engagementMultiplier(s) * decay(item, now);
}

/**
 * Why this card is here, in a few words. A card the viewer already follows
 * needs no explanation; anything else must be able to give one, and if we
 * can't name a reason the caller should not be ranking it in.
 */
export function reasonFor(s: FeedSignals): FeedReason | null {
  if (s.mine) return null;
  if (s.coach) return { key: "feed.why.coach" };
  if (s.relation === "close" || s.relation === "friend" || s.relation === "following") return null;
  if (s.sameGym) return { key: "feed.why.gym" };
  if (s.sameProgram) return { key: "feed.why.program" };
  if (s.strengthProximity != null && s.strengthProximity > 0.6) return { key: "feed.why.strength" };
  if (s.relation === "follower") return { key: "feed.why.followsYou" };
  return null;
}

/**
 * Rank a feed. Returns the items reordered, each carrying its `reason` when it
 * needs one, with the author-diversity cap applied.
 *
 * The cap runs AFTER scoring, not before: an athlete's third card in a day is
 * dropped from this view no matter how well it scored, so one prolific week
 * can't own someone's feed. Dropped items are not deleted — they are simply
 * not in this ranking, and the chronological Following tab still has them.
 */
export function rankFeed<T extends FeedItem>(
  items: T[],
  signalsFor: (item: T) => FeedSignals,
  opts: RankOptions = {},
): Array<T & { reason?: FeedReason }> {
  const now = opts.now ?? Date.now();
  const maxPerAuthor = opts.maxPerAuthor ?? 2;

  const scored = items.map((item) => {
    const s = signalsFor(item);
    return { item, s, score: scoreItem(item, s, now) };
  });
  // Ties break by recency, so the order is stable and never arbitrary.
  scored.sort((a, b) => b.score - a.score || b.item.at - a.item.at);

  const perAuthor = new Map<string, number>();
  const out: Array<T & { reason?: FeedReason }> = [];
  for (const { item, s } of scored) {
    const seen = perAuthor.get(item.author.id) ?? 0;
    if (seen >= maxPerAuthor) continue;
    perAuthor.set(item.author.id, seen + 1);
    const reason = reasonFor(s);
    out.push(reason ? { ...item, reason } : item);
    if (opts.limit && out.length >= opts.limit) break;
  }
  return out;
}
