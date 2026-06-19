"use client";

import { currentPhase, type Macrocycle, type LoggedSession, type Biometrics } from "@hybrid/core";
import ReconciledWeek from "../reconciled-week";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 20 } as const;

/** AURORA Periodize (web) — the enrolled macrocycle: this week's reconciled
 *  session + phase timeline + load/recovery microcycles. Reuses the exact
 *  currentPhase engine + the shared ReconciledWeek block. */
export default function AuroraPeriodize({
  macro,
  currentWeek = 1,
  sessions = [],
  bio,
}: {
  macro?: Macrocycle | null;
  currentWeek?: number;
  sessions?: LoggedSession[];
  bio?: Biometrics | null;
}) {
  if (!macro)
    return (
      <div style={{ ...card, textAlign: "center", padding: 60, maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
        <div style={{ fontWeight: 800, fontSize: 20 }}>No active plan</div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 14, marginTop: 10, maxWidth: 460, marginInline: "auto", lineHeight: 1.6, color: C("ash") }}>
          Enroll in a plan from the <b style={{ color: C("lime") }}>Plans</b> tab — your periodized
          macrocycle (phases, load &amp; recovery weeks) shows up here.
        </p>
      </div>
    );

  const week = currentWeek;
  const { block: current } = currentPhase(macro, week);

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {sessions.length > 0 && (
        <ReconciledWeek macro={macro} currentWeek={week} sessions={sessions} bio={bio ?? undefined} style={{ marginBottom: 16 }} />
      )}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>
          {macro.goalOrSport}{macro.model ? ` · ${macro.model}` : " · enrolled"}
        </div>
        <div style={{ fontWeight: 800, fontSize: 22, margin: "6px 0 12px" }}>
          {macro.totalWeeks}-week macrocycle · now in {current.label}
        </div>
        <div style={{ display: "flex", gap: 3, height: 12, borderRadius: 6, overflow: "hidden" }}>
          {macro.blocks.map((b) => (
            <div key={b.key} title={`${b.label} · ${b.weeks} wk`} style={{ flex: b.weeks, background: b.key === current.key ? b.color : `${b.color}40` }} />
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          {macro.blocks.map((b) => (
            <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: b.key === current.key ? C("chalk") : C("ash") }}>{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {macro.blocks.map((b) => (
          <div key={b.key} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: b.color }}>{b.label}</div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash") }}>wk {b.startWeek}–{b.endWeek}</span>
            </div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, margin: "6px 0 12px", color: C("ash") }}>{b.focus}</p>
            <div style={{ display: "flex", gap: 6 }}>
              {b.micros.map((m) => (
                <div
                  key={m.week}
                  title={`Week ${m.week} · ${m.kind} · intensity ${m.intensity} / volume ${m.volume}`}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "8px 2px",
                    borderRadius: 10,
                    background: m.week === week ? `color-mix(in srgb, ${C("lime")} 12%, transparent)` : C("ink"),
                    border: `1px solid ${m.week === week ? C("lime") : C("line")}`,
                  }}
                >
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: m.kind === "recovery" ? C("ash") : C("chalk") }}>W{m.week}</div>
                  <div style={{ height: 4, borderRadius: 2, marginTop: 4, background: m.kind === "recovery" ? C("ash") : b.color, opacity: 0.4 + (m.intensity / 100) * 0.6 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
