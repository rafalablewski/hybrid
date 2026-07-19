"use client";

import { useMemo, useState } from "react";
import { ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from "recharts";
import {
  fitLoadVelocityProfile, lvPointsFromSessions, liftsWithVelocity, bestPointPerLoad, velocityAtLoad,
  velocityZone, suggestLoad, mvtFor, VELOCITY_ZONES, type LoggedSession,
} from "@hybrid/core";
import { fs, space, LINE, LINE_HEX, LIME, LIME_HEX, ASH, tip, mono } from "@/lib/ui";
import { useIsMobile } from "@/lib/use-media-query";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;
const zoneVar = (id: string) => (id === "absolute-strength" ? "red" : id === "strength-speed" ? "amber" : id === "speed-strength" ? "lime" : id === "accelerative" ? "blue" : "violet");
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro }}>{label}</span>;

/** AURORA Velocity (web) — full bespoke VBT screen reusing the exact engine +
 *  the recharts load-velocity profile. */
export default function AuroraVelocity({ sessions }: { sessions: LoggedSession[] }) {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const lifts = useMemo(() => liftsWithVelocity(sessions), [sessions]);
  const noData = lifts.length === 0;
  const [lift, setLift] = useState<string>(lifts[0] ?? "");
  const active = lifts.includes(lift) ? lift : (lifts[0] ?? "");
  const mvt = mvtFor(active);
  const points = useMemo(() => bestPointPerLoad(lvPointsFromSessions(sessions, active)), [sessions, active]);
  const profile = useMemo(() => fitLoadVelocityProfile(points, mvt), [points, mvt]);
  const [targetVel, setTargetVel] = useState(0.5);
  const rec = useMemo(() => suggestLoad(profile, { targetVelocity: targetVel }), [profile, targetVel]);
  const fitLine = useMemo(() => {
    if (profile.n < 2 || profile.estimated1rm <= 0) return [];
    const minLoad = Math.min(...points.map((p) => p.load));
    return [{ load: minLoad, velocity: velocityAtLoad(profile, minLoad) }, { load: profile.estimated1rm, velocity: mvt }];
  }, [profile, points, mvt]);
  const resolved = profile.estimated1rm > 0;
  const head = (color: string, kicker: string) => <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C(color) }}>{kicker}</div>;

  if (noData) {
    return (
      <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
        <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: "0 0 16px" }}>{t("w.analyze.vel.title")}</h1>
        <div style={{ ...card, textAlign: "center", padding: 60 }}>
          <div style={{ fontWeight: 800, fontSize: fs.heading }}>{t("w.analyze.vel.emptyTitle")}</div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, marginTop: 10, maxWidth: 480, marginInline: "auto", lineHeight: 1.6, color: C("ash") }}>{t("w.analyze.vel.emptyBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: "0 0 14px" }}>{t("w.analyze.vel.title")}</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm, marginBottom: 16, alignItems: "center" }}>
        {lifts.map((l) => <button key={l} onClick={() => setLift(l)} style={{ fontFamily: "var(--font-display)", fontSize: fs.body, fontWeight: 700, padding: "6px 14px", borderRadius: 999, cursor: "pointer", border: `1px solid ${active === l ? C("lime") : C("line")}`, background: active === l ? C("lime") : "transparent", color: active === l ? C("ink") : C("ash") }}>{l}</button>)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: space.lg }}>
        <div style={card}>
          {head("ash", t("w.analyze.vel.est1rm"))}
          <div style={{ fontWeight: 800, fontSize: 44, lineHeight: 1.05, margin: "8px 0 2px" }}>{resolved ? profile.estimated1rm.toFixed(1) : "—"}<span style={{ fontSize: fs.heading, color: C("ash") }}> kg</span></div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{resolved ? `${t("w.analyze.vel.lineCrossesPre")} ${mvt} m/s – v₀ ${profile.v0.toFixed(2)} – r² ${profile.r2.toFixed(2)} – ${profile.n} ${t("w.analyze.vel.loads")}` : t("w.analyze.vel.needLoads")}</div>
        </div>
        <div style={card}>
          {head("ash", t("w.analyze.vel.aiLoad"))}
          <div style={{ display: "flex", alignItems: "center", gap: space.ms, margin: "12px 0" }}>
            <input type="range" min={0.2} max={1.3} step={0.01} value={targetVel} onChange={(e) => setTargetVel(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--color-lime)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.note, fontWeight: 700 }}>{targetVel.toFixed(2)} m/s</span>
          </div>
          {rec ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: space.md, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800, fontSize: 34, color: "var(--lime-text)" }}>{rec.load} <span style={{ fontSize: fs.subtitle, color: C("ash") }}>kg</span></div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>≈ {rec.percent1rm.toFixed(0)}% 1RM</span>
              {chip(C(zoneVar(rec.zone.id)), rec.zone.label)}
            </div>
          ) : <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.analyze.vel.buildProfile")}</span>}
        </div>
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        {head("ash", `${t("w.analyze.vel.profile")} – ${active}`)}
        <div style={{ marginTop: 10 }}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
              <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" />
              <XAxis type="number" dataKey="load" name="Load" unit="kg" domain={[0, "dataMax + 10"]} tick={{ fill: ASH, fontSize: fs.micro }} stroke={LINE_HEX} />
              <YAxis type="number" dataKey="velocity" name="Velocity" unit=" m/s" domain={[0, "dataMax + 0.2"]} tick={{ fill: ASH, fontSize: fs.micro }} stroke={LINE_HEX} />
              <ZAxis range={[70, 70]} />
              <Tooltip contentStyle={tip} formatter={(v, n) => [`${Number(v).toFixed(2)}${n === "Velocity" ? " m/s" : " kg"}`, n]} cursor={{ stroke: LINE }} />
              {fitLine.length === 2 && <Line data={fitLine} dataKey="velocity" stroke={ASH} strokeWidth={2} dot={false} isAnimationActive={false} legendType="none" />}
              <Scatter data={points} dataKey="velocity" fill={LIME_HEX} line={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 6, color: C("ash") }}><span style={{ color: C("lime") }}>●</span> {t("w.analyze.vel.measured")} – <span style={{ color: C("ash") }}>—</span> {t("w.analyze.vel.fit")}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: space.lg, marginTop: 16 }}>
        <div style={card}>
          {head("ash", t("w.analyze.vel.zones"))}
          <div style={{ marginTop: 8 }}>
            {VELOCITY_ZONES.slice().reverse().map((z) => (
              <div key={z.id} style={{ display: "flex", alignItems: "center", gap: space.ms, padding: "7px 0", borderBottom: `1px solid ${C("line")}` }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: C(zoneVar(z.id)), flexShrink: 0 }} />
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: fs.body }}>{z.label}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{z.focus}</div></div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, whiteSpace: "nowrap", color: C("chalk") }}>{z.max === Infinity ? `≥${z.min}` : `${z.min}–${z.max}`} m/s</span>
              </div>
            ))}
          </div>
        </div>
        <div style={card}>
          {head("ash", t("w.analyze.vel.recentSets"))}
          <div style={{ marginTop: 8 }}><RecentSets sessions={sessions} lift={active} /></div>
        </div>
      </div>
    </div>
  );
}

