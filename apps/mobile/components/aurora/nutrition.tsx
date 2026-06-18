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
import { fetchSignals, createSignal, type CoreSignal } from "../../lib/api";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { AuroraScreen, ACard, ASegment, APill, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const GOALS: { id: NutritionGoal; label: string }[] = [
  { id: "lose", label: "Lose" },
  { id: "maintain", label: "Maintain" },
  { id: "gain", label: "Gain" },
];

/** AURORA Nutrition — the macro tracker in the rounded Figma layout, reusing the
 *  exact adaptive-targets engine + manual-macro Signal logging as the classic. */
export default function AuroraNutrition() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [goal, setGoal] = useState<NutritionGoal>("maintain");
  const [f, setF] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const [saving, setSaving] = useState(false);

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
    if (results.includes(false)) Alert.alert("Couldn't save", "Some entries didn't save — check your connection / sign-in, then try again.");
    else setF({ kcal: "", protein: "", carbs: "", fat: "" });
    setSaving(false);
    load();
  };

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: 26 }}>Nutrition</AHeading>
      </View>

      <View style={{ marginTop: 16 }}>
        <ASegment options={GOALS} value={goal} onPick={setGoal} />
      </View>

      {personalized ? (
        <>
          {/* Calories hero */}
          <ACard style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>Calories</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6 }}>
              <Text style={{ fontFamily: F.black, fontSize: 40, color: C.chalk }}>{Math.round(today.kcal)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>/ {targets.kcal}</Text>
            </View>
            <Bar cur={today.kcal} target={targets.kcal} color={C.lime} />
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 10 }}>Maintenance ≈ {maint.kcal} kcal · {targets.basis}</Text>
          </ACard>

          <MacroRow label="Protein" cur={today.protein} target={targets.protein} color={C.blue} />
          <MacroRow label="Carbs" cur={today.carbs} target={targets.carbs} color={C.amber} />
          <MacroRow label="Fat" cur={today.fat} target={targets.fat} color={C.violet} />
        </>
      ) : (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>Today vs adaptive target</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.chalk, marginTop: 10, lineHeight: 20 }}>
            Your targets adapt to you — add a weigh-in (in a weekly check-in) and log a few days of intake, and we&apos;ll estimate your maintenance and set goal-aware macros.
          </Text>
          <View style={{ flexDirection: "row", gap: 16, marginTop: 14 }}>
            {[["Today", `${Math.round(today.kcal)} kcal`], ["Protein", `${Math.round(today.protein)}g`], ["Carbs", `${Math.round(today.carbs)}g`], ["Fat", `${Math.round(today.fat)}g`]].map(([l, v]) => (
              <View key={l}><Text style={{ fontFamily: F.black, fontSize: 17, color: C.chalk }}>{v}</Text><Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}>{l}</Text></View>
            ))}
          </View>
        </ACard>
      )}

      {/* Add to today */}
      <ACard style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AuroraIcon name="add" size={20} color={txt(C, C.violet)} />
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>Add to today</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Cell value={f.kcal} onChange={(v) => setF((s) => ({ ...s, kcal: v }))} ph="kcal" />
          <Cell value={f.protein} onChange={(v) => setF((s) => ({ ...s, protein: v }))} ph="protein" />
          <Cell value={f.carbs} onChange={(v) => setF((s) => ({ ...s, carbs: v }))} ph="carbs" />
          <Cell value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} ph="fat" />
        </View>
        <APill label={saving ? "Adding…" : "Add"} onPress={add} disabled={saving} style={{ marginTop: 14 }} />
      </ACard>

      {/* Recent */}
      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>Recent days</Text>
        <View style={{ marginTop: 8 }}>
          {recent.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>Nothing logged yet.</Text>
          ) : recent.map((d, i) => (
            <View key={d.date} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.chalk }}>{d.date.slice(5)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.chalk }}>{Math.round(d.kcal)} kcal</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>{Math.round(d.protein)}p · {Math.round(d.carbs)}c · {Math.round(d.fat)}f</Text>
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

function MacroRow({ label, cur, target, color }: { label: string; cur: number; target: number; color: string }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, padding: 16, marginTop: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.chalk }}>{label}</Text>
        <Bar cur={cur} target={target} color={color} />
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginLeft: 14 }}>{Math.round(cur)}/{target}g</Text>
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
      style={{ flex: 1, fontFamily: F.mono, fontSize: 13, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 8, paddingVertical: 11, textAlign: "center" }}
    />
  );
}
