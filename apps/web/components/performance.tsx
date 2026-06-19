"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, roleHex, disp, mono, tip, Mono, Card, Chip } from "@/lib/ui";
import {
  computePerformanceState,
  computeInjuryRisk,
  performanceTrajectory,
  toTrainingLog,
  hpiRole,
  riskRole,
  type Biometrics,
  type LoggedSession,
  type MuscleGroup,
  type TissueRisk,
  colors,
} from "@hybrid/core";
import RtpPanel from "./rtp-panel";

// Raw hex for SVG fills — these go on SVG presentation attributes where the
// themed `var(--color-*)` constants from lib/ui can't resolve.
const SVG_INK2 = colors.ink2;

// State colours via the SHARED semantic vocabulary (@hybrid/core semantic.ts).
// (bandColor here is the injury-RISK scale.)
const bandColor = (b: string) => roleHex(riskRole(b));
const hpiColor = (b: string) => roleHex(hpiRole(b));

// schematic region layout (front + back figures), keyed by tissue
type Region = { tissue: MuscleGroup; x: number; y: number; w: number; h: number };
const FRONT: Region[] = [
  { tissue: "shoulders", x: 8, y: 30, w: 30, h: 14 },
  { tissue: "shoulders", x: 82, y: 30, w: 30, h: 14 },
  { tissue: "chest", x: 40, y: 32, w: 40, h: 28 },
  { tissue: "triceps", x: 6, y: 46, w: 20, h: 40 },
  { tissue: "triceps", x: 94, y: 46, w: 20, h: 40 },
  { tissue: "quads", x: 40, y: 116, w: 18, h: 72 },
  { tissue: "quads", x: 62, y: 116, w: 18, h: 72 },
];
const BACK: Region[] = [
  { tissue: "back", x: 40, y: 32, w: 40, h: 46 },
  { tissue: "glutes", x: 40, y: 82, w: 40, h: 24 },
  { tissue: "posterior", x: 40, y: 110, w: 18, h: 78 },
  { tissue: "posterior", x: 62, y: 110, w: 18, h: 78 },
];

function Figure({ regions, label, byTissue }: { regions: Region[]; label: string; byTissue: Record<string, TissueRisk> }) {
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 120 200" style={{ width: 140, height: 233 }}>
        <circle cx={60} cy={16} r={11} fill={SVG_INK2} stroke={LINE} />
        {regions.map((r, i) => {
          const t = byTissue[r.tissue];
          const fill = t && t.risk > 0 ? `${bandColor(t.band)}55` : SVG_INK2;
          const stroke = t && t.risk > 0 ? bandColor(t.band) : LINE;
          return (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={4} fill={fill} stroke={stroke} strokeWidth={1}>
              <title>{r.tissue}: {t ? `${t.risk}/100 (${t.band})` : "—"}</title>
            </rect>
          );
        })}
      </svg>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", display: "block" }} c={ASH}>{label}</Mono>
    </div>
  );
}

export default function Performance({ sessions = [], bio }: { sessions?: LoggedSession[]; bio?: Biometrics | null }) {
  if (sessions.length === 0)
    return (
      <Card style={{ textAlign: "center", padding: 60 }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>No training data yet</div>
        <Mono s={{ fontSize: 14, display: "block", marginTop: 10, maxWidth: 460, marginInline: "auto", lineHeight: 1.6 }}>
          Log a session and your Athlete Twin — HPI, readiness, fatigue and tissue-level injury risk —
          appears here, computed from your real training.
        </Mono>
      </Card>
    );

  const log = toTrainingLog(sessions);
  const theBio = bio ?? undefined;
  const state = computePerformanceState(log, theBio);
  const risk = computeInjuryRisk(log, theBio);
  const traj = performanceTrajectory(log, 14).map((p) => ({
    day: p.daysAgo === 0 ? "today" : `-${p.daysAgo}d`,
    HPI: p.hpi,
    Readiness: p.readiness,
  }));
  const byTissue = Object.fromEntries(risk.tissues.map((t) => [t.tissue, t])) as Record<string, TissueRisk>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
        <Card style={{ borderLeft: `3px solid ${hpiColor(state.hpi.band)}` }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>Athlete Twin · HPI</Mono>
          <div style={{ ...disp, fontWeight: 900, fontSize: 56, color: hpiColor(state.hpi.band), lineHeight: 1.1, margin: "6px 0" }}>
            {state.hpi.score}
          </div>
          <div>
            <Chip c={hpiColor(state.hpi.band)}>{state.hpi.band}</Chip>
            <Chip c={AMBER}>limiter · {state.hpi.limiter}</Chip>
          </div>
          <div style={{ marginTop: 14 }}>
            {(
              [
                ["Strength", state.hpi.components.strength, LIME],
                ["Endurance", state.hpi.components.endurance, BLUE],
                ["Recovery", Math.max(0, Math.min(100, Math.round(50 + state.hpi.components.recovery * (50 / 15)))), VIOLET],
              ] as const
            ).map(([l, v, c]) => (
              <div key={l} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <Mono s={{ fontSize: 11 }}>{l}</Mono>
                  <Mono s={{ fontSize: 11 }} c={c}>{v}</Mono>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: INK2, marginTop: 3, overflow: "hidden" }}>
                  <div style={{ width: `${v}%`, height: "100%", background: c }} />
                </div>
              </div>
            ))}
          </div>
          <Mono s={{ fontSize: 12, lineHeight: 1.5, display: "block", marginTop: 8 }} c={CHALK}>{state.summary}</Mono>
        </Card>

        <Card>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Trajectory · last 14 days</Mono>
          <div style={{ height: 240, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={traj}>
                <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke={ASH} style={mono} tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} stroke={ASH} style={mono} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tip} />
                <Line type="monotone" dataKey="HPI" stroke={LIME} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Readiness" stroke={BLUE} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={RED}>Injury risk · tissue map</Mono>
          <Mono s={{ fontSize: 10 }} c={ASH}>model {risk.modelVersion} · calibrated probability</Mono>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 28, marginTop: 14, alignItems: "start" }}>
          <div style={{ display: "flex", gap: 16 }}>
            <Figure regions={FRONT} label="anterior" byTissue={byTissue} />
            <Figure regions={BACK} label="posterior" byTissue={byTissue} />
          </div>
          <div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Tissue", "Risk", "P(injury)", "ACWR", "Top driver"].map((h) => (
                    <th key={h} style={{ ...mono, fontSize: 10, textTransform: "uppercase", color: ASH, textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${LINE}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {risk.tissues.map((t) => (
                  <tr key={t.tissue}>
                    <td style={{ ...mono, fontSize: 13, padding: "8px", textTransform: "capitalize", color: CHALK, borderBottom: `1px solid ${LINE}` }}>{t.tissue}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${LINE}` }}><Chip c={t.risk > 0 ? bandColor(t.band) : ASH}>{t.risk}</Chip></td>
                    <td style={{ ...mono, fontSize: 12, padding: "8px", color: t.risk > 0 ? CHALK : ASH, borderBottom: `1px solid ${LINE}` }}>{(t.prob * 100).toFixed(1)}%</td>
                    <td style={{ ...mono, fontSize: 12, padding: "8px", color: t.enoughHistory ? CHALK : ASH, borderBottom: `1px solid ${LINE}` }}>{t.enoughHistory ? t.acwr.toFixed(2) : "—"}</td>
                    <td style={{ ...mono, fontSize: 11, padding: "8px", color: ASH, borderBottom: `1px solid ${LINE}` }}>{t.drivers[0]?.label ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <RtpPanel />
    </div>
  );
}
