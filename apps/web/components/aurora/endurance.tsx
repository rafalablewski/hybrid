"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  activeDisciplines, disciplineSessions, DISCIPLINE_META, formatDisciplinePace, disciplinePaceUnit,
  runStats, weeklyMileage, paceEffortSplit, pacedRunMoves, paceSeries,
  type CardioDiscipline, type LoggedSession,
} from "@hybrid/core";
import { HeroScreen } from "./hero";
import { fs, space, LINE_HEX, ASH, BLUE, tip, mono } from "@/lib/ui";
import { AuroraIcon } from "./icons";
import { useLang } from "@/lib/i18n";

/**
 * AURORA Endurance hub (web) — per-discipline analytics (run / swim / bike /
 * row / ski / walk), the web TWIN of components/aurora/endurance.tsx on mobile.
 *
 * Same core helpers, same sections in the same order, same empty states — only
 * the rendering differs (recharts here, dependency-free bars on the phone), so
 * the two clients can't drift on what the numbers mean. Every pace/best value is
 * labelled in the selected discipline's own unit via formatDisciplinePace (/km
 * running, /100m swimming, /500m rowing, km/h cycling).
 *
 * Running lives here as the `running` discipline — the standalone Running screen
 * was folded in to avoid showing the same analytics twice.
 */

const fmtWeek = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;

function Stat({ label, value, c }: { label: string; value: string | number; c?: string }) {
  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: fs.display, color: c ?? C("chalk") }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4, color: C("ash") }}>{label}</div>
    </div>
  );
}

const head = (color: string, k: string) => (
  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C(color), marginBottom: 10 }}>{k}</div>
);

