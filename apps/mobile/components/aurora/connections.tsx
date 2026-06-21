import { useEffect, useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { fetchConnections, syncConnection, API_BASE, type Conn, type Provider } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, ASub, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

type Palette = ReturnType<typeof useTheme>["palette"];
const statusColor = (s: string, C: Palette) =>
  s === "active" ? C.lime : s === "setup-pending" ? C.amber : s === "rejected" ? C.red : C.ash;

/** AURORA Connections — wearable/sensor providers, reusing the exact
 *  fetchConnections / syncConnection / OAuth-link flow as the classic. */
export default function AuroraConnections() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const [connections, setConnections] = useState<Conn[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    fetchConnections().then((d) => { setConnections(d.connections); setProviders(d.providers); }).finally(() => setRefreshing(false));
  };
  useEffect(() => { load(); }, []);

  const sync = async (id: string) => { setSyncing(id); await syncConnection(id); setSyncing(null); load(); };

  const chip = (color: string, label: string) => (
    <View style={{ backgroundColor: `${color}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, color), textTransform: "lowercase" }}>{label}</Text>
    </View>
  );

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: fs.display }}>{t("w.account.connections.title")}</AHeading>
      </View>
      <ASub style={{ marginTop: 10 }}>{t("w.account.connections.intro-mobile")}</ASub>

      {providers.map((p) => {
        const conn = connections.find((c) => c.provider === p.id);
        const status = conn?.status ?? t("w.account.connections.not-connected");
        return (
          <ACard key={p.id} style={{ marginTop: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.black, fontSize: 17, color: C.chalk }}>{p.label}</Text>
              {chip(statusColor(status, C), status)}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 6 }}>{t("w.account.connections.provides")} {p.provides.join(", ")}</Text>

            <View style={{ marginTop: 14 }}>
              {p.auth === "native" ? (
                <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: 17 }}>{t("w.account.connections.native-mobile")}</Text>
              ) : p.auth === "team" ? (
                <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk }}>{t("w.account.connections.team-mobile")}</Text>
              ) : !p.configured ? (
                <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: txt(C, C.amber) }}>{t("w.account.connections.awaiting-creds-mobile")}</Text>
              ) : conn ? (
                <Pressable onPress={() => sync(p.id)} disabled={syncing === p.id} style={{ backgroundColor: `${C.lime}1f`, borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center", opacity: syncing === p.id ? 0.6 : 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.lime) }}>
                    {syncing === p.id ? t("w.account.connections.syncing") : conn.lastSyncAt ? `${t("w.account.connections.sync-last")} ${new Date(conn.lastSyncAt).toLocaleDateString()}` : t("w.account.connections.sync-now")}
                  </Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => Linking.openURL(`${API_BASE}/api/connect/${p.id}`).catch(() => {})} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.account.connections.connect")} →</Text>
                </Pressable>
              )}
            </View>
          </ACard>
        );
      })}
    </AuroraScreen>
  );
}