function RecentSets({ sessions, lift }: { sessions: LoggedSession[]; lift: string }) {
  const { t } = useLang();
  const rows = sessions
    .flatMap((s) => s.blocks.filter((b): b is Extract<typeof b, { kind: "strength" }> => b.kind === "strength" && b.name === lift).flatMap((b) => b.sets))
    .map((set) => ({ load: parseFloat(set.load), reps: parseInt(set.reps, 10) || 0, vel: parseFloat(set.vel ?? "") }))
    .filter((r) => Number.isFinite(r.load) && Number.isFinite(r.vel)).slice(-6).reverse();
  if (rows.length === 0) return <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.analyze.vel.noVelSetsPre")} {lift} {t("w.analyze.vel.noVelSetsTail")}</span>;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr 1.4fr", gap: space.xs, marginBottom: 6 }}>
        {([["w.analyze.vel.colLoad", "load"], ["w.analyze.vel.colReps", "reps"], ["w.analyze.vel.colMs", "ms"], ["w.analyze.vel.colZone", "zone"]] as const).map(([k, key]) => <span key={key} style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", color: C("ash") }}>{t(k)}</span>)}
      </div>
      {rows.map((r, i) => { const z = velocityZone(r.vel); return (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr 1.4fr", gap: space.xs, padding: "6px 0", borderTop: `1px solid ${C("line")}`, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: fs.body }}>
          <span style={{ color: C("chalk") }}>{r.load} kg</span><span style={{ color: C("ash") }}>{r.reps}×</span><span style={{ color: C("chalk") }}>{r.vel.toFixed(2)}</span>{chip(C(zoneVar(z.id)), z.label)}
        </div>
      ); })}
    </div>
  );
}
