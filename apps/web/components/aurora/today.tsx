"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { fs, space,
  localDayKey,
  prescribeSession,
  computeAccountability,
  buildActivityFeed,
  planProgramToday,
  personalTrainingLog,
  velocityProfiles,
  sessionsOnDay,
  sessionShape,
  sessionCardioSummary,
  sessionVolume,
  fmtTonnage,
  FUNNEL,
  ROLE_COLOR,
  readinessRole,
  quickCheckinFeeling,
  quickCheckinPatch,
  checkinScaleFeeling,
  QUICK_CHECKIN_METRIC,
  dayCompleteness,
  firstOutstandingIndex,
  checkinSteps,
  metricLabelKey,
  feelSchedule,
  stepAnswered,
  type CheckinMetrics,
  type CheckinSessionRef,
  readinessContext,
  readinessNoteKey,
  hoursSince,
  readGate,
  placeReads,
  decisiveFeeling,
  decisiveRead,
  readTrend,
  READ_GATE_KEY,
  READ_TREND_KEY,
  MAX_READS_PER_DAY,
  type PlacedRead,
  type ReadGate,
  planSchedule,
  masthead,
  alsoTodayCopy,
  sessionClockTime,
  sessionIcon,
  READINESS_FEELINGS,
  READINESS_FACE,
  logbookWeek,
  todayDoneState,
  type PerformanceViewId,
  type TodayTabId,
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
import { useCheckins } from "@/lib/use-checkins";
import { useRevalidate } from "@/lib/use-invalidate";
import { useToday } from "@/lib/use-today";
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
import AuroraTodayRail from "./today-rail";
import Sheet from "./sheet";
import QuickStartSheet, { type QuickRoutine } from "./quick-start";
import AuroraNutrition from "./nutrition";
import AuroraFuel from "./fuel";
import AuroraEnduranceLanes from "./endurance-lanes";
import AuroraWeekVerdict from "./week-verdict";
import AuroraOtherSports from "./other-sports";
import CoachRail from "./coach-rail";
import { AuroraIcon } from "./icons";
import { CtaLabel } from "./cta-label";
import ReadinessFace from "./readiness-face";
import FetchError from "./fetch-error";
import { PerformanceViews, TodayTabs } from "./today-tabs";
// The guided daily check-in, hosted INSIDE Today's feeling card (see FeelingCard).
// Lazy so the wizard's weight only lands when an athlete actually expands it.
const AuroraCheckins = dynamic(() => import("./checkins"), { ssr: false });
// THE HUB's other two tabs. Lazy for the same reason: an athlete who only ever
// opens the daily loop should never pay for recharts or the social feed.
const AuroraPerformance = dynamic(() => import("./performance"), { ssr: false });
const AuroraVolume = dynamic(() => import("./volume"), { ssr: false });
const AuroraTrends = dynamic(() => import("./trends"), { ssr: false });
const SocialFeed = dynamic(() => import("../social-feed"), { ssr: false });

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
  onEnrolled,
  fetchError = false,
  onRetry,
  loading = false,
  sessionsReady = true,
  macroReady = true,
  macroSettled = true,
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
  /** The athlete enrolled in a season from the hub's Performance tab — the
   *  shell refetches the macrocycle and returns them to the daily loop. */
  onEnrolled?: () => void;
  /** True when the sessions fetch FAILED (offline / 500) — with no cached data
   *  the daily-loop hero shows a retry card instead of the first-run chooser,
   *  so a dropped network never masquerades as "looks like a new athlete". */
  fetchError?: boolean;
  /** Re-run the sessions fetch (wired to useSessions().refresh). */
  onRetry?: () => void;
  /** True while the first sessions OR enrollment fetch is in flight —
   *  suppresses the cold-start chooser so an already-enrolled athlete never
   *  sees the first-run-chooser flash before their plan resolves. */
  loading?: boolean;
  /** SAFE CACHE gates, threaded straight through to the hub's Performance tab
   *  so it can still tell "no training history" from "we haven't asked yet"
   *  when it renders here instead of as its own screen. */
  sessionsReady?: boolean;
  macroReady?: boolean;
  macroSettled?: boolean;
}) {
  const router = useRouter();
  const { t } = useLang();
  const { session } = useSession();
  const name = session?.name ?? "Athlete";
  const isAthlete = usePersona() !== "casual";

  // THE HUB — which of Today's three top-level views is showing (see
  // @hybrid/core today-tabs.ts). Deliberately NOT persisted: Today is the app's
  // home and its job is "what do I do today?", so every visit opens on the
  // daily loop rather than wherever the athlete last wandered. The Performance
  // tab's own sub-view IS remembered for the session, so switching away and
  // back doesn't throw away the chip they picked.
  const [tab, setTab] = useState<TodayTabId>("dashboard");
  const [perfView, setPerfView] = useState<PerformanceViewId>("performance");
  const selectTab = useCallback((id: TodayTabId) => { setTab(id); track("today_tab", { tab: id }); }, []);

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

  const log = useMemo(() => personalTrainingLog(sessions), [sessions]);
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
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
  // This holds for EVERYONE with history and no plan — premium included: Today's
  // hero is your plan/calendar (or a path to one), never a fabricated AI session
  // presented as "yours". The readiness-driven daily prescription lives on the
  // Cockpit (the analytical layer), not spliced into Today as a hardcoded lift.
  const logbookMode = !plan && !loading && hasData;
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
  // ── Today's sticky pill rail ──────────────────────────────────────────────
  // Each pill is measured off its own source card's bottom edge, so the three
  // anchors below are the ONLY coupling between this screen and the rail; the
  // capture rule itself lives in core (today-rail.ts) and is shared with
  // mobile. The rail always reads the REAL today, never the scrubbed day — a
  // pinned bar that followed the rail's selection would contradict itself.
  const railWeekRow = useRef<HTMLDivElement | null>(null);
  const railSourceCard = useRef<HTMLDivElement | null>(null);
  const railFeelingCard = useRef<HTMLDivElement | null>(null);
  const railAnchors = useMemo(
    () => ({ date: railWeekRow, done: railSourceCard, ready: railFeelingCard }),
    [],
  );
  // The same seven days the week strip draws, so the capsule's dot track and
  // the strip can never disagree. logbookWeek is the trailing window ending
  // today for BOTH modes — the plan rail's own window is plan-relative, and a
  // pinned capsule must always end on today.
  const railWeek = useMemo(() => logbookWeek(sessions), [sessions]);
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
  // From the SHARED cache (lib/use-checkins), so Today and Performance read one
  // entry instead of each holding a private copy that the other's write can't
  // reach — and so a failed fetch surfaces as a failure rather than silently
  // resolving to "you haven't checked in".
  const checkinsRead = useCheckins();
  const checkins = checkinsRead.data ?? [];
  const loadFeeling = checkinsRead.retry;
  // `today` is a DEPENDENCY, not a call to the clock inside the memo — without
  // it this only recomputed when `checkins` changed, so a tab open across
  // midnight kept yesterday's check-in as today's. See lib/use-today.ts.
  const today = useToday();
  // The viewed day's check-in (if any) → its feeling + logged-at time.
  const dayCheckin = useMemo(() => {
    const dstr = dayTs == null ? today : localDayKey(dayTs);
    return checkins.find((c) => c && c.weekOf && localDayKey(c.weekOf) === dstr) ?? null;
  }, [checkins, dayTs, today]);
  // THE ANSWER TO THE QUESTION THAT WAS ASKED. This was `checkinFeeling` — the
  // average of every metric present — so the face highlighted under "how ready
  // do you feel?" drifted off the one the athlete tapped the moment they
  // answered the other three: tap Primed, log sleep 3 / freshness 2 / mood 4,
  // and the card came back highlighting Good and reporting "you logged Good".
  // The card now shows the readiness answer itself. The AVERAGE is still what
  // feeds the load model below (todayFeeling) — that is a different question and
  // more signal genuinely helps it.
  const feeling = quickCheckinFeeling(dayCheckin);
  // BUG FIX: this read `weekOf` — the day the check-in COVERS, which for a
  // back-logged day is that day's NOON. "Logged 4 hours from now" is what that
  // produced. `createdAt` is when the row was actually written; weekOf is only
  // the fallback for a row that predates it.
  const feelingAt = useMemo(() => {
    const ts = Date.parse(dayCheckin?.createdAt ?? dayCheckin?.weekOf ?? "");
    return Number.isFinite(ts) ? ts : null;
  }, [dayCheckin]);
  // The sessions the athlete trained on the VIEWED day — one effort question
  // each in the follow-up. Empty on a rest day, which makes the flow exactly
  // the four daily questions it has always been.
  const daySessions = useMemo<CheckinSessionRef[]>(() => {
    const dstr = dayTs == null ? today : localDayKey(dayTs);
    return sessions
      .filter((s) => s.startedAt && localDayKey(s.startedAt) === dstr)
      .map((s) => ({ id: s.id, title: s.title, startedAt: s.startedAt, feel: s.feel ?? null }));
  }, [sessions, dayTs, today]);

  // How long ago the athlete last finished a session — the lens the day's
  // answer is read through. "Wrecked" 90 minutes after training is the session
  // talking; the same tap a day later is a recovery signal. See core/feel-timing.
  const lastSessionEnd = useMemo(() => {
    let best: number | null = null;
    for (const s of sessions) {
      const ts = Date.parse(s.completedAt ?? s.startedAt ?? "");
      if (Number.isFinite(ts) && (best == null || ts > best)) best = ts;
    }
    return best;
  }, [sessions]);
  // Every session end, for placing a read against the training before it.
  const sessionEnds = useMemo(
    () => sessions.map((s) => Date.parse(s.completedAt ?? s.startedAt ?? "")).filter((t) => Number.isFinite(t)),
    [sessions],
  );
  // THE VIEWED DAY AS A SEQUENCE, not a value. Each readiness answer is its own
  // row now (Checkin.reads) — "flat at 09:30" and "flat at 22:00" are two
  // measurements of two different things, and the second is the one that should
  // move training. A row from a database that hasn't run the reads migration
  // falls back to the single stored value, which is exactly what it used to be.
  const dayReads = useMemo<PlacedRead[]>(() => {
    const rows = (dayCheckin?.reads ?? []).filter((r) => r.metric === QUICK_CHECKIN_METRIC);
    const raw = rows.length
      ? rows.map((r) => ({ value: r.value, at: Date.parse(r.loggedAt) }))
      : dayCheckin && typeof dayCheckin[QUICK_CHECKIN_METRIC] === "number" && feelingAt != null
        ? [{ value: dayCheckin[QUICK_CHECKIN_METRIC]!, at: feelingAt }]
        : [];
    return placeReads(raw, sessionEnds);
  }, [dayCheckin, feelingAt, sessionEnds]);
  // The most recent readiness READ (not the row write): what the re-log gate and
  // the recovery schedule are both measured from.
  const lastReadAt = useMemo(
    () =>
      checkins.reduce<number | null>((m, c) => {
        const reads = (c?.reads ?? []).filter((r) => r.metric === QUICK_CHECKIN_METRIC);
        const ts = reads.length
          ? Date.parse(reads[reads.length - 1]!.loggedAt)
          : Date.parse(c?.createdAt ?? c?.weekOf ?? "");
        return Number.isFinite(ts) && (m == null || ts > m) ? ts : m;
      }, null),
    [checkins],
  );

  // WHICH READ IS DUE. The app asks about a session twice — once at the end of
  // it (the finish screen), once hours later, here. This is the second ask: the
  // one that says whether the session was absorbed, and the only one that can
  // move a training ceiling. See core/feel-schedule.ts.
  const recoveryDue = useMemo(() => {
    const sch = feelSchedule({
      sessions: sessions.map((x) => ({
        id: x.id,
        title: x.title,
        startedAt: x.startedAt,
        completedAt: x.completedAt ?? null,
        feel: x.feel ?? null,
        fatigue: x.fatigue ?? null,
        feelLoggedAt: x.feelLoggedAt ?? null,
      })),
      // The recovery read is answered by a READ, not by the row being touched:
      // editing the day's note in the evening is not a statement about how the
      // session drained.
      lastCheckinAt: lastReadAt,
    });
    return sch.due.find((p) => p.kind === "recovery") ?? null;
  }, [sessions, lastReadAt]);

  // MAY THE ATHLETE LOG A NEW READ. Two clocks — four hours since the last read,
  // and six hours since a session that read was taken in the shadow of — and the
  // later one wins. Today only: a past day carries no live session and is
  // back-logged, not re-read. See core/readiness-reads.ts.
  const todayCheckin = useMemo(
    () => checkins.find((x) => x && x.weekOf && localDayKey(x.weekOf) === today) ?? null,
    [checkins, today],
  );
  const todayReads = useMemo<PlacedRead[]>(() => {
    const rows = (todayCheckin?.reads ?? []).filter((r) => r.metric === QUICK_CHECKIN_METRIC);
    const raw = rows.length
      ? rows.map((r) => ({ value: r.value, at: Date.parse(r.loggedAt) }))
      : todayCheckin && typeof todayCheckin[QUICK_CHECKIN_METRIC] === "number"
        ? [{ value: todayCheckin[QUICK_CHECKIN_METRIC]!, at: Date.parse(todayCheckin.createdAt ?? todayCheckin.weekOf) }]
        : [];
    return placeReads(raw, sessionEnds);
  }, [todayCheckin, sessionEnds]);
  const readGateNow = useMemo<ReadGate>(
    () =>
      readGate({
        lastReadAt: todayReads.length ? todayReads[todayReads.length - 1]!.at : null,
        lastSessionEnd,
        readsToday: todayReads.length,
      }),
    [todayReads, lastSessionEnd],
  );

  // TODAY's readiness feeling (independent of which day the rail has selected)
  // — feeds the prescription so the one-tap check-in mechanically scales the
  // load the athlete sees AND starts (rx.blocks flow into onStart), and labels
  // the week rail's readiness pill.
  //
  // TWO BUGS, both already fixed for `dayCheckin` twenty lines up and both left
  // here. (1) It called the clock INSIDE the memo with no `today` dependency,
  // so a tab open across midnight kept scaling today's load off yesterday's
  // check-in. (2) It compared days with its own `toDateString()` while the rest
  // of the screen used `localDayKey` — two definitions of "today" in one
  // component. And it read `checkinFeeling`, the AVERAGE of four different
  // questions, which is what made the rail pill say "Good" while the card
  // directly beneath it highlighted the Primed face the athlete had tapped.
  // Subjective readiness is the answer to the readiness question; the pill and
  // the load nudge both quote it back ("you're feeling flat today"), so it has
  // to be what the athlete actually said.
  //
  // …and when the day carries more than one answer, it is the DECISIVE one —
  // the latest read not taken minutes after training. Prescribing off the tap
  // an athlete makes walking out of the gym would deload them for the crime of
  // having trained hard; prescribing off the read they gave hours later is the
  // whole reason the second read exists. See core/readiness-reads.ts.
  const todayFeeling = useMemo(
    () => decisiveFeeling(todayReads) ?? quickCheckinFeeling(todayCheckin),
    [todayReads, todayCheckin],
  );
  const rx = useMemo(
    () => prescribeSession(log, bio, { profiles: velocityProfiles(sessions), experience: intake.experience, equipment: intake.equipment, subjectiveReadiness: todayFeeling ?? undefined }),
    [log, bio, sessions, intake.experience, intake.equipment, todayFeeling],
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

  // The shell every hub tab wears: the profile header, then the three pills.
  // Hoisted so the non-dashboard tabs render the SAME masthead chrome without
  // a second copy of it — they differ only in what hangs below the pills.
  const shell = { maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)" } as const;
  const hubHeader = (
    <>
      {/* HEADER — profile, HYBRID wordmark, bell */}
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

      {/* THE HUB PILLS — Dashboard / Performance / Feed, directly under the
          profile row and above the calendar. Today is the athlete's home, and
          these three are what a home holds: the day's plan, the numbers behind
          it, and the people around it. Registry shared with mobile
          (@hybrid/core today-tabs.ts). */}
      <TodayTabs value={tab} onChange={selectTab} />
    </>
  );

  // ── THE OTHER TWO TABS ────────────────────────────────────────────────────
  // Early-return rather than wrapping the 800-line daily loop in a conditional:
  // every hook above has already run (order is stable), and the dashboard body
  // below stays exactly as it was.
  if (tab === "performance") {
    return (
      <div style={shell}>
        {hubHeader}
        <PerformanceViews value={perfView} onChange={setPerfView} />
        <div style={{ marginTop: 16 }}>
          {perfView === "performance" && (
            <AuroraPerformance
              sessions={sessions}
              bio={bio}
              macro={macro}
              currentWeek={currentWeek}
              sessionsReady={sessionsReady}
              macroReady={macroReady}
              macroSettled={macroSettled}
              setScreen={(s) => (onNavigate ? onNavigate(s) : router.push(`/${s}`))}
              onEnrolled={() => { onEnrolled?.(); setTab("dashboard"); }}
            />
          )}
          {perfView === "volume" && <AuroraVolume sessions={sessions} />}
          {perfView === "trends" && (
            <AuroraTrends sessions={sessions} onOpenExercise={onOpenExercise} onOpenVolume={() => setPerfView("volume")} />
          )}
        </div>
      </div>
    );
  }

  if (tab === "feed") {
    return (
      <div style={shell}>
        {hubHeader}
        <div style={{ marginTop: 16 }}><SocialFeed /></div>
      </div>
    );
  }

  return (
    <div style={shell}>
      {hubHeader}

      {/* THE STICKY PILL RAIL — what Today leaves behind once the masthead and
          the logbook have scrolled away. Zero-height in the flow: the bar is
          absolutely positioned over the content, so nothing below moves and the
          page scrolls UNDER the blur. Mirrors mobile home.tsx. */}
      <AuroraTodayRail
        anchors={railAnchors}
        days={railWeek.days}
        doneState={todayDoneState({
          loggedToday: railWeek.days[railWeek.days.length - 1]?.logged ?? false,
          planStatus: sched?.days.find((d) => d.isToday)?.status ?? null,
        })}
        feeling={todayFeeling}
        onOpenMonth={() => (onNavigate ? onNavigate("calendar") : router.push("/calendar"))}
        onOpenDone={() => (hasData ? setDoneOpen(true) : onStart())}
        onOpenCheckin={() => railFeelingCard.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
      />

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
      <div className="motion-masthead" style={{ margin: "16px 2px 2px" }}>
        <div className="motion-masthead-sub" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash") }}>{mastCaption || " "}</span>
          {firstRun || (logbookMode && !mastTag) ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap" }}>{t("w.home.today.badgeFree")}</span>
          ) : mastTag ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--amber-text)", whiteSpace: "nowrap" }}>{mastTag}</span>
          ) : null}
        </div>
        <div className="motion-masthead-title" style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 34, letterSpacing: "-.03em", lineHeight: 1.1, color: C("chalk"), marginTop: 2 }}>
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
      {fetchError && sessions.length === 0 ? (
        /* SESSIONS FAILED TO LOAD — with no cached data we can't tell an
           enrolled athlete from a first-run one, so the chooser here would read
           as "new user" when really the network dropped. Show the honest retry
           card instead of the empty-state chooser (parity with mobile home). */
        <div style={{ marginTop: 16 }}>
          <FetchError onRetry={() => onRetry?.()} />
        </div>
      ) : useRail ? (
        <div ref={railSourceCard}>
          <AuroraWeekRail
            planId={planId!}
            planStartedAt={planStartedAt!}
            sessions={sessions}
            maxes={planMaxes}
            onStart={onStart}
            onNavigate={onNavigate}
            onSelectDay={setRailDay}
            resetToken={railResetToken}
            weekRowRef={railWeekRow}
          />
        </div>
      ) : logbookMode ? (
        /* LOGBOOK MODE ("The Constant") — the same week-rail object, in
           logbook mode: the last seven days with the athlete's real logged
           training, so a plan-less regular gets the calendar from their first
           session instead of the chooser forever. The chooser demotes to slim
           rows under an Explore-standard "Add structure" head. */
        <div style={{ marginTop: 14 }}>
          <div ref={railSourceCard}>
            <AuroraLogbookRail
              sessions={sessions}
              onLog={() => onStart()}
              onNavigate={onNavigate}
              onSelectDay={setRailDay}
              resetToken={railResetToken}
              weekRowRef={railWeekRow}
            />
          </div>
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
            {/* The fourth path — always present (like the other three). With no
                saved routines the sheet shows its build-first empty state, so
                it's a prompt, not a dead door. */}
            <StructureCard glyph="⚡" accent="violet" title={t("w.home.today.chooserQuickTitle")} sub={t("w.home.logbook.slimQuickSub")} cta={t("w.home.today.chooserQuickCta")} onClick={() => setQuickStartOpen(true)} />
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
            <ChooserCard glyph="⚡" accent="violet" title={t("w.home.today.chooserQuickTitle")} sub={t("w.home.today.chooserQuickSub")} cta={t("w.home.today.chooserQuickCta")} onClick={() => setQuickStartOpen(true)} />
          </div>
        </div>
      ) : (
      <div data-tour="today-plan" style={{ ...card }}>
          {/* On a plan, Start is the full-width action anchored BELOW the lifts;
              the only thing riding the top row is the readiness ring, and only
              once there's logged history — a bare onboarding macrocycle must
              never surface a fabricated readiness score. (Plan-less athletes
              with history land in logbook mode, so this card only ever renders
              the plan hero or the cold-start skeleton.) */}
          {isAthlete && hasData && plan ? (
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
              <Ring value={rx.readiness} color={readyColor(rx.readiness)} />
            </div>
          ) : null}
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
              {/* Quiet secondary — reach the Quick-start sheet without leaving the
                  plan: on a plan the four "Train your way" cards aren't shown, so
                  this is the on-plan door to a saved routine (a session off-plan). */}
              <button
                onClick={() => setQuickStartOpen(true)}
                style={{ marginTop: 10, display: "block", width: "100%", textAlign: "center", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--violet-text)" }}
              >
                ⚡ {t("w.home.today.quickStartLink")}
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
          ) : // Every other state renders OUTSIDE this card: the first-run chooser
          //  and logbook mode (plan-less history, premium included) sit directly
          //  on the page above. This card only carries the plan hero + skeleton.
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
      <div ref={railFeelingCard}>
        <FeelingCard
          feeling={feeling}
          dayMetrics={dayCheckin}
          daySessions={daySessions}
          recoveryDue={recoveryDue != null || readGateNow.wanted}
          lastSessionEnd={lastSessionEnd}
          dayReads={dayReads}
          gate={readGateNow}
          isToday={dayIsToday}
          isFuture={dayIsFuture}
          dayTs={railDay?.ts ?? null}
          dayLabel={dayLabel}
          onPicked={loadFeeling}
        />
      </div>

      {/* ───── THIS WEEK — the verdict card. Sits directly under Readiness
          because it is the same KIND of thing: a verdict with its working-out
          shown. Replaces the Statistics and Analytics destinations on Today
          (both are now promotedTo "today" in core nav.ts); the two rows under it
          are the doors to everything past this week. Mirrors mobile. ───── */}
      <AuroraWeekVerdict
        sessions={sessions}
        units={units}
        bw={bw}
        showDeep={isAthlete}
        onArchive={() => (onNavigate ? onNavigate("history") : router.push("/history"))}
        onDeep={() => (onNavigate ? onNavigate("analytics") : router.push("/analytics"))}
      />

      {/* ───── ENDURANCE — sport lanes, directly under This week because the
          card's KM column is the headline these rails break down: the total and
          its per-sport detail now read as one thought instead of sitting at
          opposite ends of the scroll. One full-bleed rail per logged discipline
          carrying that sport's whole read (efforts / distance / time, 8-week
          volume, pace trend, pace zones, last effort). NOT gated on dayIsToday,
          unlike Fuel below: an eight-week volume chart is not a property of the
          day you happen to be scrubbed to. Renders nothing until there's
          endurance to show. Mirrors mobile. ───── */}
      {isAthlete && <AuroraEnduranceLanes sessions={sessions} onOpen={() => (onNavigate ? onNavigate("endurance") : router.push("/endurance"))} />}

      {/* ───── OTHER SPORTS — tennis, squash, five-a-side: everything logged as
          `discipline: "sport"`, the bucket ENDURANCE_DISCIPLINES deliberately
          excludes. It fed the week's sessions and hours and then had nowhere to
          appear. Sits under Endurance because it is the same question one step
          out: what else did you actually play. These sports are TIMED, so a
          sport gets ONE tile rather than a rail — the block spends its width on
          the NUMBER of sports, not the depth of each. Renders nothing until a
          sport is logged. Mirrors mobile. ───── */}
      <AuroraOtherSports sessions={sessions} onOpen={() => (onNavigate ? onNavigate("sport") : router.push("/sport"))} />

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
          onClick={() => (isAthlete ? (onNavigate ? onNavigate("performance") : router.push("/performance")) : upsell("today-cockpit"))}
        />
        <AccessCard
          title={t("w.home.today.sportTitle")}
          sub={isAthlete ? t("w.home.today.sportSub") : t("w.home.today.sportLockSub")}
          locked={!isAthlete}
          onClick={() => (isAthlete ? (onNavigate ? onNavigate("sport") : router.push("/sport")) : upsell("today-sport"))}
        />
      </div>

      {/* ───── RECOVER & MORE — the nutrition Fuel summary + deferred rows
          (coaches). No section head: "Recover & more" labelled a BUCKET, not
          anything on the screen, and the Fuel widget already titles itself. The
          12 here plus Fuel's own 12 keeps the section break intact. ───── */}
      <div style={{ marginTop: 12 }}>
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
    // Measured where a device recorded it (see core/device-truth.ts).
    const ct = sessionCardioSummary(s);
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
// back-logs it (weekOf = that day); a future day is read-only.
//
// ASKING AGAIN IS NOT EDITING THE ANSWER. The card used to lock its faces the
// moment the day's check-in was complete, and the only way past that was Edit —
// which OVERWROTE the morning's answer. But "flat ninety minutes after squats"
// and "flat fourteen hours later" are two measurements, and the second is the
// one that should move training. So a new answer is APPENDED (each read is its
// own row) and the faces reopen once the gate does: four hours after the last
// read, or six hours after a session that read was taken in the shadow of,
// whichever is later. See core/readiness-reads.ts.
function FeelingCard({ feeling, dayMetrics, daySessions, recoveryDue, lastSessionEnd, dayReads, gate, isToday, isFuture, dayTs, dayLabel, onPicked }: {
  /** The answer to THIS card's question, not a blend of the day's four. */
  feeling: ReadinessFeeling | null;
  /** The viewed day's stored metrics — which of the four are actually answered. */
  dayMetrics: Partial<CheckinMetrics> | null;
  /** The sessions trained that day — one effort question each. */
  daySessions: CheckinSessionRef[];
  /** True when the delayed recovery read on the last session has come due —
   *  the card leads with WHY it is asking again rather than repeating itself. */
  recoveryDue: boolean;
  /** When the athlete last finished training — the lens for today's answer. */
  lastSessionEnd: number | null;
  /** Every readiness answer given on the VIEWED day, placed in time. */
  dayReads: PlacedRead[];
  /** Whether a NEW read may be logged right now, and why not. */
  gate: ReadGate;
  isToday: boolean;
  isFuture: boolean;
  dayTs: number | null;
  dayLabel: string | null;
  onPicked: () => void;
}) {
  const { t } = useLang();
  const revalidate = useRevalidate();
  const [busy, setBusy] = useState(false);
  // The rest of the check-in, in a POP-UP rather than expanded inline: the card
  // stays one glanceable row of faces, and the follow-up gets the whole screen
  // it needs to ask three questions properly.
  const [followUpOpen, setFollowUpOpen] = useState(false);
  // THE TAP, BEFORE THE SERVER AGREES. The POST is followed by a cache
  // invalidation, and the follow-up sheet opens in the SAME tick — so
  // everything below was reading the pre-tap row for as long as the refetch
  // took. Visibly: the face you just pressed wasn't highlighted, the trigger
  // still said "0 / 4 answered", and — the one that actually costs an answer —
  // `startStep` opened the flow on the readiness question you had just
  // answered. Held per DAY so switching the rail can't carry it, and applied
  // only until the day carries MORE READS THAN IT DID AT THE TAP, at which
  // point the server's value wins with no clean-up needed. Counting reads
  // rather than asking "does the row have an answer yet" is what makes this
  // work for the second and third read of a day, where it always did.
  const [picked, setPicked] = useState<{ day: number | null; rating: number; reads: number } | null>(null);
  // WHAT THE READING IS WORTH, ON REQUEST. This sentence used to sit under the
  // faces on every render — an explanation the athlete has read a hundred times,
  // occupying the place where the card says what is happening NOW. It is
  // reference, not news, so it moves behind an ⓘ on the reading it describes.
  const [whyOpen, setWhyOpen] = useState(false);
  // ONE NUMBER (design/readiness-one-number-states.html). The card leads with
  // the reading that governs the day at display weight; the day's record lives
  // behind a door, open on request. That is the concept's trade — a card you
  // can read from across the room, with the story one tap away.
  const [readsOpen, setReadsOpen] = useState(false);
  const justPicked = picked != null && picked.day === dayTs;
  const pending = justPicked && dayReads.length <= picked!.reads ? picked!.rating : null;
  const metrics = pending != null ? { ...dayMetrics, [QUICK_CHECKIN_METRIC]: pending } : dayMetrics;
  // THE ANSWER THE DAY IS JUDGED ON — the latest read that isn't the session
  // talking, not "whatever was written last". An athlete who logged a real
  // recovery read in the evening, trained again late and tapped "wrecked"
  // walking out keeps the evening's reading as the day's.
  const shownFeeling = pending != null ? checkinScaleFeeling(pending) : (decisiveFeeling(dayReads) ?? feeling);
  const decisive = decisiveRead(dayReads);
  const trend = readTrend(dayReads);
  // What today's check-in actually carries. The one-tap face answers Energy;
  // until the follow-up runs, the other three are genuinely unknown and the
  // card says so instead of implying one tap was the full picture.
  const done = dayCompleteness(metrics, daySessions);
  const startStep = firstOutstandingIndex(metrics, daySessions);
  // THE GATE, on today only. A past day is back-logged rather than re-read, so
  // it stays tappable; a future day can't be felt at all. The just-tapped read
  // counts as logged (`pending`) so the faces don't flicker back open in the
  // window between the write and the refetch that confirms it.
  const held = isToday && (!gate.open || justPicked);
  const locked = busy || isFuture || held;
  const coolMin = Number.isFinite(gate.msUntilOpen) ? Math.ceil(gate.msUntilOpen / 60000) : 0;
  const coolH = Math.floor(coolMin / 60);
  const coolM = coolMin % 60;
  const gateNote = held ? READ_GATE_KEY[gate.reason] : null;
  // A NEW READ IS AN UNANSWERED QUESTION. Leaving the earlier answer lit once
  // the gate opens invites the athlete to CORRECT it — the one thing this card
  // is no longer for, and the exact confusion the old build created. The
  // reading itself is not hidden: it stays on the record below, with its clock.
  // The faces go blank because "how are you right now" genuinely has no answer
  // yet, and a blank row of faces is the only honest way to ask it.
  const inviting = isToday && gate.open && dayReads.length > 0 && !justPicked;
  const selected = inviting ? null : shownFeeling;
  // The clock's effect on the meaning of today's answer, from core so both
  // clients say the same thing. `low` is the two negative feelings — the only
  // ones whose reading genuinely turns on how long ago you trained.
  const ctxLow = shownFeeling === "flat" || shownFeeling === "wrecked";
  // …read against the DECISIVE read's own clock, not the clock right now: the
  // sentence describes the answer on the card ("hours after training and still
  // flat"), and dating it to this instant would relabel a morning reading as an
  // evening one just because the athlete opened the app again.
  const ctxNote = readinessNoteKey(decisive?.context ?? readinessContext(hoursSince(lastSessionEnd, Date.now())), ctxLow);
  // ONE LINE OF MEANING, not four stacked greys. A context note, an invitation,
  // a gate reason and a countdown chip were all queueing under the faces — the
  // triple narration the Builder critique killed, in a smaller box. Only one of
  // them is ever what the athlete needs at that moment, so only one renders:
  // what is holding the faces, then what a new tap would do, then what the
  // reading on record is worth.
  // THE STAMP under the big value: when it was given, and how long after
  // training that was — the fact that makes two identical answers different
  // measurements. While the app is ASKING, it switches to "since" so the number
  // stops claiming to be current the moment a current one is wanted.
  const heroAt = decisive ?? dayReads[dayReads.length - 1] ?? null;
  const heroClock = heroAt ? sessionClockTime(new Date(heroAt.at).toISOString()) : null;
  const heroStamp = pending != null
    ? sessionClockTime(new Date().toISOString())
    : !heroAt
    ? t("w.home.today.heroNotLogged")
    : inviting
      ? t("w.home.today.heroSince").replace("{t}", heroClock!)
      : heroAt.hoursSinceSession != null
        ? `${heroClock} — +${Math.round(heroAt.hoursSinceSession)}h ${t("w.home.today.heroAfterTraining")}`
        : `${heroClock} — ${t("w.home.today.readNoSession")}`;
  const line = whyOpen && ctxNote
    ? { key: ctxNote, sub: null as string | null, tone: ctxLow ? ("amber" as const) : ("ash" as const) }
    : gateNote
      ? { key: gateNote, sub: null as string | null, tone: "ash" as const }
      : inviting
        ? { key: "w.home.today.readInvite", sub: "w.home.today.readInviteSub", tone: "chalk" as const }
        : !shownFeeling && isToday
          ? { key: "w.home.today.heroAsk", sub: null as string | null, tone: "ash" as const }
          : trend
            ? { key: READ_TREND_KEY[trend.trend], sub: null as string | null, tone: trend.trend === "sinking" ? ("amber" as const) : ("ash" as const) }
            : null;
  const lineColor = line?.tone === "chalk" ? C("chalk") : C("ash");
  // THE CARD'S ONE FILL. Two lime-tinted surfaces were competing — the recovery
  // ask and the follow-up trigger. The ask wins whenever it is showing: it is
  // the app asking for something, and the follow-up is a door that can wait.
  const asking = isToday && recoveryDue;
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
        // ONE tap answers ONE question. This used to write the picked level
        // into all four metrics, inventing three measurements the athlete never
        // gave — which the volume profile then showed back to them as
        // "measured sleep". See core/checkin-flow.ts.
        // …and it sends ONLY that metric. It used to send explicit nulls for the
        // other three, which the route wrote straight over the day's row — so a
        // second tap in the afternoon deleted the sleep, freshness and mood
        // answered that morning. An omitted field is now left alone.
        body: JSON.stringify({ weekOf, ...quickCheckinPatch(rating) }),
      });
      if (res.ok) {
        // Show the tap NOW; the refetch below confirms it a moment later.
        setPicked({ day: dayTs, rating, reads: dayReads.length });
        // The cached check-in row drives this very card — drop it so the
        // athlete's own pick is never the thing that looks stale.
        revalidate.checkins();
        onPicked();
        // …and go straight into the rest of the questions. Answering the
        // headline is the moment the athlete is most willing to answer more,
        // and it's now the only way the other three ever get real values.
        // Only while something is still outstanding: a SECOND read of the day
        // has nothing left to ask, and opening an all-answered wizard on top of
        // it would read as the app having forgotten the first pass.
        if (isToday && !done.complete) setFollowUpOpen(true);
      }
    } catch {
      // a failed tap simply doesn't set — the athlete can tap again
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ marginTop: 16, border: `1px solid ${C("line")}`, borderRadius: 22, padding: 18, background: C("ink2") }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        {/* The card ASKS until it has an answer, then REPORTS: once the hero
            carries the reading, repeating the question above it is the same
            sentence twice. */}
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: fs.subtitle, letterSpacing: "-.01em" }}>
          {t(shownFeeling ? "w.home.today.glanceReadiness" : "w.recovery.readiness.title")}
        </div>
        {/* viewing another day — the date names the scope, no extra copy */}
        {/* Mono meta on the right, per the Explore SectionHead standard: the
            viewed date on another day, otherwise how long the faces are held.
            It used to be a pill sharing a row with the reason paragraph. */}
        {!isToday && dayLabel ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), whiteSpace: "nowrap", flexShrink: 0 }}>{dayLabel}</span>
        ) : asking ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--lime-text)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {t("session.feel.promptRecovery")}
          </span>
        ) : gate.reason === "dayFull" && isToday ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".06em", textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap", flexShrink: 0 }}>
            {dayReads.length} / {MAX_READS_PER_DAY}
          </span>
        ) : held && gate.opensAt != null ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".06em", textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap", flexShrink: 0 }}>
            {t("w.home.today.feelNextIn")} {coolH}h {coolM}m
          </span>
        ) : null}
      </div>
      {/* THE SECOND ASK, NAMED. An athlete who already answered at the end of
          their session and is asked again a few hours later will read it as the
          app having forgotten — unless it says what this one is for. It is a
          different question: not "how hard was that" but "did you absorb it".
          See core/feel-schedule.ts. */}
      {/* THE ONE NUMBER. The reading that governs the day, at display weight,
          in its own semantic tone — the card's single focal element. An empty
          day gets a light dash rather than a zero or a middling 3: there is no
          reading yet, and inventing one is the failure this card exists to
          avoid. The ⓘ sits with it because it explains THIS reading. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 11, flexWrap: "wrap", marginTop: 15 }}>
        <span style={{
          fontFamily: "var(--font-heading)", fontWeight: shownFeeling ? 800 : 300, fontSize: 46, lineHeight: .96,
          letterSpacing: shownFeeling ? "-.04em" : "-.01em",
          color: shownFeeling ? `var(--${READINESS_FACE[shownFeeling].accent}-text)` : `color-mix(in srgb, ${C("ash")} 55%, transparent)`,
        }}>
          {shownFeeling ? t(`w.recovery.readiness.${shownFeeling}`) : "—"}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{heroStamp}</span>
        {shownFeeling && ctxNote && isToday && (
          <button
            onClick={() => setWhyOpen((v) => !v)}
            aria-expanded={whyOpen}
            aria-label={t("w.home.today.readWhy")}
            style={{ display: "grid", placeItems: "center", width: 18, height: 18, flexShrink: 0, borderRadius: 999, border: `1px solid ${whyOpen ? C("ash") : C("line")}`, background: "none", cursor: "pointer", color: C("ash"), padding: 0 }}
          >
            <AuroraIcon name="info" size={11} color={C("ash")} />
          </button>
        )}
      </div>

      {line && (
        <p style={{ margin: "10px 0 0", fontSize: fs.body, lineHeight: 1.5, color: lineColor, fontWeight: line.sub ? 600 : 400 }}>
          {t(line.key)}
          {line.sub && <span style={{ color: C("ash"), fontWeight: 400 }}> {t(line.sub)}</span>}
        </p>
      )}

      <div style={{ height: 1, background: C("line"), margin: "15px 0 0" }} />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, margin: "13px 0 2px" }}>
        {READINESS_FEELINGS.map((key, i) => {
          const on = selected === key;
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
      {/* THE DAY'S RECORD — kept, not a footnote.
          This used to be one grey line, "Logged Flat, 5h ago", which is what a
          value looks like when the app can only hold one. A day now holds a
          SEQUENCE, and the sequence is the interesting part: the drop (or the
          climb) between an answer given in the gym and one given hours later is
          what measures this athlete's own recovery. So the readings get a place
          of their own — each with the face it was given as, the clock time it
          was given at, and how long after training that was. The one training
          is prescribed off is marked; none of them is ever overwritten. */}
      {dayReads.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 13, borderTop: `1px solid ${C("line")}` }}>
          {/* THE DOOR. Shut by default — the hero is what the card is for, and a
              list under it is the thing that made the card grow in the first
              place. The count sits on the door so the day's shape is legible
              without opening it. */}
          <button
            onClick={() => setReadsOpen((v) => !v)}
            aria-expanded={readsOpen}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>
              {t(isToday ? "w.home.today.readsTitleToday" : "w.home.today.readsTitle")}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{dayReads.length}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: fs.note, color: C("ash"), transform: readsOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>→</span>
          </button>
          {readsOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 11 }}>
            {dayReads.map((r) => {
              const governs = decisive != null && r.at === decisive.at;
              return (
                <div key={r.at} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ReadinessFace feeling={r.feeling} size={20} tone={governs ? undefined : C("ash")} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), fontVariantNumeric: "tabular-nums" }}>
                    {sessionClockTime(new Date(r.at).toISOString())}
                  </span>
                  <span style={{ fontSize: fs.caption, fontWeight: governs ? 700 : 400, color: governs ? C("chalk") : C("ash") }}>
                    {t(`w.recovery.readiness.${r.feeling}`)}
                  </span>
                  {/* How long after training it was given — the thing that makes
                      two identical answers different measurements. Reads with no
                      session behind them say so rather than showing a lag of 0. */}
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), whiteSpace: "nowrap" }}>
                    {r.hoursSinceSession != null ? `+${Math.round(r.hoursSinceSession)}h` : t("w.home.today.readNoSession")}
                  </span>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* THE FOLLOW-UP. Once the headline question is answered the card offers
          the rest — sleep, freshness, mood — in a pop-up rather than an inline
          expansion, so the card stays one readable row of faces and the three
          remaining questions get a surface of their own. The label says what is
          actually outstanding, because until this runs those metrics are
          genuinely unknown rather than merely unconfirmed. */}
      {isToday && shownFeeling && (
        <>
          <button
            onClick={() => setFollowUpOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", marginTop: 14, padding: "12px 14px", borderRadius: 16, background: done.complete || asking ? "transparent" : `color-mix(in srgb, var(--lime-text) 7%, transparent)`, border: `1px solid ${done.complete || asking ? C("line") : `color-mix(in srgb, var(--lime-text) 26%, transparent)`}`, cursor: "pointer", color: C("chalk") }}
          >
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.body }}>
                {done.complete ? t("w.recovery.readiness.logMoreDone") : t("w.recovery.readiness.logMore")}
              </span>
              <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 3 }}>
                {done.answered} / {done.total} {t("w.home.today.answered")}
              </span>
            </span>
            {/* The outstanding questions, named — a count alone doesn't tell you
                what you'd be answering. */}
            <span style={{ display: "flex", gap: 5, flexShrink: 0 }}>
              {checkinSteps(daySessions).filter((st) => st.kind !== "details").map((st, i) => (
                <span
                  key={i}
                  title={st.kind === "metric" ? t(metricLabelKey(st.key)) : st.session.title}
                  style={{ width: 7, height: 7, borderRadius: 999, background: stepAnswered(st, metrics) ? "var(--lime-text)" : C("line") }}
                />
              ))}
            </span>
            <span style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: fs.subtitle, color: done.complete || asking ? C("ash") : "var(--lime-text)" }}>→</span>
          </button>

          <Sheet
            open={followUpOpen}
            onClose={() => setFollowUpOpen(false)}
            title={t("w.recovery.readiness.followUpTitle")}
            sub={t("w.recovery.readiness.followUpSub")}
          >
            {/* onDone REFRESHES; it no longer closes. Closing on the POST's
                return meant the wizard's "Check-in logged" card was mounted and
                unmounted in the same tick — the sheet just disappeared, which
                is indistinguishable from a save that failed. The athlete
                dismisses it now, from the confirmation. */}
            <AuroraCheckins
              embedded
              startStep={startStep}
              sessions={daySessions}
              onDone={onPicked}
              onClose={() => setFollowUpOpen(false)}
            />
          </Sheet>
        </>
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


