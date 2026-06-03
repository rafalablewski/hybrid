"use client";

import { useEffect, useMemo, useState } from "react";
import {
  sessionsByDay, monthMatrix, loadIntensity, sessionVolume, sessionLoad,
  type LoggedSession,
} from "@hybrid/core";
import {
  INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, disp, cond, mono, Mono, Card, Chip,
} from "@/lib/ui";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const todayKey = () => new Date().toISOString().slice(0, 10);
type EventRow = { id: string; name: string; sport: string; date: string };

export default function Calendar({ sessions }: { sessions: LoggedSession[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [selected, setSelected] = useState<string>(todayKey());
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d: { events?: { id: string; name: string; sport: string; date: string }[] }) =>
        setEvents((d.events ?? []).map((e) => ({ ...e, date: e.date.slice(0, 10) }))))
      .catch(() => setEvents([]));
  }, []);

  const byDay = useMemo(() => sessionsByDay(sessions), [sessions]);
  const intensity = useMemo(() => loadIntensity(byDay), [byDay]);
  const matrix = useMemo(() => monthMatrix(year, month), [year, month]);
  const eventsByDay = useMemo(() => {
    const m: Record<string, EventRow[]> = {};
    for (const e of events) (m[e.date] ??= []).push(e);
    return m;
  }, [events]);

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = todayKey();

  const go = (delta: number) => {
    const m = month + delta;
    if (m < 0) { setMonth(11); setYear((y) => y - 1); }
    else if (m > 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth(m);
  };
  const jumpToday = () => { setYear(now.getUTCFullYear()); setMonth(now.getUTCMonth()); setSelected(today); };

  const selSessions = sessions.filter((s) => s.startedAt.slice(0, 10) === selected);
  const selEvents = eventsByDay[selected] ?? [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, alignItems: "start" }}>
      <Card>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>{monthLabel}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => go(-1)} style={navBtn}>‹</button>
            <button onClick={jumpToday} style={{ ...navBtn, width: "auto", padding: "0 12px" }}>Today</button>
            <button onClick={() => go(1)} style={navBtn}>›</button>
          </div>
        </div>

        {/* weekday row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
          {WEEKDAYS.map((d) => (
            <Mono key={d} s={{ fontSize: 10, textAlign: "center", textTransform: "uppercase" }}>{d}</Mono>
          ))}
        </div>

        {/* grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {matrix.flat().map((cell) => {
            const day = byDay[cell.date];
            const ev = eventsByDay[cell.date];
            const inten = intensity(cell.date);
            const isToday = cell.date === today;
            const isSel = cell.date === selected;
            return (
              <button
                key={cell.date}
                onClick={() => setSelected(cell.date)}
                style={{
                  textAlign: "left",
                  minHeight: 62,
                  borderRadius: 8,
                  padding: 6,
                  cursor: "pointer",
                  opacity: cell.inMonth ? 1 : 0.35,
                  border: `1px solid ${isSel ? LIME : isToday ? `${LIME}66` : LINE}`,
                  background: day ? `rgba(196,240,53,${0.08 + inten * 0.5})` : INK2,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ ...mono, fontSize: 11, color: isToday ? LIME : CHALK, fontWeight: isToday ? 700 : 400 }}>
                    {Number(cell.date.slice(8, 10))}
                  </span>
                  {ev && <span style={{ width: 6, height: 6, borderRadius: 3, background: AMBER }} />}
                </div>
                {day && (
                  <div style={{ marginTop: 4 }}>
                    <span style={{ ...cond, fontSize: 11, fontWeight: 700, color: "#0c0d0c", background: LIME, borderRadius: 4, padding: "1px 5px" }}>
                      {day.count}×
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <Mono s={{ fontSize: 11, display: "block", marginTop: 10 }}>
          Cell shading = training load (sRPE) · <span style={{ color: AMBER }}>●</span> competition event
        </Mono>
      </Card>

      {/* day detail */}
      <Card>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          {new Date(`${selected}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
        </Mono>

        {selEvents.map((e) => (
          <div key={e.id} style={{ marginTop: 10 }}>
            <Chip c={AMBER}>Event</Chip>
            <div style={{ ...disp, fontWeight: 700, fontSize: 15, marginTop: 4 }}>{e.name}</div>
            <Mono s={{ fontSize: 12 }}>{e.sport}</Mono>
          </div>
        ))}

        {selSessions.length === 0 && selEvents.length === 0 ? (
          <Mono s={{ fontSize: 13, display: "block", marginTop: 12 }}>Nothing logged this day.</Mono>
        ) : (
          selSessions.map((s) => (
            <div key={s.id} style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
              <div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{s.title}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <Chip c={ASH}>{sessionVolume(s.blocks).toLocaleString()} kg</Chip>
                <Chip c={BLUE}>load {sessionLoad(s)}</Chip>
                <Chip c={ASH}>{s.blocks.length} blocks</Chip>
                {typeof s.readiness === "number" && <Chip c={LIME}>readiness {s.readiness}</Chip>}
              </div>
              <Mono s={{ fontSize: 12, display: "block", marginTop: 6 }}>
                {s.blocks.map((b) => b.name).join(" · ")}
              </Mono>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

const navBtn = {
  ...disp, fontWeight: 800, fontSize: 16, width: 34, height: 34, borderRadius: 8,
  border: `1px solid ${LINE}`, background: INK2, color: CHALK, cursor: "pointer",
} as const;
