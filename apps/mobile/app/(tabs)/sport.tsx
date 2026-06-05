import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SPORTS, SPORT_NAMES, LEVELS, prescribeForSport } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { Screen, Card, Kicker, Mono, Chip, C, F } from "../../lib/ui";

const STORE_KEY = "hybrid.sport";

export default function Sport() {
  const { t } = useLang();
  const [sport, setSport] = useState<string>(SPORT_NAMES[0]!);
  const [levelIdx, setLevelIdx] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Remember the athlete's sport + level so the tab reflects THEM, not a
  // default demo selection.
  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (raw) {
          const s = JSON.parse(raw) as { sport?: string; levelIdx?: number };
          if (s.sport && SPORTS[s.sport]) setSport(s.sport);
          if (typeof s.levelIdx === "number" && s.levelIdx >= 0 && s.levelIdx < LEVELS.length) setLevelIdx(s.levelIdx);
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORE_KEY, JSON.stringify({ sport, levelIdx })).catch(() => {});
  }, [sport, levelIdx, hydrated]);

  const meta = SPORTS[sport]!;
  const rx = prescribeForSport(sport, levelIdx);

  return (
    <Screen>
      <Kicker>Sport</Kicker>
      <Mono style={{ marginTop: 6, marginBottom: 12 }}>{t("sport.intro")}</Mono>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {SPORT_NAMES.map((s) => {
          const on = s === sport;
          return (
            <Pressable
              key={s}
              onPress={() => setSport(s)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: on ? C.lime : C.line,
                backgroundColor: on ? `${C.lime}1a` : "transparent",
              }}
            >
              <Text style={{ fontSize: 15 }}>{SPORTS[s]!.icon}</Text>
              <Text style={{ fontFamily: F.semi, fontSize: 13, color: on ? C.chalk : C.ash }}>{s}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        {LEVELS.map((l, i) => {
          const on = i === levelIdx;
          return (
            <Pressable
              key={l}
              onPress={() => setLevelIdx(i)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: on ? C.blue : C.line,
                backgroundColor: on ? C.blue : "transparent",
              }}
            >
              <Text style={{ fontFamily: F.semi, fontSize: 12, color: on ? C.ink : C.ash }}>{l}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.lime }}>
        <Kicker color={C.lime}>{t("sport.prescribed")} · {rx.setScheme}</Kicker>
        {rx.blocks.map((b, i) => (
          <View key={b.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, marginTop: i ? 0 : 6 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{b.name}</Text>
              <Mono color={C.amber} style={{ fontSize: 11 }}>{b.demand}</Mono>
            </View>
            <Chip>{b.scheme}</Chip>
          </View>
        ))}
      </Card>

      <Card>
        <Kicker>{t("sport.why")}</Kicker>
        {rx.ranked.map((e) => (
          <View key={e.name} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.chalk }}>{e.name}</Text>
              <Mono style={{ fontSize: 11 }}>{e.demand}</Mono>
            </View>
            <Mono color={C.chalk} style={{ marginTop: 3, lineHeight: 19 }}>{e.why}</Mono>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
