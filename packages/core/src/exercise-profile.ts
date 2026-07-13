import type { BlockKind } from "./engines/session";
import { inferBlockKind } from "./engines/session";
import { olympicSport, timedSportOnly, sportDistanceUnit, sportPacePerMeters } from "./olympic-sports";

// THE per-exercise property model. Every exercise/sport tracks its OWN values:
// a run has pace + distance + time (per km), a swim has a different pace split
// (/100 m) and metre distances, rowing paces per 500 m, tennis is time-only, a
// treadmill adds incline where an outdoor run adds elevation gain. This module
// is the single declarative answer to "which fields does THIS exercise get" —
// resolved from the Olympic-sports catalog (metrics/units/pace splits) plus
// name heuristics for custom entries — so both clients' Builders and loggers
// render the same instrument for the same movement and can never drift. A
// squat can never show pace; a swim can never show incline; by construction.

/** An input field a cardio activity's editor shows, in display order. */
export type CardioField = "distance" | "duration" | "incline" | "stroke" | "elevation" | "zone";

export interface ExerciseProfile {
  /** The block kind this exercise logs as (strength | cardio | conditioning). */
  kind: BlockKind;
  /**
   * Ordered cardio input fields. Empty for strength (which prescribes per-set
   * load × reps × effort + planned rest) and conditioning (format / work /
   * rest / rounds / minutes) — their editors are fixed by kind.
   */
  fields: CardioField[];
  /** Whether a derived pace is meaningful (distance sports only — never stored). */
  pace: boolean;
  /** The unit distance is entered/shown in ("m" for pool/ergo sports). Storage stays km. */
  distanceUnit: "km" | "m";
  /** The sport's pace split label — "/km", "/100m" (swim), "/500m" (row/canoe). */
  paceLabel: string;
}

const TREADMILL_RE = /\b(treadmill|incline walk)\b/i;
const SWIM_RE = /\b(swim|swimming|freestyle|breaststroke|backstroke|butterfly|open water)\b/i;
// Outdoor climb sports where elevation GAIN is a real training variable. A
// treadmill run matches \brun\b too, but its climb is the incline field —
// treadmill wins and elevation is suppressed (see below).
const ELEVATION_RE = /\b(run|running|trail|hike|hiking|ruck|rucking|cycling|bike|biking|ride|skiing)\b/i;

/** Resolve the property model for an exercise/sport name. */
export function exerciseProfile(name: string): ExerciseProfile {
  // A catalog sport ALWAYS logs as a cardio activity (that's how the sport
  // picker adds it) — the keyword heuristic only matches whole words ("Run"
  // but not "Running"), so the catalog must win before inference.
  const kind: BlockKind = olympicSport(name) ? "cardio" : inferBlockKind(name);
  const per = sportPacePerMeters(name);
  const base = {
    distanceUnit: sportDistanceUnit(name),
    paceLabel: per === 1000 ? "/km" : `/${per}m`,
  } as const;
  if (kind !== "cardio") return { kind, fields: [], pace: false, ...base };

  // Timed sports (tennis, judo, …) track duration only — plus an HR zone,
  // which applies to any cardio effort.
  if (timedSportOnly(name)) return { kind, fields: ["duration", "zone"], pace: false, ...base };

  const incline = TREADMILL_RE.test(name);
  const stroke = SWIM_RE.test(name);
  const elevation = !incline && !stroke && ELEVATION_RE.test(name);
  const fields: CardioField[] = [
    "distance",
    "duration",
    ...(incline ? (["incline"] as const) : []),
    ...(stroke ? (["stroke"] as const) : []),
    ...(elevation ? (["elevation"] as const) : []),
    "zone",
  ];
  return { kind, fields, pace: true, ...base };
}

/** Convenience: does this exercise's editor show the given field? */
export function hasField(name: string, field: CardioField): boolean {
  return exerciseProfile(name).fields.includes(field);
}
