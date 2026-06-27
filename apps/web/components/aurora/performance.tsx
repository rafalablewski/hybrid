"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { fs, space, LINE, ASH, LIME, LIME_HEX, BLUE, tip, mono, roleHex } from "@/lib/ui";
import {
  computePerformanceState, computeInjuryRisk, performanceTrajectory, toTrainingLog,
  ROLE_COLOR, hpiRole, riskRole,
  type Biometrics, type LoggedSession, type MuscleGroup, type TissueRisk, colors,
} from "@hybrid/core";
import RtpPanel from "../rtp-panel";
import { AuroraIcon } from "./icons";
import { useIsMobile } from "@/lib/use-media-query";
import { useLang } from "@/lib/i18n";

const SVG_INK2 = colors.ink2;
const C = (v: string) => `var(--color-${v})`;
// State colours via the SHARED semantic vocabulary (@hybrid/core semantic.ts).
const bandHex = (b: string) => roleHex(riskRole(b)); // injury-risk scale → hex (recharts)
const hpiVar = (b: string) => ROLE_COLOR[hpiRole(b)]; // → accent token name ("lime"/…)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Region = { tissue: MuscleGroup; x: number; y: number; w: number; h: number };
const FRONT: Region[] = [
  { tissue: "shoulders", x: 8, y: 30, w: 30, h: 14 }, { tissue: "shoulders", x: 82, y: 30, w: 30, h: 14 },
  { tissue: "chest", x: 40, y: 32, w: 40, h: 28 }, { tissue: "triceps", x: 6, y: 46, w: 20, h: 40 },
  { tissue: "triceps", x: 94, y: 46, w: 20, h: 40 }, { tissue: "quads", x: 40, y: 116, w: 18, h: 72 }, { tissue: "quads", x: 62, y: 116, w: 18, h: 72 },
];
const BACK: Region[] = [
  { tissue: "back", x: 40, y: 32, w: 40, h: 46 }, { tissue: "glutes", x: 40, y: 82, w: 40, h: 24 },
  { tissue: "posterior", x: 40, y: 110, w: 18, h: 78 }, { tissue: "posterior", x: 62, y: 110, w: 18, h: 78 },
];

function Figure({ regions, label, byTissue }: { regions: Region[]; label: string; byTissue: Record<string, TissueRisk> }) {
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 120 200" style={{ width: 130, height: 216 }}>
        <circle cx={60} cy={16} r={11} fill={SVG_INK2} stroke={LINE} />
        {regions.map((r, i) => {
          const t = byTissue[r.tissue];
          const fill = t && t.risk > 0 ? `${bandHex(t.band)}55` : SVG_INK2;
          const stroke = t && t.risk > 0 ? bandHex(t.band) : LINE;
          return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={5} fill={fill} stroke={stroke} strokeWidth={1}><title>{r.tissue}: {t ? `${t.risk}/100 (${t.band})` : "—"}</title></rect>;
        })}
      </svg>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{label}</div>
    </div>
  );
}

/** AURORA Performance (web) — full bespoke Performance State (HPI, trajectory chart,
 *  tissue body-map + injury table, RtP panel), reusing the exact engines. */
