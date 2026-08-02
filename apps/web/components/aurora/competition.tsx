"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { fs, space, optimizeForEvent } from "@hybrid/core";
import { useLang } from "@/lib/i18n";

type Event = { id: string; name: string; sport: string; date: string };
const SPORTS = ["Hyrox", "Triathlon", "Running", "Cycling", "Swimming", "Powerlifting", "Bodybuilding", "Hybrid"];

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
const mono = { fontFamily: "var(--font-mono)" } as const;
const tip = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, fontFamily: "var(--font-mono)", fontSize: fs.caption } as const;

/** AURORA Competition (web) — peaking optimizer; back-solves the season so
 *  form peaks on the event date, reusing optimizeForEvent + /api/events. */
export default function AuroraCompetition() {
  const { t } = useLang();
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

  const input: React.CSSProperties = { ...mono, fontSize: fs.body, padding: "10px 16px", borderRadius: 16, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, outline: "none" };

  return (
    <div style={{ display: "grid", gap: space.lg, maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={card}>
        <div style={{ ...mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>
          {t("w.train.comp.peakingOptimizer")}
        </div>
        <div style={{ ...mono, fontSize: fs.body, marginTop: 6, lineHeight: 1.5, color: C("chalk") }}>
          {t("w.train.comp.intro")}
        </div>
        <div style={{ display: "flex", gap: space.sm, marginTop: 16, flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("w.train.comp.eventName")} style={input} />
          <select value={sport} onChange={(e) => setSport(e.target.value)} style={input}>
            {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
          <button onClick={create} style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.body, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "10px 20px", cursor: "pointer" }}>{t("w.train.comp.addEvent")}</button>
        </div>
        <div style={{ display: "flex", gap: space.sm, marginTop: 12, flexWrap: "wrap" }}>
          {events.map((e) => {
            const active = e.id === selected;
            return (
              <button key={e.id} onClick={() => setSelected(e.id)} style={{ ...mono, fontSize: fs.caption, padding: "8px 16px", borderRadius: 999, cursor: "pointer", background: active ? `color-mix(in srgb, ${C("lime")} 14%, transparent)` : C("ink"), color: active ? "var(--lime-text)" : C("ash"), border: `1px solid ${active ? C("lime") : C("line")}` }}>
                {e.name} – {new Date(e.date).toLocaleDateString()}
              </button>
            );
          })}
        </div>
      </div>

      {event && plan && (
        <>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: space.sm, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 22 }}>{event.name}</div>
                <div style={{ ...mono, fontSize: fs.caption, color: C("ash") }}>{event.sport} – {new Date(event.date).toLocaleDateString()} – {plan.weeksToEvent} {t("w.train.comp.weeksOut")}</div>
              </div>
              <span style={{ ...mono, fontSize: fs.micro, borderRadius: 999, padding: "5px 16px", background: `color-mix(in srgb, ${plan.landsPeak ? C("lime") : C("amber")} 14%, transparent)`, color: plan.landsPeak ? C("lime") : C("amber") }}>
                {plan.landsPeak ? t("w.train.comp.peakLands") : `${t("w.train.comp.peakAtWeek")} ${plan.peakWeek} ${t("w.train.comp.adjustTaper")}`}
              </span>
            </div>
            <div style={{ display: "flex", gap: 3, height: 10, borderRadius: 5, overflow: "hidden", margin: "16px 0 6px" }}>
              {plan.macro.blocks.map((b) => (
                <div key={b.key} title={`${b.label} – ${b.weeks} ${t("w.train.comp.wk")}`} style={{ flex: b.weeks, background: b.color }} />
              ))}
            </div>
            <div style={{ ...mono, fontSize: fs.micro, color: C("ash") }}>{plan.macro.blocks.map((b) => b.label).join(" → ")}</div>
          </div>

          <div style={card}>
            <div style={{ ...mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.train.comp.projection")}</div>
            <div style={{ ...mono, fontSize: fs.micro, marginTop: 2, color: C("ash") }}>{t("w.train.comp.formNote")}</div>
            <div style={{ height: 260, marginTop: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={plan.series}>
                  <CartesianGrid stroke={C("line")} strokeDasharray="3 3" />
                  <XAxis dataKey="week" stroke={C("ash")} style={mono} tick={{ fontSize: fs.nano }} />
                  <YAxis stroke={C("ash")} style={mono} tick={{ fontSize: fs.nano }} />
                  <Tooltip contentStyle={tip} />
                  <ReferenceLine x={plan.series[plan.series.length - 1]?.week} stroke={C("amber")} strokeDasharray="4 4" label={{ value: t("w.train.comp.event"), fill: C("amber"), fontSize: fs.nano }} />
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
