"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fs, space,
  prescribeSession,
  computeAccountability,
  weekAdherence,
  trainingDaysPerWeek,
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
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { track } from "@/lib/track";
import { usePersona } from "@/lib/persona";
import { usePlanMaxes } from "@/lib/plan-maxes";
import { readIntake, type Intake } from "@/lib/intake";
import QuickSportLog from "../quick-sport";
import { AuroraIcon } from "./icons";

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

      {/* ───── TRAIN ───── */}
      <Kicker k={t("w.home.today.kTrain")} h={t("w.home.today.kSession")} color={C(SECTION_COLOR.train)} />

      {/* PLAN TODAY — the single focused hero (your one job today) */}
      <div data-tour="today-plan" style={{ ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>
              {t("w.home.today.yourPlan")}{!(isAthlete && (hasData || plan || phase)) && plan ? t("w.home.today.asWritten") : ""}
            </span>
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
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginBottom: 10 }}>
                {plan.day} · {t("w.home.today.day")} {plan.dayIndex + 1}/{plan.totalDays}{plan.kindLabel ? ` · ${plan.kindLabel}` : ""}{phase ? ` · ${phase.block.label} ${t("w.home.today.wk")} ${currentWeek}/${macro!.totalWeeks}` : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
                {plan.rows.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: space.md, paddingTop: 6, borderTop: i ? `1px solid ${C("line")}` : "none" }}>
                    <span style={{ fontWeight: 600, fontSize: fs.bodyLg }}>{r.name}{r.note ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}> · {r.note}</span> : null}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), textAlign: "right", flexShrink: 0 }}>{r.detail}</span>
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
          ) : isAthlete && (hasData || phase) ? (
            // PREMIUM only — the real readiness-driven AI prescription. Casual
            // users fall through to the encouraging chooser (no fabricated
            // session presented as their plan).
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

      {/* TIER 2 — glanceable status strip: Quick Log · Readiness · Done today.
          Quick Log takes the day-streak's old slot (the streak lives in the header
          now); it opens the sport-log carousel, Readiness opens the daily check-in,
          and Done today opens a pop-up of everything logged today + the calendar. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, overflow: "hidden", marginTop: 16 }}>
        <button onClick={() => setQuickOpen(true)} aria-label={t("w.home.today.glanceQuickLog")} style={{ padding: "13px 6px", textAlign: "center", background: "none", border: "none", borderRight: `1px solid ${C("line")}`, cursor: "pointer", color: C("chalk") }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--lime-text)" }}>＋ {t("w.home.today.glanceLog")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash"), marginTop: 4 }}>{t("w.home.today.glanceQuickLog")}</div>
        </button>
        <button onClick={() => (onNavigate ? onNavigate("checkin") : router.push("/checkin"))} aria-label={t("w.home.today.glanceReadiness")} style={{ padding: "13px 6px", textAlign: "center", background: "none", border: "none", borderRight: `1px solid ${C("line")}`, cursor: "pointer", color: C("chalk") }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--blue-text)" }}>{t("w.home.today.glanceReadinessCta")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash"), marginTop: 4 }}>{t("w.home.today.glanceReadiness")}</div>
        </button>
        <button onClick={() => setDoneOpen(true)} aria-label={t("w.home.today.glanceDone")} style={{ padding: "13px 6px", textAlign: "center", background: "none", border: "none", cursor: "pointer", color: C("chalk") }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--amber-text)" }}>✓ {doneToday.length}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash"), marginTop: 4 }}>{t("w.home.today.glanceDone")}</div>
        </button>
      </div>

      {/* ───── GO FULL — Cockpit + Sport premium baits (violet = premium) ───── */}
      <div style={{ margin: "26px 2px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--violet-text)" }}>✦ {t("w.home.today.goFull")}</div>
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
      <div style={{ margin: "26px 2px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash") }}>{t("w.home.today.recoverMore")}</div>
      <div style={{ display: "grid", gap: 10 }}>
        <DeferRow glyph="◍" tint="blue" title={t("w.home.today.w.nutrition")} sub={t("w.home.today.rowNutritionSub")} onClick={() => (onNavigate ? onNavigate("nutrition") : router.push("/nutrition"))} />
        <DeferRow glyph="★" tint="violet" title={t("w.home.today.rowCoach")} sub={t("w.home.today.rowCoachSub")} onClick={() => (onNavigate ? onNavigate("coaches") : router.push("/coaches"))} />
      </div>

      {/* QUICK LOG modal — the sport-log carousel, opened from the glance strip. */}
      {quickOpen && (
        <div onClick={() => setQuickOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, background: C("ink2"), borderTopLeftRadius: 26, borderTopRightRadius: 26, border: `1px solid ${C("line")}`, padding: "20px 20px 26px", maxHeight: "86%", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, background: C("line"), margin: "0 auto 16px" }} />
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22 }}>{t("w.home.quickSport.title")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), margin: "4px 0 14px" }}>{t("w.home.quickSport.sub")}</div>
            <QuickSportLog sessions={sessions} onSaved={() => { onSaved?.(); setQuickOpen(false); }} solid />
          </div>
        </div>
      )}

      {/* DONE TODAY modal — a pop-up of everything logged today + the full calendar. */}
      {doneOpen && (
        <div onClick={() => setDoneOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, background: C("ink2"), borderTopLeftRadius: 26, borderTopRightRadius: 26, border: `1px solid ${C("line")}`, padding: "20px 20px 26px", maxHeight: "84%", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, background: C("line"), margin: "0 auto 16px" }} />
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22 }}>{t("w.home.today.doneModalTitle")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), margin: "4px 0 12px" }}>{dateStr}{acc.streak.current > 0 ? ` · 🔥 ${acc.streak.current}${t("w.home.today.dayStreak")}` : ""}</div>
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
          </div>
        </div>
      )}
    </div>
  );
}

