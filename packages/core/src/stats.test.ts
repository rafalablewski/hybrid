import { describe, it, expect } from "vitest";
import { sessionBuckets } from "./stats";
import type { LoggedSession } from "./engines/session";

const NOW = Date.parse("2026-06-17T12:00:00Z"); // a Wednesday
const sess = (id: string, daysAgo: number): LoggedSession => ({
  id,
  title: "S",
  startedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  blocks: [],
});

describe("sessionBuckets", () => {
  it("week → 7 daily buckets with today counted", () => {
    const s = sessionBuckets([sess("a", 0), sess("b", 0), sess("c", 2)], "week", NOW);
    expect(s.buckets).toHaveLength(7);
    expect(s.buckets[6]!.value).toBe(2); // today (last bucket)
    expect(s.total).toBe(3);
    expect(s.activeDays).toBe(2);
    expect(s.peakIndex).toBe(6);
  });

  it("month → 5 weekly buckets", () => {
    const s = sessionBuckets([sess("a", 1), sess("b", 9)], "month", NOW);
    expect(s.buckets).toHaveLength(5);
    expect(s.total).toBe(2);
  });

  it("year → 12 monthly buckets, empty data all zero", () => {
    const s = sessionBuckets([], "year", NOW);
    expect(s.buckets).toHaveLength(12);
    expect(s.total).toBe(0);
    expect(s.peakIndex).toBe(-1);
  });
});
