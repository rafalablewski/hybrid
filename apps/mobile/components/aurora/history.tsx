import { useRef, useState, type ReactNode } from "react";
import { View, Text, Pressable, Alert, Animated, PanResponder } from "react-native";
import { useRouter } from "expo-router";
import { sessionVolume, prsForSession, blockSummary, sessionShape, sessionCardioTotals, type LoggedSession, type AuroraIconName } from "@hybrid/core";
import { archiveSession, deleteSession } from "../../lib/api";
import { useSessionsQuery, useRevalidate } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, space, F, Loading } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, ABack, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

type SwipeAction = { key: string; label: string; color: string; onPress: () => void };

/** AURORA History — logged-session list with PR badges. Manage actions
 *  (archive/restore/delete) live behind a SWIPE: drag a card left to reveal
 *  them (iOS-native pattern), so the resting card is clean — no footer buttons,
 *  no divider lines — and tap still opens the full breakdown. */
export default function AuroraHistory() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const revalidate = useRevalidate();

  const q = useSessionsQuery({ archived: showArchived });
  const sessions = q.data ?? [];
  const loading = q.isPending;
  const refreshing = q.isFetching;
  useRefreshOnFocus(q.refetch);

  const onArchive = async (id: string, archived: boolean) => {
    setBusy(id); const ok = await archiveSession(id, archived); setBusy(null);
    if (ok) revalidate.sessions(); else Alert.alert(t("common.error"), archived ? t("history.archiveError") : t("history.restoreError"));
  };
  const onDelete = (s: LoggedSession) => Alert.alert(t("history.deleteWorkout"), `“${s.title}” ${t("history.deleteWorkoutBody")}`, [
    { text: t("common.cancel"), style: "cancel" },
    { text: t("common.delete"), style: "destructive", onPress: async () => { setBusy(s.id); const ok = await deleteSession(s.id); setBusy(null); if (ok) revalidate.sessions(); else Alert.alert(t("common.error"), t("history.deleteError")); } },
  ]);

  const chip = (color: string, label: string, icon?: AuroraIconName) => <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${color}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>{icon && <AuroraIcon name={icon} size={11} color={txt(C, color)} />}<Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, color) }}>{label}</Text></View>;

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={() => q.refetch()}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
        <AHeading style={{ fontSize: fs.display }}>{t("nav.history")}</AHeading>
        <Pressable onPress={() => setShowArchived((v) => !v)} style={{ marginLeft: "auto", paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: showArchived ? C.lime : C.line, backgroundColor: showArchived ? `${C.lime}1a` : "transparent" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: showArchived ? txt(C, C.lime) : C.ash }}>{t("history.archived")}</Text>
        </Pressable>
      </View>

      {loading ? <Loading /> : sessions.length === 0 ? (
        <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 32 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{showArchived ? t("history.noArchived") : t("history.none")}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, textAlign: "center" }}>{showArchived ? t("history.archivedHint") : t("history.emptyHint")}</Text>
        </ACard>
      ) : (
        <View style={{ marginTop: 14 }}>
          {/* Swipe hint, once at the top of the list. */}
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "right", marginBottom: 8 }}>{t("history.swipeHint")}</Text>
          {sessions.map((s) => {
            const prCount = prsForSession(sessions, s.id).length;
            const actions: SwipeAction[] = [
              showArchived
                ? { key: "restore", label: t("common.restore"), color: C.lime, onPress: () => onArchive(s.id, false) }
                : { key: "archive", label: t("common.archive"), color: C.ash, onPress: () => onArchive(s.id, true) },
              { key: "delete", label: t("common.delete"), color: C.red, onPress: () => onDelete(s) },
            ];
            return (
              <SwipeCard key={s.id} C={C} busy={busy === s.id} actions={actions} onOpen={() => router.push(`/session/${s.id}`)}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk }}>{s.title}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{fmt(s.startedAt)}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12, flexWrap: "wrap" }}>
                  {/* Sport-aware headline chip — a run/match has no tonnage, so
                      cardio sessions read distance·time, not "0 kg" (#4). */}
                  {sessionShape(s) === "cardio"
                    ? (() => { const ct = sessionCardioTotals(s.blocks); const parts = [ct.distanceKm > 0 ? `${ct.distanceKm.toFixed(1)} km` : null, ct.minutes ? `${ct.minutes} min` : null].filter(Boolean); return chip(C.blue, parts.join(" – ") || t("history.block")); })()
                    : chip(C.ash, `${sessionVolume(s.blocks).toLocaleString()} kg`)}
                  {chip(C.ash, `${s.blocks.length} ${s.blocks.length === 1 ? t("history.block") : t("history.blocks")}`)}
                  {prCount > 0 && chip(C.lime, `${prCount} PR`, "arrow-up")}
                </View>
                <View style={{ marginTop: 14 }}>
                  {s.blocks.map((b, i) => (
                    <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{b.name}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{blockSummary(b)}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("history.tapDetail")}</Text>
                  <AuroraIcon name="arrow-up" size={11} color={C.ash} style={{ transform: [{ rotate: "90deg" }] }} />
                </View>
              </SwipeCard>
            );
          })}
        </View>
      )}
    </AuroraScreen>
  );
}

/** A card whose manage actions are revealed by dragging it left. Built on
 *  Animated + PanResponder (no gesture-handler dep — matches the live logger's
 *  SwipeRow). Only claims clearly-horizontal drags, so vertical scroll + tap
 *  still work; a tap when open closes the reveal instead of navigating. */
function SwipeCard({ C, busy, actions, onOpen, children }: {
  C: Palette;
  busy: boolean;
  actions: SwipeAction[];
  onOpen: () => void;
  children: ReactNode;
}) {
  const TILE = 88;
  const reveal = TILE * actions.length;
  const tx = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  const animate = (open: boolean) => {
    openRef.current = open;
    Animated.spring(tx, { toValue: open ? -revealRef.current : 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
  };
  // The PanResponder is created once, so its callbacks would close over the
  // first render's values. Read `reveal` + `animate` through refs (kept current
  // each render) so the gesture never acts on a stale closure.
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  const animateRef = useRef(animate);
  animateRef.current = animate;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderMove: (_, g) => {
        const base = openRef.current ? -revealRef.current : 0;
        tx.setValue(Math.max(-revealRef.current, Math.min(0, base + g.dx)));
      },
      onPanResponderRelease: (_, g) => animateRef.current(openRef.current ? g.dx < 60 : g.dx < -60),
    }),
  ).current;
  return (
    <View style={{ marginBottom: 12, borderRadius: 26, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 }}>
      <View style={{ borderRadius: 26, overflow: "hidden" }}>
        {/* Revealed actions, pinned to the right behind the card. */}
        <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, flexDirection: "row" }}>
          {actions.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => { animate(false); a.onPress(); }}
              disabled={busy}
              style={{ width: TILE, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: `${a.color}26`, opacity: busy ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: txt(C, a.color) }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
        {/* The card itself — opaque so the actions don't bleed through. */}
        <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: tx }], backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 26 }}>
          <Pressable onPress={() => (openRef.current ? animate(false) : onOpen())} style={{ padding: 18 }}>
            {children}
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
