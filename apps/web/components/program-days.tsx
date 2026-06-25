"use client";

import React from "react";
import { rpeColor, workoutColor, type PlanDiscipline, type ProgramDayView, type ProgramLiftView, type ProgramSessionView, type LoadColor } from "@hybrid/core";
import { LIME, BLUE, AMBER, RED, ASH, CHALK, LINE, CARD } from "@/lib/ui";

// The HYBRID plan day view — one card+table style that adapts per discipline,
// rendered identically by BOTH web plan screens (classic + Aurora) and mirrored
// on mobile. Reads the shared @hybrid/core planProgramView, so all clients stay
// in lockstep. Three row modes, picked per lift from the data:
//   • bodybuilding (rpe set)  → Sets×Reps + an intensity-coloured RPE "heat" bar
//   • weightlifting (steps)   → name + a %-ramp prescription, loads colour-graded
//   • running (prose)         → the whole week as one card of Day / workout rows
// Day cards carry an amber header; AM/PM doubles get lime/blue session bands.

const HEX: Record<LoadColor, string> = { blue: BLUE, lime: LIME, amber: AMBER, red: RED, ash: ASH };
const HAIR = "rgba(255,255,255,0.05)";
const mono = "var(--font-mono)";
const disp = "var(--font-display)";

/** Dot / accent colour for a lift: RPE-coloured when it has one, lime for a
 *  loaded strength accessory, else the endurance workout-type colour. */
const liftColor = (l: ProgramLiftView): LoadColor =>
  l.rpe != null ? rpeColor(l.rpe) : l.steps && l.steps.length ? "lime" : workoutColor(l.name);

export default function ProgramDays({ days, week, peakNote, discipline }: { days: ProgramDayView[]; week: number; peakNote: string | null; discipline: PlanDiscipline }) {
  // Endurance plans render the whole week as ONE card of Day rows; everything
  // else is one card per day. Driven by discipline (not "every lift is prose"),
  // so a strength accessory on a run day can't flip the layout.
  if (discipline === "endurance") return <WeekCard days={days} week={week} peakNote={peakNote} />;
  return (
    <>
      {days.map((day, di) => (
        <DayCard key={di} day={day} />
      ))}
    </>
  );
}

// ── card shell bits ───────────────────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden", marginBottom: 12 }}>{children}</div>;
}
function DayHeader({ title, right }: { title: string; right: string | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderBottom: `1px solid ${HAIR}` }}>
      <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: AMBER }}>{title}</span>
      {right && <span style={{ fontFamily: mono, fontSize: 10, color: ASH }}>{right}</span>}
    </div>
  );
}

// ── bodybuilding / weightlifting: one card per day ────────────────────────────
function DayCard({ day }: { day: ProgramDayView }) {
  return (
    <Card>
      <DayHeader title={day.title + (day.kindLabel ? ` — ${day.kindLabel}` : "")} right={day.volume} />
      {day.sessions.map((s, si) => (
        <SessionBlock key={si} s={s} />
      ))}
    </Card>
  );
}

function SessionBlock({ s }: { s: ProgramSessionView }) {
  const isHeat = s.lifts.some((l) => l.rpe != null);
  return (
    <>
      {s.label && (
        <div style={{ padding: "8px 16px 5px", borderBottom: `1px solid ${HAIR}`, background: `color-mix(in srgb, ${s.label === "PM" ? BLUE : LIME} 4%, transparent)` }}>
          <span style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: ".16em", textTransform: "uppercase", color: s.label === "PM" ? BLUE : LIME }}>
            {[s.label, s.volume].filter(Boolean).join(" · ")}
          </span>
        </div>
      )}
      {isHeat && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 60px", gap: 14, padding: "8px 16px", background: "rgba(255,255,255,.018)", borderBottom: `1px solid ${HAIR}` }}>
          {["Exercise", "Sets × Reps", "RPE"].map((h, i) => (
            <span key={h} style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "#5a5e56", textAlign: i === 2 ? "right" : "left" }}>{h}</span>
          ))}
        </div>
      )}
      {s.lifts.map((l, li) => {
        const top = li > 0 ? `1px solid ${HAIR}` : "none";
        if (l.rpe != null) return <HeatRow key={li} lift={l} borderTop={top} />;
        if (l.steps && l.steps.length) return <RampRow key={li} lift={l} borderTop={top} />;
        return <FallbackRow key={li} lift={l} borderTop={top} />;
      })}
    </>
  );
}

