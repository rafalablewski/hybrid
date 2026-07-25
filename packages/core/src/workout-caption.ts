/**
 * WORKOUT SHARE CAPTION — the plain-text blurb that goes out with a shared
 * workout (the Web Share API body, the text-only fallback, and the caption
 * beside the story image).
 *
 * Shared because the two clients had drifted badly: mobile built it inline and
 * localized, while web's copy was hardcoded English AND headlined a different
 * lift (the session's heaviest, rather than the record that was actually set).
 * One builder means the caption a web user shares and the caption a mobile user
 * shares are the same sentence.
 *
 * `headline` is passed in already formatted (via formatStrengthPr / the cardio
 * equivalent) so the caller can hand over the SAME record the reveal hero put on
 * screen — a caption naming a different lift than the trophy the athlete just
 * saw is the bug this parameter exists to prevent.
 */
import { fmtTonnage, type WeightUnit } from "./units";

export interface WorkoutCaption {
  title: string;
  minutes: number;
  sets: number;
  /** session tonnage in kg */
  volume: number;
  /** the athlete's very first logged workout */
  firstEver?: boolean;
  /** pre-formatted PR / top-lift line, or null when the session set none */
  headline?: string | null;
}

export function workoutShareCaption(
  c: WorkoutCaption,
  units: WeightUnit,
  t: (k: string) => string,
): string {
  return [
    c.firstEver ? t("share.firstWorkout") : null,
    `\u{1F4AA} ${c.title || t("share.workoutFallback")} — ${t("share.done")}`,
    // A session with no clock (imported, or still running) drops the segment
    // rather than claiming "0 min".
    `${c.minutes ? `${c.minutes} min – ` : ""}${c.sets} ${t("summary.sets").toLowerCase()} – ${fmtTonnage(c.volume, units)}`,
    c.headline || null,
    t("share.tracked"),
  ]
    .filter(Boolean)
    .join("\n");
}
