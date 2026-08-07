import { describe, it, expect } from "vitest";
import {
  sessionDetail,
  sessionStats,
  topSetLines,
  prDetail,
  postDetail,
  feedStatText,
  feedFigureText,
  feedTierChip,
  feedDeltaText,
} from "./feed-card";
import { buildSocialFeed, feedCardView } from "./social";
import type { LoggedSession } from "./engines";

const set = (load: string, reps: string, role?: "warmup") => ({ load, reps, ...(role ? { role } : {}) });

const session = (over: Partial<LoggedSession> = {}): LoggedSession => ({
  id: "s1",
  title: "Lower — W4D2",
  startedAt: "2026-03-02T17:30:00.000Z",
  completedAt: "2026-03-02T18:34:00.000Z",
  blocks: [
    { kind: "strength", name: "Back Squat", sets: [set("60", "5", "warmup"), set("140", "5"), set("160", "5")] },
    { kind: "strength", name: "Romanian Deadlift", sets: [set("120", "8"), set("120", "8")] },
    { kind: "strength", name: "Split Squat", sets: [set("40", "10/leg")] },
  ],
  ...over,
});

describe("top sets", () => {
  it("leads with the heaviest lines and reports the heaviest set's own reps", () => {
    const lines = topSetLines(session());
    expect(lines.map((l) => l.name)).toEqual(["Back Squat", "Romanian Deadlift", "Split Squat"]);
    expect(lines[0]).toMatchObject({ loadKg: 160, reps: "5", sets: 2 }); // warm-up excluded
  });

  it("keeps per-side and time notations verbatim rather than parsing them to a number", () => {
    expect(topSetLines(session())[2]!.reps).toBe("10/leg");
  });

  it("caps the lines — a feed card is not the training log", () => {
    const many = session({
      blocks: Array.from({ length: 8 }, (_, i) => ({
        kind: "strength" as const,
        name: `Lift ${i}`,
        sets: [set(String(50 + i), "5")],
      })),
    });
    expect(topSetLines(many)).toHaveLength(3);
    expect(topSetLines(many)[0]!.name).toBe("Lift 7"); // heaviest first
  });
});

describe("stat row", () => {
  it("counts working AND warm-up sets, sums volume, and derives duration", () => {
    const stats = sessionStats(session());
    expect(stats.find((s) => s.key === "sets")!.value).toBe(6);
    expect(stats.find((s) => s.key === "volume")!.value).toBeGreaterThan(0);
    expect(stats.find((s) => s.key === "duration")!.value).toBe(64);
  });

  it("marks the DEVICE's figures as measured, not typed", () => {
    const withWatch = session({
      device: { provider: "apple", uuid: "u1", activityLabel: "Traditional Strength Training", start: "2026-03-02T17:30:00.000Z", end: "2026-03-02T18:41:00.000Z", durationMin: 71, avgHr: 132 },
    });
    const stats = sessionStats(withWatch);
    const dur = stats.find((s) => s.key === "duration")!;
    expect(dur).toMatchObject({ value: 71, device: true }); // the watch outranks the clock
    expect(stats.find((s) => s.key === "hr")).toMatchObject({ value: 132, device: true });
  });
});

describe("PR cards", () => {
  it("is a p0 moment carrying its own figure and the delta over the athlete's previous best", () => {
    const d = prDetail({ lift: "Deadlift", topLoad: 210, e1rm: 228, previousTopLoad: 200, previous: 217 });
    expect(d).toMatchObject({ moment: "p0", archetype: "stat", headlineKey: "feed.hl.pr", figureKg: 210, e1rmKg: 228 });
    expect(feedDeltaText(d.deltaPct!)).toBe("+5%");
  });

  it("treats a lift never trained before as the beginner's record — same weight, warmer headline", () => {
    const d = prDetail({ lift: "Pull-up", topLoad: 0, previousTopLoad: null, previous: null });
    expect(d).toMatchObject({ moment: "p0", firstEver: true, headlineKey: "feed.hl.first" });
    expect(d.deltaPct).toBeUndefined(); // nothing to improve on yet
  });

  it("earns tier 1 from a matched device recording and claims nothing without one", () => {
    expect(prDetail({ lift: "Squat", topLoad: 180 }, { device: true }).tier).toBe(1);
    expect(prDetail({ lift: "Squat", topLoad: 180 }).tier).toBe(0);
  });
});

describe("shared posts", () => {
  it("renders a legacy e1RM-only PR post as the estimate it is, never as a lifted weight", () => {
    const d = postDetail("pr", { lift: "Bench Press", e1rm: 133 });
    expect(d.figureKg).toBeUndefined();
    expect(d.e1rmKg).toBe(133);
  });

  it("leads a status post with its text", () => {
    expect(postDetail("status", {})).toMatchObject({ archetype: "text", headlineKey: "feed.hl.post" });
  });
});