// A section kicker — guides the daily flow (Train → Feel → Plan → Connect). An
// optional trailing action puts a link on the right (e.g. Plan → full Calendar).
function Kicker({ k, h, color, action }: { k: string; h: string; color: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "26px 2px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: color, flexShrink: 0 }} />
        {/* label + heading on ONE line, left-aligned, same font: "TRAIN · …" */}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash") }}>{k} · {h}</span>
      </div>
      {action && (
        <button onClick={action.onClick} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>{action.label}</button>
      )}
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
        <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: `color-mix(in srgb, ${C(tint)} 20%, transparent)`, color: `var(--${tint}-text)`, fontSize: 14 }}>{glyph}</span>
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
  return (
    <button
      onClick={onClick}
      aria-label={title}
      style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start", textAlign: "left", background: C("ink2"), border: `1px solid ${locked ? "color-mix(in srgb, var(--color-lime) 40%, transparent)" : C("line")}`, borderRadius: 22, padding: 16, cursor: "pointer", color: C("chalk"), boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)" }}
    >
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18 }}>{title}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: locked ? "var(--lime-text)" : C("ash") }}>{locked ? "✦" : "→"}</span>
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{sub}</span>
    </button>
  );
}

// The calendar quick-access widget — the current week's dates (today ringed,
// logged days lime-filled) + a button through to the full Calendar screen.
function CalendarCard({ sessions, onOpen, openLabel, title, sub }: { sessions: LoggedSession[]; onOpen: () => void; openLabel: string; title: string; sub: string }) {
  const now = new Date();
  const month = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  const dow = ["S", "M", "T", "W", "T", "F", "S"];
  const todayStr = now.toDateString();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  return (
    <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 26, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--amber-text)" }}>{title}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{month}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginTop: 12 }}>
        {days.map((d, i) => {
          const logged = sessionsOnDay(sessions, d.getTime()).length > 0;
          const isToday = d.toDateString() === todayStr;
          return (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C("ash") }}>{dow[d.getDay()]}</div>
              <div style={{ marginTop: 5, height: 30, borderRadius: 10, display: "grid", placeItems: "center", border: `1px solid ${isToday ? C("lime") : logged ? "color-mix(in srgb, var(--color-lime) 40%, transparent)" : C("line")}`, background: logged ? "color-mix(in srgb, var(--color-lime) 12%, transparent)" : "transparent", fontWeight: 700, fontSize: 13, color: logged || isToday ? "var(--lime-text)" : C("chalk") }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>
      <button onClick={onOpen} style={{ marginTop: 14, width: "100%", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, color: C("chalk"), background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "11px", cursor: "pointer" }}>{openLabel}</button>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 8, textAlign: "center" }}>{sub}</div>
    </div>
  );
}

// A CONNECT sub-rail label — the small "Feed" / "Coaches" heading above each
// horizontal slider, with an Explore action link on the right.
function SubRail({ label, actionLabel, onAction }: { label: string; actionLabel: string; onAction: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "14px 2px 10px" }}>
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 17, color: C("chalk") }}>{label}</span>
      <button onClick={onAction} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>{actionLabel}</button>
    </div>
  );
}