export default function AuroraPerformance({ sessions = [], bio }: { sessions?: LoggedSession[]; bio?: Biometrics | null }) {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;
  if (sessions.length === 0) {
    return (
      <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
        <div style={{ ...card, textAlign: "center", padding: 60 }}>
          <div style={{ fontWeight: 800, fontSize: fs.heading }}>{t("w.analyze.perf.emptyTitle")}</div>
          <p style={{ fontSize: fs.bodyLg, marginTop: 10, maxWidth: 460, marginInline: "auto", lineHeight: 1.6, color: C("ash") }}>{t("w.analyze.perf.emptyBody")}</p>
        </div>
      </div>
    );
  }

  const log = toTrainingLog(sessions);
  const theBio = bio ?? undefined;
  const state = computePerformanceState(log, theBio);
  const risk = computeInjuryRisk(log, theBio);
  const traj = performanceTrajectory(log, 14).map((p) => ({ day: p.daysAgo === 0 ? t("w.analyze.perf.today") : `-${p.daysAgo}d`, HPI: p.hpi, Readiness: p.readiness }));
  const byTissue = Object.fromEntries(risk.tissues.map((t) => [t.tissue, t])) as Record<string, TissueRisk>;
  const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", marginRight: 6, fontFamily: "var(--font-mono)", fontSize: fs.micro, whiteSpace: "nowrap" }}>{label}</span>;

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk"), display: "grid", gap: space.lg }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{t("w.analyze.perf.title")}</h1>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr", gap: space.lg }}>
        <div style={card}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.analyze.perf.twinHpi")}</div>
          <div style={{ fontWeight: 900, fontSize: 56, color: C(hpiVar(state.hpi.band)), lineHeight: 1.1, margin: "6px 0" }}>{state.hpi.score}</div>
          <div style={{ marginBottom: 6 }}>{chip(C(hpiVar(state.hpi.band)), state.hpi.band)}{chip(C("ash"), `${t("w.analyze.perf.limiter")} · ${state.hpi.limiter}`)}</div>
          <div style={{ marginTop: 14 }}>
            {([["w.analyze.perf.strength", state.hpi.components.strength, "lime"], ["w.analyze.perf.endurance", state.hpi.components.endurance, "blue"], ["w.analyze.perf.recovery", Math.max(0, Math.min(100, Math.round(50 + state.hpi.components.recovery * (50 / 15)))), "violet"]] as const).map(([l, v, c]) => (
              <div key={l} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: fs.micro }}><span style={{ color: C("ash") }}>{t(l)}</span><span style={{ color: C(c) }}>{v}</span></div>
                <div style={{ height: 6, borderRadius: 3, background: C("ink"), marginTop: 3, overflow: "hidden" }}><div style={{ width: `${v}%`, height: "100%", background: C(c) }} /></div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: fs.caption, lineHeight: 1.5, marginTop: 8 }}>{state.summary}</p>
        </div>

        <div style={card}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.analyze.perf.trajectory")}</div>
          <div style={{ height: 240, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={traj}>
                <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke={ASH} style={mono} tick={{ fontSize: fs.nano }} />
                <YAxis domain={[0, 100]} stroke={ASH} style={mono} tick={{ fontSize: fs.nano }} />
                <Tooltip contentStyle={tip} />
                <Line type="monotone" dataKey="HPI" stroke={LIME_HEX} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Readiness" stroke={BLUE} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("red") }}>{t("w.analyze.perf.injuryRisk")}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{t("w.analyze.perf.model")} {risk.modelVersion} · {t("w.analyze.perf.calibrated")}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: 28, marginTop: 14, alignItems: "start" }}>
          <div style={{ display: "flex", gap: space.lg, justifyContent: isMobile ? "center" : "flex-start" }}>
            <Figure regions={FRONT} label={t("w.analyze.perf.anterior")} byTissue={byTissue} />
            <Figure regions={BACK} label={t("w.analyze.perf.posterior")} byTissue={byTissue} />
          </div>
          <div style={{ overflowX: "auto", maxWidth: "100%", minWidth: 0 }}>
            <table style={{ width: "100%", minWidth: 420, borderCollapse: "collapse" }}>
              <thead>
                <tr>{["w.analyze.perf.colTissue", "w.analyze.perf.colRisk", "w.analyze.perf.colProb", "w.analyze.perf.colAcwr", "w.analyze.perf.colDriver"].map((h) => (
                  <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", color: C("ash"), textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C("line")}` }}>{t(h)}</th>
                ))}</tr>
              </thead>
              <tbody>
                {risk.tissues.map((t) => (
                  <tr key={t.tissue}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, padding: 8, textTransform: "capitalize", borderBottom: `1px solid ${C("line")}` }}>{cap(t.tissue)}</td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${C("line")}` }}>{chip(t.risk > 0 ? C(ROLE_COLOR[riskRole(t.band)]) : C("ash"), String(t.risk))}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, padding: 8, color: t.risk > 0 ? C("chalk") : C("ash"), borderBottom: `1px solid ${C("line")}` }}>{(t.prob * 100).toFixed(1)}%</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, padding: 8, color: t.enoughHistory ? C("chalk") : C("ash"), borderBottom: `1px solid ${C("line")}` }}>{t.enoughHistory ? t.acwr.toFixed(2) : "—"}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, padding: 8, color: C("ash"), borderBottom: `1px solid ${C("line")}` }}>{t.drivers[0]?.label ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <RtpPanel />
    </div>
  );
}
