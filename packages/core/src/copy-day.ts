/**
 * COPY A DAY — "yesterday's breakfast is today's breakfast".
 *
 * The highest-frequency action a food diary has that this app did not: most
 * people eat the same handful of things, and re-entering Monday's breakfast on
 * Tuesday, Wednesday and Thursday is the tax that makes people stop logging.
 *
 * ── WHAT GETS COPIED IS AN ENTRY, NOT A TOTAL ─────────────────────────────
 * A copied day is a set of new diary ENTRIES — each with its own name, its own
 * per-single-serving macros and its own quantity — not a lump sum written onto
 * the target. That matters because the copy must be as editable as anything
 * typed by hand: delete one item, halve another, and the day behaves exactly
 * like a day that was logged normally. A "copy" that produced one 2 140 kcal
 * row would be a dead end the moment the athlete skipped the banana.
 *
 * ── THE CLOCK IS PRESERVED, THE DATE IS NOT ───────────────────────────────
 * An entry keeps its time of day and moves its calendar date: breakfast logged
 * at 08:14 on Monday arrives at 08:14 on Tuesday. The diary orders by `ts`, so
 * a copy that stamped everything with `now` would pile the whole day into one
 * minute and shuffle dinner above breakfast. Retiming is done LOCALLY — the
 * client owns the clock, because only the client knows the athlete's timezone,
 * and "the same time of day" is a local-calendar claim, not a UTC one.
 *
 * ── COPYING APPENDS. IT NEVER REPLACES ────────────────────────────────────
 * The athlete asked to copy, not to overwrite. A target day that already has
 * food keeps it, and the plan REPORTS the collision (`targetEntries`) so the
 * confirm step can say "today already has 3 items" rather than discovering it
 * afterwards. Silently replacing a day would destroy typed entries; silently
 * merging without saying so produces a doubled day nobody ordered.
 *
 * Pure + unit-tested, and shared, so the copy on the phone and the copy in the
 * browser move the same entries to the same clock times (parity rule).
 */

import { addLocalDays, localDayKey, localMidnightMs } from "./day-key";
import type { MicroFacts } from "./food-facts";

/** A diary entry as both clients hold it — the FoodLog row, or one the server
 *  rebuilt from its Signals. Macros are PER SINGLE SERVING; `qty` scales them. */
export interface CopyableEntry extends MicroFacts {
  id: string;
  name: string;
  subname?: string | null;
  /** the part of the day (breakfast | lunch | dinner | snack | custom) */
  source: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  qty: number;
  ts: string;
  verifiedId?: string | null;
  /** what the athlete entered and the unit they entered it in (portion.ts) —
   *  a copied 35 g of cheese is still 35 g */
  amount?: number | null;
  amountUnit?: string | null;
}

/** One entry to write, ready to POST. Deliberately the SAME shape the normal
 *  log endpoint takes — a copied entry is not a special kind of entry. */
export interface CopyDraft extends MicroFacts {
  name: string;
  subname: string | null;
  source: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  qty: number;
  /** ISO timestamp on the TARGET day, at the source entry's time of day */
  ts: string;
  verifiedId: string | null;
  amount: number | null;
  amountUnit: string | null;
}

