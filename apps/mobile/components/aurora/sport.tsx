import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SPORTS, SPORT_NAMES, LEVELS, prescribeForSport, type LoggedSession } from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, RADIUS } from "./kit";

const STORE_KEY = "hybrid.sport";

/** AURORA Sport — sport + level picker driving the shared prescribeForSport
 *  engine, with working loads tuned to the athlete's logged lifts. */
export default function AuroraSport() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [sport, setSport] = useState<string>(SPORT_NAMES[0]!);
  const [levelIdx, setLevelIdx] = useState(0);
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchSessions().then((d) => {
        if (active) setSessions(d);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (!raw) return;
        const s = JSON.parse(raw) as { sport?: string; levelIdx?: number } | null;
        if (s && typeof s === "object") {
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
  const rx = prescribeForSport(sport, levelIdx, { sessions });

  return (
    <AuroraScreen>
      <AHeading style={{ fontSize: 26 }}>Sport</AHeading>
      <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.ash, marginTop: 8, marginBottom: 14, lineHeight: 20 }}>{t("sport.intro")}</Text>

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
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 11,
                borderRadius: RADIUS.pill,
                borderWidth: 1,
                borderColor: on ? C.lime : C.line,
                backgroundColor: on ? `${C.lime}1f` : C.ink2,
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
                flex: 1,
                alignItems: "center",
                paddingVertical: 11,
                borderRadius: RADIUS.pill,
                borderWidth: 1,
                borderColor: on ? C.blue : C.line,
                backgroundColor: on ? C.blue : C.ink2,
              }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: 12, color: on ? C.ink : C.ash }}>{l}</Text>
            </Pressable>
          );
        })}
      </View>

      <ACard style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ fontSize: 28 }}>{meta.icon}</Text>
          <View>
            <Text style={{ fontFamily: F.black, fontSize: 20, color: C.chalk }}>{sport}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash, marginTop: 2 }}>{meta.family} · {LEVELS[levelIdx]}</Text>
          </View>
        </View>
      </ACard>

      <ACard style={{ marginBottom: 12 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("sport.prescribed")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 3 }}>
          {rx.personalized ? t("sport.loadsFromLogs") : t("sport.loadsLogPrompt")}
        </Text>
        {rx.blocks.map((b, i) => (
          <View key={b.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, marginTop: i ? 0 : 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{b.name}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: txt(C, C.amber), marginTop: 2 }}>{b.demand}</Text>
            </View>
            <View style={{ alignItems: "flex-end", marginLeft: 8 }}>
              <View style={{ backgroundColor: `${C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: txt(C, C.lime) }}>{b.scheme}</Text>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash, marginTop: 4 }}>{b.loadBasis ?? (b.bodyweight ? "bodyweight / tempo" : "")}</Text>
            </View>
          </View>
        ))}
      </ACard>

      <ACard>
        <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("sport.why")}</Text>
        {rx.ranked.map((e) => (
          <View key={e.name} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.chalk }}>{e.name}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>{e.demand}</Text>
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.chalk, marginTop: 3, lineHeight: 19 }}>{e.why}</Text>
          </View>
        ))}
      </ACard>
    </AuroraScreen>
  );
}
