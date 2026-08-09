import { useEffect, useRef, useState } from "react";
import { View, Text, Modal, ScrollView, StyleSheet, Animated, Easing, Linking, Pressable as RNPressable, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import {
  groupedNavWithLocks,
  AURORA_NAV_ICONS,
  SIDE_MENU_PRIMARY,
  SIDE_MENU_FOOTER,
  SIDE_MENU_NAMED_IDS,
  SIDE_MENU_WIDTH,
  FUNNEL,
  type SideMenuRow,
  type TodayTabId,
  type NavGroup,
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
import { fs, F, PressScale as Pressable } from "../../lib/ui";
import { AuroraIcon } from "./icons";
import { HubGlyph } from "./today-tabs";

/**
 * THE SIDE MENU (mobile) — the drawer behind the Today header's avatar, the
 * twin of apps/web/components/aurora/side-menu.tsx. Rows, order and targets are
 * shared through @hybrid/core side-menu.ts, so the two clients cannot drift.
 *
 * It slides in from the LEFT edge under a scrim, and it is where navigation by
 * name lives now that the bottom bar spends its fourth slot on Messages instead
 * of on the More springboard (see @hybrid/core nav-bar.ts). Four bands:
 *   • IDENTITY — who you are, tapping through to Profile.
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
  /** Switch the Today hub in place. */
  onHubTab: (tab: TodayTabId) => void;
  /** Which hub view is showing, so its row reads as the current one. */
  activeHub: TodayTabId;
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

  const panelW = Math.min(SIDE_MENU_WIDTH, Math.round(screenW * 0.86));
  // The panel travels; the scrim fades with it. One driver, so the two can
  // never disagree about how far open the drawer is.
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!open) { setToolsOpen(false); return; }
    anim.setValue(reduced ? 1 : 0);
    if (reduced) return;
    Animated.timing(anim, { toValue: 1, duration: 320, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  }, [open, reduced, anim]);

  if (!open) return null;

  const label = (id: string, fallback: string) => { const k = `nav.${id}`; const v = t(k); return v === k ? fallback : v; };
  const groupLabel = (g: NavGroup) => { const k = `nav.group.${g}`; const v = t(k); return v === k ? GROUP_LABEL[g] : v; };
  const initials = ((name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!).join("") || "·").toUpperCase();

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
    if (row.target.kind === "hub") { onClose(); onHubTab(row.target.tab); return; }
    goId(row.target.screen);
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
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: `${C.lime}22`, borderWidth: 1, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.lime) }}>{initials}</Text>
            </View>
            <Text numberOfLines={1} style={{ marginTop: 10, fontFamily: F.black, fontSize: fs.heading, letterSpacing: -0.4, color: C.chalk }}>{name || t("nav.you")}</Text>
            <Text style={{ marginTop: 3, fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>
              {[role.toUpperCase(), entitlement === "paid" ? "FULL" : "FREE"].join(" – ")}
            </Text>
          </Pressable>

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
                  <Text style={{ fontFamily: F.mono, fontSize: 20, lineHeight: 22, color: C.ash }}>{toolsOpen ? "−" : "＋"}</Text>
                </View>
                <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.bodyLg, color: C.ash }}>{t("nav.allTools")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{toolCount}</Text>
              </Pressable>

              {toolsOpen && (
                <View style={{ paddingLeft: 38, paddingBottom: 6 }}>
                  {groups.map(({ group, items }) => (
                    <View key={group} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, paddingBottom: 4 }}>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash }}>{groupLabel(group)}</Text>
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
              style={{ marginTop: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: `${pa.fill}80`, borderRadius: 22, padding: 16, overflow: "hidden" }}
            >
              <View pointerEvents="none" style={{ position: "absolute", top: -50, right: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: `${pa.fill}24` }} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 2, color: pa.text }}>{t("w.home.pillnav.upgradeKicker")}</Text>
              <Text style={{ fontFamily: F.black, fontSize: 20, color: C.chalk, marginTop: 6, letterSpacing: -0.4 }}>{t("nav.upgrade")}</Text>
              <View style={{ marginTop: 12, alignSelf: "flex-start", backgroundColor: pa.fill, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: pa.ink }}>{t("w.home.pillnav.goFull")}</Text>
              </View>
            </Pressable>
          )}

          {/* ADMIN — operators only. */}
          {role === "admin" && (
            <Pressable onPress={() => goHref("/admin")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 11, marginTop: 14, paddingVertical: 10, paddingHorizontal: 4 }}>
              <AuroraIcon name="verified" size={18} color={txt(C, C.amber)} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.2, textTransform: "uppercase", color: txt(C, C.amber) }}>Admin console</Text>
            </Pressable>
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
