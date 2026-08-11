import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, ScrollView, RefreshControl, Animated, StyleSheet, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { publishTodaySnapshot } from "../../modules/widget-bridge";
import {
  prescribeSession,
  computeAccountability,
  planProgramToday,
  FUNNEL,
  personalTrainingLog,
  toBiometrics,
  velocityProfiles,
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
  hoursSince,
  readinessReadExplain,
  readGate,
  placeReads,
  decisiveFeeling,
  decisiveRead,
  readTrend,
  undoableRead,
  READ_GATE_KEY,
  READ_TREND_KEY,
  MAX_READS_PER_DAY,
  READ_UNDO_MIN,
  type PlacedRead,
  type ReadGate,
  planSchedule,
  masthead,
  localDayKey,
  sessionClockTime,
  READINESS_FEELINGS,
  READINESS_FACE,
  type ReadinessFeeling,
  logbookWeek,
  type TodayTabId,
  sessionsOnDay,
  sessionMeta,
  type LoggedSession,
  type SessionBlock,
  type Experience,
  type Equipment,
  type ScheduledDay,
  type LogbookDay,
} from "@hybrid/core";
import { sportForDiscipline, hasEnduranceHistory } from "@hybrid/core";
import { fetchAssignments, createCheckin, undoCheckinRead, fetchRoutines, favouriteRoutine, deleteSession, type Assignment } from "../../lib/api";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useSessionsRead, useSignalsRead, useMacrocycleRead, useCheckinsRead, useRefreshAll, useRevalidate } from "../../lib/queries";
import { useToday } from "../../lib/use-today";
import { usePersona } from "../../lib/persona";
import { usePlanMaxes } from "../../lib/plan-maxes";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { leading, fs, space, F, startGlow, useEntrance, HubDissolve, PressScale, cardShadow, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { track } from "../../lib/track";
import { ACard, AuroraField, GUTTER, RADIUS, CARD_PAD, Ring } from "./kit";
import { HubMasthead } from "./hub-masthead";
import ExerciseWidgetRail from "./exercise-widget";
import { ArrowGlyph, CtaLabel } from "./cta-label";
import { auroraScrollClearance } from "../../lib/layout";
import { useNavScroll, useNavScrollProps } from "../../lib/nav-scroll";
import { AuroraIcon } from "./icons";
import Tour, { FIRST_RUN_TOUR } from "../tour";
import QuickSportLog from "../quick-sport";
import { useDeviceAutoImport } from "../../lib/use-device-import";
import Sheet from "./sheet";
import QuickStartSheet, { type QuickRoutine } from "./quick-start";
import ReadinessFace from "./readiness-face";
import ReadinessSheet from "./readiness-sheet";
import FetchError from "./fetch-error";
import AuroraEnduranceLanes, { LaneOrderChip, useLaneOrder } from "./endurance-lanes";
import AuroraEnduranceSummary from "./endurance-summary";
import AuroraWeekVerdict, { DoorRow } from "./week-verdict";
import AuroraOtherSports from "./other-sports";
import CoachRail from "./coach-rail";
// The guided daily check-in, hosted INSIDE Today's feeling card (see FeelingCard)
// so the full ritual runs on Today — the /checkin screen is the same component.
import AuroraCheckin from "./checkin";
import AuroraWeekRail from "./week-rail";
import AuroraLogbookRail from "./logbook-rail";
import DoneFloor from "./done-floor";
import FeelSheet from "../feel-sheet";
import GroupMark from "./group-mark";
import SectionSeam from "./section-seam";
import { TodayTabs } from "./today-tabs";
import { AppHeader } from "./app-header";
import { StreakMark } from "./streak-mark";
import { TodayHubDock } from "./today-hub-dock";
import { RtpPanel } from "./protocol";
import { HeatRow } from "./heat-row";
// THE HUB's other two tabs — the same full screens their own routes render,
// handed Today's header + pills through the `top` slot so the chrome above
// them never changes as the athlete switches tab.
import AuroraPerformance from "./performance";
import FeedView from "../feed-view";
import { CAME_FROM_GUEST_KEY } from "../../lib/guest";

type P = ReturnType<typeof useTheme>["palette"];
// State colours resolve through the SHARED semantic vocabulary (@hybrid/core
// semantic.ts) via theme.roleColor, so web + mobile can't drift on meaning.
const readyColor = (v: number, C: P) => roleColor(C, readinessRole(v));

/**
 * AURORA home — the rounded Aurora skin of the full classic Today cockpit, at
 * parity (no feature loss): a horizontally-swipeable Plan today + AI coach pair,
 * the season phase timeline, the reconciled "This week" plan (with schedule /
 * re-sync), accountability, the weekly recap, and the Performance State + injury-risk
 * panel. Runs the SAME engines as the classic home; casual users get the lean
 * subset (no season/Performance State), like classic.
 */
export default function AuroraHome() {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  const { t } = useLang();
  const router = useRouter();
  const isAthlete = usePersona() !== "casual";
  const insets = useSafeAreaInsets();
  // Logbook mode's "Train your way" slider — one chooser card ≈ 72% of the
  // screen so the next card peeks in (the exercise-widget rail's idiom).
  const { width: winW } = useWindowDimensions();
  const structW = Math.min(300, Math.round(winW * 0.72));
  const navScroll = useNavScrollProps();
  // MASTHEAD COMPRESSION moved into the head itself (aurora/hub-masthead.tsx),
  // which subscribes to the same nav-scroll signal this screen used to read
  // directly. It was Dashboard's alone for as long as it lived here; owning it
  // in the component is what gives Performance and Feed the identical
  // compression rather than none at all.

  // SAFE CACHE (lib/queries.ts `Read`). Sessions, signals, the enrolled season
  // and the check-ins all come from the SHARED cache, so Today and Performance
  // read the same entries — moving between them renders instantly off cache and
  // revalidates behind the spinner instead of re-fetching from nothing.
  //
  // `ready` is the important part: it says a real server answer is in hand.
  // Anything Today asserts about the athlete (their plan, their history, their
  // check-in) is gated on it, because an empty array before the first response
  // is the absence of an answer, not the answer "none".
  const sessionsRead = useSessionsRead();
  const signalsRead = useSignalsRead();
  const macroRead = useMacrocycleRead();
  const checkinsRead = useCheckinsRead();
  const sessions = sessionsRead.data ?? [];
  const signals = signalsRead.data ?? [];
  const sessionsError = sessionsRead.failed;
  const planId = macroRead.data?.planId ?? null;
  const planStartedAt = macroRead.data?.planStartedAt ?? null;
  // THE HUB — which of Today's three top-level views is showing (see
  // @hybrid/core today-tabs.ts). Deliberately NOT persisted: Today is the app's
  // home and its job is "what do I do today?", so every visit opens on the
  // daily loop rather than wherever the athlete last wandered.
  const [tab, setTab] = useState<TodayTabId>("dashboard");
  // THE SIDE MENU (aurora/side-menu.tsx) is the app header's own now — it opens
  // on every tab root that wears the header, not on the hub alone. All this
  // screen still owns is the hub the drawer's three hub rows switch in place,
  // which it hands down as `hub`.
  const selectTab = useCallback((id: TodayTabId) => { setTab(id); track("today_tab", { tab: id }); }, []);
  // Whether this visit has LEFT the dashboard: the dashboard body replays the
  // hub dissolve only when it comes BACK from Performance/Feed — on the first
  // entry the whole-screen entrance owns the motion and must not be doubled.
  const awayFromDashboard = useRef(false);
  if (tab !== "dashboard") awayFromDashboard.current = true;
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [prefExp, setPrefExp] = useState<Experience | undefined>(undefined);
  const [prefEquip, setPrefEquip] = useState<Equipment | undefined>(undefined);
  // Drives the pull-to-refresh spinner and NOTHING else. It must never gate
  // content: flipping a rendered card back to a skeleton because a background
  // revalidate started is the same lie as showing the empty state, in reverse.
  const refreshing = sessionsRead.refreshing || macroRead.refreshing || checkinsRead.refreshing || signalsRead.refreshing;
  // True until sessions AND enrollment have both really answered. Gates the
  // plan hero so an already-enrolled athlete sees a skeleton — never the
  // first-run chooser — while planId is still null on cold start. Derived from
  // the reads rather than a one-shot flag, so it is also correct after a
  // sign-out/sign-in or a cache eviction, not just on first mount.
  // `settled`, not `ready`: a failed read is never `ready`, so gating on that
  // alone would leave the skeleton up forever when the network is down. Settled
  // means we've stopped waiting — the sessions FetchError below owns the
  // failure case, so falling through here is honest rather than a hang.
  const initialLoad = !(sessionsRead.settled && macroRead.settled);
  // TIER-2 glance strip modals: Quick Log (sport carousel) + Done today (a
  // pop-up list of everything logged today, with a link to the full calendar).
  const [quickOpen, setQuickOpen] = useState(false);
  // Which day a quick sport log lands on. Null = now, which is every opener
  // except the logbook rail's empty PAST day — that one hands over the day it
  // is showing, so "I played on Saturday and forgot" finally has somewhere to go.
  const [quickDay, setQuickDay] = useState<number | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  // The session whose rating sheet is up — a row on the done floor that nobody
  // ever answered "how hard was that" for. Null when the sheet is closed.
  const [rating, setRating] = useState<LoggedSession | null>(null);
  // Home has no TIER-3 sheets left. Readiness is set inline on the feeling
  // card; fuelling left this screen entirely (it has its own Nutrition tab);
  // and Follow a coach is a rail on the page rather than a row behind a sheet.
  // Quick-start: the fourth "Train your way" path — a sheet to re-launch a saved
  // routine (favourites rail + shuffle-able rest). `routines` stays null until the
  // first fetch resolves so the card doesn't flash before we know whether the
  // user has any saved routines.
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [routines, setRoutines] = useState<QuickRoutine[] | null>(null);
  // Plan hero: lead with the first lift; the rest collapse behind a toggle so
  // the card reads at a glance instead of a wall of percentage schemes.
  const [liftsOpen, setLiftsOpen] = useState(false);
  // The readiness FEELING log — the emoji the athlete picked in the quick
  // check-in (primed/good/flat/wrecked), not a computed score. The raw list is
  // kept so the feeling card can be scoped to WHICHEVER day the week rail has
  // selected; refreshed on focus, pull-to-refresh, and after a face saves.
  const checkins = checkinsRead.data ?? [];

  // Pull-to-refresh / focus. Each source revalidates INDEPENDENTLY rather than
  // through one Promise.all — the old fan-out committed the whole screen at the
  // slowest of five endpoints, so a fast readiness read bought nothing. Stable
  // identity (see useRefreshAll) so the focus effect below can't loop.
  const refreshAll = useRefreshAll();
  const load = useCallback(() => {
    refreshAll();
    // Assignments are still home-local (no other screen reads them), so they
    // keep their own fetch — but they no longer hold anything else up.
    fetchAssignments()
      .then(setAssignments)
      .catch((err) => console.error("Failed to load assignments:", err));
  }, [refreshAll]);
  const loadRoutines = useCallback(() => {
    fetchRoutines().then((r) => setRoutines(r)).catch(() => setRoutines([]));
  }, []);
  useFocusEffect(useCallback(() => { load(); loadRoutines(); }, [load, loadRoutines]));

  // Workouts recorded on the watch, pulled in on open when the athlete has
  // switched auto-import on — the run is simply THERE. Refetch only when
  // something actually landed. See lib/use-device-import.ts.
  useDeviceAutoImport(load);

  // Optimistic favourite toggle — flip locally, then PATCH; revert on failure.
  const toggleFavourite = useCallback((r: QuickRoutine) => {
    const next = !r.favourite;
    setRoutines((cur) => cur?.map((x) => (x.id === r.id ? { ...x, favourite: next } : x)) ?? cur);
    favouriteRoutine(r.id, next).then((ok) => {
      if (!ok) setRoutines((cur) => cur?.map((x) => (x.id === r.id ? { ...x, favourite: r.favourite } : x)) ?? cur);
    });
  }, []);
  const launchRoutine = useCallback((r: QuickRoutine) => {
    setQuickStartOpen(false);
    router.push(`/workout?source=template&templateId=${r.id}`);
  }, [router]);

  // Subtle entrance — content fades + rises each time Today gains focus, matching
  // the AuroraScreen transition so the home doesn't hard-cut in. Shared hook
  // (lib/ui): same Reduce-Motion guard + JS-driver blank-screen fix as the shell.
  const enterStyle = useEntrance();

  // Onboarding prefs that tailor the prescription (client-only).
  useEffect(() => {
    AsyncStorage.getItem("hybrid.experience").then((v) => { if (v === "beginner" || v === "intermediate" || v === "advanced") setPrefExp(v); }).catch(() => {});
    AsyncStorage.getItem("hybrid.equipment").then((v) => { if (v === "full" || v === "home" || v === "minimal") setPrefEquip(v); }).catch(() => {});
  }, []);

  const today = useToday();
  // `today` is a DEPENDENCY, not a call to the clock inside the memo. The
  // recovery window (BIOMETRIC_FRESH_DAYS) is evaluated against Date.now() at
  // memo time, so without this an app left open across a day boundary keeps
  // treating a reading as fresh past its last day — the same defect the daily
  // check-in already guards this way.
  const bio = useMemo(() => toBiometrics(signals as unknown as Parameters<typeof toBiometrics>[0]), [signals, today]);
  const log = useMemo(() => personalTrainingLog(sessions), [sessions]);
  // TODAY's readiness feeling (independent of the rail's selected day) → feeds
  // the prescription so the one-tap check-in mechanically scales today's load.
  // `today` is a DEPENDENCY, not a call to the clock inside the memo. Without
  // it this recomputed only when `checkins` changed — so a phone left
  // backgrounded overnight (the normal case) woke still treating yesterday's
  // check-in as today's, and scaled today's prescription off it. See
  // lib/use-today.ts.
  // …and it is the readiness ANSWER, not `checkinFeeling`'s average of four
  // different questions. The average is what made the week rail's readiness
  // pill read "Good" while the card beneath it highlighted the Primed face the
  // athlete had tapped, and what made the load nudge tell them "you're feeling
  // flat today" about a day they never described that way.
  // Every session end, for placing a read against the training before it.
  const sessionEnds = useMemo(
    () => sessions.map((s) => Date.parse(s.completedAt ?? s.startedAt ?? "")).filter((t) => Number.isFinite(t)),
    [sessions],
  );
  // How long ago the athlete last finished a session — the lens the day's
  // answer is read through. "Wrecked" 90 minutes after training is the session
  // talking; the same tap a day later is a recovery signal. See core/feel-timing.
  const lastSessionEnd = useMemo(() => (sessionEnds.length ? Math.max(...sessionEnds) : null), [sessionEnds]);
  // TODAY's reads (independent of the rail's selected day) — the gate and the
  // prescription both read these.
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
  // MAY THE ATHLETE LOG A NEW READ. Two clocks — four hours since the last read,
  // six hours since a session that read was taken in the shadow of — and the
  // later wins. See core/readiness-reads.ts.
  const readGateNow = useMemo<ReadGate>(
    () =>
      readGate({
        lastReadAt: todayReads.length ? todayReads[todayReads.length - 1]!.at : null,
        lastSessionEnd,
        readsToday: todayReads.length,
      }),
    [todayReads, lastSessionEnd],
  );
  // …and when the day carries more than one answer it is the DECISIVE one — the
  // latest read not taken minutes after training. Prescribing off the tap an
  // athlete makes walking out of the gym would deload them for having trained
  // hard. See core/readiness-reads.ts.
  const todayFeeling = useMemo(
    () => decisiveFeeling(todayReads) ?? quickCheckinFeeling(todayCheckin),
    [todayReads, todayCheckin],
  );
  const rx = useMemo(
    () => prescribeSession(log, bio, { profiles: velocityProfiles(sessions), experience: prefExp, equipment: prefEquip, subjectiveReadiness: todayFeeling ?? undefined }),
    [log, sessions, bio, prefExp, prefEquip, todayFeeling],
  );
  const acc = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }), [sessions]);
  const planMaxes = usePlanMaxes();
  const plan = useMemo(() => planProgramToday(planId, sessions.length, planMaxes), [planId, sessions.length, planMaxes]);
  // Only a legitimate reading once sessions have really answered — before that
  // an empty list means "we haven't asked", not "you have nothing logged".
  const hasData = sessionsRead.ready && sessions.length > 0;
  const units = useLoggerPrefs().units;
  const bw = useBodyweightLookup();
  // THE ENDURANCE LANES' ORDER, owned here because the chip that changes it
  // renders on the Endurance cluster's headline row rather than inside the
  // block it orders. See aurora/endurance-lanes.tsx.
  const laneOrder = useLaneOrder(sessions);
  // The date-anchored WEEK RAIL replaces the count-based plan hero whenever an
  // enrolled program + a start date resolve (parity with web home). The shared
  // engine (planSchedule) reconciles each calendar date against logged sessions
  // and skips; the classic "Your plan today" card stays the fallback otherwise.
  const useRail = !!(plan && planId && planStartedAt);
  // LOGBOOK MODE ("The Constant", concept C1) — no plan but real logged
  // history: the SAME week-rail object mounts in logbook mode, so the calendar
  // exists from the first logged session instead of the chooser repeating
  // forever; the chooser demotes to slim "Add structure" rows below the rail.
  // This holds for EVERYONE with history and no plan — premium included: Today's
  // hero is your plan/calendar (or a path to one), never a fabricated AI session
  // presented as "yours". The readiness-driven daily prescription lives on the
  // Cockpit (the analytical layer), not spliced into Today as a hardcoded lift.
  const logbookMode = !initialLoad && !plan && hasData;
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
  // The naming rule lives in @hybrid/core masthead.ts so web can't drift.
  const mast = masthead(dayTs);
  // Sessions logged on the VIEWED day — the confirmation loop (a finished
  // session OR a quick sport log both land here the moment they save).
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
      onOpen={(id) => router.push(`/session/${id}`)}
      onLog={() => setQuickOpen(true)}
      onDone={() => setDoneOpen(true)}
      onRate={setRating}
      onDelete={async (s) => { await deleteSession(s.id); load(); }}
    />
  );

  // The trailing seven-day window ending on TODAY (never the scrubbed day), so
  // the widget/Watch snapshot below reports the real day's result.
  const loggedToday = useMemo(() => logbookWeek(sessions).days.at(-1)?.logged ?? false, [sessions]);
  // ── The widget + Watch snapshot ───────────────────────────────────────────
  // Publish "today at a glance" to the native surfaces whenever the inputs
  // settle: the home-screen widget reads it from the App Group, the Watch app
  // receives it over WatchConnectivity (modules/widget-bridge). A no-op on
  // builds without the native targets (and on Android/web), so this costs
  // nothing where the surfaces don't exist. Always REAL today, never the
  // scrubbed day — a widget shows today by definition.
  useEffect(() => {
    if (initialLoad) return;
    const done = loggedToday;
    publishTodaySnapshot({
      title: plan ? `${plan.planName} — ${plan.day}` : done ? "Training done" : "Train today",
      sub: plan ? `Day ${plan.dayIndex + 1} of ${plan.totalDays}` : "",
      streak: acc.streak.current,
      done,
      updatedAt: new Date().toISOString(),
    });
  }, [initialLoad, plan, loggedToday, acc.streak.current]);

  // The viewed day's check-in (if any) → its feeling + logged-at time, plus the
  // most recent check-in WRITE anywhere (createdAt) — that mirrors the server's
  // global 6h re-log cooldown, which also holds when back-logging a past day.
  // `today` is in the deps for the dayTs == null case, where "the viewed day"
  // IS today and therefore moves at midnight.
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
  // feeds the load model (todayFeeling) — that is a different question and more
  // signal genuinely helps it.
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

  // THE VIEWED DAY AS A SEQUENCE, not a value. Each readiness answer is its own
  // row now (Checkin.reads) — "flat at 09:30" and "flat at 22:00" are two
  // measurements of two different things, and the second is the one that should
  // move training. A row from a database without the reads migration falls back
  // to the single stored value, which is exactly what it used to be.
  const dayReads = useMemo<PlacedRead[]>(() => {
    const rows = (dayCheckin?.reads ?? []).filter((r) => r.metric === QUICK_CHECKIN_METRIC);
    const raw = rows.length
      ? rows.map((r) => ({ value: r.value, at: Date.parse(r.loggedAt) }))
      : dayCheckin && typeof dayCheckin[QUICK_CHECKIN_METRIC] === "number" && feelingAt != null
        ? [{ value: dayCheckin[QUICK_CHECKIN_METRIC]!, at: feelingAt }]
        : [];
    return placeReads(raw, sessionEnds);
  }, [dayCheckin, feelingAt, sessionEnds]);
  // The most recent readiness READ (not the row write): what the recovery
  // schedule is measured from. Editing a day's note in the evening is not a
  // statement about how the session drained.
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
      // The recovery read is answered by a READ, not by the row being touched.
      lastCheckinAt: lastReadAt,
    });
    return sch.due.some((p) => p.kind === "recovery");
  }, [sessions, lastReadAt]);
  const goUpgrade = (source: string) => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source }); router.push("/upgrade"); };

  // The avatar's initials and the bell's unread count moved INTO the app header
  // (aurora/app-header.tsx) with the row that draws them — it reads the same
  // session and the same notifications feed this screen used to.

  // The caption date for the daily header.
  const [dateStr, setDateStr] = useState("");
  useEffect(() => {
    setDateStr(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }));
  }, []);
  // FIRST-RUN CHOOSER state (new user: no plan, no history). With history the
  // logbook rail takes over.
  const firstRun = !initialLoad && !plan && !hasData;
  // Masthead strings for the viewed day: headline, caption date, and (beyond
  // ±1 day, where the headline stops saying it) the scrub-distance tag.
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

  // Readiness (and the AI prescription it feeds) is only real when there's
  // logged history — a bare macrocycle phase (auto-created at onboarding) must
  // never surface a fabricated score/session, so this gates on hasData alone.
  const planReadiness = hasData;
  // The plan-card CTA follows YOUR PLAN when enrolled (source=plan prefills the
  // named plan's day), then the AI-prescribed session for PREMIUM athletes, then
  // an empty start. AI is paid-only, so casual/guests never get source=ai here.
  const startPrescribed = () =>
    router.push(plan ? "/workout?source=plan" : isAthlete && hasData ? "/workout?source=ai" : "/workout?source=empty");

  // Start a SPECIFIC rail day: stash its exact (date-anchored) blocks so the
  // logger prefills the day you tapped — not the count-based today. The rail
  // passes the plan-composed title ("<plan> – Week N, <day>") so the saved
  // session is recognisably the plan's own day, not just the plan. Falls back
  // to the plan start when no blocks are supplied.
  const startPlanDay = useCallback((blocks?: SessionBlock[], title?: string) => {
    if (blocks && blocks.length) {
      AsyncStorage.setItem("hybrid.pendingPlanSession", JSON.stringify({ title: title ?? plan?.planName ?? "Plan", blocks }))
        .then(() => router.push("/workout?source=plan-day"))
        .catch(() => startPrescribed());
      return;
    }
    startPrescribed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.planName]);

  // First-run guided tutorial (#2): shown once after a fresh account onboards.
  // Guest-first rule — if the user logged a guest workout before signing up,
  // that workout lands first; the tutorial steps aside for one open, then shows.
  const [showTour, setShowTour] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        if (await AsyncStorage.getItem("hybrid.tourSeen")) return;
        if (!(await AsyncStorage.getItem("hybrid.pendingTour"))) return;
        // Guest-first: a one-shot marker (set at sign-in flush) means a guest
        // workout is landing — let it show first; defer the tutorial one open
        // and clear the marker so it shows next time. Keyed off the marker, NOT
        // a live session count, so a lingering failed upload can't suppress the
        // tutorial forever.
        if (await AsyncStorage.getItem(CAME_FROM_GUEST_KEY)) {
          await AsyncStorage.removeItem(CAME_FROM_GUEST_KEY).catch(() => {});
          return;
        }
        await AsyncStorage.removeItem("hybrid.pendingTour").catch(() => {});
        setShowTour(true);
      } catch { /* ignore */ }
    })();
  }, []);
  const finishTour = () => {
    setShowTour(false);
    AsyncStorage.setItem("hybrid.tourSeen", "1").catch(() => {});
  };

  // The chrome every hub tab wears: the profile header, then the three pills.
  // Hoisted so the other two tabs render the SAME header without a second copy
  // of it — they hand it to their screen through AuroraScreen's `top` slot, so
  // the pills sit in exactly the same place on all three tabs.
  const hubHeader = (
    <>
      {/* THE APP HEADER — profile, the HYBRID LOCKUP, bell. The SHARED row
          (aurora/app-header.tsx), the same component the Nutrition tab root
          renders, so the app's identity strip cannot be authored twice: every
          number lives in @hybrid/core app-header.ts and the component sources
          its own name, streak and unread count. This screen passes only the
          one thing that is TODAY'S: the hub the drawer switches in place.
          Mirrors web home/today.tsx. */}
      <AppHeader hub={{ value: tab, onChange: selectTab }} />

      {/* THE HUB PILLS — Dashboard / Performance / Feed, directly under the
          profile row and above the calendar. Today is the athlete's home, and
          these three are what a home holds: the day's plan, the numbers behind
          it, and the people around it. Registry shared with web
          (@hybrid/core today-tabs.ts). */}
      <TodayTabs value={tab} onChange={selectTab} />
    </>
  );

  // ── THE OTHER TWO TABS ────────────────────────────────────────────────────
  // Each is the SAME screen its own route renders, handed the hub chrome
  // through `top` so it keeps owning its scroller, its pull-to-refresh and its
  // safe area — nesting them inside Today's own ScrollView would have doubled
  // both. Early-return rather than wrapping the daily loop in a conditional:
  // every hook above has already run, and the dashboard body stays untouched.
  // ONE page — the command centre, this week's volume and the eight-week trend
  // in a single scroll. AuroraPerformance owns that composition, so there is
  // nothing to switch between here.
  // THE DOCK — the same three destinations, floating, once the control inside
  // the header above has scrolled off. It rides OVER each view's scroller (a
  // hub tab owns its own), never inside it, so every tab keeps its exits.
  const hubDock = <TodayHubDock value={tab} onChange={selectTab} topInset={insets.top} />;
  // Performance and Feed own their whole screen, so the dock is layered on top
  // of them rather than handed through `top` (which lands inside their
  // scrollers and would scroll away with the header).
  const withDock = (screen: ReactNode) => (
    <View style={{ flex: 1 }}>
      {screen}
      {hubDock}
    </View>
  );

  if (tab === "performance") return withDock(<AuroraPerformance top={hubHeader} />);

  if (tab === "feed") return withDock(<FeedView top={hubHeader} />);

  return (
    // Inset PADDING, not a SafeAreaView: this shell remounts in full view when
    // the athlete returns from Performance/Feed, and a freshly mounted native
    // SafeAreaView applies its inset one frame late — the chrome would jump
    // under the status bar for a visible frame. The provider's insets are
    // already measured and correct on the very first render.
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      {/* Ambient Aurora gradient backdrop — Today owns its own shell (custom
          entrance + horizontal pager) rather than AuroraScreen, so render the
          same field here so it isn't the one flat tab next to History/More/You. */}
      <AuroraField />
      {/* The safe-area inset is a padded LAYER rather than the shell itself, so
          the dock below mounts in the same coordinate space here as it does over
          Performance and Feed (which own their own safe areas). An absolute
          child is positioned against its parent's PADDING box, so a dock inside
          the padded shell would sit one inset too low and, worse, would only
          retract as far as the status bar instead of clear off the screen. */}
      <View style={{ flex: 1, paddingTop: insets.top }}>
      {showTour && <Tour steps={FIRST_RUN_TOUR} onDone={finishTour} />}
      <ScrollView
        // Today owns its shell instead of AuroraScreen, so it must apply the
        // shell's two paddings ITSELF — 16 of vertical rhythm, and the kit's
        // GUTTER (12dp) at the sides. Never hardcode the side value here: the
        // gutter sweep moved every rail on this screen to bleed by GUTTER, and
        // a screen padded 16 against rails bleeding 12 leaves a 4dp sliver of
        // gutter beside every cut card — the exact thing the full-bleed rule
        // in CLAUDE.md forbids — and shifts the hub chrome 4dp sideways when
        // the athlete switches to Performance or Feed (they get the gutter
        // from AuroraScreen).
        contentContainerStyle={{ padding: 16, paddingHorizontal: GUTTER, paddingBottom: auroraScrollClearance(insets.bottom) }}
        {...navScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.lime} />}
      >
        <Animated.View style={enterStyle}>
        {hubHeader}

        {/* Coming BACK from Performance/Feed, the dashboard body dissolves in
            under the still chrome — the same hub move those tabs play
            (lib/ui HubDissolve). Inert on the first entry, where the
            whole-screen entrance above already owns the motion. */}
        <HubDissolve active={awayFromDashboard.current}>

        {/* THE MASTHEAD — the SHARED hub head (aurora/hub-masthead.tsx), the
            same component Performance and Feed render, so the three tabs of one
            hub can no longer present three different heads. Everything
            measurable about it — the 34 rung, the tracking, the fixed meta row,
            every gap, the scroll compression — lives in @hybrid/core
            hub-masthead.ts; this screen passes only WORDS.
            The headline NAMES THE VIEWED DAY (masthead() in @hybrid/core):
            "Today" until the week rail is scrubbed, "Yesterday"/"Tomorrow" at
            ±1, the weekday name beyond — a static "Today" over Friday's session
            would lie in the largest type on screen. Off today, the scrub
            distance rides the caption line as the mono tag; the rail's today
            chip is the way back. Mirrors web today.tsx. */}
        <HubMasthead
          eyebrow={mastCaption}
          meta={mastTag}
          metaTone="accent"
          title={mastTitle}
        />

        {/* ═════ GROUP: TRAIN — the day's work. The scheduled session (or the
            path to one) and, below it, what was actually done. First of the
            FOUR themed clusters the whole dashboard scroll is organised into
            (Train / Recover / Progress / Explore) — each opens with a
            GroupMark, the quiet wayfinding tier above the blocks' own heads,
            so the page reads as four thoughts instead of nine competing
            cards. Mirrors web today.tsx. ═════ */}
        {/* mt={0}: The head emits the gap to the first content row (HUB_MASTHEAD.gap.below), so this block contributes none. RN does not collapse margins and CSS does, so a block that kept its own top margin would sit 16 lower on mobile than on web. */}
        <GroupMark label={t("w.home.group.train")} mt={0} />

        {/* PLAN TODAY — the single focused hero (your one job today). No kicker or
            eyebrow: the screen is already today's training and the plan names
            itself — the interface shouldn't narrate what the athlete can see.
            When enrolled in a dated program the count-based hero gives way to the
            date-anchored WEEK RAIL (parity with web). */}
        {sessionsError && sessions.length === 0 ? (
          /* SESSIONS FAILED TO LOAD — with no cached data we can't tell an
             enrolled athlete from a first-run one, so the chooser here would be
             a lie ("looks like a new user" when really the network dropped).
             Show the honest retry card instead of the empty-state chooser. */
          <View style={{ marginTop: 16 }}>
            <FetchError onRetry={load} />
          </View>
        ) : useRail ? (
          <View style={{ marginTop: 16 }}>
            <AuroraWeekRail
              planId={planId!}
              planStartedAt={planStartedAt!}
              sessions={sessions}
              maxes={planMaxes}
              onStart={(blocks, title) => startPlanDay(blocks, title)}
              onNavigate={(screen) => { if (screen === "history") router.push("/history"); }}
              onSelectDay={setRailDay}
              doneFloor={doneFloor}
            />
          </View>
        ) : logbookMode ? (
          /* LOGBOOK MODE ("The Constant") — the same week-rail object, in
             logbook mode: the last seven days with the athlete's real logged
             training, so a plan-less regular gets the calendar from their
             first session instead of the chooser forever. The chooser demotes
             to slim rows under an Explore-standard "Add structure" head. */
          <View style={{ marginTop: 16 }}>
            <AuroraLogbookRail
              sessions={sessions}
              onLog={() => router.push("/workout?source=empty")}
              onLogSport={(d) => {
                // Local NOON of the viewed day, so no timezone can slide the
                // record into the day next door. Today logs at "now" as before.
                if (d.isToday) setQuickDay(null);
                else { const at = new Date(d.ts); at.setHours(12, 0, 0, 0); setQuickDay(at.getTime()); }
                setQuickOpen(true);
              }}
              onNavigate={(screen) => { if (screen === "history") router.push("/history"); }}
              onSelectDay={setRailDay}
              doneFloor={doneFloor}
            />
            <View style={{ marginTop: 24, marginBottom: 12, marginHorizontal: 2, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("w.home.logbook.trainYourWay")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.home.logbook.optional")}</Text>
            </View>
            {/* the chooser as a snap slider — the exercise-widget rail's idiom:
                one card ≈ 72% wide so the next path peeks in from the right,
                FULL-BLEED like every screen-level rail: negative margins the
                width of AuroraScreen's 12dp gutter pull the scroll clip to the
                true screen edge, matching internal padding keeps resting cards
                on the column. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={structW + 12}
              decelerationRate="fast"
              style={{ marginHorizontal: -GUTTER }}
              contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingHorizontal: GUTTER }}
            >
              <StructureCard C={C} width={structW} glyph="▤" accent={C.lime} title={t("w.home.today.chooserFollowTitle")} sub={t("w.home.logbook.slimFollowSub")} cta={t("w.home.today.chooserFollowCta")} onPress={() => router.push("/plans")} />
              <StructureCard C={C} width={structW} glyph="⌗" accent={C.blue} title={t("w.home.today.chooserBuildTitle")} sub={t("w.home.logbook.slimBuildSub")} cta={t("w.home.today.chooserBuildCta")} onPress={() => router.push("/builder")} />
              <StructureCard C={C} width={structW} glyph="↯" accent={C.amber} title={t("w.home.today.chooserLogTitle")} sub={t("w.home.logbook.slimLogSub")} cta={t("w.home.today.chooserLogCta")} onPress={() => router.push("/workout?source=empty")} />
              {/* The fourth path — always present (like the other three). With no
                  saved routines the sheet shows its build-first empty state, so
                  it's a prompt, not a dead door. */}
              <StructureCard C={C} width={structW} glyph="⚡" accent={C.violet} title={t("w.home.today.chooserQuickTitle")} sub={t("w.home.logbook.slimQuickSub")} cta={t("w.home.today.chooserQuickCta")} onPress={() => setQuickStartOpen(true)} />
            </ScrollView>
          </View>
        ) : firstRun ? (
          /* FIRST-RUN CHOOSER — "Three Materials", sitting DIRECTLY on the
             page: no wrapper ACard (a box around three cards reads as chrome)
             and one stacked column. NO section head — the "How do you want to
             start?" question was retired with the masthead redesign (the page
             already opens with "Today", and three cards titled
             Follow a plan / Build your own / Log a workout need no sentence
             announcing that a choice is available). Each full-width card wears the Go-Full
             anatomy with its corner glow, the hue confined to glyph + CTA,
             and IS the start — no separate Start pill. Mirrors web today.tsx. */
          <View style={{ marginTop: 16 }}>
            <View style={{ gap: space.sm }}>
              <ChooserCard C={C} glyph="▤" accent={C.lime} title={t("w.home.today.chooserFollowTitle")} sub={t("w.home.today.chooserFollowSub")} cta={t("w.home.today.chooserFollowCta")} onPress={() => router.push("/plans")} />
              <ChooserCard C={C} glyph="⌗" accent={C.blue} title={t("w.home.today.chooserBuildTitle")} sub={t("w.home.today.chooserBuildSub")} cta={t("w.home.today.chooserBuildCta")} onPress={() => router.push("/builder")} />
              <ChooserCard C={C} glyph="↯" accent={C.amber} title={t("w.home.today.chooserLogTitle")} sub={t("w.home.today.chooserLogSub")} cta={t("w.home.today.chooserLogCta")} onPress={() => router.push("/workout?source=empty")} />
              <ChooserCard C={C} glyph="⚡" accent={C.violet} title={t("w.home.today.chooserQuickTitle")} sub={t("w.home.today.chooserQuickSub")} cta={t("w.home.today.chooserQuickCta")} onPress={() => setQuickStartOpen(true)} />
            </View>
          </View>
        ) : (
        <ACard style={{ marginTop: 16 }}>
            {/* On a plan, Start is the full-width action anchored BELOW the lifts;
                the only thing riding the top row is the readiness dial, and only
                once there's logged history — a bare onboarding macrocycle must
                never surface a fabricated readiness score. (Plan-less athletes
                with history land in logbook mode, so this card only ever renders
                the plan hero or the cold-start skeleton.) */}
            {!initialLoad && isAthlete && planReadiness && plan ? (
              <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center" }}>
                <Ring value={rx.readiness} size={44} color={readyColor(rx.readiness, C)} track={C.line}>
                  <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk }}>{rx.readiness}</Text>
                </Ring>
              </View>
            ) : null}
            {plan ? (
              <>
                <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginTop: 8 }}>{plan.planName}</Text>
                {/* One anchor — "how far in" — carried by a thin bar, not four
                    overlapping restatements of the same position. */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.home.today.day")} {plan.dayIndex + 1} / {plan.totalDays}</Text>
                  <View style={{ flex: 1, height: 2, backgroundColor: C.line, borderRadius: 2, overflow: "hidden" }}>
                    <View style={{ height: "100%", width: `${Math.min(100, Math.round(((plan.dayIndex + 1) / plan.totalDays) * 100))}%`, backgroundColor: C.lime }} />
                  </View>
                </View>
                {/* Lift reveal: the first lift reads clear; the rest stay sharp but
                    dissolve — a transparent→card gradient melts them into the card
                    (no blur), so it teases "there's more" at a fixed height.
                    Expanding clears the dissolve and unfolds the rest. Mirrors web
                    today.tsx (which uses an alpha mask for the same effect). */}
                {(() => {
                  const rows = plan.rows;
                  const many = rows.length > 1;
                  const LiftRow = ({ r, i }: { r: (typeof rows)[number]; i: number }) => (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm, paddingTop: 6, marginTop: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }}>{r.session ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{r.session}  </Text> : null}{r.name}{r.note ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}> ({r.note})</Text> : null}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "right", flexShrink: 0 }}>{r.detail}</Text>
                    </View>
                  );
                  return (
                    <>
                      {rows[0] && <LiftRow r={rows[0]} i={0} />}
                      {many && !liftsOpen && (
                        <View style={{ position: "relative" }}>
                          {rows.slice(1, 4).map((r, i) => (
                            <LiftRow key={i} r={r} i={i + 1} />
                          ))}
                          <LinearGradient colors={["transparent", "transparent", C.ink2]} locations={[0, 0.16, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
                          <Pressable onPress={() => setLiftsOpen(true)} hitSlop={6} style={{ position: "absolute", bottom: 0, alignSelf: "center", backgroundColor: `${C.lime}24`, borderWidth: 1, borderColor: `${C.lime}66`, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                            <CtaLabel label={`${t("w.home.today.showAllLifts")} ${rows.length} ${t("w.home.today.liftsWord")} →`} color={txt(C, C.lime)} fontSize={12} font={F.mono} style={{ fontWeight: "600" }} />
                          </Pressable>
                        </View>
                      )}
                      {liftsOpen && rows.slice(1).map((r, i) => <LiftRow key={i} r={r} i={i + 1} />)}
                      {many && liftsOpen && (
                        <Pressable onPress={() => setLiftsOpen(false)} hitSlop={6} style={{ marginTop: 12, alignSelf: "center" }}>
                          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>{t("w.home.today.hideLifts")}</Text>
                        </Pressable>
                      )}
                    </>
                  );
                })()}
                {!isAthlete && (
                  <Pressable
                    onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "today-plan" }); router.push("/upgrade"); }}
                    style={{ marginTop: 12, padding: 12, borderRadius: 0, borderWidth: 1, borderStyle: "dashed", borderColor: `${pa.fill}66` }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: 12, lineHeight: 16, color: C.ash }}><Text style={{ color: pa.text }}>[note]</Text> {t("w.home.today.followingAsWritten1")}{t("w.home.today.unlockFull")}{t("w.home.today.followingAsWritten2")}</Text>
                  </Pressable>
                )}
                {/* Primary action anchored at the BOTTOM of the plan card, below the note. */}
                <Pressable onPress={startPrescribed} style={({ pressed }) => ({ marginTop: 16, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center", ...startGlow(C.lime, pressed) })}>
                  <CtaLabel label={t("w.home.today.start")} color={C.onAccent} fontSize={fs.bodyLg} />
                </Pressable>
                {/* Quiet secondary — reach the Quick-start sheet without leaving the
                    plan: on a plan the four "Train your way" cards aren't shown, so
                    this is the on-plan door to a saved routine (a session off-plan). */}
                <Pressable onPress={() => setQuickStartOpen(true)} style={{ marginTop: 10, paddingVertical: 2, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 12, color: txt(C, C.violet) }}>⚡ {t("w.home.today.quickStartLink")}</Text>
                </Pressable>
              </>
            ) : initialLoad ? (
              /* Cold start — sessions AND enrollment are still loading, so we
                 can't yet tell an enrolled athlete from a first-run one. Show a
                 skeleton (not the chooser) so the plan simply appears once it
                 resolves, with no first-run-chooser flash between. */
              <>
                <View style={{ height: 24, width: "60%", borderRadius: 8, backgroundColor: C.line, opacity: 0.5, marginTop: 8, marginBottom: 10 }} />
                <View style={{ height: 12, width: "90%", borderRadius: 6, backgroundColor: C.line, opacity: 0.35 }} />
              </>
            ) : (
              /* Every other state renders OUTSIDE this card: the first-run
                 chooser and logbook mode (plan-less history, premium included)
                 sit directly on the page above. This card only carries the plan
                 hero + the cold-start skeleton. */
              null
            )}
          </ACard>
        )}

        {/* DONE TODAY, when there is no rail to hold it. Every session logged on
            the VIEWED day normally renders as the week rail's LOWER FLOOR (the
            doneFloor above) — one day, one card. But the count-based plan hero
            has no rail to sit in, so on that path the floor keeps its own card:
            the rows are the confirmation loop and must never simply vanish.
            Hidden for a true first run (no plan, nothing ever logged): the
            chooser above owns that state, and an empty card under it would be a
            second competing log CTA. */}
        {!useRail && !logbookMode && (!!sched || sessions.length > 0) && (
          <View style={{ marginTop: 16, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, padding: CARD_PAD, backgroundColor: C.ink2, ...cardShadow() }}>
            <DoneFloor
              rows={doneOnDay}
              planIds={fulfilledIds}
              isToday={dayIsToday}
              dayLabel={dayLabel}
              units={units}
              bw={bw}
              pad={CARD_PAD}
              rule={false}
              onOpen={(id) => router.push(`/session/${id}`)}
              onLog={() => setQuickOpen(true)}
              onDone={() => setDoneOpen(true)}
              onRate={setRating}
            />
          </View>
        )}

        {/* ═════ GROUP: RECOVER — how the body is answering. The daily
            check-in ritual: readiness reads, the follow-up questions, the
            day's record. Mirrors web today.tsx. ═════ */}
        <GroupMark label={t("w.home.group.recover")} />

        {/* TIER 2 — the feeling-led card: the daily check-in IS the ritual. The
            four faces set the day's readiness inline (one tap, no sheet) —
            nothing else; the done count + log action live on the Also Today card
            above. Follows the rail's selected day: a past day shows (and can
            back-log) THAT day's feeling; a future day is read-only. */}
        <View>
          <FeelingCard
            C={C}
            feeling={feeling}
            dayMetrics={dayCheckin}
            daySessions={daySessions}
            recoveryDue={recoveryDue || readGateNow.wanted}
              lastSessionEnd={lastSessionEnd}
            dayReads={dayReads}
            gate={readGateNow}
            isToday={dayIsToday}
            isFuture={dayIsFuture}
            dayTs={railDay?.ts ?? null}
            dayLabel={dayLabel}
            onPicked={checkinsRead.retry}
          />
        </View>

        {/* RETURN TO PLAY — the running protocol, on the day it has to be done.
            It used to render inside the Performance tab's Tissue card, several
            screens from where an injured athlete decides what to do this
            morning. A protocol is a DAILY object — stages, gates, dates — so it
            belongs in the Recover cluster beside the check-in. The Tissue card
            keeps the status line and the door, so the flag and the protocol
            stay one object. Renders nothing when no protocol is open. Mirrors
            web today.tsx. */}
        <RtpPanel />

        {/* HEAT — the sauna log, in the Recover cluster beside the check-in.
            It sits HERE rather than only on the post-session summary because
            most sittings do not follow a session: this is the back-dating
            entry, and the row states the week so far so the chronic channel
            (which is the better-evidenced one) is visible without opening
            anything. The trailing glyph is a bare ＋ — it GROWS the log in
            place, it does not go anywhere. */}
        <HeatRow />

        {/* ═════ GROUP: PROGRESS — where the LIFTING is going. Three named
            things, in the order the question is actually asked: the period's
            verdict, the records it produced, and the movements underneath them.

            Endurance used to be part of this cluster, which is what forced the
            reading it never survived: a runner scrolled past a strength
            verdict, a strength records rail and a strength-favourites rail to
            reach their own sport, under a single headline claiming all of it
            was "Progress". It is its own section now, below the seam. Mirrors
            web today.tsx. ═════ */}
        <GroupMark label={t("w.home.group.progress")} />

        {/* ───── (a) THIS WEEK — the verdict card, and the screen's date
            filter (Endurance shows the same one again, on the same period). A
            verdict with its working-out shown. Replaces the
            Statistics and Analytics destinations on Today (both are now
            promotedTo "today" in core nav.ts). It also renders (b) RECORDS
            directly underneath, because a PR belongs to the period this filter
            is showing — same window, one control. ───── */}
        <AuroraWeekVerdict
          sessions={sessions}
          units={units}
          bw={bw}
          onSession={(id) => router.push(`/session/${id}`)}
        />

        {/* ───── (c) EXERCISES — the favourites widget rail (free for
            everyone): swipeable full-bleed cards, one favourite per purpose,
            stock-ticker deltas; tap opens that movement's own stats page.
            Hidden until there's history — an empty rail would just be chrome.
            Last in the cluster because it is the finest grain: verdict →
            records → per-movement. ───── */}
        {sessions.length > 0 && (
          <ExerciseWidgetRail
            sessions={sessions}
            deferToLanes={isAthlete}
            onOpen={(name) => router.push(`/exercise?name=${encodeURIComponent(name)}`)}
            onAll={() => router.push("/exercises")}
          />
        )}

        {/* ═════ THE SEAM, then ENDURANCE. The seam is the page turning: one
            full-bleed hairline, fading at both ends, belonging to neither
            section (aurora/section-seam.tsx). Whitespace alone separated the
            clusters while they were short; after a screen of Progress the extra
            air read as a gap in a list rather than as the end of a chapter, and
            the next headline had to carry that on its own.

            The whole section is absent for a pure lifter — no heading, no empty
            card, no column of zeroes — which is why it is gated on the HISTORY
            rather than on the window: a runner who took this week off still
            finds their section where they left it, with the card saying the
            week was quiet. Mirrors web today.tsx. ═════ */}
        {hasEnduranceHistory(sessions) && (
          <>
            <SectionSeam />
            {/* The order control sits ON THE HEADLINE, which is where the
                Explore SectionHead grammar puts a head-level control: beside
                the title, same row. It used to float on an orphan
                right-aligned row between the section's opener and its first
                lane, attached to neither — and a control that orders the whole
                section belongs at the section's altitude. Hidden with one
                lane: sorting a list of one is a control that does nothing. */}
            <GroupMark
              label={t("endurance.title")}
              mt={24}
              right={isAthlete && laneOrder.many
                ? <LaneOrderChip order={laneOrder.order} onPress={laneOrder.cycle} />
                : undefined}
            />

            {/* ───── (a) THE LEAD — the section's opener, and it is a
                SENTENCE: how many sports, and which carried them. That is the
                one thing about this section no other block on Today can state,
                which is exactly why the two earlier cuts failed — a
                per-discipline breakdown is a table of contents for the lanes
                directly below it, and a row of totals is the verdict card's
                own columns one screen up (distance especially: only these
                groups ever carry any). Under the sentence, one mono line —
                this section's own time against its own baseline, the only
                comparison nothing else makes. It carries no filter: it reads
                the screen's period, which the verdict card's control
                writes. ───── */}
            <AuroraEnduranceSummary sessions={sessions} bw={bw} />

            {/* ───── (b…) ONE LANE PER SPORT — a full-bleed rail per logged
                discipline carrying that sport's whole read (efforts / distance
                / time, 8-week volume, pace trend, pace zones, last effort). NOT
                gated on dayIsToday: an eight-week volume chart is not a
                property of the day you happen to be scrubbed to. Headless — the
                GroupMark above now says "Endurance", and the block printing it
                again would be the title twice in 60dp; the order chip keeps its
                own row. ───── */}
            {isAthlete && (
              <AuroraEnduranceLanes
                sessions={sessions}
                head={false}
                order={laneOrder.order}
                canOpen={(d) => !!sportForDiscipline(d)}
                onOpen={(d) => { const sport = sportForDiscipline(d); if (sport) router.push({ pathname: "/sport-page", params: { name: sport } }); }}
              />
            )}

            {/* ───── (x) OTHER SPORTS — tennis, squash, five-a-side:
                everything logged as `discipline: "sport"`, the bucket
                ENDURANCE_DISCIPLINES deliberately excludes. LAST in the section
                because it is the same question one step out: what else did you
                actually play. These sports are TIMED, so a sport gets ONE tile
                rather than a rail — the block spends its width on the NUMBER of
                sports, not the depth of each. Renders nothing until a sport is
                logged. ───── */}
            <AuroraOtherSports sessions={sessions} onOpen={(sport) => router.push({ pathname: "/sport-page", params: { name: sport } })} />
          </>
        )}

        {/* THE RETROSPECTIVE'S EXIT — the doors past this period. They sit
            after BOTH clusters, not at the end of Progress: they are the way
            out of everything above them (the archive holds endurance too), and
            one exit point after all the breakdowns is the rule wave 3
            established. Same door-row anatomy, same destinations. */}
        <DoorRow glyph="▤" title={t("w.home.week.archive")} sub={t("w.home.week.archiveSub")} onPress={() => router.push("/history")} />
        {isAthlete && <DoorRow glyph="◫" title={t("w.home.week.deep")} sub={t("w.home.week.deepSub")} onPress={() => router.push("/analytics")} />}

        {/* ═════ GROUP: EXPLORE — beyond your own data: the premium tier and
            the coach marketplace. The label the old Explore tab left behind.
            Mirrors web today.tsx. ═════ */}
        <GroupMark label={t("w.home.group.explore")} />

        {/* ───── GO FULL — demoted from two display-weight AccessCards to ONE
            compact quiet row. It is the SHARED DoorRow now (Aug 2026): it had
            been a hand-rolled copy of that anatomy, so when the doors went
            chromeless this one would have stayed a filled card sitting between
            two flat ones — the same drift that let five rails draw five
            different tails. `premium` carries the ✦ in the accent; the ✦ is
            the semantic premium signifier and still the ONLY thing wearing it.
            Routes where the first AccessCard (Cockpit) routed. Mirrors web. */}
        <DoorRow
          glyph="✦"
          premium
          title={t("w.home.today.goFull")}
          sub={t("w.home.today.goFullRowSub")}
          onPress={() => (isAthlete ? router.push("/performance") : goUpgrade("today-cockpit"))}
        />

        {/* ───── FOLLOW A COACH — Today's last block, and the only thing left
            below the premium cards. Nutrition is NOT summarised here: Today is
            the training loop, and fuelling has its own destination — a
            bottom-nav tab now, so it is one tap from anywhere rather than a
            widget competing for this screen.

            The coach rail moved here from the Explore tab, which is gone. It is
            on the PAGE rather than a row that opened a sheet: the rail sells
            coaches by showing them, and a row reading "Follow a coach" sold
            nothing. Full-bleed per the slider rule (the cards run under the
            screen edge), headerless under the section head, with the trailing
            "See more" carrying through to the marketplace. Mirrors web
            aurora/today.tsx. ───── */}
        {/* The descriptor sits UNDER the title, not opposite it: "Find a coach
            for your goal" is a subtitle, not a meta value, and at 30-odd
            characters in PL/DE it would collide with the title on a phone. Same
            anatomy the rail's own built-in header uses. */}
        <View style={{ marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
          <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("w.home.today.rowCoach")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>{t("w.home.today.rowCoachSub")}</Text>
        </View>
        <CoachRail onOpen={() => router.push("/coaches")} headerless bleed />

        </HubDissolve>
        </Animated.View>
      </ScrollView>
      </View>

      {hubDock}

      {/* QUICK LOG sheet — the sport-log carousel, opened from the glance strip. */}
      <Sheet visible={quickOpen} onClose={() => { setQuickOpen(false); setQuickDay(null); }} title={t("w.home.quickSport.title")} sub={t("w.home.quickSport.sub")}>
        <View style={{ marginTop: 16 }}>
          <QuickSportLog sessions={sessions} date={quickDay} onSaved={() => { load(); setQuickOpen(false); setQuickDay(null); }} solid />
        </View>
      </Sheet>

      {/* RATE sheet — "how hard was that", for a session that arrived without an
          answer (imported off a watch, quick-logged after the fact). One tap
          from the floor's row: the alternative is opening the session and
          scrolling its summary to the last panel, which nobody does, which is
          why those sessions were counting for nothing in the load model. */}
      <FeelSheet session={rating} sessions={sessions} visible={rating != null} onClose={() => setRating(null)} />

      {/* QUICK START sheet — re-launch a saved routine (favourites + rediscover). */}
      <QuickStartSheet
        visible={quickStartOpen}
        onClose={() => setQuickStartOpen(false)}
        routines={routines ?? []}
        onLaunch={launchRoutine}
        onToggleFavourite={toggleFavourite}
        onBuildNew={() => router.push("/builder")}
      />

      {/* DONE TODAY sheet — everything logged on the viewed day + the calendar. */}
      <Sheet
        visible={doneOpen}
        onClose={() => setDoneOpen(false)}
        title={dayIsToday ? t("w.home.today.doneModalTitle") : t("w.home.today.glanceDoneOn").replace("{d}", dayLabel ?? "")}
        sub={dayIsToday ? dateStr : dayLabel ?? ""}
      >
        <View style={{ marginTop: 12 }}>
          {/* THE STREAK — the shared mark (aurora/streak-mark.tsx) at its
              inline rung: the same mark as the one under the wordmark, with
              the same count and the same destination. It used to be a flame
              and a number spliced into the sub line above, which is a <Text>
              — text can hold a glyph but not a control, and this figure is a
              control now. It draws nothing when there is no streak, so there
              is no conditional here and no separator left dangling.
              Mirrors web today.tsx. */}
          {/* alignItems, not alignSelf on the mark: the mark must not stretch
              to the sheet's width (the whole row would then be the tap
              target), and an empty wrapper adds no height on the days there
              is no streak to draw. */}
          {dayIsToday ? (
            <View style={{ alignItems: "flex-start" }}>
              <StreakMark rung="inline" onDismiss={() => setDoneOpen(false)} />
            </View>
          ) : null}
          {doneOnDay.length === 0 ? (
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, lineHeight: leading(fs.body), paddingVertical: 8 }}>{t(dayIsToday ? "w.home.today.doneModalEmpty" : "w.home.today.doneModalEmptyDay")}</Text>
          ) : doneOnDay.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => { setDoneOpen(false); router.push(`/session/${s.id}`); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}
            >
              <View style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: `${C.lime}2e`, borderWidth: 1, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.black, fontSize: 14, color: txt(C, C.lime) }}>✓</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{s.title}</Text>
                <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{sessionMeta(s, units, bw(s.startedAt))}</Text>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{t("w.home.today.doneView")} ›</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => { setDoneOpen(false); router.push("/calendar"); }} style={{ marginTop: 16, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }}>
            <AuroraIcon name="calendar" size={15} color={C.ash} />
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.home.today.doneCalendar")}</Text>
          </Pressable>
        </View>
      </Sheet>
    </View>
  );
}


