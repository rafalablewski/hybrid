import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import {
  ONBOARDING_GOAL_GROUPS,
  parseBirth, formatBirth, MONTH_KEYS,
  durations,
  springToRN,
  springs,
  states,
  onboardingSteps,
  type OnboardingQuestion,
} from "@hybrid/core";
import { useClientPersonaChoice, setClientPersona } from "../../lib/persona";
import { useOnboarding, finishOnboarding, type AnswerValue } from "../../lib/use-onboarding";
import { useLang } from "../../lib/i18n";
import { useTheme, type Palette as P } from "../../lib/theme";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { haptic } from "../../lib/haptics";
import { F, HIT_SLOP, LoadSwap, PressScale as Pressable, Skeleton, fs, leading, space, tracking, ty, useEntrance} from "../../lib/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import { ACard, AChoice, APill, ASegment, ANumberField, ABirthField, AHeading, AStepRail, ASub, AuroraField, RADIUS } from "./kit";

/**
 * AURORA onboarding — the stepped wizard, driven by the admin-editable question
 * set: one question per step, then the recommended plan.
 *
 * THE MOTION PASS (Aug 2026). This screen was the one the motion audit's four
 * waves never reached, and it is the FIRST screen a new athlete sees — so the
 * app introduced itself with the one surface that had none of its own
 * vocabulary. What was actually wrong, and what each fix is:
 *
 *  1. NO FIELD, NO ENTRANCE. It was a bare `SafeAreaView` painted `ink`, so it
 *     was the only screen in the app with no AuroraField behind it and no
 *     fade+rise on entry — a flat rectangle that hard-cut in. It renders the
 *     field and runs `useEntrance` now, the same pair AuroraScreen gives every
 *     other screen (it cannot simply BE an AuroraScreen: the rail and the CTA
 *     row are pinned outside the scroller).
 *  2. THE STEP TELEPORTED. `setIdx` swapped one question for the next in a
 *     single frame — the app's most-repeated transition, and the one place a
 *     user is being asked to feel progress. It travels now (`StepSwap`), in
 *     the DIRECTION the wizard moved: forward arrives from the right, Back
 *     from the left, on `springs.slide` — the same spring a pushed screen uses,
 *     because a step of a wizard is a sibling move.
 *  3. THE PROGRESS RAIL SNAPPED. Its segments flipped to lime instantly, which
 *     is the one element on screen whose entire job is to report travel.
 *     Each segment FILLS from its leading edge now (`StepRail`).
 *  4. SELECTING AN OPTION RESHAPED THE ROW. The tick was rendered only when
 *     active, so picking an option shoved the label sideways under the finger.
 *     The mark is always laid out and animates (the kit's `ACheckMark`), the
 *     surface and the label cross-fade to the accent, and a pick knocks.
 *  5. THE CTA RESIZED MID-SAVE. "Start this plan" became "Setting up…" — audit
 *     §17's named defect, and APill has held its own width through a commit
 *     since wave 2. It runs the pill's `state` now, so the enrol reports
 *     saving → saved (with the success knock) and, for the first time, reports
 *     FAILURE instead of walking into the app as though the plan had enrolled.
 *  6. THE LOADING STATE WAS A WORD. "Loading…" in place of the question; it is
 *     a step-shaped skeleton handed over through `LoadSwap` now.
 *
 * NOT changed, deliberately: the route's own presentation. Onboarding stays a
 * funnel step beside welcome/login (`slide_from_right`, no back-swipe) rather
 * than joining `COVER_SCREENS` — it is also the app's FIRST screen on a cold
 * start, where it is entered by `replace` and has nothing to cover.
 *
 * THE RHYTHM PASS (Aug 2026) came off a screenshot of the goal step, and it is
 * spacing rather than motion. The goal step is the ONE question with groups in
 * it and it was the one question whose rows sat on a different rhythm (see the
 * comment at the group map); the CTA row's two controls were sized by two
 * different rules; and `Choice` — this file's own option row, which two other
 * surfaces had copied — moved into the kit as `AChoice` so there is one of it.
 */
