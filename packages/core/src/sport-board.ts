import type { CardioDiscipline, LoggedSession } from "./engines/session";
import { DISCIPLINE_META } from "./endurance";
import { pctChange } from "./exercise-widget";
import { SPORT_PAGE_WEEKS } from "./sport-page";
import { sportPages, type SportPage } from "./sport-pages";

/**
 * SPORTS — the Progress cluster's watchlist of the sports the athlete PINNED.
 *
 * The 8-week read per sport already exists ONCE, in `sportPages` (distance,
 * minutes, pace, weekly ridge — device-trued, blocks-not-buckets totals). This
 * board does not re-derive any of it: a card IS a SportPage, plus the one
 * thing a watchlist adds — the same read for the PREVIOUS 8 weeks, and the
 * stock-ticker deltas between the two. Running the identical model at
 * `now − 8 weeks` is what guarantees the comparison compares like with like;
 * a second aggregation would be the parallel implementation the retired
 * `endurance-sport-pager` entry warns about.
 *
 * Like the Records ledger beside it, the board renders PINS ONLY (see
 * sport-favourites.ts) — no auto-fill, which is the term the Today
 * retrospective's retirement set for anything returning to this screen.
 *
 * A pinned sport with nothing in the CURRENT window keeps its row, quiet
 * (`page: null`): the pin is a standing choice, and the endurance section
 * established the rule — a runner who took the block off still finds their
 * sport where they left it, saying the window was quiet, never silently gone.
 */
export interface SportBoardCard {
  /** The pin — a SportPage key: `d:running` | `s:Tennis`. */
  key: string;
  kind: "discipline" | "sport";
  discipline: CardioDiscipline | null;
  /** The named sport, for `kind: "sport"`. */
  sport: string | null;
  /** i18n key for a discipline's name; null for a named sport. */
  labelKey: string | null;
  /** The current 8-week read; null = nothing logged in the window. */
  page: SportPage | null;
  /** The previous 8-week read; null = nothing logged in THAT window. It is on
   *  the card because the ticker's baseline must be printable — a percentage
   *  whose baseline is not on screen is a number the reader has to trust. */
  prev: SportPage | null;
  /**
   * VOLUME ticker — distance when both windows carry one (the measure the
   * athlete asked this board for), else minutes (the measure every sport
   * carries). More = improving.
   */
  volumeDeltaPct: number | null;
  volumeImproving: boolean | null;
  /** Which measure the volume ticker compared, so the client can label it. */
  volumeBy: "distance" | "minutes" | null;
  /** PACE ticker — avg pace vs the previous window; faster = improving. */
  paceDeltaPct: number | null;
  paceImproving: boolean | null;
}

const WEEK_MS = 7 * 86_400_000;

/** Case-insensitive key match — pins store hand-typed sport names. */
const sameKey = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A quiet card's identity, resolved from the pin key alone. */
function identity(key: string): Pick<SportBoardCard, "kind" | "discipline" | "sport" | "labelKey"> {
  if (key.startsWith("d:")) {
    const d = key.slice(2) as CardioDiscipline;
    return { kind: "discipline", discipline: d, sport: null, labelKey: DISCIPLINE_META[d]?.labelKey ?? null };
  }
  return { kind: "sport", discipline: null, sport: key.slice(2), labelKey: null };
}

/** One card per pinned sport, in pin order. */
export function sportBoard(
  sessions: LoggedSession[],
  favourites: readonly string[],
  opts: { now?: number } = {},
): SportBoardCard[] {
  const now = opts.now ?? Date.now();
  const cur = sportPages(sessions, { now });
  const prior = sportPages(sessions, { now: now - SPORT_PAGE_WEEKS * WEEK_MS });

  return favourites.map((key) => {
    const page = cur.find((p) => sameKey(p.key, key)) ?? null;
    const prev = prior.find((p) => sameKey(p.key, key)) ?? null;

    // Distance only when BOTH windows measured one — a km-over-minutes
    // percentage would compare two different quantities under one arrow.
    const byDistance = page?.distanceKm != null && prev?.distanceKm != null;
    const volumeDeltaPct =
      page && prev
        ? byDistance
          ? pctChange(page.distanceKm!, prev.distanceKm!)
          : pctChange(page.minutes, prev.minutes)
        : null;
    const paceDeltaPct =
      page?.secPerKm != null && prev?.secPerKm != null ? pctChange(page.secPerKm, prev.secPerKm) : null;

    // A page found under a case-folded pin carries the canonical key; keep the
    // page's own spelling so the client links with the identity the pager uses.
    const canonical = page?.key ?? prev?.key ?? key;
    return {
      key: canonical,
      ...identity(canonical),
      page,
      prev,
      volumeDeltaPct,
      volumeImproving: volumeDeltaPct == null ? null : volumeDeltaPct > 0,
      volumeBy: volumeDeltaPct == null ? null : byDistance ? "distance" : "minutes",
      paceDeltaPct,
      paceImproving: paceDeltaPct == null ? null : paceDeltaPct < 0,
    };
  });
}

/**
 * What the picker offers: every sport in the fetched history, most minutes
 * first — the same rule as the exercise pin sheet, which only offers logged
 * movements (a pin with nothing behind it could only draw a blank row). The
 * window is wide enough to cover everything the API serves.
 */
export const SPORT_CHOICE_WEEKS = 520;

export function sportChoices(sessions: LoggedSession[], now = Date.now()): SportPage[] {
  return sportPages(sessions, { weeks: SPORT_CHOICE_WEEKS, now });
}
