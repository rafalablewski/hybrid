/**
 * OTHER SPORTS — the block under Endurance on Today.
 *
 * The catalog already splits training three ways: strength blocks, ENDURANCE
 * cardio (running / cycling / swimming / rowing / skiing / walking / generic),
 * and `discipline: "sport"` — the racket, team and combat sessions. That third
 * bucket has always been logged and has never had a home: `ENDURANCE_DISCIPLINES`
 * deliberately excludes it, so a Tuesday-night tennis habit counted towards the
 * week's sessions and hours and then vanished. This is where it lands.
 *
 * ONE LANE PER SPORT, NOT PER DISCIPLINE. Endurance keys its lanes off the
 * discipline tag, but every tennis, squash, badminton and five-a-side session
 * carries the SAME tag ("sport"), so keying off it here would produce a single
 * lane called "Sport" — exactly the picker-shaped flattening the endurance
 * block was built to escape. The grouping key is the block's own NAME, matched
 * against the sport catalog for its icon and category.
 *
 * THESE SPORTS ARE TIMED, NOT MEASURED. Tennis and squash carry `metrics: TIME`
 * in the catalog: no distance, no pace, no zones. So a sport gets ONE tile
 * rather than a rail of five — efforts, time, and when it was last played —
 * and the block spends its width on the NUMBER of sports instead of the depth
 * of each. Inventing a pace for a squash match to fill a rail would be
 * fabricating a metric the sport does not have.
 *
 * Pure, so web and mobile render identical tiles.
 */
import { OLYMPIC_SPORTS } from "./olympic-sports";
import { cardioDiscipline, type LoggedSession } from "./engines/session";

const WEEK = 7 * 86_400_000;

/** Sports shown before the expander. A fifth tile is off-screen on a phone
 *  anyway, and the rail already advertises its own length in the head. */
export const OTHER_SPORT_CAP = 4;

/** How many weeks of frequency a tile's bars cover. */
export const OTHER_SPORT_WEEKS = 8;

export interface OtherSportLane {
  /** The block's own name, which is also the catalog key when it has one. */
  sport: string;
  /** Catalog icon, or a generic marker for a sport typed by hand. */
  icon: string;
  /** Catalog category ("Racket", "Team", "Combat", …); null when uncatalogued. */
  category: string | null;
  /** One effort = one logged block, the same unit the endurance lanes count. */
  efforts: number;
  minutes: number;
  /** ISO of the most recent effort — never null, a lane exists because of one. */
  lastAt: string;
  thisWeek: { efforts: number; minutes: number };
  /** Minutes per week, oldest → newest, OTHER_SPORT_WEEKS long. */
  weeks: number[];
}

const ms = (iso: string) => new Date(iso).getTime();

/**
 * One lane per non-endurance sport with something logged, most played first.
 *
 * Ties break on RECENCY, not alphabetically: two sports played four times each
 * are ordered by which one the athlete is actually still doing.
 */
export function otherSportLanes(sessions: LoggedSession[], now = Date.now()): OtherSportLane[] {
  const byName = new Map<string, { efforts: number; minutes: number; lastAt: number; week: { efforts: number; minutes: number }; weeks: number[] }>();

  for (const s of sessions) {
    const t = ms(s.startedAt);
    if (!Number.isFinite(t)) continue;
    for (const b of s.blocks) {
      if (b.kind !== "cardio") continue;
      // Prefer the stamped tag; fall back to the name for blocks logged before
      // the loggers stamped one, exactly as the endurance filters do.
      if ((b.discipline ?? cardioDiscipline(b.name)) !== "sport") continue;

      const key = b.name.trim();
      if (!key) continue;
      const cur = byName.get(key) ?? {
        efforts: 0, minutes: 0, lastAt: 0,
        week: { efforts: 0, minutes: 0 },
        weeks: new Array<number>(OTHER_SPORT_WEEKS).fill(0),
      };
      const mins = b.minutes && b.minutes > 0 ? b.minutes : 0;
      cur.efforts += 1;
      cur.minutes += mins;
      if (t > cur.lastAt) cur.lastAt = t;

      if (t >= now - WEEK && t <= now) {
        cur.week.efforts += 1;
        cur.week.minutes += mins;
      }
      // Bucket into the 8-week window, oldest first. Anything older is history
      // the tile doesn't chart — it still counts in the whole-history totals.
      const weeksAgo = Math.floor((now - t) / WEEK);
      if (weeksAgo >= 0 && weeksAgo < OTHER_SPORT_WEEKS) {
        cur.weeks[OTHER_SPORT_WEEKS - 1 - weeksAgo]! += mins;
      }
      byName.set(key, cur);
    }
  }

  return [...byName.entries()]
    .map(([sport, v]): OtherSportLane => {
      const cat = OLYMPIC_SPORTS[sport];
      return {
        sport,
        icon: cat?.icon ?? "🎯",
        category: cat?.category ?? null,
        efforts: v.efforts,
        minutes: Math.round(v.minutes),
        lastAt: new Date(v.lastAt).toISOString(),
        thisWeek: { efforts: v.week.efforts, minutes: Math.round(v.week.minutes) },
        weeks: v.weeks.map((m) => Math.round(m)),
      };
    })
    .sort((a, b) => b.efforts - a.efforts || ms(b.lastAt) - ms(a.lastAt));
}

/** Frequency bars for a lane, normalised 0…1 against its own busiest week —
 *  the same shape volumeBars() returns for an endurance lane, so both blocks
 *  draw their bars through identical rendering code. */
export function sportWeekBars(weeks: number[]): number[] {
  const max = Math.max(...weeks, 0);
  if (max <= 0) return weeks.map(() => 0);
  return weeks.map((m) => m / max);
}

/** Whole-block totals — what the section head reports without the athlete
 *  having to add up the tiles. */
export function otherSportTotals(lanes: OtherSportLane[]): { sports: number; efforts: number; minutes: number } {
  let efforts = 0;
  let minutes = 0;
  for (const l of lanes) {
    efforts += l.efforts;
    minutes += l.minutes;
  }
  return { sports: lanes.length, efforts, minutes };
}