function NameCell({ lift, size = 15 }: { lift: ProgramLiftView; size?: number }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: disp, fontWeight: 600, fontSize: size, color: CHALK }}>{lift.name}</div>
      {lift.note && <div style={{ fontFamily: mono, fontSize: 10, color: ASH, marginTop: 2 }}>{lift.note}</div>}
    </div>
  );
}

// bodybuilding row — Sets×Reps + RPE heat bar
function HeatRow({ lift, borderTop }: { lift: ProgramLiftView; borderTop: string }) {
  const c = HEX[rpeColor(lift.rpe!)];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 60px", alignItems: "center", gap: 14, padding: "13px 16px", borderTop }}>
      <NameCell lift={lift} />
      <span style={{ fontFamily: mono, fontSize: 13, color: CHALK }}>{lift.setsReps ?? "—"}</span>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
        <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: c }}>@{lift.rpe}</span>
        <span style={{ width: 46, height: 3, borderRadius: 2, background: HAIR, overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${Math.min(100, lift.rpe! * 10)}%`, borderRadius: 2, background: c }} />
        </span>
      </div>
    </div>
  );
}

// weightlifting row — name + coloured %-ramp prescription
function RampRow({ lift, borderTop }: { lift: ProgramLiftView; borderTop: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "118px 1fr", gap: 14, padding: "13px 16px", alignItems: "baseline", borderTop }}>
      <NameCell lift={lift} />
      <div style={{ fontFamily: mono, fontSize: 12, color: ASH, lineHeight: 1.7, textAlign: "right" }}>
        {lift.steps!.map((st, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: "#5a5e56", margin: "0 3px" }}> · </span>}
            <span style={{ color: HEX[st.color], fontWeight: 700 }}>{st.load}</span>
            {st.detail}
            {st.kg && <span style={{ color: "#5a5e56" }}> · {st.kg}</span>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// prose fallback (mixed/odd entries inside a day card)
function FallbackRow({ lift, borderTop }: { lift: ProgramLiftView; borderTop: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "118px 1fr", gap: 14, padding: "13px 16px", alignItems: "baseline", borderTop }}>
      <NameCell lift={lift} />
      <div style={{ fontFamily: mono, fontSize: 12, color: CHALK, lineHeight: 1.6, textAlign: "right" }}>{lift.prescription}</div>
    </div>
  );
}

// ── endurance: the whole week as one card of Day rows ─────────────────────────
// Each day shows its weekday label once, then EVERY item that day (the run plus
// any strength accessory), each on its own line — so nothing is dropped and a
// mixed day reads run-first, accessory-below.
function WeekCard({ days, week, peakNote }: { days: ProgramDayView[]; week: number; peakNote: string | null }) {
  return (
    <Card>
      <DayHeader title={`Week ${week}`} right={peakNote ? peakNote.toLowerCase() : null} />
      {days.map((day, di) => {
        const lifts = day.sessions.flatMap((s) => s.lifts);
        return (
          <div key={di} style={{ display: "grid", gridTemplateColumns: "42px 1fr", gap: 12, padding: "12px 16px", alignItems: "baseline", borderTop: di > 0 ? `1px solid ${HAIR}` : "none" }}>
            <span style={{ fontFamily: mono, fontSize: 11, color: "#5a5e56", textTransform: "uppercase", letterSpacing: ".06em" }}>{day.title}</span>
            <div>
              {lifts.length === 0 ? (
                <WeekLine name={day.kindLabel ?? "—"} detail={null} color="ash" rest first />
              ) : (
                lifts.map((l, i) => (
                  <WeekLine
                    key={i}
                    name={l.name}
                    detail={[l.prescription, l.note].filter(Boolean).join(" · ") || null}
                    color={liftColor(l)}
                    rest={/rest/i.test(l.name)}
                    first={i === 0}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function WeekLine({ name, detail, color, rest, first }: { name: string; detail: string | null; color: LoadColor; rest: boolean; first: boolean }) {
  return (
    <div style={{ marginTop: first ? 0 : 9 }}>
      <div style={{ fontFamily: disp, fontWeight: rest ? 500 : 600, fontSize: 15, color: rest ? ASH : CHALK }}>
        <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginRight: 7, verticalAlign: "middle", background: HEX[color] }} />
        {name}
      </div>
      {detail && <div style={{ fontFamily: mono, fontSize: 11, color: ASH, marginTop: 3, lineHeight: 1.5 }}>{detail}</div>}
    </div>
  );
}
