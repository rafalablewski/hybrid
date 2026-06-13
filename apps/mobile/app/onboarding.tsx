import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  recommendPlan,
  ONBOARDING_GOAL_GROUPS,
  type OnboardingGoal,
  type Experience,
  type Equipment,
} from "@hybrid/core";
import { enrollPlan } from "../lib/api";
import { Screen, Card, Kicker, Mono, Button, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

const EXP: { id: Experience; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];
const EQUIP: { id: Equipment; label: string }[] = [
  { id: "full", label: "Full gym" },
  { id: "home", label: "Home" },
  { id: "minimal", label: "Minimal" },
];

export default function Onboarding() {
  const C = useTheme().palette;
  const router = useRouter();
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);
  const [experience, setExperience] = useState<Experience>("beginner");
  const [days, setDays] = useState(3);
  const [equipment, setEquipment] = useState<Equipment>("full");
  const [enrolling, setEnrolling] = useState(false);

  const plan = useMemo(
    () => (goal ? recommendPlan({ goal, experience, daysPerWeek: days, equipment }) : null),
    [goal, experience, days, equipment],
  );

  const start = async () => {
    if (!plan) return;
    setEnrolling(true);
    await enrollPlan(plan.goalLabel);
    await AsyncStorage.setItem("hybrid.daysPerWeek", String(days)).catch(() => {});
    setEnrolling(false);
    router.replace("/(tabs)");
  };

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Kicker>Set up your plan</Kicker>
        <Text onPress={() => router.back()} style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>skip</Text>
      </View>
      <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk, marginTop: 4, marginBottom: 4 }}>
        Let&apos;s build your first plan
      </Text>
      <Mono style={{ lineHeight: 19 }}>Four quick questions — we&apos;ll match you to a plan you&apos;ll actually finish.</Mono>

      <Card style={{ marginTop: 14 }}>
        <Kicker color={C.lime}>1 · Your main goal</Kicker>
        {ONBOARDING_GOAL_GROUPS.map((group) => (
          <View key={group.category} style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{group.category}</Text>
            <View style={{ marginTop: 6, gap: 8 }}>
              {group.goals.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => setGoal(g.id)}
                  style={{ borderWidth: 1, borderColor: goal === g.id ? C.lime : C.line, backgroundColor: goal === g.id ? `${C.lime}14` : "transparent", borderRadius: 12, padding: 12 }}
                >
                  <Text style={{ fontFamily: F.bold, fontSize: 15, color: goal === g.id ? txt(C, C.lime) : C.chalk }}>{g.label}</Text>
                  <Mono style={{ marginTop: 2, fontSize: 11 }}>{g.blurb}</Mono>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Kicker color={C.lime}>2 · Experience</Kicker>
        <Row options={EXP} value={experience} onPick={(v) => setExperience(v as Experience)} />
      </Card>

      <Card>
        <Kicker color={C.lime}>3 · Days per week</Kicker>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <Step label="−" onPress={() => setDays((d) => Math.max(1, d - 1))} />
          <Text style={{ fontFamily: F.black, fontSize: 28, color: C.chalk }}>{days}×</Text>
          <Step label="+" onPress={() => setDays((d) => Math.min(7, d + 1))} />
        </View>
      </Card>

      <Card>
        <Kicker color={C.lime}>4 · Equipment</Kicker>
        <Row options={EQUIP} value={equipment} onPick={(v) => setEquipment(v as Equipment)} />
      </Card>

      {plan && (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet }}>
          <Kicker color={C.violet}>Your plan</Kicker>
          <Text style={{ fontFamily: F.black, fontSize: 20, color: C.chalk, marginTop: 6 }}>{plan.planName}</Text>
          <Mono color={C.ash} style={{ marginTop: 2 }}>{plan.goalLabel} · {plan.weeklyTarget}×/wk · {plan.weeks} wks</Mono>
          <Mono color={C.chalk} style={{ marginTop: 8, lineHeight: 19 }}>{plan.why}</Mono>
          <View style={{ marginTop: 14 }}>
            <Button label={enrolling ? "Setting up…" : "Start this plan →"} onPress={start} disabled={enrolling} />
          </View>
        </Card>
      )}
      {!plan && goal && (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet }}>
          <Kicker color={C.violet}>Your plan</Kicker>
          <Mono color={C.chalk} style={{ marginTop: 8, lineHeight: 19 }}>
            Plans for this goal are coming soon. Jump into the app now — you can enroll once they land.
          </Mono>
          <View style={{ marginTop: 14 }}>
            <Button label="Continue to the app →" onPress={() => router.replace("/(tabs)")} />
          </View>
        </Card>
      )}
      {!plan && !goal && <Mono style={{ marginTop: 12 }}>Pick a goal to see your recommended plan.</Mono>}
    </Screen>
  );
}

function Row({ options, value, onPick }: { options: { id: string; label: string }[]; value: string; onPick: (v: string) => void }) {
  const C = useTheme().palette;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      {options.map((o) => (
        <Pressable
          key={o.id}
          onPress={() => onPick(o.id)}
          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: value === o.id ? C.lime : C.line, backgroundColor: value === o.id ? `${C.lime}1a` : "transparent" }}
        >
          <Text style={{ fontFamily: F.semi, fontSize: 13, color: value === o.id ? txt(C, C.lime) : C.ash }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Step({ label, onPress }: { label: string; onPress: () => void }) {
  const C = useTheme().palette;
  return (
    <Pressable onPress={onPress} style={{ width: 52, height: 44, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: F.black, fontSize: 22, color: txt(C, C.lime) }}>{label}</Text>
    </Pressable>
  );
}
