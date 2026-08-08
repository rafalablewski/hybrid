// Distance display precision — ONE rule, both clients.
//
// Storage is always canonical kilometres, unrounded: a watch records 5.549213
// km and `sanitizeDeviceWorkout` keeps every digit of it, because the device's
// exact figure is the source of truth every derived number (pace, rates) has to
// be computed from. That precision must never reach a screen — "5.54921352352
// km" is a raw sensor reading, not a distance anyone reads.
//
// Two decimals is the resolution the athlete actually gets: 10 m, the same step
// the watch's own summary shows, fine enough that a 5.55 km loop never reads as
// 5.5 and coarse enough that the number stays a number. Trailing zeros are
// dropped (`Math.round` on a number, not `toFixed` on a string) so a flat 10 km
// reads "10 km", not "10.00 km".
//
// Every surface that prints a kilometre figure rounds HERE. Sub-kilometre and
// metre-unit sports have their own rules — see `kmOrMeters` below and
// `displaySportDistance` in olympic-sports.ts.

/** The decimals every kilometre figure is shown at. */
export const KM_DECIMALS = 2;

/**
 * A distance in km at display precision — 5.549213 → 5.55, 10.205931 → 10.21,
 * 10 → 10. The RESULT IS A NUMBER, so trailing zeros never appear and the value
 * can still be compared, summed for a label, or handed to `toLocaleString`.
 */
export const roundKm = (km: number): number => Math.round(km * 100) / 100;

/** The km FIGURE alone, at display precision ("5.55", "10", "0.03"). */
export const kmValue = (km: number): string => String(roundKm(km));

/** A labelled km distance at display precision ("5.55 km"). */
export const fmtKm = (km: number): string => `${kmValue(km)} km`;

/**
 * A labelled distance that reads in METRES below a kilometre — a 340 m pool
 * swim rounds to "0.34 km" honestly but reads as nothing; "340 m" is the same
 * fact in the words the athlete uses. The rule the device panel, the match
 * picker and the Today rail already share, in one place.
 */
export const kmOrMeters = (km: number): string => (km < 1 ? `${Math.round(km * 1000)} m` : fmtKm(km));
