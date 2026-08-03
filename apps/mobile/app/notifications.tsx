import { useCallback, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { buildActivityFeed, relativeTime, type ActivityAccent, type LoggedSession, type SocialNotifItem } from "@hybrid/core";
import { fetchSessions, fetchAssignments, type Assignment } from "../lib/api";
import { sapi, respondFollow, respondEnrollment } from "../lib/social-api";
import { useTheme, txt } from "../lib/theme";
import { leading, fs, space, F, PressScale as Pressable } from "../lib/ui";
import { AuroraScreen, ACard, RADIUS } from "../components/aurora/kit";
import { HeroAccessory } from "../components/aurora/hero";
import { AuroraIcon } from "../components/aurora/icons";

/**
 * Notifications / activity — a real feed built (in @hybrid/core activity.ts)
 * from the athlete's logged sessions + coach-assigned workouts. Honest empty
 * state until there's real training. Reached from the Aurora Home bell.
 */
export default function Notifications() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [social, setSocial] = useState<SocialNotifItem[]>([]);

  const load = useCallback(() => {
    Promise.all([fetchSessions(), fetchAssignments()]).then(([s, a]) => {
      setSessions(s);
      setAssignments(a);
    });
    sapi<{ notifications?: SocialNotifItem[] }>("/api/social/notifications").then((d) => setSocial(d.notifications ?? []));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const respond = async (n: SocialNotifItem, accept: boolean) => {
    if (n.kind === "follow_request" && n.followerId) await respondFollow({ followerId: n.followerId, action: accept ? "approve" : "deny" });
    else if (n.kind === "enroll_request" && n.enrollmentId) await respondEnrollment({ enrollmentId: n.enrollmentId, action: accept ? "accept" : "decline" });
    load();
  };

  const feed = useMemo(
    () => buildActivityFeed({ sessions, assignments }),
    [sessions, assignments],
  );

  const accentColor = (a: ActivityAccent) => (a === "lime" ? C.lime : a === "blue" ? C.blue : a === "violet" ? C.violet : C.amber);

  return (
    <AuroraScreen
      hero={{ rank: "title", title: "Notifications" }}
      // The unread count is a LABEL, so it rides the rail's trailing slot in
      // the metadata voice — not a lime badge welded to the title row.
      accessory={feed.length + social.length > 0 ? <HeroAccessory label={String(feed.length + social.length)} active onDark={false} /> : undefined}
    >

      {/* SOCIAL — followers, follow/enrol requests, kudos, comments. */}
      {social.length > 0 && (
        <View style={{ marginTop: 18 }}>
          {social.map((n) => {
            const col = accentColor(n.accent);
            return (
              <View key={n.id} style={{ flexDirection: "row", gap: space.md, alignItems: "center", marginBottom: 14 }}>
                <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: `${col}26`, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: F.black, color: txt(C, col) }}>{(n.actor?.displayName || n.actor?.handle || "·").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{n.title}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{n.when}</Text>
                  {n.actionable && (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                      <Pressable onPress={() => respond(n, true)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: C.lime }}><Text style={{ fontFamily: F.bold, fontSize: 12, color: C.onAccent }}>{n.kind === "enroll_request" ? "Accept" : "Approve"}</Text></Pressable>
                      <Pressable onPress={() => respond(n, false)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line }}><Text style={{ fontFamily: F.bold, fontSize: 12, color: C.chalk }}>{n.kind === "enroll_request" ? "Decline" : "Deny"}</Text></Pressable>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {feed.length === 0 && social.length === 0 ? (
        <ACard style={{ marginTop: 22 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, lineHeight: leading(fs.bodyLg) }}>
            Nothing yet. Log a workout or get a session from your coach and your activity shows up here.
          </Text>
        </ACard>
      ) : (
        <View style={{ marginTop: 18 }}>
          {feed.map((it) => {
            const col = accentColor(it.accent);
            return (
              <View key={it.id} style={{ flexDirection: "row", gap: space.md, alignItems: "center", marginBottom: 14 }}>
                <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: `${col}1f`, alignItems: "center", justifyContent: "center" }}>
                  <AuroraIcon name={it.icon} size={22} color={txt(C, col)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{it.title}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{it.detail}</Text>
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{relativeTime(it.at)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </AuroraScreen>
  );
}