/** Every entry on one local calendar day, oldest first. */
export function entriesOnDay<T extends { ts: string }>(logs: T[], dayKey: string): T[] {
  return logs.filter((l) => localDayKey(l.ts) === dayKey).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

/**
 * Move a timestamp to another calendar day, keeping its LOCAL time of day.
 *
 * Built from local Date parts rather than by adding a day-count in
 * milliseconds: a local day is 23 or 25 hours across a DST boundary, and
 * arithmetic on the epoch would shift 08:14 to 07:14 twice a year.
 */
export function retimeToDay(ts: string, dayKey: string): string {
  const src = new Date(ts);
  const [y, m, d] = dayKey.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return ts;
  return new Date(y, m - 1, d, src.getHours(), src.getMinutes(), src.getSeconds(), src.getMilliseconds()).toISOString();
}

export interface CopyPlan {
  from: string;
  to: string;
  /** the entries that would be written, in source order */
  entries: CopyDraft[];
  /** how many entries the TARGET day already holds — the collision the confirm
   *  step must state, since copying appends rather than replaces */
  targetEntries: number;
  /** total energy the copy adds to the target day (kcal, quantity-scaled) */
  kcal: number;
}

export interface CopyOptions {
  from: string;
  to: string;
  /** Restrict to these parts of the day. Absent = the whole day. */
  parts?: string[];
  /** Re-file every copied entry under this part ("yesterday's dinner → today's
   *  lunch"). Absent = each entry keeps its own part. */
  toPart?: string;
}

/**
 * What copying `from` → `to` would do. Computing the plan separately from
 * performing it is the whole point: the confirm step shows a real count and a
 * real energy figure taken from the same object that gets written, so the
 * sentence the athlete agreed to and the rows that land cannot disagree.
 *
 * An empty plan is a valid answer, not an error — the caller decides whether a
 * day with nothing on it is worth a message.
 */
export function copyDayPlan(logs: CopyableEntry[], opts: CopyOptions): CopyPlan {
  const { from, to, parts, toPart } = opts;
  const empty: CopyPlan = { from, to, entries: [], targetEntries: 0, kcal: 0 };

  // Copying a day onto itself would duplicate it for no reason. Copying a PART
  // onto a different part of the same day is a real action, so that survives.
  if (from === to && !toPart) return empty;

  const only = parts && parts.length ? new Set(parts) : null;
  const source = entriesOnDay(logs, from).filter((l) => !only || only.has(l.source));

  const entries: CopyDraft[] = source.map((l) => ({
    name: l.name,
    subname: l.subname ?? null,
    source: toPart ?? l.source,
    kcal: l.kcal,
    protein: l.protein,
    carbs: l.carbs,
    fat: l.fat,
    // A panel field the original never stated stays unstated in the copy. The
    // copy is the same food; it did not learn its sugar content by being moved.
    satFat: l.satFat ?? null,
    sugar: l.sugar ?? null,
    fiber: l.fiber ?? null,
    salt: l.salt ?? null,
    qty: l.qty,
    ts: retimeToDay(l.ts, to),
    // Provenance survives a copy: a Verified food copied forward is still that
    // Verified food, and the diary entry can still be traced to the catalog.
    verifiedId: l.verifiedId ?? null,
    // So does the PORTION AS ENTERED. A copied entry that kept only its
    // quantity would come back reading "0.35" on a day the original read
    // "35 g" — the same meal, described two ways.
    amount: l.amount ?? null,
    amountUnit: l.amountUnit ?? null,
  }));

  return {
    from,
    to,
    entries,
    targetEntries: entriesOnDay(logs, to).length,
    kcal: Math.round(entries.reduce((sum, e) => sum + e.kcal * e.qty, 0)),
  };
}

/** One past day worth offering as a copy source. */
export interface CopySource {
  date: string;
  /** how many entries it holds */
  entries: number;
  /** the day's total energy (kcal, quantity-scaled) */
  kcal: number;
  /** whole days before the reference day — 1 = yesterday */
  daysAgo: number;
  /** the parts of the day that have anything, in the order they were eaten */
  parts: string[];
}

/** How far back the "copy from" picker looks. Four weeks is enough to reach
 *  "the same day last week" twice over without becoming a scroll. */
export const COPY_SOURCE_DAYS = 28;

/**
 * The days worth copying FROM — those with something on them, newest first.
 *
 * Deliberately excludes the target day itself (copying a day onto itself is
 * nothing) and reports the parts each day holds, so the picker can show what is
 * actually there instead of a bare date the athlete has to remember.
 */
export function copySources(
  logs: CopyableEntry[],
  opts: { to: string; now?: number; days?: number } = { to: "" },
): CopySource[] {
  const now = opts.now ?? Date.now();
  const span = Math.max(1, Math.round(opts.days ?? COPY_SOURCE_DAYS));
  const midnight = localMidnightMs(now);

  const out: CopySource[] = [];
  for (let i = 0; i <= span; i++) {
    const date = localDayKey(addLocalDays(midnight, -i));
    if (date === opts.to) continue;
    const entries = entriesOnDay(logs, date);
    if (entries.length === 0) continue;
    const parts: string[] = [];
    for (const e of entries) if (!parts.includes(e.source)) parts.push(e.source);
    out.push({
      date,
      entries: entries.length,
      kcal: Math.round(entries.reduce((sum, e) => sum + e.kcal * e.qty, 0)),
      daysAgo: i,
      parts,
    });
  }
  return out;
}