export default function AuroraOnboarding() {
  const { palette } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { questions, answers, touched, setAnswer, plan, loading, persona: intake } = useOnboarding();
  const persona = useClientPersonaChoice();
  const [idx, setIdx] = useState(0);
  /** Which way the wizard last travelled — the only thing `StepSwap` needs to
   *  know to point the arrival the right way. */
  const [dir, setDir] = useState<1 | -1>(1);
  /** The enrol, as the pill reports it (audit §17: a commit says what happened
   *  to the thing it committed). */
  const [commit, setCommit] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const enterStyle = useEntrance();
  const scroller = useRef<ScrollView>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // THE PLAN STEP BELONGS TO THE ATHLETE INTAKE. A tracker declined the goal
  // product on the first screen; ending their setup on "Start this plan" was
  // the clearest expression of the app not listening to that answer.
  // THE FORK IS ITS OWN SCREEN, not step 1 of N.
  //
  // It was rendered as an ordinary wizard step: a progress rail above it, a
  // step counter, the same layout as "what do you weigh". But it is not that
  // kind of question. Every other step gathers a MEASUREMENT about a person who
  // has already decided to be here; this one asks which of two products they
  // want, and everything after it — how many questions remain, whether a plan
  // is recommended, whether a season is enrolled — follows from the answer.
  // Presenting the branch in the same chrome as the branches made the most
  // consequential tap in the app look like the least consequential one.
  //
  // So it is lifted out: no rail, no counter, no Back, two full cards. The
  // wizard begins at the question after it, and its Back returns here.
  const forkQ = useMemo(() => questions.find((x) => x.engineKey === "persona") ?? null, [questions]);
  // A QUESTION IS NOT A SCREEN. Sex, birth date and body mass are three
  // questions and one screen — three parts of asking who this body is — and for
  // a tracker that is the entire intake. `onboardingSteps` is what knows the
  // difference; this file walks screens and no longer assumes one holds one.
  const steps = useMemo(
    () => onboardingSteps(questions.filter((x) => x.engineKey !== "persona")),
    [questions],
  );
  const hasPlanStep = intake !== "casual";
  const total = steps.length + (hasPlanStep ? 1 : 0);
  /**
   * THE RAIL COUNTS QUESTIONS, NOT SCREENS, now that one screen can carry
   * several. A tracker's whole intake is one screen, and a one-segment rail
   * reports nothing; three segments filling as each question arrives reports
   * what is actually left to answer, which is what a progress rail is for.
   */
  const railMarks = useMemo(
    () => steps.reduce((n, st) => n + (st.grouped ? st.questions.length : 1), 0) + (hasPlanStep ? 1 : 0),
    [steps, hasPlanStep],
  );
  // Switching the persona answer re-derives the wizard, which can make it
  // SHORTER than the step currently showing (athlete → casual drops four
  // questions). Without this the screen would render an undefined question.
  useEffect(() => { setIdx((i) => Math.min(i, Math.max(0, total - 1))); }, [total]);
  const onPlanStep = hasPlanStep && idx >= steps.length;
  const step = onPlanStep ? null : steps[Math.min(idx, steps.length - 1)] ?? null;

  /**
   * HOW MANY QUESTIONS OF A GROUPED SCREEN ARE SHOWING.
   *
   * A screen carrying three questions at once is a wall, and a wall is where
   * people leave. So a group ASKS ONE AT A TIME: answer the first and the second
   * arrives under it, answer that and the third does. What was already answered
   * stays on screen, which is the whole point of them sharing one — you can see
   * and correct what you said without travelling back to another screen.
   *
   * The trap this must not set: if a question only appears once the one above it
   * is ANSWERED, someone who wants to skip is stuck, and someone who presses on
   * would commit having never seen the questions below. So the primary control
   * advances the REVEAL first and the screen second — the same one tap per
   * question the athlete used to spend on the same three questions across three
   * screens, minus the three screen transitions.
   */
  const revealTarget = useCallback((st: typeof step): number => {
    if (!st?.grouped) return 1;
    let n = 1;
    while (n < st.questions.length && touched.has(st.questions[n - 1]!.key)) n++;
    return n;
  }, [touched]);
  /**
   * DERIVED, NOT SYNCED. `opened` records only what the Continue control has
   * pushed open BEYOND what the answers already justify, and only for the
   * screen it was pressed on — so arriving at a screen needs no effect to
   * settle the count and leaving one needs no effect to reset it. The cut that
   * kept the count in state and chased `idx` with two effects had a frame in
   * it: the arriving screen rendered with the PREVIOUS screen's count and the
   * questions it was missing popped in after paint, un-animated, which is the
   * one thing this whole mechanism exists to avoid.
   */
  const [opened, setOpened] = useState<{ idx: number; n: number }>({ idx: 0, n: 0 });
  const revealed = Math.max(revealTarget(step), opened.idx === idx ? opened.n : 0);
  const shown = step?.grouped ? step.questions.slice(0, revealed) : step ? step.questions : [];
  const moreToReveal = !!step?.grouped && revealed < step.questions.length;
  const waiting = loading && questions.length === 0;

  /** Move a step. The scroll position is part of the move: a step is a PAGE, so
   *  the next one starts at its own top — without this, answering the long goal
   *  list left the following question rendered halfway down its body. Not
   *  animated, because the body it belongs to is being replaced anyway. */
  const go = useCallback((to: number, d: 1 | -1) => {
    setDir(d);
    setIdx(to);
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const leave = () => router.replace("/(tabs)");

  /** Choosing on the fork screen. The pick IS the advance — a two-option branch
   *  does not need a Continue under it to confirm what the tap already said. */
  const pickIntake = (value: string) => {
    if (!forkQ) return;
    haptic.selection();
    setAnswer(forkQ.key, value);
    if (value === "casual" || value === "athlete") setClientPersona(value);
    setDir(1);
    setIdx(0);
  };
  /** Back OUT of the wizard, to the fork. Clearing the answer is what makes the
   *  fork screen render again — and it is honest: they are re-deciding, so the
   *  previous decision should not sit there pre-selected. */
  const toFork = () => {
    if (!forkQ) return;
    setDir(-1);
    setAnswer(forkQ.key, "");
  };

  const finish = async () => {
    setCommit("saving");
    const ok = await finishOnboarding(questions, answers, plan, touched);
    if (!ok) {
      // The pill shakes and knocks Error (APill owns both). Staying put is the
      // point: the answers are still on screen and the press can be repeated —
      // and Skip is right there for anyone who would rather get on with it, so
      // a failed enrol reports itself without trapping anybody.
      setCommit("error");
      AccessibilityInfo.announceForAccessibility(t("w.account.onboarding.save-failed"));
      timer.current = setTimeout(() => setCommit("idle"), states.savedHoldMs);
      return;
    }
    setCommit("saved");
    timer.current = setTimeout(leave, states.savedHoldMs);
  };

  /** The last step commits, whether that is the plan step or, for a tracker,
   *  the final question. */
  const onLastStep = idx >= total - 1;
  /** Where the rail's fill reaches: every question on the screens already
   *  passed, plus how far into this one the reveal has got. */
  const railIndex = useMemo(
    () => steps.slice(0, idx).reduce((n, st) => n + (st.grouped ? st.questions.length : 1), 0)
      + (onPlanStep ? 0 : revealed - 1),
    [steps, idx, revealed, onPlanStep],
  );
  const next = () => {
    // REVEAL FIRST, then travel. This is what keeps the group from trapping
    // anyone: the control that would have carried you past this question when
    // it had a screen of its own still does.
    if (moreToReveal) {
      haptic.light();
      setOpened({ idx, n: revealed + 1 });
      // The screen changed without travelling, so nothing else would tell a
      // VoiceOver user that a question just arrived under the one they answered.
      AccessibilityInfo.announceForAccessibility(step!.questions[revealed]!.title);
      return;
    }
    if (!onLastStep) go(idx + 1, 1); else void finish();
  };
  /** Only ever a STEP. It used to fall through to `leave()` at step 0, which
   *  made Back and skip two vocabularies pointing at one destination on the
   *  very first screen a new athlete sees — so the control is simply absent
   *  there now, which is what the check-in wizard has always done. */
  const back = () => { if (idx > 0) go(idx - 1, -1); else toFork(); };

  const answered = (qq: OnboardingQuestion): boolean => {
    // No persona arm here any more: it is not a step, it is the screen in front
    // of the wizard, and the wizard does not render until it is answered.
    if (!qq.required) return true;
    const v = answers[qq.key];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  };
  // EVERY required question on the screen, not just the first: a grouped screen
  // that let you leave with one of three answered would be worse than three
  // screens, because the thing you skipped is no longer a screen you skipped.
  // Only what is SHOWING is judged: a required question still hidden cannot
  // block a control whose job is to reveal it.
  const canNext = onPlanStep ? true : !step || shown.every(answered);

  if (forkQ && !intake) {
    return (
      <PersonaFork
        C={palette}
        q={forkQ}
        enterStyle={enterStyle}
        skipLabel={t("w.account.onboarding.skip")}
        onPick={pickIntake}
        onSkip={leave}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink }} edges={["top", "bottom"]}>
      {/* The ambient wash every other screen sits on — AuroraScreen renders it
          for the screens it shells, and this one shells itself. */}
      <AuroraField />
      <Animated.View style={[{ flex: 1, padding: space.xxl }, enterStyle]}>
        {/* Filled by POSITION: every step up to the one you are on. The rail
            itself is the kit's now (`AStepRail`) — four wizards drew four of
            them and only this one animated. */}
        <AStepRail marks={Array.from({ length: railMarks }, (_, i) => (i <= railIndex ? "done" : "empty"))} style={{ marginTop: space.sm }} />
        <Pressable
          onPress={leave}
          accessibilityRole="button"
          hitSlop={HIT_SLOP}
          style={{ alignSelf: "flex-end", marginTop: space.lg }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: palette.ash }}>{t("w.account.onboarding.skip")}</Text>
        </Pressable>

        {/* `flex: 1` is what makes the CTA row below actually PINNED, which this
            file's header has claimed since the motion pass. Without it the
            scroller sized to its CONTENT, so a short step (a number, a birth
            date) let the buttons float up under the answer while a long one —
            the goal list — pushed them to the floor: the primary action of the
            wizard moved between questions. */}
        <ScrollView ref={scroller} style={{ flex: 1, marginTop: space.lg }} contentContainerStyle={{ paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
          <LoadSwap loading={waiting} placeholder={<StepSkeleton />}>
            {() => (
              <StepSwap step={idx} dir={dir}>
                {step ? (
                  <Step title={step.title} sub={step.subtitle}>
                    {step.grouped ? (
                      // A GROUPED SCREEN IS A FORM, so each question keeps its
                      // own title as the field's label and its own subtitle as
                      // the fine print under it. One subtitle at the top would
                      // be describing whichever question happened to be first.
                      <View style={{ gap: space.xl }}>
                        {shown.map((qq) => (
                          <Reveal key={qq.key}>
                            <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: palette.chalk, lineHeight: leading(fs.bodyLg, "tight") }}>
                              {qq.title}
                            </Text>
                            {!!qq.subtitle && (
                              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: palette.ash, marginTop: space.xxs, lineHeight: leading(fs.caption) }}>
                                {qq.subtitle}
                              </Text>
                            )}
                            <QuestionBody q={qq} answers={answers} setAnswer={setAnswer} personaChoice={persona} />
                          </Reveal>
                        ))}
                      </View>
                    ) : (
                      <QuestionBody q={step.questions[0]!} answers={answers} setAnswer={setAnswer} personaChoice={persona} />
                    )}
                  </Step>
                ) : (
                  <Step title={t("w.account.onboarding.plan-title")} sub={plan ? undefined : t("w.account.onboarding.plan-sub")}>
                    {plan ? (
                      <ACard>
                        <Text style={{ fontFamily: F.black, fontSize: fs.headline, color: palette.chalk }}>{plan.planName}</Text>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: palette.ash, marginTop: space.xxs }}>{plan.goalLabel} – {plan.weeklyTarget}×/{t("w.train.periodize.wk")} – {plan.weeks} {t("w.account.onboarding.weeks")}</Text>
                        <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: palette.chalk, marginTop: space.md, lineHeight: leading(fs.bodyLg) }}>{plan.why}</Text>
                      </ACard>
                    ) : (
                      <ASub>{t("w.account.onboarding.no-plan")}</ASub>
                    )}
                  </Step>
                )}
              </StepSwap>
            )}
          </LoadSwap>
        </ScrollView>

        {/* THE TWO BUTTONS ARE ONE ROW, so they are one height. Back was drawn
            at a hard 56 while APill DERIVES its height from its label: 18dp of
            padding around fs.subtitle plus whatever line box Archivo gives 16dp
            type (17.41 — hhea 878/-210 over 1000upm — which iOS rounds to 18),
            so 54. Two controls in one row, sized by two rules that have never
            heard of each other, landing on the same number only by luck.
            THE COUPLE OF dp IS NOT THE POINT, Dynamic Type is: the label scales
            to MAX_FONT_SCALE and takes the pill with it, and a hardcoded 56
            cannot follow — the row comes apart furthest for the readers who
            most need it to hold together. The row stretches now and Back takes
            its height from the pill, so there is one height and nothing to
            drift. `paddingTop` is the scroller's CLEARANCE: the list clips hard
            at the row's edge, and without it the cut-off card touched the
            buttons.

            BACK IS A WORD AND NOT AN ARROW, and it is the same APill the
            primary is. Three wizards had three back affordances — an arrow in a
            64dp box here, the word in a padded pill in check-in, a 36dp square
            in nutrition's setup — and the arrow was the one that could not
            stay: the hero system already owns ← for SCREEN-level back, so an
            arrow in the content area made one glyph mean "step" on one row and
            "screen" on the row above it. That is the argument `card-foot`
            already made about lime meaning "leaves" on one card and "unfolds"
            on the next, and it lands the same way here. It also stops being a
            hand-rolled outline pill, which is a site off the new ratchet.

            IT IS ABSENT ON THE FIRST STEP rather than disabled. There is
            nothing behind step 0 but the wizard's own exit, and that exit is
            already on screen as "skip". */}
        <View style={{ flexDirection: "row", gap: space.md, alignItems: "stretch", paddingTop: space.md }}>
          {/* Back is present on step 0 too, because there is now something
              behind it: the fork. It used to be absent there, correctly, when
              step 0 was the fork itself. */}
          <APill label={t("common.back")} variant="outline" onPress={back} />
          <APill
            label={!moreToReveal && (onPlanStep || onLastStep)
              ? (onPlanStep && plan ? t("w.account.onboarding.start-plan") : t("w.account.onboarding.continue"))
              : t("w.account.onboarding.next")}
            onPress={next}
            disabled={!canNext || commit !== "idle"}
            state={commit}
            savingLabel={t("w.account.onboarding.setting-up")}
            savedLabel={t("w.account.onboarding.ready")}
            style={{ flex: 1 }}
          />
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

