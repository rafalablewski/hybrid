import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { todayNutrition, adaptiveTargets } from "@hybrid/core";
import { fetchCheckins } from "../../lib/api";
import { useSignalsQuery } from "../../lib/queries";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, serifIf } from "../../lib/ui";
import { RADIUS } from "./kit";

/**
 * AURORA Today widgets (mobile) — the daily check-in + nutrition as two SQUARE,
 * iPhone-home-screen-style widgets side by side. Each shows a glanceable state
 * and opens the full Check-in / Nutrition screen on tap (logging lives there, so
 * the widgets stay small and scannable). Mirrors the web today-quick.tsx.
 */
export default function TodayWidgets() {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { data: signals = [] } = useSignalsQuery();
  const [checkedToday, setCheckedToday] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchCheckins().then((cs) => {
      if (!alive) return;
      const today = new Date().toDateString();
      setCheckedToday(cs.some((c) => new Date(c.weekOf).toDateString() === today));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const sig = signals as unknown as Parameters<typeof todayNutrition>[0];
  const today = useMemo(() => todayNutrition(sig), [signals]);
  const targets = useMemo(() => adaptiveTargets(sig, { goal: "maintain" }), [signals]);
  const kcalPct = targets.kcal > 0 ? Math.min(1, today.kcal / targets.kcal) : 0;

  // FEEL section → blue accents (the spectrum's Feel band), clean & icon-free.
  const cardStyle = { flex: 1, aspectRatio: 1, borderRadius: 26, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, padding: 18, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const;
  const lbl = { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase" as const, color: txt(C, C.blue) };

  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      {/* CHECK-IN */}
      <Pressable onPress={() => router.push("/checkin")} style={cardStyle}>
        <Text style={lbl}>{t("w.home.today.w.checkin")}</Text>
        <Text style={{ fontFamily: F.black, fontSize: checkedToday ? 22 : 18, color: C.chalk, marginTop: 8, lineHeight: checkedToday ? 26 : 22 }}>
          {checkedToday ? t("w.home.today.w.checkinDone") : t("w.home.today.w.checkinPrompt")}
        </Text>
        <View style={{ marginTop: "auto", borderRadius: RADIUS.pill, alignItems: "center", paddingVertical: 11, backgroundColor: checkedToday ? "transparent" : C.blue, borderWidth: checkedToday ? 1 : 0, borderColor: C.line }}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: checkedToday ? C.ash : "#fff" }}>{checkedToday ? t("w.home.today.w.view") : t("w.home.today.w.logReadiness")}</Text>
        </View>
      </Pressable>

      {/* NUTRITION */}
      <Pressable onPress={() => router.push("/nutrition")} style={cardStyle}>
        <Text style={lbl}>{t("w.home.today.w.nutrition")}</Text>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 26, color: C.chalk, marginTop: 6 }}>
          {Math.round(today.kcal).toLocaleString()}
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}> / {targets.kcal.toLocaleString()}</Text>
        </Text>
        <View style={{ height: 7, borderRadius: 4, backgroundColor: C.ink, overflow: "hidden", marginTop: 8 }}>
          <View style={{ width: `${kcalPct * 100}%`, height: 7, backgroundColor: today.kcal > targets.kcal * 1.05 ? C.red : C.blue }} />
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 8 }}>
          P <Text style={{ fontFamily: F.bold, color: C.chalk }}>{Math.round(today.protein)}g</Text>  C <Text style={{ fontFamily: F.bold, color: C.chalk }}>{Math.round(today.carbs)}g</Text>  F <Text style={{ fontFamily: F.bold, color: C.chalk }}>{Math.round(today.fat)}g</Text>
        </Text>
        <View style={{ marginTop: "auto", borderRadius: RADIUS.pill, alignItems: "center", paddingVertical: 11, borderWidth: 1, borderColor: C.line }}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.chalk }}>{t("w.home.today.w.addMeal")}</Text>
        </View>
      </Pressable>
    </View>
  );
}
