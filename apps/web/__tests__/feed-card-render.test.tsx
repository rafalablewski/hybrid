import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * THE FEED ROW RENDERS — a gate that actually renders (web). Twin of
 * apps/mobile/components/feed-card.test.tsx: the same shapes, through the same
 * shared card model, so the two renderers are held to one standard.
 *
 * The feed is the one screen whose text comes STRAIGHT off the network, and a
 * value in a text slot that isn't text is not a bad row — it THROWS
 * ("Objects are not valid as a React child (found: object with keys {...})"),
 * and the error boundary above it takes the whole screen with it. TypeScript
 * rejects that where the value is typed; this covers the branches it cannot
 * reach, over the JSON-round-tripped payload the client actually receives.
 */

vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/ui", () => ({ accentText: (v: string) => v }));
vi.mock("@/lib/use-media-query", () => ({ useIsMobile: () => true }));
vi.mock("@/components/social-ui", () => ({
  C: (v: string) => `var(--color-${v})`,
  Avatar: () => createElement("i"),
}));

const { default: FeedCard } = await import("@/components/feed-card");
const { buildSocialFeed, rankFeed } = await import("@hybrid/core");
type FeedItemView = import("@hybrid/core").FeedItemView;

const NOW = Date.parse("2026-08-07T12:00:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const author = { id: "u1", handle: "kasia", displayName: "Kasia Nowak", avatarUrl: null };
const stranger = { id: "u2", handle: "tom", displayName: null, avatarUrl: null };

const strength = (name: string, load: string, reps = "3") => ({ kind: "strength", name, sets: [{ reps, load }] });

/** The second session beats the first on BOTH lifts — two PRs, so the card
 *  carries `prCount` — and its recording makes the figure a tier-1 one. */
const sessions = [
  {
    id: "s0",
    title: "Lower",
    startedAt: iso(9 * 86_400_000),
    completedAt: iso(9 * 86_400_000 - 3_600_000),
    blocks: [strength("Deadlift", "200"), strength("Back Squat", "140", "5")],
  },
  {
    id: "s1",
    title: "Lower",
    startedAt: iso(2 * 3_600_000),
    completedAt: iso(3_600_000),
    blocks: [
      strength("Deadlift", "210"),
      strength("Back Squat", "150", "5"),
      { kind: "cardio", name: "Row", distance: 5, duration: 22 },
    ],
    device: { source: "apple_watch", durationMin: 64, avgHr: 131, distanceKm: 5.02, cardioSeconds: 1_320 },
  },
];

const posts = [
  { id: "p1", kind: "status", at: NOW - 4 * 3_600_000, text: "Back under the bar.", data: {} },
  { id: "p2", kind: "pr", at: NOW - 5 * 3_600_000, text: null, data: { lift: "Bench Press", topLoad: 120, e1rm: 131 } },
  // The pre-#231 shape: an e1RM and no topLoad, which renders as the estimate.
  { id: "p3", kind: "pr", at: NOW - 6 * 3_600_000, text: "Old row", data: { lift: "Bench Press", e1rm: 133 } },
  { id: "p4", kind: "workout", at: NOW - 7 * 3_600_000, text: null, data: { title: "Push", volume: 8_240 } },
];

/** A first-ever lift: nothing before it, so the card is the beginner's record. */
const firstEver = [{ id: "s2", title: "First pull", startedAt: iso(3_600_000), completedAt: iso(1_800_000), blocks: [strength("Pull-up", "0", "5")] }];

/** The wire: JSON drops every `undefined`, which is why a card built in a test
 *  and a card off the network are not the same object. */
const wire = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function render(item: FeedItemView): string {
  return renderToStaticMarkup(
    createElement(FeedCard, {
      item,
      units: "kg",
      onOpenProfile: () => {},
      onKudos: () => {},
      onComments: () => {},
      onDelete: () => {},
    }),
  );
}

const view = (item: unknown, extra: Record<string, unknown> = {}): FeedItemView =>
  wire({ ...(item as object), kudos: 3, comments: 1, kudosedByMe: false, mine: false, ...extra }) as FeedItemView;

describe("FeedCard renders every shape the feed can build", () => {
  const feed = buildSocialFeed(
    [
      { author, sessions: sessions as never, posts: posts as never },
      { author: stranger, sessions: firstEver as never },
    ],
    { now: NOW },
  );

  it("builds the shapes this gate is meant to cover", () => {
    // If the builder stops emitting one of these the gate is silently thinner,
    // so the coverage is asserted rather than assumed.
    const kinds = new Set(feed.map((i) => i.kind));
    expect(kinds).toEqual(new Set(["session", "pr", "post"]));
    expect(feed.some((i) => i.detail?.prCount)).toBe(true);
    expect(feed.some((i) => i.detail?.firstEver)).toBe(true);
    expect(feed.some((i) => i.detail?.tier)).toBe(true);
    expect(feed.some((i) => (i.detail?.stats?.length ?? 0) > 0)).toBe(true);
    expect(feed.some((i) => (i.detail?.sets?.length ?? 0) > 0)).toBe(true);
  });

  it.each(feed.map((item) => [`${item.kind} ${item.id}`, item] as const))("renders %s", (_label, item) => {
    expect(render(view(item))).toContain("<article");
  });

  it("renders a ranked card that carries its reason", () => {
    const ranked = rankFeed(feed, () => ({ relation: "follower" }), { now: NOW, maxPerAuthor: 99 });
    const withReason = ranked.filter((i) => i.reason);
    expect(withReason.length).toBeGreaterThan(0);
    for (const item of withReason) expect(render(view(item))).toContain("feed.why.followsYou");
  });

  it("renders own posts (the delete affordance) and the legacy detail-less shape", () => {
    const post = feed.find((i) => i.kind === "post")!;
    expect(render(view(post, { mine: true }))).toContain("<article");
    // A response from a server older than the card model: chips and a lead,
    // no `detail` — the row must still render rather than throw.
    const { detail: _detail, ...legacy } = post;
    expect(render(view({ ...legacy, chips: ["8,240 kg", "1 PR"], lead: "Push" }))).toContain("8,240 kg");
  });
});