/** How far a revealed question rises into place, in dp. Shorter than a step's
 *  travel and vertical rather than horizontal: it is arriving UNDER the
 *  question above it, not replacing what was there. */
const REVEAL_RISE = 14;

/**
 * A QUESTION ARRIVING ON A SHARED SCREEN.
 *
 * Grouping the three body questions onto one screen took the tracker's intake
 * from three screens to one, and immediately posed the problem grouping always
 * poses: three controls presented at once is a FORM, and a form is a wall. So
 * the group asks one at a time — answer the first and the second rises in under
 * it — which keeps the single screen's honesty (everything you have said stays
 * visible and correctable) without its cost.
 *
 * It fades and rises on `springs.slide`, the same spring the step travel uses,
 * because it is the same event at a smaller scale: something arriving from the
 * direction it is arriving from. Reduce Motion keeps the fade and drops the
 * travel — an arrival still has to be legible as one.
 *
 * There is no exit half: a revealed question is never un-revealed (the count
 * only ever grows within a screen), so this is a mount animation and nothing
 * more.
 */
function Reveal({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  /** 0 = below and invisible, 1 = in place. */
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = reduced
      ? Animated.timing(v, { toValue: 1, duration: durations.reduced, easing: Easing.linear, useNativeDriver: true })
      : Animated.spring(v, { toValue: 1, ...springToRN(springs.slide), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [v, reduced]);
  const style = useMemo(
    () =>
      reduced
        ? { opacity: v }
        : {
            opacity: v,
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [REVEAL_RISE, 0] }) }],
          },
    [v, reduced],
  );
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** How far a step travels as it arrives, in dp. Short on purpose: the body is
 *  already cross-fading, and a full screen-width slide would claim the wizard
 *  had navigated somewhere rather than moved on a step. */
