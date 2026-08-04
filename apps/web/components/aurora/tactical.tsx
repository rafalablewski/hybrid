"use client";

import { accentText } from "@/lib/ui";
import { useEffect, useState } from "react";
import { fs, space, deploymentReadiness, unitReadiness, type DutyStatus, type UnitMember } from "@hybrid/core";
import { useIsMobile } from "@/lib/use-media-query";
import { useLang } from "@/lib/i18n";

type State = { hpi: number; injuryRisk: number; readiness: number; sessionCount: number };

const C = (v: string) => `var(--color-${v})`;

const statusColor: Record<DutyStatus, string> = {
  ready: "lime",
  qualified: "blue",
  limited: "amber",
  "non-deployable": "red",
};

/** AURORA Tactical / SOF (web) — same /api/state fetch + deploymentReadiness /
 *  unitReadiness engines: Deployment Readiness Index + unit go/no-go, in the
 *  rounded Aurora style. */
export default function AuroraTactical() {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const [state, setState] = useState<State | null>(null);
  const [load, setLoad] = useState("78");
  const [work, setWork] = useState("80");

  useEffect(() => {
    fetch("/api/state").then(async (r) => {
      if (r.ok) setState((await r.json()) as State);
    });
  }, []);

  const num = (s: string) => (s.trim() && Number.isFinite(parseFloat(s)) ? parseFloat(s) : undefined);
  const hasData = !!state && state.sessionCount > 0;
  const dr = hasData
    ? deploymentReadiness({ hpi: state!.hpi, injuryRisk: state!.injuryRisk, loadCarriage: num(load), workCapacity: num(work) })
    : null;

  // illustrative squad: you + synthetic teammates, to show the unit rollup
  const squad: UnitMember[] = dr ? [{ name: t("w.teams.tactical.you"), dri: dr.dri, status: dr.status }] : [];
  const unit = squad.length ? unitReadiness(squad) : null;

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
  const kicker = (color: string): React.CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C(color) });
  const input: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, padding: "8px 12px", borderRadius: 16, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, width: "100%", outline: "none" };
  const chip = (color: string, label: React.ReactNode) => <span style={{ background: `color-mix(in srgb, ${C(color)} 14%, transparent)`, color: C(color), borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro, marginRight: 6, marginBottom: 4, display: "inline-block" }}>{label}</span>;

  return (
    <div style={{ display: "grid", gap: space.lg, fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ ...card, }}>
        {/* Kicker cut — it restated the screen name and the "Deployment
            readiness" heading below already carries it (mobile has no kicker). */}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, lineHeight: 1.5, color: C("chalk") }}>
          {t("w.teams.tactical.headerBody")}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr", gap: space.lg }}>
        <div style={{ ...card, }}>
          <div style={kicker("blue")}>{t("w.teams.tactical.deploymentReadiness")}</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 54, color: dr ? C(statusColor[dr.status]) : C("ash"), lineHeight: 1.1, margin: "6px 0" }}>
            {dr ? dr.dri : "—"}
          </div>
          {dr && chip(statusColor[dr.status], dr.status.replace("-", " "))}
          {dr && dr.limiters.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {dr.limiters.map((l) => <div key={l} style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: accentText("amber") }}>⚠ {l}</div>)}
            </div>
          )}
          {hasData ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 10, color: C("ash") }}>HPI {state!.hpi} – {t("w.teams.tactical.injuryRisk")} {state!.injuryRisk}/100</div>
          ) : (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 10, color: C("ash") }}>{t("w.teams.tactical.logToCompute")}</div>
          )}
          <div style={{ display: "flex", gap: space.sm, marginTop: 12 }}>
            <label style={{ flex: 1 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", display: "block", marginBottom: 4, color: C("ash") }}>{t("w.teams.tactical.loadCarriage")}</span>
              <input value={load} onChange={(e) => setLoad(e.target.value)} inputMode="numeric" style={input} />
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", display: "block", marginBottom: 4, color: C("ash") }}>{t("w.teams.tactical.workCapacity")}</span>
              <input value={work} onChange={(e) => setWork(e.target.value)} inputMode="numeric" style={input} />
            </label>
          </div>
        </div>

        <div style={{ ...card, }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={kicker("ash")}>{t("w.teams.tactical.unitReadiness")}</div>
            {unit && chip(unit.go ? "lime" : "red", `${unit.go ? t("w.teams.tactical.missionGo") : t("w.teams.tactical.noGo")} – ${unit.pctReady}% ${t("w.teams.tactical.deployable")}`)}
          </div>
          <div style={{ marginTop: 12 }}>
            {unit?.members.map((m) => (
              <div key={m.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C("line")}` }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, color: m.name === t("w.teams.tactical.you") ? C("lime") : C("chalk") }}>{m.name}</span>
                <div style={{ display: "flex", gap: space.sm, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.teams.tactical.dri")} {m.dri}</span>
                  {chip(statusColor[m.status], m.status.replace("-", " "))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, marginTop: 10, color: C("ash") }}>{t("w.teams.tactical.rollupNote")}</div>
        </div>
      </div>
    </div>
  );
}
