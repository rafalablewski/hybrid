import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, type ViewStyle } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  computePerformanceState,
  performanceTrajectory,
  trainingHeatmap,
  computeAchievements,
  bestE1rmMap,
  lifetimePrCount,
  longestWeekStreak,
  streak,
  toTrainingLog,
  toBiometrics,
  fmtWeight,
  hpiRole,
  athleteId,
  type LoggedSession,
  type Achievement,
  type HeatCell,
  type AuroraIconName,
} from "@hybrid/core";
import {
  fetchSessions,
  fetchSignals,
  fetchConnections,
  fetchCheckins,
  getCoachLinks,
  type CoreSignal,
  type Conn,
  type Checkin,
  type CoachLink,
} from "../../lib/api";
import { useSession } from "../../lib/session";
import { useAccountSettings } from "../../lib/account";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

type P = ReturnType<typeof useTheme>["palette"];

/**
 * AURORA profile — the "You" account screen, an Apple-ID / Tesla-account take on
 * the athlete's identity + a real, earned-data résumé. Every metric is computed
 * from the same engines the rest of the app runs (sessions + signals), so nothing
 * here is fabricated; an empty history degrades to honest zeros / empty states.
 *
 * Sections (top→bottom, matching reference/preview/profile/profile-consensus.html):
 * account hero · spec strip (HPI / streak / PRs) · actions · ID card · HPI hero ·
 * training heatmap · achievements · personal records · module tiles.
 */
