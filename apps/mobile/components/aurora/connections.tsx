import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { fetchConnections, type Conn, type Provider } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F, PressScale as Pressable } from "../../lib/ui";
import { AuroraScreen, ACard, ASub, RADIUS, withAlpha } from "./kit";
import { CtaLabel } from "./cta-label";

type Palette = ReturnType<typeof useTheme>["palette"];
const statusColor = (s: string, C: Palette) =>
  s === "active" ? C.lime : s === "setup-pending" ? C.amber : s === "rejected" ? C.red : C.ash;

/** AURORA Connections — the provider DIRECTORY. Each provider opens its own
 *  page (/connections/[provider]) where the connect/sync/disconnect actions and
 *  its recent data live; this hub only lists status at a glance. */
export default function AuroraConnections() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const [connections, setConnections] = useState<Conn[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    fetchConnections().then((d) => { setConnections(d.connections); setProviders(d.providers); }).finally(() => setRefreshing(false));
  };
  useEffect(() => { load(); }, []);

  const chip = (color: string, label: string) => (
    <View style={{ backgroundColor: withAlpha(color, 0.12), borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, color), textTransform: "lowercase" }}>{label}</Text>
    </View>
  );

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load} hero={{ rank: "title", title: t("w.account.connections.title") }}>
      <ASub style={{ marginTop: 10 }}>{t("w.account.connections.intro-mobile")}</ASub>

      {providers.map((p) => {
        const conn = connections.find((c) => c.provider === p.id && c.status !== "revoked");
        const status = conn?.status ?? t("w.account.connections.not-connected");
        const statusLabel = conn?.status ? t(`w.account.connections.status-${conn.status}`) : status;
        return (
          <Pressable key={p.id} onPress={() => router.push(`/connections/${p.id}`)}>
            <ACard style={{ marginTop: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: F.black, fontSize: 17, color: C.chalk }}>{p.label}</Text>
                {chip(statusColor(status, C), statusLabel)}
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 6 }}>{t("w.account.connections.provides")} {p.provides.join(", ")}</Text>
              <CtaLabel label={`${t("w.account.connections.open")} →`} color={C.chalk} fontSize={fs.caption} style={{ marginTop: 12 }} />
            </ACard>
          </Pressable>
        );
      })}
    </AuroraScreen>
  );
}
