"use client";

import React from "react";
import { rpeColor, workoutColor, isGymLift, isProseLift, dayContentSummary, type ProgramDayView, type ProgramLiftView, type ProgramSessionView, type LoadColor } from "@hybrid/core";
import { LIME, BLUE, AMBER, RED, ASH, CHALK, LINE, CARD } from "@/lib/ui";

// The HYBRID plan day view — one card+table style that adapts per CONTENT (not
// per plan label), rendered identically by both web plan screens and mirrored on
// mobile off the shared planProgramView.
//
// Layout is chosen from what the week actually holds:
//   • all prose (a pure running/endurance week)  → ONE week card of Day rows
//   • anything with gym work                       → one card per day
// Within a day card, content is grouped by kind so a hybrid day splits into a
// RUN block (prose) and a STRENGTH block (the Sets×Reps/RPE or %-ramp table) —
// each internally consistent, neither forced into the other's format.

const HEX: Record<LoadColor, string> = { blue: BLUE, lime: LIME, amber: AMBER, red: RED, ash: ASH };
const HAIR = "rgba(255,255,255,0.05)";
const mono = "var(--font-mono)";
const disp = "var(--font-display)";

// content classification (isGymLift / isProseLift) is shared from @hybrid/core.
const isGym = isGymLift;
const isProse = isProseLift;
const liftColor = (l: ProgramLiftView): LoadColor =>
  l.rpe != null ? rpeColor(l.rpe) : l.steps && l.steps.length ? "lime" : workoutColor(l.name);

export default function ProgramDays({ days, week, peakNote }: { days: ProgramDayView[]; week: number; peakNote: string | null }) {
  const allProse = days.length > 0 && days.every((d) => d.sessions.every((s) => s.lifts.every(isProse)));
  if (allProse) return <WeekCard days={days} week={week} peakNote={peakNote} />;
  return (
    <>
      {days.map((day, di) => (
        <DayCard key={di} day={day} />
      ))}
    </>
  );
}

// ── shell ─────────────────────────────────────────────────────────────────────
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

// ── one card per day (bodybuilding / weightlifting / hybrid) ──────────────────
function DayCard({ day }: { day: ProgramDayView }) {
  const all = day.sessions.flatMap((s) => s.lifts);
  const mixed = all.some(isProse) && all.some(isGym); // a hybrid day → label the blocks
  return (
    <Card>
      <DayHeader title={day.title + (day.kindLabel ? ` — ${day.kindLabel}` : "")} right={dayContentSummary(day)} />
      {day.sessions.map((s, si) => (
        <SessionBlock key={si} s={s} si={si} mixed={mixed} />
      ))}
    </Card>
  );
}

type Group = { kind: "run" | "lift"; lifts: ProgramLiftView[] };
function groupByKind(lifts: ProgramLiftView[]): Group[] {
  const groups: Group[] = [];
  for (const l of lifts) {
    const kind = isProse(l) ? "run" : "lift";
    const last = groups[groups.length - 1];
    if (last && last.kind === kind) last.lifts.push(l);
    else groups.push({ kind, lifts: [l] });
  }
  return groups;
}

function SessionBlock({ s, si, mixed }: { s: ProgramSessionView; si: number; mixed: boolean }) {
  const groups = groupByKind(s.lifts);
  return (
    <>
      {s.label && <Band label={[s.label, s.volume].filter(Boolean).join(" · ")} color={s.label === "PM" ? BLUE : LIME} topBorder={si > 0} />}
      {groups.map((g, gi) => {
        const topBorder = gi > 0 || !!s.label || si > 0;
        if (g.kind === "run")
          return (
            <React.Fragment key={gi}>
              {mixed && <Band label="Run" color={BLUE} topBorder={topBorder} />}
              {g.lifts.map((l, i) => (
                <ProseRow key={i} lift={l} borderTop={i > 0 ? `1px solid ${HAIR}` : "none"} />
              ))}
            </React.Fragment>
          );
        const hasRpe = g.lifts.some((l) => l.rpe != null);
        return (
          <React.Fragment key={gi}>
            {mixed && <Band label={`Strength · ${g.lifts.length} exercise${g.lifts.length === 1 ? "" : "s"}`} color={LIME} topBorder={topBorder} />}
            {hasRpe && <ColHeader />}
            {g.lifts.map((l, i) => {
              const top = i > 0 ? `1px solid ${HAIR}` : "none";
              if (l.rpe != null) return <HeatRow key={i} lift={l} borderTop={top} />;
              if (l.steps && l.steps.length) return <RampRow key={i} lift={l} borderTop={top} />;
              return <FallbackRow key={i} lift={l} borderTop={top} />;
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}

function Band({ label, color, topBorder }: { label: string; color: string; topBorder: boolean }) {
  return (
    <div style={{ padding: "8px 16px 5px", borderBottom: `1px solid ${HAIR}`, borderTop: topBorder ? `1px solid ${HAIR}` : undefined, background: `color-mix(in srgb, ${color} 4%, transparent)` }}>
      <span style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: ".16em", textTransform: "uppercase", color }}>{label}</span>
    </div>
  );
}

function ColHeader() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 60px", gap: 14, padding: "8px 16px", background: "rgba(255,255,255,.018)", borderBottom: `1px solid ${HAIR}` }}>
      {["Exercise", "Sets × Reps", "RPE"].map((h, i) => (
        <span key={h} style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "#5a5e56", textAlign: i === 2 ? "right" : "left" }}>{h}</span>
      ))}
    </div>
  );
}

function NameCell({ lift }: { lift: ProgramLiftView }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: disp, fontWeight: 600, fontSize: 15, color: CHALK }}>{lift.name}</div>
      {lift.note && <div style={{ fontFamily: mono, fontSize: 10, color: ASH, marginTop: 2 }}>{lift.note}</div>}
    </div>
  );
}