export default function AuroraProfile() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const { name, email, role, entitlement, createdYear } = useIdentity();
  const prefs = useLoggerPrefs();

  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [connections, setConnections] = useState<Conn[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [coach, setCoach] = useState<CoachLink | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    // allSettled, not all: these endpoints are independent, so a single failing
    // one (e.g. connections/coach offline) shouldn't blank the whole profile.
    Promise.allSettled([fetchSessions(), fetchSignals(), fetchConnections(), fetchCheckins(), getCoachLinks()])
      .then(([s, sig, conn, cks, links]) => {
        if (s.status === "fulfilled") setSessions(s.value);
        if (sig.status === "fulfilled") setSignals(sig.value);
        if (conn.status === "fulfilled") setConnections(conn.value.connections);
        if (cks.status === "fulfilled") setCheckins(cks.value);
        if (links.status === "fulfilled") setCoach((links.value.asClient ?? []).find((l) => l.status === "ACTIVE") ?? null);
      })
      .finally(() => setRefreshing(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // --- Real computed metrics (the same engines Home/Cockpit run) ---
  const bio = useMemo(() => toBiometrics(signals as unknown as Parameters<typeof toBiometrics>[0]), [signals]);
  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const hpi = state.hpi;
  const hpiColor = roleColor(C, hpiRole(hpi.band));

  // 12-point HPI trace (oldest→today) — the same trajectory engine as the Performance State.
  const hpiTrace = useMemo(() => {
    const series = [...performanceTrajectory(log, 12)].sort((a, b) => b.daysAgo - a.daysAgo).map((p) => p.hpi);
    return series.length ? series : [hpi.score];
  }, [log, hpi.score]);
  const hpiDelta = hpiTrace.length > 1 ? hpiTrace[hpiTrace.length - 1]! - hpiTrace[0]! : 0;

  const heat = useMemo<HeatCell[][]>(() => trainingHeatmap(sessions, 26), [sessions]);
  const achievements = useMemo<Achievement[]>(() => computeAchievements(sessions), [sessions]);
  const prMap = useMemo(() => bestE1rmMap(sessions), [sessions]);
  const topPrs = useMemo(
    () => [...prMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
    [prMap],
  );
  const prCount = useMemo(() => lifetimePrCount(sessions), [sessions]);
  const weekStreakBest = useMemo(() => longestWeekStreak(sessions), [sessions]);
  const dayStreak = useMemo(() => streak(sessions), [sessions]);
  const hasData = sessions.length > 0;

  // Body: latest logged bodyweight (check-in bodyMassKg), most recent first.
  const bodyKg = useMemo(() => {
    const withWeight = checkins
      .filter((c) => typeof c.bodyMassKg === "number")
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return withWeight[0]?.bodyMassKg ?? null;
  }, [checkins]);

  // Devices: a synced connection if any, else the count of linked providers.
  const device = useMemo(() => {
    if (connections.length === 0) return null;
    const synced = connections.find((c) => c.status?.toLowerCase() === "active" || c.lastSyncAt);
    const label = (synced ?? connections[0]!).provider;
    return { label, status: synced ? "synced" : (connections[0]!.status ?? "linked").toLowerCase() };
  }, [connections]);
  const coachName = coach?.coach?.name ?? (coach?.coach?.email ? coach.coach.email.split("@")[0]! : null);

  const initials = useMemo(() => {
    const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "·";
    return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
  }, [name]);

  const tier = entitlement === "paid" ? "FULL" : "FREE";
  const lime = txt(C, C.lime);

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      {/* ACCOUNT HERO — centered avatar + Apple-ID identifier */}
      <View style={{ alignItems: "center" }}>
        <View style={{ width: 98, height: 98 }}>
          <View style={{ width: 98, height: 98, borderRadius: 49, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.black, fontSize: 34, color: lime }}>{initials}</Text>
          </View>
          <Pressable
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            style={{ position: "absolute", right: -1, bottom: -1, width: 30, height: 30, borderRadius: 15, backgroundColor: C.lime, borderWidth: 3, borderColor: C.ink, alignItems: "center", justifyContent: "center" }}
          >
            <AuroraIcon name="settings" size={15} color={C.onAccent} />
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginTop: 15 }}>
          <Text style={{ fontFamily: F.black, fontSize: 25, color: C.chalk, letterSpacing: -0.6 }}>{name}</Text>
          <View style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: lime, letterSpacing: 0.7 }}>{tier}</Text>
          </View>
        </View>
        {/* ONE identity line — the Hybrid ID. (The membership card no longer
            repeats an "Athlete ID"; the email stays as quiet account contact.) */}
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8 }}>
          HYBRID ID · {athleteId(email || name || "")}
        </Text>
        {!!email && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, opacity: 0.8, marginTop: 4 }}>{email}</Text>
        )}
        <Text style={{ fontFamily: F.reg, fontSize: 12.5, color: C.chalk, opacity: 0.85, marginTop: 8 }}>
          {role === "coach" ? "Coach" : "Hybrid Athlete"} · member since {createdYear}
        </Text>
      </View>

      {/* SPEC STRIP — hairline-divided HPI / Streak / PRs */}
      <View style={{ flexDirection: "row", borderWidth: 1, borderColor: C.line, borderRadius: 18, backgroundColor: C.ink2, marginTop: 20 }}>
        <SpecCol C={C} n={`${hpi.score}`} k="HPI" first />
        <SpecCol C={C} n={`${weekStreakBest}w`} k="Streak" />
        <SpecCol C={C} n={`${prCount}`} k="PRs" />
      </View>

      {/* ACTIONS */}
      <View style={{ flexDirection: "row", gap: space.ms, marginTop: 14 }}>
        <Pressable onPress={() => router.push("/settings")} style={{ flex: 1, alignItems: "center", backgroundColor: C.lime, borderRadius: 14, paddingVertical: 13 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>Edit profile</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/statistics")} style={{ flex: 1, alignItems: "center", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 13 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>Share card</Text>
        </Pressable>
      </View>

      <View style={{ height: 1, backgroundColor: C.line, marginVertical: 22 }} />

      {/* ID CARD — premium membership card */}
      <View style={{ position: "relative", borderRadius: 22, padding: 18, overflow: "hidden", borderWidth: 1, borderColor: "#34381f", backgroundColor: "#161814" }}>
        {/* soft lime corner sheen */}
        <View pointerEvents="none" style={{ position: "absolute", top: -60, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: C.lime, opacity: 0.12 }} />
        {/* faint diagonal etch */}
        <View pointerEvents="none" style={{ position: "absolute", top: 30, left: -40, width: 260, height: 1, backgroundColor: C.lime, opacity: 0.06, transform: [{ rotate: "20deg" }] }} />
        <View pointerEvents="none" style={{ position: "absolute", top: 70, left: -40, width: 260, height: 1, backgroundColor: C.lime, opacity: 0.06, transform: [{ rotate: "20deg" }] }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk, letterSpacing: 0.3 }}>
            HYBRID<Text style={{ color: C.lime }}>.</Text> · MEMBERSHIP
          </Text>
          <View style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 4 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: lime, letterSpacing: 0.8 }}>{tier} · MEMBER</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 30 }}>
          <IdMeta C={C} label="Member since" value={`${createdYear}`} />
          <IdMeta C={C} label="Sessions" value={`${sessions.length}`} />
          <IdMeta C={C} label="Index" value={`${hpi.score}`} accent />
        </View>
      </View>

      {/* HPI HERO */}
      <View style={{ marginTop: 14, borderWidth: 1, borderColor: C.line, borderRadius: 22, padding: 18, backgroundColor: C.ink2 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.6, color: C.ash, textTransform: "uppercase" }}>Hybrid Performance Index</Text>
        <Text style={{ fontFamily: F.black, fontSize: 80, lineHeight: 80, letterSpacing: -3, color: C.chalk, marginTop: 10 }}>
          {hpiHead(hpi.score)}<Text style={{ color: C.lime }}>{hpiTail(hpi.score)}</Text>
        </Text>
        <View style={{ alignSelf: "flex-start", borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4, marginTop: 10 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: lime, textTransform: "uppercase" }}>Band · {hpi.band}</Text>
        </View>
        {/* 12-bar HPI trace, latest highlighted lime */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 34, marginTop: 14 }}>
          {(() => {
            const max = Math.max(...hpiTrace, 1);
            const min = Math.min(...hpiTrace);
            const range = max - min || 1;
            return hpiTrace.map((v, i) => (
              <View
                key={i}
                style={{ flex: 1, height: 6 + ((v - min) / range) * 28, borderRadius: 2, backgroundColor: i === hpiTrace.length - 1 ? C.lime : "#2c2f27" }}
              />
            ));
          })()}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 9 }}>
          <Text style={{ color: lime }}>{hpiDelta >= 0 ? "▲ +" : "▼ "}{hpiDelta}</Text> vs first read · strength {hpi.components.strength} · engine {hpi.components.endurance} · recovery {hpi.components.recovery >= 0 ? "+" : ""}{hpi.components.recovery}
        </Text>
      </View>

      {/* TRAINING — 26-week heatmap */}
      <SectionHeader C={C} title="Training" action={`${sessions.length} sessions`} />
      <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 22, backgroundColor: C.ink2, padding: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 2 }}>
          {monthLabels(heat).map((m, i) => (
            <Text key={i} style={{ fontFamily: F.mono, fontSize: 8, color: C.ash, letterSpacing: 0.6 }}>{m}</Text>
          ))}
        </View>
        {/* 7 rows × N week-columns */}
        <View style={{ flexDirection: "row", gap: 3 }}>
          {heat.map((col, ci) => (
            <View key={ci} style={{ flex: 1, gap: 3 }}>
              {col.map((cell, ri) => (
                <View key={ri} style={{ flex: 1, aspectRatio: 1, borderRadius: 2.5, backgroundColor: heatColor(cell.level, C) }} />
              ))}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 11 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 8, color: lime }}>
            {dayStreak.current > 0 ? `${dayStreak.current}-day streak` : weekStreakBest > 0 ? `${weekStreakBest}-week best` : "no streak yet"}
          </Text>
          <View style={{ flex: 1 }} />
          <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash }}>Less</Text>
          {[0, 1, 2, 3, 4].map((l) => (
            <View key={l} style={{ width: 10, height: 10, borderRadius: 2.5, backgroundColor: heatColor(l as HeatCell["level"], C) }} />
          ))}
          <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash }}>More</Text>
        </View>
      </View>

      {/* ACHIEVEMENTS — squared badge tiles */}
      <SectionHeader C={C} title="Achievements" action={`${achievements.filter((a) => a.earned).length} earned`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.ms }}>
        {achievements.map((a) => (
          <View key={a.id} style={{ width: 76, alignItems: "center" }}>
            <View
              style={{
                width: 76,
                height: 76,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: a.earned ? `${C.lime}73` : C.line,
                backgroundColor: a.earned ? "#181a12" : C.ink2,
                alignItems: "center",
                justifyContent: "center",
                opacity: a.earned ? 1 : 0.55,
                ...(a.earned
                  ? { shadowColor: C.lime, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 4 }
                  : {}),
              }}
            >
              <Text style={{ fontSize: 27 }}>{a.earned ? a.icon : "🔒"}</Text>
            </View>
            <Text numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.nano, color: C.ash, marginTop: 8, maxWidth: 76, textAlign: "center" }}>{a.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* PERSONAL RECORDS — top lifts by e1RM */}
      <SectionHeader C={C} title="Personal records" action={hasData ? "by e1RM" : ""} />
      {topPrs.length > 0 ? (
        topPrs.map(([lift, e1rm]) => (
          <View key={lift} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 13, borderWidth: 1, borderColor: C.line, borderRadius: 14, marginBottom: 9, backgroundColor: C.ink2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 11, flex: 1 }}>
              <Text style={{ fontSize: fs.subtitle }}>🏆</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{lift}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, marginTop: 2 }}>e1RM</Text>
              </View>
            </View>
            <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: lime }}>{fmtWeight(e1rm, prefs.units)}</Text>
          </View>
        ))
      ) : (
        <View style={{ padding: 16, borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.ink2 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: 17 }}>Log a strength session and your top lifts appear here, ranked by estimated 1RM.</Text>
        </View>
      )}

      {/* MODULE TILES — Readiness · Body · Devices · Coach */}
      <SectionHeader C={C} title="Your athlete" action="" />
      {/* All four tiles always render (empty states for the unset ones) so the
          grid stays even — equal cards, text in the same place — matching web. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.ms }}>
        <Tile C={C} icon="heart" k="Readiness" big={hasData ? `${state.readiness.score}` : undefined} unit={hasData ? "%" : undefined} sm={hasData ? undefined : "No data yet"} />
        <Tile C={C} icon="user-square" k="Body" sm={bodyKg != null ? fmtWeight(bodyKg, prefs.units) : "Log a weigh-in"} onPress={() => router.push("/checkin")} />
        <Tile C={C} icon="swap" k="Devices" sm={device ? `${device.label} · ${device.status}` : "Connect a device"} onPress={() => router.push("/connections")} />
        <Tile C={C} icon="user" k="Coach" sm={coachName ? `${coachName} · active` : "Find a coach"} onPress={() => router.push("/coach")} />
      </View>

      <View style={{ height: 8 }} />
    </AuroraScreen>
  );
}

// --- Identity: name / email / role / entitlement + account creation year. ---
function useIdentity() {
  const { name, role, entitlement, session } = useSession();
  const acct = useAccountSettings();
  const createdAt = session?.user.created_at ?? null;
  const createdYear = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  return { name, email: acct.email, role, entitlement, createdYear };
}

// HPI head/tail split so the last digit renders lime (matches the mockup's "8|2").
const hpiHead = (n: number) => { const s = `${n}`; return s.length > 1 ? s.slice(0, -1) : ""; };
const hpiTail = (n: number) => `${n}`.slice(-1);

function heatColor(level: HeatCell["level"], C: P): string {
  if (level === 0) return "#1b1e18";
  const op = level === 1 ? 0.28 : level === 2 ? 0.5 : level === 3 ? 0.74 : 1;
  return level === 4 ? C.lime : `${C.lime}${Math.round(op * 255).toString(16).padStart(2, "0")}`;
}

// Evenly-spaced month abbreviations across the heatmap window, from the columns'
// real dates — so the labels track the actual weeks rendered, not a fixed guess.
function monthLabels(heat: HeatCell[][]): string[] {
  if (heat.length === 0) return [];
  const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const picks = [0, 0.33, 0.66, 1];
  const out: string[] = [];
  for (const f of picks) {
    const ci = Math.min(heat.length - 1, Math.round(f * (heat.length - 1)));
    const d = heat[ci]?.[0]?.date;
    out.push(d ? MON[new Date(d).getUTCMonth()]! : "");
  }
  out.push("NOW");
  return out;
}

function SpecCol({ C, n, k, first }: { C: P; n: string; k: string; first?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 15, borderLeftWidth: first ? 0 : 1, borderLeftColor: C.line }}>
      <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, letterSpacing: -0.4 }}>{n}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: 1, color: C.ash, textTransform: "uppercase", marginTop: 5 }}>{k}</Text>
    </View>
  );
}

function IdMeta({ C, label, value, accent }: { C: P; label: string; value: string; accent?: boolean }) {
  return (
    <View>
      <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 1, color: C.ash, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: accent ? txt(C, C.lime) : C.chalk, marginTop: 4 }}>{value}</Text>
    </View>
  );
}

function SectionHeader({ C, title, action }: { C: P; title: string; action: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 13, marginHorizontal: 2 }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk, letterSpacing: -0.2 }}>{title}</Text>
      {!!action && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{action}</Text>}
    </View>
  );
}

function Tile({ C, icon, k, big, unit, sm, onPress }: { C: P; icon: AuroraIconName; k: string; big?: string; unit?: string; sm?: string; onPress?: () => void }) {
  const tileStyle: ViewStyle = { width: "47.6%", flexGrow: 1, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 15, backgroundColor: C.ink2, minHeight: 104, justifyContent: "space-between" };
  return (
    <Pressable style={tileStyle} onPress={onPress} disabled={!onPress}>
      {/* glyph from the Aurora kit (icons1/2/3) — never an emoji */}
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${C.chalk}0f`, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
        <AuroraIcon name={icon} size={17} color={C.chalk} />
      </View>
      {/* fixed-height value row keeps the label + value on the SAME baseline in
          every tile, so the big number and the text tiles line up exactly. */}
      <View>
        <Text style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{k}</Text>
        <View style={{ minHeight: 26, marginTop: 3, justifyContent: "flex-end" }}>
          {big != null ? (
            <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, letterSpacing: -0.4 }}>
              {big}{unit ? <Text style={{ fontSize: fs.caption, color: C.ash }}>{unit}</Text> : null}
            </Text>
          ) : (
            <Text style={{ fontFamily: F.bold, fontSize: 13.5, color: C.chalk }}>{sm}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
