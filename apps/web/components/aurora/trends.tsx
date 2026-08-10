"use client";

import { createElement, useMemo, useState, type CSSProperties } from "react";
import {
  weeklyVolumeTrend, exerciseTable, EXERCISE_TABLE_FOLD, fmtWeight, fmtTonnage, fmtRowChange, splitFigure, kgToUnit, sparkline,
  volumeTrendReading, scrubPosition,
  type LoggedSession, type ExercisePeriod, type TrendDir, type ExerciseTableRow, type WeekVolume,
} from "@hybrid/core";
import { HeroScreen } from "./hero";
import { fs, space, LINE_HEX, LIME_HEX, BLUE, ASH } from "@/lib/ui";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useLang } from "@/lib/i18n";
import { useChartScrub, SCRUB_STYLE } from "./chart-scrub";

const C = (v: string) => `var(--color-${v})`;
const PERIODS: { id: ExercisePeriod; key: string }[] = [{ id: "8w", key: "w.analyze.trends.period8w" }, { id: "6m", key: "w.analyze.trends.period6m" }, { id: "1y", key: "w.analyze.trends.period1y" }, { id: "all", key: "w.analyze.trends.periodAll" }];

// ONE SHEET — the three floating cards (sets, tonnage, exercise table) are a
// single surface divided by hairlines, identical to mobile's. Three cards made
// one screen look like three unrelated features, and each spent its height on a
// chart to say a number it then set at 10px in the corner. Every band now leads
// with its FIGURE; the eight-week line supports it at the size a supporting mark
// deserves. See design/trend-cards-redesign-ideas.html (idea 7).
const PAD_X = 20;
// Wider than the phone's 112 because the band is wider — the SHAPE is identical,
// because both clients get it from the same sparkline().
const SPARK = { width: 160, height: 46, pad: 4 };

/** A week bucket's date, as the bands print it. */
const fmtWeekDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

const sheet: CSSProperties = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", overflow: "hidden" };
const bandLabel: CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.caption, color: C("ash") };
const figure: CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 900, fontSize: fs.display, letterSpacing: "-.045em", color: C("chalk"), fontVariantNumeric: "tabular-nums" };
const metaTxt: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") };
const colHead: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".09em", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" };

/** AURORA Trends (web) — the analytics sheet, reusing the exact engines. */
/** The screen's own title. IDENTICAL styling on its own route and inside the
 *  unified Performance page — only the heading LEVEL changes, so the page
 *  doesn't carry three <h1>s. */
function Head({ unified, t }: { unified: boolean; t: (k: string) => string }) {
  if (!unified) return null;
  return createElement("h2", { style: { fontWeight: 900, fontSize: fs.display, margin: 0 } }, t("w.analyze.trends.title"));
}

