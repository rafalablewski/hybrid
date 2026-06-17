import { describe, it, expect } from "vitest";
import { buildActivityFeed, relativeTime, type ActivityAssignment } from "./activity";
import type { LoggedSession } from "./engines/session";

const NOW = Date.parse("2026-06-17T12:00:00Z");
const sess = (id: string, daysAgo: number, title: string): LoggedSession => ({
  id,
  title,
  startedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  blocks: [{ kind: "strength", name: "Squat", sets: [] } as never],
});
const assign = (id: string, daysAhead: number, name: string, status = "assigned"): ActivityAssignment => ({
  id,
  name,
  date: new Date(NOW + daysAhead * 86_400_000).toISOString(),
  status,
});

describe("activity feed", () => {
  it("includes recent completed sessions and upcoming assignments", () => {
    const feed = buildActivityFeed({
      sessions: [sess("s1", 1, "Push day"), sess("s2", 30, "Old day")],
      assignments: [assign("a1", 2, "Pushups session")],
      now: NOW,
    });
    const ids = feed.map((i) => i.id);
    expect(ids).toContain("session-s1");
    expect(ids).toContain("assign-a1");
    expect(ids).not.toContain("session-s2"); // outside the 14d window
  });

  it("puts upcoming before completed", () => {
    const feed = buildActivityFeed({ sessions: [sess("s1", 1, "Push")], assignments: [assign("a1", 1, "Run")], now: NOW });
    expect(feed[0]!.kind).toBe("upcoming");
  });

  it("ignores non-assigned + skips fabricated entries on empty data", () => {
    expect(buildActivityFeed({ sessions: [], assignments: [assign("a1", 1, "x", "completed")], now: NOW })).toEqual([]);
  });

  it("formats relative time", () => {
    expect(relativeTime(NOW - 3600_000, NOW)).toBe("1h ago");
    expect(relativeTime(NOW + 2 * 86_400_000, NOW)).toBe("in 2d");
    expect(relativeTime(NOW, NOW)).toBe("just now");
  });
});
