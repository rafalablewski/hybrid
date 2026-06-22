import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { GOAL_TREE, GOAL_GROUPS, planDetail, srSingleReps, type GoalNode, type GoalPlan } from "@hybrid/core";
import { enrollPlan } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

/** AURORA Plans — goal tree → plan list → full plan detail + enroll, reusing the
 *  exact plan library (GOAL_TREE / planDetail / enrollPlan). */
export default function AuroraPlans() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [goalId, setGoalId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const goal = GOAL_TREE.find((g) => g.id === goalId) ?? null;
  const plan = goal?.plans.find((p) => p.id === planId) ?? null;

  if (goal && plan) return <Detail goal={goal} plan={plan} back={() => setPlanId(null)} />;
  if (goal) return <PlanList goal={goal} pick={setPlanId} back={() => { setGoalId(null); setPlanId(null); }} />;

  return (
    <AuroraScreen>
      <AHeading style={{ fontSize: fs.display }}>Plans</AHeading>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, marginBottom: 14 }}>{t("plans.chooseGoal")}</Text>
      {GOAL_GROUPS.map((group) => (
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
      ))}
    </AuroraScreen>
  );
}

function PlanList({ goal, pick, back }: { goal: GoalNode; pick: (id: string) => void; back: () => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <AuroraScreen>
      <Back onPress={back} label={t("plans.allGoals")} />
      <AHeading style={{ fontSize: fs.display, marginTop: 8 }}>{goal.icon} {goal.name}</AHeading>
      {goal.plans.length === 0 && <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 12, lineHeight: 19 }}>{t("plans.noPlansYet")}</Text>}
      <View style={{ marginTop: 12 }}>
        {goal.plans.map((p) => (
          <Pressable key={p.id} onPress={() => pick(p.id)}>
            <ACard style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk }}>{p.name}</Text>
                {p.hot && <View style={{ backgroundColor: `${C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}><Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.lime) }}>Popular</Text></View>}
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginVertical: 6 }}>{p.weeks} {t("plans.weeks")} · {p.sessions}×/wk · {p.tag}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{p.desc}</Text>
            </ACard>
          </Pressable>
        ))}
      </View>
    </AuroraScreen>
  );
}

function Detail({ goal, plan, back }: { goal: GoalNode; plan: GoalPlan; back: () => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const d = planDetail(plan.id, plan);
  const [enrolled, setEnrolled] = useState<"idle" | "busy" | "done" | "error">("idle");
  const enroll = async () => { setEnrolled("busy"); setEnrolled((await enrollPlan(goal.name, plan.id)) ? "done" : "error"); };
  return (
    <AuroraScreen>
      <Back onPress={back} label={goal.name} />
      <AHeading style={{ fontSize: fs.display, marginTop: 6 }}>{plan.name}</AHeading>
      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginBottom: 14, marginTop: 4 }}>{plan.weeks} {t("plans.weeks")} · {plan.sessions}×/wk · {d.level}</Text>

      <Field label={t("plan.forWho")} value={d.forWho} />
      <Field label={t("plan.outcome")} value={d.outcome} />
      <Field label={t("plan.sessionLength")} value={d.sessionLength} />
      <Field label={t("plan.equipment")} value={d.equipment} />

      <ACard style={{ marginBottom: 12 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("plan.split")}</Text>
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
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.amber) }}>{session.day}</Text>
          {session.items?.map((it, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }}>{it.name}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{srSingleReps(it.sr)}</Text>
            </View>
          ))}
        </ACard>
      ))}

      <Field label={t("plan.progression")} value={d.progression} />

      <APill
        label={enrolled === "done" ? t("common.enrolled") : enrolled === "busy" ? t("common.enrolling") : `${t("common.enroll")} ${plan.name}`}
        onPress={enroll} disabled={enrolled === "busy" || enrolled === "done"} style={{ marginTop: 8 }}
      />
      {enrolled === "error" && <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, C.amber), marginTop: 8 }}>Couldn&apos;t enroll — check your connection.</Text>}
    </AuroraScreen>
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
