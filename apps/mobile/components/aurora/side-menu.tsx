import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Modal, ScrollView, StyleSheet, Animated, Easing, Linking, Pressable as RNPressable, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import {
  avatarInitials,
  groupedNavWithLocks,
  AURORA_NAV_ICONS,
  NAV_ITEMS,
  SIDE_MENU_PRIMARY,
  SIDE_MENU_FOOTER,
  SIDE_MENU_NAMED_IDS,
  SIDE_MENU_WIDTH,
  FUNNEL,
  SEARCH,
  buildGlobalSearchIndex,
  searchGlobal,
  groupGlobalResults,
  navForPersonaWithLocks,
  type AuroraIconName,
  type GlobalResult,
  type GlobalResultKind,
  type SideMenuRow,
  type TodayTabId,
  type NavGroup,
  ALPHA,
} from "@hybrid/core";
import { NAV_HREF } from "../../lib/nav-href";
import { WEB_APP_URL } from "../../lib/api";
import { useSession } from "../../lib/session";
import { usePersona } from "../../lib/persona";
import { useNavAccess } from "../../lib/access";
import { useFlags } from "../../lib/flags";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { track } from "../../lib/track";
import { useExercises } from "../../lib/queries";
import { F, PressScale as Pressable, fs, tracking, ty} from "../../lib/ui";
import { ASearch , RADIUS} from "./kit";
import { AuroraIcon } from "./icons";
import { SETTINGS_ROUTES } from "./settings";
import { HubGlyph } from "./today-tabs";
import { withAlpha } from "./field";

/**
 * THE SIDE MENU (mobile) — the drawer behind the Today header's avatar, the.
 * Rows, order and targets are shared through @hybrid/core side-menu.ts, so the
 * two clients cannot drift.
 *
 * It slides in from the LEFT edge under a scrim, and it is where navigation by
 * name lives now that the bottom bar spends its fourth slot on Messages instead
 * of on the More springboard (see @hybrid/core nav-bar.ts). Five bands:
 *   • IDENTITY — who you are, tapping through to Profile.
 *   • SEARCH — the app's ONLY cross-app search, and the drawer is the honest
 *     home for it: this is already the list of everywhere you can go, so making
 *     it searchable rather than only scrollable is the smallest true version of
 *     the feature. It reaches screens, settings, movements, sports, plans,
 *     recipes and help — one index, ranked by the same engine the exercise
 *     picker uses (@hybrid/core global-search + ranked-search), so "hamstrings"
 *     finds the Romanian Deadlift and "2fa" finds Password & security. The tab
 *     bar could not host it: the iOS 26 detached search slot is deliberately
 *     spent on the Train action, and nav-bar.ts guards that trade with a test.
 *   • THE PRIMARY LIST — Profile, History, the three hub views, Nutrition. The
 *     hub rows switch Today in place, because the drawer lives inside the hub.
 *   • ALL TOOLS — the whole persona-filtered nav, the springboard the More tab
 *     used to be. It GROWS IN PLACE behind a bare ＋ (an arrow would promise a
 *     destination that does not exist), and it is what keeps every screen
 *     reachable now that the More tab is gone.
 *   • THE FOOTER — Connections, Settings and privacy, Help center, smaller,
 *     then Sign out.
 *
 * It is a Modal, so it renders above the native tab bar and the pushed stack
 * rather than inside Today's scroller.
 */

/** The drawer panel's own inset. Deliberately NOT the kit's screen GUTTER: the
 *  panel is its own container floating over the screen, not the screen, so it
 *  sets its own padding — named here so the number is a decision rather than a
 *  literal that reads like the screen gutter. The web twin uses the same 16. */
const PANEL_PAD = 16;

