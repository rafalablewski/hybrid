import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { currentPhase, type Macrocycle } from "@hybrid/core";
import { fetchMacrocycle } from "../lib/api";
import { fs, space, Screen, Card, Kicker, Mono, H1, Button, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraPeriodize from "../components/aurora/periodize";

/** Periodize — the enrolled macrocycle: phase timeline + load/recovery
 *  microcycles. Mobile port of the web Periodize screen. */
export default function Periodize() {
  if (useTemplate().template === "aurora") return <AuroraPeriodize />;
  return <ClassicPeriodize />;
}

function ClassicPeriodize() {
  const C = useTheme().palette;
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
      <Screen refreshing={refreshing} onRefresh={load}>
        <Kicker>Periodize</Kicker>
        <H1>No active plan</H1>
        <Card style={{ marginTop: 14 }}>
          <Mono color={C.chalk} style={{ lineHeight: 20 }}>
            {loaded ? "Enroll in a plan and your periodized macrocycle — phases, load & recovery weeks — shows up here." : "Loading your season…"}
          </Mono>
          <View style={{ marginTop: 14 }}>
            <Button label="Browse plans →" onPress={() => router.push("/(tabs)/plans")} />
          </View>
        </Card>
      </Screen>
    );
  }

  const { block: current } = currentPhase(macro, week);

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <Kicker>{macro.goalOrSport}{macro.model ? ` · ${macro.model}` : " · enrolled"}</Kicker>
      <H1>{macro.totalWeeks}-week season</H1>
      <Mono style={{ marginTop: 4 }}>Now in {current.label} · week {week}/{macro.totalWeeks}</Mono>

      {/* phase timeline, weighted by weeks */}
      <Card style={{ marginTop: 14 }}>
        <View style={{ flexDirection: "row", gap: 3, height: 12, borderRadius: 6, overflow: "hidden" }}>
          {macro.blocks.map((b) => (
            <View key={b.key} style={{ flex: b.weeks, backgroundColor: b.key === current.key ? b.color : `${b.color}40` }} />
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: 12 }}>
          {macro.blocks.map((b) => (
            <View key={b.key} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: b.color }} />
              <Mono color={b.key === current.key ? C.chalk : C.ash} style={{ fontSize: fs.micro }}>{b.label}</Mono>
            </View>
          ))}
        </View>
      </Card>

      {/* per-phase microcycles */}
      {macro.blocks.map((b) => (
        <Card key={b.key} style={{ borderLeftWidth: 3, borderLeftColor: b.color, marginTop: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.title, color: txt(C, b.color) }}>{b.label}</Text>
            <Mono color={C.ash} style={{ fontSize: fs.caption }}>wk {b.startWeek}–{b.endWeek}</Mono>
          </View>
          <Mono color={C.chalk} style={{ marginTop: 6, marginBottom: 12, lineHeight: 18 }}>{b.focus}</Mono>
          <View style={{ flexDirection: "row", gap: space.xs }}>
            {b.micros.map((m) => (
              <View
                key={m.week}
                style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8, backgroundColor: m.week === week ? `${C.lime}1a` : C.ink2, borderWidth: 1, borderColor: m.week === week ? C.lime : C.line }}
              >
                <Mono color={m.kind === "recovery" ? C.ash : C.chalk} style={{ fontSize: fs.nano }}>W{m.week}</Mono>
                <View style={{ height: 4, borderRadius: 2, marginTop: 4, width: "70%", backgroundColor: m.kind === "recovery" ? C.ash : b.color, opacity: 0.4 + (m.intensity / 100) * 0.6 }} />
              </View>
            ))}
          </View>
        </Card>
      ))}
      <View style={{ height: 16 }} />
    </Screen>
  );
}
