import type { Lang } from "@hybrid/core";

/**
 * The clock and locale arithmetic behind a push, with no database in sight.
 *
 * Split out of ./push for one reason and it is a good one: these are the only
 * parts of sending a notification that are PURE, so they are the only parts a
 * test can hold still — and importing ./push would drag Prisma (and a live
 * connection string) into that test for nothing. ./push re-exports all four, so
 * nothing else needs to know this file exists.
 */

/** BCP-47 as the device reported it ("pl", "de-DE", "en-GB") -> a shipped Lang. */
export function langFromLocale(locale: string | null | undefined): Lang {
  const base = (locale ?? "").toLowerCase().split(/[-_]/)[0];
  return base === "pl" || base === "de" ? base : "en";
}

/**
 * The wall clock on a device, from its IANA timezone.
 *
 * The morning nudge is the only feature that needs this, and it needs it per
 * DEVICE: 07:00 is a promise about the athlete's morning, not the server's.
 * `Intl` does the zone arithmetic (including whatever a government did to DST
 * last year), and an unknown/garbage zone name returns null rather than
 * silently falling back to UTC — a nudge not sent is recoverable, a nudge sent
 * at 02:00 is not.
 */
export function localClock(timezone: string, now: Date): { hour: number; day: string } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    }).formatToParts(now);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    const [y, m, d] = [get("year"), get("month"), get("day")];
    // hourCycle h23 still renders midnight as "24" in some ICU builds.
    const hour = Number(get("hour")) % 24;
    if (!y || !m || !d || !Number.isFinite(hour)) return null;
    return { hour, day: `${y}-${m}-${d}` };
  } catch {
    return null;
  }
}

/** A UTC instant as a `YYYY-MM-DD` day in `timezone` — null on an unknown zone. */
export const localDayIn = (timezone: string, at: Date): string | null => localClock(timezone, at)?.day ?? null;

/**
 * The day an assigned session lands on, as a phrase for a notification body.
 *
 * A weekday name inside the coming week ("Monday"), a date beyond it ("2 Sep"),
 * and nothing at all for a date that has already passed — a push that says
 * "assigned for last Tuesday" is worse than one that just names the session.
 * Localized off the recipient's language, since the whole notification is.
 *
 * Server-local calendar days: the assignment's date is a coach's choice of DAY,
 * not an instant, and the recipient's own zone is a device-level fact that the
 * two callers here (a coach's request, not a cron) have no need to resolve.
 */
export function assignmentDayLabel(date: Date, lang: Lang, now: Date = new Date()): string {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(date) - day(now)) / 86_400_000);
  if (days < 0) return "";
  try {
    if (days <= 6) return new Intl.DateTimeFormat(lang, { weekday: "long" }).format(date);
    return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(date);
  } catch {
    return "";
  }
}
