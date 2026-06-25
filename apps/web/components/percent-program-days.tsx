"use client";

import React from "react";
import type { ProgramDayView, ProgramLiftView, ProgramStepView, LoadColor } from "@hybrid/core";
import { LIME, BLUE, AMBER, RED, ASH, CHALK, LINE, CARD } from "@/lib/ui";

// "Swipe Rail" rendering of a discipline-shaped program's days. Shared by BOTH
// the classic (plans.tsx) and Aurora (aurora/plans.tsx) web screens, reading the
// SAME @hybrid/core planProgramView the mobile app renders (parity).
//
// Each lift is one fixed-height row: the name is PINNED in a left column, and the
// set chips live in a horizontally-scrollable rail with an edge fade. A lift with
// many percentage blocks scrolls sideways instead of widening the row or
// squeezing the name — the problem the old single-line prescription had.

const HEX: Record<LoadColor, string> = { blue: BLUE, lime: LIME, amber: AMBER, red: RED, ash: ASH };
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

export default function ProgramDaysRail({ days }: { days: ProgramDayView[] }) {
  return (
    <>
      {days.map((day, di) => (
        <div key={di} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 18, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: AMBER }}>
              {day.title}
              {day.kindLabel ? ` — ${day.kindLabel}` : ""}
            </span>
            {day.volume && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: ASH }}>{day.volume}</span>}
          </div>

          {day.sessions.map((s, si) => (
            <div key={si}>
              {(s.label || s.volume) && (
                <div style={{ padding: "7px 16px", borderBottom: `1px solid ${LINE}`, background: tint(s.label === "PM" ? BLUE : LIME, 4) }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: s.label === "PM" ? BLUE : LIME }}>
                    {[s.label, s.volume].filter(Boolean).join(" · ")}
                  </span>
                </div>
              )}
              {s.lifts.map((l, li) => (
                <RailRow key={li} lift={l} last={li === s.lifts.length - 1} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function RailRow({ lift, last }: { lift: ProgramLiftView; last: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 150px) 1fr", alignItems: "stretch", borderBottom: last ? "none" : `1px solid ${LINE}` }}>
      <div style={{ padding: "13px 14px", borderRight: `1px solid ${LINE}`, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, color: CHALK }}>{lift.name}</span>
        {lift.note && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: ASH, marginTop: 2 }}>{lift.note}</span>}
      </div>
      <div className="rx-railwrap">
        <div className="rx-rail">
          {chipsFor(lift).map((c, i) => (
            <Chip key={i} {...c} />
          ))}
        </div>
      </div>
    </div>
  );
}

type RailChip = { top: string; sub: string | null; color: LoadColor };

// Strength-percent lifts → one chip per ramped step (60% / ×4×2). Prose /
// hypertrophy entries (no steps) → a single chip from the flat prescription.
function chipsFor(lift: ProgramLiftView): RailChip[] {
  if (lift.steps && lift.steps.length) return lift.steps.map(stepChip);
  if (lift.setsReps) {
    const sub = [lift.weight, lift.rpe != null ? `@${lift.rpe}` : null].filter(Boolean).join(" · ");
    return [{ top: lift.setsReps, sub: sub || null, color: "lime" }];
  }
  return [{ top: lift.prescription, sub: null, color: "ash" }];
}

function stepChip(st: ProgramStepView): RailChip {
  const sets = st.sets > 1 ? `×${st.sets}` : "";
  return { top: st.load, sub: `${st.reps}${sets}${st.kg ? ` · ${st.kg}` : ""}`, color: st.color };
}

function Chip({ top, sub, color }: RailChip) {
  const c = HEX[color];
  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        textAlign: "center",
        fontFamily: "var(--font-mono)",
        borderRadius: 10,
        padding: "8px 11px",
        background: tint(c, 12),
        border: `1px solid ${tint(c, 28)}`,
        lineHeight: 1.25,
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 13, color: c }}>{top}</span>
      {sub && <span style={{ fontSize: 10.5, color: ASH }}>{sub}</span>}
    </div>
  );
}
