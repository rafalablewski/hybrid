import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  todayNutrition,
  adaptiveTargets,
  estimateMaintenance,
  dailyNutrition,
  type NutritionGoal,
} from "@hybrid/core";
import { fetchSignals, createSignal, getAssignedDiet, type CoreSignal } from "../lib/api";
import { fs, space, Screen, Card, Kicker, Mono, Button, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraNutrition from "../components/aurora/nutrition";

const GOALS: { id: NutritionGoal; label: string }[] = [
  { id: "lose", label: "Lose" },
  { id: "maintain", label: "Maintain" },
  { id: "gain", label: "Gain" },
];

export default function Nutrition() {
  if (useTemplate().template === "aurora") return <AuroraNutrition />;
  return <ClassicNutrition />;
}

function ClassicNutrition() {
  const C = useTheme().palette;
  const router = useRouter();
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [goal, setGoal] = useState<NutritionGoal>("maintain");
  const [f, setF] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const [saving, setSaving] = useState(false);
  // Read-only diet assigned by an active coach (shown above the adaptive targets).
  const [coachDiet, setCoachDiet] = useState<{ diet: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; note: string | null } | null; coachName?: string } | null>(null);
  useEffect(() => { getAssignedDiet().then(setCoachDiet).catch(() => {}); }, []);

  const load = () => {
    setRefreshing(true);
    fetchSignals().then(setSignals as (s: CoreSignal[]) => void).finally(() => setRefreshing(false));
  };
  useFocusEffect(useCallback(load, []));

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
        <Text onPress={() => router.back()} style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>← back</Text>
      </View>

      {/* goal */}
      <View style={{ flexDirection: "row", gap: space.xs, marginTop: 10, marginBottom: 4 }}>
        {GOALS.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => setGoal(g.id)}
            style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: goal === g.id ? C.lime : C.line, backgroundColor: goal === g.id ? `${C.lime}1a` : "transparent" }}
          >
            <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: goal === g.id ? txt(C, C.lime) : C.ash }}>{g.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Coach-assigned diet (read-only) */}
      {coachDiet?.diet && (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet, marginTop: 10 }}>
          <Kicker color={C.violet}>Assigned by {coachDiet.coachName ?? "your coach"} · read-only</Kicker>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 8 }}>
            {([["Energy", coachDiet.diet.kcal, " kcal"], ["Protein", coachDiet.diet.protein, "g"], ["Carbs", coachDiet.diet.carbs, "g"], ["Fat", coachDiet.diet.fat, "g"]] as const).map(
              ([label, val, unit]) => (val != null ? (
                <View key={label}>
                  <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{val}{unit === "g" ? "g" : ""}</Text>
                  <Mono color={C.ash} style={{ fontSize: fs.nano }}>{label}{unit === " kcal" ? " · kcal" : ""}</Mono>
                </View>
              ) : null),
            )}
          </View>
          {coachDiet.diet.note ? <Mono style={{ marginTop: 8, lineHeight: 18 }}>{coachDiet.diet.note}</Mono> : null}
        </Card>
      )}

      {/* targets vs today */}
      <Card>
        <Kicker color={C.lime}>Today vs adaptive target</Kicker>
        {personalized ? (
          <>
            <View style={{ marginTop: 10, gap: space.ms }}>
              <Bar label="Energy" cur={today.kcal} target={targets.kcal} unit="kcal" color={C.lime} />
              <Bar label="Protein" cur={today.protein} target={targets.protein} unit="g" color={C.violet} />
              <Bar label="Carbs" cur={today.carbs} target={targets.carbs} unit="g" color={C.blue} />
              <Bar label="Fat" cur={today.fat} target={targets.fat} unit="g" color={C.amber} />
            </View>
            <Mono style={{ marginTop: 12, fontSize: fs.micro, lineHeight: 17 }}>
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
            <View style={{ flexDirection: "row", gap: space.lg, marginTop: 12 }}>
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
        <View style={{ flexDirection: "row", gap: space.xs, marginTop: 10 }}>
          <Cell value={f.kcal} onChange={(v) => setF((s) => ({ ...s, kcal: v }))} ph="kcal" />
          <Cell value={f.protein} onChange={(v) => setF((s) => ({ ...s, protein: v }))} ph="protein" />
          <Cell value={f.carbs} onChange={(v) => setF((s) => ({ ...s, carbs: v }))} ph="carbs" />
          <Cell value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} ph="fat" />
        </View>
        <View style={{ marginTop: 12 }}>
          <Button label={saving ? "Adding…" : "Add"} onPress={add} disabled={saving} />
        </View>
        <Mono style={{ marginTop: 8, fontSize: fs.micro }}>
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
        <Mono color={C.chalk} style={{ fontSize: fs.caption }}>{label}</Mono>
        <Mono style={{ fontSize: fs.caption }}>{Math.round(cur)} / {target} {unit}</Mono>
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
      <Mono style={{ fontSize: fs.nano }}>{label}</Mono>
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
      style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8 }}
    />
  );
}
