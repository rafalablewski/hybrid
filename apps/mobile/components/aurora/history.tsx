import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, Pressable, Alert, Animated, PanResponder, FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sessionVolume, prsForSession, blockSummary, sessionShape, sessionCardioTotals, hasNote, moodDef, tagLabelKey, planSchedule, normalizeHistoryView, type HistoryViewId, type LoggedSession, type AuroraIconName, type MoodDef } from "@hybrid/core";
import { archiveSession, deleteSession, fetchMacrocycle } from "../../lib/api";
import { auroraScrollClearance } from "../../lib/layout";
import { useNavScrollProps } from "../../lib/nav-scroll";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { usePlanOverrides } from "../../lib/plan-overrides";
import { useSessionsQuery, useRevalidate } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, space, F, Loading } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, ABack, APill, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import { ViewSwitcher, AgendaView, HeatmapView, JournalView, WeeksView, TimelineView, BlocksView, type ViewCtx } from "./history-views";

const VIEW_KEY = "hybrid.historyView";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const moodColorH = (C: Palette, m: MoodDef) => (m.tone === "red" ? C.red : m.tone === "amber" ? C.amber : (txt(C, C.lime) as string));

type SwipeAction = { key: string; label: string; color: string; onPress: () => void };

// The owner's PRIVATE post-workout note (mood dot + text + tags), shown on their
// own history card. Never rendered on any non-owner view.
function SessionNoteView({ C, s, t }: { C: Palette; s: LoggedSession; t: (k: string) => string }) {
  const m = moodDef(s.mood);
  const tags = s.tags ?? [];
  const lime = txt(C, C.lime) as string;
  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
      {(m || !!s.note) && (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
          {m && <View style={{ marginTop: 5, width: 8, height: 8, borderRadius: 4, backgroundColor: moodColorH(C, m) }} />}
          {!!s.note && <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{s.note}</Text>}
        </View>
      )}
      {tags.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: m || s.note ? 8 : 0 }}>
          {tags.map((slug) => {
            const k = tagLabelKey(slug);
            return (
              <View key={slug} style={{ backgroundColor: `${C.lime}14`, borderWidth: 1, borderColor: `${C.lime}45`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: lime }}>#{k ? t(k) : slug}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** AURORA History — logged-session list with PR badges. Manage actions
 *  (archive/restore/delete) live behind a SWIPE: drag a card left to reveal
 *  them (iOS-native pattern), so the resting card is clean — no footer buttons,
 *  no divider lines — and tap still opens the full breakdown. */
export default function AuroraHistory() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const bw = useBodyweightLookup();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<HistoryViewId>("list");
  const [planId, setPlanId] = useState<string | null>(null);
  const [planStartedAt, setPlanStartedAt] = useState<string | null>(null);
  const revalidate = useRevalidate();
  const units = useLoggerPrefs().units;
  const { overrides } = usePlanOverrides(planId);

  // Hydrate the persisted layout choice + the enrolled plan (agenda ghosts and
  // block chapters key off the date-anchored schedule; both degrade to nothing
  // when no plan is enrolled).
  useEffect(() => {
    AsyncStorage.getItem(VIEW_KEY).then((v) => { if (v) setView(normalizeHistoryView(v)); }).catch(() => {});
    fetchMacrocycle().then((m) => { setPlanId(m?.planId ?? null); setPlanStartedAt(m?.planStartedAt ?? null); }).catch(() => {});
  }, []);
  const pickView = (v: HistoryViewId) => {
    setView(v);
    AsyncStorage.setItem(VIEW_KEY, v).catch(() => {});
  };

  const insets = useSafeAreaInsets();
  const navScroll = useNavScrollProps();
  const q = useSessionsQuery({ archived: showArchived });
  const sessions = q.data ?? [];
  const loading = q.isPending;
  const refreshing = q.isFetching;
  useRefreshOnFocus(q.refetch);

  // PR badge counts, computed ONCE per data change (not per card on every
  // render/scroll). prsForSession is O(n) per session, so calling it inline in
  // the list was O(n²) on every render; memoizing lifts it off the render path.
  const prCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessions) m.set(s.id, prsForSession(sessions, s.id).length);
    return m;
  }, [sessions]);

  const schedule = useMemo(
    () => (planId && planStartedAt ? planSchedule({ planId, startedAt: planStartedAt, sessions, overrides }) : null),
    [planId, planStartedAt, sessions, overrides],
  );
  const viewCtx: ViewCtx = useMemo(
    () => ({ sessions, units, bw, schedule, prs: (id: string) => prCounts.get(id) ?? 0, onOpen: (id: string) => router.push(`/session/${id}`) }),
    [sessions, units, bw, schedule, prCounts, router],
  );

  const onArchive = async (id: string, archived: boolean) => {
    setBusy(id); const ok = await archiveSession(id, archived); setBusy(null);
    if (ok) revalidate.sessions(); else Alert.alert(t("common.error"), archived ? t("history.archiveError") : t("history.restoreError"));
  };
  const onDelete = (s: LoggedSession) => Alert.alert(t("history.deleteWorkout"), `“${s.title}” ${t("history.deleteWorkoutBody")}`, [
    { text: t("common.cancel"), style: "cancel" },
    { text: t("common.delete"), style: "destructive", onPress: async () => { setBusy(s.id); const ok = await deleteSession(s.id); setBusy(null); if (ok) revalidate.sessions(); else Alert.alert(t("common.error"), t("history.deleteError")); } },
  ]);

  const chip = (color: string, label: string, icon?: AuroraIconName) => <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${color}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>{icon && <AuroraIcon name={icon} size={11} color={txt(C, color)} />}<Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, color) }}>{label}</Text></View>;

  const renderItem = ({ item: s }: { item: LoggedSession }) => {
    const prCount = prCounts.get(s.id) ?? 0;
    const actions: SwipeAction[] = [
      showArchived
        ? { key: "restore", label: t("common.restore"), color: C.lime, onPress: () => onArchive(s.id, false) }
        : { key: "archive", label: t("common.archive"), color: C.ash, onPress: () => onArchive(s.id, true) },
      { key: "delete", label: t("common.delete"), color: C.red, onPress: () => onDelete(s) },
    ];
    return (
      <SwipeCard C={C} busy={busy === s.id} actions={actions} onOpen={() => router.push(`/session/${s.id}`)}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk }}>{s.title}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{fmt(s.startedAt)}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12, flexWrap: "wrap" }}>
          {/* Sport-aware headline chip — a run/match has no tonnage, so
              cardio sessions read distance·time, not "0 kg" (#4). */}
          {sessionShape(s) === "cardio"
            ? (() => { const ct = sessionCardioTotals(s.blocks); const parts = [ct.distanceKm > 0 ? `${ct.distanceKm.toFixed(1)} km` : null, ct.minutes ? `${ct.minutes} min` : null].filter(Boolean); return chip(C.blue, parts.join(" – ") || t("history.block")); })()
            : chip(C.ash, `${sessionVolume(s.blocks, false, bw(s.startedAt)).toLocaleString()} kg`)}
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
        {hasNote(s) && <SessionNoteView C={C} s={s} t={t} />}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("history.tapDetail")}</Text>
          <AuroraIcon name="arrow-up" size={11} color={C.ash} style={{ transform: [{ rotate: "90deg" }] }} />
        </View>
      </SwipeCard>
    );
  };

  // Archived management stays on the classic list; the six merged layouts
  // (agenda/heatmap/journal/weeks/timeline/blocks) apply to live history.
  const activeView: HistoryViewId = showArchived ? "list" : view;

  const header = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
        <AHeading style={{ fontSize: fs.display }}>{t("nav.history")}</AHeading>
        <Pressable onPress={() => setShowArchived((v) => !v)} style={{ marginLeft: "auto", paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: showArchived ? C.lime : C.line, backgroundColor: showArchived ? `${C.lime}1a` : "transparent" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: showArchived ? txt(C, C.lime) : C.ash }}>{t("history.archived")}</Text>
        </Pressable>
      </View>
      {!showArchived && <ViewSwitcher view={view} onChange={pickView} />}
      {/* Swipe hint, once at the top of the list. */}
      {activeView === "list" && sessions.length > 0 && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "right", marginTop: 14, marginBottom: 8 }}>{t("history.swipeHint")}</Text>}
      {/* The merged History × Calendar layouts render inside the list header, so
          the FlatList stays the screen's sole scroller (nav-scroll + refresh). */}
      {!loading && !q.isError && sessions.length > 0 && (
        activeView === "agenda" ? <AgendaView ctx={viewCtx} />
        : activeView === "heatmap" ? <HeatmapView ctx={viewCtx} />
        : activeView === "journal" ? <JournalView ctx={viewCtx} />
        : activeView === "weeks" ? <WeeksView ctx={viewCtx} />
        : activeView === "timeline" ? <TimelineView ctx={viewCtx} />
        : activeView === "blocks" ? <BlocksView ctx={viewCtx} />
        : null
      )}
    </>
  );

  // Loading / error / empty all render as the FlatList's empty component (its
  // data is [] in each of those states), so the header (title + toggle) stays.
  const empty = loading ? (
    <Loading />
  ) : q.isError ? (
    // A real fetch failure — distinct from a genuine empty history, so an
    // offline / 500 load never masquerades as "no workouts yet".
    <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 32 }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{t("common.loadError")}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, textAlign: "center" }}>{t("common.loadErrorHint")}</Text>
      <APill label={t("common.retry")} variant="soft" onPress={() => q.refetch()} style={{ marginTop: 16, paddingHorizontal: 28 }} />
    </ACard>
  ) : (
    <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 32 }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{showArchived ? t("history.noArchived") : t("history.none")}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, textAlign: "center" }}>{showArchived ? t("history.archivedHint") : t("history.emptyHint")}</Text>
    </ACard>
  );

  return (
    // scroll={false} → the FlatList (below) is the sole scroller, so the list is
    // actually virtualized (nesting it inside AuroraScreen's ScrollView would
    // defeat that). AuroraScreen still provides the SafeArea + Aurora backdrop +
    // entrance animation chrome.
    <AuroraScreen scroll={false} padding={0}>
      <FlatList
        data={activeView === "list" && !loading && !q.isError ? sessions : []}
        keyExtractor={(s) => s.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={loading || q.isError || sessions.length === 0 ? empty : null}
        {...navScroll}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        windowSize={11}
        removeClippedSubviews
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: auroraScrollClearance(insets.bottom) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => q.refetch()} tintColor={C.lime} colors={[C.lime]} />}
      />
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
