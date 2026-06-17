import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  recommendPlan,
  ONBOARDING_GOAL_GROUPS,
  type OnboardingGoal,
  type Experience,
  type Equipment,
} from "@hybrid/core";
import { enrollPlan } from "../../lib/api";
import { useClientPersonaChoice, setClientPersona } from "../../lib/persona";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import { APill, ASegment, AHeading, ASub, RADIUS } from "./kit";

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
const DAYS = [2, 3, 4, 5, 6].map((n) => ({ id: String(n), label: `${n}×` }));

const STEPS = ["persona", "goal", "experience", "days", "equipment", "plan"] as const;
type Step = (typeof STEPS)[number];

/** AURORA onboarding — a stepped, rounded wizard adapted from the Figma kit,
 *  driving the same intake + recommendPlan flow as the classic onboarding. */
export default function AuroraOnboarding() {
  const { palette } = useTheme();
  const router = useRouter();
  const persona = useClientPersonaChoice();
  const [idx, setIdx] = useState(0);
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);
  const [experience, setExperience] = useState<Experience>("beginner");
  const [days, setDays] = useState(3);
  const [equipment, setEquipment] = useState<Equipment>("full");
  const [enrolling, setEnrolling] = useState(false);

  const step: Step = STEPS[idx]!;
  const plan = useMemo(
    () => (goal ? recommendPlan({ goal, experience, daysPerWeek: days, equipment }) : null),
    [goal, experience, days, equipment],
  );

  const persistIntake = async () => {
    await Promise.all([
      AsyncStorage.setItem("hybrid.daysPerWeek", String(days)),
      AsyncStorage.setItem("hybrid.experience", experience),
      AsyncStorage.setItem("hybrid.equipment", equipment),
    ]).catch(() => {});
  };

  const finish = async () => {
    setEnrolling(true);
    if (plan) await enrollPlan(plan.goalLabel, plan.planId);
    await persistIntake();
    setEnrolling(false);
    router.replace("/(tabs)");
  };

  const next = () => {
    if (idx < STEPS.length - 1) setIdx((i) => i + 1);
    else void finish();
  };
  const back = () => (idx > 0 ? setIdx((i) => i - 1) : router.replace("/(tabs)"));

  // Per-step "can advance" guard so the Next pill mirrors the Figma flow.
  const canNext = step === "persona" ? !!persona : step === "goal" ? !!goal : true;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink }} edges={["top", "bottom"]}>
      <View style={{ flex: 1, padding: 24 }}>
        {/* progress segments */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= idx ? palette.lime : palette.line }}
            />
          ))}
        </View>
        <Pressable onPress={() => router.replace("/(tabs)")} style={{ alignSelf: "flex-end", marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: palette.ash }}>skip</Text>
        </Pressable>

        <ScrollView style={{ marginTop: 14 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {step === "persona" && (
            <Step title="How do you want to use HYBRID?" sub="You can switch anytime in More.">
              {([
                { id: "casual" as const, title: "Just track my training", sub: "Log fast, review at home, share your wins. Free." },
                { id: "athlete" as const, title: "Train for a goal", sub: "Plans, sport S&C, velocity & performance. The full toolkit." },
              ]).map((o) => (
                <Choice key={o.id} active={persona === o.id} title={o.title} sub={o.sub} onPress={() => setClientPersona(o.id)} />
              ))}
            </Step>
          )}

          {step === "goal" && (
            <Step title="What is your main goal?" sub="We'll shape your first plan around it.">
              {ONBOARDING_GOAL_GROUPS.map((group) => (
                <View key={group.category} style={{ marginTop: 4 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: palette.ash, marginTop: 12, marginBottom: 6 }}>
                    {group.category}
                  </Text>
                  {group.goals.map((g) => (
                    <Choice key={g.id} active={goal === g.id} title={g.label} sub={g.blurb} onPress={() => setGoal(g.id)} />
                  ))}
                </View>
              ))}
            </Step>
          )}

          {step === "experience" && (
            <Step title="What's your experience?" sub="So we set the right starting load.">
              <ASegment options={EXP} value={experience} onPick={setExperience} />
            </Step>
          )}

          {step === "days" && (
            <Step title="How many days a week?" sub="A plan you'll actually finish beats an ideal one.">
              <ASegment options={DAYS} value={String(days)} onPick={(v) => setDays(Number(v))} />
            </Step>
          )}

          {step === "equipment" && (
            <Step title="What equipment do you have?" sub="We'll only prescribe what you can do.">
              <ASegment options={EQUIP} value={equipment} onPick={setEquipment} />
            </Step>
          )}

          {step === "plan" && (
            <Step title="Your plan" sub={plan ? "" : "Pick a goal to see a recommendation."}>
              {plan ? (
                <View style={{ backgroundColor: palette.ink2, borderColor: palette.line, borderWidth: 1, borderRadius: RADIUS.card, padding: 20 }}>
                  <Text style={{ fontFamily: F.black, fontSize: 22, color: palette.chalk }}>{plan.planName}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 12, color: palette.ash, marginTop: 4 }}>
                    {plan.goalLabel} · {plan.weeklyTarget}×/wk · {plan.weeks} wks
                  </Text>
                  <Text style={{ fontFamily: F.reg, fontSize: 14, color: palette.chalk, marginTop: 12, lineHeight: 20 }}>{plan.why}</Text>
                </View>
              ) : (
                <ASub>Plans for this goal are coming soon — jump in now and enroll once they land.</ASub>
              )}
            </Step>
          )}
        </ScrollView>

        {/* Back / Next */}
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Pressable
            onPress={back}
            style={{ width: 64, height: 56, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontFamily: F.bold, fontSize: 18, color: palette.chalk }}>‹</Text>
          </Pressable>
          <APill
            label={step === "plan" ? (enrolling ? "Setting up…" : plan ? "Start this plan" : "Continue") : "Next"}
            onPress={next}
            disabled={!canNext || enrolling}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Step({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View>
      <AHeading style={{ fontSize: 26 }}>{title}</AHeading>
      {!!sub && <ASub style={{ marginTop: 8 }}>{sub}</ASub>}
      <View style={{ marginTop: 20, gap: 10 }}>{children}</View>
    </View>
  );
}

function Choice({ active, title, sub, onPress }: { active: boolean; title: string; sub: string; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? palette.lime : palette.line,
        backgroundColor: active ? `${palette.lime}14` : palette.ink2,
        borderRadius: RADIUS.field,
        padding: 16,
      }}
    >
      <Text style={{ fontFamily: F.bold, fontSize: 15, color: active ? txt(palette, palette.lime) : palette.chalk }}>{title}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: 12, color: palette.ash, marginTop: 3, lineHeight: 17 }}>{sub}</Text>
    </Pressable>
  );
}
