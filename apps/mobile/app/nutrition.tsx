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
import { fetchSignals, createSignal, type CoreSignal } from "../lib/api";
import { Screen, Card, Kicker, Mono, Button, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

const GOALS: { id: NutritionGoal; label: string }[] = [
  { id: "lose", label: "Lose" },
  { id: "maintain", label: "Maintain" },
  { id: "gain", label: "Gain" },
];

export default function Nutrition() {
  const C = useTheme().palette;
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
  // Only show targets once maintenance can be estimated from the athlete's own
  // data (a weigh-in or intake history) — otherwise prompt instead of showing a
  // population default as a personal target.
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
    if (results.includes(false)) {
      Alert.alert("Couldn't save", "Some entries didn't save — check your connection / sign-in, then try again.");
    } else {
      setF({ kcal: "", protein: "", carbs: "", fat: "" });
    }
    setSaving(false);
    load();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Kicker>Nutrition · today</Kicker>
        <Text onPress={() => router.back()} style={{ fontFamily: F.mono, fontSize: 12, color: txt(C, C.lime) }}>← back</Text>
      </View>

      {/* goal */}
      <View style={{ flexDirection: "row", gap: 6, marginTop: 10, marginBottom: 4 }}>
        {GOALS.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => setGoal(g.id)}
            style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: goal === g.id ? C.lime : C.line, backgroundColor: goal === g.id ? `${C.lime}1a` : "transparent" }}
          >
            <Text style={{ fontFamily: F.semi, fontSize: 12, color: goal === g.id ? txt(C, C.lime) : C.ash }}>{g.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* targets vs today */}
      <Card>
        <Kicker color={C.lime}>Today vs adaptive target</Kicker>
        {personalized ? (
          <>
            <View style={{ marginTop: 10, gap: 10 }}>
              <Bar label="Energy" cur={today.kcal} target={targets.kcal} unit="kcal" color={C.lime} />
              <Bar label="Protein" cur={today.protein} target={targets.protein} unit="g" color={C.violet} />
              <Bar label="Carbs" cur={today.carbs} target={targets.carbs} unit="g" color={C.blue} />
              <Bar label="Fat" cur={today.fat} target={targets.fat} unit="g" color={C.amber} />
            </View>
            <Mono style={{ marginTop: 12, fontSize: 11, lineHeight: 17 }}>
              Maintenance ≈ {maint.kcal} kcal · {targets.basis}
            </Mono>
          </>
        ) : (
          <>
            <Mono color={C.chalk} style={{ marginTop: 10, lineHeight: 19 }}>
              Your targets adapt to you — they&apos;re not pre-set. Add a weigh-in (in a weekly
              check-in) and log a few days of intake, and we&apos;ll estimate your maintenance and set
              goal-aware macros.
            </Mono>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
              <Today2 label="Today" value={`${Math.round(today.kcal)} kcal`} />
              <Today2 label="Protein" value={`${Math.round(today.protein)}g`} />
              <Today2 label="Carbs" value={`${Math.round(today.carbs)}g`} />
              <Today2 label="Fat" value={`${Math.round(today.fat)}g`} />
            </View>
          </>
        )}
      </Card>

      {/* quick add */}
      <Card>
        <Kicker color={C.violet}>Add to today</Kicker>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
          <Cell value={f.kcal} onChange={(v) => setF((s) => ({ ...s, kcal: v }))} ph="kcal" />
          <Cell value={f.protein} onChange={(v) => setF((s) => ({ ...s, protein: v }))} ph="protein" />
          <Cell value={f.carbs} onChange={(v) => setF((s) => ({ ...s, carbs: v }))} ph="carbs" />
          <Cell value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} ph="fat" />
        </View>
        <View style={{ marginTop: 12 }}>
          <Button label={saving ? "Adding…" : "Add"} onPress={add} disabled={saving} />
        </View>
        <Mono style={{ marginTop: 8, fontSize: 11 }}>
          Manual macros (food search + barcode is a separate, blocked layer — see Capabilities).
        </Mono>
      </Card>

      {/* recent */}
      <Card>
        <Kicker color={C.blue}>Recent days</Kicker>
        <View style={{ marginTop: 8 }}>
          {recent.length === 0 ? (
            <Mono>Nothing logged yet.</Mono>
          ) : (
            recent.map((d, i) => (
              <View key={d.date} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <Mono color={C.chalk}>{d.date.slice(5)}</Mono>
                <Mono color={C.chalk}>{Math.round(d.kcal)} kcal</Mono>
                <Mono>{Math.round(d.protein)}p · {Math.round(d.carbs)}c · {Math.round(d.fat)}f</Mono>
              </View>
            ))
          )}
        </View>
      </Card>
    </Screen>
  );
}

function Bar({ label, cur, target, unit, color }: { label: string; cur: number; target: number; unit: string; color: string }) {
  const C = useTheme().palette;
  const pct = target > 0 ? Math.min(1, cur / target) : 0;
  const over = cur > target * 1.05;
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Mono color={C.chalk} style={{ fontSize: 12 }}>{label}</Mono>
        <Mono style={{ fontSize: 12 }}>{Math.round(cur)} / {target} {unit}</Mono>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: C.ink2, overflow: "hidden" }}>
        <View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: over ? C.red : color }} />
      </View>
    </View>
  );
}

function Today2({ label, value }: { label: string; value: string }) {
  const C = useTheme().palette;
  return (
    <View>
      <Text style={{ fontFamily: F.black, fontSize: 17, color: C.chalk }}>{value}</Text>
      <Mono style={{ fontSize: 10 }}>{label}</Mono>
    </View>
  );
}

function Cell({ value, onChange, ph }: { value: string; onChange: (v: string) => void; ph: string }) {
  const C = useTheme().palette;
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={ph}
      placeholderTextColor={C.ash}
      keyboardType="numeric"
      style={{ flex: 1, fontFamily: F.mono, fontSize: 13, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8 }}
    />
  );
}
