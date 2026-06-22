"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fs, space,
  prescribeSession,
  computePerformanceState,
  performanceTrajectory,
  computeInjuryRisk,
  computeAccountability,
  habitStrength,
  weeklyRecap,
  currentPhase,
  planToday,
  planDayToBlocks,
  toTrainingLog,
  velocityProfiles,
  ROLE_COLOR,
  readinessRole,
  hpiRole,
  riskRole,
  accountabilityRole,
  type SemanticRole,
  type LoggedSession,
  type Biometrics,
  type Macrocycle,
  type SessionBlock,
} from "@hybrid/core";
import { useSession } from "@/lib/session";
import { useLang } from "@/lib/i18n";
import { usePersona, useHasActiveCoach } from "@/lib/persona";
import { readIntake, type Intake } from "@/lib/intake";
import ReconciledWeek from "../reconciled-week";
import QuickSportLog from "../quick-sport";
import { AuroraIcon } from "./icons";
import AuroraAskCoach from "./ai-coach";

// Brand-band → colour helpers (mirror the classic Today, theme-aware via vars).
const C = (v: string) => `var(--color-${v})`;
// State colours resolve through the SHARED semantic vocabulary (@hybrid/core
// semantic.ts) so web + mobile agree on what a colour means.
const roleColor = (role: SemanticRole) => C(ROLE_COLOR[role]);
const readyColor = (v: number) => roleColor(readinessRole(v));
const hpiColor = (b: string) => roleColor(hpiRole(b));
const riskColor = (b: string) => roleColor(riskRole(b));
const bandColor = (b: string) => roleColor(accountabilityRole(b));
const bandLabel = (b: string, t: (k: string) => string) => (b === "new" ? t("w.home.today.gettingStarted") : b);
const muscleLabel = (m: string, t: (k: string) => string): string => {
  const map: Record<string, string> = {
    quads: t("w.home.today.muscle.quads"),
    glutes: t("w.home.today.muscle.glutes"),
    posterior: t("w.home.today.muscle.posterior"),
    back: t("w.home.today.muscle.back"),
    chest: t("w.home.today.muscle.chest"),
    shoulders: t("w.home.today.muscle.shoulders"),
    triceps: t("w.home.today.muscle.triceps"),
  };
  return map[m] ?? m;
};

/**
 * AURORA Today (web) — the rounded Aurora skin of the full classic Today
 * cockpit, at parity (no feature loss): the horizontally-swipeable Plan today +
 * AI coach pair, the season phase timeline, the reconciled "This week" plan
 * (shared ReconciledWeek), accountability, the weekly recap, and the
 * Performance State + injury-risk-by-tissue panel. Runs the SAME engines as the classic
 * screen; casual users get the lean subset (no season/Performance State), like classic.
 */
