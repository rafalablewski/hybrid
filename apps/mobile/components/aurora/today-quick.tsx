import { useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { useRouter } from "expo-router";
import { createCheckin, createSignal } from "../../lib/api";
import { useRevalidate } from "../../lib/queries";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { ACard, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const RATINGS: { key: "energy" | "sleep" | "soreness" | "mood"; labelKey: string }[] = [
  { key: "energy", labelKey: "w.recovery.checkins.energy" },
  { key: "sleep", labelKey: "w.recovery.checkins.sleep" },
  { key: "soreness", labelKey: "w.recovery.checkins.soreness" },
  { key: "mood", labelKey: "w.recovery.checkins.mood" },
];

type SaveState = "idle" | "saving" | "saved";

/**
 * AURORA Today quick-log (mobile) — two swipeable widgets in a horizontal
 * snapping pager: a daily check-in (the four 1–5 readiness ratings) and a
 * nutrition quick-add (kcal + macros). Logging the day's readiness or food is a
 * single swipe from Today, no full Recovery screen needed. Posts to the SAME
 * createCheckin / createSignal helpers as the full screens and revalidates the
 * shared recovery cache. Mirrors the web today-quick.tsx 1:1.
 */
export default function TodayQuickLog() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const revalidate = useRevalidate();
  const { width } = useWindowDimensions();
  const cardW = width - 48; // 24px screen padding each side

  const [activeCard, setActiveCard] = useState(0);
  const onPagerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveCard(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, cardW + 12)));
  };

  // — Check-in widget —
  const [ratings, setRatings] = useState({ energy: 3, sleep: 3, soreness: 3, mood: 3 });
  const [ciState, setCiState] = useState<SaveState>("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveCheckin = async () => {
    setCiState("saving");
    const ok = await createCheckin({ weekOf: new Date().toISOString(), ...ratings });
    if (!ok) { setCiState("idle"); return; }
    setCiState("saved");
    revalidate.recovery();
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setCiState("idle"), 1800);
  };

  // — Nutrition widget —
  const [macros, setMacros] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const [nuState, setNuState] = useState<SaveState>("idle");
  const nuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addNutrition = async () => {
    setNuState("saving");
    const jobs: Promise<boolean>[] = [];
    const push = (k: string, v: string, unit: string) => {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n > 0) jobs.push(createSignal(k, n, unit));
    };
    push("energyIntake", macros.kcal, "kcal");
    push("protein", macros.protein, "g");
    push("carbs", macros.carbs, "g");
    push("fat", macros.fat, "g");
    if (jobs.length === 0) { setNuState("idle"); return; }
    const results = await Promise.all(jobs);
    if (results.includes(false)) { setNuState("idle"); return; }
    setMacros({ kcal: "", protein: "", carbs: "", fat: "" });
    setNuState("saved");
    revalidate.recovery();
    if (nuTimer.current) clearTimeout(nuTimer.current);
    nuTimer.current = setTimeout(() => setNuState("idle"), 1800);
  };

  const ctaBg = (st: SaveState) => (st === "saved" ? C.blue : C.lime);

  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 10 }}>{t("w.home.today.quick.eyebrow")}</Text>

      {/* CHECK-IN ⇄ NUTRITION — horizontal snapping pager (two columns) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardW + 12}
        decelerationRate="fast"
        onMomentumScrollEnd={onPagerScroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space.md, alignItems: "flex-start" }}
        style={{ marginHorizontal: -2 }}
      >
        {/* card 1 — daily check-in */}
        <ACard style={{ width: cardW }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.lime) }}>{t("w.home.today.quick.checkinTitle")}</Text>
            <AuroraIcon name="heart" size={18} color={txt(C, C.red)} />
          </View>
          <Text style={{ fontFamily: F.black, fontSize: 20, color: C.chalk, marginTop: 6 }}>{t("w.home.today.quick.checkinSub")}</Text>
          {RATINGS.map((r) => (
            <View key={r.key} style={{ marginTop: 12 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.ash }}>{t(r.labelKey)}</Text>
              <View style={{ flexDirection: "row", gap: space.xs, marginTop: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const sel = ratings[r.key] === n;
                  return (
                    <Pressable key={n} onPress={() => setRatings((s) => ({ ...s, [r.key]: n }))}
                      style={{ flex: 1, height: 38, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: sel ? C.lime : C.line, backgroundColor: sel ? C.lime : "transparent" }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: sel ? C.onAccent : C.ash }}>{n}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          <Pressable onPress={saveCheckin} disabled={ciState === "saving"} style={{ marginTop: 14, borderRadius: RADIUS.pill, paddingVertical: 13, alignItems: "center", backgroundColor: ctaBg(ciState), opacity: ciState === "saving" ? 0.6 : 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.onAccent }}>
              {ciState === "saving" ? t("w.home.today.quick.saving") : ciState === "saved" ? t("w.home.today.quick.saved") : t("w.home.today.quick.saveCheckin")}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push("/checkin")} style={{ marginTop: 10, alignItems: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("w.home.today.quick.openCheckin")}</Text>
          </Pressable>
        </ACard>

        {/* card 2 — nutrition quick-add */}
        <ACard style={{ width: cardW }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.violet) }}>{t("w.home.today.quick.nutritionTitle")}</Text>
            <AuroraIcon name="add" size={18} color={txt(C, C.violet)} />
          </View>
          <Text style={{ fontFamily: F.black, fontSize: 20, color: C.chalk, marginTop: 6 }}>{t("w.home.today.quick.nutritionSub")}</Text>
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: 14 }}>
            <Cell value={macros.kcal} onChange={(v) => setMacros((s) => ({ ...s, kcal: v }))} ph="kcal" />
            <Cell value={macros.protein} onChange={(v) => setMacros((s) => ({ ...s, protein: v }))} ph={t("w.recovery.nutrition.proteinPh")} />
            <Cell value={macros.carbs} onChange={(v) => setMacros((s) => ({ ...s, carbs: v }))} ph={t("w.recovery.nutrition.carbsPh")} />
            <Cell value={macros.fat} onChange={(v) => setMacros((s) => ({ ...s, fat: v }))} ph={t("w.recovery.nutrition.fatPh")} />
          </View>
          <Pressable onPress={addNutrition} disabled={nuState === "saving"} style={{ marginTop: 14, borderRadius: RADIUS.pill, paddingVertical: 13, alignItems: "center", backgroundColor: ctaBg(nuState), opacity: nuState === "saving" ? 0.6 : 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.onAccent }}>
              {nuState === "saving" ? t("w.home.today.quick.adding") : nuState === "saved" ? t("w.home.today.quick.added") : t("w.home.today.quick.add")}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push("/nutrition")} style={{ marginTop: 10, alignItems: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("w.home.today.quick.openNutrition")}</Text>
          </Pressable>
        </ACard>
      </ScrollView>

      {/* pager dots — a clear "there's a second widget to swipe" affordance */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 7, marginTop: 10 }}>
        {[0, 1].map((i) => (
          <View key={i} style={{ width: activeCard === i ? 20 : 7, height: 7, borderRadius: 999, backgroundColor: activeCard === i ? C.lime : C.line }} />
        ))}
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
