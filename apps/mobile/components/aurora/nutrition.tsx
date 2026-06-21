import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import {
  todayNutrition,
  adaptiveTargets,
  estimateMaintenance,
  dailyNutrition,
  type NutritionGoal,
} from "@hybrid/core";
import { fetchSignals, createSignal, getAssignedDiet, type CoreSignal } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, ASegment, APill, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const GOALS: { id: NutritionGoal; labelKey: string }[] = [
  { id: "lose", labelKey: "w.recovery.nutrition.goalLose" },
  { id: "maintain", labelKey: "w.recovery.nutrition.goalMaintain" },
  { id: "gain", labelKey: "w.recovery.nutrition.goalGain" },
];

/** AURORA Nutrition — the macro tracker in the rounded Figma layout, reusing the
 *  exact adaptive-targets engine + manual-macro Signal logging as the classic. */
export default function AuroraNutrition() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [goal, setGoal] = useState<NutritionGoal>("maintain");
  const [f, setF] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const [saving, setSaving] = useState(false);
  const [coachDiet, setCoachDiet] = useState<{ diet: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; note: string | null } | null; coachName?: string } | null>(null);
  useEffect(() => { getAssignedDiet().then(setCoachDiet).catch(() => {}); }, []);

  const load = () => {
    setRefreshing(true);
    fetchSignals().then(setSignals as (s: CoreSignal[]) => void).finally(() => setRefreshing(false));
  };
  useEffect(load, []);

  const sig = signals as unknown as Parameters<typeof todayNutrition>[0];
  const today = useMemo(() => todayNutrition(sig), [signals]);
  const targets = useMemo(() => adaptiveTargets(sig, { goal }), [signals, goal]);
  const maint = useMemo(() => estimateMaintenance(sig, {}), [signals]);
  const recent = useMemo(() => dailyNutrition(sig).slice(0, 7), [signals]);
  const personalized = maint.kcal != null;

  const add = async () => {
    setSaving(true);
    const jobs: Promise<boolean>[] = [];
    const push = (k: string, v: string, unit: string) => {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n > 0) jobs.push(createSignal(k, n, unit));
    };
    push("energyIntake", f.kcal, "kcal");
    push("protein", f.protein, "g");
    push("carbs", f.carbs, "g");
    push("fat", f.fat, "g");
    const results = await Promise.all(jobs);
    if (results.includes(false)) Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody"));
    else setF({ kcal: "", protein: "", carbs: "", fat: "" });
    setSaving(false);
    load();
  };

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: fs.display }}>{t("w.recovery.nutrition.title")}</AHeading>
      </View>

      <View style={{ marginTop: 16 }}>
        <ASegment options={GOALS.map((g) => ({ id: g.id, label: t(g.labelKey) }))} value={goal} onPick={setGoal} />
      </View>

      {coachDiet?.diet && (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.violet) }}>
            {t("w.recovery.nutrition.assignedBy")} {coachDiet.coachName ?? t("w.recovery.nutrition.yourCoach")} · {t("w.recovery.nutrition.readOnly")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 8 }}>
            {([["w.recovery.nutrition.energy", coachDiet.diet.kcal, " kcal"], ["w.recovery.nutrition.protein", coachDiet.diet.protein, "g"], ["w.recovery.nutrition.carbs", coachDiet.diet.carbs, "g"], ["w.recovery.nutrition.fat", coachDiet.diet.fat, "g"]] as const).map(
              ([label, val, unit]) => (val != null ? (
                <View key={label}>
                  <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{val}{unit === "g" ? "g" : ""}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t(label)}{unit === " kcal" ? " · kcal" : ""}</Text>
                </View>
              ) : null),
            )}
          </View>
          {coachDiet.diet.note ? <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 8, lineHeight: 18 }}>{coachDiet.diet.note}</Text> : null}
        </ACard>
      )}

      {personalized ? (
        <>
          {/* Calories hero */}
          <ACard style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.calories")}</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: 6 }}>
              <Text style={{ fontFamily: F.black, fontSize: 40, color: C.chalk }}>{Math.round(today.kcal)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>/ {targets.kcal}</Text>
            </View>
            <Bar cur={today.kcal} target={targets.kcal} color={C.lime} />
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10 }}>{t("w.recovery.nutrition.maintenance")} ≈ {maint.kcal} kcal · {targets.basis}</Text>
          </ACard>

          <MacroRow labelKey="w.recovery.nutrition.protein" cur={today.protein} target={targets.protein} color={C.blue} />
          <MacroRow labelKey="w.recovery.nutrition.carbs" cur={today.carbs} target={targets.carbs} color={C.amber} />
          <MacroRow labelKey="w.recovery.nutrition.fat" cur={today.fat} target={targets.fat} color={C.violet} />
        </>
      ) : (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.todayVsTarget")}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, marginTop: 10, lineHeight: 20 }}>
            {t("w.recovery.nutrition.adaptBody")}
          </Text>
          <View style={{ flexDirection: "row", gap: space.lg, marginTop: 14 }}>
            {[[t("w.recovery.nutrition.loggedToday"), `${Math.round(today.kcal)} kcal`], [t("w.recovery.nutrition.protein"), `${Math.round(today.protein)}g`], [t("w.recovery.nutrition.carbs"), `${Math.round(today.carbs)}g`], [t("w.recovery.nutrition.fat"), `${Math.round(today.fat)}g`]].map(([l, v]) => (
              <View key={l}><Text style={{ fontFamily: F.black, fontSize: 17, color: C.chalk }}>{v}</Text><Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{l}</Text></View>
            ))}
          </View>
        </ACard>
      )}

      {/* Add to today */}
      <ACard style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <AuroraIcon name="add" size={20} color={txt(C, C.violet)} />
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.addToToday")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12 }}>
          <Cell value={f.kcal} onChange={(v) => setF((s) => ({ ...s, kcal: v }))} ph="kcal" />
          <Cell value={f.protein} onChange={(v) => setF((s) => ({ ...s, protein: v }))} ph={t("w.recovery.nutrition.proteinPh")} />
          <Cell value={f.carbs} onChange={(v) => setF((s) => ({ ...s, carbs: v }))} ph={t("w.recovery.nutrition.carbsPh")} />
          <Cell value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} ph={t("w.recovery.nutrition.fatPh")} />
        </View>
        <APill label={saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.add")} onPress={add} disabled={saving} style={{ marginTop: 14 }} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10, lineHeight: 16 }}>
          {t("w.recovery.nutrition.foodSearchNote")}
        </Text>
      </ACard>

      {/* Recent */}
      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>{t("w.recovery.nutrition.recentDays")}</Text>
        <View style={{ marginTop: 8 }}>
          {recent.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.recovery.nutrition.recentEmpty")}</Text>
          ) : recent.map((d, i) => (
            <View key={d.date} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{d.date.slice(5)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{Math.round(d.kcal)} kcal</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{Math.round(d.protein)}p · {Math.round(d.carbs)}c · {Math.round(d.fat)}f</Text>
            </View>
          ))}
        </View>
      </ACard>
    </AuroraScreen>
  );
}

function Bar({ cur, target, color }: { cur: number; target: number; color: string }) {
  const { palette: C } = useTheme();
  const pct = target > 0 ? Math.min(1, cur / target) : 0;
  const over = cur > target * 1.05;
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: C.ink, overflow: "hidden", marginTop: 8 }}>
      <View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: over ? C.red : color }} />
    </View>
  );
}

function MacroRow({ labelKey, cur, target, color }: { labelKey: string; cur: number; target: number; color: string }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, padding: 16, marginTop: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t(labelKey)}</Text>
        <Bar cur={cur} target={target} color={color} />
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginLeft: 14 }}>{Math.round(cur)}/{target}g</Text>
    </View>
  );
}

function Cell({ value, onChange, ph }: { value: string; onChange: (v: string) => void; ph: string }) {
  const { palette: C } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={ph}
      placeholderTextColor={C.ash}
      keyboardType="numeric"
      style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 8, paddingVertical: 11, textAlign: "center" }}
    />
  );
}
