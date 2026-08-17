import type { CardioDiscipline, LoggedSession } from "./engines/session";
import { glyphMark, sportMarkOf, type Mark } from "./theme/mark";
import { paceClock } from "./engines/session";
import { runTotals, disciplineSessions, type RunTotals } from "./engines/running";

/**
 * Endurance hub — the per-discipline layer over the (discipline-agnostic) running
 * aggregates. The Running screen is runs-only; this gives swims, rides, rows and
 * every other endurance discipline the same analytics, each labelled in its own
 * unit (swim /100m, row /500m, run /km, bike km/h). Pure data + formatting — the
 * screens read `activeDisciplines` + `DISCIPLINE_META` and format pace/speed via
 * `formatDisciplinePace`, so web and mobile can't drift on units.
 */

/** How a discipline reads its headline speed: a per-distance PACE (run/swim/row/
 *  ski/walk — lower is faster), a SPEED in km/h (cycling — higher is faster), or
 *  TIMED only (no distance — a logged sport). */
export type DisciplineMode = "pace" | "speed" | "timed";

export interface DisciplineMeta {
  discipline: CardioDiscipline;
  /** i18n key for the display name (mobile i18n; English fallback in the value). */
  labelKey: string;
  /**
   * The discipline's own drawing. Was an emoji (🏃 🚴 🏊 🚣 ⛷️ 🚶 🔥 🎾); it is
   * a `Mark` now, so five of the eight resolve through the DRAWN sport marks
   * that already existed for them and the other three name a glyph. See
   * theme/mark.ts.
   */
  mark: Mark;
  mode: DisciplineMode;
  /** Metres per pace split — 1000 (/km), 100 (/100m swim), 500 (/500m row). */
  pacePer: number;
  /** Natural per-effort distance unit (storage is ALWAYS km; this is display only). */
  distanceUnit: "km" | "m";
}

/**
 * The endurance disciplines the hub surfaces, in display order. Excludes
 * `"sport"` — a racket/team/combat session (tennis, football…) is a logged
 * activity but not endurance, so it never appears here (nor in the endurance
 * summaries). `"other"` is the catch-all for generic/custom cardio.
 */
export const ENDURANCE_DISCIPLINES: CardioDiscipline[] = [
  "running",
  "cycling",
  "swimming",
  "rowing",
  "skiing",
  "walking",
  "other",
];

export const DISCIPLINE_META: Record<CardioDiscipline, DisciplineMeta> = {
  running: { discipline: "running", labelKey: "endurance.running", mark: sportMarkOf("Running"), mode: "pace", pacePer: 1000, distanceUnit: "km" },
  cycling: { discipline: "cycling", labelKey: "endurance.cycling", mark: sportMarkOf("Cycling"), mode: "speed", pacePer: 1000, distanceUnit: "km" },
  swimming: { discipline: "swimming", labelKey: "endurance.swimming", mark: sportMarkOf("Swimming"), mode: "pace", pacePer: 100, distanceUnit: "m" },
  rowing: { discipline: "rowing", labelKey: "endurance.rowing", mark: sportMarkOf("Rowing"), mode: "pace", pacePer: 500, distanceUnit: "m" },
  skiing: { discipline: "skiing", labelKey: "endurance.skiing", mark: sportMarkOf("Cross-Country Skiing"), mode: "pace", pacePer: 1000, distanceUnit: "km" },
  walking: { discipline: "walking", labelKey: "endurance.walking", mark: sportMarkOf("Race Walking"), mode: "pace", pacePer: 1000, distanceUnit: "km" },
  other: { discipline: "other", labelKey: "endurance.other", mark: glyphMark("flame"), mode: "pace", pacePer: 1000, distanceUnit: "km" },
  sport: { discipline: "sport", labelKey: "endurance.sport", mark: sportMarkOf("Tennis"), mode: "timed", pacePer: 1000, distanceUnit: "km" },
};

export interface DisciplineSummary extends RunTotals {
  discipline: CardioDiscipline;
}

/**
 * The endurance disciplines that have logged cardio, most efforts first — the
 * hub's tile/tab list. `"sport"` is never included (see ENDURANCE_DISCIPLINES).
 */
export function activeDisciplines(sessions: LoggedSession[]): DisciplineSummary[] {
  const out: DisciplineSummary[] = [];
  for (const discipline of ENDURANCE_DISCIPLINES) {
    const totals = runTotals(disciplineSessions(sessions, discipline));
    if (totals.efforts > 0) out.push({ discipline, ...totals });
  }
  return out.sort((a, b) => b.efforts - a.efforts || b.distanceKm - a.distanceKm);
}

/** The bare unit label for a discipline's headline metric, e.g. "/km", "/100m",
 *  "/500m", "km/h" — for axis labels and column heads. */
export function disciplinePaceUnit(discipline: CardioDiscipline): string {
  const meta = DISCIPLINE_META[discipline];
  if (meta.mode === "speed") return "km/h";
  return meta.pacePer === 1000 ? "/km" : `/${meta.pacePer}m`;
}

/**
 * The rate's FIGURE alone, in the discipline's own reading — "5:42", "1:30",
 * "32.5" — with no unit on it. Split out from formatDisciplinePace so a surface
 * that types the figure and its unit differently (a held chart's readout, where
 * the unit rides small beside a large number) doesn't have to re-derive the
 * conversion and drift from the labelled form beside it.
 */
export function disciplinePaceFigure(secPerKm: number, discipline: CardioDiscipline): string {
  const meta = DISCIPLINE_META[discipline];
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "–";
  if (meta.mode === "speed") return String(Math.round((3600 / secPerKm) * 10) / 10);
  return paceClock(secPerKm * (meta.pacePer / 1000));
}

/**
 * Format a canonical seconds-per-km rate for a discipline: a labelled PACE
 * ("5:42 /km", "1:30 /100m", "2:00 /500m") for pace disciplines, or a SPEED
 * ("32.5 km/h") for cycling. Storage is always km so the input is single-unit;
 * this only converts for display.
 */
export function formatDisciplinePace(secPerKm: number, discipline: CardioDiscipline): string {
  const figure = disciplinePaceFigure(secPerKm, discipline);
  if (figure === "–") return figure;
  return `${figure} ${disciplinePaceUnit(discipline)}`;
}
