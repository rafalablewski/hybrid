import { describe, it, expect } from "vitest";
import { sportPages, sportPagesTotal, sportPageTitle } from "./sport-pages";
import { SPORT_PAGE_WEEKS } from "./sport-page";
import type { LoggedSession } from "./engines/session";

const NOW = Date.parse("2026-07-31T12:00:00.000Z");
const DAY = 86_400_000;

/** One session holding one cardio effort, `daysAgo` before NOW. */
function effort(
  id: string,
  name: string,
  discipline: "running" | "cycling" | "swimming" | "sport",
  daysAgo: number,
  distance: number,
  minutes: number,
): LoggedSession {
  return {
    id,
    title: name,
    startedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    blocks: [{ kind: "cardio", name, discipline, distance, minutes }],
  } as LoggedSession;
}

/* A hybrid athlete whose biggest sport by TIME is the one the old lanes buried:
   tennis carries no distance, so it never qualified as an endurance lane. */
const SESSIONS: LoggedSession[] = [
  effort("t1", "Tennis", "sport", 2, 0, 90),
  effort("t2", "Tennis", "sport", 9, 0, 75),
  effort("r1", "Easy run", "running", 3, 8, 46),
  effort("r2", "Long run", "running", 10, 18, 108),
  effort("b1", "Zone 2", "cycling", 5, 42, 84),
  effort("s1", "Threshold 100s", "swimming", 1, 1.8, 30),
];

describe("sportPages", () => {
  it("gives every sport trained in the window a page, most MINUTES first", () => {
    const pages = sportPages(SESSIONS, { now: NOW });
    expect(pages.map((p) => p.key)).toEqual([
      "s:Tennis", // 165 min — the sport the lanes could not show at all
      "d:running", // 154
      "d:cycling", // 84
      "d:swimming", // 30
    ]);
    expect(pages[0]!.minutes).toBe(165);
    expect(pages[0]!.efforts).toBe(2);
  });

  it("puts a ball sport and a discipline in the SAME shape", () => {
    const [tennis, running] = sportPages(SESSIONS, { now: NOW });
    expect(tennis!.kind).toBe("sport");
    expect(tennis!.sport).toBe("Tennis");
    expect(tennis!.labelKey).toBeNull();
    expect(running!.kind).toBe("discipline");
    expect(running!.discipline).toBe("running");
    expect(running!.labelKey).toBeTruthy();
    expect(Object.keys(tennis!).sort()).toEqual(Object.keys(running!).sort());
  });

  it("renders NO distance and NO pace for a sport that has neither", () => {
    const tennis = sportPages(SESSIONS, { now: NOW })[0]!;
    expect(tennis.distanceKm).toBeNull();
    expect(tennis.secPerKm).toBeNull();
    // ...but it does have the fact a timed sport actually carries.
    expect(tennis.longestMinutes).toBe(90);
  });

  it("carries distance and pace where the sport has them", () => {
    const running = sportPages(SESSIONS, { now: NOW }).find((p) => p.discipline === "running")!;
    expect(running.distanceKm).toBe(26);
    // 154 min over 26 km = 355.4 s/km, derived from exact seconds not from the
    // rounded per-week values.
    expect(running.secPerKm).toBeCloseTo((154 * 60) / 26, 5);
    expect(running.longestMinutes).toBe(108);
  });

  it("scopes every figure to the window — one window, not four", () => {
    const old = [...SESSIONS, effort("r0", "Ancient run", "running", 200, 30, 180)];
    const running = sportPages(old, { now: NOW }).find((p) => p.discipline === "running")!;
    // The 200-day-old run is outside the 8-week window and counts nowhere:
    // not in minutes, not in efforts, not in distance.
    expect(running.minutes).toBe(154);
    expect(running.efforts).toBe(2);
    expect(running.distanceKm).toBe(26);
  });

  it("drops a sport with nothing in the window rather than drawing an empty page", () => {
    const stale = [effort("x", "Rowing", "sport", 120, 0, 60)];
    expect(sportPages(stale, { now: NOW })).toEqual([]);
  });

  it("buckets minutes into SPORT_PAGE_WEEKS weeks, oldest first", () => {
    const running = sportPages(SESSIONS, { now: NOW }).find((p) => p.discipline === "running")!;
    expect(running.weeks).toHaveLength(SPORT_PAGE_WEEKS);
    expect(running.weekStarts).toHaveLength(SPORT_PAGE_WEEKS);
    // 3 days ago is the newest bucket; 10 days ago is the one before it.
    expect(running.weeks[SPORT_PAGE_WEEKS - 1]).toBe(46);
    expect(running.weeks[SPORT_PAGE_WEEKS - 2]).toBe(108);
    expect(running.weeks.slice(0, SPORT_PAGE_WEEKS - 2).every((m) => m === 0)).toBe(true);
    // The ridge and the hero must agree: the weeks sum to the window's minutes.
    expect(running.weeks.reduce((a, b) => a + b, 0)).toBe(running.minutes);
  });

  it("keeps two sports with the same tag apart by name", () => {
    const both = [...SESSIONS, effort("p1", "Padel", "sport", 4, 0, 60)];
    const pages = sportPages(both, { now: NOW });
    expect(pages.filter((p) => p.kind === "sport").map((p) => p.sport)).toEqual(["Tennis", "Padel"]);
    expect(pages.find((p) => p.sport === "Padel")!.minutes).toBe(60);
  });

  it("totals the section across every page", () => {
    const total = sportPagesTotal(sportPages(SESSIONS, { now: NOW }));
    expect(total).toEqual({ sports: 4, minutes: 433, efforts: 6 });
  });

  it("titles a discipline through i18n and a sport by its own name", () => {
    const [tennis, running] = sportPages(SESSIONS, { now: NOW });
    const t = (k: string) => `«${k}»`;
    expect(sportPageTitle(tennis!, t)).toBe("Tennis");
    expect(sportPageTitle(running!, t)).toBe(`«${running!.labelKey}»`);
  });
});

