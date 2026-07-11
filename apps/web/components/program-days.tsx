"use client";

import React from "react";
import { rpeColor, workoutColor, isProseLift, liftKind, dayContentSummary, type ProgramDayView, type ProgramLiftView, type ProgramSessionView, type ProgramStepView, type LoadColor, type LiftKind } from "@hybrid/core";
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

// content classification (isProseLift / liftKind) is shared from @hybrid/core.
const isProse = isProseLift;
const liftColor = (l: ProgramLiftView): LoadColor =>
  l.rpe != null ? rpeColor(l.rpe) : l.steps && l.steps.length ? "lime" : l.intensity ?? workoutColor(l.name);

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
  return (
    <Card>
      <DayHeader title={day.title + (day.kindLabel ? ` — ${day.kindLabel}` : "")} right={dayContentSummary(day)} />
      {day.sessions.map((s, si) => (
        <SessionBlock key={si} s={s} si={si} />
      ))}
    </Card>
  );
}

type Group = { kind: LiftKind; lifts: ProgramLiftView[] };
function groupByKind(lifts: ProgramLiftView[]): Group[] {
  const groups: Group[] = [];
  for (const l of lifts) {
    const kind = liftKind(l);
    const last = groups[groups.length - 1];
    if (last && last.kind === kind) last.lifts.push(l);
    else groups.push({ kind, lifts: [l] });
  }
  return groups;
}

// Block label for a content group. `percent` (% barbell) is the "Main" work; an
// `rpe` block is "Accessories" when there's also barbell work, else "Strength".
function bandFor(kind: LiftKind, n: number, hasPercent: boolean): { label: string; color: string } {
  const ex = `${n} exercise${n === 1 ? "" : "s"}`;
  if (kind === "run") return { label: "Run", color: BLUE };
  if (kind === "percent") return { label: `Main (${ex})`, color: AMBER };
  return { label: `${hasPercent ? "Accessories" : "Strength"} (${ex})`, color: LIME };
}

function SessionBlock({ s, si }: { s: ProgramSessionView; si: number }) {
  const groups = groupByKind(s.lifts);
  const mixed = groups.length > 1; // ≥2 content kinds in this session → label blocks
  const hasPercent = groups.some((g) => g.kind === "percent");
  return (
    <>
      {s.label && <Band label={s.volume ? `${s.label} (${s.volume})` : s.label} color={s.label === "PM" ? BLUE : LIME} topBorder={si > 0} />}
      {groups.map((g, gi) => {
        const topBorder = gi > 0 || !!s.label || si > 0;
        const band = bandFor(g.kind, g.lifts.length, hasPercent);
        const rowTop = (i: number) => (i > 0 ? `1px solid ${HAIR}` : "none");
        return (
          <React.Fragment key={gi}>
            {mixed && <Band label={band.label} color={band.color} topBorder={topBorder} />}
            {g.kind === "percent" ? (
              <PercentMatrix lifts={g.lifts} />
            ) : g.kind === "run" ? (
              g.lifts.map((l, i) => <ProseRow key={i} lift={l} borderTop={rowTop(i)} />)
            ) : (
              <>
                {g.lifts.some((l) => l.rpe != null) && <ColHeader />}
                {g.lifts.map((l, i) =>
                  l.rpe != null ? <HeatRow key={i} lift={l} borderTop={rowTop(i)} /> : <FallbackRow key={i} lift={l} borderTop={rowTop(i)} />,
                )}
              </>
            )}
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

// Olympic / % work — the Percentage Matrix: loads are fixed columns (ordered by
// %, bodyweight last); each lift's reps drop into the matching cell. Scrolls
// sideways when there are many distinct loads.
function PercentMatrix({ lifts }: { lifts: ProgramLiftView[] }) {
  const colMap = new Map<string, ProgramStepView>();
  for (const l of lifts) for (const st of l.steps ?? []) if (!colMap.has(st.load)) colMap.set(st.load, st);
  const cols = [...colMap.values()].sort((a, b) => (a.pct ?? 1e9) - (b.pct ?? 1e9));
  const grid = `132px repeat(${cols.length}, minmax(62px, 1fr))`;
  const head: React.CSSProperties = { fontFamily: mono, fontSize: 10, letterSpacing: ".08em", fontWeight: 700, textAlign: "center" };
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 132 + cols.length * 62 }}>
        <div style={{ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "8px 16px", background: "rgba(255,255,255,.018)", borderBottom: `1px solid ${HAIR}` }}>
          <span style={{ ...head, textAlign: "left", color: "#5a5e56", fontWeight: 400, fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em" }}>Exercise</span>
          {cols.map((c) => (
            <span key={c.load} style={{ ...head, color: HEX[c.color] }}>{c.load}</span>
          ))}
        </div>
        {lifts.map((l, i) => {
          const byLoad = new Map((l.steps ?? []).map((st) => [st.load, st]));
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: grid, gap: 8, alignItems: "center", padding: "12px 16px", borderTop: i > 0 ? `1px solid ${HAIR}` : undefined }}>
              <NameCell lift={l} />
              {cols.map((c) => {
                const st = byLoad.get(c.load);
                return st ? (
                  <span key={c.load} style={{ fontFamily: mono, fontSize: 12, textAlign: "center", color: HEX[c.color] }}>{st.detail}</span>
                ) : (
                  <span key={c.load} style={{ fontFamily: mono, fontSize: 12, textAlign: "center", color: "#34372f" }}>·</span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
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


// loaded accessory with no % and no RPE — just the prescription. For conditioning
// the prescription carries the effort-tier colour (the circuit's load-wave), the
// way the % matrix colours its loads; otherwise it stays chalk.
function FallbackRow({ lift, borderTop }: { lift: ProgramLiftView; borderTop: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, padding: "13px 16px", alignItems: "baseline", borderTop }}>
      <NameCell lift={lift} />
      <div style={{ fontFamily: mono, fontSize: 13, fontWeight: lift.intensity ? 600 : 400, color: lift.intensity ? HEX[lift.intensity] : CHALK, textAlign: "right" }}>{lift.prescription}</div>
    </div>
  );
}

// a prose workout line (a run / cross-train) inside a day card
function ProseRow({ lift, borderTop }: { lift: ProgramLiftView; borderTop: string }) {
  const rest = /rest/i.test(lift.name);
  const detail = lift.prescription && lift.note ? `${lift.prescription} (${lift.note})` : lift.prescription || lift.note || null;
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
  const detail = lift ? (lift.prescription && lift.note ? `${lift.prescription} (${lift.note})` : lift.prescription || lift.note || null) : null;
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
