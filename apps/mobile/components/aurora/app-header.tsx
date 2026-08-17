import { useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { APP_HEADER, APP_HEADER_HEIGHT, avatarInitials, unreadLabel, type TodayTabId , ALPHA} from "@hybrid/core";
import { useSession } from "../../lib/session";
import { useNotifications } from "../../lib/use-notifications";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, PressScale as Pressable } from "../../lib/ui";
import { AuroraIcon } from "./icons";
import AuroraSideMenu from "./side-menu";
import { StreakMark } from "./streak-mark";
import { withAlpha } from "./field";

/**
 * THE APP HEADER — mobile.
 *
 * The lockup row every BOTTOM-NAV TAB ROOT wears, and the only way one may be
 * drawn: avatar, the HYBRID wordmark with the day-streak under it, the bell.
 * Every number lives in packages/core/src/app-header.ts and is shared verbatim
 * with the web twin.
 *
 * IT SOURCES ITS OWN DATA. The name and the unread count come from the shared
 * caches (lib/session, lib/use-notifications) and the streak comes from the
 * shared mark (aurora/streak-mark.tsx), which sources its own — so a second tab
 * renders the identical head by rendering the component: no props to thread,
 * and no chance of Today's streak and Nutrition's streak disagreeing because
 * one screen recomputed it its own way.
 *
 * A tab passes DATA and cannot pass style — the same contract as the hub
 * masthead, and for the same reason: the two copies of this row that used to
 * live inside Today's two screens had already drifted (42dp tiles against 44px,
 * two different placeholders for a nameless athlete) precisely because each
 * file could reach for its own numbers.
 */
export function AppHeader({
  /** Present only on the Today hub: the drawer's three hub rows switch the hub
   *  IN PLACE there. Everywhere else they are ordinary destinations and the
   *  drawer routes to the standalone screens. */
  hub,
}: {
  hub?: { value: TodayTabId; onChange: (tab: TodayTabId) => void };
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { name } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  // The bell badge is the UNREAD count from the shared notifications feed — the
  // same list the screen renders, so the two cannot disagree, and it reaches
  // zero once the athlete has read it.
  const { unread: notifCount } = useNotifications();
  const initials = avatarInitials(name);

  return (
    <>
      {/* THREE COLUMNS, FIXED FLANKS. The row used to be `space-between`, which
          centres its middle child only when both flanks weigh the same — and
          they never did: one tile on the left against a streak pill plus the
          bell on the right. Fixed tiles with a `flex: 1` centre column centre
          the wordmark BY CONSTRUCTION, whatever the flanks carry. */}
      <View style={{ flexDirection: "row", alignItems: "center", height: APP_HEADER_HEIGHT, marginBottom: APP_HEADER.gap.below }}>
        {/* The avatar opens the SIDE MENU (aurora/side-menu.tsx), the drawer
            carrying Profile, History, the three hub views, Nutrition and the
            whole toolbox. */}
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("nav.openMenu")}
          accessibilityState={{ expanded: menuOpen }}
          style={{ width: APP_HEADER.tile.size, height: APP_HEADER.tile.size, borderRadius: APP_HEADER.tile.radius, backgroundColor: withAlpha(C.lime, ALPHA.fill), borderWidth: 1, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontFamily: F.black, fontSize: fs.note, color: txt(C, C.lime) }}>{initials}</Text>
        </Pressable>

        {/* the lockup — the wordmark, and the day-streak on the line under it */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: APP_HEADER.wordmark.size, letterSpacing: APP_HEADER.wordmark.tracking, color: C.chalk }}>
            HYBRID<Text style={{ color: txt(C, C.lime) }}>.</Text>
          </Text>
          {/* THE STREAK (aurora/streak-mark.tsx) — the shared mark, which draws
              itself, sources its own count and opens the history. It renders
              nothing at all when there is no streak, which is why the lockup
              needs no conditional of its own here. */}
          <View style={{ marginTop: APP_HEADER.streak.top }}>
            <StreakMark />
          </View>
        </View>

        <Pressable
          onPress={() => router.push("/notifications")}
          accessibilityRole="button"
          accessibilityLabel={t("w.home.today.notificationsAria")}
          style={{ width: APP_HEADER.tile.size, height: APP_HEADER.tile.size, borderRadius: APP_HEADER.tile.radius, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}
        >
          <AuroraIcon name="bell" size={20} color={C.ash} />
          {notifCount > 0 && (
            <View style={{ position: "absolute", top: APP_HEADER.badge.inset, right: APP_HEADER.badge.inset, minWidth: APP_HEADER.badge.size, height: APP_HEADER.badge.size, paddingHorizontal: 4, borderRadius: APP_HEADER.badge.size / 2, backgroundColor: C.red, borderWidth: APP_HEADER.badge.ring, borderColor: C.ink, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: APP_HEADER.badge.text, color: "#fff" }}>{unreadLabel(notifCount)}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* The drawer rides with the header, on every tab that wears it. It is a
          Modal, so it sits above the native tab bar rather than inside a
          scroller. */}
      <AuroraSideMenu open={menuOpen} onClose={() => setMenuOpen(false)} onHubTab={hub?.onChange} activeHub={hub?.value} />
    </>
  );
}

export default AppHeader;
