import { describe, it, expect } from "vitest";
import {
  cardPrLines,
  cardSetLines,
  prLines,
  sessionDetail,
  sessionStats,
  topSetLines,
  postDetail,
  feedStatText,
  feedFigureText,
  feedTierChip,
  feedDeltaText,
} from "./feed-card";
import type { PrHit } from "./engines";
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

describe("the records a workout set", () => {
  const hit = (over: Partial<PrHit> = {}): PrHit => ({ lift: "Deadlift", e1rm: 228, previous: 217, topLoad: 210, previousTopLoad: 200, ...over });

  it("lists EVERY record on the workout that set them, heaviest first", () => {
    const d = sessionDetail(session(), [hit(), hit({ lift: "Back Squat", topLoad: 160, previousTopLoad: 155, e1rm: 180, previous: 175 })]);
    expect(d.prs!.map((p) => p.lift)).toEqual(["Deadlift", "Back Squat"]);
    expect(d.prCount).toBe(2);
    // The second and third records used to be a bare count on a card that
    // named only the heaviest lift.
    expect(d.prs![1]).toMatchObject({ lift: "Back Squat", topLoadKg: 160, previousTopLoadKg: 155 });
  });

  it("keeps a card readable: two records drawn, the rest counted, and no lift twice", () => {
    const d = sessionDetail(session(), [hit(), hit({ lift: "Back Squat", topLoad: 160 }), hit({ lift: "Split Squat", topLoad: 40 })]);
    expect(cardPrLines(d.prs).map((p) => p.lift)).toEqual(["Deadlift", "Back Squat"]);
    // Back Squat has said its numbers on its record line; the top sets drop it.
    expect(d.sets!.map((l) => l.name)).toContain("Back Squat");
    expect(cardSetLines(d.sets, cardPrLines(d.prs)).map((l) => l.name)).toEqual(["Romanian Deadlift", "Split Squat"]);
    // No records at all → the top sets are untouched.
    const plain = sessionDetail(session());
    expect(cardSetLines(plain.sets, cardPrLines(plain.prs))).toEqual(plain.sets);
  });

  it("carries each record's own figure and the delta over the athlete's previous best", () => {
    const [pr] = prLines([hit()]);
    expect(pr).toMatchObject({ lift: "Deadlift", topLoadKg: 210, e1rmKg: 228, previousTopLoadKg: 200 });
    expect(feedDeltaText(pr!.deltaPct!)).toBe("+5%");
  });

  it("treats a lift never trained before as the beginner's record", () => {
    const [pr] = prLines([hit({ lift: "Pull-up", topLoad: 0, e1rm: 0, previousTopLoad: null, previous: null })]);
    expect(pr).toMatchObject({ firstEver: true });
    expect(pr!.deltaPct).toBeUndefined(); // nothing to improve on yet
  });

  it("makes the workout the p0 moment the PR card used to be, and earns tier 1 from a device", () => {
    const plain = sessionDetail(session());
    expect(plain).toMatchObject({ moment: "p2", archetype: "sets" });
    expect(plain.prs).toBeUndefined();

    expect(sessionDetail(session(), [hit()]).moment).toBe("p0");
    expect(sessionDetail(session(), [hit()]).tier).toBe(0); // claimed, no badge
    const watched = session({ device: { provider: "apple", uuid: "u1", activityLabel: "Traditional Strength Training", start: "2026-03-02T17:30:00.000Z", end: "2026-03-02T18:41:00.000Z", durationMin: 71 } });
    expect(sessionDetail(watched, [hit()]).tier).toBe(1);
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
  const t = (k: string) => ({ "feed.hl.sharedPr": "{lift} — PR", "feed.tier.2": "Witnessed", "feed.stat.min": "min", "feed.stat.volume": "volume", "feed.prCount": "{n} PRs" })[k] ?? k;

  it("leads a shared PR post with the lift and carries its load and tier", () => {
    const v = feedCardView(
      { author: { displayName: "Kasia Nowak", handle: "kasia" }, when: "2 h", lead: "PR", chips: ["Deadlift — 210 kg"], detail: { ...postDetail("pr", { lift: "Deadlift", topLoad: 210 }), tier: 2 } },
      { t, units: "kg" },
    );
    expect(v.lead).toBe("Deadlift — PR");
    expect(v.chips).toContain("210 kg");
    expect(v.chips).toContain("T2 Witnessed");
  });

  it("leads a workout that set records with the loudest one, not with its tonnage", () => {
    const d = sessionDetail(session(), [
      { lift: "Deadlift", e1rm: 228, previous: 217, topLoad: 210, previousTopLoad: 200 },
      { lift: "Back Squat", e1rm: 180, previous: 175, topLoad: 160, previousTopLoad: 155 },
    ]);
    const v = feedCardView({ author: { displayName: "Kasia Nowak", handle: "kasia" }, when: "2 h", lead: "Lower — W4D2", chips: [], detail: d }, { t, units: "kg" });
    expect(v.chips[0]).toBe("Deadlift 210 kg");
    expect(v.chips).toContain("2 PRs");
  });

  it("falls back to the legacy shape when no translator is passed", () => {
    const legacy = { author: { displayName: "Kasia Nowak", handle: "kasia" }, when: "2 h", lead: "PR", chips: ["Deadlift — 210 kg"], detail: postDetail("pr", { lift: "Deadlift", topLoad: 210 }) };
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
    expect(card.detail).toMatchObject({ archetype: "sets" });
    expect(card.detail!.sets!.length).toBeGreaterThan(0);
    expect(card.detail!.stats!.length).toBeGreaterThan(0);
  });

  it("posts the workout ONCE, with the records it set listed on it", () => {
    const feed = built();
    // One session, one post — never a workout card plus a PR card beside it.
    expect(feed).toHaveLength(1);
    expect(feed[0]!.kind).toBe("session");
    // Everything in this session is a first-ever, so the post is the moment.
    expect(feed[0]!.detail!.moment).toBe("p0");
    expect(feed[0]!.detail!.prs!.map((p) => p.lift)).toEqual(["Back Squat", "Romanian Deadlift", "Split Squat"]);
    expect(feed[0]!.detail!.prs![0]).toMatchObject({ topLoadKg: 160, firstEver: true });
  });
});
