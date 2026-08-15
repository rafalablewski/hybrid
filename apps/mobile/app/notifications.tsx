import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { View, Text } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { relativeTime, seedPerson, splitNotifications, userPagePath, type NotifItem } from "@hybrid/core";
import { respondFollow, respondEnrollment } from "../lib/social-api";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { leading as lineHeight, fs, space, tracking, F, PressScale as Pressable } from "../lib/ui";
import { AuroraScreen, ACard, ASection, RADIUS } from "../components/aurora/kit";
import { HeroAccessory } from "../components/aurora/hero";
import { AuroraIcon } from "../components/aurora/icons";
import SwipeRow from "../components/swipe-row";
import { useNotifications } from "../lib/use-notifications";
import { dismissNotification, readAllNotifications, readNotification, sweepNotifications, unreadNotification } from "../lib/notif-read";
import { usePersonSource } from "../lib/shared-element";

/**
 * Notifications / activity — one real feed built in @hybrid/core
 * (notifications.ts) from the athlete's logged sessions, coach-assigned
 * sessions, social events AND the feel reads the app is waiting on. Honest
 * empty state until there's real training. Reached from the Aurora Home bell.
 *
 * THREE THINGS THIS SCREEN DOES THAT IT DIDN'T:
 *   • it is LIVE — `useNotifications` polls and revalidates on foreground, so
 *     an event that lands while you're looking at it appears with no reload,
 *     and the Home bell counts the same list;
 *   • it MARKS THINGS READ — opening it sweeps the visible rows read after a
 *     beat (long enough to see what's new), tapping one reads it immediately,
 *     and "Mark all read" does it on demand. The badge can reach zero;
 *   • it REMINDS YOU TO LOG HOW YOU FEEL — the immediate and recovery reads
 *     from feel-schedule ride at the top of the list, and route to the place
 *     that can answer them.
 *
 * TWO SECTIONS AND TWO GESTURES (the Aug 2026 pass, web at parity). A read row
 * used to sit exactly where it had always sat, in one flat list, greyed — so a
 * fortnight of training pushed the one row that wanted something off the bottom
 * of the screen. What has been dealt with now falls into SEEN, under New, and
 * stays there. The line is drawn by the VISIT, not by `read` (@hybrid/core
 * splitNotifications): rows you arrived to hold their place while you read
 * them, because the sweep fires a second and a half after the screen opens and
 * a list that reshuffles under the reader is worse than one that doesn't sort.
 * Each row is a SwipeRow — LEFT deletes it (a tombstone in the read state,
 * since the list is a projection with no table to delete from), RIGHT puts it
 * back to unread and climbs it into New.
 */

/** How long the "New" markers stay visible before the list is swept read. */
const SWEEP_MS = 1500;

export default function Notifications() {
  // The face travels into the page this opens — see lib/shared-element.
  const armPerson = usePersonSource();
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
    // The PASSIVE sweep, which is why it isn't readAllNotifications: a row the
    // athlete has just swiped back to unread must survive it.
    const timer = setTimeout(() => sweepNotifications(snapshot), SWEEP_MS);
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
    // A social notification is ABOUT somebody. Now that a person has a page, it
    // opens them rather than dropping you at the top of the feed to go looking.
    else if (a.kind === "social") {
      if (a.handle) {
        if (n.social?.actor) seedPerson({ handle: a.handle, displayName: n.social.actor.displayName, avatarUrl: n.social.actor.avatarUrl });
        armPerson(a.handle); router.push(userPagePath(a.handle));
      } else router.push("/feed");
    }
  };

  const accentColor = (a: NotifItem["accent"]) => (a === "lime" ? C.lime : a === "blue" ? C.blue : a === "violet" ? C.violet : C.amber);

  // New versus Seen. The rule is shared with web (@hybrid/core) because it is a
  // rule and not a filter — see splitNotifications for why `read` alone can't
  // draw the line.
  const { fresh, seen } = splitNotifications(items, wasNew.current);

  const row = (it: NotifItem): ReactNode => {
    const isNew = wasNew.current.has(it.id);
    const col = accentColor(it.accent);
    const initial = (it.social?.actor?.displayName || it.social?.actor?.handle || "·").slice(0, 1).toUpperCase();
    return (
      <SwipeRow
        key={it.id}
        radius={14}
        marginBottom={14}
        background={C.ink}
        label={t("common.delete")}
        onDelete={() => dismissNotification(it.id)}
        leading={{ label: t("notif.markUnread"), color: C.blue, onAction: () => unreadNotification(it.id) }}
      >
        <Pressable
          onPress={() => open(it)}
          accessibilityRole="button"
          // The two gestures as CUSTOM actions, so they reach the VoiceOver
          // rotor — a swipe is undiscoverable to a reader that never makes one.
          accessibilityActions={[
            { name: "unread", label: t("notif.markUnread") },
            { name: "delete", label: t("common.delete") },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "unread") unreadNotification(it.id);
            else if (e.nativeEvent.actionName === "delete") dismissNotification(it.id);
          }}
          style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}
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
                <Pressable onPress={() => respond(it, true)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: C.lime }}><Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.onAccent }}>{it.social?.kind === "enroll_request" ? "Accept" : "Approve"}</Text></Pressable>
                <Pressable onPress={() => respond(it, false)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line }}><Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk }}>{it.social?.kind === "enroll_request" ? "Decline" : "Deny"}</Text></Pressable>
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
      </SwipeRow>
    );
  };

  const section = (title: string, meta: ReactNode, rows: NotifItem[]): ReactNode =>
    rows.length === 0 ? null : (
      <View style={{ marginTop: 20 }}>
        <ASection title={title} meta={meta} style={{ marginBottom: 12 }} />
        {rows.map(row)}
      </View>
    );

  return (
    <AuroraScreen
      hero={{ rank: "title", title: "Notifications" }}
      // The UNREAD count is a LABEL, so it rides the rail's trailing slot in
      // the metadata voice — not a lime badge welded to the title row. It is
      // the same number the Home bell shows, and it reaches zero.
      accessory={unread > 0 ? <HeroAccessory label={String(unread)} active onDark={false} /> : undefined}
    >
      {items.length === 0 ? (
        <ACard style={{ marginTop: 22 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, lineHeight: lineHeight(fs.bodyLg) }}>
            Nothing yet. Log a session or get one from your coach and your activity shows up here.
          </Text>
        </ACard>
      ) : (
        <>
          {/* The gestures are invisible until you try them, so the screen says
              so once — the same mono aside History uses over its swipe cards. */}
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "right", marginTop: 10 }}>{t("notif.swipeHint")}</Text>
          {section(
            t("notif.new"),
            // Mark-all-read in the head's right slot in the metadata voice —
            // the Explore SectionHead standard, not a button bar.
            unread > 0 ? (
              <Pressable
                onPress={() => readAllNotifications(items.map((i) => ({ id: i.id, at: i.at })))}
                accessibilityRole="button"
                hitSlop={10}
              >
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>
                  {t("notif.markAllRead")}
                </Text>
              </Pressable>
            ) : null,
            fresh,
          )}
          {section(t("notif.seen"), String(seen.length), seen)}
        </>
      )}
    </AuroraScreen>
  );
}
