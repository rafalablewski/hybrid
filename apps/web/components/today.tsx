"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import {
  prescribeSession,
  computePerformanceState,
  computeInjuryRisk,
  computeAccountability,
  habitStrength,
  projectLift,
  liftNames,
  velocityProfiles,
  toTrainingLog,
  weeklyRecap,
  currentPhase,
  planToday,
  planDayToBlocks,
  type LoggedSession,
  type Biometrics,
  type Macrocycle,
  type SessionBlock,
} from "@hybrid/core";
import ReconciledWeek from "./reconciled-week";
import AskCoach from "./ai-coach";
import { usePersona, useHasActiveCoach } from "@/lib/persona";
import { readIntake, type Intake } from "@/lib/intake";
import {
  LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, ON_ACCENT,
  disp, cond, mono, tip, txt, Mono, Card, Chip, ChartFrame,
} from "@/lib/ui";

const hpiColor = (b: string) =>
  b === "peak" || b === "primed" ? LIME : b === "moderate" ? BLUE : b === "compromised" ? AMBER : RED;
// Injury-risk band → brand color (low good ⇄ high alert). Mirrors the retired
// Dashboard's tissue panel, now folded into Today's Twin card.
const riskColor = (b: string) =>
  b === "low" ? LIME : b === "moderate" ? BLUE : b === "elevated" ? AMBER : RED;
const bandColor = (b: string) =>
  b === "thriving" || b === "steady" ? LIME : b === "new" || b === "wobbling" ? BLUE : b === "at-risk" ? AMBER : RED;
