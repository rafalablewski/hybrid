// THE STREAK MARK — the day-streak, wherever it is shown, as one thing.
//
// A flame and a count: "🔥 17-DAY STREAK". It appears under the wordmark in the
// app header, in the done-today sheet's sub line, and under the profile's
// activity heat-map — three places, and it had been written three ways: an
// uppercase mono hairline in terracotta on the header, sentence-case mono
// inside the sheet, and a bare "17d" in CHARTREUSE on the profile, where it
// also swapped in a longest-WEEK figure under a label that said "streak" on one
// client and "best" on the other. Same fact, three costumes.
//
// IT IS A CONTROL, NOT A DECORATION. The number answers "how long have I kept
// this up", and the only screen that can answer the follow-up — "kept what
// up?" — is the training history. So the mark GOES SOMEWHERE, and it goes to
// the same place from every surface: history. That destination is not a prop.
// A mark inside a sheet closes the sheet on its way (see `onDismiss` on the
// components) — that is the only thing a caller may say about the tap.
//
// THE COLOUR IS FIXED TOO: the warm terracotta accent (Connect), pairing with
// the flame and leaving chartreuse to the primary action. The profile's lime
// copy of it was the accent doing a second job.

import { fs, space, tracking } from "./scale";

/**
 * THE TWO RUNGS. Not two designs — one mark at two densities, because the
 * places it sits differ in what surrounds it:
 *
 *  • `hairline` — standing alone, under the wordmark or under the heat-map. It
 *    is a MARK there, so it is set like a label: uppercase, tracked out, and
 *    deliberately below the type scale's smallest rung (fs.nano, 10) because it
 *    must not grow the 44 pt header row it lives inside.
 *  • `inline` — inside a running line of mono copy (the done sheet's sub, which
 *    is fs.micro). It matches that line exactly instead of shouting inside it,
 *    so it is sentence-case and untracked.
 */
export const STREAK_MARK = {
  hairline: { size: 9.5, icon: 11, gap: space.xxs, tracking: tracking(9.5, "caps"), caps: true },
  inline: { size: fs.micro, icon: 12, gap: space.xxs, tracking: tracking(fs.micro), caps: false },
} as const;

export type StreakRung = keyof typeof STREAK_MARK;

/** The nav id / route the mark always opens. Named so neither client can point
 *  its copy of the mark somewhere else. */
export const STREAK_DESTINATION = "history";

/** The ONE key for "-day streak". The profile had a second key with the same
 *  English, Polish and German strings behind it (`w.account.profile.
 *  day-streak-suffix`), which is exactly the duplicate the copy-parity guard
 *  exists to catch — it only slipped through because both clients used both. */
export const STREAK_SUFFIX_KEY = "w.home.today.dayStreak";

/** The mark's accessible name: the count, plus where the tap goes. `{n}` is the
 *  day count. */
export const STREAK_ARIA_KEY = "w.home.today.streakAria";
