"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  prescribeSession,
  computePerformanceState,
  computeInjuryRisk,
  computeAccountability,
  habitStrength,
  weeklyRecap,
  currentPhase,
  planToday,
  planDayToBlocks,
  toTrainingLog,
  velocityProfiles,
  type LoggedSession,
  type Biometrics,
  type Macrocycle,
  type SessionBlock,
} from "@hybrid/core";
import { useSession } from "@/lib/session";
import { usePersona } from "@/lib/persona";
import { readIntake, type Intake } from "@/lib/intake";
import ReconciledWeek from "../reconciled-week";
import { AuroraIcon } from "./icons";
import AuroraAskCoach from "./ai-coach";

// Brand-band → colour helpers (mirror the classic Today, theme-aware via vars).
const C = (v: string) => `var(--color-${v})`;
const hpiColor = (b: string) => (b === "peak" || b === "primed" ? C("lime") : b === "moderate" ? C("blue") : b === "compromised" ? C("amber") : C("red"));
const riskColor = (b: string) => (b === "low" ? C("lime") : b === "moderate" ? C("blue") : b === "elevated" ? C("amber") : C("red"));
const bandColor = (b: string) => (b === "thriving" || b === "steady" ? C("lime") : b === "new" || b === "wobbling" ? C("blue") : b === "at-risk" ? C("amber") : C("red"));
const bandLabel = (b: string) => (b === "new" ? "getting started" : b);
const MUSCLE_LABEL: Record<string, string> = { quads: "Quads", glutes: "Glutes", posterior: "Posterior chain", back: "Back", chest: "Chest", shoulders: "Shoulders", triceps: "Triceps" };

/**
 * AURORA Today (web) — the rounded Aurora skin of the full classic Today
 * cockpit, at parity (no feature loss): the horizontally-swipeable Plan today +
 * AI coach pair, the season phase timeline, the reconciled "This week" plan
 * (shared ReconciledWeek), accountability, the weekly recap, and the Athlete
 * Twin + injury-risk-by-tissue panel. Runs the SAME engines as the classic
 * screen; casual users get the lean subset (no season/Twin), like classic.
 */
