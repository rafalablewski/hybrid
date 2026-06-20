import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { buildActivityFeed, relativeTime, type ActivityAccent, type LoggedSession } from "@hybrid/core";
import { fetchSessions, fetchAssignments, type Assignment } from "../lib/api";
import { useTheme, txt } from "../lib/theme";
import { fs, space, F } from "../lib/ui";
import { AuroraScreen, ACard, RADIUS } from "../components/aurora/kit";
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

  const load = useCallback(() => {
    Promise.all([fetchSessions(), fetchAssignments()]).then(([s, a]) => {
      setSessions(s);
      setAssignments(a);
    });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const feed = useMemo(
    () => buildActivityFeed({ sessions, assignments }),
    [sessions, assignments],
  );

  const accentColor = (a: ActivityAccent) => (a === "lime" ? C.lime : a === "blue" ? C.blue : a === "violet" ? C.violet : C.amber);

  return (
    <AuroraScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <Text style={{ fontFamily: F.black, fontSize: 24, color: C.chalk }}>Notifications</Text>
        {feed.length > 0 && (
          <View style={{ marginLeft: "auto", backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.onAccent }}>{feed.length}</Text>
          </View>
        )}
      </View>

      {feed.length === 0 ? (
        <ACard style={{ marginTop: 22 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, lineHeight: 20 }}>
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
