import { useCallback, useEffect, useState } from "react";
import { View, Text, Linking } from "react-native";
import { fetchConnections, fetchSignals, syncConnection, API_BASE, type Conn, type CoreSignal, type Provider } from "../../lib/api";
import {
  connectHealthKit,
  disconnectHealthKit,
  healthKitAvailability,
  healthKitConnected,
  healthKitLastSync,
  syncHealthKit,
} from "../../lib/healthkit";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F, PressScale as Pressable } from "../../lib/ui";
import { AuroraScreen, ACard, ASub, RADIUS, withAlpha } from "./kit";
import { CtaLabel } from "./cta-label";

type Palette = ReturnType<typeof useTheme>["palette"];
const statusColor = (s: string, C: Palette) =>
  s === "active" ? C.lime : s === "setup-pending" ? C.amber : s === "rejected" || s === "error" ? C.red : C.ash;

/** AURORA Connection detail — ONE provider's own page (parity with the web
 *  focus page): status, connect/sync actions, and the latest Signal rows this
 *  source has written. The Apple page additionally hosts the on-device
 *  HealthKit flow (lib/healthkit.ts). */
export default function AuroraConnectionPage({ provider }: { provider: string }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<Conn[]>([]);
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    Promise.all([fetchConnections(), fetchSignals()])
      .then(([d, sig]) => {
        setConnections(d.connections);
        setProviders(d.providers);
        setSignals(sig.filter((s) => s.source === provider));
      })
      .finally(() => setRefreshing(false));
  }, [provider]);
  useEffect(() => {
    load();
  }, [load]);

  const p = providers.find((x) => x.id === provider);
  const conn = connections.find((c) => c.provider === provider && c.status !== "revoked");
  const status = conn?.status ?? t("w.account.connections.not-connected");
  const statusLabel = conn?.status ? t(`w.account.connections.status-${conn.status}`) : status;

  const sync = async () => {
    setSyncing(true);
    await syncConnection(provider);
    setSyncing(false);
    load();
  };

  const pillBtn = (label: string, onPress: () => void, opts?: { disabled?: boolean; filled?: boolean }) => (
    <Pressable
      onPress={onPress}
      disabled={opts?.disabled}
      style={{
        backgroundColor: opts?.filled ? withAlpha(C.lime, 0.12) : "transparent",
        borderWidth: 1,
        borderColor: opts?.filled ? C.lime : C.line,
        borderRadius: RADIUS.pill,
        paddingVertical: 12,
        alignItems: "center",
        opacity: opts?.disabled ? 0.6 : 1,
        marginTop: 10,
      }}
    >
      <CtaLabel label={label} color={opts?.filled ? txt(C, C.lime) : C.chalk} fontSize={fs.body} />
    </Pressable>
  );

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load} hero={{ rank: "title", title: p?.label ?? provider }}>

      <ACard style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: 17, color: C.chalk }}>{t("w.account.connections.title")}</Text>
          <View style={{ backgroundColor: withAlpha(statusColor(status, C), 0.12), borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, statusColor(status, C)), textTransform: "lowercase" }}>{statusLabel}</Text>
          </View>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 6 }}>
          {t("w.account.connections.provides")} {(p?.provides ?? []).join(", ")}
        </Text>
        {conn?.lastSyncAt ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 4 }}>
            {t("w.account.connections.sync-last")} {new Date(conn.lastSyncAt).toLocaleString()}
          </Text>
        ) : null}

        {p?.auth === "native" ? (
          <AppleHealthSection onChanged={load} />
        ) : p?.auth === "team" ? (
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, marginTop: 16 }}>{t("w.account.connections.team-mobile")}</Text>
        ) : p && !p.configured ? (
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: txt(C, C.amber), marginTop: 16 }}>{t("w.account.connections.awaiting-creds-mobile")}</Text>
        ) : p && conn ? (
          pillBtn(syncing ? t("w.account.connections.syncing") : t("w.account.connections.sync-now"), sync, { disabled: syncing, filled: true })
        ) : p ? (
          pillBtn(`${t("w.account.connections.connect")} →`, () => Linking.openURL(`${API_BASE}/api/connect/${p.id}`).catch(() => {}))
        ) : null}
      </ACard>

      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.black, fontSize: 17, color: C.chalk }}>{t("w.account.connections.recent")}</Text>
        {signals.length === 0 ? (
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 10 }}>{t("w.account.connections.recent-empty")}</Text>
        ) : (
          signals.slice(0, 10).map((s, i) => (
            <View key={`${s.kind}-${s.ts}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{s.kind}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.chalk }}>
                {s.value} {s.unit} – {new Date(s.ts).toLocaleDateString()}
              </Text>
            </View>
          ))
        )}
      </ACard>
    </AuroraScreen>
  );
}

/** The Apple page's on-device flow: request Health access, sync now, disconnect.
 *  Self-contained around lib/healthkit.ts and self-gating — on Android / Expo Go
 *  it renders only the "needs the iOS build" note. */
function AppleHealthSection({ onChanged }: { onChanged: () => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const availability = healthKitAvailability();
  const [connected, setConnected] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<"error" | "sync-failed" | "synced" | null>(null);
  const [written, setWritten] = useState(0);
  // Sessions already matched to a watch workout whose stored read the sync
  // re-took — only worth a line when it actually mended something.
  const [repaired, setRepaired] = useState(0);

  useEffect(() => {
    healthKitConnected().then(setConnected);
    healthKitLastSync().then(setLastSync);
  }, []);

  const connect = async () => {
    setBusy(true);
    setNote(null);
    const r = await connectHealthKit();
    setBusy(false);
    if (!r.ok) {
      setNote("error");
      return;
    }
    setConnected(true);
    onChanged();
  };

  const sync = async () => {
    setBusy(true);
    setNote(null);
    const r = await syncHealthKit();
    setBusy(false);
    if (!r.ok) {
      setNote("sync-failed");
      return;
    }
    setWritten(r.written);
    setRepaired(r.repaired);
    setNote("synced");
    setLastSync(new Date().toISOString());
    onChanged();
  };

  const disconnect = async () => {
    setBusy(true);
    await disconnectHealthKit();
    setBusy(false);
    setConnected(false);
    setNote(null);
    onChanged();
  };

  const btn = (label: string, onPress: () => void, filled: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{
        backgroundColor: filled ? withAlpha(C.lime, 0.12) : "transparent",
        borderWidth: 1,
        borderColor: filled ? C.lime : C.line,
        borderRadius: RADIUS.pill,
        paddingVertical: 12,
        alignItems: "center",
        opacity: busy ? 0.6 : 1,
        marginTop: 10,
      }}
    >
      <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: filled ? txt(C, C.lime) : C.chalk }}>{label}</Text>
    </Pressable>
  );

  if (availability !== "ready") {
    return (
      <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: 17, marginTop: 16 }}>
        {t("w.account.connections.hk-unavailable")}
      </Text>
    );
  }

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: 17 }}>{t("w.account.connections.hk-intro")}</Text>
      {!connected ? (
        btn(busy ? t("w.account.connections.syncing") : t("w.account.connections.hk-connect"), connect, true)
      ) : (
        <>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 10 }}>{t("w.account.connections.hk-connected")}</Text>
          {lastSync ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 4 }}>
              {t("w.account.connections.sync-last")} {new Date(lastSync).toLocaleString()}
            </Text>
          ) : null}
          {btn(busy ? t("w.account.connections.syncing") : t("w.account.connections.sync-now"), sync, true)}
          {btn(t("w.account.connections.disconnect"), disconnect, false)}
        </>
      )}
      {note === "synced" ? (
        <>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 8 }}>
            {t("w.account.connections.hk-synced")} – {written} {t("w.account.connections.hk-samples")}
          </Text>
          {repaired > 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 4 }}>
              {repaired} {t("w.account.connections.hk-repaired")}
            </Text>
          ) : null}
        </>
      ) : note === "error" ? (
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: txt(C, C.red), marginTop: 8 }}>{t("w.account.connections.hk-error")}</Text>
      ) : note === "sync-failed" ? (
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: txt(C, C.red), marginTop: 8 }}>{t("w.account.connections.hk-sync-failed")}</Text>
      ) : null}
    </View>
  );
}
