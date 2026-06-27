"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fs, space,
  prescribeSession,
  computeAccountability,
  weekAdherence,
  trainingDaysPerWeek,
  buildActivityFeed,
  currentPhase,
  planToday,
  planDayToBlocks,
  srSingleReps,
  toTrainingLog,
  velocityProfiles,
  ROLE_COLOR,
  SECTION_COLOR,
  readinessRole,
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
import TodayWidgets from "./today-quick";
import CoachRail from "./coach-rail";
import FeedPreview from "./feed-preview";
import Stories from "./stories";
import { AuroraIcon } from "./icons";
import AuroraAskCoach from "./ai-coach";
import { useCollapsible } from "@/lib/use-collapsible";

// Brand-band → colour helpers (mirror the classic Today, theme-aware via vars).
const C = (v: string) => `var(--color-${v})`;
const roleColor = (role: SemanticRole) => C(ROLE_COLOR[role]);
const readyColor = (v: number) => roleColor(readinessRole(v));

/**
 * AURORA Today (web) — the DAILY GUIDED LOOP. Today answers "what do I do, how do
 * I feel, what's my circle up to?" and walks the athlete through it top to
 * bottom: Train (today's session + AI coach note) → Recover/Feel (a slim
 * on-track strip + the check-in & nutrition SQUARE widgets) → Plan (this week) →
 * Connect (coaches + friends' feed). The strategic/analytical layer — Performance
 * Twin (HPI), readiness & injury risk, the season timeline and the weekly recap —
 * lives on the COCKPIT now (athlete command center), so the two screens no longer
 * duplicate each other. Casual users get the same lean daily loop. Mirrored on
 * mobile (aurora/home.tsx).
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
  loading = false,
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
  /** True while the first sessions fetch is in flight — suppresses the
   *  cold-start chooser so returning athletes don't see a false flash. */
  loading?: boolean;
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
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
  // Target = the athlete's real weekly cadence (not a flat 3), floored at done.
  const adherence = useMemo(() => weekAdherence(sessions, trainingDaysPerWeek(sessions, { fallback: 3 })), [sessions]);
  const phase = useMemo(() => (macro ? currentPhase(macro, currentWeek) : null), [macro, currentWeek]);
  const plan = useMemo(() => planToday(planId, sessions.length), [planId, sessions.length]);
  const hasData = sessions.length > 0;

  const initials = useMemo(
    () => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "A",
    [name],
  );
  const notifCount = useMemo(() => buildActivityFeed({ sessions }).length, [sessions]);

  // Time-of-day greeting + date — computed on the client (in an effect) so the
  // server-rendered markup doesn't mismatch the clock on hydration.
  const [greeting, setGreeting] = useState("");
  const [dateStr, setDateStr] = useState("");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(t(h < 12 ? "w.home.today.greetMorning" : h < 18 ? "w.home.today.greetAfternoon" : "w.home.today.greetEvening"));
    setDateStr(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }));
  }, [t]);

  // Plan today ⇄ AI coach pager — track the active card so the dots signal the swipe.
  const pagerRef = useRef<HTMLDivElement>(null);
  const [activeCard, setActiveCard] = useState(0);
  const onPagerScroll = () => {
    const el = pagerRef.current;
    if (!el) return;
    setActiveCard(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  // THIS WEEK collapse state — persisted so the choice sticks across visits.
  const week = useCollapsible("hybrid.today.week");

  const iconBtn = { position: "relative", width: 44, height: 44, borderRadius: 14, background: C("ink2"), border: `1px solid ${C("line")}`, display: "grid", placeItems: "center", cursor: "pointer" } as const;
  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 22 } as const;

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)" }}>
      {/* HEADER — profile · HYBRID wordmark · bell */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          onClick={() => (onNavigate ? onNavigate("profile") : router.push("/profile"))}
          aria-label={t("w.home.today.profileAria")}
          style={{ position: "relative", width: 44, height: 44, borderRadius: 14, background: `${C("lime")}22`, border: `1px solid ${C("lime")}`, display: "grid", placeItems: "center", cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: fs.bodyLg, color: "var(--lime-text)" }}
        >
          {initials}
          <span style={{ position: "absolute", bottom: -3, right: -3, width: 12, height: 12, borderRadius: "50%", background: C("lime"), border: `2.5px solid ${C("ink")}` }} />
        </button>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
          <div style={{ fontWeight: 900, fontSize: 19, letterSpacing: "-.03em", lineHeight: 1, color: C("chalk") }}>
            HYBRID<span style={{ color: "var(--lime-text)" }}>.</span>
          </div>
          <div style={{ width: 26, height: 3, borderRadius: 2, background: C("lime") }} />
        </div>
        <button onClick={() => (onNavigate ? onNavigate("notifications") : router.push("/notifications"))} style={iconBtn} aria-label={t("w.home.today.notificationsAria")}>
          <AuroraIcon name="bell" size={20} color={C("ash")} />
          {notifCount > 0 && (
            <span style={{ position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 9, background: C("red"), border: `2px solid ${C("ink")}`, display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "#fff" }}>
              {notifCount > 9 ? "9+" : notifCount}
            </span>
          )}
        </button>
      </div>

      {/* STORIES — circle avatars (IG-style); leads with "Your story" */}
      <Stories you={initials} youLabel={t("w.home.today.storyYou")} onOpen={() => (onNavigate ? onNavigate("feed") : router.push("/feed"))} />

      {/* GREETING + streak — sets the daily tone */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 2px 2px", gap: space.sm }}>
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, color: C("chalk") }}>{greeting ? `${greeting}, ${name.split(/\s+/)[0]}` : ` `}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>{dateStr || " "}</div>
        </div>
        {acc.streak.current > 0 && (
          // SPECTRUM: the streak wears the warm terracotta accent (Connect) — it
          // pairs with the 🔥 and keeps chartreuse reserved for the primary action.
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `color-mix(in srgb, ${C("red")} 14%, transparent)`, color: "var(--red-text)", border: `1px solid color-mix(in srgb, ${C("red")} 40%, transparent)`, borderRadius: 999, padding: "4px 11px", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
            🔥 {acc.streak.current}{t("w.home.today.dayStreak")}
          </span>
        )}
      </div>

      {/* ───── TRAIN ───── */}
      <Kicker k={t("w.home.today.kTrain")} h={t("w.home.today.kSession")} color={C(SECTION_COLOR.train)} />

      {/* PLAN TODAY ⇄ AI COACH — horizontal, scroll-snapping pager */}
      <div
        ref={pagerRef}
        onScroll={onPagerScroll}
        style={{ display: "flex", gap: 14, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", paddingBottom: 2 }}
      >
        {/* card 1 — Your plan today */}
        <div data-tour="today-plan" style={{ ...card, scrollSnapAlign: "start", flex: "0 0 92%", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>
              {t("w.home.today.yourPlan")}{!(isAthlete && (hasData || plan || phase)) && plan ? t("w.home.today.asWritten") : ""}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: space.ms }}>
              {isAthlete && (hasData || plan || phase) ? <Ring value={rx.readiness} color={readyColor(rx.readiness)} /> : null}
              <button
                onClick={() => onStart(plan ? planDayToBlocks(plan.items) : hasData || phase ? (rx.blocks as SessionBlock[]) : undefined)}
                style={{ background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: "8px 15px", fontWeight: 700, fontSize: fs.body, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {t("w.home.today.start")}
              </button>
            </div>
          </div>
          {plan ? (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24, margin: "8px 0 2px" }}>{plan.planName}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginBottom: 10 }}>
                {plan.day} · {t("w.home.today.day")} {plan.dayIndex + 1}/{plan.totalDays}{phase ? ` · ${phase.block.label} ${t("w.home.today.wk")} ${currentWeek}/${macro!.totalWeeks}` : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
                {plan.items.map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: space.md, paddingTop: 6, borderTop: i ? `1px solid ${C("line")}` : "none" }}>
                    <span style={{ fontWeight: 600, fontSize: fs.bodyLg }}>{it.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{srSingleReps(it.sr)}{it.rpe && it.rpe !== "—" ? ` · RPE ${it.rpe}` : ""}</span>
                  </div>
                ))}
              </div>
              {!isAthlete && (
                <button
                  onClick={() => (onNavigate ? onNavigate("upgrade") : router.push("/upgrade"))}
                  style={{ marginTop: 12, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms, padding: "9px 12px", borderRadius: 999, cursor: "pointer", textAlign: "left", border: `1px solid color-mix(in srgb, ${C("lime")} 55%, transparent)`, background: `color-mix(in srgb, ${C("lime")} 14%, transparent)`, color: C("chalk") }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.4 }}>{t("w.home.today.followingAsWritten1")}<span style={{ color: "var(--lime-text)" }}>{t("w.home.today.unlockFull")}</span>{t("w.home.today.followingAsWritten2")}</span>
                  <span style={{ fontWeight: 800, fontSize: fs.note, color: "var(--lime-text)" }}>→</span>
                </button>
              )}
            </>
          ) : hasData || phase ? (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24, margin: "8px 0 6px" }}>
                {`${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}`}
              </div>
              {phase && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginBottom: 4 }}>
                  {t("w.home.today.goal")} {macro!.goalOrSport} · {phase.block.label} · {t("w.home.today.wk")} {currentWeek}/{macro!.totalWeeks}
                </div>
              )}
              <div style={{ fontSize: fs.body, lineHeight: 1.6, color: C("chalk") }}>{rx.why}</div>
            </>
          ) : loading ? (
            <>
              <div style={{ height: 24, width: "60%", borderRadius: 8, background: C("line"), opacity: 0.5, margin: "8px 0 10px" }} />
              <div style={{ height: 12, width: "90%", borderRadius: 6, background: C("line"), opacity: 0.35 }} />
            </>
          ) : (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24, margin: "8px 0 6px" }}>{t("w.home.today.howStart")}</div>
              <div style={{ fontSize: fs.body, lineHeight: 1.6, color: C("chalk"), marginBottom: 12 }}>
                {t("w.home.today.howStartSub")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
                <ChooserRow title={t("w.home.today.chooserFollowTitle")} sub={t("w.home.today.chooserFollowSub")} badge={t("w.home.today.badgeFree")} color={C("lime")} onClick={() => (onNavigate ? onNavigate("plans") : router.push("/(tabs)/plans"))} />
                <ChooserRow title={t("w.home.today.chooserBuildTitle")} sub={t("w.home.today.chooserBuildSub")} badge={t("w.home.today.badgeFree")} color={C("lime")} onClick={() => (onNavigate ? onNavigate("builder") : router.push("/builder"))} />
                <ChooserRow title={t("w.home.today.chooserLogTitle")} sub={t("w.home.today.chooserLogSub")} badge={t("w.home.today.badgeFree")} color={C("lime")} onClick={() => onStart()} />
              </div>
            </>
          )}
        </div>

        {/* card 2 — AI coach */}
        <div style={{ ...card, scrollSnapAlign: "start", flex: "0 0 92%", boxSizing: "border-box" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{t("w.home.today.aiCoach")}</span>
          <div style={{ fontWeight: 800, fontSize: 24, margin: "8px 0 6px" }}>{t("w.home.today.askCoach")}</div>
          <div style={{ fontSize: fs.body, lineHeight: 1.6, color: C("chalk"), marginBottom: 6 }}>
            {t("w.home.today.aiCoachBlurb")}
          </div>
          {isAthlete ? (
            <AuroraAskCoach />
          ) : (
            <button
              onClick={() => (onNavigate ? onNavigate("upgrade") : router.push("/upgrade"))}
              style={{ marginTop: 6, background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: "10px 16px", fontWeight: 700, fontSize: fs.body, cursor: "pointer" }}
            >
              {t("w.home.today.unlockFullBtn")}
            </button>
          )}
        </div>
      </div>

      {/* pager dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 7, marginTop: 10 }}>
        {[0, 1].map((i) => (
          <span key={i} style={{ width: activeCard === i ? 20 : 7, height: 7, borderRadius: 999, background: activeCard === i ? C("lime") : C("line"), transition: "width .2s" }} />
        ))}
      </div>

      {/* QUICK LOG — back from a run/match? one-tap carousel, log it right here. */}
      <Kicker k={t("w.home.today.kQuick")} h={t("w.home.today.kQuickH")} color={C(SECTION_COLOR.train)} />
      <QuickSportLog sessions={sessions} onSaved={onSaved} solid />

      {/* ───── RECOVER · FEEL ───── */}
      <Kicker k={t("w.home.today.kFeel")} h={t("w.home.today.kFeelH")} color={C(SECTION_COLOR.feel)} />

      {/* CHECK-IN + NUTRITION — square iPhone-style widgets (tap → full screen) */}
      <TodayWidgets onNavigate={onNavigate} />

      {/* ───── PLAN ───── */}
      <Kicker k={t("w.home.today.kPlan")} h={t("w.home.today.kWeekH")} color={C(SECTION_COLOR.plan)} />

      {/* WEEK ADHERENCE — glanceable Mon→Sun strip; the one collapsible card */}
      <WeekStrip
        title={phase ? `${t("w.home.today.week")} ${currentWeek} · ${phase.block.label}` : t("w.home.today.kWeekH")}
        doneLabel={`${adherence.done} ${t("w.home.today.of")} ${adherence.target} ${t("w.home.today.w.done")}`}
        days={adherence.days}
        open={!week.collapsed}
        onToggle={week.toggle}
      />

      {/* THIS WEEK — shared reconciled plan (always shown); coached read-only */}
      {(isAthlete || coached) && macro ? (
        <ReconciledWeek macro={macro} currentWeek={currentWeek} sessions={sessions} bio={bio} experience={intake.experience} equipment={intake.equipment} readOnly={!isAthlete} />
      ) : (
        <button
          onClick={() => (onNavigate ? onNavigate("plans") : router.push("/(tabs)/plans"))}
          style={{ ...card, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.md, cursor: "pointer", textAlign: "left", color: C("chalk") }}
        >
          <span>
            <span style={{ fontWeight: 800, fontSize: 17, display: "block" }}>{t("w.home.today.followPlanFree")}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.home.today.followPlanBlurb")}</span>
          </span>
          <span style={{ fontWeight: 800, fontSize: fs.heading, color: C("lime") }}>→</span>
        </button>
      )}

      {/* ───── CONNECT ───── (feed first — your circle's momentum) */}
      <Kicker k={t("w.home.today.kConnect")} h={t("w.home.today.kConnectH")} color={C(SECTION_COLOR.connect)} />

      {/* FEED STRIP — a few of your circle's latest */}
      <FeedPreview onOpen={() => (onNavigate ? onNavigate("feed") : router.push("/feed"))} />

      {/* ───── DISCOVER ───── (coaches last — exploratory, not daily) */}
      <Kicker k={t("w.home.today.kDiscover")} h={t("w.home.today.kDiscoverH")} color={C(SECTION_COLOR.connect)} />

      {/* FOLLOW A COACH — swipeable rail of marketplace coaches */}
      <CoachRail onOpen={() => (onNavigate ? onNavigate("coaches") : router.push("/coaches"))} />
    </div>
  );
}

