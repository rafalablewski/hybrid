"use client";

import { accentText } from "@/lib/ui";
import { fs, space, currentPhase, type Macrocycle, type LoggedSession, type Biometrics } from "@hybrid/core";
import ReconciledWeek from "../reconciled-week";
import LeavePlanSection from "./leave-plan";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;

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
  const { t } = useLang();
  if (!macro)
    return (
      <div style={{ ...card, textAlign: "center", padding: 60, maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
        <div style={{ fontWeight: 800, fontSize: fs.heading }}>{t("w.train.periodize.noActivePlan")}</div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, marginTop: 10, maxWidth: 460, marginInline: "auto", lineHeight: 1.6, color: C("ash") }}>
          {t("w.train.periodize.enrollBefore")} <b style={{ color: accentText("lime") }}>{t("w.train.periodize.plansTab")}</b> {t("w.train.periodize.enrollAfter")}
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
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: accentText("lime") }}>
          {macro.goalOrSport}{macro.model ? ` – ${macro.model}` : ` – ${t("w.train.periodize.enrolledLabel")}`}
        </div>
        <div style={{ fontWeight: 800, fontSize: 22, margin: "6px 0 12px" }}>
          {macro.totalWeeks}{t("w.train.periodize.macroNow")} {current.label}
        </div>
        <div style={{ display: "flex", gap: 3, height: 12, borderRadius: 6, overflow: "hidden" }}>
          {macro.blocks.map((b) => (
            <div key={b.key} title={`${b.label} – ${b.weeks} ${t("w.train.periodize.wk")}`} style={{ flex: b.weeks, background: b.key === current.key ? b.color : `${b.color}40` }} />
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: space.ms, marginTop: 12 }}>
          {macro.blocks.map((b) => (
            <div key={b.key} style={{ display: "flex", alignItems: "center", gap: space.xs }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: b.key === current.key ? C("chalk") : C("ash") }}>{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: space.lg }}>
        {macro.blocks.map((b) => (
          <div key={b.key} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 800, fontSize: fs.title, color: b.color }}>{b.label}</div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.train.periodize.wk")} {b.startWeek}–{b.endWeek}</span>
            </div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, margin: "6px 0 12px", color: C("ash") }}>{b.focus}</p>
            <div style={{ display: "flex", gap: space.xs }}>
              {b.micros.map((m) => (
                <div
                  key={m.week}
                  title={`${t("w.train.periodize.week")} ${m.week} – ${m.kind} – ${t("w.train.periodize.intensity")} ${m.intensity} / ${t("w.train.periodize.volume")} ${m.volume}`}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "8px 2px",
                    borderRadius: 12,
                    background: m.week === week ? `color-mix(in srgb, ${C("lime")} 12%, transparent)` : C("ink"),
                    border: `1px solid ${m.week === week ? C("lime") : C("line")}`,
                  }}
                >
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: m.kind === "recovery" ? C("ash") : C("chalk") }}>W{m.week}</div>
                  <div style={{ height: 4, borderRadius: 2, marginTop: 4, background: m.kind === "recovery" ? C("ash") : b.color, opacity: 0.4 + (m.intensity / 100) * 0.6 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Goal-only seasons (no named plan → no plan detail page to host the
          quiet leave link) get their leave surface here instead; named-plan
          seasons keep their single exit on the plan's own page. */}
      <LeavePlanSection forPlanId={null} />
    </div>
  );
}
