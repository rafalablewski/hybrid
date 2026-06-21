import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  ONBOARDING_GOAL_GROUPS,
  type OnboardingQuestion,
} from "@hybrid/core";
import { useClientPersonaChoice, setClientPersona } from "../lib/persona";
import { useOnboarding, finishOnboarding, type AnswerValue } from "../lib/use-onboarding";
import { fs, space, Screen, Card, Kicker, Mono, Button, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraOnboarding from "../components/aurora/onboarding";

export default function Onboarding() {
  if (useTemplate().template === "aurora") return <AuroraOnboarding />;
  return <ClassicOnboarding />;
}

// The questionnaire is now data: the admin-editable question set is fetched and
// rendered generically by kind, so both clients stay in lockstep with the admin.
function ClassicOnboarding() {
  const C = useTheme().palette;
  const router = useRouter();
  const { questions, answers, setAnswer, plan, loading } = useOnboarding();
  const persona = useClientPersonaChoice();
  const [enrolling, setEnrolling] = useState(false);

  const goalQ = questions.find((q) => q.engineKey === "goal");
  const goalAnswered = goalQ ? !!answers[goalQ.key] : true;

  const finish = async () => {
    setEnrolling(true);
    await finishOnboarding(questions, answers, plan);
    setEnrolling(false);
    router.replace("/(tabs)");
  };

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Kicker>Set up your plan</Kicker>
        <Text onPress={() => router.replace("/(tabs)")} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>skip</Text>
      </View>
      <Text style={{ fontFamily: F.black, fontSize: fs.display, color: C.chalk, marginTop: 4, marginBottom: 4 }}>
        Let&apos;s build your first plan
      </Text>
      <Mono style={{ lineHeight: 19 }}>Tell us how you train — we&apos;ll shape the app around you.</Mono>

      {loading && questions.length === 0 ? (
        <Mono style={{ marginTop: 16 }}>Loading…</Mono>
      ) : (
        questions.map((q, i) => (
          <QuestionCard key={q.key} q={q} index={i} answers={answers} setAnswer={setAnswer} personaChoice={persona} />
        ))
      )}

      {plan ? (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet }}>
          <Kicker color={C.violet}>Your plan</Kicker>
          <Text style={{ fontFamily: F.black, fontSize: fs.heading, color: C.chalk, marginTop: 6 }}>{plan.planName}</Text>
          <Mono color={C.ash} style={{ marginTop: 2 }}>{plan.goalLabel} · {plan.weeklyTarget}×/wk · {plan.weeks} wks</Mono>
          <Mono color={C.chalk} style={{ marginTop: 8, lineHeight: 19 }}>{plan.why}</Mono>
          <View style={{ marginTop: 14 }}>
            <Button label={enrolling ? "Setting up…" : "Start this plan →"} onPress={finish} disabled={enrolling} />
          </View>
        </Card>
      ) : goalAnswered ? (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet }}>
          <Kicker color={C.violet}>Your plan</Kicker>
          <Mono color={C.chalk} style={{ marginTop: 8, lineHeight: 19 }}>
            {goalQ ? "Plans for this goal are coming soon. Jump into the app now — you can enroll once they land." : "You're all set — jump into the app."}
          </Mono>
          <View style={{ marginTop: 14 }}>
            <Button label={enrolling ? "Setting up…" : "Continue to the app →"} onPress={finish} disabled={enrolling} />
          </View>
        </Card>
      ) : (
        <Mono style={{ marginTop: 12 }}>Pick a goal to see your recommended plan.</Mono>
      )}
    </Screen>
  );
}

