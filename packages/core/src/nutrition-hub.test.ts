import { describe, it, expect } from "vitest";
import { nutritionHubSeries, nutritionHubChart, HUB_CHART_DAYS, type HubDay } from "./nutrition-hub";
import type { Signal } from "./engines/signals";
import type { LoggedSession } from "./engines/session";
import { addLocalDays, localDayKey, localMidnightMs } from "./day-key";

const NOW = new Date(2026, 6, 15, 10, 0, 0).getTime(); // a fixed local Wednesday

const kcal = (dayAgo: number, value: number): Signal => ({
  athleteId: "a",
  kind: "energyIntake",
  value,
  unit: "kcal",
  source: "manual",
  ts: new Date(addLocalDays(localMidnightMs(NOW), -dayAgo) + 12 * 3_600_000).toISOString(),
});

const bodyMass = (dayAgo: number, value: number): Signal => ({
  athleteId: "a",
  kind: "bodyMass",
  value,
  unit: "kg",
  source: "manual",
  ts: new Date(addLocalDays(localMidnightMs(NOW), -dayAgo) + 8 * 3_600_000).toISOString(),
});

/** A session on `dayAgo` with a long enough cardio block to move the target. */
const session = (dayAgo: number, mins: number): LoggedSession => ({
  id: `s${dayAgo}`,
  title: "Run",
  startedAt: new Date(addLocalDays(localMidnightMs(NOW), -dayAgo) + 17 * 3_600_000).toISOString(),
  completedAt: null,
  blocks: [{ kind: "cardio", name: "Run", discipline: "run", minutes: mins, distance: mins / 5 }],
});

const baseSignals = () => [
  bodyMass(20, 82.4),
  ...Array.from({ length: 20 }, (_, i) => kcal(i + 1, 2400)),
];

describe("nutritionHubSeries", () => {
  it("returns seven days oldest → newest, ending on today", () => {
    const s = nutritionHubSeries(baseSignals(), [], { now: NOW });
    expect(s.days).toHaveLength(HUB_CHART_DAYS);
    expect(s.days[6]!.date).toBe(localDayKey(NOW));
    expect(s.days[0]!.date).toBe(localDayKey(addLocalDays(localMidnightMs(NOW), -6)));
    // strictly ascending
    for (let i = 1; i < s.days.length; i++) expect(s.days[i]!.date > s.days[i - 1]!.date).toBe(true);
    expect(s.days[6]!.today).toBe(true);
    expect(s.days.slice(0, 6).every((d) => !d.today)).toBe(true);
    expect(s.today).toBe(s.days[6]);
  });

  it("leaves an unlogged day as a GAP, never a zero", () => {
    // Nothing logged today at all.
    const s = nutritionHubSeries([bodyMass(20, 82.4), ...Array.from({ length: 6 }, (_, i) => kcal(i + 1, 2400))], [], { now: NOW });
    expect(s.today.logged).toBeNull();
    expect(s.days.filter((d) => d.logged === 0)).toHaveLength(0);
    expect(s.loggedDays).toBe(6);
    // No intake means no comparison to make.
    expect(s.deltaToday).toBe(0);
  });

  it("adds each day's OWN training fuel to that day's target", () => {
    const signals = baseSignals();
    const rest = nutritionHubSeries(signals, [], { now: NOW });
    const trained = nutritionHubSeries(signals, [session(2, 90)], { now: NOW });

    const restDay = rest.days[4]!; // two days ago
    const hardDay = trained.days[4]!;
    expect(hardDay.date).toBe(restDay.date);
    expect(hardDay.trainingKcal).toBeGreaterThan(0);
    expect(hardDay.target).toBe(restDay.target + hardDay.trainingKcal);
    // and ONLY that day moved
    expect(trained.days[5]!.target).toBe(rest.days[5]!.target);
    expect(trained.days[6]!.target).toBe(rest.days[6]!.target);
  });

  it("reports today's delta against today's target", () => {
    const signals = [...baseSignals(), kcal(0, 1840)];
    const s = nutritionHubSeries(signals, [], { now: NOW });
    expect(s.today.logged).toBe(1840);
    expect(s.deltaToday).toBe(1840 - s.today.target);
    expect(s.deltaToday).toBeLessThan(0);
  });

  it("survives a cold start with no signals at all", () => {
    const s = nutritionHubSeries([], [], { now: NOW });
    expect(s.days).toHaveLength(HUB_CHART_DAYS);
    expect(s.loggedDays).toBe(0);
    expect(s.days.every((d) => d.logged === null)).toBe(true);
    expect(s.days.every((d) => Number.isFinite(d.target) && d.target > 0)).toBe(true);
  });

  it("honours the days option", () => {
    expect(nutritionHubSeries(baseSignals(), [], { now: NOW, days: 14 }).days).toHaveLength(14);
  });
});