export default function AuroraToday({
  sessions,
  bio,
  macro,
  currentWeek = 1,
  planId,
  onStart,
}: {
  sessions: LoggedSession[];
  bio?: Biometrics;
  macro?: Macrocycle | null;
  currentWeek?: number;
  planId?: string | null;
  onStart: (planBlocks?: SessionBlock[]) => void;
}) {
  const router = useRouter();
  const { session } = useSession();
  const name = session?.name ?? "Athlete";
  const isAthlete = usePersona() !== "casual";

  const [intake, setIntake] = useState<Intake>({});
  useEffect(() => setIntake(readIntake()), []);

  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(
    () => prescribeSession(log, bio, { profiles: velocityProfiles(sessions), experience: intake.experience, equipment: intake.equipment }),
    [log, bio, sessions, intake.experience, intake.equipment],
  );
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const risk = useMemo(() => computeInjuryRisk(log, bio), [log, bio]);
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
  const strength = useMemo(() => habitStrength(sessions, 3), [sessions]);
  const recap = useMemo(() => weeklyRecap(sessions), [sessions]);
  const phase = useMemo(() => (macro ? currentPhase(macro, currentWeek) : null), [macro, currentWeek]);
  const plan = useMemo(() => planToday(planId, sessions.length), [planId, sessions.length]);
  const hasData = sessions.length > 0;

  // Horizontal pager (Plan today ⇄ AI coach) — track the active card so the dots
  // below clearly signal there's a second card to swipe to.
  const pagerRef = useRef<HTMLDivElement>(null);
  const [activeCard, setActiveCard] = useState(0);
  const onPagerScroll = () => {
    const el = pagerRef.current;
    if (!el) return;
    setActiveCard(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  const iconBtn = { width: 44, height: 44, borderRadius: "50%", background: C("ink2"), border: `1px solid ${C("line")}`, display: "grid", placeItems: "center", cursor: "pointer" } as const;
  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 24, padding: 22 } as const;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", fontFamily: "var(--font-display)" }}>
      {/* Greeting + search/bell */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: C("ash"), fontSize: 16 }}>Hi,</div>
          <div style={{ fontWeight: 900, fontSize: 30, letterSpacing: "-.02em" }}>{name}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={iconBtn}><AuroraIcon name="search" size={22} color={C("ash")} /></div>
          <button onClick={() => router.push("/notifications")} style={iconBtn} aria-label="Notifications"><AuroraIcon name="bell" size={22} color={C("ash")} /></button>
        </div>
      </div>

      {/* PLAN TODAY ⇄ AI COACH — horizontal, scroll-snapping pager. Each card sits
          at ~92% so the next peeks; dots below make the second card discoverable. */}
      <div
        ref={pagerRef}
        onScroll={onPagerScroll}
        style={{ display: "flex", gap: 14, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", marginTop: 20, paddingBottom: 2 }}
      >
        {/* card 1 — Your plan today */}
        <div style={{ ...card, scrollSnapAlign: "start", flex: "0 0 92%", boxSizing: "border-box", borderLeft: `3px solid ${C("lime")}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>
              Your plan today{hasData || plan || phase ? ` · readiness ${rx.readiness}/100` : ""}
            </span>
            <button
              onClick={() => onStart(plan ? planDayToBlocks(plan.items) : undefined)}
              style={{ background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: "8px 15px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Start →
            </button>
          </div>
          {plan ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 24, margin: "8px 0 2px" }}>{plan.planName}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("violet"), marginBottom: 10 }}>
                {plan.day} · day {plan.dayIndex + 1}/{plan.totalDays}{phase ? ` · ${phase.block.label} wk ${currentWeek}/${macro!.totalWeeks}` : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {plan.items.map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingTop: 6, borderTop: i ? `1px solid ${C("line")}` : "none" }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{it.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash") }}>{it.sr}{it.rpe && it.rpe !== "—" ? ` · RPE ${it.rpe}` : ""}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800, fontSize: 24, margin: "8px 0 6px" }}>
                {hasData || phase ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : "Start your first session"}
              </div>
              {phase && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("violet"), marginBottom: 4 }}>
                  Goal: {macro!.goalOrSport} · {phase.block.label} · wk {currentWeek}/{macro!.totalWeeks}
                </div>
              )}
              <div style={{ fontSize: 13, lineHeight: 1.6, color: C("chalk") }}>
                {hasData || phase ? rx.why : "Log a workout and your plan, readiness, Athlete Twin and trends all build from your real training — nothing here is pre-filled."}
              </div>
            </>
          )}
        </div>

        {/* card 2 — AI coach */}
        <div style={{ ...card, scrollSnapAlign: "start", flex: "0 0 92%", boxSizing: "border-box", borderLeft: `3px solid ${C("violet")}` }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("violet") }}>AI coach</span>
          <div style={{ fontWeight: 800, fontSize: 24, margin: "8px 0 6px" }}>Ask your coach</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: C("chalk"), marginBottom: 6 }}>
            Claude reads your real readiness, fatigue and velocity and writes you a personalized note for the day — what to push, what to hold back.
          </div>
          <AuroraAskCoach />
        </div>
      </div>

      {/* pager dots — a clear "there's more to swipe" affordance */}
      <div style={{ display: "flex", justifyContent: "center", gap: 7, marginTop: 10 }}>
        {[0, 1].map((i) => (
          <span key={i} style={{ width: activeCard === i ? 20 : 7, height: 7, borderRadius: 999, background: activeCard === i ? C("lime") : C("line"), transition: "width .2s" }} />
        ))}
      </div>

      {/* SEASON — macrocycle phase timeline (athlete + enrolled) */}
      {isAthlete && macro && phase && (
        <div style={{ ...card, marginTop: 18, borderLeft: `3px solid ${C("lime")}` }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>
            Training for · {macro.goalOrSport} · {phase.block.label} phase
          </span>
          <div style={{ fontWeight: 900, fontSize: 20, margin: "8px 0 4px" }}>
            Week {currentWeek} of {macro.totalWeeks} · {phase.micro.kind} week · {phase.block.focus.toLowerCase()}
          </div>
          <div style={{ display: "flex", gap: 3, height: 8, borderRadius: 4, overflow: "hidden", marginTop: 12 }}>
            {macro.blocks.map((b) => (
              <div key={b.key} title={`${b.label} · ${b.weeks} wk`} style={{ flex: b.weeks, background: b.key === phase.block.key ? b.color : `${b.color}33` }} />
            ))}
          </div>
        </div>
      )}

      {/* THIS WEEK — the shared reconciled plan (rounds under Aurora via --r-card) */}
      {isAthlete && macro && (
        <div style={{ marginTop: 18 }}>
          <ReconciledWeek macro={macro} currentWeek={currentWeek} sessions={sessions} bio={bio} experience={intake.experience} equipment={intake.equipment} />
        </div>
      )}

      {/* ON TRACK? — accountability */}
      <div style={{ ...card, marginTop: 18, borderLeft: `3px solid ${bandColor(acc.band)}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: bandColor(acc.band) }}>
            On track? · {bandLabel(acc.band)}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ink"), background: bandColor(acc.band), borderRadius: 999, padding: "3px 10px" }}>
            {acc.streak.current ? `${acc.streak.current}-day streak` : "no streak yet"}
          </span>
        </div>
        <div style={{ fontWeight: 700, fontSize: 18, marginTop: 10 }}>{acc.intervention.headline}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: C("chalk"), marginTop: 4 }}>{acc.intervention.message}</div>
        <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
          <Metric label="Risk" value={`${acc.risk}`} color={bandColor(acc.band)} />
          <Metric label="Habit strength" value={`${strength}`} color={C("chalk")} />
          <Metric label="This week" value={`${acc.sessionsLast7}/3`} color={C("chalk")} />
        </div>
      </div>

      {/* YOUR WEEK — recap (tap → full Statistics) */}
      {hasData && (
        <button onClick={() => router.push("/statistics")} style={{ ...card, marginTop: 18, borderLeft: `3px solid ${C("lime")}`, width: "100%", textAlign: "left", cursor: "pointer", color: C("chalk"), display: "block" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>Your week</span>
            <div style={{ display: "flex", gap: 8 }}>
              {recap.prs.length > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ink"), background: C("lime"), borderRadius: 999, padding: "3px 10px" }}>🏆 {recap.prs.length} PR</span>}
              {recap.cardioPrs.length > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ink"), background: C("blue"), borderRadius: 999, padding: "3px 10px" }}>🏃 {recap.cardioPrs.length} PR</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
            <Metric label="Sessions" value={`${recap.sessions}`} color={C("chalk")} />
            <Metric label="Volume" value={`${recap.volume.toLocaleString()} kg`} color={C("lime")} />
            <Metric label="Sets" value={`${recap.sets}`} color={C("chalk")} />
            {recap.distanceKm > 0 && <Metric label="Distance" value={`${recap.distanceKm} km`} color={C("blue")} />}
            <Metric label="Active days" value={`${recap.activeDays}`} color={C("chalk")} />
            {recap.topMuscle && <Metric label="Top muscle" value={MUSCLE_LABEL[recap.topMuscle.muscle] ?? recap.topMuscle.muscle} color={C("blue")} />}
          </div>
          {recap.prs.length > 0 && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("chalk"), marginTop: 8 }}>
              {recap.prs.slice(0, 4).map((p) => `${p.lift} ${p.e1rm}kg${p.previous == null ? " (first!)" : ` (+${p.e1rm - p.previous})`}`).join(" · ")}
            </div>
          )}
        </button>
      )}

      {/* PERFORMANCE STATE · ATHLETE TWIN + injury risk by tissue */}
      {isAthlete && hasData && (
        <div style={{ ...card, marginTop: 18, borderLeft: `3px solid ${C("blue")}` }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("blue") }}>Performance State · Athlete Twin</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 38, color: hpiColor(state.hpi.band) }}>{state.hpi.score}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash") }}>HPI · {state.hpi.band} · limiter {state.hpi.limiter}</span>
            <div style={{ display: "flex", gap: 14, marginLeft: "auto" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("lime") }}>STR {state.hpi.components.strength}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("blue") }}>END {state.hpi.components.endurance}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("violet") }}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</span>
            </div>
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>Injury risk · by tissue</span>
            {risk.flagged.length === 0 ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("lime"), marginTop: 6 }}>No tissues flagged · overall {risk.overall}/100 ({risk.band})</div>
            ) : (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {risk.flagged.map((t) => (
                  <div key={t.tissue} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ink"), background: riskColor(t.band), borderRadius: 999, padding: "2px 9px" }}>{t.risk}</span>
                    <span style={{ fontSize: 12, textTransform: "capitalize" }}>{t.tissue}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>{t.drivers[0]?.label ?? ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 22, color }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-ash)" }}>{label}</div>
    </div>
  );
}
