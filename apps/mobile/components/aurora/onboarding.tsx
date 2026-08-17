import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import {
  ONBOARDING_GOAL_GROUPS,
  durations,
  springToRN,
  springs,
  states,
  type OnboardingQuestion,
  ALPHA,} from "@hybrid/core";
import { useClientPersonaChoice, setClientPersona } from "../../lib/persona";
import { useOnboarding, finishOnboarding, type AnswerValue } from "../../lib/use-onboarding";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { haptic } from "../../lib/haptics";
import {
  leading, fs, space, tracking, F, PressScale as Pressable,
  HIT_SLOP, LoadSwap, Skeleton, useEntrance,
} from "../../lib/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import { ACard, ACheckMark, APill, ASegment, AScrubField, AHeading, ASub, AuroraField, RADIUS, withAlpha } from "./kit";
import { AuroraIcon } from "./icons";

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
 */
export default function AuroraOnboarding() {
  const { palette } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { questions, answers, setAnswer, plan, loading } = useOnboarding();
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

  const total = questions.length + 1;
  const onPlanStep = idx >= questions.length;
  const q = onPlanStep ? null : questions[idx]!;
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

  const finish = async () => {
    setCommit("saving");
    const ok = await finishOnboarding(questions, answers, plan);
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

  const next = () => { if (idx < total - 1) go(idx + 1, 1); else void finish(); };
  const back = () => (idx > 0 ? go(idx - 1, -1) : leave());

  const answered = (qq: OnboardingQuestion): boolean => {
    if (qq.kind === "persona") return !!(answers[qq.key] ?? persona);
    if (!qq.required) return true;
    const v = answers[qq.key];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  };
  const canNext = onPlanStep ? true : !q || answered(q);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink }} edges={["top", "bottom"]}>
      {/* The ambient wash every other screen sits on — AuroraScreen renders it
          for the screens it shells, and this one shells itself. */}
      <AuroraField />
      <Animated.View style={[{ flex: 1, padding: space.xxl }, enterStyle]}>
        <StepRail total={total} at={idx} />
        <Pressable
          onPress={leave}
          accessibilityRole="button"
          hitSlop={HIT_SLOP}
          style={{ alignSelf: "flex-end", marginTop: space.lg }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: palette.ash }}>{t("w.account.onboarding.skip")}</Text>
        </Pressable>

        <ScrollView ref={scroller} style={{ marginTop: space.lg }} contentContainerStyle={{ paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
          <LoadSwap loading={waiting} placeholder={<StepSkeleton />}>
            {() => (
              <StepSwap step={idx} dir={dir}>
                {q ? (
                  <Step title={q.title} sub={q.subtitle}>
                    <QuestionBody q={q} answers={answers} setAnswer={setAnswer} personaChoice={persona} />
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

        <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.back")} onPress={back} style={{ width: 64, height: 56, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }}>
            <AuroraIcon name="back" size={20} color={palette.chalk} />
          </Pressable>
          <APill
            label={onPlanStep ? (plan ? t("w.account.onboarding.start-plan") : t("w.account.onboarding.continue")) : t("w.account.onboarding.next")}
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

/**
 * THE PROGRESS RAIL — one segment per step, filled up to where you are.
 *
 * The segments used to swap colour in a single frame, which made the only
 * element on the screen whose job is to REPORT TRAVEL the one element that
 * did not travel. Each segment now fills from its leading edge on
 * `springs.slide` — the wizard's own spring, so the bar and the step it
 * describes move on one curve.
 */
function StepRail({ total, at }: { total: number; at: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: at + 1 }}
      style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <RailSeg key={i} on={i <= at} />
      ))}
    </View>
  );
}

function RailSeg({ on }: { on: boolean }) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const fill = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    const anim = reduced
      ? Animated.timing(fill, { toValue: on ? 1 : 0, duration: durations.reduced, easing: Easing.linear, useNativeDriver: true })
      : Animated.spring(fill, { toValue: on ? 1 : 0, ...springToRN(springs.slide), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [on, fill, reduced]);
  // Rebuilt only when the measured width changes (once) or Reduce Motion is
  // toggled — `interpolate` registers a node on the value every call.
  const style = useMemo(
    () =>
      reduced
        ? { opacity: fill }
        : { transform: [{ translateX: fill.interpolate({ inputRange: [0, 1], outputRange: [-w, 0] }) }] },
    [fill, w, reduced],
  );
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ flex: 1, height: 5, borderRadius: RADIUS.mark, backgroundColor: palette.line, overflow: "hidden" }}
    >
      <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: palette.lime }, style]} />
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
          <Choice key={o.value} active={selected === o.value} title={o.label} sub={o.blurb ?? ""} onPress={() => { haptic.selection(); setAnswer(q.key, o.value); if (o.value === "casual" || o.value === "athlete") setClientPersona(o.value); }} />
        ))}
      </>
    );
  }

  if (q.kind === "goal") {
    const selected = answers[q.key] as string | undefined;
    return (
      <>
        {ONBOARDING_GOAL_GROUPS.map((group) => (
          <View key={group.category} style={{ marginTop: space.xxs }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, marginTop: space.md, marginBottom: space.xs }}>{group.category}</Text>
            {group.goals.map((g) => (
              <Choice key={g.id} active={selected === g.id} title={g.label} sub={g.blurb} onPress={() => { haptic.selection(); setAnswer(q.key, g.id); }} />
            ))}
          </View>
        ))}
      </>
    );
  }

  if (q.kind === "number") return <NumberStep q={q} answers={answers} setAnswer={setAnswer} />;

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
          return <Choice key={o.value} active={on} title={o.label} sub={o.blurb ?? ""} onPress={toggle} />;
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
 * THE WIZARD OPTION ROW — and the app's standard for one (nutrition's onboarding
 * cites this component by name for its geometry: RADIUS.field at padding 16, a
 * 1px border that swaps line → lime when picked, and a lime wash at 8% behind).
 *
 * Two things were wrong with the standard itself, and both were about what
 * happens at the MOMENT OF PICKING:
 *
 *  • THE ROW RESHAPED. The tick was rendered only while active, so selecting an
 *    option inserted a 22dp glyph at the head of the row and shoved the label
 *    sideways — under the finger that had just landed on it. The mark is always
 *    laid out now, at the TRAILING edge (where iOS puts a table row's check, and
 *    where this row's own twin in nutrition-panels already put it), so the
 *    label's left edge never moves.
 *  • NOTHING ANIMATED. The border, the wash and the label all changed in one
 *    frame. They cross-fade now, on the kit `ACheckMark`'s own 120ms curve so
 *    the mark filling and the row tinting land together rather than a third of
 *    a beat apart.
 *
 * All three interpolate COLOUR, which RN can only do on the JS driver, so the
 * whole row runs there — one value, one style node (a JS-driven value and a
 * native-driven one in the same node is the combination RN refuses). It is a
 * 120ms fade on one row; the cost is nothing and the alternative is stacking
 * two copies of every label to cross-fade them.
 */
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
 * AN UNANSWERED QUESTION SHOWS NO FIGURE. The body questions ship without a
 * `defaultValue` precisely so a skipped one stays unanswered, and rendering the
 * seed as though it were an answer would hand that guarantee straight back —
 * the athlete would step past a screen reading "80 kg" and have said it.
 */
function NumberStep({ q, answers, setAnswer }: {
  q: OnboardingQuestion;
  answers: Record<string, AnswerValue | null | undefined>;
  setAnswer: (key: string, value: AnswerValue) => void;
}) {
  const C = useTheme().palette;
  const { t } = useLang();
  const min = q.min ?? 1, max = q.max ?? 7, step = q.step ?? 1;
  const raw = answers[q.key] ?? q.defaultValue;
  const value = raw === undefined || raw === null || raw === "" ? null : Number(raw);

  // The segmented control stays for a range a thumb can take in at a glance.
  const steps = Math.floor((max - min) / step) + 1;
  if (steps <= SEGMENT_MAX) {
    const opts: number[] = [];
    for (let v = min; v <= max; v += step) opts.push(v);
    return (
      <ASegment
        options={opts.map((d) => ({ id: String(d), label: `${d}×` }))}
        value={String(value ?? q.defaultValue ?? min)}
        onPick={(v) => setAnswer(q.key, Number(v))}
      />
    );
  }

  if (value == null) {
    return (
      <APill
        label={t("w.quiz.answer")}
        onPress={() => { haptic.selection(); setAnswer(q.key, seedFor(q, min, max)); }}
      />
    );
  }
  const dp = String(step).split(".")[1]?.length ?? 0;
  return (
    <AScrubField
      value={value}
      onChange={(v) => setAnswer(q.key, v)}
      min={min}
      max={max}
      step={step}
      format={(v) => v.toFixed(dp)}
      a11y={q.title}
    />
  );
}

/** Above this many steps a segmented control stops being a row of options and
 *  becomes a ribbon nobody can hit. */
const SEGMENT_MAX = 8;

/** Where the control opens — never shown until the athlete asks for it. The
 *  questionnaire's own seeds, by engine key, so the two screens open the same
 *  question at the same figure; otherwise the midpoint of the range. */
function seedFor(q: OnboardingQuestion, min: number, max: number): number {
  const byKey: Record<string, number> = { ageYears: 30, bodyweightKg: 80, daysPerWeek: 4 };
  const seed = q.engineKey ? byKey[q.engineKey] : undefined;
  const v = seed ?? Math.round((min + max) / 2);
  return Math.min(max, Math.max(min, v));
}

function Choice({ active, title, sub, onPress }: { active: boolean; title: string; sub: string; onPress: () => void }) {
  const { palette } = useTheme();
  const on = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(on, {
      toValue: active ? 1 : 0,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [active, on]);
  const tint = (from: string, to: string) => on.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Animated.View
        style={{
          flexDirection: "row", alignItems: "center", gap: space.md,
          borderWidth: 1,
          borderColor: tint(palette.line, palette.lime),
          backgroundColor: tint(palette.ink2, withAlpha(palette.lime, ALPHA.wash)),
          borderRadius: RADIUS.field,
          padding: space.lg,
        }}
      >
        <View style={{ flex: 1 }}>
          <Animated.Text style={{ fontFamily: F.bold, fontSize: fs.note, color: tint(palette.chalk, txt(palette, palette.lime)) }}>{title}</Animated.Text>
          {!!sub && <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: palette.ash, marginTop: 3, lineHeight: leading(fs.caption) }}>{sub}</Text>}
        </View>
        <ACheckMark on={active} size={22} />
      </Animated.View>
    </Pressable>
  );
}
