"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fs, space,
  prescribeSession,
  computeAccountability,
  buildActivityFeed,
  currentPhase,
  planProgramToday,
  toTrainingLog,
  velocityProfiles,
  sessionsOnDay,
  sessionShape,
  sessionCardioTotals,
  sessionVolume,
  fmtTonnage,
  FUNNEL,
  ROLE_COLOR,
  readinessRole,
  type SemanticRole,
  type LoggedSession,
  type Biometrics,
  type Macrocycle,
  type SessionBlock,
} from "@hybrid/core";
import { useSession } from "@/lib/session";
import { useLang } from "@/lib/i18n";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { track } from "@/lib/track";
import { usePersona } from "@/lib/persona";
import { usePlanMaxes } from "@/lib/plan-maxes";
import { readIntake, type Intake } from "@/lib/intake";
import QuickSportLog from "../quick-sport";
import Sheet from "./sheet";
import ReadinessPicker from "./readiness-picker";
import AuroraNutrition from "./nutrition";
import CoachRail from "./coach-rail";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";

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

  const [intake, setIntake] = useState<Intake>({});
  useEffect(() => setIntake(readIntake()), []);
  // TIER-2 glance-strip pop-ups: Quick Log (the sport carousel) + Done today
  // (everything logged today, with a link through to the full calendar).
  const [quickOpen, setQuickOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  // TIER-3 quick actions, now slide-up sheets (not full-screen nav): the
  // readiness check-in, the nutrition tracker, and Follow-a-coach.
  const [readyOpen, setReadyOpen] = useState(false);
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  // Plan hero: lead with the first lift; the rest collapse behind a toggle.
  const [liftsOpen, setLiftsOpen] = useState(false);

  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(
    () => prescribeSession(log, bio, { profiles: velocityProfiles(sessions), experience: intake.experience, equipment: intake.equipment }),
    [log, bio, sessions, intake.experience, intake.equipment],
  );
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
  const phase = useMemo(() => (macro ? currentPhase(macro, currentWeek) : null), [macro, currentWeek]);
  const planMaxes = usePlanMaxes();
  const plan = useMemo(() => planProgramToday(planId, sessions.length, planMaxes), [planId, sessions.length, planMaxes]);
  const hasData = sessions.length > 0;
  const units = useLoggerPrefs().units;
  // Sessions logged TODAY — the confirmation loop. A finished prescribed session
  // and a quick sport log both land here the moment they save, so Today shows
  // "you did this" instead of forever prompting "Start".
  const doneToday = useMemo(() => sessionsOnDay(sessions), [sessions]);
  const upsell = (source: string) => { track(FUNNEL.upgradeEntryClick, { client: "web", source }); onNavigate ? onNavigate("upgrade") : router.push("/upgrade"); };

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
        {/* right group — the day-streak pill (moved up here so the greeting line
            breathes) + the notifications bell */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {acc.streak.current > 0 && (
            // SPECTRUM: the streak wears the warm terracotta accent (Connect),
            // pairing with the 🔥 and keeping chartreuse for the primary action.
            <button onClick={() => setDoneOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 44, background: `color-mix(in srgb, ${C("red")} 14%, transparent)`, color: "var(--red-text)", border: `1px solid color-mix(in srgb, ${C("red")} 40%, transparent)`, borderRadius: 999, padding: "0 13px", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }}>
              🔥 {acc.streak.current}{t("w.home.today.dayStreak")}
            </button>
          )}
          <button onClick={() => (onNavigate ? onNavigate("notifications") : router.push("/notifications"))} style={iconBtn} aria-label={t("w.home.today.notificationsAria")}>
            <AuroraIcon name="bell" size={20} color={C("ash")} />
            {notifCount > 0 && (
              <span style={{ position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 9, background: C("red"), border: `2px solid ${C("ink")}`, display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "#fff" }}>
                {notifCount > 9 ? "9+" : notifCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* GREETING — the streak moved up to the header row, so this line breathes */}
      <div style={{ margin: "16px 2px 2px" }}>
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", color: C("chalk") }}>{greeting ? `${greeting}, ${name.split(/\s+/)[0]}` : ` `}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>{dateStr || " "}</div>
        </div>
      </div>

      {/* PLAN TODAY — the single focused hero (your one job today). No kicker or
          eyebrow: the screen is already today's training and the plan names
          itself — the interface shouldn't narrate what the athlete can see. */}
      <div data-tour="today-plan" style={{ ...card }}>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: space.ms }}>
            <div style={{ display: "flex", alignItems: "center", gap: space.ms }}>
              {isAthlete && (hasData || plan || phase) ? <Ring value={rx.readiness} color={readyColor(rx.readiness)} /> : null}
              <button
                onClick={() => onStart(plan ? plan.blocks : isAthlete && (hasData || phase) ? (rx.blocks as SessionBlock[]) : undefined)}
                style={{ background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: "8px 15px", fontWeight: 700, fontSize: fs.body, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {t("w.home.today.start")}
              </button>
            </div>
          </div>
          {plan ? (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24, margin: "8px 0 2px" }}>{plan.planName}</div>
              {/* One anchor — "how far in" — carried by a thin bar, not four
                  overlapping restatements of the same position. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), whiteSpace: "nowrap" }}>{t("w.home.today.day")} {plan.dayIndex + 1} / {plan.totalDays}</span>
                <span style={{ flex: 1, height: 2, background: C("line"), borderRadius: 2, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.min(100, Math.round(((plan.dayIndex + 1) / plan.totalDays) * 100))}%`, background: C("lime") }} /></span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
                {(liftsOpen ? plan.rows : plan.rows.slice(0, 1)).map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: space.md, paddingTop: 6, borderTop: i ? `1px solid ${C("line")}` : "none" }}>
                    <span style={{ fontWeight: 600, fontSize: fs.bodyLg }}>{r.session ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginRight: 7 }}>{r.session}</span> : null}{r.name}{r.note ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}> ({r.note})</span> : null}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), textAlign: "right", flexShrink: 0 }}>{r.detail}</span>
                  </div>
                ))}
              </div>
              {plan.rows.length > 1 && (
                <button onClick={() => setLiftsOpen((o) => !o)} style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--lime-text)" }}>
                  <span>{liftsOpen ? "▴" : "▾"}</span>{liftsOpen ? t("w.home.today.hideLifts") : `${t("w.home.today.showAllLifts")} ${plan.rows.length} ${t("w.home.today.liftsWord")}`}
                </button>
              )}
              {!isAthlete && (
                <button
                  onClick={() => (onNavigate ? onNavigate("upgrade") : router.push("/upgrade"))}
                  style={{ marginTop: 12, width: "100%", display: "block", padding: "11px 13px", cursor: "pointer", textAlign: "left", border: `1px dashed color-mix(in srgb, ${C("lime")} 40%, transparent)`, background: "transparent" }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.5, color: C("ash") }}><span style={{ color: "var(--lime-text)" }}>[note]</span> {t("w.home.today.followingAsWritten1")}{t("w.home.today.unlockFull")}{t("w.home.today.followingAsWritten2")}</span>
                </button>
              )}
            </>
          ) : isAthlete && (hasData || phase) ? (
            // PREMIUM only — the real readiness-driven AI prescription. Casual
            // users fall through to the encouraging chooser (no fabricated
            // session presented as their plan).
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24, margin: "8px 0 6px" }}>
                {`${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}`}
              </div>
              {phase && (
                <MetaLine
                  parts={[`${t("w.home.today.goal")} ${macro!.goalOrSport}`, phase.block.label, `${t("w.home.today.wk")} ${currentWeek}/${macro!.totalWeeks}`]}
                  style={{ display: "flex", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginBottom: 4 }}
                />
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

      {/* TIER 2 — glanceable status strip: Quick Log · Readiness · Done today.
          Quick Log takes the day-streak's old slot (the streak lives in the header
          now); it opens the sport-log carousel, Readiness opens the daily check-in,
          and Done today opens a pop-up of everything logged today + the calendar. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, overflow: "hidden", marginTop: 16 }}>
        <button onClick={() => setQuickOpen(true)} aria-label={t("w.home.today.glanceQuickLog")} style={{ padding: "13px 6px", textAlign: "center", background: "none", border: "none", borderRight: `1px solid ${C("line")}`, cursor: "pointer", color: C("chalk") }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C("chalk") }}>＋ {t("w.home.today.glanceLog")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash"), marginTop: 4 }}>{t("w.home.today.glanceQuickLog")}</div>
        </button>
        <button onClick={() => setReadyOpen(true)} aria-label={t("w.home.today.glanceReadiness")} style={{ padding: "13px 6px", textAlign: "center", background: "none", border: "none", borderRight: `1px solid ${C("line")}`, cursor: "pointer", color: C("chalk") }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C("chalk") }}>{t("w.home.today.glanceReadinessCta")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash"), marginTop: 4 }}>{t("w.home.today.glanceReadiness")}</div>
        </button>
        <button onClick={() => setDoneOpen(true)} aria-label={t("w.home.today.glanceDone")} style={{ padding: "13px 6px", textAlign: "center", background: "none", border: "none", cursor: "pointer", color: C("chalk") }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C("chalk") }}>✓ {doneToday.length}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash"), marginTop: 4 }}>{t("w.home.today.glanceDone")}</div>
        </button>
      </div>

      {/* ───── GO FULL — Cockpit + Sport premium baits (violet = premium) ───── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "26px 2px 12px" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash") }}><span style={{ color: "var(--violet-text)" }}>✦</span> {t("w.home.today.goFull")}</span>
        <button onClick={() => (onNavigate ? onNavigate("plans") : router.push("/plans"))} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash"), background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>{t("w.home.today.seePlans")} →</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <AccessCard
          title={t("w.home.today.cockpitTitle")}
          sub={isAthlete ? t("w.home.today.cockpitSub") : t("w.home.today.cockpitLockSub")}
          locked={!isAthlete}
          onClick={() => (isAthlete ? (onNavigate ? onNavigate("cockpit") : router.push("/cockpit")) : upsell("today-cockpit"))}
        />
        <AccessCard
          title={t("w.home.today.sportTitle")}
          sub={isAthlete ? t("w.home.today.sportSub") : t("w.home.today.sportLockSub")}
          locked={!isAthlete}
          onClick={() => (isAthlete ? (onNavigate ? onNavigate("sport") : router.push("/sport")) : upsell("today-sport"))}
        />
      </div>

      {/* ───── RECOVER & MORE — deferred rows (nutrition · coaches) ───── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "26px 2px 12px" }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: C("ash"), flexShrink: 0 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash") }}>{t("w.home.today.recoverMore")}</span>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <DeferRow glyph="◍" tint="ash" title={t("w.home.today.w.nutrition")} sub={t("w.home.today.rowNutritionSub")} onClick={() => setNutritionOpen(true)} />
        <DeferRow glyph="★" tint="ash" title={t("w.home.today.rowCoach")} sub={t("w.home.today.rowCoachSub")} onClick={() => setCoachOpen(true)} />
      </div>

      {/* QUICK LOG sheet — the sport-log carousel, opened from the glance strip. */}
      <Sheet open={quickOpen} onClose={() => setQuickOpen(false)} title={t("w.home.quickSport.title")} sub={t("w.home.quickSport.sub")}>
        <QuickSportLog sessions={sessions} onSaved={() => { onSaved?.(); setQuickOpen(false); }} solid />
      </Sheet>

      {/* READINESS sheet — the compact "How ready do you feel?" quick picker. */}
      <Sheet open={readyOpen} onClose={() => setReadyOpen(false)} title={t("w.recovery.readiness.title")} sub={t("w.recovery.readiness.sub")}>
        <ReadinessPicker onDone={() => setReadyOpen(false)} />
      </Sheet>

      {/* NUTRITION sheet — the compact "Add a meal" quick-add + premade meals. */}
      <Sheet open={nutritionOpen} onClose={() => setNutritionOpen(false)} label={t("w.home.today.w.nutrition")}>
        <AuroraNutrition compact onNavigate={(s) => { setNutritionOpen(false); onNavigate?.(s); }} />
      </Sheet>

      {/* FOLLOW A COACH sheet — the coach rail (renders its own header). */}
      <Sheet open={coachOpen} onClose={() => setCoachOpen(false)} label={t("w.home.today.rowCoach")}>
        <CoachRail onOpen={() => { setCoachOpen(false); if (onNavigate) onNavigate("coaches"); else router.push("/coaches"); }} />
      </Sheet>

      {/* DONE TODAY sheet — everything logged today + the full calendar. */}
      <Sheet open={doneOpen} onClose={() => setDoneOpen(false)} title={t("w.home.today.doneModalTitle")} sub={`${dateStr}${acc.streak.current > 0 ? ` · 🔥 ${acc.streak.current}${t("w.home.today.dayStreak")}` : ""}`}>
        {doneToday.length === 0 ? (
          <div style={{ fontSize: fs.body, color: C("ash"), lineHeight: 1.5, padding: "8px 0" }}>{t("w.home.today.doneModalEmpty")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {doneToday.map((s) => (
              <button key={s.id} onClick={() => { setDoneOpen(false); if (onNavigate) onNavigate("history"); else router.push("/history"); }} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", borderBottom: `1px solid ${C("line")}`, padding: "12px 2px", cursor: "pointer", color: C("chalk") }}>
                <span style={{ width: 30, height: 30, borderRadius: 999, flexShrink: 0, background: `color-mix(in srgb, ${C("lime")} 18%, transparent)`, border: `1px solid ${C("lime")}`, display: "grid", placeItems: "center", color: "var(--lime-text)", fontWeight: 800 }}>✓</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: fs.note, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
                  <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sessionMeta(s, units)}</span>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: "var(--lime-text)" }}>›</span>
              </button>
            ))}
          </div>
        )}
        <button onClick={() => { setDoneOpen(false); if (onNavigate) onNavigate("calendar"); else router.push("/calendar"); }} style={{ marginTop: 16, width: "100%", background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: 14, fontWeight: 700, fontSize: fs.body, color: C("chalk"), cursor: "pointer" }}>📅 {t("w.home.today.doneCalendar")}</button>
      </Sheet>
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


// One-line meta for a session logged today — sport-adaptive so a run/match reads
// as distance·time (not the gym Sets/Volume framing) and a lift reads as tonnage.
function sessionMeta(s: LoggedSession, units: "kg" | "lb"): string {
  if (sessionShape(s) !== "strength") {
    const ct = sessionCardioTotals(s.blocks);
    const p: string[] = [];
    if (ct.distanceKm) p.push(`${ct.distanceKm.toFixed(1)} km`);
    if (ct.minutes) p.push(`${ct.minutes} min`);
    if (p.length) return p.join(" · ");
    return s.blocks.map((b) => b.name).join(" · ");
  }
  const vol = sessionVolume(s.blocks);
  const names = s.blocks.map((b) => b.name).join(" · ");
  return vol > 0 ? `${fmtTonnage(vol, units)} · ${names}` : names;
}

// A compact quick-access tile (Cockpit / Sport). A `locked` tile carries the ✦
// Full accent + a lime rim; an unlocked one shows the → chevron.
// A deferred row (Tier 3) — a slim tap-through to a secondary surface
// (Nutrition, Coaches), with a tinted glyph, title + sub, and a chevron.
function DeferRow({ glyph, tint, title, sub, onClick }: { glyph: string; tint: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "13px 15px", cursor: "pointer", color: C("chalk") }}>
      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: `color-mix(in srgb, ${C(tint)} 20%, transparent)`, color: C(tint), fontSize: 14 }}>{glyph}</span>
        <span>
          <span style={{ display: "block", fontWeight: 700, fontSize: fs.note }}>{title}</span>
          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{sub}</span>
        </span>
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>›</span>
    </button>
  );
}

function AccessCard({ title, sub, locked, onClick }: { title: string; sub: string; locked: boolean; onClick: () => void }) {
  const { t } = useLang();
  return (
    <button
      onClick={onClick}
      aria-label={title}
      style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", textAlign: "left", background: `linear-gradient(160deg, color-mix(in srgb, ${C("violet")} 14%, ${C("ink2")}), ${C("ink2")})`, border: `1px solid color-mix(in srgb, ${C("violet")} 22%, ${C("line")})`, borderRadius: 22, padding: 16, cursor: "pointer", color: C("chalk"), boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)" }}
    >
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20 }}>{title}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, lineHeight: 1.4, color: C("ash") }}>{sub}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--violet-text)", marginTop: 2 }}>{locked ? t("w.home.today.cardUnlock") : t("w.home.today.cardOpen")} →</span>
    </button>
  );
}