const STEP_TRAVEL = 28;

/**
 * THE STEP TRAVEL — one question giving way to the next.
 *
 * Both steps are mounted for the length of the exchange: the arriving one comes
 * in from the direction of travel on `springs.slide` while the outgoing one
 * fades and drifts the other way over `durations.fast` (a departure is quicker
 * than an arrival — the same asymmetry `easings.exit` encodes). The outgoing
 * copy is a FROZEN NODE, positioned absolutely and `pointerEvents="none"`, so
 * it can neither take a tap nor size the box it is leaving.
 *
 * Reduce Motion SUBSTITUTES the cross-dissolve: the two steps still exchange,
 * they simply do not travel to do it.
 */
function StepSwap({ step, dir, children }: { step: number; dir: 1 | -1; children: ReactNode }) {
  const reduced = useReducedMotion();
  /** 0 = the arriving step is still off-position, 1 = settled. */
  const arrive = useRef(new Animated.Value(1)).current;
  /** 1 = the outgoing step is still fully drawn, 0 = gone. */
  const depart = useRef(new Animated.Value(0)).current;
  const [gone, setGone] = useState<{ key: number; node: ReactNode } | null>(null);
  /** What is on screen RIGHT NOW, as of the last commit. Read by the effect
   *  below before the second effect refreshes it — hence the declaration
   *  order, which is the whole mechanism: effects run in the order they are
   *  written, so the first still sees the previous step's node. */
  const shown = useRef<{ key: number; node: ReactNode }>({ key: step, node: children });

  useEffect(() => {
    if (shown.current.key === step) return;
    setGone(shown.current);
    depart.setValue(1);
    arrive.setValue(0);
    const out = Animated.timing(depart, {
      toValue: 0,
      duration: reduced ? durations.reduced : durations.fast,
      // easings.exit — things leave faster than they arrive.
      easing: reduced ? Easing.linear : Easing.bezier(0.4, 0, 0.9, 0.4),
      useNativeDriver: true,
    });
    const inn = reduced
      ? Animated.timing(arrive, { toValue: 1, duration: durations.reduced, easing: Easing.linear, useNativeDriver: true })
      : Animated.spring(arrive, { toValue: 1, ...springToRN(springs.slide), useNativeDriver: true });
    out.start(({ finished }) => { if (finished) setGone(null); });
    inn.start();
    return () => { out.stop(); inn.stop(); };
  }, [step, arrive, depart, reduced]);

  // Runs on EVERY commit, after the one above: the step currently rendered
  // becomes the one the next move will carry off.
  useEffect(() => { shown.current = { key: step, node: children }; });

  const arriving = useMemo(
    () =>
      reduced
        ? { opacity: arrive }
        : {
            opacity: arrive,
            transform: [{ translateX: arrive.interpolate({ inputRange: [0, 1], outputRange: [dir * STEP_TRAVEL, 0] }) }],
          },
    [arrive, dir, reduced],
  );
  const departing = useMemo(
    () =>
      reduced
        ? { opacity: depart }
        : {
            opacity: depart,
            transform: [{ translateX: depart.interpolate({ inputRange: [0, 1], outputRange: [-dir * STEP_TRAVEL, 0] }) }],
          },
    [depart, dir, reduced],
  );

  return (
    <View>
      <Animated.View style={arriving}>{children}</Animated.View>
      {gone && (
        // No `bottom`: the departing step keeps its own natural height rather
        // than being clipped to whatever replaced it.
        <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, right: 0 }, departing]}>
          {gone.node}
        </Animated.View>
      )}
    </View>
  );
}

