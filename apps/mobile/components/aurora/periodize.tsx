import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { currentPhase, type Macrocycle } from "@hybrid/core";
import { fetchMacrocycle } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { fs, space, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { AuroraScreen, ACard, APill, AHeading, RADIUS } from "./kit";

/** AURORA Periodize — the enrolled macrocycle: phase timeline + load/recovery
 *  microcycles, reusing the exact currentPhase engine + macrocycle API. */
export default function AuroraPeriodize() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const [macro, setMacro] = useState<Macrocycle | null>(null);
  const [week, setWeek] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    fetchMacrocycle()
      .then((m) => { setMacro(m?.macro ?? null); setWeek(m?.currentWeek ?? 1); })
      .finally(() => { setLoaded(true); setRefreshing(false); });
  };
  useEffect(() => { load(); }, []);

  if (!macro) {
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        <AHeading style={{ fontSize: fs.display }}>No active plan</AHeading>
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, lineHeight: 20 }}>
            {loaded ? "Enroll in a plan and your periodized macrocycle — phases, load & recovery weeks — shows up here." : "Loading your season…"}
          </Text>
          <APill label="Browse plans →" onPress={() => router.push("/(tabs)/plans")} style={{ marginTop: 16 }} />
        </ACard>
      </AuroraScreen>
    );
  }

  const { block: current } = currentPhase(macro, week);

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{macro.goalOrSport}{macro.model ? ` · ${macro.model}` : " · enrolled"}</Text>
      <AHeading style={{ fontSize: fs.display, marginTop: 6 }}>{macro.totalWeeks}-week season</AHeading>
      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginTop: 6 }}>Now in {current.label} · week {week}/{macro.totalWeeks}</Text>

      <ACard style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", gap: 3, height: 12, borderRadius: 6, overflow: "hidden" }}>
          {macro.blocks.map((b) => (
            <View key={b.key} style={{ flex: b.weeks, backgroundColor: b.key === current.key ? b.color : `${b.color}40` }} />
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: 12 }}>
          {macro.blocks.map((b) => (
            <View key={b.key} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: b.color }} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: b.key === current.key ? C.chalk : C.ash }}>{b.label}</Text>
            </View>
          ))}
        </View>
      </ACard>

      {macro.blocks.map((b) => (
        <ACard key={b.key} style={{ marginTop: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.title, color: txt(C, b.color) }}>{b.label}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>wk {b.startWeek}–{b.endWeek}</Text>
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, marginTop: 6, marginBottom: 12, lineHeight: 18 }}>{b.focus}</Text>
          <View style={{ flexDirection: "row", gap: space.xs }}>
            {b.micros.map((m) => (
              <View
                key={m.week}
                style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: RADIUS.field, backgroundColor: m.week === week ? `${C.lime}1a` : C.ink, borderWidth: 1, borderColor: m.week === week ? C.lime : C.line }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: m.kind === "recovery" ? C.ash : C.chalk }}>W{m.week}</Text>
                <View style={{ height: 4, borderRadius: 2, marginTop: 4, width: "70%", backgroundColor: m.kind === "recovery" ? C.ash : b.color, opacity: 0.4 + (m.intensity / 100) * 0.6 }} />
              </View>
            ))}
          </View>
        </ACard>
      ))}
      <View style={{ height: 16 }} />
    </AuroraScreen>
  );
}
