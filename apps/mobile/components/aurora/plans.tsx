import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, View, Text, ScrollView, StyleSheet, type LayoutChangeEvent } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { GOAL_TREE, GOAL_CATEGORIES, SHARED_ELEMENTS, goalShelves, libraryCoverView, planDetail, srSingleReps, programFor, goalCoverView, planHeroView, type GoalGroup, type GoalNode, type GoalPlan , colors, ALPHA, FEEDBACK } from "@hybrid/core";
import { enrollPlan, fetchMacrocycle } from "../../lib/api";
import { useRevalidate } from "../../lib/queries";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { leading, tracking, fs, space, F, PressScale as Pressable } from "../../lib/ui";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { useSharedSurfaceSource } from "../../lib/shared-element";
import { ACard, AField, GUTTER, RADIUS, withAlpha, DockRail, DockChip } from "./kit";
import { LeavePlanSection, type EnrolledSeason } from "./leave-plan";
import PercentProgram from "../percent-program";
import MeasuredOutcome from "../measured-outcome";
import PlanCoverScreen, { CoverScreen, PlanDockPill, COVER_GUTTER, type CoverScreenApi } from "../plan-hero";
import { useListMotion } from "../../lib/list-motion";

/** Cover ink — the goal tiles are dark in BOTH themes, exactly like the covers
 *  they expand into (Explore's PlanCover recipe). */
const TILE_INK = colors.ink;
/** One goal tile: wide enough that two-and-a-bit peek at 393dp, so a shelf
 *  reads as a rail rather than a cut-off grid. */
const TILE_W = 172;
const TILE_H = 140;

/** AURORA Plans — goal tree → plan list → full plan detail + enroll, reusing the
 *  exact plan library (GOAL_TREE / planDetail / enrollPlan). */
export default function AuroraPlans({ openGoal, openPlan }: {
  /** Land on a goal, and optionally one of its plans — the cross-app search's
   *  plan results. A result that only reached the library root would be a
   *  broken promise; the athlete named the plan. */
  openGoal?: string;
  openPlan?: string;
} = {}) {
  // Survivors of a filter MOVE to their new positions; only arrivals fade.
  const refilter = useListMotion();
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const [goalId, setGoalId] = useState<string | null>(openGoal ?? null);
  const [planId, setPlanId] = useState<string | null>(openPlan ?? null);
  // Free-text search over the library. The CATEGORY lever is gone: with every
  // category rendered as its own shelf, filtering to one leaves an empty
  // screen — so the chips navigate to a shelf instead of narrowing to one.
  const [query, setQuery] = useState("");
  const scrollApi = useRef<CoverScreenApi | null>(null);
  const shelfTops = useRef<Record<string, number>>({});
  const goal = GOAL_TREE.find((g) => g.id === goalId) ?? null;
  const plan = goal?.plans.find((p) => p.id === planId) ?? null;

  // The enrolled season, fetched here once and shared: the info-only card on
  // the browse root, and the leave section on the enrolled plan's detail page.
  const [enrolled, setEnrolled] = useState<EnrolledSeason | null>(null);
  const loadEnrolled = useCallback(() => {
    fetchMacrocycle().then((m) => setEnrolled(m ? { macroId: m.macroId, planId: m.planId, goal: m.macro.goalOrSport, startedAt: m.planStartedAt } : null));
  }, []);
  // Re-fetched on tab focus AND on detail open/close, so enrolling on a detail
  // page (this screen stays mounted in the tab stack) is reflected right away.
  useFocusEffect(useCallback(() => { loadEnrolled(); }, [loadEnrolled]));
  useEffect(() => { loadEnrolled(); }, [planId, loadEnrolled]);

  if (goal && plan) {
    const isEnrolled = !!enrolled && enrolled.planId === plan.id;
    const leaveSection = isEnrolled && enrolled
      ? <LeavePlanSection enrolled={enrolled} onLeft={() => setEnrolled(null)} />
      : null;
    const program = programFor(plan.id);
    // Both detail renderers ARE the screen now (PlanCoverScreen provides the
    // full-bleed collapsing cover + scroll) — no AuroraScreen wrapper.
    if (program)
      return <PercentProgram goal={goal} plan={plan} program={program} back={() => setPlanId(null)} alreadyEnrolled={isEnrolled} onEnrolled={loadEnrolled} leaveSection={leaveSection} />;
    return <Detail goal={goal} plan={plan} back={() => setPlanId(null)} alreadyEnrolled={isEnrolled} onEnrolled={loadEnrolled} leaveSection={leaveSection} />;
  }
  if (goal) return <PlanList goal={goal} pick={setPlanId} back={() => { setGoalId(null); setPlanId(null); }} />;

  // ── the library cover: the SAME scaffold the goal and plan screens ride, so
  // every depth of the Plans stack is one object at a different compression.
  // Its accent is the theme's primary (no discipline owns "Plans"), softened by
  // the "library" variant so the root can't out-shout the goals on its shelves.
  const shelves = goalShelves(query);
  const lib = libraryCoverView(GOAL_TREE.length, GOAL_CATEGORIES, {
    chip: t("w.train.plans.libraryChip"),
    title: t("plans.title"),
    goal: t("w.train.plans.goalCount"),
    goals: t("w.train.plans.goalsCount"),
  });
  // The scaffold lands the shelf head under the collapsed bar + docked rail.
  const jumpTo = (category: string) => {
    const y = shelfTops.current[category];
    if (y != null) scrollApi.current?.scrollToChild(y);
  };

  return (
    <CoverScreen
      cover={{ accent: C.lime, glyph: lib.glyph, chip: lib.chip, duration: lib.count, title: lib.title, metaParts: lib.metaParts, stats: [], blurb: "", variant: "library" }}
      backLabel={t("common.back")}
      back={() => router.back()}
      scrollApi={scrollApi}
      rail={shelves.length > 0 ? <CategoryRail categories={shelves.map((s) => s.category)} onJump={jumpTo} /> : undefined}
    >
      <View style={{ marginTop: 16 }}>
        <AField value={query} onChange={(v: string) => refilter(() => setQuery(v))} placeholder={t("w.train.plans.searchGoals")} icon="search" />
      </View>
      <EnrolledCard enrolled={enrolled} />
      {shelves.length === 0 ? (
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: 10 }}>{t("w.train.plans.noMatches")}</Text>
      ) : (
        shelves.map((group) => (
          <GoalShelf
            key={group.category}
            group={group}
            onLayout={(e) => {
              shelfTops.current[group.category] = e.nativeEvent.layout.y;
            }}
            pick={setGoalId}
          />
        ))
      )}
    </CoverScreen>
  );
}