/** What holds the step's space while the admin's question set is in flight —
 *  the geometry of a question (a title, its line of help, three option rows)
 *  rather than the word "Loading…" it replaces. */
function StepSkeleton() {
  return (
    <View accessibilityRole="progressbar">
      <Skeleton width="72%" height={26} />
      <Skeleton width="88%" height={14} style={{ marginTop: space.sm }} />
      <View style={{ marginTop: space.xl, gap: space.ms }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={72} radius={RADIUS.field} />
        ))}
      </View>
    </View>
  );
}

function QuestionBody({
  q, answers, setAnswer, personaChoice,
}: {
  q: OnboardingQuestion;
  answers: Record<string, AnswerValue | null | undefined>;
  setAnswer: (key: string, value: AnswerValue) => void;
  personaChoice: "casual" | "athlete" | null;
}) {
  const C = useTheme().palette;
  if (q.kind === "persona") {
    const selected = (answers[q.key] as string) ?? personaChoice;
    return (
      <>
        {(q.choices ?? []).map((o) => (
          <AChoice key={o.value} active={selected === o.value} title={o.label} sub={o.blurb ?? ""} onPress={() => { haptic.selection(); setAnswer(q.key, o.value); if (o.value === "casual" || o.value === "athlete") setClientPersona(o.value); }} />
        ))}
      </>
    );
  }

  if (q.kind === "goal") {
    const selected = answers[q.key] as string | undefined;
    return (
      <>
        {/* THE GOAL STEP IS THE ONE QUESTION WITH GROUPS IN IT, and it used to be
            the one question whose rows sat on a different rhythm. Every other
            kind hands its rows straight to `Step`, which stacks them on
            `space.ms`; this one wrapped each category in a View with NO gap, so
            inside a category the bordered rows sat flush and their hairlines
            doubled into a 2px rule — while the only air on the screen was
            between categories. The rows now take the wizard's own gap and the
            SEPARATION is what says "new group": ms inside a group, ms + md above
            a category's name, so a name always sits nearer its own options than
            to the group above it. */}
        {ONBOARDING_GOAL_GROUPS.map((group, gi) => (
          <View key={group.category} style={{ gap: space.ms, marginTop: gi === 0 ? 0 : space.md }}>
            <Text style={ty(C, "kicker")}>{group.category}</Text>
            {group.goals.map((g) => (
              <AChoice key={g.id} active={selected === g.id} title={g.label} sub={g.blurb} onPress={() => { haptic.selection(); setAnswer(q.key, g.id); }} />
            ))}
          </View>
        ))}
      </>
    );
  }

  if (q.kind === "number") return <NumberStep q={q} answers={answers} setAnswer={setAnswer} />;
  if (q.kind === "birth") return <BirthStep q={q} answers={answers} setAnswer={setAnswer} />;

  if (q.kind === "text") {
    // Keep the wizard keyboard-free; free-text questions are collected on web.
    return null;
  }

  // single / multi
  const multi = q.kind === "multi";
  const current = answers[q.key];
  const selectedSet = new Set<string>(multi ? (Array.isArray(current) ? current.map(String) : current != null && current !== "" ? [String(current)] : []) : current != null ? [String(current)] : []);
  if (multi) {
    return (
      <>
        {(q.choices ?? []).map((o) => {
          const on = selectedSet.has(o.value);
          // A multi row is a SWITCH being flipped, not a value being scrubbed
          // past — Impact Light, per the haptic map in lib/haptics.
          const toggle = () => { haptic.light(); const arr = new Set(selectedSet); if (arr.has(o.value)) arr.delete(o.value); else arr.add(o.value); setAnswer(q.key, [...arr]); };
          return <AChoice key={o.value} active={on} title={o.label} sub={o.blurb ?? ""} onPress={toggle} />;
        })}
      </>
    );
  }
  return <ASegment options={(q.choices ?? []).map((o) => ({ id: o.value, label: o.label }))} value={String(current ?? "")} onPick={(v) => setAnswer(q.key, v)} />;
}

