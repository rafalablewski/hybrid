import { useCallback, useEffect, useState, type ReactNode } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
import { GOAL_TREE, GOAL_CATEGORIES, filterGoalGroups, planDetail, srSingleReps, programFor, type GoalCategory, type GoalNode, type GoalPlan } from "@hybrid/core";
import { enrollPlan, fetchMacrocycle } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, AField, AHeading, ABack, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";
import { LeavePlanSection, type EnrolledSeason } from "./leave-plan";
import PercentProgram from "../percent-program";
import PlanCoverScreen, { PlanDockPill } from "../plan-hero";

/** AURORA Plans — goal tree → plan list → full plan detail + enroll, reusing the
 *  exact plan library (GOAL_TREE / planDetail / enrollPlan). */
export default function AuroraPlans() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [goalId, setGoalId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  // Browse filter — narrows the goal grid by discipline and/or free-text so the
  // library stays findable as it grows past a scroll-it-all list.
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<GoalCategory | "all">("all");
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

  return (
    <AuroraScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
        <AHeading style={{ fontSize: fs.display }}>{t("plans.title")}</AHeading>
      </View>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, marginBottom: 14 }}>{t("plans.chooseGoal")}</Text>
      <EnrolledCard enrolled={enrolled} />
      <FilterBar query={query} setQuery={setQuery} cat={cat} setCat={setCat} />
      {(() => {
        const groups = filterGoalGroups(query, cat);
        if (groups.length === 0) return <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginTop: 4 }}>{t("w.train.plans.noMatches")}</Text>;
        return groups.map((group) => (
          <View key={group.category} style={{ marginBottom: 8 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1, textTransform: "uppercase", color: C.ash, marginBottom: 8 }}>{group.category}</Text>
            {group.goals.map((g) => (
              <Pressable key={g.id} onPress={() => setGoalId(g.id)}>
                <ACard style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
                    <Text style={{ fontSize: 22, color: g.color }}>{g.icon}</Text>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{g.name}</Text>
                  </View>
                  <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: 8, lineHeight: 19 }}>{g.blurb}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, g.color), marginTop: 8 }}>{g.plans.length} {t("plans.plansCount")} →</Text>
                </ACard>
              </Pressable>
            ))}
          </View>
        ));
      })()}
    </AuroraScreen>
  );
}

// Browse filter for the goal grid — a search field over a full-bleed row of
// discipline chips (All + each category). Both levers feed the shared
// filterGoalGroups() so web + mobile narrow the library identically.
function FilterBar({ query, setQuery, cat, setCat }: { query: string; setQuery: (v: string) => void; cat: GoalCategory | "all"; setCat: (c: GoalCategory | "all") => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const cats: (GoalCategory | "all")[] = ["all", ...GOAL_CATEGORIES];
  return (
    <View style={{ marginBottom: 8 }}>
      <AField value={query} onChange={setQuery} placeholder={t("w.train.plans.searchGoals")} icon="search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginBottom: 10 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {cats.map((c) => {
          const on = c === cat;
          return (
            <Pressable key={c} onPress={() => setCat(c)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ backgroundColor: on ? C.lime : C.ink2, borderWidth: 1, borderColor: on ? C.lime : C.line, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "600", color: on ? C.onAccent : C.ash }}>{c === "all" ? t("w.train.plans.allCats") : c}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
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
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.train.plans.currentPlan")}</Text>
      <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk, marginTop: 4 }}>{planName}</Text>
      {started && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{t("w.train.plans.startedOn")} {started.toLocaleDateString()}</Text>}
    </ACard>
  );
}

function PlanList({ goal, pick, back }: { goal: GoalNode; pick: (id: string) => void; back: () => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <AuroraScreen>
      <Back onPress={back} label={t("w.train.plans.allGoals")} />
      <AHeading style={{ fontSize: fs.display, marginTop: 8 }}>{goal.icon} {goal.name}</AHeading>
      {goal.plans.length === 0 && <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 12, lineHeight: 19 }}>{t("w.train.plans.noPlansYet")}</Text>}
      <View style={{ marginTop: 12 }}>
        {goal.plans.map((p) => (
          <Pressable key={p.id} onPress={() => pick(p.id)}>
            <ACard style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk }}>{p.name}</Text>
                {p.hot && <View style={{ backgroundColor: `${C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}><Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.lime) }}>{t("w.train.plans.popular")}</Text></View>}
              </View>
              <View style={{ marginVertical: 6 }}><MetaLine parts={[`${p.weeks} ${t("w.train.plans.weeks")}`, `${p.sessions}${t("w.train.plans.perWk")}`, p.tag]} textStyle={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }} /></View>
              <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{p.desc}</Text>
            </ACard>
          </Pressable>
        ))}
      </View>
    </AuroraScreen>
  );
}

function Detail({ goal, plan, back, alreadyEnrolled, onEnrolled, leaveSection }: { goal: GoalNode; plan: GoalPlan; back: () => void; alreadyEnrolled?: boolean; onEnrolled?: () => void; leaveSection?: ReactNode }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const d = planDetail(plan.id, plan);
  const [enrolled, setEnrolled] = useState<"idle" | "busy" | "done" | "error">(alreadyEnrolled ? "done" : "idle");
  const enroll = async () => {
    setEnrolled("busy");
    const ok = await enrollPlan(goal.name, plan.id);
    setEnrolled(ok ? "done" : "error");
    if (ok) onEnrolled?.();
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
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.train.plans.weeklySplit")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 8 }}>
            {d.split.map((day, i) => (
              <View key={i} style={{ backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 11, paddingVertical: 8 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: day.toLowerCase() === "rest" ? C.ash : C.chalk }}>{day}</Text>
              </View>
            ))}
          </View>
        </ACard>

        {d.days.map((session, di) => (
          <ACard key={di} style={{ marginBottom: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{session.day}</Text>
            {session.items?.map((it, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }}>{it.name}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{srSingleReps(it.sr)}</Text>
              </View>
            ))}
          </ACard>
        ))}

        <Field label={t("w.train.plans.progression")} value={d.progression} />

        {enrolled === "error" && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, C.red), marginTop: 8 }}>{t("plans.enrollError")}</Text>}
        {leaveSection}
      </View>
    </PlanCoverScreen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const { palette: C } = useTheme();
  return (
    <ACard style={{ marginBottom: 12 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{label}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, marginTop: 6, lineHeight: 20 }}>{value}</Text>
    </ACard>
  );
}

function Back({ onPress, label }: { onPress: () => void; label: string }) {
  const { palette: C } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <AuroraIcon name="back" size={18} color={C.ash} />
      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{label}</Text>
    </Pressable>
  );
}
