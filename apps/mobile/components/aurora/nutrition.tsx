import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  todayNutrition,
  adaptiveTargets,
  estimateMaintenance,
  dailyNutrition,
  isFullAccess,
  MEAL_PRESETS,
  mealPresetSignals,
  type NutritionGoal,
  type MealPreset,
} from "@hybrid/core";
import { createSignal, getAssignedDiet, scanNutritionLabel } from "../../lib/api";
import { useSignalsQuery, useRevalidate } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { usePersona } from "../../lib/persona";
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
 *  exact adaptive-targets engine + manual-macro Signal logging as the classic.
 *  `compact` renders the focused "Add a meal" quick-add (the Today Nutrition
 *  sheet): today-vs-target header, a manual name+kcal add, and the premade-meals
 *  grid — the full tracker (goal, macro bars, weight trend, history) stays on the
 *  screen. `onNavigateFull` deep-links from the sheet to that full tracker. */
export default function AuroraNutrition({ compact = false, onNavigateFull, onUpgrade }: { compact?: boolean; onNavigateFull?: () => void; onUpgrade?: () => void } = {}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  // Free (casual) users log macros manually; scanning a label and saving
  // meals/products is a Full feature (see canScanFoodLabel / canSaveMealsAndProducts).
  const full = isFullAccess(usePersona());
  const { data: signals = [], isFetching: refreshing, refetch } = useSignalsQuery();
  const revalidate = useRevalidate();
  const [goal, setGoal] = useState<NutritionGoal>("maintain");
  const [f, setF] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  // Signal kinds already logged for the meal being entered — survives a partial
  // failure so a retry doesn't duplicate the kinds that already succeeded.
  const loggedKinds = useRef<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mealMsg, setMealMsg] = useState("");
  const [coachDiet, setCoachDiet] = useState<{ diet: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; note: string | null } | null; coachName?: string } | null>(null);
  useEffect(() => { getAssignedDiet().then(setCoachDiet).catch(() => {}); }, []);

  const load = () => refetch();
  useRefreshOnFocus(refetch);

  const sig = signals as unknown as Parameters<typeof todayNutrition>[0];
  const today = useMemo(() => todayNutrition(sig), [signals]);
  const targets = useMemo(() => adaptiveTargets(sig, { goal }), [signals, goal]);
  const maint = useMemo(() => estimateMaintenance(sig, {}), [signals]);
  const recent = useMemo(() => dailyNutrition(sig).slice(0, 7), [signals]);
  const personalized = maint.kcal != null;

  const add = async () => {
    setSaving(true);
    setMealMsg("");
    // One unified entry: kcal + macros. When kcal is left blank, derive it from
    // the macros (4·4·9) so the calorie total always moves — mirrors how a preset
    // stores an explicit kcal alongside its macros.
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const protein = num(f.protein), carbs = num(f.carbs), fat = num(f.fat);
    const kcal = num(f.kcal) || protein * 4 + carbs * 4 + fat * 9;
    // Post one signal per macro, remembering which kinds already landed
    // (loggedKinds) so a retry after a partial failure re-sends ONLY the failed
    // kinds and never double-logs. Reset once the whole meal is in.
    const jobs = ([["energyIntake", kcal, "kcal"], ["protein", protein, "g"], ["carbs", carbs, "g"], ["fat", fat, "g"]] as [string, number, string][])
      .filter(([kind, value]) => value > 0 && !loggedKinds.current.has(kind));
    if (!jobs.length) { setSaving(false); return; }
    let failed = false;
    for (const [kind, value, unit] of jobs) {
      if (!(await createSignal(kind, value, unit))) { failed = true; break; }
      loggedKinds.current.add(kind);
    }
    if (failed) Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody"));
    else { setF({ kcal: "", protein: "", carbs: "", fat: "" }); setMealMsg(`+${Math.round(kcal)} kcal`); loggedKinds.current = new Set(); }
    setSaving(false);
    revalidate.recovery();
  };

  // Premade meal → one signal per macro (SAME kinds as the manual add). Free
  // users can't log presets (Full-only, per access.canSaveMealsAndProducts) —
  // a tap routes to the upgrade screen instead. Manual entry above stays free.
  const logPreset = async (p: MealPreset) => {
    if (!full) { router.push("/upgrade"); return; }
    setMealMsg("");
    const ok = await Promise.all(mealPresetSignals(p).map((s) => createSignal(s.kind, s.value, s.unit)));
    if (ok.includes(false)) { Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
    setMealMsg(`${t(p.labelKey)} · +${p.kcal} kcal`);
    revalidate.recovery();
  };

  // Scan a nutrition label (Full) — pick a photo, send it to the AI vision
  // endpoint, and prefill the macro fields. Free users are routed to upgrade.
  const scan = async () => {
    if (scanning) return;
    if (!full) { onUpgrade?.(); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6 });
    const asset = res.canceled ? null : res.assets?.[0];
    if (!asset?.base64) return;
    setScanning(true);
    const out = await scanNutritionLabel(asset.base64, asset.mimeType ?? "image/jpeg");
    setScanning(false);
    if (!out.ok || !out.data) { Alert.alert(t("w.recovery.nutrition.scanLabel"), t("w.recovery.nutrition.scanFailed")); return; }
    const d = out.data;
    setF({ kcal: d.kcal != null ? String(d.kcal) : "", protein: d.protein != null ? String(d.protein) : "", carbs: d.carbs != null ? String(d.carbs) : "", fat: d.fat != null ? String(d.fat) : "" });
  };

  // The Today "Nutrition" sheet — a focused Add-a-meal, not the whole tracker.
  if (compact) {
    return (
      <View>
        <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: -0.4, color: C.chalk }}>{t("w.recovery.nutrition.addMealTitle")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 4 }}>{Math.round(today.kcal)} / {targets.kcal} {t("w.recovery.nutrition.kcalToday")}</Text>

        <CDivider label={t("w.recovery.nutrition.logManuallyFree")} />
        {/* Quadrant — kcal + protein + carbs + fat, one unified entry */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <QuadTile field="kcal" label={t("w.recovery.nutrition.tabCalories")} unit="kcal" color={C.chalk} max={1000} value={f.kcal} onChange={(v) => setF((s) => ({ ...s, kcal: v }))} />
          <QuadTile field="protein" label={t("w.recovery.nutrition.protein")} unit="g" color={C.lime} max={60} value={f.protein} onChange={(v) => setF((s) => ({ ...s, protein: v }))} />
          <QuadTile field="carbs" label={t("w.recovery.nutrition.carbs")} unit="g" color={C.blue} max={120} value={f.carbs} onChange={(v) => setF((s) => ({ ...s, carbs: v }))} />
          <QuadTile field="fat" label={t("w.recovery.nutrition.fat")} unit="g" color={C.amber} max={50} value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} />
        </View>
        {(() => {
          const macroKcal = Math.round((parseFloat(f.protein) || 0) * 4 + (parseFloat(f.carbs) || 0) * 4 + (parseFloat(f.fat) || 0) * 9);
          return macroKcal > 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 12 }}>{t("w.recovery.nutrition.macrosApprox")} {macroKcal} kcal</Text> : null;
        })()}
        <APill label={saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.addMeal")} onPress={add} disabled={saving} style={{ marginTop: 12 }} />
        {/* Scan label — AI vision, Full only (free → upgrade) */}
        <Pressable onPress={scan} disabled={scanning} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.scanLabel")} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: full ? C.line : `${C.violet}3d`, backgroundColor: full ? "transparent" : `${C.violet}12`, opacity: scanning ? 0.6 : 1 }}>
          <Text style={{ fontSize: 15 }}>{full ? "📷" : "🔒"}</Text>
          <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: full ? C.chalk : txt(C, C.violet) }}>{scanning ? t("w.recovery.nutrition.scanning") : `${t("w.recovery.nutrition.scanLabel")}${full ? "" : " · Full"}`}</Text>
        </Pressable>
        {mealMsg ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime), marginTop: 10 }}>✓ {mealMsg}</Text> : null}

        <CDivider label={t("w.recovery.nutrition.premadeMealsFull")} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {MEAL_PRESETS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => (!full && onUpgrade ? onUpgrade() : logPreset(p))}
              accessibilityRole="button"
              accessibilityLabel={t(p.labelKey)}
              style={{ flexGrow: 1, flexBasis: "45%", backgroundColor: full ? C.ink2 : `${C.violet}12`, borderWidth: 1, borderColor: full ? C.line : `${C.violet}3d`, borderRadius: 16, padding: 14, opacity: full ? 1 : 0.9 }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 22 }}>{p.emoji}</Text>
                {!full && <Text style={{ fontSize: 12 }}>🔒</Text>}
              </View>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, marginTop: 8 }}>{t(p.labelKey).split(" · ")[0]}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 3 }}>~{p.kcal} kcal</Text>
            </Pressable>
          ))}
        </View>

        {onNavigateFull ? (
          <Pressable onPress={onNavigateFull} style={{ marginTop: 16, alignSelf: "center" }} hitSlop={6}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.recovery.nutrition.fullTracker")} →</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const body = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.back")} onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: fs.display }}>{t("w.recovery.nutrition.title")}</AHeading>
      </View>

      <View style={{ marginTop: 16 }}>
        <ASegment options={GOALS.map((g) => ({ id: g.id, label: t(g.labelKey) }))} value={goal} onPick={setGoal} />
      </View>

      {coachDiet?.diet && (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>
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
          <AuroraIcon name="add" size={20} color={txt(C, C.lime)} />
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.addToToday")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12 }}>
          <Cell value={f.kcal} onChange={(v) => setF((s) => ({ ...s, kcal: v }))} ph="kcal" />
          <Cell value={f.protein} onChange={(v) => setF((s) => ({ ...s, protein: v }))} ph={t("w.recovery.nutrition.proteinPh")} />
          <Cell value={f.carbs} onChange={(v) => setF((s) => ({ ...s, carbs: v }))} ph={t("w.recovery.nutrition.carbsPh")} />
          <Cell value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} ph={t("w.recovery.nutrition.fatPh")} />
        </View>
        <APill label={saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.add")} onPress={add} disabled={saving} style={{ marginTop: 14 }} />
        {/* QUICK MEALS — one-tap premade meals. Full users log on tap; free
            users see them LOCKED and a tap routes to upgrade (manual entry
            above stays free for everyone). */}
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.quickMeals")}</Text>
            {!full && (
              <View style={{ backgroundColor: `${C.violet}28`, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: txt(C, C.violet) }}>✦ FULL</Text>
              </View>
            )}
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, lineHeight: 16 }}>{full ? t("w.recovery.nutrition.quickMealsSub") : t("w.recovery.nutrition.quickMealsLocked")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {MEAL_PRESETS.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => logPreset(p)}
                accessibilityRole="button"
                accessibilityLabel={t(p.labelKey)}
                style={{ width: "47%", flexGrow: 1, backgroundColor: full ? C.ink : `${C.violet}14`, borderWidth: 1, borderColor: full ? C.line : `${C.violet}4d`, borderRadius: 15, padding: 13, opacity: full ? 1 : 0.85 }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 20 }}>{p.emoji}</Text>
                  {!full && <Text style={{ fontSize: 12 }}>🔒</Text>}
                </View>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, marginTop: 6 }}>{t(p.labelKey)}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3 }}>{p.kcal} kcal · {p.protein}p {p.carbs}c {p.fat}f</Text>
              </Pressable>
            ))}
          </View>
          {mealMsg ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime), marginTop: 10 }}>✓ {t("w.recovery.nutrition.mealLogged")} — {mealMsg}</Text> : null}
        </View>
      </ACard>

      {/* Recent */}
      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.recovery.nutrition.recentDays")}</Text>
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
    </>
  );

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      {body}
    </AuroraScreen>
  );
}

// A labelled hairline divider ("──── LOG MANUALLY · FREE ────") for the compact
// Add-a-meal sheet.
function CDivider({ label }: { label: string }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.4, color: C.ash }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
    </View>
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

// One quadrant tile of the compact Add-a-meal entry: a labelled big-number
// field (kcal / protein / carbs / fat) with a colour dot and a fill line that
// grows toward a soft max as you type.
function QuadTile({ field, label, unit, color, max, value, onChange }: { field: string; label: string; unit: string; color: string; max: number; value: string; onChange: (v: string) => void }) {
  const { palette: C } = useTheme();
  const pct = Math.min(1, Math.max(0, parseFloat(value) || 0) / max);
  return (
    <View style={{ flexGrow: 1, flexBasis: "46%", backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, padding: 14, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: color }} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{label}</Text>
      </View>
      <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={`${label} (${unit})`} testID={`quad-${field}`} style={{ fontFamily: F.black, fontSize: 34, letterSpacing: -1, color: C.chalk, paddingVertical: 4, marginTop: 6 }} />
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{unit}</Text>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 10, overflow: "hidden" }}>
        <View style={{ width: `${pct * 100}%`, height: 4, backgroundColor: color }} />
      </View>
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
