"use client";

import { useEffect, useMemo, useState } from "react";
import { fs, space, sessionsByDay, monthMatrix, loadIntensity, sessionVolume, sessionLoad, localDayKey, localTodayKey, type LoggedSession } from "@hybrid/core";
import { useIsMobile } from "@/lib/use-media-query";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { useLang } from "@/lib/i18n";

const WEEKDAY_KEYS = ["w.analyze.cal.weekdayMon", "w.analyze.cal.weekdayTue", "w.analyze.cal.weekdayWed", "w.analyze.cal.weekdayThu", "w.analyze.cal.weekdayFri", "w.analyze.cal.weekdaySat", "w.analyze.cal.weekdaySun"];
const todayKey = localTodayKey;
const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro, marginRight: 6 }}>{label}</span>;
type EventRow = { id: string; name: string; sport: string; date: string };
type AssignmentRow = { id: string; name: string; date: string; status: string };

/** AURORA Calendar (web) — month heat-grid + day detail (events/assignments/
 *  sessions, mark-done), reusing the exact calendar engine + APIs. */
export default function AuroraCalendar({ sessions }: { sessions: LoggedSession[] }) {
  const { t } = useLang();
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [selected, setSelected] = useState<string>(todayKey());
  const [events, setEvents] = useState<EventRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const isMobile = useIsMobile();

  const loadAssignments = () => fetch("/api/assignments").then((r) => (r.ok ? r.json() : { assignments: [] })).then((d: { assignments?: AssignmentRow[] }) => setAssignments((d.assignments ?? []).map((a) => ({ ...a, date: a.date.slice(0, 10) })))).catch(() => setAssignments([]));
  useEffect(() => {
    fetch("/api/events").then((r) => (r.ok ? r.json() : { events: [] })).then((d: { events?: EventRow[] }) => setEvents((d.events ?? []).map((e) => ({ ...e, date: e.date.slice(0, 10) })))).catch(() => setEvents([]));
    loadAssignments();
  }, []);
  const markDone = async (id: string) => { await fetch(`/api/assignments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "completed" }) }); loadAssignments(); };

  const bw = useBodyweightLookup();
  const byDay = useMemo(() => sessionsByDay(sessions, bw), [sessions, bw]);
  const intensity = useMemo(() => loadIntensity(byDay), [byDay]);
  const matrix = useMemo(() => monthMatrix(year, month), [year, month]);
  const eventsByDay = useMemo(() => { const m: Record<string, EventRow[]> = {}; for (const e of events) (m[e.date] ??= []).push(e); return m; }, [events]);
  const assignmentsByDay = useMemo(() => { const m: Record<string, AssignmentRow[]> = {}; for (const a of assignments) (m[a.date] ??= []).push(a); return m; }, [assignments]);
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = todayKey();
  const go = (delta: number) => { const m = month + delta; if (m < 0) { setMonth(11); setYear((y) => y - 1); } else if (m > 11) { setMonth(0); setYear((y) => y + 1); } else setMonth(m); };
  const jumpToday = () => { setYear(now.getUTCFullYear()); setMonth(now.getUTCMonth()); setSelected(today); };
  const selSessions = sessions.filter((s) => localDayKey(s.startedAt) === selected);
  const selEvents = eventsByDay[selected] ?? [];
  const selAssignments = assignmentsByDay[selected] ?? [];
  const navBtn = { fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.subtitle, minWidth: 36, height: 36, borderRadius: 999, border: `1px solid ${C("line")}`, background: C("ink"), color: C("chalk"), cursor: "pointer", padding: "0 12px" } as const;

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: space.lg, alignItems: "start", maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: fs.heading }}>{monthLabel}</div>
          <div style={{ display: "flex", gap: space.xs }}><button aria-label={t("common.previous")} onClick={() => go(-1)} style={navBtn}>‹</button><button onClick={jumpToday} style={navBtn}>{t("w.analyze.cal.today")}</button><button aria-label={t("common.next")} onClick={() => go(1)} style={navBtn}>›</button></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: space.xxs, marginBottom: 4 }}>
          {WEEKDAY_KEYS.map((d) => <span key={d} style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textAlign: "center", textTransform: "uppercase", color: C("ash") }}>{t(d)}</span>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: space.xxs }}>
          {matrix.flat().map((cell) => {
            const day = byDay[cell.date]; const ev = eventsByDay[cell.date]; const asg = assignmentsByDay[cell.date];
            const inten = intensity(cell.date); const isToday = cell.date === today; const isSel = cell.date === selected;
            return (
              <button key={cell.date} onClick={() => setSelected(cell.date)} style={{ textAlign: "left", minHeight: 62, borderRadius: 14, padding: 6, cursor: "pointer", opacity: cell.inMonth ? 1 : 0.35, border: `1px solid ${isSel ? C("lime") : isToday ? `color-mix(in srgb, ${C("lime")} 40%, transparent)` : C("line")}`, background: day ? `color-mix(in srgb, ${C("lime")} ${Math.round((0.08 + inten * 0.5) * 100)}%, transparent)` : C("ink") }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: isToday ? C("lime") : C("chalk"), fontWeight: isToday ? 700 : 400 }}>{Number(cell.date.slice(8, 10))}</span>
                  <span style={{ display: "flex", gap: 3 }}>{asg && <span style={{ width: 6, height: 6, borderRadius: 3, background: C("violet") }} />}{ev && <span style={{ width: 6, height: 6, borderRadius: 3, background: C("amber") }} />}</span>
                </div>
                {day && <div style={{ marginTop: 4 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, fontWeight: 700, color: "var(--on-accent)", background: C("lime"), borderRadius: 6, padding: "1px 6px" }}>{day.count}×</span></div>}
              </button>
            );
          })}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 10, color: C("ash") }}>{t("w.analyze.cal.legendPre")} <span style={{ color: C("violet") }}>●</span> {t("w.analyze.cal.legendAssigned")} <span style={{ color: C("amber") }}>●</span> {t("w.analyze.cal.legendEvent")}</div>
      </div>

      <div style={card}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{new Date(`${selected}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}</div>
        {selEvents.map((e) => <div key={e.id} style={{ marginTop: 10 }}>{chip(C("amber"), t("w.analyze.cal.event"))}<div style={{ fontWeight: 700, fontSize: fs.note, marginTop: 4 }}>{e.name}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{e.sport}</div></div>)}
        {selAssignments.map((a) => (
          <div key={a.id} style={{ marginTop: 10 }}>{chip(C("violet"), t("w.analyze.cal.assigned"))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <div style={{ fontWeight: 700, fontSize: fs.note }}>{a.name}</div>
              {a.status === "completed" ? chip(C("lime"), t("w.analyze.cal.done")) : <button onClick={() => markDone(a.id)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, fontWeight: 700, textTransform: "uppercase", color: C("lime"), background: `color-mix(in srgb, ${C("lime")} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${C("lime")} 40%, transparent)`, borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}>{t("w.analyze.cal.markDone")}</button>}
            </div>
          </div>
        ))}
        {selSessions.length === 0 && selEvents.length === 0 && selAssignments.length === 0 ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, marginTop: 12, color: C("ash") }}>{t("w.analyze.cal.nothing")}</div>
        ) : selSessions.map((s) => (
          <div key={s.id} style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
            <div style={{ fontWeight: 700, fontSize: fs.note }}>{s.title}</div>
            <div style={{ display: "flex", gap: space.xs, marginTop: 6, flexWrap: "wrap" }}>{chip(C("ash"), `${sessionVolume(s.blocks, false, bw(s.startedAt)).toLocaleString()} kg`)}{chip(C("ash"), `${t("w.analyze.cal.load")} ${sessionLoad(s)}`)}{chip(C("ash"), `${s.blocks.length} ${t("w.analyze.cal.blocks")}`)}{typeof s.readiness === "number" && chip(C("lime"), `${t("w.analyze.cal.readiness")} ${s.readiness}`)}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginTop: 6, color: C("ash") }}>{s.blocks.map((b) => b.name).join(" – ")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
