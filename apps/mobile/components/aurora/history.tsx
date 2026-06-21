import { useCallback, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { sessionVolume, prsForSession, blockSummary, type LoggedSession, type AuroraIconName } from "@hybrid/core";
import { fetchSessions, archiveSession, deleteSession } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F, Loading } from "../../lib/ui";
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
    if (ok) load(); else Alert.alert(t("common.error"), archived ? t("history.archiveError") : t("history.restoreError"));
  };
  const onDelete = (s: LoggedSession) => Alert.alert(t("history.deleteWorkout"), `“${s.title}” ${t("history.deleteWorkoutBody")}`, [
    { text: t("common.cancel"), style: "cancel" },
    { text: t("common.delete"), style: "destructive", onPress: async () => { setBusy(s.id); const ok = await deleteSession(s.id); setBusy(null); if (ok) load(); else Alert.alert(t("common.error"), t("history.deleteError")); } },
  ]);

  const chip = (color: string, label: string, icon?: AuroraIconName) => <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${color}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>{icon && <AuroraIcon name={icon} size={11} color={txt(C, color)} />}<Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, color) }}>{label}</Text></View>;
  const action = (label: string, color: string, onPress: () => void, id: string, fill = false) => (
    <Pressable onPress={onPress} disabled={busy === id} style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: color, backgroundColor: fill ? `${color}1a` : "transparent", opacity: busy === id ? 0.5 : 1 }}>
      <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: txt(C, color) }}>{label}</Text>
    </Pressable>
  );

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={() => load(true)}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <AHeading style={{ fontSize: fs.display }}>{t("nav.history")}</AHeading>
        <Pressable onPress={() => { setLoading(true); setShowArchived((v) => !v); }} style={{ marginLeft: "auto", paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: showArchived ? C.blue : C.line, backgroundColor: showArchived ? `${C.blue}1a` : "transparent" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: showArchived ? txt(C, C.blue) : C.ash }}>{t("history.archived")}</Text>
        </Pressable>
      </View>

      {loading ? <Loading /> : sessions.length === 0 ? (
        <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 32 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{showArchived ? t("history.noArchived") : t("history.none")}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, textAlign: "center" }}>{showArchived ? t("history.archivedHint") : t("history.emptyHint")}</Text>
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
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{fmt(s.startedAt)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: space.sm, marginVertical: 8 }}>
                    {chip(C.blue, `${sessionVolume(s.blocks).toLocaleString()} kg`)}
                    {chip(C.ash, `${s.blocks.length} blocks`)}
                    {prCount > 0 && chip(C.lime, `${prCount} PR`, "arrow-up")}
                  </View>
                  {s.blocks.map((b, i) => (
                    <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line }}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{b.name}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{blockSummary(b)}</Text>
                    </View>
                  ))}
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8 }}>{t("history.tapDetail")}</Text>
                </Pressable>
                <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
                  {showArchived ? action(t("common.restore"), C.lime, () => onArchive(s.id, false), s.id, true) : action(t("common.archive"), C.line, () => onArchive(s.id, true), s.id)}
                  {action(t("common.delete"), C.red, () => onDelete(s), s.id, true)}
                </View>
              </ACard>
            );
          })}
        </View>
      )}
    </AuroraScreen>
  );
}
