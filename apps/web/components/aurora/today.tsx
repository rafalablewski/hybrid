"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  checkinFeeling,
  checkinCooldownRemainingMs,
  relativeTime,
  planSchedule,
  masthead,
  alsoTodayCopy,
  sessionClockTime,
  sessionIcon,
  READINESS_FEELINGS,
  READINESS_FACE,
  type ReadinessFeeling,
  type SemanticRole,
  type LoggedSession,
  type Biometrics,
  type Macrocycle,
  type SessionBlock,
  type ScheduledDay,
  type LogbookDay,
} from "@hybrid/core";
import { useSession } from "@/lib/session";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { useLang } from "@/lib/i18n";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { track } from "@/lib/track";
import { usePersona } from "@/lib/persona";
import { usePlanMaxes } from "@/lib/plan-maxes";
import { readIntake, type Intake } from "@/lib/intake";
import QuickSportLog from "../quick-sport";
import ExerciseWidgetRail from "./exercise-widget";
import AuroraWeekRail from "./week-rail";
import AuroraLogbookRail from "./logbook-rail";
import Sheet from "./sheet";
import QuickStartSheet, { type QuickRoutine } from "./quick-start";
import AuroraNutrition from "./nutrition";
import AuroraFuel from "./fuel";
import CoachRail from "./coach-rail";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";
import { CtaLabel } from "./cta-label";
import ReadinessFace from "./readiness-face";

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
  planStartedAt,
  onStart,
  onNavigate,
  onOpenSession,
  onOpenExercise,
  onSaved,
  loading = false,
}: {
  sessions: LoggedSession[];
  bio?: Biometrics;
  macro?: Macrocycle | null;
  currentWeek?: number;
  planId?: string | null;
  /** The enrolled plan's start date (Macrocycle.startedAt) — anchors the week rail. */
  planStartedAt?: string | null;
  /** `title` (plan starts only) is the plan-composed session title the logger
   *  should save under, so the engine recognises the session as the plan's own. */
  onStart: (planBlocks?: SessionBlock[], title?: string) => void;
  /** In-shell navigation (keeps the sidebar); falls back to a route push. */
  onNavigate?: (screen: string) => void;
  /** Open one logged session's breakdown (History deep-link) — parity with
   *  mobile's /session/{id}. Falls back to the plain history screen if absent. */
  onOpenSession?: (sessionId: string) => void;
  /** Open ONE movement's stats page (the Exercises widget tap-through). */
  onOpenExercise?: (name: string) => void;
  /** Refresh sessions after the quick sport-log widget saves one. */
  onSaved?: () => void;
  /** True while the first sessions OR enrollment fetch is in flight —
   *  suppresses the cold-start chooser so an already-enrolled athlete never
   *  sees the first-run-chooser flash before their plan resolves. */
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
  // nutrition tracker and Follow-a-coach. (Readiness is now set inline on the
  // feeling card, so it no longer opens a sheet.)
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  // Quick-start: the fourth "Train your way" path — a sheet to re-launch a saved
  // routine (favourites rail + shuffle-able rest). `routines` stays null until the
  // first fetch resolves so the Quick-start card doesn't flash before we know
  // whether the user has any saved routines.
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [routines, setRoutines] = useState<QuickRoutine[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates?: QuickRoutine[] }) => { if (alive) setRoutines(d.templates ?? []); })
      .catch(() => { if (alive) setRoutines([]); });
    return () => { alive = false; };
  }, []);
  const hasRoutines = !!routines && routines.length > 0;
  // Optimistic favourite toggle — flip locally, then PATCH; revert on failure.
  const toggleFavourite = useCallback((r: QuickRoutine) => {
    const next = !r.favourite;
    setRoutines((cur) => cur?.map((x) => (x.id === r.id ? { ...x, favourite: next } : x)) ?? cur);
    fetch(`/api/templates/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favourite: next }),
    })
      .then((res) => {
        if (!res.ok) setRoutines((cur) => cur?.map((x) => (x.id === r.id ? { ...x, favourite: r.favourite } : x)) ?? cur);
      })
      .catch(() => setRoutines((cur) => cur?.map((x) => (x.id === r.id ? { ...x, favourite: r.favourite } : x)) ?? cur));
  }, []);
  const launchRoutine = useCallback((r: QuickRoutine) => {
    setQuickStartOpen(false);
    onStart(r.blocks, r.name);
  }, [onStart]);
  // Plan hero: lead with the first lift; the rest collapse behind a toggle.
  const [liftsOpen, setLiftsOpen] = useState(false);
  // Keep keyboard focus with the lift toggle across open/close: the "Show all"
  // pill and the "Hide lifts" button are different elements, so when one
  // unmounts we move focus to the other — but only after a user-driven toggle
  // (the ref guard keeps this from stealing focus on first render).
  const showLiftsRef = useRef<HTMLButtonElement>(null);
  const hideLiftsRef = useRef<HTMLButtonElement>(null);
  const liftsToggled = useRef(false);
  useEffect(() => {
    if (!liftsToggled.current) return;
    liftsToggled.current = false;
    (liftsOpen ? hideLiftsRef : showLiftsRef).current?.focus();
  }, [liftsOpen]);
  const toggleLifts = (open: boolean) => { liftsToggled.current = true; setLiftsOpen(open); };

  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(
    () => prescribeSession(log, bio, { profiles: velocityProfiles(sessions), experience: intake.experience, equipment: intake.equipment }),
    [log, bio, sessions, intake.experience, intake.equipment],
  );
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
  const phase = useMemo(() => (macro ? currentPhase(macro, currentWeek) : null), [macro, currentWeek]);
  const planMaxes = usePlanMaxes();
  const plan = useMemo(() => planProgramToday(planId, sessions.length, planMaxes), [planId, sessions.length, planMaxes]);
  // When enrolled in a discipline-shaped program with a start-date anchor, the
  // date-based week rail supersedes the count-based plan card entirely.
  const useRail = !!(plan && planId && planStartedAt);
  const hasData = sessions.length > 0;
  // LOGBOOK MODE ("The Constant", concept C1) — no plan but real logged
  // history: the SAME week-rail object mounts in logbook mode, so the calendar
  // exists from the first logged session instead of the chooser repeating
  // forever; the chooser demotes to slim "Add structure" rows below the rail.
  // Premium athletes with history keep their AI-prescription hero instead.
  const logbookMode = !plan && !loading && !(isAthlete && hasData) && hasData;
  const units = useLoggerPrefs().units;
  const bw = useBodyweightLookup();
  // The DAY the screen is scoped to. The week rail's tapped chip lifts up here
  // so the Also-today and feeling cards follow the viewed day instead of
  // staying pinned to the real today; null (or tapping today's chip) = today.
  // Re-anchors to today whenever the enrolled plan changes (the rail resets its
  // own selection the same way), and is ignored entirely once the rail is gone
  // (un-enrolled) — a stale day must never scope the cards with no rail visible.
  const [railDay, setRailDay] = useState<ScheduledDay | LogbookDay | null>(null);
  useEffect(() => { setRailDay(null); }, [planId, planStartedAt]);
  const dayIsToday = !(useRail || logbookMode) || !railDay || railDay.isToday;
  // undefined lets every core day-helper fall through to its Date.now() default.
  const dayTs = dayIsToday ? undefined : railDay!.ts;
  const dayLabel = dayIsToday ? null : `${railDay!.weekdayShort} ${railDay!.dayOfMonth} ${railDay!.monthShort}`;
  const dayIsFuture = !dayIsToday && railDay!.ts > Date.now();
  // LIVING MASTHEAD — the headline names the VIEWED day ("Today" until the
  // rail is scrubbed, "Yesterday"/"Tomorrow" at ±1, the weekday name beyond;
  // never "2 days ago" — clumsy as a headline, worse inflected in PL/DE).
  // The naming rule lives in @hybrid/core masthead.ts so mobile can't drift.
  const mast = masthead(dayTs);
  // "Back to today" re-anchors BOTH the lifted day scope and the rail's own
  // internal selection (via resetToken) in one tap.
  const [railResetToken, setRailResetToken] = useState(0);
  const backToToday = () => { setRailDay(null); setRailResetToken((n) => n + 1); };
  // Sessions logged on the VIEWED day — the confirmation loop. A finished
  // prescribed session and a quick sport log both land here the moment they
  // save, so Today shows "you did this" instead of forever prompting "Start".
  const doneOnDay = useMemo(() => sessionsOnDay(sessions, dayTs), [sessions, dayTs]);
  // The date-anchored schedule (no overrides — status colouring lives in the
  // rail; here we only need today's prescription + which sessions fulfilled it).
  const sched = useMemo(
    () => (planId && planStartedAt ? planSchedule({ planId, startedAt: planStartedAt, sessions }) : null),
    [planId, planStartedAt, sessions],
  );
  // Sessions the schedule claimed for SOME plan day — the Done-Today card tags
  // those rows "Plan" so the plan workout and the off-plan extras (the tennis
  // match, a freestyle lift) read apart while ALL of them stay listed.
  const fulfilledIds = useMemo(() => new Set(sched?.fulfilledSessionIds ?? []), [sched]);
  const upsell = (source: string) => { track(FUNNEL.upgradeEntryClick, { client: "web", source }); onNavigate ? onNavigate("upgrade") : router.push("/upgrade"); };

  const initials = useMemo(
    () => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "A",
    [name],
  );
  const notifCount = useMemo(() => buildActivityFeed({ sessions }).length, [sessions]);

  // The readiness FEELING log — the emoji the athlete picked in the quick
  // check-in (primed/good/flat/wrecked), not a computed score. The raw list is
  // kept so the feeling card can be scoped to WHICHEVER day the week rail has
  // selected; refetched when a face saves. Client-only fetch so the
  // day-comparison never mismatches the server clock on hydration.
  const [checkins, setCheckins] = useState<{ weekOf: string; energy: number | null; sleep: number | null; soreness: number | null; mood: number | null; createdAt?: string }[]>([]);
  const loadFeeling = useCallback(async () => {
    try {
      const r = await fetch("/api/checkins");
      if (!r.ok) return;
      const d = (await r.json()) as { checkins?: typeof checkins } | null;
      setCheckins(d?.checkins ?? []);
    } catch { /* leave as-is */ }
  }, []);
  useEffect(() => { loadFeeling(); }, [loadFeeling]);
  // The viewed day's check-in (if any) → its feeling + logged-at time.
  const dayCheckin = useMemo(() => {
    const dstr = new Date(dayTs ?? Date.now()).toDateString();
    return checkins.find((c) => c && c.weekOf && new Date(c.weekOf).toDateString() === dstr) ?? null;
  }, [checkins, dayTs]);
  const feeling = dayCheckin ? checkinFeeling(dayCheckin) : null;
  const feelingAt = dayCheckin?.weekOf ? new Date(dayCheckin.weekOf).getTime() : null;
  // The most recent check-in WRITE anywhere (createdAt, not the day it covers)
  // — mirrors the server's global 6h re-log cooldown, which also holds when
  // back-logging a feeling for a past day.
  const lastCheckinAt = useMemo(
    () =>
      checkins.reduce<number | null>((m, c) => {
        const ts = Date.parse(c?.createdAt ?? c?.weekOf ?? "");
        return Number.isFinite(ts) && (m == null || ts > m) ? ts : m;
      }, null),
    [checkins],
  );

  // Time-of-day greeting + date — computed on the client (in an effect) so the
  // server-rendered markup doesn't mismatch the clock on hydration.
  const [greeting, setGreeting] = useState("");
  const [dateStr, setDateStr] = useState("");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(t(h < 12 ? "w.home.today.greetMorning" : h < 18 ? "w.home.today.greetAfternoon" : "w.home.today.greetEvening"));
    setDateStr(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }));
  }, [t]);
  // FIRST-RUN CHOOSER state (new user: no plan, no history) — hoisted because
  // the masthead's caption line says "Free" when the chooser (or its demoted
  // logbook-mode form) renders. With history the logbook rail takes over.
  const firstRun = !plan && !loading && !hasData;
  // Masthead strings for the viewed day: headline, caption date, and (beyond
  // ±1 day, where the headline stops saying it) the scrub-distance tag. The
  // non-today branches only exist after a rail tap, so they never render on
  // the server — no hydration-mismatch risk from the locale date formatting.
  const mastTitle =
    mast.kind === "today" ? t("w.home.today.mastToday")
    : mast.kind === "yesterday" ? t("w.home.today.mastYesterday")
    : mast.kind === "tomorrow" ? t("w.home.today.mastTomorrow")
    : new Date(dayTs!).toLocaleDateString(undefined, { weekday: "long" });
  const mastCaption = dayIsToday ? dateStr : new Date(dayTs!).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const mastTag =
    Math.abs(mast.diffDays) >= 2
      ? t(mast.diffDays < 0 ? "w.home.today.daysBack" : "w.home.today.daysOut").replace("{n}", String(Math.abs(mast.diffDays)))
      : null;

  const iconBtn = { position: "relative", width: 44, height: 44, borderRadius: 14, background: C("ink2"), border: `1px solid ${C("line")}`, display: "grid", placeItems: "center", cursor: "pointer" } as const;
  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 22 } as const;

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

      {/* MASTHEAD ("Today" redesign) — caption date + right meta (the
          chooser's "Free", or the scrub-distance tag), ONE big headline, and
          the greeting demoted to a single warm sentence beneath it. The old
          layout stacked two near-equal bold headlines (greeting 22 + "How do
          you want to start?" 18) four lines apart; now the page has one. The
          headline NAMES THE VIEWED DAY (masthead() in @hybrid/core): "Today"
          until the week rail is scrubbed, "Yesterday"/"Tomorrow" at ±1, the
          weekday name beyond — a static "Today" over Friday's session would
          lie in the largest type on screen. Off today, the greeting line
          becomes the "Back to today" return affordance, teal, in the same
          spot every time. Mirrors mobile home.tsx. */}
      <div style={{ margin: "16px 2px 2px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash") }}>{mastCaption || " "}</span>
          {firstRun || (logbookMode && !mastTag) ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap" }}>{t("w.home.today.badgeFree")}</span>
          ) : mastTag ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--amber-text)", whiteSpace: "nowrap" }}>{mastTag}</span>
          ) : null}
        </div>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 34, letterSpacing: "-.03em", lineHeight: 1.1, color: C("chalk"), marginTop: 2 }}>
          {mastTitle}
          {/* Kyoto Hour hanko — the app's vermilion seal, stamped beside the true
              "Today" only (never the scrubbed days). Hidden in Aurora via CSS
              (.hanko-seal). Mirrors mobile home.tsx. */}
          {dayIsToday && <span className="hanko-seal" aria-hidden>力</span>}
        </div>
        {dayIsToday ? (
          <div style={{ fontSize: fs.body, color: C("ash"), marginTop: 2 }}>{greeting ? `${greeting}, ${name.split(/\s+/)[0]}.` : ` `}</div>
        ) : (
          <button
            onClick={backToToday}
            style={{ background: "none", border: "none", padding: 0, marginTop: 4, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--blue-text)" }}
          >
            {t("w.home.today.backToToday")} →
          </button>
        )}
      </div>

      {/* PLAN TODAY — the single focused hero (your one job today). No kicker or
          eyebrow: the screen is already today's training and the plan names
          itself — the interface shouldn't narrate what the athlete can see.
          When enrolled in a program with a start date, the date-anchored week
          rail replaces this whole block (done/missed/skipped/today at a glance). */}
      {useRail ? (
        <AuroraWeekRail
          planId={planId!}
          planStartedAt={planStartedAt!}
          sessions={sessions}
          maxes={planMaxes}
          onStart={onStart}
          onNavigate={onNavigate}
          onSelectDay={setRailDay}
          resetToken={railResetToken}
        />
      ) : logbookMode ? (
        /* LOGBOOK MODE ("The Constant") — the same week-rail object, in
           logbook mode: the last seven days with the athlete's real logged
           training, so a plan-less regular gets the calendar from their first
           session instead of the chooser forever. The chooser demotes to slim
           rows under an Explore-standard "Add structure" head. */
        <div style={{ marginTop: 14 }}>
          <AuroraLogbookRail
            sessions={sessions}
            onLog={() => onStart()}
            onNavigate={onNavigate}
            onSelectDay={setRailDay}
            resetToken={railResetToken}
          />
          <div style={{ margin: "24px 2px 12px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("chalk") }}>{t("w.home.logbook.trainYourWay")}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash") }}>{t("w.home.logbook.optional")}</span>
          </div>
          {/* the chooser as a snap slider — the exercise-widget rail's idiom:
              one card ≈ 72% wide so the next path peeks in from the right,
              FULL-BLEED like every screen-level rail: negative margins the
              width of the shell gutter (--page-pad-x) pull the scroll clip to
              the true screen edge; the centre-snap then centres cards on the
              physical screen. */}
          <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", margin: "0 calc(-1 * var(--page-pad-x, 16px))", padding: "4px var(--page-pad-x, 16px) 6px" }}>
            <StructureCard glyph="▤" accent="lime" title={t("w.home.today.chooserFollowTitle")} sub={t("w.home.logbook.slimFollowSub")} cta={t("w.home.today.chooserFollowCta")} onClick={() => (onNavigate ? onNavigate("plans") : router.push("/(tabs)/plans"))} />
            <StructureCard glyph="⌗" accent="blue" title={t("w.home.today.chooserBuildTitle")} sub={t("w.home.logbook.slimBuildSub")} cta={t("w.home.today.chooserBuildCta")} onClick={() => (onNavigate ? onNavigate("builder") : router.push("/builder"))} />
            <StructureCard glyph="↯" accent="amber" title={t("w.home.today.chooserLogTitle")} sub={t("w.home.logbook.slimLogSub")} cta={t("w.home.today.chooserLogCta")} onClick={() => onStart()} />
            {/* The fourth path — only once the user actually owns a routine to
                quick-start (a dead door helps nobody). Opens the favourites sheet. */}
            {hasRoutines && <StructureCard glyph="⚡" accent="violet" title={t("w.home.today.chooserQuickTitle")} sub={t("w.home.logbook.slimQuickSub")} cta={t("w.home.today.chooserQuickCta")} onClick={() => setQuickStartOpen(true)} />}
          </div>
        </div>
      ) : firstRun ? (
        /* FIRST-RUN CHOOSER — "Three Materials", sitting DIRECTLY on the page:
           no wrapper card (a box around three cards reads as chrome) and one
           stacked column (side-by-side columns crowd the copy and orphan the
           third card at phone widths). NO section head — the "How do you want
           to start?" question was retired with the masthead redesign (the page
           already opens with "Today" + the greeting, and three cards titled
           Follow a plan / Build your own / Log a workout need no sentence
           announcing that a choice is available); "Free" is said ONCE on the
           masthead's caption line. Each full-width card wears the Go-Full
           anatomy with its corner glow, the hue confined to glyph + CTA, and
           IS the start — no separate Start pill. Mirrored on mobile. */
        <div data-tour="today-plan" style={{ marginTop: 16 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <ChooserCard glyph="▤" accent="lime" title={t("w.home.today.chooserFollowTitle")} sub={t("w.home.today.chooserFollowSub")} cta={t("w.home.today.chooserFollowCta")} onClick={() => (onNavigate ? onNavigate("plans") : router.push("/(tabs)/plans"))} />
            <ChooserCard glyph="⌗" accent="blue" title={t("w.home.today.chooserBuildTitle")} sub={t("w.home.today.chooserBuildSub")} cta={t("w.home.today.chooserBuildCta")} onClick={() => (onNavigate ? onNavigate("builder") : router.push("/builder"))} />
            <ChooserCard glyph="↯" accent="amber" title={t("w.home.today.chooserLogTitle")} sub={t("w.home.today.chooserLogSub")} cta={t("w.home.today.chooserLogCta")} onClick={() => onStart()} />
            {hasRoutines && <ChooserCard glyph="⚡" accent="violet" title={t("w.home.today.chooserQuickTitle")} sub={t("w.home.today.chooserQuickSub")} cta={t("w.home.today.chooserQuickCta")} onClick={() => setQuickStartOpen(true)} />}
          </div>
        </div>
      ) : (
      <div data-tour="today-plan" style={{ ...card }}>
          {(() => {
            // On a plan, Start becomes the full-width action BELOW the note; the
            // top row then carries only the readiness ring (athlete). Other
            // states keep the compact top-right Start. The ring only shows when
            // there's logged history — a bare macrocycle phase (auto-created at
            // onboarding) must never surface a fabricated readiness score.
            const showRing = isAthlete && hasData;
            // While the first sessions/enrollment fetch is in flight we don't
            // yet know if they're on a plan — hold the top Start back so it
            // doesn't flash in and vanish once the plan (or rail) resolves.
            // The chooser state gets NO top Start: its three cards ARE the
            // start (a floating pill above them would be a competing CTA), so
            // the pill only serves the athlete AI-prescription state.
            const showTopStart = !plan && !loading && isAthlete && hasData;
            if (!showRing && !showTopStart) return null;
            return (
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: space.ms }}>
                {showRing ? <Ring value={rx.readiness} color={readyColor(rx.readiness)} /> : null}
                {showTopStart && (
                  <button
                    onClick={() => onStart(isAthlete && hasData ? (rx.blocks as SessionBlock[]) : undefined)}
                    className="start-glow"
                    style={{ background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "8px 15px", fontWeight: 700, fontSize: fs.body, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    <CtaLabel>{t("w.home.today.start")}</CtaLabel>
                  </button>
                )}
              </div>
            );
          })()}
          {plan ? (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24, margin: "8px 0 2px" }}>{plan.planName}</div>
              {/* One anchor — "how far in" — carried by a thin bar, not four
                  overlapping restatements of the same position. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), whiteSpace: "nowrap" }}>{t("w.home.today.day")} {plan.dayIndex + 1} / {plan.totalDays}</span>
                <span style={{ flex: 1, height: 2, background: C("line"), borderRadius: 2, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.min(100, Math.round(((plan.dayIndex + 1) / plan.totalDays) * 100))}%`, background: C("lime") }} /></span>
              </div>
              {/* Lift reveal: the first lift reads clear; the rest stay sharp but
                  dissolve — an opacity gradient (mask, no blur) melts them into the
                  card so it teases "there's more" at a fixed height. Expanding
                  clears the dissolve and unfolds the rest. */}
              {(() => {
                const rows = plan.rows;
                const many = rows.length > 1;
                const TEASER = 4; // first clear + up to three dissolving
                const shown = liftsOpen ? rows : rows.slice(0, TEASER);
                // Sharp text faded by an alpha mask: clear at the top, gone by the
                // bottom. Keep the first hidden row legible, dissolve downward.
                const dissolve = "linear-gradient(180deg, #000 0%, #000 14%, rgba(0,0,0,.28) 68%, transparent 100%)";
                const cells = (r: (typeof rows)[number]) => (
                  <>
                    <span style={{ fontWeight: 600, fontSize: fs.bodyLg }}>{r.session ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginRight: 7 }}>{r.session}</span> : null}{r.name}{r.note ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}> ({r.note})</span> : null}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), textAlign: "right", flexShrink: 0 }}>{r.detail}</span>
                  </>
                );
                const rowStyle = (i: number): CSSProperties => ({ display: "flex", justifyContent: "space-between", gap: space.md, paddingTop: 6, borderTop: i ? `1px solid ${C("line")}` : "none" });
                if (many && !liftsOpen) {
                  const [lead, ...rest] = shown;
                  return (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
                        {lead && <div style={rowStyle(0)}>{cells(lead)}</div>}
                        <div style={{ display: "flex", flexDirection: "column", gap: space.xs, WebkitMaskImage: dissolve, maskImage: dissolve }}>
                          {rest.map((r, i) => (
                            <div key={i} aria-hidden style={{ ...rowStyle(i + 1), userSelect: "none", pointerEvents: "none" }}>{cells(r)}</div>
                          ))}
                        </div>
                      </div>
                      <button ref={showLiftsRef} onClick={() => toggleLifts(true)} aria-expanded={false} style={{ marginTop: 6, display: "block", marginLeft: "auto", marginRight: "auto", cursor: "pointer", background: `color-mix(in srgb, ${C("lime")} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${C("lime")} 40%, transparent)`, color: "var(--lime-text)", borderRadius: 999, padding: "6px 15px", fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600 }}>
                        {t("w.home.today.showAllLifts")} {rows.length} {t("w.home.today.liftsWord")} →
                      </button>
                    </>
                  );
                }
                return (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
                      {shown.map((r, i) => (<div key={i} style={rowStyle(i)}>{cells(r)}</div>))}
                    </div>
                    {many && liftsOpen && (
                      <button ref={hideLiftsRef} onClick={() => toggleLifts(false)} aria-expanded style={{ marginTop: 10, display: "block", width: "100%", textAlign: "center", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>
                        {t("w.home.today.hideLifts")}
                      </button>
                    )}
                  </>
                );
              })()}
              {!isAthlete && (
                <button
                  onClick={() => (onNavigate ? onNavigate("upgrade") : router.push("/upgrade"))}
                  style={{ marginTop: 12, width: "100%", display: "block", padding: "11px 13px", cursor: "pointer", textAlign: "left", border: `1px dashed color-mix(in srgb, var(--premium-accent) 40%, transparent)`, background: "transparent" }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.5, color: C("ash") }}><span style={{ color: "var(--premium-accent-text)" }}>[note]</span> {t("w.home.today.followingAsWritten1")}{t("w.home.today.unlockFull")}{t("w.home.today.followingAsWritten2")}</span>
                </button>
              )}
              {/* Primary action anchored at the BOTTOM of the plan card, below the note.
                  Stamps the plan-composed title so the saved session is recognised
                  as the plan's own (parity with the mobile plan prefill). */}
              <button
                onClick={() => onStart(plan.blocks, `${plan.planName} – ${plan.day}`)}
                className="start-glow"
                style={{ marginTop: 14, width: "100%", display: "block", background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "13px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg, cursor: "pointer" }}
              >
                <CtaLabel>{t("w.home.today.start")}</CtaLabel>
              </button>
            </>
          ) : loading ? (
            // Cold start — sessions AND enrollment are still loading, so we
            // can't yet tell an enrolled athlete from a first-run one. Show a
            // skeleton (not the chooser, not a stand-in AI session) so the plan
            // simply appears once it resolves, with no "How do you want to
            // start?" flash in between.
            <>
              <div style={{ height: 24, width: "60%", borderRadius: 8, background: C("line"), opacity: 0.5, margin: "8px 0 10px" }} />
              <div style={{ height: 12, width: "90%", borderRadius: 6, background: C("line"), opacity: 0.35 }} />
            </>
          ) : isAthlete && hasData ? (
            // PREMIUM only — the real readiness-driven AI prescription, and ONLY
            // when grounded in logged history. Casual users and no-data accounts
            // (even with an onboarding-created macrocycle phase) fall through to
            // the encouraging chooser — no fabricated session presented as theirs.
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
          ) : // The first-run chooser renders OUTSIDE this card (directly on
          //  the page, above) — this branch is unreachable in that state.
          null}
        </div>
      )}

      {/* EXERCISES — the favourites widget rail (free for everyone): swipeable
          full-bleed cards, one favourite per purpose, stock-ticker deltas; tap
          opens that movement's own stats page. Hidden until there's history —
          an empty rail would just be chrome. */}
      {onOpenExercise && sessions.length > 0 && (
        <ExerciseWidgetRail sessions={sessions} onOpen={onOpenExercise} onAll={() => (onNavigate ? onNavigate("exercises") : router.push("/analyze"))} />
      )}

      {/* DONE TODAY — every session logged on the VIEWED day, one row each: the
          plan's workout (wearing a Plan tag, lime tile) AND the off-plan extras
          (teal tile — quick sport logs, freestyle sessions). The card above is
          the SCHEDULED day (Start / Skip / Postpone); this one is what was
          actually done, complete — the count and the rows always agree. Always
          rendered — empty it explains itself — and it leads with the day's done
          count as its display-weight stat (moved in from the feeling card).
          Follows the week rail's selected day (dayTs) — on another day the label
          carries the date and the log row hides (quick logs save at "now").
          Hidden only for a true first run (no plan, nothing ever logged): the
          first-run chooser above already owns that state, and
          a 0-count card under it would be a second competing log CTA. */}
      {(!!sched || sessions.length > 0) && (
        <AlsoTodayCard
          rows={doneOnDay}
          planIds={fulfilledIds}
          doneCount={doneOnDay.length}
          isToday={dayIsToday}
          dayLabel={dayLabel}
          units={units}
          bw={bw}
          onOpen={(id) => (onOpenSession ? onOpenSession(id) : onNavigate ? onNavigate("history") : router.push("/history"))}
          onLog={() => setQuickOpen(true)}
          onDone={() => setDoneOpen(true)}
        />
      )}

      {/* TIER 2 — the feeling-led card: the daily check-in IS the ritual. The four
          faces set the day's readiness inline (one tap, no sheet) — nothing else;
          the done count + log action live on the Also Today card above. Follows
          the rail's selected day: a past day shows (and can back-log) THAT day's
          feeling; a future day is read-only — you can't feel the future. */}
      <FeelingCard
        feeling={feeling}
        loggedAt={feelingAt}
        cooldownFrom={lastCheckinAt}
        isToday={dayIsToday}
        isFuture={dayIsFuture}
        dayTs={railDay?.ts ?? null}
        dayLabel={dayLabel}
        onPicked={loadFeeling}
      />

      {/* ───── GO FULL — Cockpit + Sport premium baits (sand = premium upsell).
          Explore-standard section head (bold display title); the ✦ stays — it's
          the semantic premium signifier, not a decorative marker. ───── */}
      <div style={{ margin: "26px 2px 12px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("chalk") }}><span style={{ color: "var(--premium-accent-text)" }}>✦</span> {t("w.home.today.goFull")}</span>
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

      {/* ───── RECOVER & MORE — the nutrition Fuel summary + deferred rows
          (coaches). Explore-standard section head — no marker dot. ───── */}
      <div style={{ margin: "26px 2px 12px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("chalk") }}>{t("w.home.today.recoverMore")}</span>
      </div>
      {/* FUEL — the nutrition summary widget (one calendar-style stateful surface:
          empty → refuel / on-track / over → goal-hit, with a persistent quick-log
          rail). Shows on the real today only; a scrubbed past/future day scopes
          the cards above but nutrition targets are always today's. State + macros
          come from @hybrid/core fuelToday() so mobile matches. Tapping opens the
          same quick-add sheet the coach/nutrition rows use. */}
      {dayIsToday && <AuroraFuel sessions={sessions} onOpen={() => setNutritionOpen(true)} />}
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        <DeferRow glyph="★" tint="ash" title={t("w.home.today.rowCoach")} sub={t("w.home.today.rowCoachSub")} onClick={() => setCoachOpen(true)} />
      </div>

      {/* QUICK LOG sheet — the sport-log carousel, opened from the glance strip. */}
      <Sheet open={quickOpen} onClose={() => setQuickOpen(false)} title={t("w.home.quickSport.title")} sub={t("w.home.quickSport.sub")}>
        <QuickSportLog sessions={sessions} onSaved={() => { onSaved?.(); setQuickOpen(false); }} solid />
      </Sheet>

      {/* NUTRITION sheet — the compact "Add a meal" quick-add + premade meals. */}
      <Sheet open={nutritionOpen} onClose={() => setNutritionOpen(false)} label={t("w.home.today.w.nutrition")}>
        <AuroraNutrition compact onNavigate={(s) => { setNutritionOpen(false); onNavigate?.(s); }} />
      </Sheet>

      {/* FOLLOW A COACH sheet — the coach rail (renders its own header). */}
      <Sheet open={coachOpen} onClose={() => setCoachOpen(false)} label={t("w.home.today.rowCoach")}>
        <CoachRail onOpen={() => { setCoachOpen(false); if (onNavigate) onNavigate("coaches"); else router.push("/coaches"); }} />
      </Sheet>

      {/* QUICK START sheet — re-launch a saved routine (favourites + rediscover). */}
      <QuickStartSheet
        open={quickStartOpen}
        onClose={() => setQuickStartOpen(false)}
        routines={routines ?? []}
        onLaunch={launchRoutine}
        onToggleFavourite={toggleFavourite}
        onBuildNew={() => (onNavigate ? onNavigate("builder") : router.push("/builder"))}
      />

      {/* DONE TODAY sheet — everything logged on the viewed day + the calendar. */}
      <Sheet
        open={doneOpen}
        onClose={() => setDoneOpen(false)}
        title={dayIsToday ? t("w.home.today.doneModalTitle") : t("w.home.today.glanceDoneOn").replace("{d}", dayLabel ?? "")}
        sub={dayIsToday ? `${dateStr}${acc.streak.current > 0 ? ` – 🔥 ${acc.streak.current}${t("w.home.today.dayStreak")}` : ""}` : dayLabel ?? ""}
      >
        {doneOnDay.length === 0 ? (
          <div style={{ fontSize: fs.body, color: C("ash"), lineHeight: 1.5, padding: "8px 0" }}>{t(dayIsToday ? "w.home.today.doneModalEmpty" : "w.home.today.doneModalEmptyDay")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {doneOnDay.map((s) => (
              <button key={s.id} onClick={() => { setDoneOpen(false); if (onNavigate) onNavigate("history"); else router.push("/history"); }} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", borderBottom: `1px solid ${C("line")}`, padding: "12px 2px", cursor: "pointer", color: C("chalk") }}>
                <span style={{ width: 30, height: 30, borderRadius: 999, flexShrink: 0, background: `color-mix(in srgb, ${C("lime")} 18%, transparent)`, border: `1px solid ${C("lime")}`, display: "grid", placeItems: "center", color: "var(--lime-text)", fontWeight: 800 }}>✓</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: fs.note, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
                  <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sessionMeta(s, units, bw(s.startedAt))}</span>
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
/** One card of the first-run chooser — the Go-Full AccessCard anatomy (corner
 *  glow, title, body, CTA at the bottom in mono uppercase) turned toward the
 *  beginner, tinted by the path's accent. Full-width in a stacked column at
 *  natural height; the hue lives in the small glyph + CTA only — title and
 *  body stay neutral. Mirrored on mobile (aurora/home.tsx ChooserCard). */
function ChooserCard({ glyph, accent, title, sub, cta, onClick }: { glyph: string; accent: "lime" | "blue" | "amber" | "violet"; title: string; sub: string; cta: string; onClick: () => void }) {
  const fill = C(accent);
  const text = `var(--${accent}-text)`;
  return (
    <button
      onClick={onClick}
      aria-label={title}
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", background: `radial-gradient(120% 80% at 88% -10%, color-mix(in srgb, ${fill} 13%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, ${fill} 5%, ${C("ink2")}), ${C("ink2")})`, border: `1px solid ${C("line")}`, borderRadius: 24, padding: 20, cursor: "pointer", color: C("chalk"), boxShadow: "var(--shadow-card)" }}
    >
      <span aria-hidden style={{ fontSize: 19, lineHeight: 1, color: text }}>{glyph}</span>
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20, letterSpacing: "-.02em", marginTop: 12 }}>{title}</span>
      <span style={{ fontSize: fs.note, lineHeight: 1.5, color: C("ash"), marginTop: 7 }}>{sub}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: text, paddingTop: 14 }}>{cta} →</span>
    </button>
  );
}

/** The chooser, demoted — once real history exists the three full onboarding
 *  cards become a horizontal snap slider under a quiet "Train your way" head
 *  (logbook mode): each card keeps the ChooserCard's Go-Full anatomy (corner
 *  glow, glyph, title, sub, mono CTA) at rail width, so the options stay
 *  reachable without re-onboarding a regular every day.
 *  Mirrored on mobile (aurora/home.tsx StructureCard). */
function StructureCard({ glyph, accent, title, sub, cta, onClick }: { glyph: string; accent: "lime" | "blue" | "amber" | "violet"; title: string; sub: string; cta: string; onClick: () => void }) {
  const fill = C(accent);
  const text = `var(--${accent}-text)`;
  return (
    <button
      onClick={onClick}
      aria-label={title}
      style={{ flex: "0 0 min(72%, 300px)", scrollSnapAlign: "center", display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", background: `radial-gradient(120% 80% at 88% -10%, color-mix(in srgb, ${fill} 13%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, ${fill} 5%, ${C("ink2")}), ${C("ink2")})`, border: `1px solid ${C("line")}`, borderRadius: 24, padding: 18, cursor: "pointer", color: C("chalk"), boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)" }}
    >
      <span aria-hidden style={{ fontSize: 15, lineHeight: 1, color: text }}>{glyph}</span>
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, letterSpacing: "-.02em", marginTop: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{title}</span>
      <span style={{ fontSize: fs.caption, color: C("ash"), marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{sub}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: text, paddingTop: 12 }}>{cta} →</span>
    </button>
  );
}

/** Readiness/score dial — a ring of TICK MARKS (lit up to the value) with the
 *  number in the middle, matching the mobile kit Ring so web + mobile read the
 *  same. The ticks are the "number effect" from the original Your Plan Today. */
function Ring({ value, color, size = 44, ticks = 32, center }: { value: number; color: string; size?: number; ticks?: number; center?: React.ReactNode }) {
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
      <span style={{ position: "relative" }}>{center ?? <span style={{ fontWeight: 800, fontSize: fs.body, color: C("chalk") }}>{Math.round(value)}</span>}</span>
    </div>
  );
}


// One-line meta for a session logged today — sport-adaptive so a run/match reads
// as distance·time (not the gym Sets/Volume framing) and a lift reads as tonnage.
function sessionMeta(s: LoggedSession, units: "kg" | "lb", bw?: number | null): string {
  if (sessionShape(s) !== "strength") {
    const ct = sessionCardioTotals(s.blocks);
    const p: string[] = [];
    if (ct.distanceKm) p.push(`${ct.distanceKm.toFixed(1)} km`);
    if (ct.minutes) p.push(`${ct.minutes} min`);
    if (p.length) return p.join(" – ");
    return s.blocks.map((b) => b.name).join(" – ");
  }
  const vol = sessionVolume(s.blocks, false, bw);
  const names = s.blocks.map((b) => b.name).join(" – ");
  return vol > 0 ? `${fmtTonnage(vol, units)} – ${names}` : names;
}

// A compact quick-access tile (Cockpit / Sport). A `locked` tile carries the ✦
// Full accent + a lime rim; an unlocked one shows the → chevron.
// A deferred row (Tier 3) — a slim tap-through to a secondary surface
// (Nutrition, Coaches), with a tinted glyph, title + sub, and a chevron.
// Recover & more — an "airy band": a roomy tap-target on the real palette
// surface (ink2 + hairline), with a crafted icon tile that lifts off the row
// (drawn on the darker ink so it reads as its own object), a display title and a
// mono descriptor. The whole row is the same material vocabulary as the cards
// above it, just laid out with more air.
function DeferRow({ glyph, tint, title, sub, onClick }: { glyph: string; tint: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 18, padding: "15px 16px", cursor: "pointer", color: C("chalk") }}>
      <span style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <span style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: "grid", placeItems: "center", background: C("ink"), border: `1px solid ${C("line")}`, color: C(tint), fontSize: 19 }}>{glyph}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 700, fontSize: fs.subtitle, letterSpacing: "-.01em" }}>{title}</span>
          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 3 }}>{sub}</span>
        </span>
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.subtitle, color: `color-mix(in srgb, ${C("ash")} 55%, transparent)`, flexShrink: 0 }}>›</span>
    </button>
  );
}