// Coloured %-ramp text — each load tinted by intensity, the rest muted.
function RampText({ lift }: { lift: ProgramLiftView }) {
  return (
    <>
      {lift.steps!.map((st, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: "#5a5e56", margin: "0 3px" }}> · </span>}
          <span style={{ color: HEX[st.color], fontWeight: 700 }}>{st.load}</span>
          {st.detail}
          {st.kg && <span style={{ color: "#5a5e56" }}> · {st.kg}</span>}
        </React.Fragment>
      ))}
    </>
  );
}

// bodybuilding row — Sets×Reps + RPE heat bar
function HeatRow({ lift, borderTop }: { lift: ProgramLiftView; borderTop: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 60px", alignItems: "center", gap: 14, padding: "13px 16px", borderTop }}>
      <NameCell lift={lift} />
      <span style={{ fontFamily: mono, fontSize: 13, color: CHALK }}>{lift.setsReps ?? "—"}</span>
      <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: HEX[rpeColor(lift.rpe!)], textAlign: "right" }}>@{lift.rpe}</span>
    </div>
  );
}

// weightlifting row — coloured %-ramp prescription
function RampRow({ lift, borderTop }: { lift: ProgramLiftView; borderTop: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "118px 1fr", gap: 14, padding: "13px 16px", alignItems: "baseline", borderTop }}>
      <NameCell lift={lift} />
      <div style={{ fontFamily: mono, fontSize: 12, color: ASH, lineHeight: 1.7, textAlign: "right" }}>
        <RampText lift={lift} />
      </div>
    </div>
  );
}

// loaded accessory with no % and no RPE — just the prescription
function FallbackRow({ lift, borderTop }: { lift: ProgramLiftView; borderTop: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, padding: "13px 16px", alignItems: "baseline", borderTop }}>
      <NameCell lift={lift} />
      <div style={{ fontFamily: mono, fontSize: 13, color: CHALK, textAlign: "right" }}>{lift.prescription}</div>
    </div>
  );
}

// a prose workout line (a run / cross-train) inside a day card
function ProseRow({ lift, borderTop }: { lift: ProgramLiftView; borderTop: string }) {
  const rest = /rest/i.test(lift.name);
  const detail = [lift.prescription, lift.note].filter(Boolean).join(" · ") || null;
  return (
    <div style={{ padding: "12px 16px", borderTop }}>
      <div style={{ fontFamily: disp, fontWeight: rest ? 500 : 600, fontSize: 15, color: rest ? ASH : CHALK }}>
        <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginRight: 7, verticalAlign: "middle", background: HEX[liftColor(lift)] }} />
        {lift.name}
      </div>
      {detail && <div style={{ fontFamily: mono, fontSize: 11, color: ASH, marginTop: 3, lineHeight: 1.5, marginLeft: 14 }}>{detail}</div>}
    </div>
  );
}

// ── pure-prose week → one card of Day rows ────────────────────────────────────
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
                <WeekRow restName={day.kindLabel ?? "—"} first />
              ) : (
                lifts.map((l, i) => <WeekRow key={i} lift={l} first={i === 0} />)
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function WeekRow({ lift, restName, first }: { lift?: ProgramLiftView; restName?: string; first: boolean }) {
  const name = lift?.name ?? restName ?? "—";
  const rest = lift ? /rest/i.test(lift.name) : true;
  const detail = lift ? [lift.prescription, lift.note].filter(Boolean).join(" · ") || null : null;
  return (
    <div style={{ marginTop: first ? 0 : 9 }}>
      <div style={{ fontFamily: disp, fontWeight: rest ? 500 : 600, fontSize: 15, color: rest ? ASH : CHALK }}>
        <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginRight: 7, verticalAlign: "middle", background: HEX[lift ? liftColor(lift) : "ash"] }} />
        {name}
      </div>
      {detail && <div style={{ fontFamily: mono, fontSize: 11, color: ASH, marginTop: 3, lineHeight: 1.5, marginLeft: 14 }}>{detail}</div>}
    </div>
  );
}