function Step({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <View>
      <AHeading>{title}</AHeading>
      {!!sub && <ASub style={{ marginTop: space.sm }}>{sub}</ASub>}
      <View style={{ marginTop: space.xl, gap: space.ms }}>{children}</View>
    </View>
  );
}

/**
 * A NUMBER, ANSWERED THE WAY ITS RANGE DESERVES.
 *
 * Every `number` question used to render as an `ASegment` with one option per
 * step. That is right for "how many days a week" — seven options, all visible,
 * pick one. It is unusable for anything wider, and the intake now asks two:
 * age would have drawn NINETY segments and body mass five hundred and fifty
 * ONE, in a horizontal control on a 390dp screen. (An admin could already
 * author such a question from the panel, so the trap predates these two.)
 *
 * So: a narrow range keeps the segments, and anything wider takes the kit's
 * scrub field — drag the figure to travel, ＋/− to land exactly, which is the
 * same control the questionnaire screen uses for the same values.
 *
 * AN UNANSWERED QUESTION SHOWS NO FIGURE, and costs no tap to start. The body
 * questions ship without a `defaultValue` precisely so a skipped one stays
 * unanswered, and rendering the seed as though it were an answer would hand
 * that guarantee straight back — the athlete would step past a screen reading
 * "80 kg" and have said it. But that constraint is on the VALUE: the field
 * itself is present and live, empty, and the first drag or press answers it.
 * An "Answer" button here would charge a tap on a screen that exists to be
 * answered, which is the one place a toll is least defensible.
 */
