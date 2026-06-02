import { useCallback, useState } from "react";
import { View, Text } from "react-native";
import { useFocusEffect } from "expo-router";
import { sessionVolume, type LoggedSession, type SessionBlock } from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { Screen, Card, Kicker, Mono, Chip, Loading, C, F } from "../../lib/ui";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function summary(b: SessionBlock): string {
  if (b.kind === "strength") return b.sets.map((s) => `${s.load || "–"}×${s.reps || "–"}`).join(" · ");
  return [b.format, b.minutes ? `${b.minutes} min` : null].filter(Boolean).join(" · ");
}

export default function History() {
  const { t } = useLang();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setSessions(await fetchSessions());
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Refetch whenever the tab regains focus (e.g. right after logging).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen refreshing={refreshing} onRefresh={() => load(true)}>
      <Kicker>{t("nav.history")}</Kicker>
      {loading ? (
        <Loading />
      ) : sessions.length === 0 ? (
        <Card style={{ marginTop: 10, alignItems: "center", paddingVertical: 32 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.chalk }}>{t("history.none")}</Text>
          <Mono style={{ marginTop: 8, textAlign: "center" }}>Log a workout — it appears here and on the web.</Mono>
        </Card>
      ) : (
        <View style={{ marginTop: 10 }}>
          {sessions.map((s) => (
            <Card key={s.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk }}>{s.title}</Text>
                <Mono>{fmt(s.startedAt)}</Mono>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginVertical: 8 }}>
                <Chip color={C.blue}>{sessionVolume(s.blocks).toLocaleString()} kg</Chip>
                <Chip color={C.ash}>{s.blocks.length} blocks</Chip>
              </View>
              {s.blocks.map((b, i) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line }}>
                  <Mono color={C.chalk}>{b.name}</Mono>
                  <Mono>{summary(b)}</Mono>
                </View>
              ))}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