/** The category chips, riding the scaffold's `rail` slot so they dock beneath
 *  the collapsed bar and stay reachable at any scroll position. They JUMP, they
 *  don't filter — the shelves already are the categories, so narrowing to one
 *  would just empty the screen, which is why they are `role="anchor"` chips and
 *  can never light up. See packages/core/src/dock-rail.ts. Web twin: the same
 *  function name.
 *
 *  The gutter is the COVER scaffold's (16), not the app's GUTTER (12): a
 *  resting chip has to line up with the column it sits above, and this screen's
 *  children are padded at 16. That mismatch is why the chips used to rest 4dp
 *  to the left of the shelf heads beneath them. */
function CategoryRail({ categories, onJump }: { categories: string[]; onJump: (c: string) => void }) {
  const { t } = useLang();
  return (
    <DockRail label={t("w.train.plans.jumpToCategory")} gutter={COVER_GUTTER}>
      {categories.map((c) => (
        <DockChip key={c} role="anchor" label={c} onPress={() => onJump(c)} />
      ))}
    </DockRail>
  );
}

/** One category = one full-bleed shelf. The head states the COUNT so a
 *  two-card peek is never mistaken for the whole set, and a hairline track
 *  under the rail shows position — the two halves of making a horizontal rail
 *  honest about its tail. */
