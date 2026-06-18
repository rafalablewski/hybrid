/**
 * Session statistics buckets — pure, shared by web + mobile so the Statistics
 * screen charts the SAME real data on both. Groups logged sessions into
 * day/week/month buckets over a window for the bar chart, plus window totals.
 * No fabricated data: no sessions → all-zero buckets and the UI says so.
 */
import type { LoggedSession } from "./engines/session";

export type StatRange = "week" | "month" | "year";

export interface StatBucket {
  label: string;
  value: number;
}
export interface StatSummary {
  range: StatRange;
  buckets: StatBucket[];
  /** Sessions in the window. */
  total: number;
  /** Distinct calendar days trained in the window. */
  activeDays: number;
  /** Index of the largest bucket (for highlighting), or -1 if all zero. */
  peakIndex: number;
}

const DAY = 86_400_000;
const WD = ["S", "M", "T", "W", "T", "F", "S"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const sessionTimes = (sessions: LoggedSession[]): number[] =>
  sessions.map((s) => Date.parse(s.completedAt ?? s.startedAt)).filter((t) => Number.isFinite(t));

function summarize(range: StatRange, buckets: StatBucket[], times: number[], windowStart: number, now: number): StatSummary {
  const inWindow = times.filter((t) => t >= windowStart && t <= now + 60_000);
  const days = new Set(inWindow.map((t) => new Date(t).toDateString()));
  let peakIndex = -1;
  let peak = 0;
  buckets.forEach((b, i) => {
    if (b.value > peak) {
      peak = b.value;
      peakIndex = i;
    }
  });
  return { range, buckets, total: inWindow.length, activeDays: days.size, peakIndex };
}

/** Bucket sessions for the bar chart: week → 7 days, month → 5 weeks, year → 12 months. */
export function sessionBuckets(sessions: LoggedSession[], range: StatRange, now = Date.now()): StatSummary {
  const times = sessionTimes(sessions);
  const count = (lo: number, hi: number) => times.filter((t) => t >= lo && t < hi).length;

  if (range === "week") {
    const buckets: StatBucket[] = [];
    let start = 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * DAY);
      d.setHours(0, 0, 0, 0);
      const lo = d.getTime();
      if (i === 6) start = lo;
      buckets.push({ label: WD[d.getDay()]!, value: count(lo, lo + DAY) });
    }
    return summarize("week", buckets, times, start, now);
  }

  if (range === "month") {
    const buckets: StatBucket[] = [];
    let start = 0;
    for (let i = 4; i >= 0; i--) {
      const lo = now - (i + 1) * 7 * DAY;
      const hi = now - i * 7 * DAY;
      if (i === 4) start = lo;
      buckets.push({ label: `${5 - i}w`, value: count(lo, hi) });
    }
    return summarize("month", buckets, times, start, now);
  }

  // year → 12 calendar months ending this month
  const buckets: StatBucket[] = [];
  const base = new Date(now);
  let start = 0;
  for (let i = 11; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const lo = d.getTime();
    const hi = new Date(base.getFullYear(), base.getMonth() - i + 1, 1).getTime();
    if (i === 11) start = lo;
    buckets.push({ label: MO[d.getMonth()]!, value: count(lo, hi) });
  }
  return summarize("year", buckets, times, start, now);
}