const day = (d: Partial<HubDay> & { target: number }): HubDay => ({
  date: "2026-07-15",
  logged: null,
  trainingKcal: 0,
  today: false,
  ...d,
});

describe("nutritionHubChart", () => {
  const box = { width: 300, height: 92 };

  it("draws one continuous target line and stays inside the box", () => {
    const days = [2400, 2400, 2900, 2400, 2750, 2400, 2600].map((t, i) =>
      day({ target: t, logged: [2280, 2510, 2650, 2190, 2880, 1980, 1840][i]!, today: i === 6 }),
    );
    const c = nutritionHubChart(days, box);
    expect(c.targetPath.startsWith("M")).toBe(true);
    expect(c.targetPath.match(/L/g)).toHaveLength(6);
    expect(c.loggedPaths).toHaveLength(1);
    expect(c.bandPaths).toHaveLength(1);
    expect(c.bandPaths[0]!.endsWith("Z")).toBe(true);
    for (const p of c.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(box.width);
      expect(p.targetY).toBeGreaterThanOrEqual(0);
      expect(p.targetY).toBeLessThanOrEqual(box.height);
      expect(p.loggedY!).toBeGreaterThanOrEqual(0);
      expect(p.loggedY!).toBeLessThanOrEqual(box.height);
    }
  });

  it("puts the endpoint dot on today when today is logged, and nowhere when it isn't", () => {
    const logged = [2400, 2400, 2400, 2400, 2400, 2400, 1840].map((v, i) => day({ target: 2400, logged: v, today: i === 6 }));
    expect(nutritionHubChart(logged, box).last).not.toBeNull();

    const openDay = [...logged];
    openDay[6] = day({ target: 2400, logged: null, today: true });
    expect(nutritionHubChart(openDay, box).last).toBeNull();
  });

  it("BREAKS the logged line at an unlogged day instead of drawing through zero", () => {
    const days = [
      day({ target: 2400, logged: 2300 }),
      day({ target: 2400, logged: 2350 }),
      day({ target: 2400, logged: null }), // skipped
      day({ target: 2400, logged: 2500 }),
      day({ target: 2400, logged: 2450 }),
      day({ target: 2400, logged: 2200 }),
      day({ target: 2400, logged: 1840, today: true }),
    ];
    const c = nutritionHubChart(days, box);
    expect(c.loggedPaths).toHaveLength(2);
    expect(c.bandPaths).toHaveLength(2);
    // the target line is NOT broken — the day still asked for its calories
    expect(c.targetPath.match(/M/g)).toHaveLength(1);
    // nothing sits on the bottom edge, which is where a zero would land
    expect(c.points.every((p) => p.loggedY == null || p.loggedY < box.height)).toBe(true);
  });

  it("marks a lone logged day with a dot rather than dropping it", () => {
    const days = [
      day({ target: 2400, logged: null }),
      day({ target: 2400, logged: 2600 }),
      day({ target: 2400, logged: null }),
      day({ target: 2400, logged: null }),
      day({ target: 2400, logged: null }),
      day({ target: 2400, logged: null }),
      day({ target: 2400, logged: null, today: true }),
    ];
    const c = nutritionHubChart(days, box);
    expect(c.loggedPaths).toHaveLength(0);
    expect(c.isolated).toHaveLength(1);
    expect(c.isolated[0]!.y).toBeLessThan(box.height);
  });

  it("never divides by zero on a perfectly flat week", () => {
    const days = Array.from({ length: 7 }, (_, i) => day({ target: 2400, logged: 2400, today: i === 6 }));
    const c = nutritionHubChart(days, box);
    expect(c.points.every((p) => Number.isFinite(p.targetY) && Number.isFinite(p.loggedY!))).toBe(true);
    expect(c.domain.hi).toBeGreaterThan(c.domain.lo);
    // a flat series sits mid-box, not welded to an edge
    expect(c.points[0]!.targetY).toBeGreaterThan(0);
    expect(c.points[0]!.targetY).toBeLessThan(box.height);
  });

  it("fits the domain to both series, so neither line can leave the frame", () => {
    const days = [
      day({ target: 2400, logged: 1200 }),
      day({ target: 3400, logged: 3600 }),
      day({ target: 2400, logged: 2400, today: true }),
    ];
    const c = nutritionHubChart(days, box);
    expect(c.domain.lo).toBeLessThan(1200);
    expect(c.domain.hi).toBeGreaterThan(3600);
  });

  it("centres a single day instead of pinning it to the left edge", () => {
    const c = nutritionHubChart([day({ target: 2400, logged: 2000, today: true })], box);
    expect(c.points[0]!.x).toBe(box.width / 2);
  });
});
