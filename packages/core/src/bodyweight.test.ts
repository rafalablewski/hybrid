import { describe, it, expect } from "vitest";
import { bodyweightLookup, bwAt } from "./bodyweight";
import { newPrsInSession } from "./engines/records";
import type { LoggedSession } from "./engines/session";

describe("bodyweightLookup", () => {
  const lookup = bodyweightLookup([
    { date: "2026-01-01", weightKg: 68 },
    { date: "2026-04-01", weightKg: 70 },
    { date: "2026-06-01", weightKg: 72 },
  ]);

  it("resolves the weight at (or before) a date", () => {
    expect(lookup("2026-05-01")).toBe(70);
    expect(lookup("2026-04-01")).toBe(70);
    expect(lookup("2026-07-01")).toBe(72);
  });

  it("uses the earliest measurement for sessions older than the log", () => {
    expect(lookup("2025-06-01")).toBe(68);
  });

  it("no date → the current (latest) weight; empty log → null", () => {
    expect(lookup()).toBe(72);
    expect(bodyweightLookup([])()).toBeNull();
  });

  it("bwAt resolves numbers, lookups and nothing", () => {
    expect(bwAt(75, "2026-01-01")).toBe(75);
    expect(bwAt(lookup, "2026-05-01")).toBe(70);
    expect(bwAt(null)).toBeNull();
    expect(bwAt(undefined)).toBeNull();
  });
});

describe("bodyweight-aware PRs", () => {
  const session = (id: string, startedAt: string, load: string, reps: string): LoggedSession => ({
    id,
    title: "",
    startedAt,
    blocks: [{ kind: "strength", name: "Weighted Pull-Up", sets: [{ load, reps }] }],
  });

  it("a weighted pull-up PRs on BW + added, with the same basis on both sides", () => {
    const lookup = bodyweightLookup([{ date: "2026-01-01", weightKg: 70 }]);
    const prior = [session("a", "2026-02-01", "10", "5")]; // e1rm on 80 kg
    const today = session("b", "2026-03-01", "15", "5"); // e1rm on 85 kg
    const hits = newPrsInSession(today, prior, lookup);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.e1rm).toBeGreaterThan(hits[0]!.previous!);
    // Without a bodyweight the same comparison still works on added load alone.
    expect(newPrsInSession(today, prior)).toHaveLength(1);
  });
});