/** One glyph per result kind, so a mixed list is sortable by eye. */
const KIND_ICON: Record<GlobalResultKind, AuroraIconName> = {
  screen: "grid",
  setting: AURORA_NAV_ICONS.settings ?? "settings",
  exercise: AURORA_NAV_ICONS.exercises ?? "list-play",
  sport: AURORA_NAV_ICONS.sport ?? "navigation",
  plan: AURORA_NAV_ICONS.plans ?? "bookmark",
  recipe: "fork-knife",
  help: AURORA_NAV_ICONS.help ?? "info",
};

const GROUP_LABEL: Record<NavGroup, string> = {
  home: "Home", train: "Train", analyze: "Analyze", recovery: "Recovery", social: "Social", teams: "Teams & coaching", account: "Account",
};

export default function AuroraSideMenu({
  open,
  onClose,
  onHubTab,
  activeHub,
}: {
  open: boolean;
  onClose: () => void;
  /** Switch the Today hub in place — passed only when the drawer is opened
   *  FROM the hub. Opened from another tab root (Nutrition), there is no hub on
   *  screen to switch, so the three hub rows route to their standalone screens
   *  instead of pretending to move a control the athlete cannot see. */
  onHubTab?: (tab: TodayTabId) => void;
  /** Which hub view is showing, so its row reads as the current one. Undefined
   *  off the hub, where none of the three is current. */
  activeHub?: TodayTabId;
}) {
  const C = useTheme().palette;
  const pa = usePremiumAccent();
  const router = useRouter();
  const { t } = useLang();
  const { signOut, role, entitlement, name } = useSession();
  const persona = usePersona();
  const access = useNavAccess();
  const { isEnabled } = useFlags();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The index costs a few hundred name normalizations. The drawer is MOUNTED on
  // every tab root and opened on far fewer of them, so it is built on the first
  // open and kept — never on a Today render for a drawer nobody touched.
  const [everOpen, setEverOpen] = useState(false);
  const { catalog, aliasMap } = useExercises();

  const panelW = Math.min(SIDE_MENU_WIDTH, Math.round(screenW * 0.86));
  // The panel travels; the scrim fades with it. One driver, so the two can
  // never disagree about how far open the drawer is.
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!open) { setToolsOpen(false); setQuery(""); return; }
    setEverOpen(true);
    anim.setValue(reduced ? 1 : 0);
    if (reduced) return;
    Animated.timing(anim, { toValue: 1, duration: 320, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  }, [open, reduced, anim]);

  // ── CROSS-APP SEARCH ───────────────────────────────────────────────────────
  // One index over everything the app holds, ranked by the shared engine. Built
  // once per catalog + persona, not per keystroke: normalizing a few hundred
  // names is the expensive half, scoring them is microseconds — which is why
  // there is no debounce here either.
  //
  // These two memos sit ABOVE the closed-drawer early return, and must stay
  // there: below it the component rendered 16 hooks closed and 18 open, so the
  // first tap on the avatar threw "Rendered more hooks than during the previous
  // render" and took the screen down. `everOpen` — not `open` — is what keeps
  // the index off a render for a drawer nobody has touched.
  const searchIndex = useMemo(
    () =>
      !everOpen
        ? []
        : buildGlobalSearchIndex({
            label: (key, fallback) => { const v = t(key); return v === key ? fallback : v; },
            screens: navForPersonaWithLocks(persona, NAV_ITEMS, access)
              .filter(({ item }) => isEnabled(`nav.${item.id}`))
              .map(({ item, locked }) => ({ id: item.id, locked })),
            exercises: catalog,
            aliasMap,
          }),
    [everOpen, t, persona, access, isEnabled, catalog, aliasMap],
  );
  const q = query.trim();
  const found = useMemo(() => (q ? groupGlobalResults(searchGlobal(searchIndex, q, { limit: 40 })) : []), [q, searchIndex]);

  if (!open) return null;

  const label = (id: string, fallback: string) => { const k = `nav.${id}`; const v = t(k); return v === k ? fallback : v; };
  const groupLabel = (g: NavGroup) => { const k = `nav.group.${g}`; const v = t(k); return v === k ? GROUP_LABEL[g] : v; };
  const initials = avatarInitials(name);

  const goHref = (href: Href) => { onClose(); router.push(href); };
  const goId = (id: string) => {
    const href = NAV_HREF[id];
    onClose();
    // A tool with no mobile route opens the web app rather than dead-ending —
    // access someone was granted must never be silently invisible.
    if (href) router.push(href);
    else Linking.openURL(WEB_APP_URL).catch(() => {});
  };
  const pick = (row: SideMenuRow) => {
    if (row.target.kind === "hub") {
      // In the hub: switch it in place. Off the hub: the same three
      // destinations as full screens (NAV_HREF today/performance/feed).
      if (onHubTab) { onClose(); onHubTab(row.target.tab); return; }
      goId(row.target.tab === "dashboard" ? "today" : row.target.tab);
      return;
    }
    goId(row.target.screen);
  };

  /** Where a result goes. A result that only reached the right SCREEN would be
   *  a broken promise — the athlete named the thing, so land on the thing. */
  const openResult = (r: GlobalResult) => {
    track(SEARCH.global, { client: "mobile", kind: r.kind });
    if (r.kind === "screen") {
      if (r.locked) { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: `search-${r.id}` }); goHref("/upgrade"); return; }
      goId(r.id);
      return;
    }
    if (r.kind === "setting") {
      // A few settings live on their own screen; sending those through
      // /settings?cat= would land the athlete on a page that only bounces them
      // onward.
      const own = SETTINGS_ROUTES[r.id as keyof typeof SETTINGS_ROUTES];
      goHref(own ? (own as Href) : { pathname: "/settings", params: { cat: r.id } });
      return;
    }
    if (r.kind === "exercise") { goHref({ pathname: "/exercise", params: { name: r.id } }); return; }
    if (r.kind === "sport") { goHref({ pathname: "/sport-page", params: { name: r.id } }); return; }
    if (r.kind === "plan") { goHref({ pathname: "/plans", params: r.parentId ? { goal: r.parentId, plan: r.id } : { goal: r.id } }); return; }
    if (r.kind === "recipe") { goHref({ pathname: "/nutrition", params: { recipe: r.id } }); return; }
    goHref("/help");
  };

  // ALL TOOLS — everything this persona may see that the drawer hasn't already
  // named. Premium items a free user hasn't unlocked stay VISIBLE with a lock
  // and route to the paywall, so the whole toolkit is legible from here.
  const named = new Set<string>(SIDE_MENU_NAMED_IDS);
  const groups = groupedNavWithLocks(persona, access)
    .map(({ group, items }) => ({
      group: group as NavGroup,
      items: items.filter(({ item }) => isEnabled(`nav.${item.id}`) && !named.has(item.id)),
    }))
    .filter((g) => g.items.length > 0);
  // Onboarding is a re-runnable setup FLOW rather than a nav item, so it is
  // injected into Train exactly as the retired More tab did.
  const train = groups.find((g) => g.group === "train");
  const extras: { id: string; locked: boolean }[] = train ? [{ id: "onboarding", locked: false }] : [];
  const toolCount = groups.reduce((n, g) => n + g.items.length, 0) + extras.length;

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-panelW, 0] });

  const row = (r: SideMenuRow, small: boolean) => {
    const active = r.target.kind === "hub" && r.target.tab === activeHub;
    const tint = small ? C.ash : active ? txt(C, C.lime) : C.chalk;
    return (
      <Pressable
        key={r.id}
        onPress={() => pick(r)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={{ flexDirection: "row", alignItems: "center", gap: small ? 12 : 14, paddingVertical: small ? 9 : 12, paddingHorizontal: 4 }}
      >
        <View style={{ width: small ? 20 : 24, alignItems: "center" }}>
          {r.hub
            ? <HubGlyph name={r.hub} color={tint} size={small ? 18 : 22} strokeWidth={small ? 4 : 3.6} />
            : <AuroraIcon name={r.icon ?? "info"} size={small ? 18 : 22} color={tint} />}
        </View>
        <Text style={{ fontFamily: small ? F.semi : F.black, fontSize: small ? fs.body : fs.title, letterSpacing: small ? 0 : -0.2, color: tint }}>
          {t(r.labelKey) === r.labelKey ? r.label : t(r.labelKey)}
        </Text>
      </Pressable>
    );
  };

  const tool = (id: string, locked: boolean) => {
    const fallback = id === "onboarding" ? "Get started" : id;
    const nm = label(id, fallback);
    return (
      <Pressable
        key={id}
        onPress={() => {
          if (locked) { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: `sidemenu-${id}` }); goHref("/upgrade"); return; }
          goId(id);
        }}
        accessibilityRole="button"
        accessibilityLabel={locked ? `${nm} (Full)` : nm}
        style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 8 }}
      >
        <AuroraIcon name={AURORA_NAV_ICONS[id] ?? "info"} size={17} color={locked ? C.ash : C.chalk} />
        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.body, color: locked ? C.ash : C.chalk }}>{nm}</Text>
        {locked && <AuroraIcon name="lock" size={12} color={pa.text} />}
      </Pressable>
    );
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <RNPressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("nav.closeMenu")} style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }) }]} />
      </RNPressable>

      <Animated.View
        accessibilityViewIsModal
        style={{
          position: "absolute", top: 0, left: 0, bottom: 0, width: panelW,
          backgroundColor: C.ink, borderRightWidth: 1, borderRightColor: C.line,
          transform: [{ translateX }],
        }}
      >
        <ScrollView
          contentContainerStyle={{ paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20), paddingHorizontal: PANEL_PAD }}
          showsVerticalScrollIndicator={false}
        >
          {/* IDENTITY — the avatar again (you opened the drawer from it), the
              name, and what the account is. It goes to Profile, which is also
              the list's first row: the header is the FACE, the row is the
              destination, and people reach for both. */}
          <Pressable onPress={() => goId("profile")} accessibilityRole="button" style={{ marginBottom: 18 }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: withAlpha(C.lime, ALPHA.fill), borderWidth: 1, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.lime) }}>{initials}</Text>
            </View>
            <Text numberOfLines={1} style={{ marginTop: 10, fontFamily: F.black, fontSize: fs.headline, letterSpacing: tracking(fs.headline), color: C.chalk }}>{name || t("nav.you")}</Text>
            <Text style={{ marginTop: 3, fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>
              {[role.toUpperCase(), entitlement === "paid" ? "FULL" : "FREE"].join(" – ")}
            </Text>
          </Pressable>

          {/* SEARCH — the app's only cross-app field. */}
          <ASearch value={query} onChange={setQuery} placeholder={t("nav.searchPh")} />

          {q ? (
            /* RESULTS replace the drawer's own lists: while you are searching,
               the fixed menu underneath is noise, and stacking the two would
               bury the answer below a screenful of navigation. */
            found.length === 0 ? (
              <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, paddingVertical: 18 }}>{t("nav.searchNone")}</Text>
            ) : (
              found.map((g) => (
                <View key={g.kind} style={{ marginBottom: 6 }}>
                  <Text style={{ ...ty(C, "overline"), paddingTop: 12, paddingBottom: 2  }}>
                    {t(`nav.searchKind.${g.kind}`)}
                  </Text>
                  {g.hits.map((h) => (
                    <Pressable
                      key={`${h.value.kind}:${h.value.id}`}
                      onPress={() => openResult(h.value)}
                      accessibilityRole="button"
                      accessibilityLabel={h.value.sub ? `${h.value.title}, ${h.value.sub}` : h.value.title}
                      style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 9, paddingHorizontal: 4 }}
                    >
                      <AuroraIcon name={KIND_ICON[h.value.kind]} size={17} color={h.value.locked ? C.ash : C.chalk} />
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.body, color: h.value.locked ? C.ash : C.chalk }}>{h.value.title}</Text>
                        {!!h.value.sub && (
                          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 1 }}>{h.value.sub}</Text>
                        )}
                      </View>
                      {h.value.locked && <AuroraIcon name="lock" size={12} color={pa.text} />}
                    </Pressable>
                  ))}
                </View>
              ))
            )
          ) : (
            <>
          {/* THE PRIMARY LIST */}
          {SIDE_MENU_PRIMARY.map((r) => row(r, false))}

          {/* ALL TOOLS — grows in place. A bare ＋/− with an ash count, never a
              ringed arrow: nothing opens, the list unfolds where it stands. */}
          {toolCount > 0 && (
            <>
              <Pressable
                onPress={() => setToolsOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: toolsOpen }}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10, paddingVertical: 12, paddingHorizontal: 4 }}
              >
                <View style={{ width: 24, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.headline, lineHeight: 22, color: C.ash }}>{toolsOpen ? "−" : "＋"}</Text>
                </View>
                <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.bodyLg, color: C.ash }}>{t("nav.allTools")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{toolCount}</Text>
              </Pressable>

              {toolsOpen && (
                <View style={{ paddingLeft: 38, paddingBottom: 6 }}>
                  {groups.map(({ group, items }) => (
                    <View key={group} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, paddingBottom: 4 }}>
                        <Text style={ty(C, "overline")}>{groupLabel(group)}</Text>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{items.length + (group === "train" ? extras.length : 0)}</Text>
                      </View>
                      {items.map(({ item, locked }) => tool(item.id, locked))}
                      {group === "train" && extras.map((e) => tool(e.id, e.locked))}
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* UNLOCK FULL — the one accent in the drawer, casual users only. */}
          {persona === "casual" && isEnabled("nav.upgrade") && (
            <Pressable
              onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "sidemenu" }); goHref("/upgrade"); }}
              accessibilityRole="button"
              style={{ marginTop: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: withAlpha(pa.fill, 0.5), borderRadius: RADIUS.field, padding: 16, overflow: "hidden" }}
            >
              <View pointerEvents="none" style={{ position: "absolute", top: -50, right: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: withAlpha(pa.fill, ALPHA.solid) }} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "caps"), color: pa.text }}>{t("w.home.pillnav.upgradeKicker")}</Text>
              <Text style={{ fontFamily: F.black, fontSize: fs.headline, color: C.chalk, marginTop: 6, letterSpacing: tracking(fs.headline) }}>{t("nav.upgrade")}</Text>
              <View style={{ marginTop: 12, alignSelf: "flex-start", backgroundColor: pa.fill, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 7 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: pa.ink }}>{t("w.home.pillnav.goFull")}</Text>
              </View>
            </Pressable>
          )}

          {/* ADMIN — operators only. */}
          {role === "admin" && (
            <Pressable onPress={() => goHref("/admin")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 11, marginTop: 14, paddingVertical: 10, paddingHorizontal: 4 }}>
              <AuroraIcon name="verified" size={18} color={txt(C, C.amber)} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking(fs.micro, "caps"), textTransform: "uppercase", color: txt(C, C.amber) }}>Admin console</Text>
            </Pressable>
          )}

            </>
          )}

          {/* THE FOOTER — the same rows, smaller: about the account, not the
              training. Separated by whitespace, never a hairline rule. */}
          <View style={{ marginTop: 22 }}>
            {SIDE_MENU_FOOTER.map((r) => row(r, true))}
            <Pressable onPress={() => { onClose(); signOut(); }} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, paddingHorizontal: 4 }}>
              <View style={{ width: 20, alignItems: "center" }}>
                <AuroraIcon name="logout" size={18} color={C.ash} />
              </View>
              <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.ash }}>{t("common.signout")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