// GroupMark — the headline-tier cluster marker — moved to its own module
// (aurora/group-mark.tsx) when the Performance page adopted the same
// clustering; both hub scrolls now import one component.

// One row of the first-session chooser (#3): a tappable option with a title, a
// one-line sub, and a Free/Full badge.
// One card of the first-run chooser — the Go-Full AccessCard anatomy (corner
// glow, title, body, CTA at the bottom in mono uppercase) turned toward the
// beginner, tinted by the path's accent. Full-width in a stacked column at
// natural height; the hue lives in the small glyph + CTA only — title and
// body stay neutral. Mirrored on web (aurora/today.tsx ChooserCard).
function ChooserCard({ C, glyph, accent, title, sub, cta, onPress }: { C: P; glyph: string; accent: string; title: string; sub: string; cta: string; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, padding: 20, overflow: "hidden" }}>
      {/* path-accent glow blooming from the top-right corner (Go-Full anatomy) */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `${accent}0d` }]} />
      <LinearGradient pointerEvents="none" colors={[`${accent}2b`, `${accent}00`]} start={{ x: 1, y: 0 }} end={{ x: 0.25, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <Text style={{ fontSize: 18, lineHeight: 20, color: txt(C, accent) }}>{glyph}</Text>
      <Text style={{ fontFamily: F.black, fontSize: 19, letterSpacing: -0.3, color: C.chalk, marginTop: 10 }}>{title}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: fs.note, color: C.ash, marginTop: 6, lineHeight: leading(fs.note, "tight") }}>{sub}</Text>
      <CtaLabel label={`${cta} →`} color={txt(C, accent)} fontSize={11} font={F.mono} style={{ letterSpacing: 1.2, textTransform: "uppercase", marginTop: 16 }} />
    </PressScale>
  );
}