// The "Done today" card, "number is the card" redesign: the day's TOTAL done
// count (plan + off-plan) is the card's display-weight headline — the whole
// stat strip taps through to the Done-Today sheet — with EVERY done session as
// a row beneath it (the count and the rows always agree: a plan-claimed row
// wears a lime tile + Plan tag, an off-plan one the teal tile) and the log
// action as a ghost row in the same vocabulary. Always rendered: empty, the
// numeral reads 0 and the sub-line does the inviting. Line-free inside
// (surface fills + spacing, no hairlines/outlines/chips/pills) — the card's
// own edge is the only border, with one deliberate exception: the ghost ＋
// tile wears a dashed outline (the add affordance).
// Rows open the session's breakdown. Mirrored on mobile (aurora/home.tsx).
function AlsoTodayCard({ rows, planIds, doneCount, isToday, dayLabel, units, bw, onOpen, onLog, onDone }: {
  rows: LoggedSession[];
  planIds: Set<string>;
  doneCount: number;
  /** false when the week rail has another day selected — the label carries the
   *  date and the log row hides (a quick log always saves at "now"). */
  isToday: boolean;
  dayLabel: string | null;
  units: "kg" | "lb";
  bw: (isoDate?: string) => number | null;
  onOpen: (sessionId: string) => void;
  onLog: () => void;
  onDone: () => void;
}) {
  const { t } = useLang();
  const quiet = `color-mix(in srgb, ${C("ash")} 60%, transparent)`;
  // caption + log-label state machine lives in core so the mobile twin can't drift
  const copy = alsoTodayCopy({ doneCount, isToday });
  const doneLabel = isToday ? t("w.home.today.glanceDone") : t("w.home.today.glanceDoneOn").replace("{d}", dayLabel ?? "");
  return (
    <div style={{ marginTop: 16, border: `1px solid ${C("line")}`, borderRadius: 22, padding: 18, background: C("ink2") }}>
      {/* stat strip — the number IS the card (tap = the Done-Today sheet) */}
      <button type="button" onClick={onDone} aria-label={`${doneCount} ${doneLabel}${copy.subKey ? `, ${t(copy.subKey)}` : ""}`} style={{ width: "100%", display: "flex", alignItems: "center", gap: 16, background: "none", border: "none", padding: "6px 0 4px", cursor: "pointer", textAlign: "left", color: C("chalk") }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 44, letterSpacing: "-.05em", lineHeight: 0.9, fontVariantNumeric: "tabular-nums", flexShrink: 0, color: doneCount > 0 ? C("chalk") : quiet }}>{doneCount}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash") }}>{doneLabel}</span>
          {copy.subKey && <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.5, color: quiet, marginTop: 6 }}>{t(copy.subKey)}</span>}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: quiet, flexShrink: 0 }}>→</span>
      </button>
      {/* rows + the ghost action row — one vocabulary, separated by space alone */}
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((s) => {
          const onPlanRow = planIds.has(s.id);
          return (
            <button type="button" key={s.id} onClick={() => onOpen(s.id)} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: "8px 0", cursor: "pointer", color: C("chalk") }}>
              <span style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 18, background: `color-mix(in srgb, ${C(onPlanRow ? "lime" : "blue")} 16%, transparent)` }}>
                {sessionIcon(s)}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 700, fontSize: fs.note, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {[sessionMeta(s, units, bw(s.startedAt)), sessionClockTime(s.startedAt)].filter(Boolean).join(" – ")}
                </span>
              </span>
              {onPlanRow && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--lime-text)", flexShrink: 0 }}>{t("w.home.today.kPlan")}</span>
              )}
            </button>
          );
        })}
        {isToday && (
          <button type="button" onClick={onLog} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: "8px 0", cursor: "pointer" }}>
            <span style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 17, background: "transparent", border: `1px dashed color-mix(in srgb, ${C("ash")} 40%, transparent)`, color: C("ash") }}>＋</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--lime-text)" }}>{t(copy.logKey)}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// The feeling-led daily card — "How ready do you feel?" with the four faces set