export default function AuroraTrends({ sessions, onOpenExercise, unified = false }: {
  sessions: LoggedSession[];
  onOpenExercise?: (name: string) => void;
  /** True when these sections render INSIDE the unified Performance page: the
   *  page title demotes to a section head. */
  unified?: boolean;
}) {
  const { t } = useLang();
  // The DEFAULT window is bounded (audit/10 T9): "all" ran one per-exercise
  // dashboard pass over full history for every movement ever logged, on mount,
  // to show a table most visits never scroll to the bottom of. Eight weeks
  // matches the two measure bands above it; "all" stays one tap away.
  const [period, setPeriod] = useState<ExercisePeriod>("8w");
  const [sort, setSort] = useState<{ k: keyof ExerciseTableRow; dir: 1 | -1 }>({ k: "volume", dir: -1 });
  // The table wears EXERCISE_TABLE_FOLD rows until the athlete asks for all of
  // them — the fold is the engine's constant, so both clients fold at one depth.
  const [allRows, setAllRows] = useState(false);
  const prefs = useLoggerPrefs();
  const iw = prefs.countWarmupsInVolume, units = prefs.units;
  const bw = useBodyweightLookup();
  const weeks = useMemo(() => weeklyVolumeTrend(sessions, 8, Date.now(), iw, bw), [sessions, iw, bw]);
  const table = useMemo(() => exerciseTable(sessions, period, Date.now(), iw, bw), [sessions, period, iw, bw]);
  // "Has this athlete lifted at all?" — asked of the weekly series this screen
  // actually draws, rather than of a second volumeStatus() pass whose only other
  // job (the muscle breakdown) now lives on the Volume rows.
  const trained = weeks.some((w) => w.sets > 0) || table.length > 0;
  const sortedTable = useMemo(() => {
    const arr = [...table]; const { k, dir } = sort;
    arr.sort((a, b) => (k === "name" ? dir * a.name.localeCompare(b.name) : dir * (((a[k] as number) ?? 0) - ((b[k] as number) ?? 0))));
    return arr;
  }, [table, sort]);
  const sortBy = (k: keyof ExerciseTableRow) => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" ? 1 : -1 }));
  const shownRows = allRows ? sortedTable : sortedTable.slice(0, EXERCISE_TABLE_FOLD);
  const folded = sortedTable.length - EXERCISE_TABLE_FOLD;

  // One meaning per colour: chartreuse marks the CURRENT week and the live
  // selection, teal is the second measure, and a change is signed text tinted by
  // whether it was an improvement — never a bare arrow.
  const TREND: Record<TrendDir, string> = { up: C("lime"), down: C("amber"), flat: C("ash") };
  const setSeries = weeks.map((w) => w.sets);
  const tonneSeries = weeks.map((w) => (units === "kg" ? w.tonnage : kgToUnit(w.tonnage, "lb")) / 1000);
  const last = weeks[weeks.length - 1];
  const avgSets = setSeries.reduce((a, b) => a + b, 0) / (setSeries.length || 1);
  const avgTonnage = weeks.reduce((a, w) => a + w.tonnage, 0) / (weeks.length || 1);
  const [tonnageValue, tonnageUnit] = splitFigure(fmtTonnage(last?.tonnage ?? 0, units));

  const rowGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px 78px", gap: space.md, alignItems: "start" };

  /** A measure band: label, the week's figure, its eight-week average, and the
   *  eight-week line — drawn on a TRUE zero baseline, so a week with nothing
   *  logged sits on the line instead of being floored into a phantom bar.
   *
   *  HELD, the band answers for another week in the slots it already has: the
   *  FIGURE becomes that week's, and the average line underneath becomes the
   *  week it belongs to. A pinned pill would cover a 160×46 spark whole. */
  const Measure = ({ label, value, unit, avg, series, color, measure }: {
    label: string; value: string; unit?: string; avg: string; series: number[]; color: string;
    measure: "sets" | "tonnage";
  }) => {
    const s = sparkline(series, SPARK);
    // sparkline() insets its points by `pad` at each end (the endpoint dot must
    // not clip), so the hit-testing has to know about the same inset.
    const geo = { count: series.length, mode: "point" as const, inset: (SPARK.pad ?? 4) / SPARK.width };
    const scrub = useChartScrub(geo.count, geo.mode, geo.inset);
    const read = scrub.index >= 0 ? volumeTrendReading(weeks, scrub.index, measure, units) : null;
    const hit = read ? s.points[read.index] : null;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: space.lg, padding: `17px ${PAD_X}px`, borderBottom: `1px solid ${C("line")}` }}>
        <div style={{ flex: 1, minWidth: 0 }} aria-live="polite">
          <div style={bandLabel}>{label}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 9 }}>
            <span style={{ ...figure, color: read?.best ? "var(--lime-text)" : C("chalk") }}>{read ? read.value : value}</span>
            {!!(read ? read.unit : unit) && <span style={{ ...bandLabel, fontSize: fs.caption }}>{read ? read.unit : unit}</span>}
          </div>
          <div style={{ ...metaTxt, marginTop: 8 }}>
            {read ? t("chart.weekOf").replace("{date}", fmtWeekDate(read.weekStart)) : avg}
          </div>
        </div>
        <div {...scrub.bind} aria-label={label} style={{ ...SCRUB_STYLE, position: "relative", flex: "none", lineHeight: 0 }}>
          <svg width={SPARK.width} height={SPARK.height} aria-hidden="true" style={{ display: "block" }}>
            <line x1={0} y1={s.baselineY} x2={SPARK.width} y2={s.baselineY} stroke={LINE_HEX} strokeWidth={1} />
            <path d={s.d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.6} />
            <circle cx={s.last.x} cy={s.last.y} r={3.2} fill={color} />
            {!!hit && <line x1={hit.x} x2={hit.x} y1={0} y2={SPARK.height} stroke={ASH} strokeOpacity={0.55} strokeWidth={1} />}
            {!!hit && <circle cx={hit.x} cy={hit.y} r={4} fill={C("chalk")} stroke={C("ink2")} strokeWidth={1.5} />}
          </svg>
        </div>
      </div>
    );
  };

  /** A sortable column label. The active key carries the arrow; nothing else is
   *  tinted, so chartreuse keeps meaning "selected". */
  const Col = ({ k, label, style }: { k: keyof ExerciseTableRow; label: string; style?: CSSProperties }) => (
    <button type="button" className="pressable" onClick={() => sortBy(k)} style={{ ...colHead, color: sort.k === k ? C("lime") : C("ash"), ...style }}>
      {label}{sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
    </button>
  );

  // Standing alone the screen wears the system's hero; embedded in the unified
  // Performance page the host owns the head, so it is just its sections.
  const shell = (children: React.ReactNode) =>
    unified ? <>{children}</> : <HeroScreen hero={{ rank: "title", title: t("w.analyze.trends.title") }}>{children}</HeroScreen>;

  if (!trained) {
    return shell(
      <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
        <Head unified={unified} t={t} />
        <div style={{ ...sheet, textAlign: "center", padding: 40 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, color: C("ash") }}>{t("w.analyze.trends.empty")}</span></div>
      </div>,
    );
  }

  return shell(
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg, maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <Head unified={unified} t={t} />

      <div style={sheet}>
        <Measure
          label={t("w.analyze.trends.setsMeasure")}
          value={String(last?.sets ?? 0)}
          avg={`${t("w.analyze.trends.avg8w")} ${Number(avgSets.toFixed(1))}`}
          series={setSeries}
          color={LIME_HEX}
          measure="sets"
        />
        <Measure
          label={t("w.analyze.trends.tonnageMeasure")}
          value={tonnageValue}
          unit={tonnageUnit}
          avg={`${t("w.analyze.trends.avg8w")} ${fmtTonnage(avgTonnage, units)}`}
          series={tonneSeries}
          color={BLUE}
          measure="tonnage"
        />

        {/* The quiet band — the sheet's one recessive surface, carrying the
            section's name and its period switch. The switch is an underline that
            moves, not a filled pill: the fill was competing with the figures
            above it for the same accent. */}
        <div style={{ background: C("ink"), display: "flex", alignItems: "center", gap: space.sm, padding: `12px ${PAD_X}px`, borderBottom: `1px solid ${C("line")}`, flexWrap: "wrap" }}>
          <span style={{ ...bandLabel, flex: 1, minWidth: 90 }}>{t("w.analyze.trends.perExercise")}</span>
          {PERIODS.map((p) => { const on = period === p.id; return (
            <button
              type="button"
              className="pressable"
              key={p.id}
              onClick={() => setPeriod(p.id)}
              style={{ fontFamily: "var(--font-display)", fontWeight: on ? 700 : 600, fontSize: fs.caption, padding: "3px 4px", background: "none", border: "none", borderBottom: `2px solid ${on ? C("lime") : "transparent"}`, cursor: "pointer", color: on ? C("chalk") : C("ash") }}
            >
              {t(p.key)}
            </button>
          ); })}
        </div>

        <div style={{ padding: `13px ${PAD_X}px 4px`, overflowX: "auto" }}>
          <div style={{ ...rowGrid, paddingBottom: 9 }}>
            <div style={{ minWidth: 0 }}>
              <Col k="name" label={t("w.analyze.trends.colExercise")} />
              {/* The header mirrors the ROW: what the row's second line shows,
                  the header's second line sorts. */}
              <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
                <Col k="sessions" label={t("w.analyze.trends.colFreq")} />
                <span style={{ ...colHead, color: C("ash"), cursor: "default" }}>–</span>
                <Col k="volume" label={t("w.analyze.trends.colVolume")} />
              </div>
            </div>
            <Col k="topWeight" label={t("w.analyze.trends.colHeaviest")} style={{ textAlign: "right" }} />
            <Col k="change" label={t("w.analyze.trends.colChange")} style={{ textAlign: "right" }} />
          </div>
          {shownRows.map((r) => (
            <button
              type="button"
              className="pressable"
              key={r.name}
              onClick={() => onOpenExercise?.(r.name)}
              style={{ ...rowGrid, width: "100%", padding: "13px 0", background: "none", border: "none", borderTop: `1px solid ${C("line")}`, cursor: onOpenExercise ? "pointer" : "default", textAlign: "left" }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.bodyLg, color: C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span style={{ ...metaTxt, display: "block", marginTop: 5 }}>
                  {`${r.sessions}× – ${r.kind === "cardio" ? `${r.volume} km` : fmtTonnage(r.volume, units)}`}
                </span>
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, color: C("chalk"), textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {r.kind === "strength" ? fmtWeight(r.topWeight, units) : `${r.volume} km`}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.change ? TREND[r.trend] : C("ash") }}>
                {fmtRowChange(r, units)}
              </span>
            </button>
          ))}
          {/* The list's END CONTROL — an EXPANDER, so it wears the expander
              grammar (endurance-lanes' All-sports control): chromeless, a BARE
              ＋/− with no ring (the ring promises a screen; this only grows the
              list in place), and an ash count naming exactly how many rows are
              folded — a cap is never silent. Mirrors mobile. */}
          {folded > 0 && (
            <button
              type="button"
              className="pressable"
              aria-expanded={allRows}
              onClick={() => setAllRows((v) => !v)}
              style={{ display: "flex", width: "100%", alignItems: "center", gap: 12, padding: "10px 0 13px", background: "none", border: "none", borderTop: `1px solid ${C("line")}`, cursor: "pointer", textAlign: "left", color: C("chalk") }}
            >
              <span style={{ width: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: C("ash"), flex: "0 0 32px" }} aria-hidden>{allRows ? "−" : "＋"}</span>
              <span style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg }}>
                {allRows ? t("w.analyze.trends.fewerRows") : t("w.analyze.trends.allRows")}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), fontVariantNumeric: "tabular-nums" }}>{allRows ? "−" : "+"}{folded}</span>
            </button>
          )}
        </div>
      </div>
    </div>,
  );
}