// A section kicker — guides the daily flow (Train → Feel → Plan → Connect).
function Kicker({ k, h, color }: { k: string; h: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "26px 2px 12px" }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash") }}>{k}</span>
      {/* heading shares the EXACT same font as the kicker label (k) */}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash"), marginLeft: "auto" }}>{h}</span>
    </div>
  );
}

// One row of the first-session chooser: a tappable option with title, sub, badge.
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

/** Readiness/score dial — a ring of TICK MARKS (lit up to the value) with the
 *  number in the middle, matching the mobile kit Ring so web + mobile read the
 *  same. The ticks are the "number effect" from the original Your Plan Today. */
function Ring({ value, color, size = 44, ticks = 32 }: { value: number; color: string; size?: number; ticks?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const lit = Math.round((pct / 100) * ticks);
  const tickLen = Math.max(4, Math.round(size * 0.16));
  const tickW = Math.max(2, Math.round(size * 0.045));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "grid", placeItems: "center" }}>
      {Array.from({ length: ticks }).map((_, i) => (
        <span key={i} style={{ position: "absolute", top: 0, left: "50%", width: tickW, height: size / 2, transformOrigin: "bottom center", transform: `translateX(-50%) rotate(${(i / ticks) * 360}deg)` }}>
          <span style={{ display: "block", width: tickW, height: tickLen, borderRadius: tickW, background: i < lit ? color : C("line") }} />
        </span>
      ))}
      <span style={{ position: "relative", fontWeight: 800, fontSize: fs.body, color: C("chalk") }}>{Math.round(value)}</span>
    </div>
  );
}

