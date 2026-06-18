import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import {
  prescribeSession,
  computePerformanceState,
  toTrainingLog,
  toBiometrics,
  velocityProfiles,
  type LoggedSession,
} from "@hybrid/core";
import { fetchSessions, fetchAssignments, fetchSignals, type Assignment, type CoreSignal } from "../../lib/api";
import { useSession } from "../../lib/session";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { APill, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

/** AURORA home — schedule-first layout adapted from the Figma kit: a greeting +
 *  avatar, a hero readiness stat, then "Your Schedule" (today's prescribed work
 *  + coach-assigned sessions). Renders the SAME engine data as the classic home. */
export default function AuroraHome() {
  const { palette } = useTheme();
  const router = useRouter();
  const { name } = useSession();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    Promise.all([fetchSessions(), fetchAssignments(), fetchSignals()])
      .then(([s, a, sig]) => {
        setSessions(s);
        setAssignments(a);
        setSignals(sig);
      })
      .catch((err) => console.error("Failed to load home data:", err))
      .finally(() => setRefreshing(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const bio = useMemo(() => toBiometrics(signals as unknown as Parameters<typeof toBiometrics>[0]), [signals]);
  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(
    () => prescribeSession(log, bio, { profiles: velocityProfiles(sessions) }),
    [log, sessions, bio],
  );
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const hasData = sessions.length > 0;

  const upcoming = useMemo(
    () =>
      assignments
        .filter((a) => a.status === "assigned")
        .sort((x, y) => Date.parse(x.date) - Date.parse(y.date))
        .slice(0, 2),
    [assignments],
  );

  // Today's prescribed blocks become the "Today's Activity" schedule rows.
  const todayItems = useMemo(
    () =>
      rx.blocks.slice(0, 3).map((b) => ({
        name: b.name,
        kind: b.kind,
        sub:
          b.kind === "strength"
            ? "Primary lift"
            : b.kind === "conditioning"
              ? b.format
              : `${b.distance ? `${b.distance} km` : "Steady cardio"}`,
      })),
    [rx.blocks],
  );
  // Conditioning opens the interval timer; everything else opens the logger.
  const startItem = (it: { name: string; kind: string }) =>
    it.kind === "conditioning"
      ? router.push(`/interval-timer?title=${encodeURIComponent(it.name)}`)
      : router.push("/workout?source=ai");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={palette.lime} />}
      >
        {/* Greeting + avatar */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ fontFamily: F.reg, fontSize: 16, color: palette.ash }}>Hi,</Text>
            <Text style={{ fontFamily: F.black, fontSize: 28, color: palette.chalk, letterSpacing: -0.5 }}>{name}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: palette.ink2, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }}>
              <AuroraIcon name="search" size={22} color={palette.ash} />
            </View>
            <Pressable onPress={() => router.push("/notifications")} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: palette.ink2, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }}>
              <AuroraIcon name="bell" size={22} color={palette.ash} />
            </Pressable>
          </View>
        </View>

        {/* Hero readiness stat — tap through to full Statistics */}
        <Pressable onPress={() => router.push("/statistics")} style={{ marginTop: 22, backgroundColor: palette.ink2, borderColor: palette.line, borderWidth: 1, borderRadius: RADIUS.card, padding: 22 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: palette.ash }}>
            Today · readiness
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 8 }}>
            <Text style={{ fontFamily: F.black, fontSize: 52, color: palette.chalk }}>{hasData ? rx.readiness : "—"}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 14, color: palette.ash }}>/100</Text>
          </View>
          {hasData ? (
            <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
              <Stat label="HPI" value={String(state.hpi.score)} color={palette.lime} />
              <Stat label="STR" value={String(state.hpi.components.strength)} color={palette.lime} />
              <Stat label="END" value={String(state.hpi.components.endurance)} color={palette.blue} />
            </View>
          ) : (
            <Text style={{ fontFamily: F.reg, fontSize: 13, color: palette.ash, marginTop: 4, lineHeight: 19 }}>
              Log your first workout and your readiness, HPI and schedule build from real training.
            </Text>
          )}
        </Pressable>

        {/* Start workout */}
        <APill
          label={hasData ? "Start today's session" : "Start your first workout"}
          onPress={() => router.push("/workout?source=empty")}
          style={{ marginTop: 18 }}
        />

        {/* Your schedule */}
        <Text style={{ fontFamily: F.black, fontSize: 22, color: palette.chalk, marginTop: 28 }}>Your Schedule</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: palette.ash, marginTop: 6, marginBottom: 12 }}>
          Today&apos;s activity
        </Text>

        {upcoming.map((a) => (
          <ScheduleRow
            key={a.id}
            title={a.name}
            sub={`Assigned · ${new Date(a.date).toLocaleDateString()}`}
            accent={palette.violet}
            onStart={() => router.push("/workout?source=empty")}
          />
        ))}

        {hasData ? (
          todayItems.map((it, i) => (
            <ScheduleRow
              key={`${it.name}-${i}`}
              title={it.name}
              sub={it.sub}
              accent={palette.lime}
              onStart={() => startItem(it)}
            />
          ))
        ) : upcoming.length === 0 ? (
          <View style={{ backgroundColor: palette.ink2, borderColor: palette.line, borderWidth: 1, borderRadius: RADIUS.card, padding: 20 }}>
            <Text style={{ fontFamily: F.reg, fontSize: 14, color: palette.ash, lineHeight: 20 }}>
              Nothing scheduled yet. Start a session and your week fills in from your real training.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  const { palette } = useTheme();
  return (
    <View>
      <Text style={{ fontFamily: F.mono, fontSize: 10, color: palette.ash }}>{label}</Text>
      <Text style={{ fontFamily: F.bold, fontSize: 16, color: txt(palette, color) }}>{value}</Text>
    </View>
  );
}

function ScheduleRow({ title, sub, accent, onStart }: { title: string; sub: string; accent: string; onStart: () => void }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: palette.ink2,
        borderColor: palette.line,
        borderWidth: 1,
        borderRadius: RADIUS.card,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent, marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 16, color: palette.chalk }}>{title}</Text>
          {!!sub && <Text style={{ fontFamily: F.mono, fontSize: 11, color: palette.ash, marginTop: 2 }}>{sub}</Text>}
        </View>
      </View>
      <Pressable onPress={onStart} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: palette.lime, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 9 }}>
        <AuroraIcon name="play" size={15} color={palette.onAccent} />
        <Text style={{ fontFamily: F.bold, fontSize: 13, color: palette.onAccent }}>Start</Text>
      </Pressable>
    </View>
  );
}
