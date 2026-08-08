"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { fs, space,
  localDayKey,
  prescribeSession,
  computeAccountability,
  planProgramToday,
  personalTrainingLog,
  velocityProfiles,
  sessionsOnDay,
  sessionMeta,
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
  sessionClockTime,
  READINESS_FEELINGS,
  READINESS_FACE,
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
import { sportForDiscipline } from "@hybrid/core";
import { roleText } from "@/lib/ui";
import { useSession } from "@/lib/session";
import { runHubTransition } from "@/lib/use-screen-transition";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { useCheckins } from "@/lib/use-checkins";
import { useNotifications } from "@/lib/use-notifications";
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
import DoneFloor from "./done-floor";
import Sheet from "./sheet";
import QuickStartSheet, { type QuickRoutine } from "./quick-start";
import AuroraEnduranceLanes from "./endurance-lanes";
import AuroraWeekVerdict, { DoorRow } from "./week-verdict";
import AuroraOtherSports from "./other-sports";
import CoachRail from "./coach-rail";
import GroupMark from "./group-mark";
import { AuroraIcon } from "./icons";
import { ArrowGlyph, CtaLabel } from "./cta-label";
import ReadinessFace from "./readiness-face";
import FetchError from "./fetch-error";
import { TodayTabs } from "./today-tabs";
import { HubMasthead } from "./hub-masthead";
import { TodayHubDock } from "./today-hub-dock";
import { RtpPanel } from "./protocol";
// The guided daily check-in, hosted INSIDE Today's feeling card (see FeelingCard).
// Lazy so the wizard's weight only lands when an athlete actually expands it.
const AuroraCheckins = dynamic(() => import("./checkins"), { ssr: false });
// THE HUB's other two tabs. Lazy for the same reason: an athlete who only ever
// opens the daily loop should never pay for recharts or the social feed.
const AuroraPerformance = dynamic(() => import("./performance"), { ssr: false });
const SocialFeed = dynamic(() => import("../social-feed"), { ssr: false });

// Brand-band → colour helpers (mirror the classic Today, theme-aware via vars).
const C = (v: string) => `var(--color-${v})`;
const roleColor = (role: SemanticRole) => C(ROLE_COLOR[role]);
// The ring's ticks are DRAWN marks, so they take the accent-text channel:
// the `amber` FILL is pale sand, which on Kyoto Hour's washi paper is all but
// invisible — and 40–59 is exactly the band an athlete needs to see.
const readyColor = (v: number) => roleText(readinessRole(v));

