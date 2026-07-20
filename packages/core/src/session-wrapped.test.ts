import { describe, it, expect } from "vitest";
import { sessionWrapped } from "./session-wrapped";
import type { LoggedSession } from "./engines/session";

const strengthSession = (id: string, startedAt: string, load: number): LoggedSession => ({
  id,
  title: "Push day",
  startedAt,
  completedAt: new Date(Date.parse(startedAt) + 45 * 60000).toISOString(),
  blocks: [
    {
      kind: "strength",
      name: "Bench Press",
      sets: [
        { load: String(load), reps: "5" },
        { load: String(load), reps: "5" },
        { load: String(load), reps: "5" },
      ],
    },
  ],
});

describe("sessionWrapped", () => {
  it("returns the free basics: sets, reps, volume, time", () => {
    const s = strengthSession("s1", "2026-01-10T10:00:00.000Z", 60);
    const w = sessionWrapped(s, [s], { units: "kg" });
    const labels = w.basics.map((b) => b.labelKey);
    expect(labels).toContain("summary.sets");
    expect(labels).toContain("session.wrapped.reps");
    expect(labels).toContain("summary.volumeMoved");
    expect(labels).toContain("summary.minutes");
    // 3 logged sets, 15 reps total.
    expect(w.basics.find((b) => b.labelKey === "summary.sets")?.value).toBe("3");
    expect(w.basics.find((b) => b.labelKey === "session.wrapped.reps")?.value).toBe("15");
  });

  it("surfaces premium facts including est-1RM and the muscle split", () => {
    const s = strengthSession("s1", "2026-01-10T10:00:00.000Z", 60);
    const w = sessionWrapped(s, [s], { units: "kg" });
    const labels = w.facts.map((f) => f.labelKey);
    expect(labels).toContain("session.wrapped.est1rm");
    // volumeByMuscle attributes bench tonnage to chest.
    expect(labels.some((l) => l.startsWith("muscle."))).toBe(true);
  });

  it("adds an e1RM trend fact when the lift has prior history", () => {
    const older = strengthSession("s0", "2026-01-01T10:00:00.000Z", 50);
    const s = strengthSession("s1", "2026-01-10T10:00:00.000Z", 60);
    const w = sessionWrapped(s, [older, s], { units: "kg" });
    const trend = w.facts.find((f) => f.labelKey === "session.wrapped.trend");
    expect(trend).toBeTruthy();
    expect(trend?.tone).toBe("up");
    expect(trend?.value.startsWith("+")).toBe(true);
  });

  it("includes readiness when the session logged it", () => {
    const s = { ...strengthSession("s1", "2026-01-10T10:00:00.000Z", 60), readiness: 82 };
    const w = sessionWrapped(s, [s], { units: "kg" });
    expect(w.facts.find((f) => f.labelKey === "home.readiness")?.value).toBe("82");
  });
});