function NumberStep({ q, answers, setAnswer }: {
  q: OnboardingQuestion;
  answers: Record<string, AnswerValue | null | undefined>;
  setAnswer: (key: string, value: AnswerValue) => void;
}) {
  const min = q.min ?? 1, max = q.max ?? 7, step = q.step ?? 1;
  const raw = answers[q.key] ?? q.defaultValue;
  const value = raw === undefined || raw === null || raw === "" ? null : Number(raw);
  return (
    <ANumberField
      value={value}
      seed={seedFor(q, min, max)}
      min={min}
      max={max}
      step={step}
      a11y={q.title}
      onChange={(v) => setAnswer(q.key, v)}
      segmentFormat={(d) => `${d}×`}
    />
  );
}

/**
 * WHEN WERE YOU BORN — one step, a year and a month.
 *
 * The intake asked for an AGE until Aug 2026, and an age stops being true the
 * day after it is given: five years on, the recovery factor is 6% out on a
 * number nobody would think to re-check. Deriving the year from the age was the
 * first fix and it was still a derivation — right only once the birthday had
 * passed, so ±1 year, which is the same size as the factor's own yearly step.
 *
 * Asking for the date costs no extra STEP (it is one question, not two) and
 * makes the answer exact and checkable. The month is optional in the model: a
 * year alone keeps the honest ±1 reading rather than having a month invented.
 */
