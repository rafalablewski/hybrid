import { useEffect, useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { fetchConnections, syncConnection, API_BASE, type Conn, type Provider } from "../lib/api";
import { Screen, Card, Kicker, Mono, H1, Chip, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

type Palette = ReturnType<typeof useTheme>["palette"];
const statusColor = (s: string, C: Palette) =>
  s === "active" ? C.lime : s === "setup-pending" ? C.amber : s === "rejected" ? C.red : C.ash;

/** Connections — wearable / sensor providers (HealthKit, WHOOP, Oura…). They
 *  write into the Signal ontology. OAuth providers show "setup pending" until
 *  credentials land. Mobile port. */
export default function Connections() {
  const C = useTheme().palette;
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

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <Kicker>Connections</Kicker>
      <H1>Wearables & sensors</H1>
      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.blue, marginTop: 14 }}>
        <Mono color={C.chalk} style={{ lineHeight: 18 }}>
          Connect a wearable and its recovery data flows into your Athlete Twin. Each provider writes the same Signal shape.
        </Mono>
      </Card>

      {providers.map((p) => {
        const conn = connections.find((c) => c.provider === p.id);
        const status = conn?.status ?? "not connected";
        return (
          <Card key={p.id} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.black, fontSize: 17, color: C.chalk }}>{p.label}</Text>
              <Chip color={statusColor(status, C)}>{status}</Chip>
            </View>
            <Mono color={C.ash} style={{ fontSize: 11, marginTop: 4 }}>provides: {p.provides.join(", ")}</Mono>

            <View style={{ marginTop: 12 }}>
              {p.auth === "native" ? (
                <Mono color={C.chalk} style={{ fontSize: 12, lineHeight: 17 }}>Apple Health connects on-device — available once the native build is installed.</Mono>
              ) : p.auth === "team" ? (
                <Mono color={C.chalk} style={{ fontSize: 12 }}>Provisioned by an admin.</Mono>
              ) : !p.configured ? (
                <Mono color={C.amber} style={{ fontSize: 12 }}>Awaiting API credentials — coming soon.</Mono>
              ) : conn ? (
                <Pressable onPress={() => sync(p.id)} disabled={syncing === p.id} style={{ backgroundColor: `${C.lime}1f`, borderWidth: 1, borderColor: C.lime, borderRadius: 10, paddingVertical: 10, alignItems: "center", opacity: syncing === p.id ? 0.6 : 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 13, color: txt(C, C.lime) }}>
                    {syncing === p.id ? "Syncing…" : conn.lastSyncAt ? `Sync · last ${new Date(conn.lastSyncAt).toLocaleDateString()}` : "Sync now"}
                  </Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => Linking.openURL(`${API_BASE}/api/connect/${p.id}`).catch(() => {})} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.chalk }}>Connect →</Text>
                </Pressable>
              )}
            </View>
          </Card>
        );
      })}
      <View style={{ height: 16 }} />
    </Screen>
  );
}
