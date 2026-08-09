import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { APP_HEADER, APP_HEADER_HEIGHT, avatarInitials, computeAccountability, unreadLabel, type TodayTabId } from "@hybrid/core";
import { useSessionsRead } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { useNotifications } from "../../lib/use-notifications";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, FIXED_FONT_SCALE, PressScale as Pressable } from "../../lib/ui";
import { AuroraIcon } from "./icons";
import AuroraSideMenu from "./side-menu";

/**
 * THE APP HEADER — mobile.
 *
 * The lockup row every BOTTOM-NAV TAB ROOT wears, and the only way one may be
 * drawn: avatar, the HYBRID wordmark with the day-streak under it, the bell.
 * Every number lives in packages/core/src/app-header.ts and is shared verbatim
 * with the web twin (apps/web/components/aurora/app-header.tsx).
 *
 * IT SOURCES ITS OWN DATA. The name, the streak and the unread count all come
 * from the shared caches (lib/session, lib/queries, lib/use-notifications), so
 * a second tab renders the identical head by rendering the component — no
 * props to thread, and no chance of Today's streak and Nutrition's streak
 * disagreeing because one screen recomputed it its own way. React Query dedupes
 * the sessions read, so the second consumer costs no request.
 *
 * A tab passes DATA and cannot pass style — the same contract as the hub
 * masthead, and for the same reason: the two copies of this row that used to
 * live inside Today's two screens had already drifted (42dp tiles against 44px,
 * two different placeholders for a nameless athlete) precisely because each
 * file could reach for its own numbers.
 */
export function AppHeader({
  /** What the streak caption opens. Today hands it the done-today sheet, which
   *  is Today's own and day-scoped. A tab with nothing to show for it (its
   *  streak is a MARK there, not a control) simply omits this, and the caption
   *  renders as plain text rather than a button that goes nowhere. */
  onStreak,
  /** Present only on the Today hub: the drawer's three hub rows switch the hub
   *  IN PLACE there. Everywhere else they are ordinary destinations and the
   *  drawer routes to the standalone screens. */
  hub,
}: {
  onStreak?: () => void;
  hub?: { value: TodayTabId; onChange: (tab: TodayTabId) => void };
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { name } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const sessions = useSessionsRead().data ?? [];
  const streak = useMemo(() => computeAccountability(sessions, { targetPerWeek: 3 }).streak.current, [sessions]);
  // The bell badge is the UNREAD count from the shared notifications feed — the
  // same list the screen renders, so the two cannot disagree, and it reaches
  // zero once the athlete has read it.
  const { unread: notifCount } = useNotifications();
  const initials = avatarInitials(name);

  const streakLine = (
    <>
      <AuroraIcon name="flame" size={APP_HEADER.streak.icon} color={txt(C, C.red)} />
      {/* one line, always: PL/DE carry longer words ("-dniowa seria",
          "-Tage-Serie") and a wrapped caption would push the lockup taller
          than the tiles beside it. */}
      <Text
        maxFontSizeMultiplier={FIXED_FONT_SCALE}
        numberOfLines={1}
        style={{ fontFamily: F.mono, fontSize: APP_HEADER.streak.size, letterSpacing: APP_HEADER.streak.tracking, textTransform: "uppercase", color: txt(C, C.red) }}
      >
        {streak}{t("w.home.today.dayStreak")}
      </Text>
    </>
  );
  const streakRow = { flexDirection: "row" as const, alignItems: "center" as const, gap: APP_HEADER.streak.gap, marginTop: APP_HEADER.streak.top };

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
          style={{ width: APP_HEADER.tile.size, height: APP_HEADER.tile.size, borderRadius: APP_HEADER.tile.radius, backgroundColor: `${C.lime}22`, borderWidth: 1, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontFamily: F.black, fontSize: fs.note, color: txt(C, C.lime) }}>{initials}</Text>
        </Pressable>

        {/* the lockup — the wordmark, and the day-streak on the line under it */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: APP_HEADER.wordmark.size, letterSpacing: APP_HEADER.wordmark.tracking, color: C.chalk }}>
            HYBRID<Text style={{ color: txt(C, C.lime) }}>.</Text>
          </Text>
          {/* SPECTRUM: the streak wears the warm terracotta accent (Connect),
              pairing with the flame and keeping chartreuse for the primary
              action. */}
          {streak > 0 && (
            onStreak ? (
              <Pressable onPress={onStreak} hitSlop={{ top: 8, bottom: 10, left: 20, right: 20 }} accessibilityRole="button" style={streakRow}>
                {streakLine}
              </Pressable>
            ) : (
              <View style={streakRow}>{streakLine}</View>
            )
          )}
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