/** A pill chip — the discipline picker and the pace-trend move picker. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="pressable"
      onClick={onClick}
      aria-pressed={on}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: fs.caption,
        padding: "6px 16px", borderRadius: 999, cursor: "pointer",
        color: on ? C("ink") : C("ash"), background: on ? C("blue") : "transparent",
        border: `1px solid ${on ? C("blue") : C("line")}`,
      }}
    >
      {children}
    </button>
  );
}

export default function AuroraEndurance({ sessions }: { sessions: LoggedSession[] }) {
  const { t } = useLang();
  const [pick, setPick] = useState<CardioDiscipline | "">("");
  const [move, setMove] = useState("");

  const active = useMemo(() => activeDisciplines(sessions), [sessions]);
  // Fall back to the busiest logged discipline whenever the held pick isn't one
  // the athlete actually has data for (first load, or a discipline that aged out).
  const discipline: CardioDiscipline | "" = active.some((d) => d.discipline === pick) ? pick : (active[0]?.discipline ?? "");
  const dSessions = useMemo(() => (discipline ? disciplineSessions(sessions, discipline) : []), [sessions, discipline]);

  const totals = active.find((d) => d.discipline === discipline);
  const stats = useMemo(() => runStats(dSessions), [dSessions]);
  const mileage = useMemo(() => weeklyMileage(dSessions, 8), [dSessions]);
  const split = useMemo(() => paceEffortSplit(dSessions), [dSessions]);
  const paceMoves = useMemo(() => pacedRunMoves(dSessions), [dSessions]);
  const activeMove = paceMoves.includes(move) ? move : (paceMoves[0] ?? "");
  const paceData = useMemo(
    () => (activeMove ? paceSeries(dSessions, activeMove).map((p) => ({ w: fmtWeek(p.date), pace: p.secPerKm })) : []),
    [dSessions, activeMove],
  );

  if (!discipline || !totals) {
    return (
    <HeroScreen hero={{ rank: "title", title: t("endurance.title") }}>
      <div style={{ ...card, textAlign: "center", padding: 40 }}>
        <div style={{ fontWeight: 800, fontSize: fs.heading, color: C("chalk") }}>{t("endurance.emptyTitle")}</div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), lineHeight: 1.6, maxWidth: 460, margin: "10px auto 0" }}>{t("endurance.emptyBody")}</p>
      </div>
    </HeroScreen>
    );
  }

  const meta = DISCIPLINE_META[discipline];
  const dName = (d: CardioDiscipline) => t(DISCIPLINE_META[d].labelKey);
  const splitTotal = split.easy + split.moderate + split.hard;
  const hasEffort = splitTotal > 0;
  const easyPct = hasEffort ? Math.round((split.easy / splitTotal) * 100) : null;
  const mileageData = mileage.map((w) => ({ w: fmtWeek(w.weekStart), km: w.km }));
  const paceUnit = disciplinePaceUnit(discipline);

  return (
    <HeroScreen hero={{ rank: "title", title: t("endurance.title") }}>
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg, maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>

      {/* Discipline picker — one chip per discipline with logged cardio. */}
      {active.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
          {active.map((d) => (
            <Chip key={d.discipline} on={d.discipline === discipline} onClick={() => { setPick(d.discipline); setMove(""); }}>
              <span aria-hidden>{DISCIPLINE_META[d.discipline].emoji}</span>
              {dName(d.discipline)}
            </Chip>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: 16 }}>
        <Stat label={t("endurance.efforts")} value={totals.efforts} />
        <Stat label="KM" value={totals.distanceKm} c={C("blue")} />
        <Stat label="H" value={Math.round(totals.minutes / 6) / 10} />
        {easyPct != null && <Stat label={t("running.easyPct")} value={`${easyPct}%`} c={C("lime")} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: space.lg }}>
        <div style={card}>
          {head("blue", t("endurance.weeklyVolume"))}
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={mileageData}>
              <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" />
              <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} />
              <YAxis stroke={ASH} style={{ ...mono, fontSize: fs.micro }} />
              <Tooltip contentStyle={tip} formatter={(v) => `${v} km`} />
              <Bar dataKey="km" fill={BLUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {paceData.length > 1 && (
          <div style={card}>
            {head("blue", `${t("session.paceTrend")} – ${activeMove}`)}
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={paceData}>
                <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" />
                <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} />
                {/* Reversed: a LOWER sec/km is faster, so "up" always reads as better
                    — and for cycling the same canonical rate renders as km/h speed. */}
                <YAxis
                  stroke={ASH}
                  style={{ ...mono, fontSize: fs.micro }}
                  reversed
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => formatDisciplinePace(v, discipline)}
                  width={56}
                />
                <Tooltip contentStyle={tip} formatter={(v) => `${formatDisciplinePace(Number(v), discipline)} ${paceUnit}`} />
                <Line type="monotone" dataKey="pace" name="pace" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {paceData.length <= 1 && paceMoves.length > 0 && (
        <div style={{ ...card, fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{t("running.paceTrendHint")}</div>
      )}

      {hasEffort && (
        <div style={card}>
          {head("lime", t("running.effortSplit"))}
          <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", background: C("ink") }}>
            {([["easy", split.easy, C("lime")], ["moderate", split.moderate, C("amber")], ["hard", split.hard, C("red")]] as const).map(
              ([k, v, c]) => v > 0 && <div key={k} style={{ width: `${(v / splitTotal) * 100}%`, background: c }} />,
            )}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            <Legend c={C("lime")} label={`${t("running.easy")} ${split.easy}m`} />
            <Legend c={C("amber")} label={`${t("running.moderate")} ${split.moderate}m`} />
            <Legend c={C("red")} label={`${t("running.hard")} ${split.hard}m`} />
          </div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), lineHeight: 1.5, marginTop: 10, marginBottom: 0 }}>{t("running.paceNote")}</p>
        </div>
      )}

      {paceMoves.length > 1 && (
        <div style={card}>
          {head("ash", t("session.paceTrend"))}
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
            {paceMoves.map((m) => <Chip key={m} on={activeMove === m} onClick={() => setMove(m)}>{m}</Chip>)}
          </div>
        </div>
      )}

      <div style={card}>
        {head("blue", t("running.byMove"))}
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
          <div style={{ minWidth: 420 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: space.sm, paddingBottom: 6, borderBottom: `1px solid ${C("line")}` }}>
              {[t("running.move"), "KM", t("running.longest"), paceUnit.replace("/", "")].map((h) => (
                <span key={h} style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", color: C("ash") }}>{h}</span>
              ))}
            </div>
            {stats.map((r) => (
              <div key={r.move} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: space.sm, padding: "8px 0", borderTop: `1px solid ${C("line")}`, fontFamily: "var(--font-mono)", fontSize: fs.body }}>
                <span style={{ color: C("chalk") }}>{r.move}</span>
                <span style={{ color: C("ash") }}>{r.distanceKm}</span>
                <span style={{ color: C("ash") }}>{r.longestKm || "–"}</span>
                <span style={{ color: r.bestPaceSecPerKm != null ? C("blue") : C("ash") }}>
                  {r.bestPaceSecPerKm != null ? formatDisciplinePace(r.bestPaceSecPerKm, discipline) : "–"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), textAlign: "center" }}>
        <span aria-hidden>{meta.emoji}</span> {dName(discipline)}
      </div>
    </div>
    </HeroScreen>
  );
}

function Legend({ c, label }: { c: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: space.xs }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{label}</span>
    </div>
  );
}