function GoalShelf({ group, pick, onLayout }: { group: GoalGroup; pick: (id: string) => void; onLayout: (e: LayoutChangeEvent) => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const x = useRef(new Animated.Value(0)).current;
  const [rail, setRail] = useState({ view: 0, content: 0 });
  const overflows = rail.content > rail.view + 1;

  return (
    <View onLayout={onLayout} style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 10, marginHorizontal: 2 }}>
        <Text accessibilityRole="header" style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{group.category}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>
          {group.goals.length} {group.goals.length === 1 ? t("w.train.plans.goalCount") : t("w.train.plans.goalsCount")}
        </Text>
      </View>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Read the measurement OUT of the event, THEN update. A functional
        // setState body doesn't run when you call it — React replays it during
        // the next render, and by then RN has released the pooled layout event
        // and nulled its `nativeEvent`. Reading `e.nativeEvent.layout` from
        // inside the updater is what crashed this whole screen in release
        // ("Cannot read property 'layout' of null").
        onLayout={(e) => {
          const view = e.nativeEvent.layout.width;
          setRail((r) => (r.view === view ? r : { ...r, view }));
        }}
        onContentSizeChange={(w) => setRail((r) => (r.content === w ? r : { ...r, content: w }))}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        // Cancel the SCAFFOLD's child padding, not the screen gutter — a
        // shelf lives inside CoverScreen, so bleeding by GUTTER left the cards
        // 4px short of the true edge.
        style={{ marginHorizontal: -COVER_GUTTER }}
        contentContainerStyle={{ gap: 12, paddingHorizontal: COVER_GUTTER }}
      >
        {group.goals.map((g) => (
          <GoalTile key={g.id} goal={g} onOpen={() => pick(g.id)} />
        ))}
      </Animated.ScrollView>
      {overflows && <ShelfTrack x={x} view={rail.view} content={rail.content} />}
    </View>
  );
}

/** The hairline under a shelf — a thumb sized to the visible share of the rail,
 *  riding the scroll offset. Native-driven, so it costs no re-renders.
 *  The thumb travels within the TRACK, which is the content column; `view` is
 *  the full-bleed rail, a gutter wider on each side. Sizing the thumb off the
 *  rail overshoots and its tail gets clipped away, so the track measures
 *  itself. */
function ShelfTrack({ x, view, content }: { x: Animated.Value; view: number; content: number }) {
  const { palette: C } = useTheme();
  const [track, setTrack] = useState(0);
  const thumb = Math.max(24, Math.min(1, view / content) * track);
  const maxScroll = Math.max(1, content - view);
  return (
    <View onLayout={(e) => setTrack(e.nativeEvent.layout.width)} style={{ height: 2, borderRadius: 2, marginTop: 8, backgroundColor: withAlpha(C.chalk, ALPHA.fill), overflow: "hidden" }}>
      <Animated.View
        style={{
          height: 2,
          width: thumb,
          borderRadius: 2,
          backgroundColor: withAlpha(C.chalk, ALPHA.line),
          transform: [{ translateX: x.interpolate({ inputRange: [0, maxScroll], outputRange: [0, Math.max(0, track - thumb)], extrapolate: "clamp" }) }],
        }}
      />
    </View>
  );
}

/** A goal as a COVER, not a card — Explore's PlanCover recipe at tile scale, so
 *  tapping one expands it into the same poster at screen scale. A goal with no
 *  authored programs keeps its colour but at 45%, and says so, instead of
 *  printing "0 plans". */
/** The tile's FACE, drawn once and used twice: by the tile itself, and by the
 *  clone that flies into the goal screen. Two drawings of the same recipe is
 *  precisely the drift this codebase keeps out of clients, and a flying clone
 *  that differs from the thing it flew off is the most visible version of it. */
