"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, AMBER, RED, disp, mono, tip, Mono, Card, Chip, Select } from "@/lib/ui";
import { optimizeForEvent } from "@hybrid/core";

type Event = { id: string; name: string; sport: string; date: string };

const SPORTS = ["Hyrox", "Triathlon", "Running", "Cycling", "Swimming", "Powerlifting", "Bodybuilding", "Hybrid"];

export default function Competition() {
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

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>
          Competition · peaking optimizer
        </Mono>
        <Mono s={{ fontSize: 13, display: "block", marginTop: 6, lineHeight: 1.5 }} c={CHALK}>
          Set a target date and the plan back-solves so your best day lands on the event — finals, not heats.
        </Mono>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Event name" style={input} />
          <Select value={sport} onChange={(e) => setSport(e.target.value)}>
            {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
          <button onClick={create} style={btn}>Add event</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {events.map((e) => (
            <button key={e.id} onClick={() => setSelected(e.id)} style={chip(e.id === selected)}>
              {e.name} · {new Date(e.date).toLocaleDateString()}
            </button>
          ))}
        </div>
      </Card>

      {event && plan && (
        <>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ ...disp, fontWeight: 900, fontSize: 22, color: CHALK }}>{event.name}</div>
                <Mono s={{ fontSize: 12 }}>{event.sport} · {new Date(event.date).toLocaleDateString()} · {plan.weeksToEvent} weeks out</Mono>
              </div>
              <Chip c={plan.landsPeak ? LIME : AMBER}>
                {plan.landsPeak ? "peak lands on event ✓" : `peak at week ${plan.peakWeek} — adjust taper`}
              </Chip>
            </div>
            <div style={{ display: "flex", gap: 3, height: 8, borderRadius: 4, overflow: "hidden", margin: "14px 0 4px" }}>
              {plan.macro.blocks.map((b) => (
                <div key={b.key} title={`${b.label} · ${b.weeks} wk`} style={{ flex: b.weeks, background: b.color }} />
              ))}
            </div>
            <Mono s={{ fontSize: 11 }} c={ASH}>{plan.macro.blocks.map((b) => b.label).join(" → ")}</Mono>
          </Card>

          <Card>
            <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Fitness · fatigue · form projection</Mono>
            <Mono s={{ fontSize: 11, display: "block", marginTop: 2 }} c={ASH}>form (freshness) peaks as the taper sheds fatigue faster than fitness</Mono>
            <div style={{ height: 260, marginTop: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={plan.series}>
                  <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
                  <XAxis dataKey="week" stroke={ASH} style={mono} tick={{ fontSize: 10 }} />
                  <YAxis stroke={ASH} style={mono} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={tip} />
                  <ReferenceLine x={plan.series[plan.series.length - 1]?.week} stroke={AMBER} strokeDasharray="4 4" label={{ value: "event", fill: AMBER, fontSize: 10 }} />
                  <Line type="monotone" dataKey="fitness" stroke={LIME} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="fatigue" stroke={RED} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="form" stroke={BLUE} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

const input: React.CSSProperties = { ...mono, fontSize: 13, padding: "8px 10px", borderRadius: 9, background: INK2, color: CHALK, border: `1px solid ${LINE}` };
const btn: React.CSSProperties = { ...disp, fontWeight: 800, fontSize: 13, background: LIME, color: "#0c0d0c", border: "none", borderRadius: 9, padding: "8px 14px", cursor: "pointer" };
function chip(active: boolean): React.CSSProperties {
  return { ...mono, fontSize: 12, padding: "7px 12px", borderRadius: 8, cursor: "pointer", background: active ? `${AMBER}1a` : "transparent", color: active ? AMBER : ASH, border: `1px solid ${active ? AMBER : LINE}` };
}