export default function AuroraToday({
  sessions,
  bio,
  macro,
  currentWeek = 1,
  planId,
  onStart,
  onNavigate,
  onSaved,
}: {
  sessions: LoggedSession[];
  bio?: Biometrics;
  macro?: Macrocycle | null;
  currentWeek?: number;
  planId?: string | null;
  onStart: (planBlocks?: SessionBlock[]) => void;
  /** In-shell navigation (keeps the sidebar); falls back to a route push. */
  onNavigate?: (screen: string) => void;
  /** Refresh sessions after the quick sport-log widget saves one. */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { t } = useLang();
  const { session } = useSession();
  const name = session?.name ?? "Athlete";
  const isAthlete = usePersona() !== "casual";
  // Coached (free) client: read-only view of the coach-assigned plan.
  const coached = useHasActiveCoach();

  const [intake, setIntake] = useState<Intake>({});
  useEffect(() => setIntake(readIntake()), []);

  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(
    () => prescribeSession(log, bio, { profiles: velocityProfiles(sessions), experience: intake.experience, equipment: intake.equipment }),
    [log, bio, sessions, intake.experience, intake.equipment],
  );
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  // 14-day HPI trajectory (oldest→today) for the Performance State sparkline.
  const hpiSeries = useMemo(() => [...performanceTrajectory(log, 14)].sort((a, b) => b.daysAgo - a.daysAgo).map((p) => p.hpi), [log]);
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
  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 22 } as const;

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)" }}>
      {/* Greeting + search/bell — the greeting is a single quiet line so the
          PLAN (the reason you opened the app) is the hero, not your own name. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: C("ash"), fontSize: fs.note }}>
          {t("w.home.today.hi")} <span style={{ fontWeight: 700, color: C("chalk") }}>{name.split(" ")[0]}</span>
        </div>
        <div style={{ display: "flex", gap: space.ms }}>
          <button onClick={() => (onNavigate ? onNavigate("exercises") : router.push("/exercises"))} style={iconBtn} aria-label={t("w.home.today.searchAria")}><AuroraIcon name="search" size={20} color={C("ash")} /></button>
          <button onClick={() => (onNavigate ? onNavigate("notifications") : router.push("/notifications"))} style={iconBtn} aria-label={t("w.home.today.notificationsAria")}><AuroraIcon name="bell" size={20} color={C("ash")} /></button>
        </div>
      </div>

      {/* PLAN TODAY ⇄ AI COACH — horizontal, scroll-snapping pager. Each card sits
          at ~92% so the next peeks; dots below make the second card discoverable. */}
      <div
        ref={pagerRef}
        onScroll={onPagerScroll}
        style={{ display: "flex", gap: 14, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", marginTop: 14, paddingBottom: 2 }}
      >
        {/* card 1 — Your plan today */}
        <div data-tour="today-plan" style={{ ...card, scrollSnapAlign: "start", flex: "0 0 92%", boxSizing: "border-box", }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>
              {/* Free: follow as written; the readiness-adaptive layer is Full. */}
              {t("w.home.today.yourPlan")}{!(isAthlete && (hasData || plan || phase)) && plan ? t("w.home.today.asWritten") : ""}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: space.ms }}>
              {/* Readiness as a glanceable dial, not "95/100" digits to parse. */}
              {isAthlete && (hasData || plan || phase) ? <Ring value={rx.readiness} color={readyColor(rx.readiness)} /> : null}
              <button
                onClick={() => onStart(plan ? planDayToBlocks(plan.items) : undefined)}
                style={{ background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: "8px 15px", fontWeight: 700, fontSize: fs.body, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {t("w.home.today.start")}
              </button>
            </div>
          </div>
          {plan ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 24, margin: "8px 0 2px" }}>{plan.planName}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("violet"), marginBottom: 10 }}>
                {plan.day} · {t("w.home.today.day")} {plan.dayIndex + 1}/{plan.totalDays}{phase ? ` · ${phase.block.label} ${t("w.home.today.wk")} ${currentWeek}/${macro!.totalWeeks}` : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
                {plan.items.map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: space.md, paddingTop: 6, borderTop: i ? `1px solid ${C("line")}` : "none" }}>
                    <span style={{ fontWeight: 600, fontSize: fs.bodyLg }}>{it.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{it.sr}{it.rpe && it.rpe !== "—" ? ` · RPE ${it.rpe}` : ""}</span>
                  </div>
                ))}
              </div>
              {!isAthlete && (
                <button
                  onClick={() => (onNavigate ? onNavigate("upgrade") : router.push("/upgrade"))}
                  style={{ marginTop: 12, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms, padding: "9px 12px", borderRadius: 999, cursor: "pointer", textAlign: "left", border: `1px solid color-mix(in srgb, ${C("violet")} 55%, transparent)`, background: `color-mix(in srgb, ${C("violet")} 14%, transparent)`, color: C("chalk") }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.4 }}>{t("w.home.today.followingAsWritten1")}<span style={{ color: C("violet") }}>{t("w.home.today.unlockFull")}</span>{t("w.home.today.followingAsWritten2")}</span>
                  <span style={{ fontWeight: 800, fontSize: fs.note, color: C("violet") }}>→</span>
                </button>
              )}
            </>
          ) : hasData || phase ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 24, margin: "8px 0 6px" }}>
                {`${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}`}
              </div>
              {phase && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("violet"), marginBottom: 4 }}>
                  {t("w.home.today.goal")} {macro!.goalOrSport} · {phase.block.label} · {t("w.home.today.wk")} {currentWeek}/{macro!.totalWeeks}
                </div>
              )}
              <div style={{ fontSize: fs.body, lineHeight: 1.6, color: C("chalk") }}>{rx.why}</div>
            </>
          ) : (
            /* Brand-new and not enrolled — first-session chooser (#3): follow a
               plan (free), build your own (Full), or log a one-off. */
            <>
              <div style={{ fontWeight: 800, fontSize: 24, margin: "8px 0 6px" }}>{t("w.home.today.howStart")}</div>
              <div style={{ fontSize: fs.body, lineHeight: 1.6, color: C("chalk"), marginBottom: 12 }}>
                {t("w.home.today.howStartSub")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
                <ChooserRow title={t("w.home.today.chooserFollowTitle")} sub={t("w.home.today.chooserFollowSub")} badge={t("w.home.today.badgeFree")} color={C("lime")} onClick={() => (onNavigate ? onNavigate("plans") : router.push("/(tabs)/plans"))} />
                <ChooserRow title={t("w.home.today.chooserBuildTitle")} sub={t("w.home.today.chooserBuildSub")} badge={t("w.home.today.badgeFull")} color={C("violet")} onClick={() => (onNavigate ? onNavigate("upgrade") : router.push("/upgrade"))} />
                <ChooserRow title={t("w.home.today.chooserLogTitle")} sub={t("w.home.today.chooserLogSub")} badge={t("w.home.today.badgeFree")} color={C("lime")} onClick={() => onStart()} />
              </div>
            </>
          )}
        </div>

        {/* card 2 — AI coach */}
        <div style={{ ...card, scrollSnapAlign: "start", flex: "0 0 92%", boxSizing: "border-box", }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("violet") }}>{t("w.home.today.aiCoach")}</span>
          <div style={{ fontWeight: 800, fontSize: 24, margin: "8px 0 6px" }}>{t("w.home.today.askCoach")}</div>
          <div style={{ fontSize: fs.body, lineHeight: 1.6, color: C("chalk"), marginBottom: 6 }}>
            {t("w.home.today.aiCoachBlurb")}
          </div>
          {/* Paid intelligence — casual sees the pitch + one upgrade tap. */}
          {isAthlete ? (
            <AuroraAskCoach />
          ) : (
            <button
              onClick={() => (onNavigate ? onNavigate("upgrade") : router.push("/upgrade"))}
              style={{ marginTop: 6, background: C("violet"), color: C("ink"), border: "none", borderRadius: 999, padding: "10px 16px", fontWeight: 700, fontSize: fs.body, cursor: "pointer" }}
            >
              {t("w.home.today.unlockFullBtn")}
            </button>
          )}
        </div>
      </div>

      {/* pager dots — a clear "there's more to swipe" affordance */}
      <div style={{ display: "flex", justifyContent: "center", gap: 7, marginTop: 10 }}>
        {[0, 1].map((i) => (
          <span key={i} style={{ width: activeCard === i ? 20 : 7, height: 7, borderRadius: 999, background: activeCard === i ? C("lime") : C("line"), transition: "width .2s" }} />
        ))}
      </div>

      {/* QUICK SPORT LOG — back from a run/match? log it right here, no gear. */}
      <div style={{ marginTop: 18 }}>
        <QuickSportLog sessions={sessions} onSaved={onSaved} />
      </div>

      {/* BROWSE PLANS — free users can follow a pre-built plan; nudge to the library */}
      {!isAthlete && !plan && (
        <button
          onClick={() => (onNavigate ? onNavigate("plans") : router.push("/(tabs)/plans"))}
          style={{ ...card, marginTop: 18, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.md, cursor: "pointer", textAlign: "left", color: C("chalk") }}
        >
          <span>
            <span style={{ fontWeight: 800, fontSize: 17, display: "block" }}>{t("w.home.today.followPlanFree")}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.home.today.followPlanBlurb")}</span>
          </span>
          <span style={{ fontWeight: 800, fontSize: fs.heading, color: C("lime") }}>→</span>
        </button>
      )}

      {/* SEASON — macrocycle phase timeline (athlete, or coached read-only) */}
      {(isAthlete || coached) && macro && phase && (
        <div style={{ ...card, marginTop: 18, }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>
            {t("w.home.today.trainingFor")} {macro.goalOrSport} · {phase.block.label} {t("w.home.today.phase")}
          </span>
          <div style={{ fontWeight: 900, fontSize: fs.heading, margin: "8px 0 4px" }}>
            {t("w.home.today.week")} {currentWeek} {t("w.home.today.of")} {macro.totalWeeks} · {phase.micro.kind} {t("w.home.today.weekWord")} · {phase.block.focus.toLowerCase()}
          </div>
          <div style={{ display: "flex", gap: 3, height: 8, borderRadius: 4, overflow: "hidden", marginTop: 12 }}>
            {macro.blocks.map((b) => (
              <div key={b.key} title={`${b.label} · ${b.weeks} wk`} style={{ flex: b.weeks, background: b.key === phase.block.key ? b.color : `${b.color}33` }} />
            ))}
          </div>
        </div>
      )}

      {/* SEASON BRIEF (free) — periodization is Full, so an enrolled free user
          gets only this read-only glimpse here (the one place they can see it),
          with the full Periodize screen behind the upgrade. (#5 / #7) */}
      {!isAthlete && macro && phase && (() => {
        const pct = Math.round((currentWeek / macro.totalWeeks) * 100);
        // Cumulative week ranges across blocks for the labelled timeline.
        let cursor = 0;
        const ranges = macro.blocks.map((b) => {
          const start = cursor + 1;
          const end = cursor + b.weeks;
          cursor = end;
          return { ...b, start, end };
        });
        return (
        <div style={{ ...card, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: space.ms }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("violet") }}>
              {t("w.home.today.yourSeason")} {macro.goalOrSport}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".1em", textTransform: "uppercase", color: C("violet") }}>✦ Full</span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.heading, letterSpacing: "-.02em", margin: "16px 0 0" }}>
            {phase.block.label} {t("w.home.today.phase")}
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: fs.nano, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash") }}>
              <span>{t("w.home.today.week")} {currentWeek} / {macro.totalWeeks}</span>
              <span style={{ color: C("violet"), fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
            </div>
            <div style={{ display: "flex", gap: 2, height: 8, borderRadius: 4, overflow: "hidden", marginTop: 8, background: C("ink") }}>
              {macro.blocks.map((b) => (
                <div key={b.key} title={`${b.label} · ${b.weeks} wk`} style={{ flex: b.weeks, background: b.key === phase.block.key ? b.color : `${b.color}33` }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 2, marginTop: 7 }}>
              {ranges.map((b) => {
                const cur = b.key === phase.block.key;
                return (
                  <span key={b.key} style={{ flex: b.weeks, overflow: "hidden", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: fs.nano, lineHeight: 1.3, letterSpacing: ".04em", textTransform: "uppercase", color: cur ? C("violet") : C("ash") }}>
                    {b.label}
                    <b style={{ display: "block", fontWeight: 600, color: "inherit" }}>{t("w.home.today.wk")} {b.start === b.end ? b.start : `${b.start}–${b.end}`}</b>
                  </span>
                );
              })}
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: fs.caption, lineHeight: 1.65, color: C("ash"), marginTop: 14, maxWidth: "34ch" }}>
            {t("w.home.today.seasonBriefBody")}
          </div>
          <button onClick={() => (onNavigate ? onNavigate("upgrade") : router.push("/upgrade"))} style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: fs.caption, letterSpacing: ".06em", textTransform: "uppercase", color: C("violet"), cursor: "pointer" }}>
            {t("w.home.today.unlockPeriodization")}
          </button>
        </div>
        );
      })()}

      {/* SELL FULL — what a free user unlocks: the Performance State + the rest of
          the intelligence layer. The Today upsell (#8). */}
      {!isAthlete && (
        <div data-tour="today-upgrade" style={{ ...card, marginTop: 18 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("blue") }}>{t("w.home.today.unlockWithFull")}</span>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20, letterSpacing: "-.02em", margin: "16px 0 0" }}>{t("w.home.today.seePerfState")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 16 }}>
            {[
              { label: "HPI", on: true },
              { label: t("w.home.today.psTag.readiness"), on: false },
              { label: t("w.home.today.psTag.injury"), on: false },
              { label: t("w.home.today.psTag.velocity"), on: false },
              { label: t("w.home.today.psTag.analytics"), on: false },
              { label: t("w.home.today.aiCoach"), on: false },
            ].map((tag) => (
              <span
                key={tag.label}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: fs.micro, fontWeight: 500, letterSpacing: ".05em", textTransform: "uppercase",
                  borderRadius: 999, padding: "6px 10px",
                  color: tag.on ? C("blue") : C("ash"),
                  border: `1px solid ${tag.on ? `color-mix(in srgb, ${C("blue")} 45%, transparent)` : C("line")}`,
                  background: tag.on ? `color-mix(in srgb, ${C("blue")} 10%, transparent)` : "transparent",
                }}
              >
                {tag.label}
              </span>
            ))}
          </div>
          <button onClick={() => (onNavigate ? onNavigate("upgrade") : router.push("/upgrade"))} style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${C("blue")}`, borderRadius: 999, background: "none", padding: "9px 16px", fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: fs.caption, letterSpacing: ".06em", textTransform: "uppercase", color: C("blue"), cursor: "pointer" }}>✦ {t("nav.upgrade")} →</button>
        </div>
      )}

      {/* THIS WEEK — shared reconciled plan; coached clients see it read-only */}
      {(isAthlete || coached) && macro && (
        <div style={{ marginTop: 18 }}>
          <ReconciledWeek macro={macro} currentWeek={currentWeek} sessions={sessions} bio={bio} experience={intake.experience} equipment={intake.equipment} readOnly={!isAthlete} />
        </div>
      )}

      {/* ON TRACK? — accountability */}
      <div style={{ ...card, marginTop: 18, }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: bandColor(acc.band) }}>
            {t("w.home.today.onTrack")} {bandLabel(acc.band, t)}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ink"), background: bandColor(acc.band), borderRadius: 999, padding: "3px 10px" }}>
            {acc.streak.current ? `${acc.streak.current}${t("w.home.today.dayStreak")}` : t("w.home.today.noStreak")}
          </span>
        </div>
        <div style={{ fontWeight: 700, fontSize: fs.title, marginTop: 10 }}>{acc.intervention.headline}</div>
        <div style={{ fontSize: fs.body, lineHeight: 1.6, color: C("chalk"), marginTop: 4 }}>{acc.intervention.message}</div>
        <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
          <Metric label={t("w.home.today.risk")} value={`${acc.risk}`} color={bandColor(acc.band)} />
          <Metric label={t("w.home.today.habitStrength")} value={`${strength}`} color={C("chalk")} />
          <Metric label={t("w.home.today.thisWeek")} value={`${acc.sessionsLast7}/3`} color={C("chalk")} />
        </div>
      </div>

      {/* YOUR WEEK — recap (tap → full Statistics) */}
      {hasData && (
        <button onClick={() => (onNavigate ? onNavigate("statistics") : router.push("/statistics"))} style={{ ...card, marginTop: 18, width: "100%", textAlign: "left", cursor: "pointer", color: C("chalk"), display: "block" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>{t("w.home.today.yourWeek")}</span>
            <div style={{ display: "flex", gap: space.sm }}>
              {recap.prs.length > 0 && <span className="win-pop" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ink"), background: C("lime"), borderRadius: 999, padding: "3px 10px" }}><AuroraIcon name="arrow-up" size={11} strokeWidth={4} color={C("ink")} />{recap.prs.length} PR</span>}
              {recap.cardioPrs.length > 0 && <span className="win-pop" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ink"), background: C("blue"), borderRadius: 999, padding: "3px 10px" }}><AuroraIcon name="location" size={11} strokeWidth={4} color={C("ink")} />{recap.cardioPrs.length} PR</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
            <Metric label={t("w.home.today.sessions")} value={`${recap.sessions}`} color={C("chalk")} />
            <Metric label={t("w.home.today.volume")} value={`${recap.volume.toLocaleString()} kg`} color={C("lime")} />
            <Metric label={t("w.home.today.sets")} value={`${recap.sets}`} color={C("chalk")} />
            {recap.distanceKm > 0 && <Metric label={t("w.home.today.distance")} value={`${recap.distanceKm} km`} color={C("blue")} />}
            <Metric label={t("w.home.today.activeDays")} value={`${recap.activeDays}`} color={C("chalk")} />
            {recap.topMuscle && <Metric label={t("w.home.today.topMuscle")} value={muscleLabel(recap.topMuscle.muscle, t)} color={C("blue")} />}
          </div>
          {recap.prs.length > 0 && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("chalk"), marginTop: 8 }}>
              {recap.prs.slice(0, 4).map((p) => `${p.lift} ${p.e1rm}kg${p.previous == null ? ` (${t("w.home.today.first")})` : ` (+${p.e1rm - p.previous})`}`).join(" · ")}
            </div>
          )}
        </button>
      )}

      {/* PERFORMANCE STATE + injury risk by tissue */}
      {isAthlete && hasData && (
        <div style={{ ...card, marginTop: 18, }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("blue") }}>{t("w.home.today.perfState")}</span>
          <div style={{ display: "flex", alignItems: "center", gap: space.md, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 38, color: hpiColor(state.hpi.band) }}>{state.hpi.score}</span>
            <div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>HPI · {state.hpi.band} · {t("w.home.today.limiter")} {state.hpi.limiter}</span>
              {/* 14-day trend — direction at a glance, not just today's number. */}
              <div style={{ marginTop: 4, maxWidth: 180 }}><Spark series={hpiSeries} color={hpiColor(state.hpi.band)} /></div>
            </div>
            <div style={{ display: "flex", gap: 14, marginLeft: "auto" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("lime") }}>STR {state.hpi.components.strength}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("blue") }}>END {state.hpi.components.endurance}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("violet") }}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</span>
            </div>
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{t("w.home.today.injuryRisk")}</span>
            {risk.flagged.length === 0 ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("lime"), marginTop: 6 }}>{t("w.home.today.noTissues")} {risk.overall}/100 ({risk.band})</div>
            ) : (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: space.xs }}>
                {risk.flagged.map((t) => (
                  <div key={t.tissue} style={{ display: "flex", gap: space.sm, alignItems: "baseline" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ink"), background: riskColor(t.band), borderRadius: 999, padding: "2px 9px" }}>{t.risk}</span>
                    <span style={{ fontSize: fs.caption, textTransform: "capitalize" }}>{t.tissue}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{t.drivers[0]?.label ?? ""}</span>
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

// One row of the first-session chooser (#3): a tappable option with a title, a
// one-line sub, and a Free/Full badge.
function ChooserRow({ title, sub, badge, color, onClick }: { title: string; sub: string; badge: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.md, padding: "12px 14px", borderRadius: 14, cursor: "pointer", textAlign: "left", border: `1px solid ${C("line")}`, background: `color-mix(in srgb, ${color} 8%, transparent)`, color: C("chalk") }}
    >
      <span>
        <span style={{ fontWeight: 800, fontSize: fs.note, display: "block" }}>{title}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{sub}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: space.sm }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color, background: `color-mix(in srgb, ${color} 16%, transparent)`, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{badge}</span>
        <span style={{ fontWeight: 800, fontSize: fs.title, color }}>→</span>
      </span>
    </button>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 22, color }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-ash)" }}>{label}</div>
    </div>
  );
}

/** Readiness/score dial — a conic-gradient ring with the number in the middle,
 *  so a headline figure reads as a shape at a glance, not digits to parse. */
function Ring({ value, color, size = 44 }: { value: number; color: string; size?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const inner = size - 12;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `conic-gradient(${color} ${pct * 3.6}deg, ${C("line")} 0)`, display: "grid", placeItems: "center", flexShrink: 0 }}>
      <div style={{ width: inner, height: inner, borderRadius: "50%", background: C("ink2"), display: "grid", placeItems: "center", fontWeight: 800, fontSize: fs.body, color: C("chalk") }}>{Math.round(value)}</div>
    </div>
  );
}

/** Dependency-free sparkline — scaled bars, latest highlighted. */
function Spark({ series, color, height = 22 }: { series: number[]; color: string; height?: number }) {
  if (series.length < 2) return null;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
      {series.map((v, i) => (
        <div key={i} style={{ flex: 1, height: 4 + ((v - min) / range) * (height - 4), borderRadius: 2, background: i === series.length - 1 ? color : `color-mix(in srgb, ${color} 40%, transparent)` }} />
      ))}
    </div>
  );
}
