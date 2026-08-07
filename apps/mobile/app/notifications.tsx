import { useCallback, useEffect, useRef } from "react";
import { View, Text } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { relativeTime, type NotifItem } from "@hybrid/core";
import { respondFollow, respondEnrollment } from "../lib/social-api";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { leading, fs, space, F, PressScale as Pressable } from "../lib/ui";
import { AuroraScreen, ACard, RADIUS } from "../components/aurora/kit";
import { HeroAccessory } from "../components/aurora/hero";
import { AuroraIcon } from "../components/aurora/icons";
import { useNotifications } from "../lib/use-notifications";
import { readAllNotifications, readNotification } from "../lib/notif-read";

/**
 * Notifications / activity — one real feed built in @hybrid/core
 * (notifications.ts) from the athlete's logged sessions, coach-assigned
 * sessions, social events AND the feel reads the app is waiting on. Honest
 * empty state until there's real training. Reached from the Aurora Home bell.
 *
 * THREE THINGS THIS SCREEN NOW DOES THAT IT DIDN'T:
 *   • it is LIVE — `useNotifications` polls and revalidates on foreground, so
 *     an event that lands while you're looking at it appears with no reload,
 *     and the Home bell counts the same list;
 *   • it MARKS THINGS READ — opening it sweeps the visible rows read after a
 *     beat (long enough to see what's new), tapping one reads it immediately,
 *     and "Mark all read" does it on demand. The badge can reach zero;
 *   • it REMINDS YOU TO LOG HOW YOU FEEL — the immediate and recovery reads
 *     from feel-schedule ride at the top of the list, and route to the place
 *     that can answer them.
 */

/** How long the "New" markers stay visible before the list is swept read. */
const SWEEP_MS = 1500;

export default function Notifications() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { items, unread, refresh } = useNotifications();

  // Which rows were unread AT ANY POINT during this visit. The sweep below
  // clears the badge within a second and a half; without this the highlights
  // would vanish under the reader's eyes at the same moment, which is the
  // opposite of telling them what's new.
  // An RN screen stays MOUNTED in the navigator, so this has to be emptied on
  // each focus — otherwise rows you read on your last visit would still be
  // wearing their "New" dot a week later.
  const wasNew = useRef(new Set<string>());
  useFocusEffect(
    useCallback(() => {
      wasNew.current.clear();
      refresh();
    }, [refresh]),
  );
  for (const it of items) if (!it.read) wasNew.current.add(it.id);

  // THE SWEEP. Deliberately not instant: a badge that empties before the eye
  // reaches the list has told the athlete nothing.
  useEffect(() => {
    if (!unread) return;
    const snapshot = items.map((i) => ({ id: i.id, at: i.at }));
    const timer = setTimeout(() => readAllNotifications(snapshot), SWEEP_MS);
    return () => clearTimeout(timer);
  }, [unread, items]);

  const respond = async (n: NotifItem, accept: boolean) => {
    const s = n.social;
    if (!s) return;
    if (s.kind === "follow_request" && s.followerId) await respondFollow({ followerId: s.followerId, action: accept ? "approve" : "deny" });
    else if (s.kind === "enroll_request" && s.enrollmentId) await respondEnrollment({ enrollmentId: s.enrollmentId, action: accept ? "accept" : "decline" });
    readNotification(n.id);
    refresh();
  };

  const open = (n: NotifItem) => {
    readNotification(n.id);
    const a = n.action;
    if (!a) return;
    if (a.kind === "session") router.push(`/session/${a.sessionId}`);
    else if (a.kind === "checkin") router.push("/checkin");
    else if (a.kind === "calendar") router.push("/calendar");
    else if (a.kind === "social") router.push("/feed");
  };

  const accentColor = (a: NotifItem["accent"]) => (a === "lime" ? C.lime : a === "blue" ? C.blue : a === "violet" ? C.violet : C.amber);

  return (
    <AuroraScreen
      hero={{ rank: "title", title: "Notifications" }}
      // The UNREAD count is a LABEL, so it rides the rail's trailing slot in
      // the metadata voice — not a lime badge welded to the title row. It is
      // the same number the Home bell shows, and it reaches zero.
      accessory={unread > 0 ? <HeroAccessory label={String(unread)} active onDark={false} /> : undefined}
    >
      {/* Mark-all-read in the metadata voice on the right — the Explore
          SectionHead standard, not a button bar. */}
      {unread > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 10 }}>
          <Pressable
            onPress={() => readAllNotifications(items.map((i) => ({ id: i.id, at: i.at })))}
            accessibilityRole="button"
            hitSlop={10}
          >
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.8, textTransform: "uppercase", color: C.ash }}>
              {t("notif.markAllRead")}
            </Text>
          </Pressable>
        </View>
      )}

      {items.length === 0 ? (
        <ACard style={{ marginTop: 22 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, lineHeight: leading(fs.bodyLg) }}>
            Nothing yet. Log a session or get one from your coach and your activity shows up here.
          </Text>
        </ACard>
      ) : (
        <View style={{ marginTop: 18 }}>
          {items.map((it) => {
            const isNew = wasNew.current.has(it.id);
            const col = accentColor(it.accent);
            const initial = (it.social?.actor?.displayName || it.social?.actor?.handle || "·").slice(0, 1).toUpperCase();
            return (
              <Pressable
                key={it.id}
                onPress={() => open(it)}
                accessibilityRole="button"
                style={{ flexDirection: "row", gap: space.md, alignItems: "center", marginBottom: 14 }}
              >
                <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: `${col}${isNew ? "26" : "14"}`, alignItems: "center", justifyContent: "center" }}>
                  {it.source === "social" ? (
                    <Text style={{ fontFamily: F.black, color: txt(C, col) }}>{initial}</Text>
                  ) : (
                    <AuroraIcon name={it.icon} size={22} color={txt(C, col)} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  {/* Unread carries WEIGHT and full chalk; read recedes to ash.
                      The state is legible before the dot is even noticed. */}
                  <Text style={{ fontFamily: isNew ? F.black : F.bold, fontSize: fs.bodyLg, color: isNew ? C.chalk : C.ash }}>
                    {it.titleKey ? t(it.titleKey) : it.title}
                  </Text>
                  {!!it.detail && (
                    <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{it.detail}</Text>
                  )}
                  {it.actionable && (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                      <Pressable onPress={() => respond(it, true)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: C.lime }}><Text style={{ fontFamily: F.bold, fontSize: 12, color: C.onAccent }}>{it.social?.kind === "enroll_request" ? "Accept" : "Approve"}</Text></Pressable>
                      <Pressable onPress={() => respond(it, false)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line }}><Text style={{ fontFamily: F.bold, fontSize: 12, color: C.chalk }}>{it.social?.kind === "enroll_request" ? "Decline" : "Deny"}</Text></Pressable>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{relativeTime(it.at)}</Text>
                  {/* Semantic, not decoration: this row is unread. It sits on
                      the TRAILING edge so it can't read as a header marker. */}
                  {isNew && <View accessibilityLabel={t("notif.new")} style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: C.lime }} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </AuroraScreen>
  );
}