// the day's readiness inline (one tap → POST /api/checkins, the same write the
// full check-in makes). Single-purpose: the done count + log action moved up into
// the Also Today card. The picked face lights in its own semantic feeling colour.
// Day-scoped via the week rail: a past day shows THAT day's feeling and a tap
// back-logs it (weekOf = that day); a future day is read-only. The 6h re-log
// cooldown mirrors the server's — global across days (keyed on the last WRITE),
// so `cooldownFrom` is the newest check-in's createdAt, not the viewed day's.
function FeelingCard({ feeling, loggedAt, cooldownFrom, isToday, isFuture, dayTs, dayLabel, onPicked }: {
  feeling: ReadinessFeeling | null;
  loggedAt: number | null;
  cooldownFrom: number | null;
  isToday: boolean;
  isFuture: boolean;
  dayTs: number | null;
  dayLabel: string | null;
  onPicked: () => void;
}) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  // The 6h re-log window: while it's open, show "next in Xh Ym". The faces lock
  // while cooling (the server would reject the write anyway) and on future days.
  const coolMs = cooldownFrom != null ? checkinCooldownRemainingMs(cooldownFrom) : 0;
  const cooling = coolMs > 0;
  const locked = busy || cooling || isFuture;
  const coolMin = Math.ceil(coolMs / 60000);
  const coolH = Math.floor(coolMin / 60);
  const coolM = coolMin % 60;
  const pick = async (rating: number) => {
    if (locked) return;
    setBusy(true);
    try {
      // Back-logging a past day stamps that day's noon (local) so the check-in
      // lands on the viewed date regardless of timezone; today logs "now".
      const weekOf = isToday || dayTs == null ? new Date().toISOString() : new Date(dayTs + 12 * 3600 * 1000).toISOString();
      const res = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekOf, energy: rating, sleep: rating, soreness: rating, mood: rating }),
      });
      if (res.ok) onPicked();
    } catch {
      // a failed tap simply doesn't set — the athlete can tap again
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ marginTop: 16, border: `1px solid ${C("line")}`, borderRadius: 22, padding: 18, background: C("ink2") }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: fs.subtitle, letterSpacing: "-.01em" }}>{t("w.recovery.readiness.title")}</div>
        {/* viewing another day — the date names the scope, no extra copy */}
        {!isToday && dayLabel && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), whiteSpace: "nowrap", flexShrink: 0 }}>{dayLabel}</span>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, margin: "16px 0 2px" }}>
        {READINESS_FEELINGS.map((key, i) => {
          const on = feeling === key;
          const at = `var(--${READINESS_FACE[key].accent}-text)`;
          return (
            <button key={key} onClick={() => pick(i + 2)} disabled={locked} aria-label={t(`w.recovery.readiness.${key}`)} aria-pressed={on}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "10px 0", borderRadius: 16, cursor: locked ? "default" : "pointer", background: on ? `color-mix(in srgb, ${at} 12%, transparent)` : "transparent", border: on ? `1px solid color-mix(in srgb, ${at} 40%, transparent)` : "1px solid transparent", opacity: locked && !on ? 0.45 : 1, transition: "background .15s, opacity .15s" }}>
              <ReadinessFace feeling={key} size={36} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: on ? at : C("ash") }}>{t(`w.recovery.readiness.${key}`)}</span>
            </button>
          );
        })}
      </div>
      {/* the day's logged feeling + the re-log cooldown chip. The chip also shows
          alone while cooling (it explains why the faces are locked on a day
          without its own check-in). */}
      {((feeling && loggedAt != null) || cooling) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          {feeling && loggedAt != null && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
              {t("w.home.today.feelLogged")} <b style={{ color: C("chalk"), fontWeight: 700 }}>{t(`w.recovery.readiness.${feeling}`)}</b>, {relativeTime(loggedAt)}
            </span>
          )}
          {cooling && (
            <span style={{ marginLeft: "auto", flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "6px 10px" }}>
              {t("w.home.today.feelNextIn")} {coolH}h {coolM}m
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function AccessCard({ title, sub, locked, onClick }: { title: string; sub: string; locked: boolean; onClick: () => void }) {
  const { t } = useLang();
  return (
    <button
      onClick={onClick}
      aria-label={title}
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", minHeight: 220, background: `radial-gradient(120% 80% at 88% -10%, color-mix(in srgb, var(--premium-accent) 12%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--premium-accent) 5%, ${C("ink2")}), ${C("ink2")})`, border: `1px solid ${C("line")}`, borderRadius: 24, padding: 20, cursor: "pointer", color: C("chalk"), boxShadow: "var(--shadow-card)" }}
    >
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 26, letterSpacing: "-.02em" }}>{title}</span>
      {/* body grows so the CTA pins to the card bottom — both cards stretch to equal
          height (grid 1fr/1fr), so the title, body-start and CTA line up across the
          pair no matter how many lines the copy runs. Body is the display face
          (per tokens: display = headings + body, mono = labels/numbers). */}
      <span style={{ fontSize: fs.bodyLg, lineHeight: 1.5, letterSpacing: "-.005em", color: C("ash"), flexGrow: 1, marginTop: 10 }}>{sub}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--premium-accent-text)", paddingTop: 18 }}>{locked ? t("w.home.today.cardUnlock") : t("w.home.today.cardOpen")} →</span>
    </button>
  );
}


