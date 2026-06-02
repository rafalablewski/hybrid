import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { GOAL_TREE, planDetail, type GoalNode, type GoalPlan } from "@hybrid/core";
import { Screen, Card, Kicker, Mono, Chip, C, F } from "../../lib/ui";

export default function Plans() {
  const [goalId, setGoalId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

  const goal = GOAL_TREE.find((g) => g.id === goalId) ?? null;
  const plan = goal?.plans.find((p) => p.id === planId) ?? null;

  if (goal && plan) return <Detail goal={goal} plan={plan} back={() => setPlanId(null)} />;
  if (goal)
    return (
      <PlanList
        goal={goal}
        pick={setPlanId}
        back={() => {
          setGoalId(null);
          setPlanId(null);
        }}
      />
    );

  return (
    <Screen>
      <Kicker>Plans</Kicker>
      <Mono style={{ marginTop: 6, marginBottom: 14 }}>Start with your goal.</Mono>
      {GOAL_TREE.map((g) => (
        <Pressable key={g.id} onPress={() => setGoalId(g.id)}>
          <Card style={{ borderLeftWidth: 3, borderLeftColor: g.color }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 22, color: g.color }}>{g.icon}</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.chalk }}>{g.name}</Text>
            </View>
            <Mono style={{ marginTop: 8, lineHeight: 19 }}>{g.blurb}</Mono>
            <Mono color={g.color} style={{ marginTop: 8 }}>
              {g.plans.length} plans →
            </Mono>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

function PlanList({ goal, pick, back }: { goal: GoalNode; pick: (id: string) => void; back: () => void }) {
  return (
    <Screen>
      <Back onPress={back} label="All goals" />
      <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk, marginVertical: 8 }}>
        {goal.icon} {goal.name}
      </Text>
      {goal.plans.map((p) => (
        <Pressable key={p.id} onPress={() => pick(p.id)}>
          <Card style={{ borderLeftWidth: 3, borderLeftColor: p.hot ? C.lime : C.line }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk }}>{p.name}</Text>
              {p.hot && <Chip>Popular</Chip>}
            </View>
            <Mono style={{ marginVertical: 6 }}>
              {p.weeks} wks · {p.sessions}×/wk · {p.tag}
            </Mono>
            <Mono color={C.chalk} style={{ lineHeight: 19 }}>
              {p.desc}
            </Mono>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

function Detail({ goal, plan, back }: { goal: GoalNode; plan: GoalPlan; back: () => void }) {
  const d = planDetail(plan.id, plan);
  return (
    <Screen>
      <Back onPress={back} label={goal.name} />
      <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk, marginVertical: 6 }}>{plan.name}</Text>
      <Mono style={{ marginBottom: 14 }}>
        {plan.weeks} weeks · {plan.sessions}×/week · {d.level}
      </Mono>

      <Field label="Who it's for" value={d.forWho} />
      <Field label="Outcome" value={d.outcome} />
      <Field label="Session length" value={d.sessionLength} />
      <Field label="Equipment" value={d.equipment} />

      <Card>
        <Kicker color={C.lime}>Weekly split</Kicker>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {d.split.map((day, i) => (
            <View key={i} style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: day.toLowerCase() === "rest" ? C.ash : C.chalk }}>
                {day}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Kicker color={C.amber}>Sample · {d.sample.day}</Kicker>
        {d.sample.items.map((it, i) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
            <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.chalk, flex: 1 }}>{it.name}</Text>
            <Mono color={C.chalk}>{it.sr}</Mono>
          </View>
        ))}
      </Card>

      <Field label="Progression" value={d.progression} />
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <Kicker>{label}</Kicker>
      <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 20 }}>
        {value}
      </Mono>
    </Card>
  );
}

function Back({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} style={{ marginBottom: 6 }}>
      <Mono>← {label}</Mono>
    </Pressable>
  );
}
