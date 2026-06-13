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
  weeklyRecap,
  type LoggedSession,
  type Biometrics,
  type Macrocycle,
} from "@hybrid/core";
import ReconciledWeek from "./reconciled-week";
import {
  LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED,
  disp, cond, mono, tip, txt, Mono, Card, Chip, ChartFrame,
} from "@/lib/ui";

const hpiColor = (b: string) =>
  b === "peak" || b === "primed" ? LIME : b === "moderate" ? BLUE : b === "compromised" ? AMBER : RED;
const bandColor = (b: string) =>
  b === "thriving" || b === "steady" ? LIME : b === "wobbling" ? BLUE : b === "at-risk" ? AMBER : RED;
const MUSCLE_LABEL: Record<string, string> = {
  quads: "Quads",
  glutes: "Glutes",
  posterior: "Posterior chain",
  back: "Back",
  chest: "Chest",
  shoulders: "Shoulders",
  triceps: "Triceps",
};

export default function Today({
  sessions,
  bio,
  macro,
  currentWeek = 1,
  onStart,
}: {
  sessions: LoggedSession[];
  bio?: Biometrics;
  macro?: Macrocycle | null;
  currentWeek?: number;
  onStart: () => void;
}) {
  const log = toTrainingLog(sessions);
  const rx = useMemo(
    () => prescribeSession(log, bio, { profiles: velocityProfiles(sessions) }),
    [log, bio, sessions],
  );
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
  const strength = useMemo(() => habitStrength(sessions, 3), [sessions]);
  const recap = useMemo(() => weeklyRecap(sessions), [sessions]);

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
      {sessions.length === 0 ? (
        <Card glass variant="vibrant" style={{ borderLeft: `3px solid ${LIME}`, gridColumn: "span 2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
              Your route today
            </Mono>
            <button onClick={onStart} style={cta(LIME)}>Start session →</button>
          </div>
          <div style={{ ...disp, fontWeight: 800, fontSize: 26, margin: "8px 0 6px" }}>Start your first session</div>
          <Mono s={{ fontSize: 13, lineHeight: 1.6 }} c={CHALK}>
            Log a workout and your route, readiness, Athlete Twin and trends all build from your real
            training — nothing here is pre-filled.
          </Mono>
        </Card>
      ) : (
        <Card glass variant="vibrant" style={{ borderLeft: `3px solid ${LIME}`, gridColumn: "span 2" }}>
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
      )}

      {/* THIS WEEK — the reconciled plan (macrocycle phase arbitrates route + sport) */}
      {macro && sessions.length > 0 && (
        <ReconciledWeek macro={macro} currentWeek={currentWeek} sessions={sessions} bio={bio} style={{ gridColumn: "span 2" }} />
      )}

      {/* ON TRACK? — accountability */}
      <Card glass style={{ borderLeft: `3px solid ${bandColor(acc.band)}` }}>
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

      {/* YOUR WEEK — recap */}
      {sessions.length > 0 && (
        <Card glass style={{ borderLeft: `3px solid ${LIME}`, gridColumn: "span 2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
              Your week
            </Mono>
            <div style={{ display: "flex", gap: 8 }}>
              {recap.prs.length > 0 && <Chip c={LIME}>🏆 {recap.prs.length} PR</Chip>}
              {recap.cardioPrs.length > 0 && <Chip c={BLUE}>🏃 {recap.cardioPrs.length} PR</Chip>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
            <Metric label="Sessions" value={`${recap.sessions}`} c={CHALK} />
            <Metric label="Volume" value={`${recap.volume.toLocaleString()} kg`} c={LIME} />
            <Metric label="Sets" value={`${recap.sets}`} c={CHALK} />
            {recap.distanceKm > 0 && <Metric label="Distance" value={`${recap.distanceKm} km`} c={BLUE} />}
            <Metric label="Active days" value={`${recap.activeDays}`} c={CHALK} />
            {recap.topMuscle && <Metric label="Top muscle" value={MUSCLE_LABEL[recap.topMuscle.muscle] ?? recap.topMuscle.muscle} c={BLUE} />}
          </div>
          {(recap.prevSessions > 0 || recap.prevVolume > 0) && (
            <Mono s={{ fontSize: 12, display: "block", marginTop: 12 }} c={recap.volumeDelta >= 0 ? LIME : AMBER}>
              {recap.sessionsDelta >= 0 ? "+" : ""}{recap.sessionsDelta} sessions · {recap.volumeDelta >= 0 ? "+" : ""}
              {recap.volumeDelta.toLocaleString()} kg vs last week
            </Mono>
          )}
          {recap.prs.length > 0 && (
            <Mono s={{ fontSize: 12, display: "block", marginTop: 8 }} c={CHALK}>
              {recap.prs
                .slice(0, 4)
                .map((p) => `${p.lift} ${p.e1rm}kg${p.previous == null ? " (first!)" : ` (+${p.e1rm - p.previous})`}`)
                .join(" · ")}
            </Mono>
          )}
        </Card>
      )}

      {/* FUTURE SELF */}
      {primaryLift && projection && !projection.insufficient && projGoal ? (
        <ChartFrame title={`Future self · ${primaryLift}`} kicker="projected from your behavior" c={VIOLET}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
            <span style={{ ...disp, fontWeight: 800, fontSize: 30, color: CHALK }}>{Math.round(projection.current)}</span>
            <span style={{ color: txt(ASH) }}>→</span>
            <span style={{ ...disp, fontWeight: 800, fontSize: 30, color: txt(VIOLET) }}>
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
        <Card glass style={{ borderLeft: `3px solid ${VIOLET}` }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Future self</Mono>
          <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block", marginTop: 8 }} c={CHALK}>
            Log a lift across a few sessions and we&apos;ll project where you&apos;re headed — your 12-week
            strength, your goal ETA, and how likely you are to hit it.
          </Mono>
        </Card>
      )}

      {/* TWIN mini — only once there's real training to compute it from */}
      {sessions.length > 0 && (
        <Card glass style={{ borderLeft: `3px solid ${BLUE}`, gridColumn: "span 2" }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>
            Performance State · Athlete Twin
          </Mono>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 6 }}>
            <span style={{ ...disp, fontWeight: 800, fontSize: 38, color: txt(hpiColor(state.hpi.band)) }}>{state.hpi.score}</span>
            <Mono s={{ fontSize: 12 }}>HPI · {state.hpi.band} · limiter {state.hpi.limiter}</Mono>
            <div style={{ display: "flex", gap: 14, marginLeft: "auto" }}>
              <Mono s={{ fontSize: 12 }} c={LIME}>STR {state.hpi.components.strength}</Mono>
              <Mono s={{ fontSize: 12 }} c={BLUE}>END {state.hpi.components.endurance}</Mono>
              <Mono s={{ fontSize: 12 }} c={VIOLET}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</Mono>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value, c }: { label: string; value: string; c: string }) {
  return (
    <div>
      <div style={{ ...disp, fontWeight: 800, fontSize: 22, color: txt(c) }}>{value}</div>
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
