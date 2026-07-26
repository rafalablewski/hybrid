import { View, Text, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { planHeroView, type GoalNode, type GoalPlan, type PlanProgram } from "@hybrid/core";
import { useTheme } from "../lib/theme";
import { fs, F } from "../lib/ui";
import { withAlpha } from "./aurora/kit";

/** "The Columns" plan-detail hero, shared by BOTH mobile detail renderers
 *  (discipline-shaped program + classic): a gradient panel (back + loading tag,
 *  goal chip, big title) over three rule-topped stat columns and a one-line
 *  blurb — all content from the shared planHeroView() so web and mobile can't
 *  drift. Mirrors the web PlanHero in aurora/plans.tsx 1:1. */
export default function PlanHero({ goal, plan, program, back }: { goal: GoalNode; plan: GoalPlan; program?: PlanProgram; back: () => void }) {
  const { palette: C } = useTheme();
  const hero = planHeroView(plan, program);
  const rule = withAlpha(C.chalk, 0.18);
  return (
    <View>
      {/* Shadow lives on the OUTER view (ACard's soft depth — web --shadow-card
          parity); the inner view clips the gradient to the rounded corners. */}
      <View style={{ borderRadius: 28, marginBottom: 16, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 }}>
        <View style={{ borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2 }}>
          <LinearGradient colors={[withAlpha(C.lime, 0.2), withAlpha(C.lime, 0.06), "transparent"]} start={{ x: 1, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={{ padding: 20, paddingTop: 18, paddingBottom: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={`← ${goal.name}`} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: withAlpha(C.chalk, 0.1), alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.semi, fontSize: 17, color: C.chalk }}>←</Text>
              </Pressable>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 2.4, textTransform: "uppercase", color: C.chalk }}>{hero.navLabel}</Text>
            </View>
            <View style={{ alignSelf: "flex-start", backgroundColor: C.chalk, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 14 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", color: C.ink }}>{goal.name}</Text>
            </View>
            <Text style={{ fontFamily: F.black, fontSize: 33, lineHeight: 36, letterSpacing: -0.5, color: C.chalk }}>{plan.name}</Text>
          </View>
        </View>
      </View>

      {/* Rule-topped editorial stat columns: duration, frequency, discipline volume. */}
      <View style={{ flexDirection: "row", gap: 18, marginBottom: 14 }}>
        {hero.stats.map((s) => (
          <View key={s.label} style={{ flex: 1, borderTopWidth: 2, borderTopColor: rule, paddingTop: 10 }}>
            <Text style={{ fontFamily: F.black, fontSize: 27, lineHeight: 28, letterSpacing: -0.5, color: C.chalk, fontVariant: ["tabular-nums"] }}>
              {s.value}
              {!!s.unit && <Text style={{ fontSize: 14, color: C.ash }}>{s.unit}</Text>}
            </Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash, marginTop: 6 }}>{s.label}</Text>
          </View>
        ))}
      </View>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: 22, color: C.ash, marginBottom: 16 }}>{hero.blurb}</Text>
    </View>
  );
}
