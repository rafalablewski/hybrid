import { Redirect } from "expo-router";

/**
 * STATISTICS — RETIRED, and this route is what finishes retiring it.
 *
 * The screen was folded into History's TREND view in Jul 2026: the same
 * week/month/year toggle, the same session-count chart and the same window
 * totals, off the same `sessionBuckets()` / `weeklyRecap()` engines. It was a
 * second destination charting the sessions History already held, one grain
 * coarser — the same screen twice — and its nav entry became
 * `promotedTo: "history"` so the menus stopped naming it.
 *
 * WHAT DID NOT HAPPEN THEN was the deletion. The old implementation stayed on
 * this route: a hundred and twenty-six lines drawing the same charts, reachable
 * by deep link and by the command menu's nav map, with nothing pointing at it
 * from any screen. A retirement that leaves its subject running is how two
 * surfaces come to answer one question differently — the exact drift the fold
 * was carried out to end.
 *
 * So the route stays (a live deep-link target, as `promotedTo` intends) and
 * sends the athlete to the view that absorbed it, with the layout named
 * explicitly rather than left to whichever one they last chose.
 */
export default function Statistics() {
  return <Redirect href="/history?view=trend" />;
}