describe("formatting", () => {
  it("splits a figure so the unit can be set smaller without re-parsing a joined string", () => {
    expect(feedFigureText(210, "kg")).toEqual({ value: "210", unit: "kg" });
    expect(feedFigureText(100, "lb").unit).toBe("lb");
  });

  it("converts volume into the athlete's own unit", () => {
    const kg = feedStatText({ key: "volume", value: 12400 }, "kg");
    const lb = feedStatText({ key: "volume", value: 12400 }, "lb");
    expect(kg).toBe((12400).toLocaleString());
    expect(Number(lb.replace(/\D/g, ""))).toBeGreaterThan(12400);
  });

  it("shows NO badge for a claimed lift — absence is the mark, not a scarlet letter", () => {
    expect(feedTierChip(0)).toBeNull();
    expect(feedTierChip(undefined)).toBeNull();
    expect(feedTierChip(2)).toEqual({ short: "T2", labelKey: "feed.tier.2" });
  });
});

describe("the preview speaks the same language as the feed", () => {
  // feedCardView backs the Today preview strip on both clients. Given the card
  // model it must produce the CARD's headline and figures, not the legacy chip
  // soup — otherwise the same PR reads as a record in one place and as an
  // anonymous row two screens away.
  const t = (k: string) => ({ "feed.hl.pr": "{lift} — new PR", "feed.tier.2": "Witnessed", "feed.stat.min": "min", "feed.stat.volume": "volume" })[k] ?? k;

  it("leads a PR with the lift and carries its load, tier and delta", () => {
    const v = feedCardView(
      { author: { displayName: "Kasia Nowak", handle: "kasia" }, when: "2 h", lead: "PR", chips: ["Deadlift — 210 kg"], card: prDetail({ lift: "Deadlift", topLoad: 210, previousTopLoad: 200, previous: 217 }, { tier: 2 }) },
      { t, units: "kg" },
    );
    expect(v.lead).toBe("Deadlift — new PR");
    expect(v.chips).toContain("210 kg");
    expect(v.chips).toContain("T2 Witnessed");
  });

  it("falls back to the legacy shape when no translator is passed", () => {
    const legacy = { author: { displayName: "Kasia Nowak", handle: "kasia" }, when: "2 h", lead: "PR", chips: ["Deadlift — 210 kg"], card: prDetail({ lift: "Deadlift", topLoad: 210 }) };
    expect(feedCardView(legacy)).toMatchObject({ lead: "PR", chips: ["Deadlift — 210 kg"] });
  });

  it("never renders a bare @ for a profile-less athlete", () => {
    expect(feedCardView({ author: { displayName: "Jan Kowalski", handle: "" }, when: "1 h" }).name).toBe("Jan Kowalski");
    expect(feedCardView({ author: { displayName: null, handle: "" }, when: "1 h" }).name).toBe("Someone");
  });
});

describe("the feed carries the card payload", () => {
  const built = () =>
    buildSocialFeed(
      [{ author: { id: "u1", handle: "kasia", displayName: "Kasia Nowak" }, sessions: [session()] }],
      { now: Date.parse("2026-03-02T20:00:00.000Z") },
    );

  it("gives every session card its top sets and stat row", () => {
    const card = built().find((i) => i.kind === "session")!;
    expect(card.card).toMatchObject({ moment: "p2", archetype: "sets" });
    expect(card.card!.sets!.length).toBeGreaterThan(0);
    expect(card.card!.stats!.length).toBeGreaterThan(0);
  });

  it("gives a PR its own p0 card so a record never renders like a Tuesday", () => {
    const pr = built().find((i) => i.kind === "pr")!;
    expect(pr.card!.moment).toBe("p0");
    expect(pr.card!.figureKg).toBe(160);
    const sessionCard = built().find((i) => i.kind === "session")!;
    expect(sessionCard.card!.moment).toBe("p2");
  });
});

describe("the wire keeps its promise to clients already on a phone", () => {
  // `detail` was a STRING for the whole life of the feed before the card model,
  // and an installed build renders it straight into a text node. Widening it to
  // the card object threw "Objects are not valid as a React child" on a screen
  // those athletes never opened deliberately — so the card lives under `card`
  // and this field stays a string, on EVERY item, forever. An old build cannot
  // be redeployed; the server is the only side that can keep the promise.
  const feed = buildSocialFeed(
    [
      {
        author: { id: "u1", handle: "kasia", displayName: "Kasia Nowak" },
        sessions: [session()],
        posts: [
          { id: "p1", kind: "status", at: Date.parse("2026-03-02T18:00:00.000Z"), text: "Back under the bar." },
          { id: "p2", kind: "pr", at: Date.parse("2026-03-02T17:00:00.000Z"), data: { lift: "Bench Press", topLoad: 120 } },
          { id: "p3", kind: "workout", at: Date.parse("2026-03-02T16:00:00.000Z"), data: { title: "Push", volume: 8240 } },
        ],
      },
    ],
    { now: Date.parse("2026-03-02T20:00:00.000Z") },
  );

  it("sends a string in `detail` on every item, never an object", () => {
    expect(feed.length).toBeGreaterThan(3);
    for (const item of feed) expect(typeof item.detail).toBe("string");
  });

  it("says something in that string — an empty row is a broken row on an old build", () => {
    for (const item of feed) expect(item.detail.length).toBeGreaterThan(0);
  });

  it("carries the same facts as the card, joined without a middot", () => {
    const sessionItem = feed.find((i) => i.kind === "session")!;
    expect(sessionItem.detail).toContain(sessionItem.lead!);
    for (const chip of sessionItem.chips) expect(sessionItem.detail).toContain(chip);
    for (const item of feed) expect(item.detail).not.toContain("·");
  });
});
