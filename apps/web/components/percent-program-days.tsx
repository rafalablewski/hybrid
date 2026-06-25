"use client";

import React, { useState } from "react";
import { loadColor, type ProgramDayView, type ProgramLiftView, type LoadColor } from "@hybrid/core";
import { LIME, BLUE, AMBER, RED, ASH, CHALK } from "@/lib/ui";

// Liquid-Glass "Smart Summary" rendering of a discipline-shaped program's days.
// Shared by BOTH the classic (plans.tsx) and Aurora (aurora/plans.tsx) web
// screens so the plan body is identical on every web theme — and it reads from
// the SAME @hybrid/core planProgramView the mobile app renders, keeping parity.
//
// Each strength lift collapses to one line (name + "8 sets · 60→90%"); tapping
// expands the per-set ramp with intensity-coloured load bars. Because the
// breakdown drops DOWN rather than stretching the row, many sets never squeeze
// the name or overflow — the problem the old single-line prescription had.

const HEX: Record<LoadColor, string> = { blue: BLUE, lime: LIME, amber: AMBER, red: RED, ash: ASH };

export default function GlassProgramDays({ days }: { days: ProgramDayView[] }) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 24,
        padding: 18,
        marginBottom: 16,
        overflow: "hidden",
        // Aurora glow behind the glass — the radial accents the panels refract.
        background:
          "radial-gradient(130% 80% at 0% 0%, rgba(196,240,53,.10), transparent 55%)," +
          "radial-gradient(130% 90% at 100% 8%, rgba(127,212,232,.10), transparent 55%)," +
          "radial-gradient(120% 120% at 80% 100%, rgba(201,169,240,.07), transparent 50%)," +
          "rgba(8,9,8,.55)",
        border: "1px solid var(--color-line)",
      }}
    >
      {days.map((day, di) => (
        <div key={di} style={{ marginBottom: di === days.length - 1 ? 0 : 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "2px 4px 12px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".18em", textTransform: "uppercase", color: AMBER }}>
              {day.title}
              {day.kindLabel ? ` — ${day.kindLabel}` : ""}
            </span>
            {day.volume && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: ASH }}>{day.volume}</span>}
          </div>

          {day.sessions.map((s, si) => (
            <div key={si} style={{ marginBottom: 4 }}>
              {(s.label || s.volume) && (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: ".18em",
                    textTransform: "uppercase",
                    color: s.label === "PM" ? BLUE : LIME,
                    margin: "10px 4px 8px",
                  }}
                >
                  {[s.label, s.volume].filter(Boolean).join(" · ")}
                </div>
              )}
              {s.lifts.map((l, li) => (
                <GlassLift key={li} lift={l} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function GlassLift({ lift }: { lift: ProgramLiftView }) {
  const [open, setOpen] = useState(false);
  const expandable = !!lift.steps && lift.steps.length > 0;

  return (
    <div
      className={`liquid-glass${open ? " is-open" : ""}`}
      style={{
        borderRadius: 16,
        marginBottom: 10,
        overflow: "hidden",
        ...(open ? { boxShadow: "0 10px 44px rgba(0,0,0,.5), 0 0 0 1px rgba(196,240,53,.18)" } : null),
      }}
    >
      <span className="lg-sheen" aria-hidden />
      <button
        type="button"
        onClick={() => expandable && setOpen((o) => !o)}
        aria-expanded={expandable ? open : undefined}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: expandable ? "pointer" : "default",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          padding: "14px 16px",
          textAlign: "left",
          color: "inherit",
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, color: CHALK }}>{lift.name}</span>
          {lift.note && (
            <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, color: ASH, marginTop: 2 }}>{lift.note}</span>
          )}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: CHALK,
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.13)",
              borderRadius: 999,
              padding: "5px 11px",
              whiteSpace: "nowrap",
            }}
          >
            {lift.summary ?? lift.prescription}
          </span>
          {expandable && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: open ? LIME : ASH,
                transform: open ? "rotate(90deg)" : "none",
                transition: "transform .2s, color .2s",
              }}
            >
              ▶
            </span>
          )}
        </span>
      </button>

      {expandable && open && (
        <div style={{ padding: "0 16px 14px" }}>
          {lift.steps!.map((st, i) => {
            const c = HEX[st.color];
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 0", borderTop: "1px solid rgba(255,255,255,.06)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(243,244,239,.5)", width: 56, flexShrink: 0 }}>{st.setLabel}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: c, width: 46, flexShrink: 0 }}>{st.load}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: CHALK, width: 56, flexShrink: 0 }}>{st.reps}</span>
                <span style={{ flex: 1, height: 7, borderRadius: 4, background: "rgba(255,255,255,.07)", overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(0,0,0,.4)" }}>
                  <span style={{ display: "block", height: "100%", width: `${st.fill}%`, borderRadius: 4, background: c, boxShadow: `0 0 12px ${c}` }} />
                </span>
                {st.kg && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: ASH, width: 54, textAlign: "right", flexShrink: 0 }}>{st.kg}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
