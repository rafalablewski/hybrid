import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { GOAL_TREE, GOAL_GROUPS, planDetail, type GoalNode, type GoalPlan } from "@hybrid/core";
import { enrollPlan } from "../../lib/api";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { Screen, Card, Kicker, Mono, Chip, Button, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";

// Plans library — FREE for everyone (enrol + follow a plan). The paid (Full)
// layer is building your OWN plans, custom exercises and periodization, sold via
// a single tasteful upsell card here, never a padlock on the plans themselves.
export default function Plans() {
  const C = useTheme().palette;
  const { t } = useLang();
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
      <UpgradeBait />
      <Mono style={{ marginTop: 6, marginBottom: 14 }}>{t("plans.chooseGoal")}</Mono>
      {GOAL_GROUPS.map((group) => (
        <View key={group.category} style={{ marginBottom: 8 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: C.ash, marginBottom: 8 }}>{group.category}</Text>
          {group.goals.map((g) => (
            <Pressable key={g.id} onPress={() => setGoalId(g.id)}>
              <Card style={{ borderLeftWidth: 3, borderLeftColor: g.color }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ fontSize: 22, color: g.color }}>{g.icon}</Text>
                  <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.chalk }}>{g.name}</Text>
                </View>
                <Mono style={{ marginTop: 8, lineHeight: 19 }}>{g.blurb}</Mono>
                <Mono color={g.color} style={{ marginTop: 8 }}>
                  {g.plans.length} {t("plans.plansCount")} →
                </Mono>
              </Card>
            </Pressable>
          ))}
        </View>
      ))}
    </Screen>
  );
}

function PlanList({ goal, pick, back }: { goal: GoalNode; pick: (id: string) => void; back: () => void }) {
  const C = useTheme().palette;
  const { t } = useLang();
  return (
    <Screen>
      <Back onPress={back} label={t("plans.allGoals")} />
      <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk, marginVertical: 8 }}>
        {goal.icon} {goal.name}
      </Text>
      {goal.plans.length === 0 && (
        <Mono style={{ lineHeight: 19 }}>{t("plans.noPlansYet")}</Mono>
      )}
      {goal.plans.map((p) => (
        <Pressable key={p.id} onPress={() => pick(p.id)}>
          <Card style={{ borderLeftWidth: 3, borderLeftColor: p.hot ? C.lime : C.line }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk }}>{p.name}</Text>
              {p.hot && <Chip>Popular</Chip>}
            </View>
            <Mono style={{ marginVertical: 6 }}>
              {p.weeks} {t("plans.weeks")} · {p.sessions}×/wk · {p.tag}
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

// Free→paid anchor: enrolling + following any plan is free; building your own,
// custom exercises and the periodization season are Full. Shown only to a free
// user, as one value card (no padlocks) that opens the Unlock Full page.
function UpgradeBait({ compact }: { compact?: boolean }) {
  const C = useTheme().palette;
  const router = useRouter();
  const { entitlement } = useSession();
  if (entitlement === "paid") return null;
  return (
    <Card style={{ marginTop: compact ? 14 : 8, borderLeftWidth: 3, borderLeftColor: C.lime }}>
      <Kicker color={C.lime}>Plans are free</Kicker>
      <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 20 }}>
        {compact
          ? "You’re enrolled — follow it from Today. Unlock Full to periodize it (phases, deloads, peak), build your own plans and add custom exercises."
          : "Enrol in any plan and follow it — free. Unlock Full to build your OWN plans, add custom exercises and periodize them into a real season."}
      </Mono>
      <View style={{ marginTop: 12 }}>
        <Button label="Unlock Full →" color={C.lime} onPress={() => router.push("/upgrade")} />
      </View>
    </Card>
  );
}

function Detail({ goal, plan, back }: { goal: GoalNode; plan: GoalPlan; back: () => void }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const d = planDetail(plan.id, plan);
  const [enrolled, setEnrolled] = useState<"idle" | "busy" | "done" | "error">("idle");
  const enroll = async () => {
    setEnrolled("busy");
    // Pass the named plan id so "Your plan today" follows this exact plan.
    setEnrolled((await enrollPlan(goal.name, plan.id)) ? "done" : "error");
  };
  return (
    <Screen>
      <Back onPress={back} label={goal.name} />
      <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk, marginVertical: 6 }}>{plan.name}</Text>
      <Mono style={{ marginBottom: 14 }}>
        {plan.weeks} {t("plans.weeks")} · {plan.sessions}×/wk · {d.level}
      </Mono>

      <Field label={t("plan.forWho")} value={d.forWho} />
      <Field label={t("plan.outcome")} value={d.outcome} />
      <Field label={t("plan.sessionLength")} value={d.sessionLength} />
      <Field label={t("plan.equipment")} value={d.equipment} />

      <Card>
        <Kicker color={C.lime}>{t("plan.split")}</Kicker>
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

      {d.days.map((session, di) => (
        <Card key={di}>
          <Kicker color={C.amber}>{session.day}</Kicker>
          {session.items?.map((it, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.chalk, flex: 1 }}>{it.name}</Text>
              <Mono color={C.chalk}>{it.sr}</Mono>
            </View>
          ))}
        </Card>
      ))}

      <Field label={t("plan.progression")} value={d.progression} />

      <View style={{ marginTop: 8 }}>
        <Button
          label={
            enrolled === "done"
              ? t("common.enrolled")
              : enrolled === "busy"
                ? t("common.enrolling")
                : `${t("common.enroll")} ${plan.name}`
          }
          color={C.lime}
          onPress={enroll}
          disabled={enrolled === "busy" || enrolled === "done"}
        />
        {enrolled === "error" && (
          <Mono color={C.amber} style={{ marginTop: 8 }}>
            Couldn&apos;t enroll — check your connection.
          </Mono>
        )}
      </View>
      {enrolled === "done" && <UpgradeBait compact />}
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const C = useTheme().palette;
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
