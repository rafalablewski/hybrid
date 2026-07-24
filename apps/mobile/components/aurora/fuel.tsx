import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import {
  fuelToday,
  trainingEnergyOnDay,
  MEAL_PRESETS,
  mealPresetSignals,
  isFullAccess,
  type FuelToday,
  type FuelMacro,
  type LoggedSession,
  type MealPreset,
  type Signal,
} from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { useSignalsQuery, useRevalidate } from "../../lib/queries";
import { usePersona } from "../../lib/persona";
import { createSignal } from "../../lib/api";
import { F, serifIf } from "../../lib/ui";
import { Ring, withAlpha, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

type P = ReturnType<typeof useTheme>["palette"];

/**
 * AURORA Fuel (mobile) — the Today-screen nutrition widget. ONE stateful surface,
 * exactly how the week rail flips done / missed / today: meaning reads from the
 * tick-ring + a single headline, not a different card per case. State, targets
 * and macros come from @hybrid/core's fuelToday() so mobile matches web exactly
 * (parity rule). The quick-log rail is carried through every state, so a meal is
 * one tap from anywhere. Mirror of apps/web aurora/fuel.tsx.
 */
export default function AuroraFuel({ sessions, onOpen }: { sessions: LoggedSession[]; onOpen: () => void }) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const { data: rawSignals = [], isLoading } = useSignalsQuery();
  const signals = rawSignals as unknown as Signal[];
  const revalidate = useRevalidate();
  const full = isFullAccess(usePersona());
  // One-tap preset logging: the chip being written (busy) and the one that just
  // landed (its ✓ flash). Free users can't log presets — a tap opens the sheet
  // where the premium framing lives (parity with Nutrition's locked tiles).
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const logPreset = async (p: MealPreset) => {
    if (!full) return onOpen();
    if (busy) return;
    setBusy(p.id);
    setDone(null);
    const ok = await Promise.all(mealPresetSignals(p).map((s) => createSignal(s.kind, s.value, s.unit, "preset")));
    setBusy(null);
    if (ok.includes(false)) return onOpen(); // failure — fall back to manual sheet
    revalidate.recovery();
    setDone(p.id);
    setTimeout(() => setDone((d) => (d === p.id ? null : d)), 1600);
  };

  const fuel = useMemo<FuelToday>(() => {
    const bodyMassKg = [...signals].filter((s) => s.kind === "bodyMass").sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0]?.value;
    const trainingKcal = trainingEnergyOnDay(sessions, bodyMassKg ?? 75);
    return fuelToday(signals, { trainingKcal, bodyMassKg });
  }, [signals, sessions]);

  const { state, targets, kcalLeft, kcalPct, proteinGap, trainingKcal, today, macros } = fuel;
  const nf = (n: number) => Math.round(n).toLocaleString();
  const macroText: Record<FuelMacro["key"], string> = { protein: txt(C, C.blue), carbs: txt(C, C.amber), fat: txt(C, C.violet) };
  const macroFill: Record<FuelMacro["key"], string> = { protein: C.blue, carbs: C.amber, fat: C.violet };
  const heading = serifIf(scheme, F.black);

  const glow = state === "goal-hit" || state === "refuel";
  const ringColor = state === "over" ? txt(C, C.red) : C.lime;
  const title = state === "refuel" ? t("w.home.fuel.titleRefuel") : state === "goal-hit" ? t("w.home.fuel.titleGoal") : t("w.home.fuel.title");

  const MacroBar = ({ m, label, thick }: { m: FuelMacro; label: string; thick?: boolean }) => (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: macroText[m.key] }}>{label}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>{m.value} / {m.target} g</Text>
      </View>
      <View style={{ height: thick ? 7 : 5, borderRadius: 5, backgroundColor: C.line, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${m.pct}%`, backgroundColor: macroFill[m.key], borderRadius: 5 }} />
      </View>
    </View>
  );

  const Pill = ({ tone, children }: { tone: "lime" | "red"; children: React.ReactNode }) => (
    <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: withAlpha(tone === "lime" ? C.lime : C.red, 0.14) }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10, fontWeight: "700", letterSpacing: 0.8, color: txt(C, tone === "lime" ? C.lime : C.red) }}>{children}</Text>
    </View>
  );

  // Hold the widget back until the first signals fetch resolves, so a returning
  // athlete never sees the cold-start "Nothing logged yet" flash. (Usually the
  // cache is already warm from the parent screen.)
  if (isLoading) return null;

  return (
    <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: glow ? withAlpha(C.lime, 0.3) : C.line, borderRadius: RADIUS.card, padding: 20, marginTop: 12, overflow: "hidden" }}>
      {glow && (
        <LinearGradient
          colors={[withAlpha(C.lime, state === "goal-hit" ? 0.12 : 0.1), "transparent"]}
          start={{ x: state === "goal-hit" ? 0.5 : 0.9, y: 0 }}
          end={{ x: 0.4, y: 0.55 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}

      {/* header — title + a state-coloured right meta */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ fontFamily: heading, fontSize: 18, color: C.chalk }}>{title}</Text>
        {state === "refuel" ? (
          <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: txt(C, C.lime) }}>{t("w.home.fuel.trained").replace("{n}", nf(trainingKcal))}</Text>
        ) : state === "on-track" ? (
          <Pill tone="lime">{t("w.home.fuel.onTrack")}</Pill>
        ) : state === "goal-hit" ? (
          <Pill tone="lime">{`✓ ${t("w.home.fuel.goalPill")}`}</Pill>
        ) : state === "over" ? (
          <Pill tone="red">{t("w.home.fuel.overPill")}</Pill>
        ) : (
          <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: C.ash }}>{t("w.home.fuel.ofTarget").replace("{n}", nf(today.kcal)).replace("{t}", nf(targets.kcal))}</Text>
        )}
      </View>

      {/* hero — the tick-ring + a state-specific body. Tapping opens Nutrition. */}
      <Pressable onPress={onOpen} accessibilityRole="button" style={{ flexDirection: "row", gap: 20, alignItems: "center", marginTop: 14 }}>
        <Ring value={state === "empty" ? 0 : kcalPct} size={96} ticks={32} color={ringColor} track={C.line}>
          {state === "goal-hit" ? (
            <Svg width={30} height={30} viewBox="0 0 24 24" fill="none"><Path d="M5 12.5 10 17.5 19.5 7" stroke={C.lime} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          ) : state === "empty" ? (
            <Svg width={26} height={26} viewBox="0 0 24 24" fill="none"><Path d="M4 3v7a4 4 0 0 0 8 0V3M8 3v18M17 3c-1.5 1.5-2 4-2 7s.5 4 2 4 2-1 2-4-.5-5.5-2-7zM17 14v7" stroke={C.ash} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          ) : (
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontFamily: F.black, fontSize: 23, letterSpacing: -0.4, color: C.chalk }}>{nf(Math.abs(kcalLeft))}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.9, color: C.ash, marginTop: 4, textTransform: "uppercase" }}>{t(kcalLeft >= 0 ? "w.home.fuel.kcalLeft" : "w.home.fuel.kcalOver")}</Text>
            </View>
          )}
        </Ring>

        <View style={{ flex: 1, minWidth: 0 }}>
          {state === "empty" ? (
            <>
              <Text style={{ fontFamily: F.black, fontSize: 18, letterSpacing: -0.4, color: C.chalk }}>{t("w.home.fuel.emptyHead")}</Text>
              <Text style={{ fontSize: 12.5, lineHeight: 19, color: C.ash, marginTop: 6 }}>{t("w.home.fuel.emptySub")}</Text>
            </>
          ) : state === "refuel" || state === "protein" ? (
            <>
              <Text style={{ fontFamily: F.black, fontSize: 18, letterSpacing: -0.4, color: txt(C, C.blue) }}>{t("w.home.fuel.proteinToGo").replace("{n}", nf(proteinGap))}</Text>
              {state === "refuel" && <Text style={{ fontSize: 12.5, lineHeight: 19, color: C.ash, marginTop: 6 }}>{t("w.home.fuel.refuelSub").replace("{t}", nf(targets.kcal))}</Text>}
              <View style={{ marginTop: 12 }}><MacroBar m={macros.protein} label={t("w.recovery.nutrition.protein")} thick /></View>
            </>
          ) : state === "goal-hit" ? (
            <>
              <Text style={{ fontFamily: F.black, fontSize: 18, letterSpacing: -0.4, color: C.chalk }}>{t("w.home.fuel.goalHead")}</Text>
              <Text style={{ fontSize: 12.5, lineHeight: 19, color: C.ash, marginTop: 6 }}>{t("w.home.fuel.goalSub")}</Text>
              <View style={{ flexDirection: "row", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                {(["protein", "carbs", "fat"] as const).map((k) => (
                  <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: macroFill[k] }} />
                    <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 0.8, color: macroText[k] }}>{k[0]!.toUpperCase()} {macros[k].pct}%</Text>
                  </View>
                ))}
              </View>
            </>
          ) : state === "over" ? (
            <>
              <Text style={{ fontFamily: F.black, fontSize: 18, letterSpacing: -0.4, color: C.chalk }}>{t("w.home.fuel.overHead")}</Text>
              <Text style={{ fontSize: 12.5, lineHeight: 19, color: C.ash, marginTop: 6 }}>{t("w.home.fuel.overSub").replace("{n}", nf(Math.max(0, -kcalLeft)))}</Text>
              <View style={{ marginTop: 12, gap: 10 }}>
                {(["protein", "carbs", "fat"] as const).map((k) => (<MacroBar key={k} m={macros[k]} label={t(`w.recovery.nutrition.${k}`)} />))}
              </View>
            </>
          ) : (
            // on-track — the everyday in-progress state: all three macros
            <View style={{ gap: 10 }}>
              {(["protein", "carbs", "fat"] as const).map((k) => (<MacroBar key={k} m={macros[k]} label={t(`w.recovery.nutrition.${k}`)} />))}
            </View>
          )}
        </View>
      </Pressable>

      {/* quick-log rail — persistent across every state; presets ARE the meal
          types. Full-bleed to the card edge (a rail inside a card respects the
          card's padding — the golden rule's in-card exception). */}
      <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: C.ash, textTransform: "uppercase" }}>{t("w.home.fuel.quickLog")}</Text>
          <Pressable onPress={onOpen} accessibilityRole="button"><Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: txt(C, C.lime), textTransform: "uppercase" }}>{t("w.home.fuel.allMeals")}</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 9, paddingHorizontal: 20, paddingBottom: 4 }}>
          {MEAL_PRESETS.map((p) => {
            const isDone = done === p.id;
            const isBusy = busy === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => logPreset(p)}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel={`${t("w.home.fuel.logMeal")} ${presetShort(t(p.labelKey))}`}
                style={{ flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: isDone ? withAlpha(C.lime, 0.14) : C.ink, borderWidth: 1, borderColor: isDone ? withAlpha(C.lime, 0.4) : C.line, borderRadius: 14, paddingVertical: 9, paddingLeft: 9, paddingRight: 13, opacity: isBusy ? 0.55 : 1 }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: isDone ? withAlpha(C.lime, 0.2) : C.ink2, borderWidth: 1, borderColor: isDone ? withAlpha(C.lime, 0.4) : C.line, alignItems: "center", justifyContent: "center" }}>
                  {isDone ? <AuroraIcon name="check" size={16} color={txt(C, C.lime)} /> : <Text style={{ fontSize: 16 }}>{p.emoji}</Text>}
                </View>
                <View>
                  <Text style={{ fontFamily: F.bold, fontSize: 12.5, letterSpacing: -0.1, color: C.chalk }}>{presetShort(t(p.labelKey))}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: isDone ? txt(C, C.lime) : C.ash, marginTop: 1 }}>{isDone ? `+${p.kcal} kcal ${t("w.home.fuel.logged")}` : `${p.kcal} kcal – ${p.protein}P`}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

// The preset labels read "Breakfast – oats & eggs"; the rail wants just the meal
// name, so trim at the en-dash separator.
function presetShort(label: string): string {
  return label.split(" – ")[0] ?? label;
}
