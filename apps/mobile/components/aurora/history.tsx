import { useCallback, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { sessionVolume, prsForSession, blockSummary, type LoggedSession } from "@hybrid/core";
import { fetchSessions, archiveSession, deleteSession } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { F, Loading } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** AURORA History — logged-session list with archive/restore/delete + PR badges,
 *  reusing the exact session APIs. */
export default function AuroraHistory() {
  const { palette: C } = useTheme();
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
    setLoading(false); setRefreshing(false);
  }, [showArchived]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onArchive = async (id: string, archived: boolean) => {
    setBusy(id); const ok = await archiveSession(id, archived); setBusy(null);
    if (ok) load(); else Alert.alert("Error", `Couldn't ${archived ? "archive" : "restore"} the workout.`);
  };
  const onDelete = (s: LoggedSession) => Alert.alert("Delete workout?", `“${s.title}” will be permanently removed. This can't be undone.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: async () => { setBusy(s.id); const ok = await deleteSession(s.id); setBusy(null); if (ok) load(); else Alert.alert("Error", "Couldn't delete the workout."); } },
  ]);

  const chip = (color: string, label: string) => <View style={{ backgroundColor: `${color}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}><Text style={{ fontFamily: F.mono, fontSize: 10, color: txt(C, color) }}>{label}</Text></View>;
  const action = (label: string, color: string, onPress: () => void, id: string, fill = false) => (
    <Pressable onPress={onPress} disabled={busy === id} style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: color, backgroundColor: fill ? `${color}1a` : "transparent", opacity: busy === id ? 0.5 : 1 }}>
      <Text style={{ fontFamily: F.semi, fontSize: 12, color: txt(C, color) }}>{label}</Text>
    </Pressable>
  );

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={() => load(true)}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <AHeading style={{ fontSize: 26 }}>{t("nav.history")}</AHeading>
        <Pressable onPress={() => { setLoading(true); setShowArchived((v) => !v); }} style={{ marginLeft: "auto", paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: showArchived ? C.blue : C.line, backgroundColor: showArchived ? `${C.blue}1a` : "transparent" }}>
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: showArchived ? txt(C, C.blue) : C.ash }}>Archived</Text>
        </Pressable>
      </View>

      {loading ? <Loading /> : sessions.length === 0 ? (
        <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 32 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.chalk }}>{showArchived ? "No archived workouts" : t("history.none")}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.ash, marginTop: 8, textAlign: "center" }}>{showArchived ? "Workouts you archive show up here." : "Log a workout — it appears here and on the web."}</Text>
        </ACard>
      ) : (
        <View style={{ marginTop: 14 }}>
          {sessions.map((s) => {
            const prCount = prsForSession(sessions, s.id).length;
            return (
              <ACard key={s.id} style={{ marginBottom: 12 }}>
                <Pressable onPress={() => router.push(`/session/${s.id}`)}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk }}>{s.title}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>{fmt(s.startedAt)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginVertical: 8 }}>
                    {chip(C.blue, `${sessionVolume(s.blocks).toLocaleString()} kg`)}
                    {chip(C.ash, `${s.blocks.length} blocks`)}
                    {prCount > 0 && chip(C.lime, `🏆 ${prCount} PR`)}
                  </View>
                  {s.blocks.map((b, i) => (
                    <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line }}>
                      <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.chalk }}>{b.name}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>{blockSummary(b)}</Text>
                    </View>
                  ))}
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 8 }}>{t("history.tapDetail")}</Text>
                </Pressable>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
                  {showArchived ? action("Restore", C.lime, () => onArchive(s.id, false), s.id, true) : action("Archive", C.line, () => onArchive(s.id, true), s.id)}
                  {action("Delete", C.red, () => onDelete(s), s.id, true)}
                </View>
              </ACard>
            );
          })}
        </View>
      )}
    </AuroraScreen>
  );
}