// The chooser, demoted — once real history exists the three full onboarding
// cards become a horizontal snap slider under a quiet "Train your way" head
// (logbook mode): each card keeps the ChooserCard's Go-Full anatomy (corner
// glow, glyph, title, sub, mono CTA) at rail width, so the options stay
// reachable without re-onboarding a regular every day.
// Mirrored on web (aurora/today.tsx StructureCard).
function StructureCard({ C, width, glyph, accent, title, sub, cta, onPress }: { C: P; width: number; glyph: string; accent: string; title: string; sub: string; cta: string; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ width, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, padding: 16, overflow: "hidden" }}>
      {/* path-accent glow blooming from the top-right corner (ChooserCard anatomy) */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `${accent}0d` }]} />
      <LinearGradient pointerEvents="none" colors={[`${accent}2b`, `${accent}00`]} start={{ x: 1, y: 0 }} end={{ x: 0.25, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <Text style={{ fontSize: 15, lineHeight: 17, color: txt(C, accent) }}>{glyph}</Text>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.black, fontSize: 18, letterSpacing: -0.3, color: C.chalk, marginTop: 10 }}>{title}</Text>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 4 }}>{sub}</Text>
      <CtaLabel label={`${cta} →`} color={txt(C, accent)} fontSize={10} font={F.mono} style={{ letterSpacing: 1.2, textTransform: "uppercase", marginTop: 12 }} />
    </PressScale>
  );
}

