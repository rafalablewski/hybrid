"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { optimizeForEvent } from "@hybrid/core";

type Event = { id: string; name: string; sport: string; date: string };
const SPORTS = ["Hyrox", "Triathlon", "Running", "Cycling", "Swimming", "Powerlifting", "Bodybuilding", "Hybrid"];

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 20 } as const;
const mono = { fontFamily: "var(--font-mono)" } as const;
const tip = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 14, fontFamily: "var(--font-mono)", fontSize: 12 } as const;

/** AURORA Competition (web) — peaking optimizer; back-solves the season so
 *  form peaks on the event date, reusing optimizeForEvent + /api/events. */
export default function AuroraCompetition() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sport, setSport] = useState("Hyrox");
  const [date, setDate] = useState("");

  const refresh = async () => {
    const res = await fetch("/api/events");
    if (res.ok) {
      const d = (await res.json()) as { events: Event[] };
      setEvents(d.events);
      if (!selected && d.events[0]) setSelected(d.events[0].id);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    if (!name.trim() || !date) return;
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sport, date }),
    });
    if (res.ok) {
      setName("");
      setDate("");
      const d = (await res.json()) as { event: Event };
      await refresh();
      setSelected(d.event.id);
    }
  };

  const event = events.find((e) => e.id === selected) ?? null;
  const plan = useMemo(() => (event ? optimizeForEvent(event.sport, event.date) : null), [event]);

  const input: React.CSSProperties = { ...mono, fontSize: 13, padding: "10px 14px", borderRadius: 14, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, outline: "none" };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={card}>
        <div style={{ ...mono, fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("amber") }}>
          Competition · peaking optimizer
        </div>
        <div style={{ ...mono, fontSize: 13, marginTop: 6, lineHeight: 1.5, color: C("chalk") }}>
          Set a target date and the plan back-solves so your best day lands on the event — finals, not heats.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Event name" style={input} />
          <select value={sport} onChange={(e) => setSport(e.target.value)} style={input}>
            {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
          <button onClick={create} style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 13, background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: "10px 20px", cursor: "pointer" }}>Add event</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {events.map((e) => {
            const active = e.id === selected;
            return (
              <button key={e.id} onClick={() => setSelected(e.id)} style={{ ...mono, fontSize: 12, padding: "8px 14px", borderRadius: 999, cursor: "pointer", background: active ? `color-mix(in srgb, ${C("amber")} 14%, transparent)` : C("ink"), color: active ? C("amber") : C("ash"), border: `1px solid ${active ? C("amber") : C("line")}` }}>
                {e.name} · {new Date(e.date).toLocaleDateString()}
              </button>
            );
          })}
        </div>
      </div>

      {event && plan && (
        <>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 22 }}>{event.name}</div>
                <div style={{ ...mono, fontSize: 12, color: C("ash") }}>{event.sport} · {new Date(event.date).toLocaleDateString()} · {plan.weeksToEvent} weeks out</div>
              </div>
              <span style={{ ...mono, fontSize: 11, borderRadius: 999, padding: "5px 14px", background: `color-mix(in srgb, ${plan.landsPeak ? C("lime") : C("amber")} 14%, transparent)`, color: plan.landsPeak ? C("lime") : C("amber") }}>
                {plan.landsPeak ? "peak lands on event ✓" : `peak at week ${plan.peakWeek} — adjust taper`}
              </span>
            </div>
            <div style={{ display: "flex", gap: 3, height: 10, borderRadius: 5, overflow: "hidden", margin: "14px 0 6px" }}>
              {plan.macro.blocks.map((b) => (
                <div key={b.key} title={`${b.label} · ${b.weeks} wk`} style={{ flex: b.weeks, background: b.color }} />
              ))}
            </div>
            <div style={{ ...mono, fontSize: 11, color: C("ash") }}>{plan.macro.blocks.map((b) => b.label).join(" → ")}</div>
          </div>

          <div style={card}>
            <div style={{ ...mono, fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>Fitness · fatigue · form projection</div>
            <div style={{ ...mono, fontSize: 11, marginTop: 2, color: C("ash") }}>form (freshness) peaks as the taper sheds fatigue faster than fitness</div>
            <div style={{ height: 260, marginTop: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={plan.series}>
                  <CartesianGrid stroke={C("line")} strokeDasharray="3 3" />
                  <XAxis dataKey="week" stroke={C("ash")} style={mono} tick={{ fontSize: 10 }} />
                  <YAxis stroke={C("ash")} style={mono} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={tip} />
                  <ReferenceLine x={plan.series[plan.series.length - 1]?.week} stroke={C("amber")} strokeDasharray="4 4" label={{ value: "event", fill: C("amber"), fontSize: 10 }} />
                  <Line type="monotone" dataKey="fitness" stroke={C("lime")} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="fatigue" stroke={C("red")} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="form" stroke={C("blue")} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
