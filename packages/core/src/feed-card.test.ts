import { describe, it, expect } from "vitest";
import {
  cardLead,
  cardQualifier,
  cardRecords,
  cardSetLines,
  feedHeadlineEarnsLead,
  feedStatParts,
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

  it("keeps a card readable: two records named, the rest counted, and no lift twice", () => {
    const d = sessionDetail(session(), [hit(), hit({ lift: "Back Squat", topLoad: 160 }), hit({ lift: "Split Squat", topLoad: 40 })]);
    const r = cardRecords(d);
    // The loudest record takes the hero figure; the next takes a quiet line.
    expect(r.lead!.lift).toBe("Deadlift");
    expect(r.lines.map((p) => p.lift)).toEqual(["Back Squat"]);
    expect(r.shown.map((p) => p.lift)).toEqual(["Deadlift", "Back Squat"]);
    expect(r.rest).toBe(1);
    // The record that took the hero never ALSO draws a line of its own.
    expect(r.lines.map((p) => p.lift)).not.toContain("Deadlift");
    // Back Squat has said its numbers on its record line; the top sets drop it.
    expect(d.sets!.map((l) => l.name)).toContain("Back Squat");
    expect(cardSetLines(d.sets, r.shown).map((l) => l.name)).toEqual(["Romanian Deadlift", "Split Squat"]);
    // No records at all → no hero, and the top sets are untouched.
    const plain = sessionDetail(session());
    const pr = cardRecords(plain);
    expect(pr).toMatchObject({ lead: null, lines: [], rest: 0 });
    expect(cardSetLines(plain.sets, pr.shown)).toEqual(plain.sets);
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

describe("the card's one big number", () => {
  const hit = (over: Partial<PrHit> = {}): PrHit => ({ lift: "Deadlift", e1rm: 228, previous: 217, topLoad: 210, previousTopLoad: 200, ...over });

  it("gives a record-setting SESSION the hero figure it could never reach before", () => {
    // The gate used to be `archetype === "stat"`, and a session is always
    // "sets" — so a p0 session drew its record at accessory-work size.
    const d = sessionDetail(session(), [hit()]);
    expect(d.archetype).toBe("sets");
    expect(cardLead(d)).toMatchObject({ label: "Deadlift", figureKg: 210, e1rmKg: 228 });
  });

  it("labels the figure with the lift, because the headline no longer names it", () => {
    expect(cardLead(sessionDetail(session(), [hit()]))!.label).toBe("Deadlift");
    // A shared PR post's HEADLINE already says the lift, so the label stays
    // null rather than printing it twice.
    expect(cardLead(postDetail("pr", { lift: "Deadlift", topLoad: 210 }))!.label).toBeNull();
  });

  it("gives a p2 session NO hero — the quiet row is what makes the loud one loud", () => {
    expect(cardLead(sessionDetail(session()))).toBeNull();
    expect(cardLead(postDetail("status", {}))).toBeNull();
    expect(cardLead(undefined)).toBeNull();
  });

  it("carries the record's own provenance onto the figure", () => {
    const watched = session({ device: { provider: "apple", uuid: "u1", activityLabel: "Traditional Strength Training", start: "2026-03-02T17:30:00.000Z", end: "2026-03-02T18:41:00.000Z", durationMin: 71 } });
    expect(cardLead(sessionDetail(watched, [hit()]))!.tier).toBe(1);
    expect(cardLead(sessionDetail(session(), [hit()]))!.tier).toBe(0);
  });

  it("hands a first-ever lift the figure with no delta to show for it", () => {
    const first = hit({ lift: "Pull-up", topLoad: 40, e1rm: 0, previousTopLoad: null, previous: null });
    expect(cardLead(sessionDetail(session(), [first]))).toMatchObject({ label: "Pull-up", firstEver: true, deltaPct: undefined });
  });
});

describe("a headline identical on every post is not a headline", () => {
  const hit = (over: Partial<PrHit> = {}): PrHit => ({ lift: "Deadlift", e1rm: 228, previous: 217, topLoad: 210, previousTopLoad: 200, ...over });

  it("leads with a title the ATHLETE chose", () => {
    expect(feedHeadlineEarnsLead({ detail: sessionDetail(session()) })).toBe(true);
  });

  it("drops a title the CLOCK wrote — every one of them", () => {
    for (const title of ["Late night workout", "Morning workout", "Afternoon workout", "Evening workout", "Night workout"]) {
      expect(feedHeadlineEarnsLead({ detail: sessionDetail(session({ title })) })).toBe(false);
    }
    // Case and stray whitespace are still the clock's title, not a name.
    expect(feedHeadlineEarnsLead({ detail: sessionDetail(session({ title: "  afternoon workout " })) })).toBe(false);
  });

  it("still leads with an auto title rather than leave the card anonymous", () => {
    // No hero and no top sets — a bare cardio session. A generic name beats a
    // row of numbers with nothing holding them.
    const bare = sessionDetail(session({ title: "Morning workout", blocks: [] }));
    expect(feedHeadlineEarnsLead({ detail: bare })).toBe(true);
    // …but the moment it has a record to lead with, the auto title goes.
    const withPr = sessionDetail(session({ title: "Morning workout" }), [hit()]);
    expect(feedHeadlineEarnsLead({ detail: withPr })).toBe(false);
  });

  it("never puts 'Posted' over a status update — the words ARE the post", () => {
    expect(feedHeadlineEarnsLead({ detail: postDetail("status", {}) })).toBe(false);
  });

  it("always leads a record headline, which names the lift", () => {
    expect(feedHeadlineEarnsLead({ detail: postDetail("pr", { lift: "Deadlift", topLoad: 210 }) })).toBe(true);
  });

  it("leads a legacy card with no detail at all — there is nothing else", () => {
    expect(feedHeadlineEarnsLead({})).toBe(true);
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
    const kg = feedStatText({ key: "volume", value: 12400 }, "kg", "en");
    const lb = feedStatText({ key: "volume", value: 12400 }, "lb", "en");
    expect(kg).toBe("12,400");
    expect(Number(lb.replace(/\D/g, ""))).toBeGreaterThan(12400);
  });

  it("groups digits in the APP's language, never the device's", () => {
    // THE DEFECT, pinned. These calls used to reach `toLocaleString()` with no
    // argument, so grouping resolved against the handset: 5360 kg rendered
    // "5.360" on a German or Polish device while the interface was in English,
    // and an English reader parses that as five point three six. It is
    // invisible to anyone testing on an English device, which is how it
    // shipped — so the guard states all three explicitly.
    const vol = (locale: string) => feedStatText({ key: "volume", value: 12400 }, "kg", locale);
    expect(vol("en")).toBe("12,400");
    expect(vol("de")).toBe("12.400");
    expect(vol("pl")).toBe("12 400");
    // Every branch takes the locale, not just tonnage.
    expect(feedStatText({ key: "sets", value: 12400 }, "kg", "de")).toBe("12.400");
    expect(feedStatText({ key: "distance", value: 12400 }, "kg", "de")).toBe("12.400");
    // A pace is a clock and has no grouping to get wrong in any language.
    expect(feedStatText({ key: "pace", value: 342 }, "kg", "de")).toBe("5:42");
  });

  it("gives every footer figure a unit, tonnage included", () => {
    // The card's stat row named tonnage "volume" and never said kg — the one
    // figure on the card with no unit at all.
    expect(feedStatParts({ key: "volume", value: 5360 }, "kg", "en")).toMatchObject({ value: "5,360", unit: "kg" });
    expect(feedStatParts({ key: "volume", value: 5360 }, "lb", "en").unit).toBe("lb");
    // Everything else already reads as a unit, so it stays a translated key.
    expect(feedStatParts({ key: "duration", value: 50 }, "kg", "en")).toMatchObject({ value: "50", unitKey: "feed.stat.min" });
    // The watch signature survives the collapse from three columns to one line.
    expect(feedStatParts({ key: "duration", value: 71, device: true }, "kg", "en").device).toBe(true);
    expect(feedStatParts({ key: "duration", value: 50 }, "kg", "en").device).toBe(false);
  });

  it("gives a figure ONE qualifier, and the delta outranks the first-ever", () => {
    // They are mutually exclusive by construction — a lift trained for the
    // first time has no previous best — but they had two slots on one line.
    expect(cardQualifier({ deltaPct: 14.3 })).toEqual({ kind: "delta", text: "+14.3%" });
    expect(cardQualifier({ firstEver: true })).toEqual({ kind: "first", labelKey: "feed.firstShort" });
    expect(cardQualifier({})).toBeNull();
    expect(cardQualifier({ firstEver: false })).toBeNull();
    // Defensive: an older payload carrying both gets the stronger claim, the
    // one measured against a real previous best.
    expect(cardQualifier({ deltaPct: 5, firstEver: true })!.kind).toBe("delta");
    // A regression, not an improvement, still owns the slot — the card must not
    // go quiet about a number moving the wrong way.
    expect(cardQualifier({ deltaPct: -2.5 })).toEqual({ kind: "delta", text: "-2.5%" });
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
