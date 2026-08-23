// ── THE EMPTY DAY — one grammar, three tenses ───────────────────────────────
//
// A day with nothing logged on it is the most repeated state in the app, and
// until now it was drawn three different ways inside ONE card: today rendered a
// baseline row with a chalk headline and a mono sub-line, a past day rendered
// the same shape with an ash headline and a different sub-line, and the invited
// action below them was a dashed tile with a whispered caption. Three drawings,
// three sets of type, one state.
//
// So the shape moves here. A caller asks what tense the day is in and gets back
// the symbol, the two strings and whether the block speaks quietly — nothing
// else. The DRAWING lives in the clients (mobile aurora/empty-day.tsx), which
// keeps the house display face; SwiftUI's own ContentUnavailableView is the
// grammar this follows (symbol → title → one description line → the actions),
// not the renderer, because a system view styles its own type and would put SF
// Pro in the middle of a card set in the app's face.
//
// THE TITLE IS ONE STRING IN EVERY TENSE. "No training logged" is true of a
// first run, of an open today and of a Saturday three weeks back; only the
// sentence under it changes, because only the tense does. A day AHEAD is not in
// this set at all — nothing is logged there because nothing has happened yet,
// which is a different fact and gets its own words.

/** Which tense the empty day speaks in. */
export type EmptyDayTense = "firstRun" | "today" | "past";

export type EmptyDayCopy = {
  tense: EmptyDayTense;
  /** i18n key for the title — deliberately the SAME key in all three tenses. */
  titleKey: string;
  /** i18n key for the one description line. */
  bodyKey: string;
  /** SF Symbol name (iOS), for clients that can draw one. */
  symbol: string;
  /** True when the block stands down: a past day states a fact, it doesn't ask. */
  quiet: boolean;
  /** Whether the live logger can be offered — you cannot start a session in the
   *  past, so a past day offers the sport log alone. */
  canStartSession: boolean;
};

/**
 * The empty day's copy, by tense.
 *
 * @param isToday    the viewed day is the real today
 * @param hasHistory the account holds at least one logged session, anywhere
 */
export function emptyDayCopy({ isToday, hasHistory }: { isToday: boolean; hasHistory: boolean }): EmptyDayCopy {
  if (!isToday) {
    return {
      tense: "past",
      titleKey: "w.home.logbook.emptyTitle",
      bodyKey: "w.home.logbook.emptyPastBody",
      symbol: "moon.zzz",
      quiet: true,
      canStartSession: false,
    };
  }
  return {
    tense: hasHistory ? "today" : "firstRun",
    titleKey: "w.home.logbook.emptyTitle",
    bodyKey: hasHistory ? "w.home.logbook.emptyTodayBody" : "w.home.logbook.emptyFirstRunBody",
    symbol: "figure.run.circle",
    quiet: false,
    canStartSession: true,
  };
}
