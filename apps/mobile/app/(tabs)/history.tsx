import { useCallback, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { sessionVolume, prsForSession, blockSummary, type LoggedSession } from "@hybrid/core";
import { fetchSessions, archiveSession, deleteSession } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { Screen, Card, Kicker, Mono, Chip, Loading, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { useTemplate } from "../../lib/template";
import AuroraHistory from "../../components/aurora/history";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function History() {
  if (useTemplate().template === "aurora") return <AuroraHistory />;
  return <ClassicHistory />;
}

function ClassicHistory() {
  const C = useTheme().palette;
  const { t } = useLang();
  const router = useRouter();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setSessions(await fetchSessions(showArchived ? { archived: true } : undefined));
    setLoading(false);
    setRefreshing(false);
  }, [showArchived]);

  // Refetch whenever the tab regains focus (e.g. right after logging).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onArchive = async (id: string, archived: boolean) => {
    setBusy(id);
    const ok = await archiveSession(id, archived);
    setBusy(null);
    if (ok) load();
    else Alert.alert("Error", `Couldn't ${archived ? "archive" : "restore"} the workout. Please try again.`);
  };
  const onDelete = (s: LoggedSession) => {
    Alert.alert(
      "Delete workout?",
      `“${s.title}” will be permanently removed. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(s.id);
            const ok = await deleteSession(s.id);
            setBusy(null);
            if (ok) load();
            else Alert.alert("Error", "Couldn't delete the workout. Please try again.");
          },
        },
      ],
    );
  };

  return (
    <Screen refreshing={refreshing} onRefresh={() => load(true)}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Kicker>{t("nav.history")}</Kicker>
        <Pressable
          onPress={() => { setLoading(true); setShowArchived((v) => !v); }}
          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: showArchived ? C.blue : C.line, backgroundColor: showArchived ? `${C.blue}1a` : "transparent" }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: showArchived ? C.blue : C.ash }}>Archived</Text>
        </Pressable>
      </View>
      {loading ? (
        <Loading />
      ) : sessions.length === 0 ? (
        <Card style={{ marginTop: 10, alignItems: "center", paddingVertical: 32 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.chalk }}>{showArchived ? "No archived workouts" : t("history.none")}</Text>
          <Mono style={{ marginTop: 8, textAlign: "center" }}>
            {showArchived ? "Workouts you archive show up here." : "Log a workout — it appears here and on the web."}
          </Mono>
        </Card>
      ) : (
        <View style={{ marginTop: 10 }}>
          {sessions.map((s) => {
            const prCount = prsForSession(sessions, s.id).length;
            return (
              <Card key={s.id}>
                <Pressable onPress={() => router.push(`/session/${s.id}`)}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk }}>{s.title}</Text>
                    <Mono>{fmt(s.startedAt)}</Mono>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginVertical: 8 }}>
                    <Chip color={C.blue}>{sessionVolume(s.blocks).toLocaleString()} kg</Chip>
                    <Chip color={C.ash}>{s.blocks.length} blocks</Chip>
                    {prCount > 0 && <Chip color={C.lime}>🏆 {prCount} PR</Chip>}
                  </View>
                  {s.blocks.map((b, i) => (
                    <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line }}>
                      <Mono color={C.chalk}>{b.name}</Mono>
                      <Mono>{blockSummary(b)}</Mono>
                    </View>
                  ))}
                  <Mono color={C.ash} style={{ marginTop: 8, fontSize: 11 }}>{t("history.tapDetail")}</Mono>
                </Pressable>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
                  {showArchived ? (
                    <Pressable
                      onPress={() => onArchive(s.id, false)}
                      disabled={busy === s.id}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.lime, backgroundColor: `${C.lime}1a`, opacity: busy === s.id ? 0.5 : 1 }}
                    >
                      <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.lime }}>Restore</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => onArchive(s.id, true)}
                      disabled={busy === s.id}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.line, opacity: busy === s.id ? 0.5 : 1 }}
                    >
                      <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.ash }}>Archive</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => onDelete(s)}
                    disabled={busy === s.id}
                    style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: `${C.red}55`, backgroundColor: `${C.red}14`, opacity: busy === s.id ? 0.5 : 1 }}
                  >
                    <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.red }}>Delete</Text>
                  </Pressable>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