// "new" is the day-one state — show it as "getting started", not the raw key.
const bandLabel = (b: string) => (b === "new" ? "getting started" : b);
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
  planId,
  onStart,
  onNavigate,
}: {
  sessions: LoggedSession[];
  bio?: Biometrics;
  macro?: Macrocycle | null;
  currentWeek?: number;
  planId?: string | null;
  onStart: (planBlocks?: SessionBlock[]) => void;
  /** In-shell navigation (keeps the sidebar) — used by the free plan nudges. */
  onNavigate?: (screen: string) => void;
}) {
  // Casual users get the lean home; athletes/coaches get the deep cockpit cards
  // (This week, Future Self, Twin). Switchable from Settings.
  const isAthlete = usePersona() !== "casual";
  // A coached (free) client: not an athlete, but gets a READ-ONLY view of the
  // plan their coach assigned (see useHasActiveCoach).
  const coached = useHasActiveCoach();
  // The onboarding intake (experience + equipment) tailors the prescription —
  // read client-side after mount to avoid an SSR mismatch.
  const [intake, setIntake] = useState<Intake>({});
  useEffect(() => setIntake(readIntake()), []);
  const log = toTrainingLog(sessions);
  const rx = useMemo(
    () => prescribeSession(log, bio, {
      profiles: velocityProfiles(sessions),
      experience: intake.experience,
      equipment: intake.equipment,
    }),
    [log, bio, sessions, intake.experience, intake.equipment],
  );
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const risk = useMemo(() => computeInjuryRisk(log, bio), [log, bio]);
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
  const strength = useMemo(() => habitStrength(sessions, 3), [sessions]);
  const recap = useMemo(() => weeklyRecap(sessions), [sessions]);

  // Macrocycle context for the "Your plan today" card — derive the current
  // phase/block from the block whose week range contains currentWeek. Graceful
  // when there's no macro (fall back to today's prescription `rx.why`).
  const phase = useMemo(
    () => (macro ? currentPhase(macro, currentWeek) : null),
    [macro, currentWeek],
  );

  // Enrolled in a REAL named plan? Its exact day drives "Your plan today"
  // (cycling by sessions logged), instead of the engine's algorithmic pick.
  const plan = useMemo(() => planToday(planId, sessions.length), [planId, sessions.length]);

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
      {/* PLAN TODAY + AI COACH — a horizontal, scroll-snapping row (swipe right
          for the AI coach). Spans both columns; each card snaps to full width. */}
      <div
        style={{
          gridColumn: "span 2",
          display: "flex",
          gap: 16,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          // hide the native scrollbar — the cards self-document the swipe
          scrollbarWidth: "none",
          margin: "0 -2px",
          padding: "2px",
        }}
      >
        {/* card 1 — Your plan today */}
        {plan ? (
          /* Enrolled in a REAL named plan → its exact day drives the card. */
          <Card glass variant="vibrant" style={{ ...snapCard, borderLeft: `3px solid ${LIME}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
                {/* Free users follow the plan as written; the adaptive readiness
                    layer is the paid upgrade (strip below). */}
                Your plan today{isAthlete ? ` · readiness ${rx.readiness}/100` : " · as written"}
              </Mono>
              <button onClick={() => onStart(planDayToBlocks(plan.items))} style={cta(LIME)}>Start session →</button>
            </div>
            <div style={{ ...disp, fontWeight: 800, fontSize: 26, margin: "8px 0 2px" }}>{plan.planName}</div>
            <Mono s={{ fontSize: 12, display: "block", marginBottom: 8 }} c={VIOLET}>
              {plan.day} · day {plan.dayIndex + 1}/{plan.totalDays}{phase ? ` · ${phase.block.label} wk ${currentWeek}/${macro!.totalWeeks}` : ""}
            </Mono>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {plan.items.map((it, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingTop: 6, borderTop: i ? `1px solid ${LINE}` : "none" }}>
                  <span style={{ ...disp, fontWeight: 600, fontSize: 14, color: txt(CHALK) }}>{it.name}</span>
                  <Mono s={{ fontSize: 12 }}>{it.sr}{it.rpe && it.rpe !== "—" ? ` · RPE ${it.rpe}` : ""}</Mono>
                </div>
              ))}
            </div>
            {!isAthlete && <UpgradeStrip onClick={() => onNavigate?.("upgrade")} />}
          </Card>
        ) : sessions.length === 0 ? (
          <Card glass variant="vibrant" style={{ ...snapCard, borderLeft: `3px solid ${LIME}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
                Your plan today
              </Mono>
              <button onClick={() => onStart()} style={cta(LIME)}>Start session →</button>
            </div>
            <div style={{ ...disp, fontWeight: 800, fontSize: 26, margin: "8px 0 6px" }}>
              {phase ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : "Start your first session"}
            </div>
            {/* Enrolled but not yet logged: show the plan/phase + today's session
                from session zero, so onboarding visibly "did something". */}
            {phase ? (
              <>
                <Mono s={{ fontSize: 11, display: "block", marginBottom: 4 }} c={VIOLET}>
                  Goal: {macro!.goalOrSport} · {phase.block.label} · wk {currentWeek}/{macro!.totalWeeks}
                </Mono>
                <Mono s={{ fontSize: 13, lineHeight: 1.6 }} c={CHALK}>{rx.why}</Mono>
              </>
            ) : (
              <Mono s={{ fontSize: 13, lineHeight: 1.6 }} c={CHALK}>
                Log a workout and your plan, readiness, Athlete Twin and trends all build from your real
                training — nothing here is pre-filled.
              </Mono>
            )}
          </Card>
        ) : (
          <Card glass variant="vibrant" style={{ ...snapCard, borderLeft: `3px solid ${LIME}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
                Your plan today · readiness {rx.readiness}/100
              </Mono>
              <button onClick={() => onStart()} style={cta(LIME)}>Start session →</button>
            </div>
            <div style={{ ...disp, fontWeight: 800, fontSize: 26, margin: "8px 0 6px" }}>
              {rx.blocks[0]?.name}{rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}
            </div>
            {/* surface the macrocycle goal + phase when an athlete is enrolled;
                otherwise fall back to today's prescription rationale. */}
            {phase && (
              <Mono s={{ fontSize: 11, display: "block", marginBottom: 4 }} c={VIOLET}>
                Goal: {macro!.goalOrSport} · {phase.block.label} · wk {currentWeek}/{macro!.totalWeeks}
              </Mono>
            )}
            <Mono s={{ fontSize: 13, lineHeight: 1.6 }} c={CHALK}>{rx.why}</Mono>
          </Card>
        )}

        {/* card 2 — AI coach (swipe right) */}
        <Card glass variant="vibrant" style={{ ...snapCard, borderLeft: `3px solid ${VIOLET}` }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>
            AI coach
          </Mono>
          <div style={{ ...disp, fontWeight: 800, fontSize: 26, margin: "8px 0 6px" }}>Ask your coach</div>
          <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block" }} c={CHALK}>
            Claude reads your real readiness, fatigue and velocity and writes you a personalized note for
            the day — what to push, what to hold back.
          </Mono>
          {/* The AI coach is the paid intelligence layer — casual gets the pitch
              + one upgrade tap, not the working input. */}
          {isAthlete ? (
            <AskCoach />
          ) : (
            <button onClick={() => onNavigate?.("upgrade")} style={{ ...cta(VIOLET), marginTop: 12 }}>✦ Unlock Full →</button>
          )}
        </Card>
      </div>

      {/* BROWSE PLANS — casual users can now follow a pre-built plan for free;
          nudge them to the library when they haven't enrolled in one yet. */}
      {!isAthlete && !plan && (
        <button
          onClick={() => onNavigate?.("plans")}
          style={{
            gridColumn: "span 2", display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 12, padding: "14px 16px", borderRadius: 12, cursor: "pointer", textAlign: "left",
            border: `1px solid ${LIME}55`, background: `${LIME}12`, color: txt(CHALK),
          }}
        >
          <span>
            <span style={{ ...disp, fontWeight: 800, fontSize: 15, display: "block" }}>▤ Follow a plan — free</span>
            <Mono s={{ fontSize: 12, lineHeight: 1.4 }} c={ASH}>Browse the plan library and enroll. Following it is free; periodizing &amp; auto-progression are Full.</Mono>
          </span>
          <span style={{ ...disp, fontWeight: 800, fontSize: 18, color: txt(LIME) }}>→</span>
        </button>
      )}

      {/* SEASON — the macrocycle phase timeline (Base → Build → Peak → Taper),
          absorbed from the retired Dashboard but now driven by the athlete's REAL
          enrolled macro/week instead of demo data. */}
      {isAthlete && macro && phase && (
        <Card glass style={{ borderLeft: `3px solid ${LIME}`, gridColumn: "span 2" }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
            Training for · {macro.goalOrSport} · {phase.block.label} phase
          </Mono>
          <div style={{ ...disp, fontWeight: 900, fontSize: 22, margin: "8px 0 4px" }}>
            Week {currentWeek} of {macro.totalWeeks} · {phase.micro.kind} week · {phase.block.focus.toLowerCase()}
          </div>
          <div style={{ display: "flex", gap: 3, height: 8, borderRadius: 4, overflow: "hidden", marginTop: 12 }}>
            {macro.blocks.map((b) => (
              <div
                key={b.key}
                title={`${b.label} · ${b.weeks} wk`}
                style={{ flex: b.weeks, background: b.key === phase.block.key ? b.color : `${b.color}33` }}
              />
            ))}
          </div>
        </Card>
      )}

      {/* THIS WEEK — the reconciled plan (macrocycle phase arbitrates route + sport).
          Shown from session zero once enrolled, so the plan is visible before the
          first logged workout (it just reads cold-start defaults until then).
          A coached casual client sees the coach-assigned season READ-ONLY (as
          written, no readiness modulation); athletes get the live adaptive one. */}
      {(isAthlete || coached) && macro && (
        <ReconciledWeek macro={macro} currentWeek={currentWeek} sessions={sessions} bio={bio} experience={intake.experience} equipment={intake.equipment} readOnly={!isAthlete} style={{ gridColumn: "span 2" }} />
      )}

      {/* ON TRACK? — accountability */}
      <Card glass style={{ borderLeft: `3px solid ${bandColor(acc.band)}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={bandColor(acc.band)}>
            On track? · {bandLabel(acc.band)}
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

      {/* FUTURE SELF — athlete depth */}
      {isAthlete && (primaryLift && projection && !projection.insufficient && projGoal ? (
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
      ))}

      {/* TWIN mini — athlete depth, once there's real training to compute it from */}
      {isAthlete && sessions.length > 0 && (
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
          {/* INJURY RISK · by tissue — absorbed from the retired Dashboard so the
              tissue-level risk panel isn't lost when the screen goes away. */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
            <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>Injury risk · by tissue</Mono>
            {risk.flagged.length === 0 ? (
              <Mono s={{ fontSize: 12, display: "block", marginTop: 6 }} c={LIME}>No tissues flagged · overall {risk.overall}/100 ({risk.band})</Mono>
            ) : (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {risk.flagged.map((t) => (
                  <div key={t.tissue} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <Chip c={riskColor(t.band)}>{t.risk}</Chip>
                    <Mono s={{ fontSize: 12, textTransform: "capitalize" }} c={CHALK}>{t.tissue}</Mono>
                    <Mono s={{ fontSize: 11 }} c={ASH}>{t.drivers[0]?.label ?? ""}</Mono>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// Free plan card → the single, honest upsell: the plan you follow is free; what
// Full adds is the adaptive layer (loads that auto-adjust to your recovery).
function UpgradeStrip({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: 12, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 10, padding: "9px 12px", borderRadius: 10, cursor: "pointer", textAlign: "left",
        border: `1px solid ${VIOLET}55`, background: `${VIOLET}14`, color: txt(CHALK),
      }}
    >
      <Mono s={{ fontSize: 11.5, lineHeight: 1.4 }} c={CHALK}>
        ✦ Following the plan as written. <span style={{ color: txt(VIOLET) }}>Unlock Full</span> to auto-adjust loads to your recovery.
      </Mono>
      <span style={{ ...disp, fontWeight: 800, fontSize: 15, color: txt(VIOLET) }}>→</span>
    </button>
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

// Each card in the horizontal plan/coach row snaps to (near) full width so one
// card shows at a time and the next is reachable by scrolling right.
const snapCard: CSSProperties = {
  scrollSnapAlign: "start",
  flex: "0 0 100%",
  minWidth: "100%",
  boxSizing: "border-box",
};

function cta(color: string) {
  return {
    ...cond,
    fontSize: 13,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: ".04em",
    color: ON_ACCENT,
    background: color,
    border: "none",
    borderRadius: 10,
    padding: "9px 16px",
    cursor: "pointer",
  };
}
