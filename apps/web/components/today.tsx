"use client";

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import {
  prescribeSession,
  computePerformanceState,
  computeAccountability,
  habitStrength,
  projectLift,
  liftNames,
  velocityProfiles,
  toTrainingLog,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
  type LoggedSession,
  type Biometrics,
} from "@hybrid/core";
import {
  LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED,
  disp, cond, mono, tip, Mono, Card, Chip, ChartFrame,
} from "@/lib/ui";

const hpiColor = (b: string) =>
  b === "peak" || b === "primed" ? LIME : b === "moderate" ? BLUE : b === "compromised" ? AMBER : RED;
const bandColor = (b: string) =>
  b === "thriving" || b === "steady" ? LIME : b === "wobbling" ? BLUE : b === "at-risk" ? AMBER : RED;

export default function Today({
  sessions,
  bio,
  onStart,
}: {
  sessions: LoggedSession[];
  bio?: Biometrics;
  onStart: () => void;
}) {
  const log = sessions.length ? toTrainingLog(sessions) : SAMPLE_TRAINING_LOG;
  const rx = useMemo(
    () => prescribeSession(log, bio ?? SAMPLE_BIOMETRICS, { profiles: velocityProfiles(sessions) }),
    [log, bio, sessions],
  );
  const state = useMemo(() => computePerformanceState(log, bio ?? SAMPLE_BIOMETRICS), [log, bio]);
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
  const strength = useMemo(() => habitStrength(sessions, 3), [sessions]);

  const primaryLift = useMemo(() => liftNames(sessions)[0], [sessions]);
  const projection = useMemo(
    () => (primaryLift ? projectLift(sessions, primaryLift, { horizonWeeks: 12 }) : null),
    [sessions, primaryLift],
  );
  const goal = projection && !projection.insufficient ? Math.round(projection.current * 1.1) : null;
  const projGoal = useMemo(
    () => (primaryLift && goal ? projectLift(sessions, primaryLift, { horizonWeeks: 12, goal }) : null),
    [sessions, primaryLift, goal],
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* ROUTE TODAY */}
      <Card style={{ borderLeft: `3px solid ${LIME}`, gridColumn: "span 2" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
            Your route today · readiness {rx.readiness}/100
          </Mono>
          <button onClick={onStart} style={cta(LIME)}>Start session →</button>
        </div>
        <div style={{ ...disp, fontWeight: 800, fontSize: 26, margin: "8px 0 6px" }}>
          {rx.blocks[0]?.name}{rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}
        </div>
        <Mono s={{ fontSize: 13, lineHeight: 1.6 }} c={CHALK}>{rx.why}</Mono>
      </Card>

      {/* ON TRACK? — accountability */}
      <Card style={{ borderLeft: `3px solid ${bandColor(acc.band)}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={bandColor(acc.band)}>
            On track? · {acc.band}
          </Mono>
          <Chip c={bandColor(acc.band)}>{acc.streak.current ? `${acc.streak.current}-day streak` : "no streak yet"}</Chip>
        </div>
        <div style={{ ...disp, fontWeight: 700, fontSize: 18, marginTop: 10 }}>{acc.intervention.headline}</div>
        <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block", marginTop: 4 }} c={CHALK}>
          {acc.intervention.message}
        </Mono>
        <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
          <Metric label="Risk" value={`${acc.risk}`} c={bandColor(acc.band)} />
          <Metric label="Habit strength" value={`${strength}`} c={CHALK} />
          <Metric label="This week" value={`${acc.sessionsLast7}/3`} c={CHALK} />
        </div>
        {acc.drivers.length > 0 && (
          <Mono s={{ fontSize: 11, display: "block", marginTop: 10 }}>
            {acc.drivers.map((d) => d.label).join(" · ")}
          </Mono>
        )}
      </Card>

      {/* FUTURE SELF */}
      {primaryLift && projection && !projection.insufficient && projGoal ? (
        <ChartFrame title={`Future self · ${primaryLift}`} kicker="projected from your behavior" c={VIOLET}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
            <span style={{ ...disp, fontWeight: 800, fontSize: 30, color: CHALK }}>{Math.round(projection.current)}</span>
            <span style={{ color: ASH }}>→</span>
            <span style={{ ...disp, fontWeight: 800, fontSize: 30, color: VIOLET }}>
              {Math.round(projection.series[projection.series.length - 1]!.value)}
            </span>
            <Mono s={{ fontSize: 12 }}>kg e1RM · 12 wks</Mono>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={projection.series} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="weeksAhead" unit="w" tick={{ fill: ASH, fontSize: 11 }} stroke={LINE} />
              <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={{ fill: ASH, fontSize: 11 }} stroke={LINE} />
              <Tooltip contentStyle={tip} formatter={(v) => [`${v} kg`, "e1RM"]} />
              {goal != null && <ReferenceLine y={goal} stroke={AMBER} strokeDasharray="4 4" label={{ value: `goal ${goal}`, fill: AMBER, fontSize: 10, position: "insideTopRight" }} />}
              <Line type="monotone" dataKey="value" stroke={VIOLET} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <Mono s={{ fontSize: 12, display: "block", marginTop: 6 }} c={CHALK}>
            +{projection.ratePerWeek}kg/wk · reach {goal}kg{projGoal.etaWeeks ? ` in ~${Math.round(projGoal.etaWeeks)} wks` : ""}
            {projGoal.goalProbability != null ? ` · ${Math.round(projGoal.goalProbability * 100)}% likely` : ""} · consistency ×{projection.adherenceFactor}
          </Mono>
        </ChartFrame>
      ) : (
        <Card style={{ borderLeft: `3px solid ${VIOLET}` }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Future self</Mono>
          <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block", marginTop: 8 }} c={CHALK}>
            Log a lift across a few sessions and we&apos;ll project where you&apos;re headed — your 12-week
            strength, your goal ETA, and how likely you are to hit it.
          </Mono>
        </Card>
      )}

      {/* TWIN mini */}
      <Card style={{ borderLeft: `3px solid ${BLUE}`, gridColumn: "span 2" }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>
          Performance State · Athlete Twin
        </Mono>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 6 }}>
          <span style={{ ...disp, fontWeight: 800, fontSize: 38, color: hpiColor(state.hpi.band) }}>{state.hpi.score}</span>
          <Mono s={{ fontSize: 12 }}>HPI · {state.hpi.band} · limiter {state.hpi.limiter}</Mono>
          <div style={{ display: "flex", gap: 14, marginLeft: "auto" }}>
            <Mono s={{ fontSize: 12 }} c={LIME}>STR {state.hpi.components.strength}</Mono>
            <Mono s={{ fontSize: 12 }} c={BLUE}>END {state.hpi.components.endurance}</Mono>
            <Mono s={{ fontSize: 12 }} c={VIOLET}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</Mono>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value, c }: { label: string; value: string; c: string }) {
  return (
    <div>
      <div style={{ ...disp, fontWeight: 800, fontSize: 22, color: c }}>{value}</div>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</Mono>
    </div>
  );
}

function cta(color: string) {
  return {
    ...cond,
    fontSize: 13,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: ".04em",
    color: "#0c0d0c",
    background: color,
    border: "none",
    borderRadius: 10,
    padding: "9px 16px",
    cursor: "pointer",
  };
}
