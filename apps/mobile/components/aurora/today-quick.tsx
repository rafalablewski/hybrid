import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { todayNutrition, adaptiveTargets } from "@hybrid/core";
import { fetchCheckins } from "../../lib/api";
import { useSignalsQuery } from "../../lib/queries";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F } from "../../lib/ui";
import { RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

/**
 * AURORA Today widgets (mobile) — the daily check-in + nutrition as two SQUARE,
 * iPhone-home-screen-style widgets side by side. Each shows a glanceable state
 * and opens the full Check-in / Nutrition screen on tap (logging lives there, so
 * the widgets stay small and scannable). Mirrors the web today-quick.tsx.
 */
export default function TodayWidgets() {
  const { palette: C } = useTheme();
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
  const hasNutrition = today.kcal > 0;

  const cardStyle = { flex: 1, aspectRatio: 1, borderRadius: 26, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, padding: 16, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const;

  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      {/* CHECK-IN */}
      <Pressable onPress={() => router.push("/checkin")} style={cardStyle}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: `${C.lime}24` }}>
            <AuroraIcon name="heart" size={16} color={txt(C, C.lime)} />
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: C.ash }}>{checkedToday ? t("w.home.today.w.done") : t("w.home.today.w.tapLog")}</Text>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", color: C.ash, marginTop: 12 }}>{t("w.home.today.w.checkin")}</Text>
        <Text style={{ fontFamily: F.black, fontSize: checkedToday ? 22 : 18, color: C.chalk, marginTop: 6, lineHeight: checkedToday ? 26 : 22 }}>
          {checkedToday ? t("w.home.today.w.checkinDone") : t("w.home.today.w.checkinPrompt")}
        </Text>
        <View style={{ marginTop: "auto", borderRadius: RADIUS.pill, alignItems: "center", paddingVertical: 9, backgroundColor: checkedToday ? "transparent" : C.lime, borderWidth: checkedToday ? 1 : 0, borderColor: C.line }}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: checkedToday ? C.ash : C.onAccent }}>{checkedToday ? t("w.home.today.w.view") : t("w.home.today.w.checkinCta")}</Text>
        </View>
      </Pressable>

      {/* NUTRITION */}
      <Pressable onPress={() => router.push("/nutrition")} style={cardStyle}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: `${C.lime}24` }}>
            <AuroraIcon name="heart" size={16} color={txt(C, C.lime)} />
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: C.ash }}>{t("w.home.today.w.today")}</Text>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", color: C.ash, marginTop: 12 }}>{t("w.home.today.w.nutrition")}</Text>
        <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk, marginTop: 2 }}>
          {Math.round(today.kcal).toLocaleString()}
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}> / {targets.kcal.toLocaleString()}</Text>
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>kcal</Text>
        <View style={{ height: 7, borderRadius: 4, backgroundColor: C.ink, overflow: "hidden", marginTop: 8 }}>
          <View style={{ width: `${kcalPct * 100}%`, height: 7, backgroundColor: today.kcal > targets.kcal * 1.05 ? C.red : C.lime }} />
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 7 }}>P {Math.round(today.protein)} · C {Math.round(today.carbs)} · F {Math.round(today.fat)}</Text>
        <View style={{ marginTop: "auto", borderRadius: RADIUS.pill, alignItems: "center", paddingVertical: 9, borderWidth: 1, borderColor: C.line }}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.chalk }}>{hasNutrition ? t("w.home.today.w.add") : t("w.home.today.w.addFirst")}</Text>
        </View>
      </Pressable>
    </View>
  );
}
