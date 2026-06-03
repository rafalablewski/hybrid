"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
} from "recharts";
import {
  fitLoadVelocityProfile,
  lvPointsFromSessions,
  liftsWithVelocity,
  bestPointPerLoad,
  velocityAtLoad,
  velocityZone,
  suggestLoad,
  mvtFor,
  VELOCITY_ZONES,
  type LoggedSession,
} from "@hybrid/core";
import {
  INK,
  INK2,
  LINE,
  LIME,
  CHALK,
  ASH,
  BLUE,
  VIOLET,
  AMBER,
  RED,
  disp,
  cond,
  mono,
  tip,
  Mono,
  Card,
  Chip,
  ChartFrame,
} from "@/lib/ui";

const zoneColor = (id: string) =>
  id === "absolute-strength" ? RED
  : id === "strength-speed" ? AMBER
  : id === "speed-strength" ? LIME
  : id === "accelerative" ? BLUE
  : VIOLET;

export default function Velocity({ sessions }: { sessions: LoggedSession[] }) {
  const lifts = useMemo(() => liftsWithVelocity(sessions), [sessions]);
  const noData = lifts.length === 0;
  const [lift, setLift] = useState<string>(lifts[0] ?? "");
  const active = lifts.includes(lift) ? lift : (lifts[0] ?? "");

  const mvt = mvtFor(active);
  const points = useMemo(
    () => bestPointPerLoad(lvPointsFromSessions(sessions, active)),
    [sessions, active],
  );
  const profile = useMemo(() => fitLoadVelocityProfile(points, mvt), [points, mvt]);

  // Velocity-target recommender (the "AI load").
  const [targetVel, setTargetVel] = useState(0.5);
  const rec = useMemo(() => suggestLoad(profile, { targetVelocity: targetVel }), [profile, targetVel]);

  // The fitted line, drawn from the lightest measured load down to the 1RM @ MVT.
  const fitLine = useMemo(() => {
    if (profile.n < 2 || profile.estimated1rm <= 0) return [];
    const minLoad = Math.min(...points.map((p) => p.load));
    return [
      { load: minLoad, velocity: velocityAtLoad(profile, minLoad) },
      { load: profile.estimated1rm, velocity: mvt },
    ];
  }, [profile, points, mvt]);

  const resolved = profile.estimated1rm > 0;

  if (noData)
    return (
      <Card style={{ textAlign: "center", padding: 60 }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>No bar speed logged yet</div>
        <Mono s={{ fontSize: 14, display: "block", marginTop: 10, maxWidth: 480, marginInline: "auto", lineHeight: 1.6 }}>
          Add a velocity (m/s) to a strength set in the <b style={{ color: LIME }}>Log session</b> tab —
          across a few loads — and your load–velocity profile, estimated 1RM, zones and the
          autoregulated load recommender build here from your real lifts.
        </Mono>
      </Card>
    );

  return (
    <div>
      {/* lift selector */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Lift</Mono>
        {lifts.map((l) => (
          <button
            key={l}
            onClick={() => setLift(l)}
            style={{
              ...cond,
              fontSize: 13,
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: 999,
              cursor: "pointer",
              border: `1px solid ${active === l ? LIME : LINE}`,
              background: active === l ? `${LIME}1a` : "transparent",
              color: active === l ? LIME : ASH,
            }}
          >
            {l}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {/* estimated 1RM headline */}
        <Card>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
            Estimated 1RM · from velocity
          </Mono>
          <div style={{ ...disp, fontWeight: 800, fontSize: 44, color: CHALK, lineHeight: 1.05, margin: "8px 0 2px" }}>
            {resolved ? profile.estimated1rm.toFixed(1) : "—"}
            <span style={{ fontSize: 20, color: ASH }}> kg</span>
          </div>
          <Mono s={{ fontSize: 12 }}>
            {resolved
              ? `Line crosses MVT ${mvt} m/s · v₀ ${profile.v0.toFixed(2)} · fit r² ${profile.r2.toFixed(2)} · ${profile.n} loads`
              : "Need ≥2 loads with velocity to resolve a 1RM."}
          </Mono>
        </Card>

        {/* load recommender — the autoregulated "AI load" */}
        <Card style={{ borderLeft: `3px solid ${VIOLET}` }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>
            AI load · target a bar speed
          </Mono>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0" }}>
            <input
              type="range"
              min={0.2}
              max={1.3}
              step={0.01}
              value={targetVel}
              onChange={(e) => setTargetVel(Number(e.target.value))}
              style={{ flex: 1, accentColor: VIOLET }}
            />
            <Mono s={{ fontSize: 15, fontWeight: 700 }} c={CHALK}>{targetVel.toFixed(2)} m/s</Mono>
          </div>
          {rec ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 34, color: VIOLET }}>
                {rec.load} <span style={{ fontSize: 16, color: ASH }}>kg</span>
              </div>
              <Mono s={{ fontSize: 13 }}>≈ {rec.percent1rm.toFixed(0)}% 1RM</Mono>
              <Chip c={zoneColor(rec.zone.id)}>{rec.zone.label}</Chip>
            </div>
          ) : (
            <Mono s={{ fontSize: 12 }}>Build a profile first to get a recommendation.</Mono>
          )}
        </Card>
      </div>

      {/* load–velocity profile chart */}
      <div style={{ marginTop: 16 }}>
        <ChartFrame title="Load–velocity profile" kicker={active} c={LIME}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="load"
                name="Load"
                unit="kg"
                domain={[0, "dataMax + 10"]}
                tick={{ fill: ASH, fontSize: 11 }}
                stroke={LINE}
              />
              <YAxis
                type="number"
                dataKey="velocity"
                name="Velocity"
                unit=" m/s"
                domain={[0, "dataMax + 0.2"]}
                tick={{ fill: ASH, fontSize: 11 }}
                stroke={LINE}
              />
              <ZAxis range={[70, 70]} />
              <Tooltip
                contentStyle={tip}
                formatter={(v, n) => [`${Number(v).toFixed(2)}${n === "Velocity" ? " m/s" : " kg"}`, n]}
                cursor={{ stroke: LINE }}
              />
              {/* fitted line, extended to the 1RM @ MVT */}
              {fitLine.length === 2 && (
                <Line data={fitLine} dataKey="velocity" stroke={VIOLET} strokeWidth={2} dot={false} isAnimationActive={false} legendType="none" />
              )}
              {/* measured points */}
              <Scatter data={points} dataKey="velocity" fill={LIME} line={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <Mono s={{ fontSize: 11, display: "block", marginTop: 6 }}>
            <span style={{ color: LIME }}>●</span> measured sets &nbsp;
            <span style={{ color: VIOLET }}>—</span> fitted line → 1RM at MVT
          </Mono>
        </ChartFrame>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        {/* velocity zones reference */}
        <ChartFrame title="Velocity zones" kicker="training quality" c={BLUE}>
          {VELOCITY_ZONES.slice().reverse().map((z) => (
            <div
              key={z.id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${LINE}` }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 3, background: zoneColor(z.id), flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ ...disp, fontWeight: 600, fontSize: 13 }}>{z.label}</div>
                <Mono s={{ fontSize: 11 }}>{z.focus}</Mono>
              </div>
              <Mono s={{ fontSize: 11, whiteSpace: "nowrap" }} c={CHALK}>
                {z.max === Infinity ? `≥${z.min}` : `${z.min}–${z.max}`} m/s
              </Mono>
            </div>
          ))}
        </ChartFrame>

        {/* recent sets / feedback */}
        <ChartFrame title="Recent sets" kicker="bar speed + velocity loss" c={LIME}>
          <RecentSets sessions={sessions} lift={active} />
          <Mono s={{ fontSize: 11, display: "block", marginTop: 10, color: ASH }}>
            Per-rep trajectory &amp; bar path (sagittal) need the bar sensor / camera capture —
            see Capabilities (blocked until the sensor SDK is wired).
          </Mono>
        </ChartFrame>
      </div>
    </div>
  );
}

function RecentSets({ sessions, lift }: { sessions: LoggedSession[]; lift: string }) {
  const rows = sessions
    .flatMap((s) =>
      s.blocks
        .filter((b): b is Extract<typeof b, { kind: "strength" }> => b.kind === "strength" && b.name === lift)
        .flatMap((b) => b.sets),
    )
    .map((set) => ({
      load: parseFloat(set.load),
      reps: parseInt(set.reps, 10) || 0,
      vel: parseFloat(set.vel ?? ""),
      loss: NaN,
    }))
    .filter((r) => Number.isFinite(r.load) && Number.isFinite(r.vel))
    .slice(-6)
    .reverse();

  if (rows.length === 0)
    return <Mono s={{ fontSize: 12 }}>No velocity-tagged sets logged for {lift} yet.</Mono>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr 1.4fr", gap: 6, marginBottom: 6 }}>
        {["load", "reps", "m/s", "zone"].map((h) => (
          <Mono key={h} s={{ fontSize: 10, textTransform: "uppercase" }}>{h}</Mono>
        ))}
      </div>
      {rows.map((r, i) => {
        const z = velocityZone(r.vel);
        return (
          <div
            key={i}
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr 1.4fr", gap: 6, padding: "6px 0", borderTop: `1px solid ${LINE}`, alignItems: "center" }}
          >
            <Mono s={{ fontSize: 13 }} c={CHALK}>{r.load} kg</Mono>
            <Mono s={{ fontSize: 13 }}>{r.reps}×</Mono>
            <Mono s={{ fontSize: 13 }} c={CHALK}>{Number.isFinite(r.vel) ? r.vel.toFixed(2) : "—"}</Mono>
            <Chip c={zoneColor(z.id)}>{z.label}</Chip>
          </div>
        );
      })}
    </div>
  );
}
