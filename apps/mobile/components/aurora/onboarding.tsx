import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import {
  ONBOARDING_GOAL_GROUPS,
  type OnboardingQuestion,

  ALPHA,} from "@hybrid/core";
import { useClientPersonaChoice, setClientPersona } from "../../lib/persona";
import { useOnboarding, finishOnboarding, type AnswerValue } from "../../lib/use-onboarding";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { leading, tracking, fs, space, F, PressScale as Pressable } from "../../lib/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import { APill, ASegment, AHeading, ASub, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import { withAlpha } from "./field";

/** AURORA onboarding — a stepped, rounded wizard now driven by the admin-editable
 *  question set: one question per step, then the recommended plan. */
export default function AuroraOnboarding() {
  const { palette } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { questions, answers, setAnswer, plan, loading } = useOnboarding();
  const persona = useClientPersonaChoice();
  const [idx, setIdx] = useState(0);
  const [enrolling, setEnrolling] = useState(false);

  const total = questions.length + 1;
  const onPlanStep = idx >= questions.length;
  const q = onPlanStep ? null : questions[idx]!;

  const finish = async () => {
    setEnrolling(true);
    try {
      await finishOnboarding(questions, answers, plan);
      router.replace("/(tabs)");
    } finally {
      setEnrolling(false);
    }
  };

  const next = () => { if (idx < total - 1) setIdx((i) => i + 1); else void finish(); };
  const back = () => (idx > 0 ? setIdx((i) => i - 1) : router.replace("/(tabs)"));

  const answered = (qq: OnboardingQuestion): boolean => {
    if (qq.kind === "persona") return !!(answers[qq.key] ?? persona);
    if (!qq.required) return true;
    const v = answers[qq.key];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  };
  const canNext = onPlanStep ? true : answered(q!);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink }} edges={["top", "bottom"]}>
      <View style={{ flex: 1, padding: 24 }}>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 8 }}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 5, borderRadius: RADIUS.mark, backgroundColor: i <= idx ? palette.lime : palette.line }} />
          ))}
        </View>
        <Pressable onPress={() => router.replace("/(tabs)")} style={{ alignSelf: "flex-end", marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: palette.ash }}>{t("w.account.onboarding.skip")}</Text>
        </Pressable>

        <ScrollView style={{ marginTop: 16 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {loading && questions.length === 0 ? (
            <ASub>{t("common.loading")}</ASub>
          ) : q ? (
            <Step title={q.title} sub={q.subtitle}>
              <QuestionBody q={q} answers={answers} setAnswer={setAnswer} personaChoice={persona} />
            </Step>
          ) : (
            <Step title={t("w.account.onboarding.plan-title")} sub={plan ? undefined : t("w.account.onboarding.plan-sub")}>
              {plan ? (
                <View style={{ backgroundColor: palette.ink2, borderColor: palette.line, borderWidth: 1, borderRadius: RADIUS.card, padding: 20 }}>
                  <Text style={{ fontFamily: F.black, fontSize: fs.headline, color: palette.chalk }}>{plan.planName}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: palette.ash, marginTop: 4 }}>{plan.goalLabel} – {plan.weeklyTarget}×/{t("w.train.periodize.wk")} – {plan.weeks} {t("w.account.onboarding.weeks")}</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: palette.chalk, marginTop: 12, lineHeight: leading(fs.bodyLg) }}>{plan.why}</Text>
                </View>
              ) : (
                <ASub>{t("w.account.onboarding.no-plan")}</ASub>
              )}
            </Step>
          )}
        </ScrollView>

        <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.back")} onPress={back} style={{ width: 64, height: 56, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }}>
            <AuroraIcon name="back" size={20} color={palette.chalk} />
          </Pressable>
          <APill
            label={onPlanStep ? (enrolling ? t("w.account.onboarding.setting-up") : plan ? t("w.account.onboarding.start-plan") : t("w.account.onboarding.continue")) : t("w.account.onboarding.next")}
            onPress={next}
            disabled={!canNext || enrolling}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </SafeAreaView>
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
          <Choice key={o.value} active={selected === o.value} title={o.label} sub={o.blurb ?? ""} onPress={() => { setAnswer(q.key, o.value); if (o.value === "casual" || o.value === "athlete") setClientPersona(o.value); }} />
        ))}
      </>
    );
  }

  if (q.kind === "goal") {
    const selected = answers[q.key] as string | undefined;
    return (
      <>
        {ONBOARDING_GOAL_GROUPS.map((group) => (
          <View key={group.category} style={{ marginTop: 4 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, marginTop: 12, marginBottom: 6 }}>{group.category}</Text>
            {group.goals.map((g) => (
              <Choice key={g.id} active={selected === g.id} title={g.label} sub={g.blurb} onPress={() => setAnswer(q.key, g.id)} />
            ))}
          </View>
        ))}
      </>
    );
  }

  if (q.kind === "number") {
    const min = q.min ?? 1, max = q.max ?? 7, step = q.step ?? 1;
    const value = Number(answers[q.key] ?? q.defaultValue ?? min);
    const opts: number[] = [];
    for (let v = min; v <= max; v += step) opts.push(v);
    return <ASegment options={opts.map((d) => ({ id: String(d), label: `${d}×` }))} value={String(value)} onPick={(v) => setAnswer(q.key, Number(v))} />;
  }

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
          const toggle = () => { const arr = new Set(selectedSet); if (arr.has(o.value)) arr.delete(o.value); else arr.add(o.value); setAnswer(q.key, [...arr]); };
          return <Choice key={o.value} active={on} title={o.label} sub={o.blurb ?? ""} onPress={toggle} />;
        })}
      </>
    );
  }
  return <ASegment options={(q.choices ?? []).map((o) => ({ id: o.value, label: o.label }))} value={String(current ?? "")} onPick={(v) => setAnswer(q.key, v)} />;
}

function Step({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View>
      <AHeading>{title}</AHeading>
      {!!sub && <ASub style={{ marginTop: 8 }}>{sub}</ASub>}
      <View style={{ marginTop: 20, gap: space.ms }}>{children}</View>
    </View>
  );
}

function Choice({ active, title, sub, onPress }: { active: boolean; title: string; sub: string; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: space.md, borderWidth: 1, borderColor: active ? palette.lime : palette.line, backgroundColor: active ? withAlpha(palette.lime, ALPHA.wash) : palette.ink2, borderRadius: RADIUS.field, padding: 16 }}
    >
      {active && <AuroraIcon name="check" size={22} color={txt(palette, palette.lime)} />}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: active ? txt(palette, palette.lime) : palette.chalk }}>{title}</Text>
        {!!sub && <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: palette.ash, marginTop: 3, lineHeight: leading(fs.caption) }}>{sub}</Text>}
      </View>
    </Pressable>
  );
}
