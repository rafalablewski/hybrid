import { describe, it, expect } from "vitest";
import { activeDisciplines, formatDisciplinePace, disciplinePaceUnit, DISCIPLINE_META, ENDURANCE_DISCIPLINES } from "./endurance";
import { disciplineSessions, runTotals } from "./engines/running";
import type { LoggedSession } from "./engines/session";

const NOW = new Date("2026-06-10T12:00:00.000Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const cardio = (id: string, name: string, distance?: number, minutes?: number): LoggedSession => ({
  id, title: name, startedAt: daysAgo(Number(id)),
  blocks: [{ kind: "cardio", name, ...(distance ? { distance } : {}), ...(minutes ? { minutes } : {}) }],
});

const sessions: LoggedSession[] = [
  cardio("1", "Easy Run", 8, 48),
  cardio("2", "Easy Run", 10, 55),
  cardio("3", "Swimming", 1.5, 40),
  cardio("4", "Road Cycling", 30, 60),
  cardio("5", "Tennis", undefined, 60), // a sport — never endurance
];

describe("endurance hub", () => {
  it("activeDisciplines lists only endurance disciplines with data, most efforts first", () => {
    const active = activeDisciplines(sessions);
    expect(active.map((d) => d.discipline)).toEqual(["running", "cycling", "swimming"]);
    expect(active.find((d) => d.discipline === "running")!.efforts).toBe(2);
    // Tennis (a "sport") is excluded entirely.
    expect(active.some((d) => d.discipline === "sport")).toBe(false);
  });

  it("disciplineSessions isolates one discipline's cardio", () => {
    expect(runTotals(disciplineSessions(sessions, "swimming")).efforts).toBe(1);
    expect(runTotals(disciplineSessions(sessions, "cycling")).distanceKm).toBe(30);
    expect(runTotals(disciplineSessions(sessions, "running")).efforts).toBe(2);
  });

  it("formatDisciplinePace labels each discipline in its own unit", () => {
    // 6:00/km canonical rate (360 sec/km).
    expect(formatDisciplinePace(360, "running")).toBe("6:00 /km");
    // Swimming splits per 100m: 360 * 0.1 = 36s → 0:36 /100m.
    expect(formatDisciplinePace(360, "swimming")).toBe("0:36 /100m");
    // Rowing per 500m: 360 * 0.5 = 180s → 3:00 /500m.
    expect(formatDisciplinePace(360, "rowing")).toBe("3:00 /500m");
    // Cycling is a SPEED: 3600/360 = 10 km/h.
    expect(formatDisciplinePace(360, "cycling")).toBe("10 km/h");
    expect(formatDisciplinePace(0, "running")).toBe("–");
  });

  it("disciplinePaceUnit gives the bare unit label", () => {
    expect(disciplinePaceUnit("running")).toBe("/km");
    expect(disciplinePaceUnit("swimming")).toBe("/100m");
    expect(disciplinePaceUnit("rowing")).toBe("/500m");
    expect(disciplinePaceUnit("cycling")).toBe("km/h");
  });

  it("every endurance discipline has metadata and none is the excluded sport", () => {
    for (const d of ENDURANCE_DISCIPLINES) expect(DISCIPLINE_META[d]).toBeTruthy();
    expect(ENDURANCE_DISCIPLINES).not.toContain("sport");
  });
});