/** WEEK ADHERENCE strip — a collapsible card with the Mon→Sun day cells (done /
 *  today / missed / future), summarising the week at a glance. The chevron folds
 *  just this card; the detailed reconciled plan below stays visible. */
function WeekStrip({ title, doneLabel, days, open, onToggle }: { title: string; doneLabel: string; days: { label: string; state: "done" | "today" | "future" | "missed" }[]; open: boolean; onToggle: () => void }) {
  const cell = (s: string) => {
    const done = s === "done", today = s === "today";
    return { aspectRatio: "1 / 1.4", borderRadius: 12, border: `1px solid ${done ? "color-mix(in srgb, " + C("lime") + " 40%, transparent)" : today ? C("lime") : C("line")}`, background: done ? `color-mix(in srgb, ${C("lime")} 12%, transparent)` : "transparent", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 4, color: C("ash") } as const;
  };
  const mark = (s: string) => (s === "done" ? "✓" : s === "today" ? "•" : s === "missed" ? "—" : "—");
  return (
    <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 26, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 18, marginBottom: 16 }}>
      <button onClick={onToggle} aria-expanded={open} style={{ width: "100%", display: "flex", alignItems: "flex-start", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
        <span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--amber-text)" }}>{title}</span>
          <span style={{ display: "block", fontWeight: 800, fontSize: 16, marginTop: 4, color: C("chalk") }}>{doneLabel}</span>
        </span>
        <span style={{ color: C("ash"), fontSize: 14, transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }}>⌄</span>
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginTop: 14 }}>
          {days.map((d, i) => (
            <div key={i} style={cell(d.state)}>
              <span style={{ fontSize: 10 }}>{d.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: d.state === "done" || d.state === "today" ? C("lime") : C("ash") }}>{mark(d.state)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
