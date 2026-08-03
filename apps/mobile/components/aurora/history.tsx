import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, Animated, PanResponder, FlatList, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sessionVolume, prsForSession, blockSummary, sessionShape, sessionCardioSummary, hasNote, moodDef, tagLabelKey, planSchedule, normalizeHistoryView, type HistoryViewId, type LoggedSession, type AuroraIconName, type MoodDef } from "@hybrid/core";
import { fetchMacrocycle } from "../../lib/api";
import { useSessionActions } from "../../lib/session-actions";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { usePlanOverrides } from "../../lib/plan-overrides";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { leading, fs, space, F, Loading, PressScale as Pressable } from "../../lib/ui";
import { ACard, APill, RADIUS } from "./kit";
import { HeroScreen, HeroAccessory } from "./hero";
import FetchError from "./fetch-error";
import { AuroraIcon } from "./icons";
import { ViewSwitcher, AgendaView, WeeksView, TimelineView, TrendView, type ViewCtx } from "./history-views";
import type { ComponentType } from "react";

// Compile-checked view→component table: adding a HistoryViewId without wiring
// its component here is a type error, not a silent fall-back.
const VIEW_COMPONENTS: Record<HistoryViewId, ComponentType<{ ctx: ViewCtx }>> = {
  agenda: AgendaView,
  weeks: WeeksView,
  timeline: TimelineView,
  trend: TrendView,
};

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
          {!!s.note && <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>{s.note}</Text>}
        </View>
      )}
      {tags.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: m || s.note ? 8 : 0 }}>
          {tags.map((slug) => {
            const k = tagLabelKey(slug);
            return (
              <View key={slug} style={{ backgroundColor: `${C.lime}14`, borderWidth: 1, borderColor: `${C.lime}45`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: lime }}>#{k ? t(k) : slug}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** AURORA History — the five merged History × Calendar layouts behind a view
 *  switcher. Live sessions are managed (archive/delete) from the session
 *  detail screen; the archived screen keeps the classic swipe list — drag a
 *  card left to reveal restore/delete (iOS-native pattern). */
export default function AuroraHistory() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const bw = useBodyweightLookup();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  // null until AsyncStorage resolves — the screen shows a loader instead of
  // painting the classic list and swapping to the saved layout a frame later.
  const [view, setView] = useState<HistoryViewId | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [planStartedAt, setPlanStartedAt] = useState<string | null>(null);
  const manage = useSessionActions();
  const units = useLoggerPrefs().units;
  const { overrides } = usePlanOverrides(planId);

  // Hydrate the persisted layout choice + the enrolled plan (agenda ghosts and
  // block chapters key off the date-anchored schedule; both degrade to nothing
  // when no plan is enrolled).
  useEffect(() => {
    AsyncStorage.getItem(VIEW_KEY).then((v) => setView(normalizeHistoryView(v))).catch(() => setView(normalizeHistoryView(null)));
    fetchMacrocycle().then((m) => { setPlanId(m?.planId ?? null); setPlanStartedAt(m?.planStartedAt ?? null); }).catch(() => {});
  }, []);
  const pickView = (v: HistoryViewId) => {
    setView(v);
    AsyncStorage.setItem(VIEW_KEY, v).catch(() => {});
  };

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

  // No merged layout renders on the archived screen, so skip the schedule
  // build there (the archived `sessions` array would feed it garbage anyway).
  const schedule = useMemo(
    () => (planId && planStartedAt && !showArchived ? planSchedule({ planId, startedAt: planStartedAt, sessions, overrides }) : null),
    [planId, planStartedAt, sessions, overrides, showArchived],
  );
  const viewCtx: ViewCtx = useMemo(
    () => ({ sessions, units, bw, schedule, prs: (id: string) => prCounts.get(id) ?? 0, onOpen: (id: string) => router.push(`/session/${id}`) }),
    [sessions, units, bw, schedule, prCounts, router],
  );

  const chip = (color: string, label: string, icon?: AuroraIconName) => <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${color}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4 }}>{icon && <AuroraIcon name={icon} size={11} color={txt(C, color)} />}<Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, color) }}>{label}</Text></View>;

  // Only archived sessions still render as the classic swipe list (restore /
  // delete live behind the swipe); live history renders the merged layouts.
  // Archived cards don't open the breakdown — the detail route only serves
  // live sessions (fetchable by owner), so tapping would dead-end on notFound.
  const renderItem = ({ item: s }: { item: LoggedSession }) => {
    const prCount = prCounts.get(s.id) ?? 0;
    const actions: SwipeAction[] = [
      { key: "restore", label: t("common.restore"), color: C.lime, onPress: () => void manage.archive(s.id, false) },
      { key: "delete", label: t("common.delete"), color: C.red, onPress: () => manage.confirmDelete(s) },
    ];
    return (
      <SwipeCard C={C} busy={manage.busyId === s.id} actions={actions}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk }}>{s.title}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{fmt(s.startedAt)}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12, flexWrap: "wrap" }}>
          {/* Sport-aware headline chip — a run/match has no tonnage, so cardio
              sessions read distance/time; conditioning-only sessions fall back
              to summed minutes (matches the history-views keyMetric so List
              agrees with the layouts). */}
          {sessionShape(s) === "cardio"
            ? (() => {
                const ct = sessionCardioSummary(s);
                const parts = [ct.distanceKm > 0 ? `${ct.distanceKm.toFixed(1)} km` : null, ct.minutes ? `${ct.minutes} min` : null].filter(Boolean);
                if (parts.length) return chip(C.blue, parts.join(" – "));
                const minutes = s.blocks.reduce((sum, b) => sum + (b.kind !== "strength" ? (b.minutes ?? 0) : 0), 0);
                return chip(C.blue, minutes > 0 ? `${minutes} min` : `${s.blocks.length} ${s.blocks.length === 1 ? t("w.analyze.hist.block") : t("history.blocks")}`);
              })()
            : chip(C.ash, `${sessionVolume(s.blocks, false, bw(s.startedAt)).toLocaleString()} kg`)}
          {chip(C.ash, `${s.blocks.length} ${s.blocks.length === 1 ? t("w.analyze.hist.block") : t("history.blocks")}`)}
          {prCount > 0 && chip(C.lime, `${prCount} PR`, "arrow-up")}
        </View>
        <View style={{ marginTop: 16 }}>
          {s.blocks.map((b, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{b.name}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{blockSummary(b)}</Text>
            </View>
          ))}
        </View>
        {hasNote(s) && <SessionNoteView C={C} s={s} t={t} />}
      </SwipeCard>
    );
  };

  // Archived management keeps the classic swipe list; the five merged layouts
  // (agenda/journal/weeks/timeline/blocks) apply to live history. Until the
  // persisted choice hydrates (view === null) nothing view-specific renders,
  // so the saved layout never flashes another one first.
  const hydrated = view !== null || showArchived;

  // THE HERO — rank `title`. History is an INFORMATION page: its subject is a
  // collection, and a collection has no portrait, so there is no art and the
  // ground is the ambient field. The nav button, the rail's y and the title's
  // baseline are the system's, identical to every other screen (see
  // components/aurora/hero.tsx and packages/core/src/hero.ts).
  const header = (railNode: ReactNode) => (
    <>
      {railNode}
      {/* Swipe hint, once at the top of the archived list. */}
      {showArchived && sessions.length > 0 && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "right", marginTop: 16, marginBottom: 8 }}>{t("w.analyze.hist.swipeHint")}</Text>}
      {/* The merged History × Calendar layouts render inside the list header, so
          the FlatList stays the screen's sole scroller (nav-scroll + refresh).
          Trade-off (known): unlike the archived-list rows, these aggregate
          layouts are NOT virtualized — revisit under the
          mobile-list-virtualization capability. */}
      {!showArchived && view !== null && !loading && !q.isError && sessions.length > 0 && (() => { const V = VIEW_COMPONENTS[view]; return <V ctx={viewCtx} />; })()}
    </>
  );

  // Loading / error / empty all render as the FlatList's empty component (its
  // data is [] in each of those states), so the header (title + toggle) stays.
  // Pre-hydration (saved view not yet read) also shows the loader.
  const empty = loading || !hydrated ? (
    <Loading />
  ) : q.isError ? (
    // A real fetch failure — distinct from a genuine empty history, so an
    // offline / 500 load never masquerades as "no sessions yet".
    <FetchError onRetry={() => q.refetch()} style={{ marginTop: 16 }} />
  ) : (
    <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 32 }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{showArchived ? t("w.analyze.hist.noArchived") : t("w.analyze.hist.noSessions")}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, textAlign: "center" }}>{showArchived ? t("w.analyze.hist.archivedEmpty") : t("history.emptyHint")}</Text>
    </ACard>
  );

  return (
    // `scroller` → the FlatList stays the sole scroller, so the archived list is
    // actually virtualized; the hero still owns the safe area, the collapse
    // track and the scroll clearance. A screen never trades virtualization for
    // a hero.
    <HeroScreen
      hero={{ rank: "title", title: t("nav.history"), meta: [sessions.length ? `${sessions.length} ${t(showArchived ? "history.archived" : "nav.history")}` : null] }}
      back={() => router.back()}
      // The rail's trailing slot — ONE control, in the metadata voice. It used
      // to be a bordered pill in the title row, which is where History invented
      // its own hero.
      accessory={<HeroAccessory label={t("history.archived")} active={showArchived} onPress={() => setShowArchived((v) => !v)} onDark={false} />}
      // The view switcher is a SUB-rail: it docks beneath the collapsed bar
      // rather than scrolling away, so the layout you are in stays addressable.
      rail={!showArchived && view !== null ? <View style={{ paddingVertical: 10 }}><ViewSwitcher view={view} onChange={pickView} /></View> : undefined}
      scroller={(scrollProps, railNode) => (
        <FlatList
          data={showArchived && !loading && !q.isError ? sessions : []}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          ListHeaderComponent={header(railNode)}
          ListEmptyComponent={!hydrated || loading || q.isError || sessions.length === 0 ? empty : null}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={11}
          removeClippedSubviews
          {...scrollProps}
          contentContainerStyle={[scrollProps.contentContainerStyle, { paddingHorizontal: 16 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => q.refetch()} tintColor={C.lime} colors={[C.lime]} />}
        />
      )}
    />
  );
}

/** A card whose manage actions are revealed by dragging it left. Built on
 *  Animated + PanResponder (no gesture-handler dep — matches the live logger's
 *  SwipeRow). Only claims clearly-horizontal drags, so vertical scroll still
 *  works; a tap when open closes the reveal (the card itself doesn't open
 *  anything — archived breakdowns aren't served by the detail route). */
function SwipeCard({ C, busy, actions, children }: {
  C: Palette;
  busy: boolean;
  actions: SwipeAction[];
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
    <View style={{ marginBottom: 12, borderRadius: RADIUS.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 }}>
      <View style={{ borderRadius: RADIUS.card, overflow: "hidden" }}>
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
        <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: tx }], backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card }}>
          <Pressable onPress={() => { if (openRef.current) animate(false); }} style={{ padding: 16 }}>
            {children}
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
