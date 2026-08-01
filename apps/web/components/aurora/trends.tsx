"use client";

import { createElement, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  weeklyVolumeTrend, exerciseTable, fmtWeight, fmtTonnage, kgToUnit,
  type LoggedSession, type ExercisePeriod, type TrendDir, type ExerciseTableRow,
} from "@hybrid/core";
import { fs, space, LINE, LINE_HEX, LIME, LIME_HEX, ASH, BLUE, tip, mono } from "@/lib/ui";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useLang } from "@/lib/i18n";

const fmtWeek = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const C = (v: string) => `var(--color-${v})`;
const TREND_GLYPH: Record<TrendDir, { g: string; c: string }> = { up: { g: "▲", c: "lime" }, down: { g: "▼", c: "amber" }, flat: { g: "→", c: "ash" } };
const PERIODS: { id: ExercisePeriod; key: string }[] = [{ id: "8w", key: "w.analyze.trends.period8w" }, { id: "6m", key: "w.analyze.trends.period6m" }, { id: "1y", key: "w.analyze.trends.period1y" }, { id: "all", key: "w.analyze.trends.periodAll" }];
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;

/** AURORA Trends (web) — full bespoke analytics hub reusing the exact engines +
 *  recharts volume/tonnage/muscle bars. */
/** The screen's own title. IDENTICAL styling on its own route and inside the
 *  unified Performance page — only the heading LEVEL changes, so the page
 *  doesn't carry three <h1>s. Nothing here may restyle: this section must look
 *  exactly as it did when it was its own screen. */
function Head({ unified, t }: { unified: boolean; t: (k: string) => string }) {
  return createElement(
    unified ? "h2" : "h1",
    { style: { fontWeight: 900, fontSize: fs.display, margin: 0 } },
    t("w.analyze.trends.title"),
  );
}

export default function AuroraTrends({ sessions, onOpenExercise, unified = false }: {
  sessions: LoggedSession[];
  onOpenExercise?: (name: string) => void;
  /** True when these sections render INSIDE the unified Performance page: the
   *  page title demotes to a section head. */
  unified?: boolean;
}) {
  const { t } = useLang();
  const [period, setPeriod] = useState<ExercisePeriod>("all");
  const [sort, setSort] = useState<{ k: keyof ExerciseTableRow; dir: 1 | -1 }>({ k: "volume", dir: -1 });
  const prefs = useLoggerPrefs();
  const iw = prefs.countWarmupsInVolume, units = prefs.units;
  const bw = useBodyweightLookup();
  const weeks = useMemo(() => weeklyVolumeTrend(sessions, 8, Date.now(), iw, bw), [sessions, iw, bw]);
  const table = useMemo(() => exerciseTable(sessions, period, Date.now(), iw, bw), [sessions, period, iw, bw]);
  // "Has this athlete lifted at all?" — asked of the weekly series this screen
  // actually draws, rather than of a second volumeStatus() pass whose only other
  // job (the muscle breakdown) now lives on the Volume rows.
  const trained = weeks.some((w) => w.sets > 0) || table.length > 0;
  const sortedTable = useMemo(() => { const arr = [...table]; const { k, dir } = sort; arr.sort((a, b) => (k === "name" ? dir * a.name.localeCompare(b.name) : dir * ((a[k] as number) - (b[k] as number)))); return arr; }, [table, sort]);
  const sortBy = (k: keyof ExerciseTableRow) => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" ? 1 : -1 }));
  const weekData = weeks.map((w) => ({ w: fmtWeek(w.weekStart), sets: w.sets, t: Number(((units === "kg" ? w.tonnage : kgToUnit(w.tonnage, "lb")) / 1000).toFixed(1)) }));
  const frameHead = (color: string, kicker: string) => <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C(color), marginBottom: 10 }}>{kicker}</div>;

  if (!trained) {
    return (
      <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
        <Head unified={unified} t={t} />
        <div style={{ ...card, textAlign: "center", padding: 40 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, color: C("ash") }}>{t("w.analyze.trends.empty")}</span></div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg, maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <Head unified={unified} t={t} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: space.lg }}>
        <div style={card}>{frameHead("lime", t("w.analyze.trends.weeklySets"))}
          <ResponsiveContainer width="100%" height={200}><BarChart data={weekData}><CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" /><XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} /><YAxis stroke={ASH} style={{ ...mono, fontSize: fs.micro }} width={32} /><Tooltip contentStyle={tip} formatter={(v) => `${v} ${t("w.analyze.vol.sets")}`} /><Bar dataKey="sets" fill={LIME_HEX} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
        <div style={card}>{frameHead("blue", `${t("w.analyze.trends.weeklyTonnage")} – ${units === "kg" ? t("w.analyze.trends.tonnes") : t("w.analyze.trends.klb")}`)}
          <ResponsiveContainer width="100%" height={200}><BarChart data={weekData}><CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" /><XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} /><YAxis stroke={ASH} style={{ ...mono, fontSize: fs.micro }} width={32} /><Tooltip contentStyle={tip} formatter={(v) => `${v} ${units === "kg" ? "t" : "k lb"}`} /><Bar dataKey="t" fill={BLUE} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.ms }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.analyze.trends.exerciseAnalytics")}</span>
          <div style={{ display: "flex", gap: space.xxs }}>
            {PERIODS.map((p) => <button key={p.id} onClick={() => setPeriod(p.id)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, padding: "4px 12px", borderRadius: 999, cursor: "pointer", color: period === p.id ? C("ink") : C("ash"), background: period === p.id ? C("lime") : "transparent", border: `1px solid ${period === p.id ? C("lime") : C("line")}` }}>{t(p.key)}</button>)}
          </div>
        </div>
        <div style={{ marginTop: 12, overflowX: "auto", maxWidth: "100%" }}>
          <div style={{ minWidth: 420 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 0.6fr", gap: space.sm, paddingBottom: 6, borderBottom: `1px solid ${C("line")}` }}>
              {([["w.analyze.trends.colExercise", "name"], ["w.analyze.trends.colFreq", "sessions"], ["w.analyze.trends.colHeaviest", "topWeight"], ["w.analyze.trends.colVolume", "volume"], ["w.analyze.trends.colTrend", null]] as const).map(([h, k]) => (
                <button key={h} disabled={!k} onClick={() => k && sortBy(k)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", textAlign: "left", background: "none", border: "none", padding: 0, cursor: k ? "pointer" : "default", color: k && sort.k === k ? C("lime") : C("ash") }}>{t(h)}{k && sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button>
              ))}
            </div>
            {sortedTable.map((r) => { const tr = TREND_GLYPH[r.trend]; return (
              <button key={r.name} onClick={() => onOpenExercise?.(r.name)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 0.6fr", gap: space.sm, padding: "9px 0", border: "none", borderTop: `1px solid ${C("line")}`, background: "none", cursor: onOpenExercise ? "pointer" : "default", textAlign: "left", width: "100%", fontFamily: "var(--font-mono)", fontSize: fs.body }}>
                <span style={{ color: onOpenExercise ? C("lime") : C("chalk") }}>{r.name}</span>
                <span>{r.sessions}×</span>
                <span style={{ color: r.kind === "strength" ? C("chalk") : C("ash") }}>{r.kind === "strength" ? fmtWeight(r.topWeight, units) : "–"}</span>
                <span>{r.kind === "cardio" ? `${r.volume} km` : fmtTonnage(r.volume, units)}</span>
                <span style={{ color: C(tr.c) }}>{tr.g}</span>
              </button>
            ); })}
          </div>
        </div>
      </div>
    </div>
  );
}