function GoalTileFace({ cover, pressed }: { cover: ReturnType<typeof goalCoverView>; pressed: boolean }) {
  return (
    <View
      style={{
        width: TILE_W,
        height: TILE_H,
        borderRadius: RADIUS.card,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.07)",
        backgroundColor: TILE_INK,
        padding: 12,
        justifyContent: "space-between",
      }}
      pointerEvents="none"
    >
      <View style={[StyleSheet.absoluteFill, { opacity: cover.ready ? 1 : 0.45 }]} pointerEvents="none">
        {/* alpha-over-ink stops matching web's color-mix wash (52% → 0x85,
            15% @ 46% → 0x26, then ink) — web parity: plans.tsx tile */}
        <LinearGradient colors={[withAlpha(cover.accent, 0.52), withAlpha(cover.accent, 0.15), withAlpha(cover.accent, 0.0)]} locations={[0, 0.46, 1]} start={{ x: 0.9, y: 0 }} end={{ x: 0.2, y: 0.95 }} style={StyleSheet.absoluteFill} />
      </View>
      <LinearGradient colors={[withAlpha(TILE_INK, 0), withAlpha(TILE_INK, 0.8)]} start={{ x: 0, y: 0.4 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <Text
        pointerEvents="none"
        style={{ position: "absolute", top: -12, right: -10, fontSize: 96, lineHeight: 100, color: `rgba(255,255,255,${cover.ready ? 0.09 : 0.05})`, transform: [{ translateX: pressed ? -5 : 0 }, { translateY: pressed ? 4 : 0 }] }}
      >
        {cover.glyph}
      </Text>
      <Text style={{ alignSelf: "flex-end", fontFamily: F.monoBold, fontSize: fs.nano, letterSpacing: tracking.label, color: cover.ready ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)" }}>{cover.count}</Text>
      <Text numberOfLines={3} style={{ fontFamily: F.black, fontSize: fs.subtitle, lineHeight: leading(fs.subtitle, "tight"), letterSpacing: tracking.display, color: cover.ready ? "#fff" : "rgba(255,255,255,0.62)" }}>{cover.title}</Text>
    </View>
  );
}

function GoalTile({ goal, onOpen }: { goal: GoalNode; onOpen: () => void }) {
  const cover = goalCoverView(goal);
  const reduce = useReducedMotion();
  // THE TILE IS THE POSTER, SEEN SMALL — so opening a goal GROWS it rather than
  // cutting to a second drawing of the same recipe at screen scale. Armed on
  // press with the tile's own face; the goal screen's cover claims it on mount
  // and the clone flies between the two measured boxes.
  const armCover = useSharedSurfaceSource();
  const tileRef = useRef<View | null>(null);
  return (
    <Pressable
      ref={tileRef}
      onPress={() => {
        armCover(SHARED_ELEMENTS.planCover, tileRef.current, <GoalTileFace cover={cover} pressed={false} />);
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${goal.name} – ${cover.count}`}
      style={({ pressed }) => ({ transform: [{ scale: pressed && !reduce ? 0.97 : 1 }] })}
    >
      {({ pressed }) => <GoalTileFace cover={cover} pressed={pressed && !reduce} />}
    </Pressable>
  );
}

/** The season you're currently enrolled in, shown above the goal grid.
 *  INFO-ONLY by design: no leave affordance here — a permanent exit button on
 *  the browse surface reads as an invitation to quit. Leaving lives at the
 *  bottom of the enrolled plan's own detail page (LeavePlanSection). */
function EnrolledCard({ enrolled }: { enrolled: EnrolledSeason | null }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  if (!enrolled) return null;
  const planName = GOAL_TREE.flatMap((g) => g.plans).find((p) => p.id === enrolled.planId)?.name ?? enrolled.goal;
  const started = enrolled.startedAt ? new Date(enrolled.startedAt) : null;
  return (
    <ACard style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: txt(C, C.lime) }}>{t("w.train.plans.currentPlan")}</Text>
      <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk, marginTop: 4 }}>{planName}</Text>
      {started && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{t("w.train.plans.startedOn")} {started.toLocaleDateString()}</Text>}
    </ACard>
  );
}

/** The category screen — the plan cover recipe one level up (idea 02, "the
 *  goal hero"): the goal opens with the SAME full-bleed collapsing cover as
 *  the plan detail (goalCoverView: accent wash, ghost glyph, category chip,
 *  plan-count label) and the plans beneath it, so every depth of the Plans
 *  stack is one physical object at a different compression. NO aggregate hem
 *  on the cover — with a full category those ranges mush into noise; instead
 *  EACH plan card carries its own hem (planHeroView: weeks / sessions / the
 *  discipline's volume), so plans differentiate card-by-card. */
function PlanList({ goal, pick, back }: { goal: GoalNode; pick: (id: string) => void; back: () => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const cover = goalCoverView(goal);
  return (
    <CoverScreen cover={{ ...cover, duration: cover.count, stats: [], variant: "goal" }} backLabel={t("w.train.plans.allGoals")} back={back} shared>
      <View style={{ marginTop: 10 }}>
        {goal.plans.length === 0 && <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, lineHeight: leading(fs.bodyLg, "snug") }}>{t("w.train.plans.noPlansYet")}</Text>}
        {goal.plans.map((p) => {
          const hero = planHeroView(p, programFor(p.id) ?? undefined);
          return (
            <Pressable key={p.id} onPress={() => pick(p.id)}>
              <ACard style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: C.ash }}>{p.tag}</Text>
                  {p.hot && <View style={{ backgroundColor: withAlpha(C.lime, ALPHA.fill), borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 3 }}><Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.lime) }}>{t("w.train.plans.popular")}</Text></View>}
                </View>
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, marginTop: 6 }}>{p.name}</Text>
                <View style={{ flexDirection: "row", gap: 16, marginTop: 12, marginBottom: 10 }}>
                  {hero.stats.map((s) => (
                    <View key={s.label} style={{ flex: 1, borderTopWidth: 2, borderTopColor: withAlpha(C.chalk, ALPHA.solid), paddingTop: 8 }}>
                      <Text style={{ fontFamily: F.black, fontSize: fs.heading, lineHeight: 21, letterSpacing: tracking.display, color: C.chalk, fontVariant: ["tabular-nums"] }}>
                        {s.value}
                        {!!s.unit && <Text style={{ fontSize: fs.caption, color: C.ash }}>{s.unit}</Text>}
                      </Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, marginTop: 4 }}>{s.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>{p.desc}</Text>
              </ACard>
            </Pressable>
          );
        })}
      </View>
    </CoverScreen>
  );
}

function Detail({ goal, plan, back, alreadyEnrolled, onEnrolled, leaveSection }: { goal: GoalNode; plan: GoalPlan; back: () => void; alreadyEnrolled?: boolean; onEnrolled?: () => void; leaveSection?: ReactNode }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const d = planDetail(plan.id, plan);
  const [enrolled, setEnrolled] = useState<"idle" | "busy" | "done" | "error">(alreadyEnrolled ? "done" : "idle");
  const revalidate = useRevalidate();
  const enroll = async () => {
    setEnrolled("busy");
    const ok = await enrollPlan(goal.name, plan.id);
    setEnrolled(ok ? "done" : "error");
    // Enrolling changed the season — drop the cached macrocycle so Today and
    // Performance don't keep rendering "No season yet" off a pre-enrol read.
    if (ok) { revalidate.macrocycle(); onEnrolled?.(); }
  };
  return (
    <PlanCoverScreen
      goal={goal}
      plan={plan}
      back={back}
      dock={
        <PlanDockPill
          state={enrolled}
          idleLabel={`${t("w.train.plans.enrollIn")} ${plan.name}`}
          busyLabel={t("w.train.plans.enrolling")}
          doneLabel={t("common.enrolled")}
          onPress={enroll}
        />
      }
    >
      <View style={{ marginTop: 10 }}>
        <Field label={t("w.train.plans.forWho")} value={d.forWho} />
        <Field label={t("w.train.plans.outcome")} value={d.outcome} />
        <Field label={t("w.train.plans.sessionLength")} value={d.sessionLength} />
        <Field label={t("w.train.plans.equipment")} value={d.equipment} />
        <Field label={t("w.train.plans.level")} value={d.level} />

        <ACard style={{ marginBottom: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: txt(C, C.lime) }}>{t("w.train.plans.weeklySplit")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 8 }}>
            {d.split.map((day, i) => (
              <View key={i} style={{ backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: day.toLowerCase() === "rest" ? C.ash : C.chalk }}>{day}</Text>
              </View>
            ))}
          </View>
        </ACard>

        {d.days.map((session, di) => (
          <ACard key={di} style={{ marginBottom: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: C.ash }}>{session.day}</Text>
            {session.items?.map((it, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }}>{it.name}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{srSingleReps(it.sr)}</Text>
              </View>
            ))}
          </ACard>
        ))}

        <Field label={t("w.train.plans.progression")} value={d.progression} />
        <MeasuredOutcome planId={plan.id} />

        {enrolled === "error" && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.body, color: FEEDBACK.error.text, marginTop: 8 }}>{t("plans.enrollError")}</Text>}
        {leaveSection}
      </View>
    </PlanCoverScreen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const { palette: C } = useTheme();
  return (
    <ACard style={{ marginBottom: 12 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: C.ash }}>{label}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, marginTop: 6, lineHeight: leading(fs.bodyLg) }}>{value}</Text>
    </ACard>
  );
}
