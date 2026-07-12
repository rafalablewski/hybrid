import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SPORTS, SPORT_NAMES, LEVELS, prescribeForSport, type LoggedSession } from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, ABack, RADIUS } from "./kit";

const STORE_KEY = "hybrid.sport";

/** AURORA Sport — sport + level picker driving the shared prescribeForSport
 *  engine, with working loads tuned to the athlete's logged lifts. */
export default function AuroraSport() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginBottom: 8 }}>
        <ABack />
        <AHeading style={{ fontSize: fs.display }}>Sport</AHeading>
      </View>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, marginBottom: 14, lineHeight: 20 }}>{t("sport.intro")}</Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: 12 }}>
        {SPORT_NAMES.map((s) => {
          const on = s === sport;
          return (
            <Pressable
              key={s}
              onPress={() => setSport(s)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.xs,
                paddingHorizontal: 14,
                paddingVertical: 11,
                borderRadius: RADIUS.pill,
                borderWidth: 1,
                borderColor: on ? C.lime : C.line,
                backgroundColor: on ? `${C.lime}1f` : C.ink2,
              }}
            >
              <Text style={{ fontSize: fs.note }}>{SPORTS[s]!.icon}</Text>
              <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: on ? C.chalk : C.ash }}>{s}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", gap: space.sm, marginBottom: 16 }}>
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
                borderColor: on ? C.lime : C.line,
                backgroundColor: on ? C.lime : C.ink2,
              }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: on ? C.onAccent : C.ash }}>{l}</Text>
            </Pressable>
          );
        })}
      </View>

      <ACard style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Text style={{ fontSize: 28 }}>{meta.icon}</Text>
          <View>
            <Text style={{ fontFamily: F.black, fontSize: fs.heading, color: C.chalk }}>{sport}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{meta.family} – {LEVELS[levelIdx]}</Text>
          </View>
        </View>
      </ACard>

      {/* Log the sport itself by hand — opens the logger seeded with this sport
          as an activity (no wearable needed). */}
      <Pressable
        onPress={() => router.push(`/workout?source=sport&sport=${encodeURIComponent(sport)}`)}
        style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: "center", marginBottom: 12 }}
      >
        <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.onAccent }}>＋ {t("sport.logSession").replace("{sport}", sport)}</Text>
      </Pressable>

      <ACard style={{ marginBottom: 12 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("sport.prescribed")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 3 }}>
          {rx.personalized ? t("sport.loadsFromLogs") : t("sport.loadsLogPrompt")}
        </Text>
        {rx.blocks.map((b, i) => (
          <View key={b.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, marginTop: i ? 0 : 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{b.name}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{b.demand}</Text>
            </View>
            <View style={{ alignItems: "flex-end", marginLeft: 8 }}>
              <View style={{ backgroundColor: `${C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{b.scheme}</Text>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 4 }}>{b.loadBasis ?? (b.bodyweight ? "bodyweight / tempo" : "")}</Text>
            </View>
          </View>
        ))}
      </ACard>

      <ACard>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("sport.why")}</Text>
        {rx.ranked.map((e) => (
          <View key={e.name} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{e.name}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{e.demand}</Text>
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 3, lineHeight: 19 }}>{e.why}</Text>
          </View>
        ))}
      </ACard>
    </AuroraScreen>
  );
}