/**
 * AURORA Today (web) — the DAILY GUIDED LOOP. Today answers "what do I do, how do
 * I feel, where is it going?" and walks the athlete through it top to bottom in
 * FOUR NAMED CLUSTERS, each opened by a GroupMark (the quiet mono wayfinding
 * tier): TRAIN (the scheduled session/hero + what was actually done) →
 * RECOVER (the check-in ritual) → PROGRESS (this week's verdict, the
 * favourite-movement deltas, endurance lanes, other sports) → EXPLORE (Go Full
 * + the coach marketplace). Fuelling is NOT on this screen — it has its own
 * Nutrition destination. The strategic/analytical layer — Performance
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
  onOpenSport,
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
  /** Opens one sport's own page — the tile IS the hero, seen small. */
  onOpenSport?: (sport: string) => void;
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
  // daily loop rather than wherever the athlete last wandered.
  const [tab, setTab] = useState<TodayTabId>("dashboard");
  // The in-flow switcher's own box. THE DOCK (aurora/today-hub-dock.tsx)
  // measures its bottom edge so the floating row appears the instant the real
  // control leaves the viewport, never beside it.
  const hubAnchor = useRef<HTMLDivElement | null>(null);
  // The switch runs as a hub transition (lib/use-screen-transition): the pills'
  // flying lens owns the motion and the content cross-dissolves beneath it,
  // instead of the old hard cut.
  // Switching hubs lands you at the TOP of the view you chose. The three views
  // share one window scroll, and the dock made it possible to switch from deep
  // inside a page for the first time — without this you arrive 2000px down
  // someone else's screen. Instant, not smooth: the hub switch already owns the
  // motion (the chrome holds still while the body dissolves), and a scroll
  // animation racing that transition reads as two things moving at once.
  const selectTab = useCallback((id: TodayTabId) => {
    runHubTransition(() => setTab(id));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    track("today_tab", { tab: id });
  }, []);

  const [intake, setIntake] = useState<Intake>({});
  useEffect(() => setIntake(readIntake()), []);
  // TIER-2 glance-strip pop-ups: Quick Log (the sport carousel) + Done today
  // (everything logged today, with a link through to the full calendar).
  const [quickOpen, setQuickOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  // Today has no TIER-3 sheets left. Readiness is set inline on the feeling
  // card; fuelling left this screen entirely (it has its own Nutrition tab);
  // and Follow a coach is a rail on the page rather than a row behind a sheet.
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

  // THE DONE FLOOR — what was actually logged on the viewed day, handed to the
  // week rail to render as the LOWER FLOOR of its card (aurora/done-floor.tsx).
  // It used to be a card of its own below the rail, which drew the same day
  // twice on one screen. It is built here, not in the rail, because this screen
  // owns the sessions, the quick-log sheet and the Done-today sheet — the rail
  // only owns the surface it sits on.
  const doneFloor = (
    <DoneFloor
      rows={doneOnDay}
      planIds={fulfilledIds}
      isToday={dayIsToday}
      dayLabel={dayLabel}
      units={units}
      bw={bw}
      onOpen={(id) => (onOpenSession ? onOpenSession(id) : onNavigate ? onNavigate("history") : router.push("/history"))}
      onLog={() => setQuickOpen(true)}
      onDone={() => setDoneOpen(true)}
    />
  );

  const upsell = (source: string) => { track(FUNNEL.upgradeEntryClick, { client: "web", source }); onNavigate ? onNavigate("upgrade") : router.push("/upgrade"); };

  const initials = useMemo(
    () => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "A",
    [name],
  );
  // The bell badge is the UNREAD count from the shared notifications feed —
  // the same list the screen renders, so the two cannot disagree, and it
  // reaches zero once the athlete has read it. It used to be the LENGTH of the
  // training feed (sessions only, no social, no read state), a number that only
  // ever went up.
  const { unread: notifCount } = useNotifications();

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

  // The caption date — computed on the client (in an effect) so the
  // server-rendered markup doesn't mismatch the clock on hydration.
  const [dateStr, setDateStr] = useState("");
  useEffect(() => {
    setDateStr(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }));
  }, []);
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

  const iconBtn = { position: "relative", width: 44, height: 44, borderRadius: 12, background: C("ink2"), border: `1px solid ${C("line")}`, display: "grid", placeItems: "center", cursor: "pointer" } as const;
  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;

  // The shell every hub tab wears: the profile header, then the three pills.
  // Hoisted so the non-dashboard tabs render the SAME masthead chrome without
  // a second copy of it — they differ only in what hangs below the pills.
  const shell = { maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)" } as const;
  // `motion-hub-chrome`: during a hub switch (data-nav-kind="hub") this block
  // is lifted into its own view-transition group and held perfectly still —
  // only the content BELOW it dissolves. See globals.css THE TODAY HUB.
  const hubHeader = (
    <>
    <div className="motion-hub-chrome">
      {/* HEADER — profile, the HYBRID LOCKUP, bell.
          THREE COLUMNS, FIXED FLANKS. The row used to be `space-between`,
          which centres its middle child only when both flanks weigh the
          same — and they never did: one 44px tile on the left against a
          streak pill plus the bell on the right, so the brand sat ~69px
          left of the screen's centre and slid further with every extra
          digit. `44px 1fr 44px` centres the wordmark BY CONSTRUCTION,
          whatever the flanks carry.
          THE STREAK LEFT THE ROW and became the lockup's second line — a
          hairline mono caption under the wordmark. It survives on all three
          hub tabs (they render this same header), it can never push the
          brand off centre again, and it costs NO height: wordmark (19) +
          caption (~17) still sits inside the 44px the tiles already set.
          Mirrors mobile home.tsx. */}
      <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center", height: 44 }}>
        <button className="pressable"
          onClick={() => (onNavigate ? onNavigate("profile") : router.push("/profile"))}
          aria-label={t("w.home.today.profileAria")}
          style={{ position: "relative", width: 44, height: 44, borderRadius: 12, background: `${C("lime")}22`, border: `1px solid ${C("lime")}`, display: "grid", placeItems: "center", cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: fs.bodyLg, color: "var(--lime-text)" }}
        >
          {initials}
        </button>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifySelf: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 19, letterSpacing: "-.03em", lineHeight: 1, color: C("chalk") }}>
            HYBRID<span style={{ color: "var(--lime-text)" }}>.</span>
          </div>
          {acc.streak.current > 0 && (
            // SPECTRUM: the streak wears the warm terracotta accent (Connect),
            // pairing with the flame and keeping chartreuse for the primary
            // action. Same destination as the retired pill — the done sheet.
            <button className="pressable" onClick={() => setDoneOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 3, padding: "2px 8px", background: "none", border: "none", color: "var(--red-text)", fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600, letterSpacing: ".13em", textTransform: "uppercase", whiteSpace: "nowrap", cursor: "pointer" }}>
              <AuroraIcon name="flame" size={11} color="var(--red-text)" />
              {acc.streak.current}{t("w.home.today.dayStreak")}
            </button>
          )}
        </div>
        <button className="pressable" onClick={() => (onNavigate ? onNavigate("notifications") : router.push("/notifications"))} style={iconBtn} aria-label={t("w.home.today.notificationsAria")}>
          <AuroraIcon name="bell" size={20} color={C("ash")} />
          {notifCount > 0 && (
            <span style={{ position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 999, background: C("red"), border: `2px solid ${C("ink")}`, display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "#fff" }}>
              {notifCount > 9 ? "9+" : notifCount}
            </span>
          )}
        </button>
      </div>

      {/* THE HUB PILLS — Dashboard / Performance / Feed, directly under the
          profile row and above the calendar. Today is the athlete's home, and
          these three are what a home holds: the day's plan, the numbers behind
          it, and the people around it. Registry shared with mobile
          (@hybrid/core today-tabs.ts). */}
      <div ref={hubAnchor}>
        <TodayTabs value={tab} onChange={selectTab} />
      </div>
    </div>

      {/* THE DOCK — the same three destinations, floating, once the control
          above has scrolled off. Rendered outside `motion-hub-chrome` because
          it is position:fixed: a fixed element inside a view-transition group
          is captured with the group and would fly with it. Every hub tab
          mounts this, so Performance and Feed keep their exits too. */}
      <TodayHubDock value={tab} onChange={selectTab} anchor={hubAnchor} />
    </>
  );

  // ── THE OTHER TWO TABS ────────────────────────────────────────────────────
  // Early-return rather than wrapping the 800-line daily loop in a conditional:
  // every hook above has already run (order is stable), and the dashboard body
  // below stays exactly as it was.
  if (tab === "performance") {
    // ONE page — the command centre, this week's volume and the eight-week
    // trend in a single scroll. AuroraPerformance owns that composition, so
    // there is nothing to switch between here.
    return (
      <div style={shell}>
        {hubHeader}
        <div>
          <AuroraPerformance
            sessions={sessions}
            bio={bio}
            macro={macro}
            currentWeek={currentWeek}
            sessionsReady={sessionsReady}
            macroSettled={macroSettled}
            setScreen={(s) => (onNavigate ? onNavigate(s) : router.push(`/${s}`))}
            onOpenSport={onOpenSport}
            onEnrolled={() => { onEnrolled?.(); runHubTransition(() => setTab("dashboard")); }}
          />
        </div>
      </div>
    );
  }

  if (tab === "feed") {
    return (
      <div style={shell}>
        {hubHeader}
        <SocialFeed onNavigate={onNavigate} />
      </div>
    );
  }

  return (
    <div style={shell}>
      {hubHeader}

      {/* THE MASTHEAD — the SHARED hub head (aurora/hub-masthead.tsx), the same
          component Performance and Feed render, so the three tabs of one hub can
          no longer present three different heads. Everything measurable about it
          lives in @hybrid/core hub-masthead.ts; this screen passes only WORDS.
          The headline NAMES THE VIEWED DAY (masthead() in @hybrid/core): "Today"
          until the week rail is scrubbed, "Yesterday"/"Tomorrow" at ±1, the
          weekday name beyond — a static "Today" over Friday's session would lie
          in the largest type on screen. Off today, a "Back to today" return
          affordance renders beneath, teal, in the same spot every time. Mirrors
          mobile home.tsx. */}
      <HubMasthead
        eyebrow={mastCaption}
        meta={firstRun || (logbookMode && !mastTag) ? t("w.home.today.badgeFree") : mastTag}
        metaTone={!firstRun && !(logbookMode && !mastTag) && mastTag ? "accent" : "plain"}
        title={mastTitle}
        mark={
          // Kyoto Hour hanko — the app's vermilion seal, stamped beside the true
          // "Today" only (never the scrubbed days). Hidden in Aurora via CSS
          // (.hanko-seal). Mirrors mobile home.tsx.
          dayIsToday ? <span className="hanko-seal" aria-hidden>力</span> : null
        }
        accessory={
          !dayIsToday ? (
            <button className="pressable"
              onClick={backToToday}
              style={{ background: "none", border: "none", padding: 0, marginTop: 4, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--blue-text)" }}
            >
              <CtaLabel size={12}>{`${t("w.home.today.backToToday")} →`}</CtaLabel>
            </button>
          ) : null
        }
      />

      {/* ═════ GROUP: TRAIN — the day's work. The scheduled session (or the
          path to one) and, below it, what was actually done. First of the FOUR
          themed clusters the whole dashboard scroll is organised into
          (Train / Recover / Progress / Explore) — each opens with a GroupMark,
          the quiet wayfinding tier above the blocks' own heads, so the page
          reads as four thoughts instead of nine competing cards. ═════ */}
      {/* mt={0}: The head emits the gap to the first content row (HUB_MASTHEAD.gap.below), so this block contributes none. RN does not collapse margins and CSS does, so a block that kept its own top margin would sit 16 lower on mobile than on web. */}
      <GroupMark label={t("w.home.group.train")} mt={0} />
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
        <AuroraWeekRail
          planId={planId!}
          planStartedAt={planStartedAt!}
          sessions={sessions}
          maxes={planMaxes}
          onStart={onStart}
          onNavigate={onNavigate}
          onSelectDay={setRailDay}
          resetToken={railResetToken}
          doneFloor={doneFloor}
        />
      ) : logbookMode ? (
        /* LOGBOOK MODE ("The Constant") — the same week-rail object, in
           logbook mode: the last seven days with the athlete's real logged
           training, so a plan-less regular gets the calendar from their first
           session instead of the chooser forever. The chooser demotes to slim
           rows under an Explore-standard "Add structure" head. */
        <div style={{ marginTop: 16 }}>
          <AuroraLogbookRail
            sessions={sessions}
            onLog={() => onStart()}
            onNavigate={onNavigate}
            onSelectDay={setRailDay}
            resetToken={railResetToken}
            doneFloor={doneFloor}
          />
          <div style={{ margin: "24px 0 12px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("chalk") }}>{t("w.home.logbook.trainYourWay")}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.home.logbook.optional")}</span>
          </div>
          {/* the chooser as a snap slider — the exercise-widget rail's idiom:
              one card ≈ 72% wide so the next path peeks in from the right,
              FULL-BLEED like every screen-level rail: negative margins the
              width of the shell gutter (--page-pad-x) pull the scroll clip to
              the true screen edge; the centre-snap then centres cards on the
              physical screen. */}
          <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", margin: "0 calc(-1 * var(--page-pad-x, 12px))", padding: "4px var(--page-pad-x, 12px) 6px" }}>
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
           already opens with "Today", and three cards titled
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
                    <span style={{ fontWeight: 600, fontSize: fs.bodyLg }}>{r.session ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginRight: 8 }}>{r.session}</span> : null}{r.name}{r.note ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}> ({r.note})</span> : null}</span>
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
                      <button className="pressable" ref={showLiftsRef} onClick={() => toggleLifts(true)} aria-expanded={false} style={{ marginTop: 6, display: "block", marginLeft: "auto", marginRight: "auto", cursor: "pointer", background: `color-mix(in srgb, ${C("lime")} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${C("lime")} 40%, transparent)`, color: "var(--lime-text)", borderRadius: 999, padding: "6px 16px", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>
                        <CtaLabel size={12}>{`${t("w.home.today.showAllLifts")} ${rows.length} ${t("w.home.today.liftsWord")} →`}</CtaLabel>
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
                      <button className="pressable" ref={hideLiftsRef} onClick={() => toggleLifts(false)} aria-expanded style={{ marginTop: 10, display: "block", width: "100%", textAlign: "center", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>
                        {t("w.home.today.hideLifts")}
                      </button>
                    )}
                  </>
                );
              })()}
              {!isAthlete && (
                <button className="pressable"
                  onClick={() => (onNavigate ? onNavigate("upgrade") : router.push("/upgrade"))}
                  style={{ marginTop: 12, width: "100%", display: "block", padding: "12px 12px", cursor: "pointer", textAlign: "left", border: `1px dashed color-mix(in srgb, var(--premium-accent) 40%, transparent)`, background: "transparent" }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.5, color: C("ash") }}><span style={{ color: "var(--premium-accent-text)" }}>[note]</span> {t("w.home.today.followingAsWritten1")}{t("w.home.today.unlockFull")}{t("w.home.today.followingAsWritten2")}</span>
                </button>
              )}
              {/* Primary action anchored at the BOTTOM of the plan card, below the note.
                  Stamps the plan-composed title so the saved session is recognised
                  as the plan's own (parity with the mobile plan prefill). */}
              <button
                onClick={() => onStart(plan.blocks, `${plan.planName} – ${plan.day}`)}
                className="start-glow pressable"
                style={{ marginTop: 16, width: "100%", display: "block", background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "12px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg, cursor: "pointer" }}
              >
                <CtaLabel>{t("w.home.today.start")}</CtaLabel>
              </button>
              {/* Quiet secondary — reach the Quick-start sheet without leaving the
                  plan: on a plan the four "Train your way" cards aren't shown, so
                  this is the on-plan door to a saved routine (a session off-plan). */}
              <button className="pressable"
                onClick={() => setQuickStartOpen(true)}
                style={{ marginTop: 10, display: "block", width: "100%", textAlign: "center", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--violet-text)" }}
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

      {/* DONE TODAY, when there is no rail to hold it. Every session logged on
          the VIEWED day normally renders as the week rail's LOWER FLOOR (the
          doneFloor above) — one day, one card. But the count-based plan hero has
          no rail to sit in, so on that path the floor keeps its own card: the
          rows are the confirmation loop and must never simply vanish. Hidden for
          a true first run (no plan, nothing ever logged): the chooser above owns
          that state, and an empty card under it would be a second competing log
          CTA. */}
      {!useRail && !logbookMode && (!!sched || sessions.length > 0) && (
        <div style={{ marginTop: 16, border: `1px solid ${C("line")}`, borderRadius: 28, padding: 16, background: C("ink2"), boxShadow: "var(--shadow-card)" }}>
          <DoneFloor
            rows={doneOnDay}
            planIds={fulfilledIds}
            isToday={dayIsToday}
            dayLabel={dayLabel}
            units={units}
            bw={bw}
            pad={16}
            rule={false}
            onOpen={(id) => (onOpenSession ? onOpenSession(id) : onNavigate ? onNavigate("history") : router.push("/history"))}
            onLog={() => setQuickOpen(true)}
            onDone={() => setDoneOpen(true)}
          />
        </div>
      )}

      {/* ═════ GROUP: RECOVER — how the body is answering. The daily check-in
          ritual: readiness reads, the follow-up questions, the day's record. ═════ */}
      <GroupMark label={t("w.home.group.recover")} />

      {/* TIER 2 — the feeling-led card: the daily check-in IS the ritual. The four
          faces set the day's readiness inline (one tap, no sheet) — nothing else;
          the done count + log action live on the Also Today card above. Follows
          the rail's selected day: a past day shows (and can back-log) THAT day's
          feeling; a future day is read-only — you can't feel the future. */}
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

      {/* RETURN TO PLAY — the running protocol, on the day it has to be done.
          It used to render inside the Performance tab's Tissue card, several
          screens from where an injured athlete decides what to do this morning.
          A protocol is a DAILY object — stages, gates, dates — so it belongs in
          the Recover cluster beside the check-in. The Tissue card keeps the
          status line and the door, so the flag and the protocol stay one
          object. Renders nothing when no protocol is open. */}
      <RtpPanel />

      {/* ═════ GROUP: PROGRESS — where the training is going. The week's
          verdict, the favourite movements' deltas, then each sport's own read:
          every retrospective block on Today, in one cluster, widest first. ═════ */}
      <GroupMark label={t("w.home.group.progress")} />

      {/* ───── THIS WEEK — the verdict card. A verdict with its working-out
          shown. Replaces the Statistics and Analytics destinations on Today
          (both are now promotedTo "today" in core nav.ts); the two rows under it
          are the doors to everything past this week. Mirrors mobile. ───── */}
      <AuroraWeekVerdict
        sessions={sessions}
        units={units}
        bw={bw}
        onSession={(id) => (onOpenSession ? onOpenSession(id) : onNavigate ? onNavigate("history") : router.push("/history"))}
      />

      {/* EXERCISES — the favourites widget rail (free for everyone): swipeable
          full-bleed cards, one favourite per purpose, stock-ticker deltas; tap
          opens that movement's own stats page. Hidden until there's history —
          an empty rail would just be chrome. Lives in the PROGRESS cluster
          (it is per-movement trend, not part of the day's job): directly under
          This week, whose lifting columns these cards break down per movement. */}
      {onOpenExercise && sessions.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <ExerciseWidgetRail sessions={sessions} deferToLanes={isAthlete} onOpen={onOpenExercise} onAll={() => (onNavigate ? onNavigate("exercises") : router.push("/analyze"))} />
        </div>
      )}

      {/* ───── ENDURANCE — sport lanes, directly under This week because the
          card's KM column is the headline these rails break down: the total and
          its per-sport detail now read as one thought instead of sitting at
          opposite ends of the scroll. One full-bleed rail per logged discipline
          carrying that sport's whole read (efforts / distance / time, 8-week
          volume, pace trend, pace zones, last effort). NOT gated on dayIsToday:
          an eight-week volume chart is not a property of the day you happen to
          be scrubbed to. Renders nothing until there's endurance to show.
          Mirrors mobile. ───── */}
      {isAthlete && (
        <AuroraEnduranceLanes
          sessions={sessions}
          canOpen={(d) => !!onOpenSport && !!sportForDiscipline(d)}
          onOpen={(d) => { const sport = sportForDiscipline(d); if (sport) onOpenSport?.(sport); }}
        />
      )}

      {/* ───── OTHER SPORTS — tennis, squash, five-a-side: everything logged as
          `discipline: "sport"`, the bucket ENDURANCE_DISCIPLINES deliberately
          excludes. It fed the week's sessions and hours and then had nowhere to
          appear. Sits under Endurance because it is the same question one step
          out: what else did you actually play. These sports are TIMED, so a
          sport gets ONE tile rather than a rail — the block spends its width on
          the NUMBER of sports, not the depth of each. Renders nothing until a
          sport is logged. Mirrors mobile. ───── */}
      <AuroraOtherSports sessions={sessions} onOpen={(sport) => (onOpenSport ? onOpenSport(sport) : onNavigate ? onNavigate("sport") : router.push("/sport"))} />

      {/* THE CLUSTER'S EXIT (wave 3) — the doors past this week, moved here
          from under the This-week card: summary → breakdowns → ONE exit point,
          instead of a detour between the summary and the rails that decompose
          it. Same door-row anatomy, same destinations. */}
      <DoorRow glyph="▤" title={t("w.home.week.archive")} sub={t("w.home.week.archiveSub")} onClick={() => (onNavigate ? onNavigate("history") : router.push("/history"))} />
      {isAthlete && <DoorRow glyph="◫" title={t("w.home.week.deep")} sub={t("w.home.week.deepSub")} onClick={() => (onNavigate ? onNavigate("analytics") : router.push("/analytics"))} />}

      {/* ═════ GROUP: EXPLORE — beyond your own data: the premium tier and the
          coach marketplace. The label the old Explore tab left behind. ═════ */}
      <GroupMark label={t("w.home.group.explore")} />

      {/* ───── GO FULL — demoted from two display-weight AccessCards to ONE
          compact quiet row. It is the SHARED DoorRow now (Aug 2026): it had
          been a hand-rolled copy of that anatomy, so when the doors went
          chromeless this one would have stayed a filled card sitting between
          two flat ones — the same drift that let five rails draw five
          different tails. `premium` carries the ✦ in the accent; the ✦ is the
          semantic premium signifier and still the ONLY thing wearing it.
          Routes where the first AccessCard (Cockpit) routed. Mirrors mobile. */}
      <DoorRow
        glyph="✦"
        premium
        title={t("w.home.today.goFull")}
        sub={t("w.home.today.goFullRowSub")}
        onClick={() => (isAthlete ? (onNavigate ? onNavigate("performance") : router.push("/performance")) : upsell("today-cockpit"))}
      />

      {/* ───── FOLLOW A COACH — Today's last block, and the only thing left
          below the premium cards. Nutrition is NOT summarised here: Today is the
          training loop, and fuelling has its own destination — a bottom-nav tab
          now, so it is one tap from anywhere rather than a widget competing for
          this screen.

          The coach rail moved here from the Explore tab, which is gone. It is on
          the PAGE rather than a row that opened a sheet: the rail sells coaches
          by showing them, and a row reading "Follow a coach" sold nothing.
          Full-bleed per the slider rule (the cards run under the screen edge),
          headerless under the section head, with the trailing "See more"
          carrying through to the marketplace. Mirrors mobile. ───── */}
      {/* The descriptor sits UNDER the title, not opposite it: "Find a coach for
          your goal" is a subtitle, not a meta value, and at 30-odd characters in
          PL/DE it would collide with the title on a phone. Same anatomy the
          rail's own built-in header uses. */}
      <div style={{ margin: "24px 0 12px" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("chalk") }}>{t("w.home.today.rowCoach")}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 3 }}>{t("w.home.today.rowCoachSub")}</div>
      </div>
      <CoachRail onOpen={() => (onNavigate ? onNavigate("coaches") : router.push("/coaches"))} headerless bleed />

      {/* QUICK LOG sheet — the sport-log carousel, opened from the glance strip. */}
      <Sheet open={quickOpen} onClose={() => setQuickOpen(false)} title={t("w.home.quickSport.title")} sub={t("w.home.quickSport.sub")}>
        <QuickSportLog sessions={sessions} onSaved={() => { onSaved?.(); setQuickOpen(false); }} solid />
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
        sub={dayIsToday ? (
          <>
            {dateStr}
            {acc.streak.current > 0 && (
              <> – <AuroraIcon name="flame" size={12} color="var(--red-text)" style={{ verticalAlign: "-2px" }} /> {acc.streak.current}{t("w.home.today.dayStreak")}</>
            )}
          </>
        ) : dayLabel ?? ""}
      >
        {doneOnDay.length === 0 ? (
          <div style={{ fontSize: fs.body, color: C("ash"), lineHeight: 1.5, padding: "8px 0" }}>{t(dayIsToday ? "w.home.today.doneModalEmpty" : "w.home.today.doneModalEmptyDay")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {doneOnDay.map((s) => (
              <button className="pressable" key={s.id} onClick={() => { setDoneOpen(false); if (onNavigate) onNavigate("history"); else router.push("/history"); }} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", borderBottom: `1px solid ${C("line")}`, padding: "12px 2px", cursor: "pointer", color: C("chalk") }}>
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
        <button className="pressable" onClick={() => { setDoneOpen(false); if (onNavigate) onNavigate("calendar"); else router.push("/calendar"); }} style={{ marginTop: 16, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: 16, fontWeight: 700, fontSize: fs.body, color: C("chalk"), cursor: "pointer" }}><AuroraIcon name="calendar" size={15} color={C("ash")} /> {t("w.home.today.doneCalendar")}</button>
      </Sheet>
    </div>
  );
}

// GroupMark — the headline-tier cluster marker — moved to its own module
// (aurora/group-mark.tsx) when the Performance page adopted the same
// clustering; both hub scrolls now import one component.

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
      className="pressable"
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", background: `radial-gradient(120% 80% at 88% -10%, color-mix(in srgb, ${fill} 13%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, ${fill} 5%, ${C("ink2")}), ${C("ink2")})`, border: `1px solid ${C("line")}`, borderRadius: 28, padding: 20, cursor: "pointer", color: C("chalk"), boxShadow: "var(--shadow-card)" }}
    >
      <span aria-hidden style={{ fontSize: 19, lineHeight: 1, color: text }}>{glyph}</span>
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20, letterSpacing: "-.02em", marginTop: 12 }}>{title}</span>
      <span style={{ fontSize: fs.note, lineHeight: 1.5, color: C("ash"), marginTop: 8 }}>{sub}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: text, paddingTop: 16 }}><CtaLabel size={12}>{`${cta} →`}</CtaLabel></span>
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
      className="pressable"
      style={{ flex: "0 0 min(72%, 300px)", scrollSnapAlign: "center", display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", background: `radial-gradient(120% 80% at 88% -10%, color-mix(in srgb, ${fill} 13%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, ${fill} 5%, ${C("ink2")}), ${C("ink2")})`, border: `1px solid ${C("line")}`, borderRadius: 28, padding: 16, cursor: "pointer", color: C("chalk"), boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)" }}
    >
      <span aria-hidden style={{ fontSize: 15, lineHeight: 1, color: text }}>{glyph}</span>
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, letterSpacing: "-.02em", marginTop: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{title}</span>
      <span style={{ fontSize: fs.caption, color: C("ash"), marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{sub}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: text, paddingTop: 12 }}><CtaLabel size={12}>{`${cta} →`}</CtaLabel></span>
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
    <div style={{ marginTop: 16, border: `1px solid ${C("line")}`, borderRadius: 28, padding: 16, background: C("ink2"), boxShadow: "var(--shadow-card)" }}>
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
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--lime-text)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {t("session.feel.promptRecovery")}
          </span>
        ) : gate.reason === "dayFull" && isToday ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap", flexShrink: 0 }}>
            {dayReads.length} / {MAX_READS_PER_DAY}
          </span>
        ) : held && gate.opensAt != null ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap", flexShrink: 0 }}>
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        {/* display weight, not hero weight — fs.display (was 46): a status
            reading must never outrank the day's Start action */}
        <span style={{
          fontFamily: "var(--font-heading)", fontWeight: shownFeeling ? 800 : 300, fontSize: fs.display, lineHeight: .96,
          letterSpacing: shownFeeling ? "-.03em" : "-.01em",
          color: shownFeeling ? `var(--${READINESS_FACE[shownFeeling].accent}-text)` : `color-mix(in srgb, ${C("ash")} 55%, transparent)`,
        }}>
          {shownFeeling ? t(`w.recovery.readiness.${shownFeeling}`) : "—"}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{heroStamp}</span>
        {shownFeeling && ctxNote && isToday && (
          <button className="pressable"
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

      <div style={{ height: 1, background: C("line"), margin: "16px 0 0" }} />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, margin: "12px 0 2px" }}>
        {READINESS_FEELINGS.map((key, i) => {
          const on = selected === key;
          const at = `var(--${READINESS_FACE[key].accent}-text)`;
          return (
            <button key={key} onClick={() => pick(i + 2)} disabled={locked} aria-label={t(`w.recovery.readiness.${key}`)} aria-pressed={on} className="pressable"
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
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
          {/* THE DOOR. Shut by default — the hero is what the card is for, and a
              list under it is the thing that made the card grow in the first
              place. The count sits on the door so the day's shape is legible
              without opening it. */}
          <button className="pressable"
            onClick={() => setReadsOpen((v) => !v)}
            aria-expanded={readsOpen}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>
              {t(isToday ? "w.home.today.readsTitleToday" : "w.home.today.readsTitle")}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{dayReads.length}</span>
            <span style={{ marginLeft: "auto", display: "grid", placeItems: "center", color: C("ash"), transform: readsOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}><ArrowGlyph size={13} /></span>
          </button>
          {readsOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
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
          <button className="pressable"
            onClick={() => setFollowUpOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", marginTop: 16, padding: "12px 16px", borderRadius: 16, background: done.complete || asking ? "transparent" : `color-mix(in srgb, var(--lime-text) 7%, transparent)`, border: `1px solid ${done.complete || asking ? C("line") : `color-mix(in srgb, var(--lime-text) 26%, transparent)`}`, cursor: "pointer", color: C("chalk") }}
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
            <span style={{ flexShrink: 0, display: "grid", placeItems: "center", color: done.complete || asking ? C("ash") : "var(--lime-text)" }}><ArrowGlyph size={15} /></span>
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

// The Go-Full AccessCard pair (Cockpit / Sport, 26px titles, minHeight 220)
// was demoted to the single quiet row rendered inline above — see GO FULL.