function QuestionCard({
  q, index, answers, setAnswer, personaChoice,
}: {
  q: OnboardingQuestion;
  index: number;
  answers: Record<string, AnswerValue | null | undefined>;
  setAnswer: (key: string, value: AnswerValue) => void;
  personaChoice: "casual" | "athlete" | null;
}) {
  const C = useTheme().palette;
  const kicker = q.kind === "persona" ? q.title : `${index + 1} · ${q.title}`;

  if (q.kind === "persona") {
    const selected = (answers[q.key] as string) ?? personaChoice;
    return (
      <Card style={{ marginTop: 14, borderLeftWidth: 3, borderLeftColor: C.lime }}>
        <Kicker color={C.lime}>{q.title}</Kicker>
        <View style={{ gap: space.sm, marginTop: 10 }}>
          {(q.choices ?? []).map((o) => {
            const active = selected === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => { setAnswer(q.key, o.value); if (o.value === "casual" || o.value === "athlete") setClientPersona(o.value); }}
                style={{ borderWidth: 1, borderColor: active ? C.lime : C.line, backgroundColor: active ? `${C.lime}14` : "transparent", borderRadius: 12, padding: 12 }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: active ? txt(C, C.lime) : C.chalk }}>{o.label}</Text>
                {o.blurb && <Mono style={{ marginTop: 2, fontSize: fs.micro, lineHeight: 16 }}>{o.blurb}</Mono>}
              </Pressable>
            );
          })}
        </View>
        {q.subtitle && <Mono color={C.ash} style={{ marginTop: 10, fontSize: fs.nano, lineHeight: 14 }}>{q.subtitle}</Mono>}
      </Card>
    );
  }

  if (q.kind === "goal") {
    const selected = answers[q.key] as string | undefined;
    return (
      <Card style={{ marginTop: 14 }}>
        <Kicker color={C.lime}>{kicker}</Kicker>
        {ONBOARDING_GOAL_GROUPS.map((group) => (
          <View key={group.category} style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{group.category}</Text>
            <View style={{ marginTop: 6, gap: space.sm }}>
              {group.goals.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => setAnswer(q.key, g.id)}
                  style={{ borderWidth: 1, borderColor: selected === g.id ? C.lime : C.line, backgroundColor: selected === g.id ? `${C.lime}14` : "transparent", borderRadius: 12, padding: 12 }}
                >
                  <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: selected === g.id ? txt(C, C.lime) : C.chalk }}>{g.label}</Text>
                  <Mono style={{ marginTop: 2, fontSize: fs.micro }}>{g.blurb}</Mono>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </Card>
    );
  }

  if (q.kind === "number") {
    const min = q.min ?? 1, max = q.max ?? 7, step = q.step ?? 1;
    const value = Number(answers[q.key] ?? q.defaultValue ?? min);
    return (
      <Card>
        <Kicker color={C.lime}>{kicker}</Kicker>
        {q.subtitle && <Mono color={C.ash} style={{ marginTop: 2, fontSize: fs.nano }}>{q.subtitle}</Mono>}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <Step label="−" onPress={() => setAnswer(q.key, Math.max(min, value - step))} />
          <Text style={{ fontFamily: F.black, fontSize: 28, color: C.chalk }}>{value}×</Text>
          <Step label="+" onPress={() => setAnswer(q.key, Math.min(max, value + step))} />
        </View>
      </Card>
    );
  }

  if (q.kind === "text") {
    // Free-text isn't core to onboarding; keep the surface simple by skipping the
    // keyboard control here — the web admin can still collect it on web.
    return null;
  }

  // single / multi
  const multi = q.kind === "multi";
  const current = answers[q.key];
  const selectedSet = new Set<string>(multi ? (Array.isArray(current) ? current.map(String) : current != null && current !== "" ? [String(current)] : []) : current != null ? [String(current)] : []);
  const toggle = (v: string) => {
    if (!multi) { setAnswer(q.key, v); return; }
    const arr = new Set(selectedSet);
    if (arr.has(v)) arr.delete(v); else arr.add(v);
    setAnswer(q.key, [...arr]);
  };
  return (
    <Card>
      <Kicker color={C.lime}>{kicker}</Kicker>
      {q.subtitle && <Mono color={C.ash} style={{ marginTop: 2, fontSize: fs.nano }}>{q.subtitle}</Mono>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 10 }}>
        {(q.choices ?? []).map((o) => {
          const on = selectedSet.has(o.value);
          return (
            <Pressable
              key={o.value}
              onPress={() => toggle(o.value)}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1a` : "transparent" }}
            >
              <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: on ? txt(C, C.lime) : C.ash }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
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