function BirthStep({ q, answers, setAnswer }: {
  q: OnboardingQuestion;
  answers: Record<string, AnswerValue | null | undefined>;
  setAnswer: (key: string, value: AnswerValue) => void;
}) {
  const { t } = useLang();
  const cur = parseBirth(answers[q.key]);
  return (
    <ABirthField
      year={cur?.year}
      month={cur?.month}
      months={MONTH_KEYS.map(t)}
      a11y={q.title}
      // A month with no year is not an answer, so the control never emits one;
      // the stored form is a single string (core `formatBirth`), and it holds
      // the year alone until a month is picked rather than defaulting to one.
      onChange={({ year, month }) => setAnswer(q.key, formatBirth(year, month))}
    />
  );
}

/** Where the control opens — never shown until the athlete asks for it. The
 *  questionnaire's own seeds, by engine key, so the two screens open the same
 *  question at the same figure; otherwise the midpoint of the range. */
function seedFor(q: OnboardingQuestion, min: number, max: number): number {
  const byKey: Record<string, number> = { bodyweightKg: 80, daysPerWeek: 4 };
  const seed = q.engineKey ? byKey[q.engineKey] : undefined;
  const v = seed ?? Math.round((min + max) / 2);
  return Math.min(max, Math.max(min, v));
}

/**
 * THE FORK — the first screen a new athlete meets, and the only one that is not
 * a question about them.
 *
 * It asks which of two products they want, and everything downstream follows
 * from the answer: how many questions remain, whether a plan is recommended,
 * whether a season is enrolled, which surfaces the app opens. It used to be
 * rendered as step 1 of N — a progress rail above it, a step counter, the same
 * layout as "what do you weigh" — which put the most consequential tap in the
 * app in the chrome of the least consequential one.
 *
 * WHAT IS DELIBERATELY ABSENT, and each absence is the point:
 *   • no step rail — there is nothing to be one-of-eight through yet;
 *   • no Back — there is nothing behind the first screen;
 *   • no Continue — a two-option branch does not need a button under it to
 *     confirm what the tap already said, and a Continue would imply a default
 *     that this question specifically does not have;
 *   • no pre-selection — see the persona question's own comment in core. A seed
 *     here would be the app choosing and reporting the choice back as theirs.
 *
 * The copy is the QUESTION'S, not this file's: title, subtitle and both choices
 * come from the admin-editable row, so an operator rewording the fork rewords
 * this screen too rather than only the version that no longer renders.
 */
function PersonaFork({ C, q, enterStyle, skipLabel, onPick, onSkip }: {
  C: P;
  q: OnboardingQuestion;
  enterStyle: ReturnType<typeof useEntrance>;
  skipLabel: string;
  onPick: (value: string) => void;
  onSkip: () => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top", "bottom"]}>
      <AuroraField />
      <Animated.View style={[{ flex: 1, padding: space.xxl }, enterStyle]}>
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          hitSlop={HIT_SLOP}
          style={{ alignSelf: "flex-end", marginTop: space.sm }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{skipLabel}</Text>
        </Pressable>

        {/* The question owns the top of the screen rather than sitting mid-list
            under a rail. `justifyContent: center` is what makes this read as a
            fork rather than as a form: two choices, weighted equally, with the
            question above them and nothing below. */}
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.hero, lineHeight: leading(fs.hero, "tight"), letterSpacing: tracking(fs.hero), color: C.chalk }}>
            {q.title}
          </Text>
          {!!q.subtitle && (
            <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg), color: C.ash, marginTop: space.sm }}>
              {q.subtitle}
            </Text>
          )}

          <View style={{ gap: space.md, marginTop: space.xxl }}>
            {(q.choices ?? []).map((c) => (
              <Pressable
                key={c.value}
                onPress={() => onPick(c.value)}
                accessibilityRole="button"
                accessibilityLabel={`${c.label}. ${c.blurb ?? ""}`}
              >
                <ACard>
                  <Text style={{ fontFamily: F.black, fontSize: fs.title, lineHeight: leading(fs.title, "tight"), letterSpacing: tracking(fs.title), color: C.chalk }}>
                    {c.label}
                  </Text>
                  {!!c.blurb && (
                    <Text style={{ fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash, marginTop: space.xs }}>
                      {c.blurb}
                    </Text>
                  )}
                </ACard>
              </Pressable>
            ))}
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}
