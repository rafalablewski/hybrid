import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import {
  fuelToday,
  fuelPlate,
  fuelRail,
  mealPartEmoji,
  mealPartLabelFromKey,
  trainingEnergyOnDay,
  DEFAULT_MEAL_PART_KEYS,
  FUEL_PLATE_OTHER,
  MEAL_PRESETS,
  isFullAccess,
  type FuelToday,
  type FuelMacro,
  type FuelPlateGroup,
  type FuelRailChip,
  type LoggedSession,
  type Signal,
} from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { useSignalsQuery, useFoodLogsQuery, useRevalidate } from "../../lib/queries";
import { usePersona } from "../../lib/persona";
import { createFoodLog } from "../../lib/api";
import { F, serifIf } from "../../lib/ui";
import { Ring, withAlpha, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

type P = ReturnType<typeof useTheme>["palette"];

/**
 * AURORA Fuel (mobile) — the Today-screen nutrition widget. ONE stateful surface,
 * exactly how the week rail flips done / missed / today: meaning reads from the
 * tick-ring + a single headline, not a different card per case. State, targets
 * and macros come from @hybrid/core's fuelToday() so mobile matches web exactly
 * (parity rule).
 *
 * It answers BOTH questions a day's fuel raises: how much (the ring + macros)
 * and WHAT (the plate — the day's logged meals grouped by part of the day, from
 * core's fuelPlate), so seeing what you ate never means digging into Nutrition.
 * The quick-log rail rides OUTSIDE the card, full-bleed to the screen edge (the
 * golden slider rule) — it's an action bar for the whole widget, not a row of
 * the summary, and it's carried through every state so a meal is one tap from
 * anywhere. Mirror of apps/web aurora/fuel.tsx.
 */
export default function AuroraFuel({ sessions, onOpen }: { sessions: LoggedSession[]; onOpen: () => void }) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const { data: rawSignals = [], isLoading } = useSignalsQuery();
  const signals = rawSignals as unknown as Signal[];
  const { data: logs = [] } = useFoodLogsQuery();
  const revalidate = useRevalidate();
  const full = isFullAccess(usePersona());
  // One-tap logging: the chip being written (busy) and the one that just landed
  // (its ✓ flash). Free users can't log from the rail — a tap opens the sheet
  // where the premium framing lives (parity with Nutrition's locked tiles).
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const logChip = async (chip: FuelRailChip) => {
    if (!full) return onOpen();
    if (busy) return;
    setBusy(chip.id);
    setDone(null);
    // Route through the editable food-log (like the Nutrition screen) so the
    // meal appears in the Diary as a named, editable/deletable entry AND the
    // mirrored Signals the engines read. Attributed to its own part of day.
    const { ok } = await createFoodLog({ name: chip.name, source: chip.source, kcal: chip.kcal, protein: chip.protein, carbs: chip.carbs, fat: chip.fat, qty: 1 });
    setBusy(null);
    if (!ok) return onOpen(); // failure — fall back to manual sheet
    revalidate.recovery();
    setDone(chip.id);
    setTimeout(() => setDone((d) => (d === chip.id ? null : d)), 1600);
  };

  const fuel = useMemo<FuelToday>(() => {
    const bodyMassKg = [...signals].filter((s) => s.kind === "bodyMass").sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0]?.value;
    const trainingKcal = trainingEnergyOnDay(sessions, bodyMassKg ?? 75);
    return fuelToday(signals, { trainingKcal, bodyMassKg });
  }, [signals, sessions]);

  // The day's logged items, grouped by part of the day. The athlete's CUSTOM
  // parts live in the nutrition prefs this widget doesn't load, so an entry
  // logged under one falls into "Other" and is labelled from its own key —
  // visible either way, which is the point of the summary.
  const plate = useMemo(() => fuelPlate(logs), [logs]);

  // The rail: the meals this athlete actually eats, ranked from their own diary,
  // with the canned presets behind them for a cold start. Built from what was
  // eaten BEFORE today, so a tap can mark a chip but never move it.
  const rail = useMemo(
    () => fuelRail(logs, { presets: MEAL_PRESETS.map((p) => ({ id: p.id, name: presetShort(t(p.labelKey)), source: p.id.split("-")[0] || "snack", emoji: p.emoji, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat })) }),
    [logs, t],
  );

  const { state, targets, kcalLeft, kcalPct, proteinGap, trainingKcal, today, macros } = fuel;
  const nf = (n: number) => Math.round(n).toLocaleString();
  const macroText: Record<FuelMacro["key"], string> = { protein: txt(C, C.blue), carbs: txt(C, C.amber), fat: txt(C, C.violet) };
  const macroFill: Record<FuelMacro["key"], string> = { protein: C.blue, carbs: C.amber, fat: C.violet };
  const heading = serifIf(scheme, F.black);

  const glow = state === "goal-hit" || state === "refuel";
  const ringColor = state === "over" ? txt(C, C.red) : C.lime;
  const title = state === "refuel" ? t("w.home.fuel.titleRefuel") : state === "goal-hit" ? t("w.home.fuel.titleGoal") : t("w.home.fuel.title");

  const MacroBar = ({ m, label, thick }: { m: FuelMacro; label: string; thick?: boolean }) => {
    // Surpassed target — a distinctive treatment: the track fills to the WHOLE
    // logged amount, chartreuse-macro up to the target line then a terracotta
    // overflow past it, and the readout calls out "+Ng" in the over colour.
    const targetFrac = m.over && m.value > 0 ? Math.max(0, Math.min(100, (m.target / m.value) * 100)) : 100;
    return (
      <View style={{ gap: 5 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: macroText[m.key] }}>{label}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>
            <Text style={{ color: m.over ? txt(C, C.red) : C.ash }}>{m.value}</Text> / {m.target} g
            {m.over ? <Text style={{ color: txt(C, C.red), fontWeight: "600" }}> +{m.overBy}</Text> : null}
          </Text>
        </View>
        <View style={{ height: thick ? 7 : 5, borderRadius: 5, backgroundColor: C.line, overflow: "hidden" }}>
          {m.over ? (
            <View style={{ flexDirection: "row", height: "100%", width: "100%" }}>
              <View style={{ width: `${targetFrac}%`, backgroundColor: macroFill[m.key] }} />
              <View style={{ flex: 1, backgroundColor: C.red }} />
            </View>
          ) : (
            <View style={{ height: "100%", width: `${m.pct}%`, backgroundColor: macroFill[m.key], borderRadius: 5 }} />
          )}
        </View>
      </View>
    );
  };

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
    <>
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

      {/* THE PLATE — what was actually eaten today, grouped by part of the day.
          The macros above say how much; this says what, so the answer to "have
          I had lunch" never costs a trip into Nutrition. Every row opens the
          diary, where it can be edited. Hidden when nothing is logged (the
          empty state already speaks for the day). */}
      {plate.count > 0 && (
        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 13 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <Text style={{ fontFamily: heading, fontSize: 14, color: C.chalk }}>{t("w.recovery.nutrition.todaysMeals")}</Text>
            <Pressable onPress={onOpen} accessibilityRole="button" hitSlop={8}>
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: txt(C, C.lime) }}>{t("w.home.fuel.allMeals")}</Text>
            </Pressable>
          </View>
          <View style={{ marginTop: 6 }}>
            {plate.groups.slice(0, PLATE_ROWS).map((g) => (
              <Pressable key={g.key} onPress={onOpen} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 7 }}>
                <Text style={{ fontSize: 15 }}>{mealPartEmoji(g.key)}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 12.5, letterSpacing: -0.1, color: C.chalk }}>{partLabel(g.key, t)}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 11.5, color: C.ash, marginTop: 1 }}>{groupLine(g, t)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: C.chalk }}>{nf(g.kcal)} kcal</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: txt(C, C.blue), marginTop: 1 }}>{nf(g.protein)}P</Text>
                </View>
              </Pressable>
            ))}
            {plate.groups.length > PLATE_ROWS && (
              <Pressable onPress={onOpen} accessibilityRole="button" style={{ paddingTop: 7 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: C.ash }}>
                  {t("w.home.fuel.plateMore").replace("{n}", nf(plate.groups.slice(PLATE_ROWS).reduce((s, g) => s + g.items.length, 0)))}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>

    {/* QUICK-LOG rail — outside the card and FULL-BLEED to the screen edge (the
        golden slider rule: negative margins the width of the screen gutter pull
        the scroll clip to the true edge, with matching internal padding so
        resting cards still line up with the content column). It's the widget's
        action bar, not a row of the summary: presets ARE the meal types, and
        the leading dashed "＋ Quick log" card opens the full quick-add.
        Persistent across every state. */}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginTop: 12 }} contentContainerStyle={{ gap: 9, paddingHorizontal: 16, paddingBottom: 4 }}>
      {/* ＋ Quick log — the entry to the full sheet, echoing the exercise
          rail's "All exercises & favourites" card: a bare ＋ glyph + lime
          label (not a boxed tile); first so it's always reachable. */}
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={t("w.home.fuel.quickLog")} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderStyle: "dashed", borderColor: withAlpha(C.ash, 0.4), borderRadius: 14, paddingVertical: 9, paddingHorizontal: 17 }}>
        <Text style={{ fontSize: 20, color: C.ash, marginTop: -2 }}>＋</Text>
        <Text style={{ fontFamily: F.bold, fontSize: 12.5, letterSpacing: -0.1, color: txt(C, C.lime) }}>{t("w.home.fuel.quickLog")}</Text>
      </Pressable>
      {rail.map((chip) => {
        const isDone = done === chip.id;
        const isBusy = busy === chip.id;
        // ALREADY HAD IT — a quiet ✓ badge on the tile, never a disabled chip:
        // a second helping is a real thing, so the mark reports the day rather
        // than standing in the way of it.
        const had = chip.loggedToday && !isDone;
        return (
          <Pressable
            key={chip.id}
            onPress={() => logChip(chip)}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={`${t("w.home.fuel.logMeal")} ${chip.name}${had ? ` — ${t("w.home.fuel.hadToday")}` : ""}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: isDone ? withAlpha(C.lime, 0.14) : C.ink2, borderWidth: 1, borderColor: isDone ? withAlpha(C.lime, 0.4) : C.line, borderRadius: 14, paddingVertical: 9, paddingLeft: 9, paddingRight: 13, opacity: isBusy ? 0.55 : 1 }}
          >
            <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: isDone ? withAlpha(C.lime, 0.2) : C.ink, borderWidth: 1, borderColor: isDone ? withAlpha(C.lime, 0.4) : C.line, alignItems: "center", justifyContent: "center" }}>
              {isDone ? <AuroraIcon name="check" size={16} color={txt(C, C.lime)} /> : <Text style={{ fontSize: 16 }}>{chip.emoji}</Text>}
              {had ? (
                <View style={{ position: "absolute", top: -5, right: -5, width: 15, height: 15, borderRadius: 999, backgroundColor: C.lime, borderWidth: 1.5, borderColor: C.ink2, alignItems: "center", justifyContent: "center" }}>
                  <AuroraIcon name="check" size={9} color={C.onAccent} />
                </View>
              ) : null}
            </View>
            <View>
              <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 12.5, letterSpacing: -0.1, color: C.chalk, maxWidth: 148 }}>{chip.name}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: isDone ? txt(C, C.lime) : C.ash, marginTop: 1 }}>{isDone ? `+${chip.kcal} kcal ${t("w.home.fuel.logged")}` : `${chip.kcal} kcal – ${chip.protein}P`}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
    </>
  );
}

// The preset labels read "Breakfast – oats & eggs"; the rail wants just the meal
// name, so trim at the en-dash separator.
function presetShort(label: string): string {
  return label.split(" – ")[0] ?? label;
}

/** How many plate rows the widget shows before deferring to "+N more". Five
 *  covers the four built-in parts plus "Other"; only custom parts overflow. */
const PLATE_ROWS = 5;

/** A part-of-day row label: the built-ins are i18n, "Other" mirrors the Diary's
 *  own group, and a custom part (whose authored label lives in prefs this
 *  widget doesn't load) reads from its key. Mirrors web's partLabel. */
function partLabel(key: string, t: (k: string) => string): string {
  if (key === FUEL_PLATE_OTHER) return t("w.recovery.nutrition.otherEntries");
  if ((DEFAULT_MEAL_PART_KEYS as readonly string[]).includes(key)) return t(`w.recovery.nutrition.meal.${key}`);
  return mealPartLabelFromKey(key);
}

/** The row's line: the items eaten in that part. An entry logged before names
 *  were stored has none to show, so it's counted rather than invented.
 *  Mirrors web's groupLine. */
function groupLine(g: FuelPlateGroup, t: (k: string) => string): string {
  const parts = [...g.names];
  if (g.unnamed === 1) parts.push(t("w.recovery.nutrition.loggedEntry"));
  else if (g.unnamed > 1) parts.push(`${g.unnamed} × ${t("w.recovery.nutrition.loggedEntry")}`);
  return parts.join(", ");
}
