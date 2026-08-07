import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * THE FEED ROW RENDERS — a gate that actually renders (mobile).
 *
 * The feed is the one screen whose text comes STRAIGHT off the network, and
 * every zone reads a different field of the card model. TypeScript rejects an
 * object in a text slot at compile time, but only where the value is typed:
 * anything that reaches a Text through an `any`, a cast, or a server that
 * disagrees with the DTO gets there unchecked, and React answers with
 * "Objects are not valid as a React child (found: object with keys {...})" —
 * a THROW, which the root error boundary turns into a blank app, not a blank
 * row.
 *
 * So the card is rendered here for every shape `buildSocialFeed` can produce —
 * session, PR (device-tiered, multi-PR, first-ever), all three post kinds, a
 * ranked card carrying a `reason`, and the legacy detail-less shape — over the
 * JSON-round-tripped payload the client actually receives (`undefined` fields
 * gone, exactly as the wire delivers them). Its web twin is
 * apps/web/__tests__/feed-card-render.test.tsx.
 *
 * Only the NATIVE edges are mocked (react-native, react-native-svg, the theme /
 * i18n / typography hooks). Everything the card decides — the zones, the
 * headline, the figure, the top sets, the stat row — is the real component.
 */

const host = (tag: string) => ({ children }: { children?: ReactNode }) => createElement(tag, null, children);

vi.mock("react-native", () => ({
  View: host("div"),
  Text: host("span"),
  Image: host("img"),
}));
vi.mock("react-native-svg", () => ({
  default: host("svg"),
  Svg: host("svg"),
  Path: host("path"),
  Rect: host("rect"),
  Circle: host("circle"),
}));
vi.mock("../lib/ui", () => ({
  F: new Proxy({}, { get: () => "Archivo" }),
  fs: new Proxy({}, { get: () => 13 }),
  leading: () => 18,
  serifIf: () => "Archivo",
  tracking: new Proxy({}, { get: () => 0 }),
  PressScale: ({ children }: { children?: ReactNode }) => createElement("button", null, children),
}));
vi.mock("../lib/theme", () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => "#000" }), scheme: "dark" }),
  txt: () => "#000",
}));
vi.mock("../lib/i18n", () => ({ useLang: () => ({ t: (key: string) => key }) }));
vi.mock("./social-kit", () => ({ Avatar: () => createElement("i") }));
vi.mock("./aurora/kit", () => ({ GUTTER: 12, RADIUS: { pill: 999 } }));

const { default: FeedCard } = await import("./feed-card");
const { buildSocialFeed, rankFeed } = await import("@hybrid/core");
type FeedItemView = import("@hybrid/core").FeedItemView;

const NOW = Date.parse("2026-08-07T12:00:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const author = { id: "u1", handle: "kasia", displayName: "Kasia Nowak", avatarUrl: null };
const stranger = { id: "u2", handle: "tom", displayName: null, avatarUrl: null };

const strength = (name: string, load: string, reps = "3") => ({ kind: "strength", name, sets: [{ reps, load }] });

/** Two sessions: the second beats the first on BOTH lifts, so it sets two PRs
 *  and the card carries `prCount`. The recording makes it a tier-1 figure. */
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
    expect(feed.some((i) => i.card?.prCount)).toBe(true);
    expect(feed.some((i) => i.card?.firstEver)).toBe(true);
    expect(feed.some((i) => i.card?.tier)).toBe(true);
    expect(feed.some((i) => (i.card?.stats?.length ?? 0) > 0)).toBe(true);
    expect(feed.some((i) => (i.card?.sets?.length ?? 0) > 0)).toBe(true);
  });

  it.each(feed.map((item) => [`${item.kind} ${item.id}`, item] as const))("renders %s", (_label, item) => {
    expect(render(view(item))).toContain("<div");
  });

  it("renders a ranked card that carries its reason", () => {
    const ranked = rankFeed(feed, () => ({ relation: "follower" }), { now: NOW, maxPerAuthor: 99 });
    const withReason = ranked.filter((i) => i.reason);
    expect(withReason.length).toBeGreaterThan(0);
    for (const item of withReason) expect(render(view(item))).toContain("feed.why.followsYou");
  });

  it("renders own posts (the delete affordance) and the legacy detail-less shape", () => {
    const post = feed.find((i) => i.kind === "post")!;
    expect(render(view(post, { mine: true }))).toContain("<div");
    // A response from a server older than the card model: chips and a lead,
    // no `card` — the row must still render rather than throw.
    const { card: _card, ...legacy } = post;
    // Chips are mono uppercase, so the legacy row proves itself by its text.
    expect(render(view({ ...legacy, chips: ["8,240 kg", "1 PR"], lead: "Push" }))).toContain("8,240 KG");
  });
});