// The feeling-led daily card — "How ready do you feel?" with the four faces set
// the day's readiness inline (one tap → createCheckin, the same write the full
// check-in makes). Single-purpose: the done count + log action moved up into the
// Also Today card. The picked face lights in its own semantic feeling colour.
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
function FeelingCard({ C, feeling, dayMetrics, daySessions, recoveryDue, lastSessionEnd, dayReads: allDayReads, gate, isToday, isFuture, dayTs, dayLabel, onPicked }: {
  C: P;
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
  const [picked, setPicked] = useState<{ day: number | null; rating: number; reads: number; at: number } | null>(null);
  // THE MIS-TAP, TAKEN BACK. The faces are a one-tap target inside a scrolling
  // card, so the row gets brushed — and every other property of this card made
  // that permanent: the read is appended (nothing here is ever overwritten), the
  // gate shuts for four hours behind it, and the reading goes on to scale the
  // next session's load. So the read just given stays withdrawable for
  // READ_UNDO_MIN minutes. Not a confirm step — that would tax every honest tap
  // to catch the rare wrong one, and turn the card's single gesture into two —
  // and not an edit either: the row goes, the day falls back to whatever read
  // now governs it, and past the window the honest move is a NEW read.
  const [undone, setUndone] = useState<{ day: number | null; at: number } | null>(null);
  // The withdrawn read is gone from the card the moment the server agrees,
  // rather than at the next refetch — and the filter self-clears when the
  // refetch lands without it.
  const dayReads = useMemo(
    () => (undone && undone.day === dayTs ? allDayReads.filter((r) => r.at !== undone.at) : allDayReads),
    [allDayReads, undone, dayTs],
  );
  // WHAT THE READING IS WORTH, ON REQUEST. This used to be ONE grey sentence an
  // ⓘ toggled in and out under the faces — while every figure on the Performance
  // tab opened onto its measured inputs, its arithmetic and its caveat. The
  // reading in Recover governs the day (it scales the next session's load, it
  // decides whether a second read is wanted, it is half of the pair that
  // measures this athlete's clearance) and it now gets the SAME door: the
  // freshness/wearable sheet idiom, off `readinessReadExplain` in @hybrid/core.
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
  // counts as logged so the faces don't flicker back open in the window between
  // the write and the refetch that confirms it.
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
  // THE EXPLANATION, computed only while the sheet is up — from the SAME engine
  // the prescription reads, so the load figure in the sheet and the load the
  // session is given are one value read twice. It is placed against the DECISIVE
  // read's own clock, not the clock right now: the answer being explained was
  // given at a moment, and dating it to this instant would relabel a morning
  // reading as an evening one just because the athlete opened the app again.
  // With no read behind the reading, the time since training classifies it (and
  // nothing more — see readinessReadExplain).
  const explain = useMemo(
    () => (whyOpen && shownFeeling
      ? readinessReadExplain({
          feeling: shownFeeling,
          read: decisive,
          reads: dayReads,
          gate: isToday ? gate : null,
          hoursSinceSession: hoursSince(lastSessionEnd, Date.now()),
        })
      : null),
    [whyOpen, shownFeeling, decisive, dayReads, gate, isToday, lastSessionEnd],
  );
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
  const line = gateNote
    ? { key: gateNote, sub: null as string | null, tone: "ash" as const }
    : inviting
      ? { key: "w.home.today.readInvite", sub: "w.home.today.readInviteSub", tone: "chalk" as const }
      : !shownFeeling && isToday
        ? { key: "w.home.today.heroAsk", sub: null as string | null, tone: "ash" as const }
        : trend
          ? { key: READ_TREND_KEY[trend.trend], sub: null as string | null, tone: trend.trend === "sinking" ? ("amber" as const) : ("ash" as const) }
          : null;
  const lineColor = line?.tone === "chalk" ? C.chalk : C.ash;
  // THE CARD'S ONE FILL. Two lime-tinted surfaces were competing — the recovery
  // ask and the follow-up trigger. The ask wins whenever it is showing: it is
  // the app asking for something, and the follow-up is a door that can wait.
  const asking = isToday && recoveryDue;
  // THE WITHDRAWAL WINDOW, LIVE. The stored read is preferred over the optimistic
  // stamp so the window runs on the server's clock the moment the refetch lands
  // — and because it reads off the record rather than off this render's state,
  // the undo survives a remount inside the window instead of vanishing with it.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const undoStamp = undoableRead(dayReads, nowTick)?.at ?? (justPicked ? picked!.at : null);
  // Any day you can log on, you can un-log on: a back-logged read is stamped
  // with the moment it was WRITTEN, so the window measures the tap either way.
  const undoAt = !isFuture && undoStamp != null && nowTick - undoStamp < READ_UNDO_MIN * 60_000 ? undoStamp : null;
  // One tick, scheduled for the exact moment the window shuts — the affordance
  // has to leave on its own, and a card that re-renders every second to work
  // that out is a card that re-renders every second all day.
  useEffect(() => {
    if (undoAt == null) return;
    const id = setTimeout(() => setNowTick(Date.now()), Math.max(undoAt + READ_UNDO_MIN * 60_000 - Date.now(), 0) + 250);
    return () => clearTimeout(id);
  }, [undoAt]);
  const undo = async () => {
    if (busy || undoAt == null) return;
    setBusy(true);
    const weekOf = isToday || dayTs == null ? new Date().toISOString() : new Date(dayTs + 12 * 3600 * 1000).toISOString();
    const ok = await undoCheckinRead(weekOf);
    setBusy(false);
    if (!ok) return; // a failed withdrawal simply doesn't take — the read stands
    // The follow-up opened off the tap being withdrawn — leaving it up would go
    // on asking the rest of a check-in the athlete just said they hadn't started.
    setFollowUpOpen(false);
    setPicked(null);
    setUndone({ day: dayTs, at: undoAt });
    revalidate.recovery();
    revalidate.checkins();
    onPicked();
  };
  const pick = async (rating: number) => {
    if (locked) return;
    setBusy(true);
    // Back-logging a past day stamps that day's noon (local) so the check-in
    // lands on the viewed date regardless of timezone; today logs "now".
    const weekOf = isToday || dayTs == null ? new Date().toISOString() : new Date(dayTs + 12 * 3600 * 1000).toISOString();
    const r = await createCheckin({
      weekOf,
      // ONE tap answers ONE question. This used to write the picked level into
      // all four metrics, inventing three measurements the athlete never gave —
      // which the volume profile then showed back to them as "measured sleep".
      // See core/checkin-flow.ts.
      //
      // …and it sends ONLY that metric. It used to send explicit nulls for the
      // other three (and for the note + adherence), which the route wrote
      // straight over the day's row — so a second tap in the afternoon deleted
      // the sleep, freshness and mood answered that morning. An omitted field
      // is now left alone.
      ...quickCheckinPatch(rating),
    });
    setBusy(false);
    if (r.ok) {
      // Show the tap NOW; the refetch below confirms it a moment later.
      setPicked({ day: dayTs, rating, reads: dayReads.length, at: Date.now() });
      setUndone(null);
      revalidate.recovery();
      // The cached check-in row drives this very card — drop it so the athlete's
      // own pick is never the thing that looks stale.
      revalidate.checkins();
      onPicked();
      // …and go straight into the rest of the questions. Answering the headline
      // is the moment the athlete is most willing to answer more, and it's now
      // the only way the other three ever get real values. Only while something
      // is still outstanding: a SECOND read of the day has nothing left to ask.
      if (isToday && !done.complete) setFollowUpOpen(true);
    }
  };
  return (
    <View style={{ marginTop: 16, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, padding: CARD_PAD, backgroundColor: C.ink2, ...cardShadow() }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        {/* The card ASKS until it has an answer, then REPORTS: once the hero
            carries the reading, repeating the question above it is the same
            sentence twice. */}
        <Text style={{ flexShrink: 1, fontFamily: F.bold, fontSize: fs.subtitle, letterSpacing: -0.3, color: C.chalk }}>
          {t(shownFeeling ? "w.home.today.glanceReadiness" : "w.recovery.readiness.title")}
        </Text>
        {/* Mono meta on the right, per the Explore SectionHead standard: the
            way back out of a read just given, then the viewed date on another
            day, then how long the faces are held. It used to be a pill sharing
            a row with the reason paragraph. */}
        {undoAt != null ? (
          /* THE WAY BACK, for as long as it is honest. It takes the head-level
             control slot (the Explore SectionHead standard) and outranks the
             cooldown countdown while it shows: an athlete who has just tapped
             wants to know they can take it back far more than they want to know
             when the next read opens — and the countdown returns the moment the
             window shuts. Chalk, not the accent: the accent is the "go" colour,
             and this undoes a go. */
          <Pressable onPress={undo} disabled={busy} accessibilityRole="button" accessibilityLabel={t("w.home.today.readUndoA11y")} hitSlop={10} style={{ opacity: busy ? 0.5 : 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: C.chalk }}>
              {t("w.home.today.readUndo")}
            </Text>
          </Pressable>
        ) : !isToday && dayLabel ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{dayLabel}</Text>
        ) : asking ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: txt(C, C.lime) }}>
            {t("session.feel.promptRecovery")}
          </Text>
        ) : gate.reason === "dayFull" && isToday ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>
            {dayReads.length} / {MAX_READS_PER_DAY}
          </Text>
        ) : held && gate.opensAt != null ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>
            {t("w.home.today.feelNextIn")} {coolH}h {coolM}m
          </Text>
        ) : null}
      </View>
      {/* THE SECOND ASK, NAMED. An athlete who already answered at the end of
          their session and is asked again a few hours later will read it as the
          app having forgotten — unless it says what this one is for. It is a
          different question: not "how hard was that" but "did you absorb it".
          See core/feel-schedule.ts. */}
      {/* THE ONE NUMBER. The reading that governs the day, at display weight,
          in its own semantic tone — the card's single focal element. An empty
          day gets a light dash rather than a zero or a middling 3: there is no
          reading yet, and inventing one is the failure this card exists to
          avoid. The i sits with it because it explains THIS reading. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
        {/* display weight, not hero weight — fs.display (was 46), lineHeight
            proportional: a status reading must never outrank the Start action */}
        <Text style={{
          fontFamily: shownFeeling ? F.black : F.reg, fontSize: fs.display, lineHeight: 27, letterSpacing: shownFeeling ? -1 : -0.2,
          color: shownFeeling ? txt(C, C[READINESS_FACE[shownFeeling].accent]) : `${C.ash}8c`,
        }}>
          {shownFeeling ? t(`w.recovery.readiness.${shownFeeling}`) : "—"}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{heroStamp}</Text>
        {/* THE DOOR — the Performance tab's affordance exactly: the ⓘ glyph
            bare, at 13, riding the row of the figure it explains. It used to be
            an 11px glyph inside a second bordered circle, which is the noise
            the freshness columns dropped for the same reason (the glyph IS a
            ring), and it used to toggle one sentence in place rather than open
            the derivation. It also showed only on a day the note existed for;
            the sheet has something to say about EVERY reading, so it shows
            whenever there is one. */}
        {shownFeeling ? (
          <Pressable
            onPress={() => setWhyOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("w.home.today.readWhy")}
            hitSlop={10}
            style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}
          >
            <AuroraIcon name="info" size={13} color={C.ash} />
          </Pressable>
        ) : null}
      </View>
      <ReadinessSheet explain={explain} stamp={heroStamp} onClose={() => setWhyOpen(false)} />

      {line ? (
        <Text style={{ marginTop: 10, fontFamily: line.sub ? F.bold : F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: lineColor }}>
          {t(line.key)}
          {line.sub ? <Text style={{ fontFamily: F.reg, color: C.ash }}> {t(line.sub)}</Text> : null}
        </Text>
      ) : null}

      <View style={{ height: 1, backgroundColor: C.line, marginTop: 16 }} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12, marginBottom: 2 }}>
        {READINESS_FEELINGS.map((key, i) => {
          const on = selected === key;
          const accent = txt(C, C[READINESS_FACE[key].accent]);
          return (
            <PressScale key={key} onPress={() => pick(i + 2)} disabled={locked} accessibilityRole="button" accessibilityState={{ selected: on, disabled: locked }} accessibilityLabel={t(`w.recovery.readiness.${key}`)}
              style={{ flex: 1, alignItems: "center", gap: 8, paddingVertical: 10, marginHorizontal: 2, borderRadius: 16, borderWidth: 1, borderColor: on ? `${accent}66` : "transparent", backgroundColor: on ? `${accent}1f` : "transparent", opacity: locked && !on ? 0.45 : 1 }}>
              <ReadinessFace feeling={key} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: on ? accent : C.ash }}>{t(`w.recovery.readiness.${key}`)}</Text>
            </PressScale>
          );
        })}
      </View>
      {/* THE DAY'S RECORD — kept, not a footnote.
          This used to be one grey line, "Logged Flat, 5h ago", which is what a
          value looks like when the app can only hold one. A day now holds a
          SEQUENCE, and the sequence is the interesting part: the drop (or the
          climb) between an answer given in the gym and one given hours later is
          what measures this athlete's own recovery. So the readings get a place
          of their own — each with the face it was given as, the clock time it
          was given at, and how long after training that was. The one training
          is prescribed off is marked; none of them is ever overwritten. */}
      {dayReads.length > 0 ? (
        <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
          {/* THE DOOR. Shut by default — the hero is what the card is for, and a
              list under it is the thing that made the card grow in the first
              place. The count sits on the door so the day's shape is legible
              without opening it. */}
          <Pressable
            onPress={() => setReadsOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: readsOpen }}
            style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>
              {t(isToday ? "w.home.today.readsTitleToday" : "w.home.today.readsTitle")}
            </Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{dayReads.length}</Text>
            <Text style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: fs.note, color: C.ash }}>{readsOpen ? "↓" : "→"}</Text>
          </Pressable>
          {readsOpen ? (
          <View style={{ gap: 8, marginTop: 12 }}>
            {dayReads.map((r) => {
              const governs = decisive != null && r.at === decisive.at;
              return (
                <View key={r.at} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ReadinessFace feeling={r.feeling} scale={0.59} tone={governs ? undefined : C.ash} />
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>
                    {sessionClockTime(new Date(r.at).toISOString())}
                  </Text>
                  <Text style={{ fontFamily: governs ? F.bold : F.reg, fontSize: fs.caption, color: governs ? C.chalk : C.ash }}>
                    {t(`w.recovery.readiness.${r.feeling}`)}
                  </Text>
                  {/* How long after training it was given — the thing that makes
                      two identical answers different measurements. Reads with no
                      session behind them say so rather than showing a lag of 0. */}
                  <Text style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>
                    {r.hoursSinceSession != null ? `+${Math.round(r.hoursSinceSession)}h` : t("w.home.today.readNoSession")}
                  </Text>
                </View>
              );
            })}
          </View>
          ) : null}
        </View>
      ) : null}

      {/* Once today's readiness is set, nudge the athlete to log the fuller
          picture — and run that guided check-in RIGHT HERE. The one-tap face is
          step 1 (Energy); the expansion walks the remaining four cards (Sleep,
          Soreness, Mood, then weight/adherence/note) and refines TODAY's row, so
          the whole ritual lives on Today — no trip to the More tab, no second
          entry, no cooldown block. */}
      {isToday && shownFeeling ? (
        <>
          <Pressable
            onPress={() => setFollowUpOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={done.complete ? t("w.recovery.readiness.logMoreDone") : t("w.recovery.readiness.logMore")}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, backgroundColor: done.complete || asking ? "transparent" : `${txt(C, C.lime)}12`, borderWidth: 1, borderColor: done.complete || asking ? C.line : `${txt(C, C.lime)}42` }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>
                {done.complete ? t("w.recovery.readiness.logMoreDone") : t("w.recovery.readiness.logMore")}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 3 }}>
                {done.answered} / {done.total} {t("w.home.today.answered")}
              </Text>
            </View>
            {/* The outstanding questions, named — a count alone doesn't tell you
                what you'd be answering. */}
            <View style={{ flexDirection: "row", gap: 5 }}>
              {checkinSteps(daySessions).filter((st) => st.kind !== "details").map((st, i) => (
                <View
                  key={i}
                  accessibilityLabel={st.kind === "metric" ? t(metricLabelKey(st.key)) : st.session.title}
                  style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: stepAnswered(st, metrics) ? txt(C, C.lime) : C.line }}
                />
              ))}
            </View>
            <ArrowGlyph size={15} color={done.complete || asking ? C.ash : txt(C, C.lime)} />
          </Pressable>
          {followUpOpen ? (
            <Sheet
              visible={followUpOpen}
              scroll
              onClose={() => setFollowUpOpen(false)}
              title={t("w.recovery.readiness.followUpTitle")}
              sub={t("w.recovery.readiness.followUpSub")}
            >
              {/* onDone REFRESHES; it no longer closes. Closing on the POST's
                  return meant the wizard's "Check-in logged" card was mounted
                  and unmounted in the same tick — the sheet just disappeared,
                  which is indistinguishable from a save that failed. The
                  athlete dismisses it now, from the confirmation. */}
              <AuroraCheckin
                embedded
                startStep={startStep}
                sessions={daySessions}
                onDone={onPicked}
                onClose={() => setFollowUpOpen(false)}
              />
            </Sheet>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

// The Go-Full AccessCard pair (Cockpit / Sport, 24px titles, minHeight 220)
// was demoted to the single quiet row rendered inline above — see GO FULL.


