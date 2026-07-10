import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import {
  computePerformanceState,
  performanceTrajectory,
  trainingHeatmap,
  computeAchievements,
  bestE1rmMap,
  longestWeekStreak,
  streak,
  toTrainingLog,
  toBiometrics,
  fmtWeight,
  fmtTonnage,
  sessionVolume,
  athleteId,
  canSeeHPI,
  type LoggedSession,
  type Achievement,
  type HeatCell,
  type AuroraIconName,
} from "@hybrid/core";
import {
  fetchSessions,
  fetchSignals,
  type CoreSignal,
} from "../../lib/api";
import { useSession } from "../../lib/session";
import { usePersona } from "../../lib/persona";
import { useLang } from "../../lib/i18n";
import { useAccountSettings } from "../../lib/account";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useTheme, txt } from "../../lib/theme";
import { fs, F } from "../../lib/ui";
import { AuroraScreen, RADIUS, Ring, Spark } from "./kit";
import { getMyProfile, getConnections, getLeaderboard } from "../../lib/social-api";
import { AuroraIcon } from "./icons";

type P = ReturnType<typeof useTheme>["palette"];
type TabId = "overview" | "prs" | "activity";

/**
 * AURORA profile — the "You" account screen, reworked into the SOCIAL layout: a
 * cover banner, an overlapping avatar with an edit icon (the shared "settings"
 * glyph — there is no pencil PNG in apps/mobile/assets/icons, so we keep the one
 * glyph across web↔mobile for parity; a dedicated pencil is a blocked follow-up
 * that needs a new design-kit asset), name + the (unchanged) membership pill,
 * bio, follower/following/rank counts, tabs
 * (Overview / PRs / Activity) and a 3-column grid of PUBLIC highlight tiles.
 *
 * Privacy: HPI is PRIVATE — it is deliberately absent from the public highlight
 * grid and every follower-facing surface. It lives only in a clearly-marked
 * "Private · only you" card at the bottom, visible to the owner (this screen is
 * always your own profile). Every metric is computed from the same engines the
 * rest of the app runs (real sessions + signals); an empty history degrades to
 * honest zeros / omitted tiles — nothing here is fabricated.
 */
export default function AuroraProfile() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { name, email, role, entitlement, createdYear } = useIdentity();
  const prefs = useLoggerPrefs();
  // HPI is a Full feature — free (casual) users see a locked teaser, not the score.
  const showHpi = canSeeHPI(usePersona());

  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");

  const load = useCallback(() => {
    setRefreshing(true);
    // allSettled, not all: these endpoints are independent, so a single failing
    // one shouldn't blank the whole profile.
    Promise.allSettled([fetchSessions(), fetchSignals()])
      .then(([s, sig]) => {
        if (s.status === "fulfilled") setSessions(s.value);
        if (sig.status === "fulfilled") setSignals(sig.value);
      })
      .finally(() => setRefreshing(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // --- Real computed metrics (the same engines Home/Cockpit run) ---
  const bio = useMemo(() => toBiometrics(signals as unknown as Parameters<typeof toBiometrics>[0]), [signals]);
  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const hpi = state.hpi;

  // HPI 12-point trace (oldest→today) + a 30-day delta from the trajectory —
  // SAME window + semantics as the web client (30-day trajectory, down-sampled
  // to 12 points, delta = current score − oldest point in the window).
  const traj = useMemo(() => [...performanceTrajectory(log, 30)].sort((a, b) => b.daysAgo - a.daysAgo), [log]);
  const hpiTrace = useMemo(() => {
    const series = traj.map((p) => p.hpi);
    if (series.length <= 12) return series;
    // down-sample to 12 evenly-spaced points (latest always kept last).
    const out: number[] = [];
    for (let i = 0; i < 12; i++) out.push(series[Math.round((i * (series.length - 1)) / 11)]!);
    return out;
  }, [traj]);
  const hpiDelta = useMemo(() => {
    if (traj.length < 2) return 0;
    return hpi.score - traj[0]!.hpi;
  }, [traj, hpi.score]);

  const heat = useMemo<HeatCell[][]>(() => trainingHeatmap(sessions, 26), [sessions]);
  const achievements = useMemo<Achievement[]>(() => computeAchievements(sessions), [sessions]);
  const prMap = useMemo(() => bestE1rmMap(sessions), [sessions]);
  const topPrs = useMemo(
    () => [...prMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
    [prMap],
  );
  const weekStreakBest = useMemo(() => longestWeekStreak(sessions), [sessions]);
  const dayStreak = useMemo(() => streak(sessions), [sessions]);
  const hasData = sessions.length > 0;
  const earnedCount = useMemo(() => achievements.filter((a) => a.earned).length, [achievements]);
  // Lifetime tonnage — total load × reps across every logged session, formatted
  // to the athlete's units (tonnes for kg, total lb for lb).
  const lifetimeTonnage = useMemo(() => sessions.reduce((sum, s) => sum + sessionVolume(s.blocks), 0), [sessions]);

  const initials = useMemo(() => {
    const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "·";
    return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
  }, [name]);

  const tier = entitlement === "paid" ? "FULL" : "FREE";
  const lime = txt(C, C.lime);

  // Social summary — owner-only "set up your profile" nudge (top), the public
  // bio + avatar, the following/followers counts and (derived) friends rank.
  const [socialP, setSocialP] = useState<any>(null);
  const [socialConns, setSocialConns] = useState<any>(null);
  const [rank, setRank] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    getMyProfile().then((d: any) => { if (alive) setSocialP(d); }).catch(() => {});
    getConnections().then((d: any) => { if (alive) setSocialConns(d); }).catch(() => {});
    // Friends leaderboard (this week's volume) → my position among mutual follows.
    // Only meaningful when there's more than just me on the board; otherwise omitted.
    getLeaderboard("volume").then((d: any) => {
      const board = d?.board;
      if (alive && Array.isArray(board) && board.length > 1) {
        const me = board.find((r: any) => r?.isMe);
        if (me?.rank) setRank(me.rank);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const sClaimed = !!socialP?.profile;
  const sComplete = sClaimed && !!socialP.profile.bio && !!socialP.profile.avatarUrl;
  const bioText: string = socialP?.profile?.bio ?? "";
  const avatarUrl: string = socialP?.profile?.avatarUrl ?? "";
  const followingN = socialConns?.following?.length ?? 0;
  const followersN = socialConns?.followers?.length ?? 0;

  const streakLabel =
    dayStreak.current > 0 ? `${dayStreak.current}d` : weekStreakBest > 0 ? `${weekStreakBest}w` : "—";

  // PUBLIC highlight tiles — everything a follower is allowed to see. HPI is
  // intentionally NOT here. Built from real logged data; empty data → the tile
  // is simply omitted rather than faked. Top lifts lead, then the headline
  // consistency/volume numbers.
  const publicTiles = useMemo(() => {
    // Each tile type → an apt EXISTING AuroraIconName (identical mapping on web):
    // PR/lift = arrow-up, streak = check-circle, sessions = calendar-event,
    // tonnage = list-check, badges = verified.
    const out: { v: string; k: string; icon: AuroraIconName }[] = [];
    for (const [lift, e1rm] of topPrs.slice(0, 2)) {
      out.push({ v: fmtWeight(e1rm, prefs.units), k: `${lift} PR`, icon: "arrow-up" });
    }
    if (weekStreakBest > 0 || dayStreak.current > 0) out.push({ v: streakLabel, k: t("w.account.profile.spec-streak"), icon: "check-circle" });
    if (hasData) out.push({ v: `${sessions.length}`, k: t("w.account.profile.id-sessions"), icon: "calendar-event" });
    if (hasData && lifetimeTonnage > 0) out.push({ v: fmtTonnage(lifetimeTonnage, prefs.units), k: t("w.account.profile.spec-tonnage"), icon: "list-check" });
    if (earnedCount > 0) out.push({ v: `${earnedCount}`, k: t("w.account.profile.achievements"), icon: "verified" });
    return out.slice(0, 6);
  }, [topPrs, prefs.units, weekStreakBest, dayStreak.current, streakLabel, hasData, sessions.length, lifetimeTonnage, earnedCount, t]);

  const socialCounts = useMemo(() => {
    const out = [
      { n: `${followersN}`, k: t("w.account.profile.followers") },
      { n: `${followingN}`, k: t("w.account.profile.following") },
    ];
    if (rank != null) out.push({ n: `#${rank}`, k: t("w.account.profile.rank") });
    return out;
  }, [followersN, followingN, rank, t]);

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      {/* SET UP YOUR PROFILE — owner-only nudge at the very top; hides once the
          profile has a photo + bio. (This screen is always your own.) */}
      {socialP && !sComplete && (
        <Pressable onPress={() => router.push("/profile-edit")} style={{ flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderColor: C.lime, backgroundColor: `${C.lime}14`, borderRadius: 20, padding: 16, marginBottom: 18 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.lime, alignItems: "center", justifyContent: "center" }}>
            <AuroraIcon name="user-circle" size={22} color={C.onAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontWeight: "800", fontSize: 16, color: C.chalk }}>{sClaimed ? t("w.account.profile.setup-complete-title") : t("w.account.profile.setup-title")}</Text>
            <Text style={{ color: C.ash, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{sClaimed ? t("w.account.profile.setup-complete-body") : t("w.account.profile.setup-body")}</Text>
          </View>
          <Text style={{ color: C.lime, fontFamily: F.bold, fontSize: 18 }}>→</Text>
        </Pressable>
      )}

      {/* COVER BANNER — Aurora gradient wash with a lime corner glow. */}
      <View style={{ height: 96, borderRadius: 20, overflow: "hidden" }}>
        <LinearGradient
          colors={[`${C.violet}66`, `${C.lime}33`, C.ink2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={{ position: "absolute", top: -34, right: -24, width: 170, height: 170, borderRadius: 85, backgroundColor: C.lime, opacity: 0.18 }} />
      </View>

      {/* HEAD — avatar overlapping the cover + the edit icon (shared "settings"
          glyph; see note above) where a follower would see "Follow". No Edit /
          Share buttons anywhere. */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: -40, paddingHorizontal: 4 }}>
        {/* Outer lime ring (2px) around the 3px ink border — RN box-shadow is
            unreliable, so the ring is a lime-filled wrapper View. Matches web's
            `box-shadow: 0 0 0 2px lime` on the avatar. */}
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: C.lime, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: C.ink, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: "100%", height: "100%" }} />
            ) : (
              <Text style={{ fontFamily: F.black, fontSize: 32, color: lime }}>{initials}</Text>
            )}
          </View>
        </View>
        <Pressable
          onPress={() => router.push("/profile-edit")}
          accessibilityRole="button"
          accessibilityLabel={t("w.account.profile.edit")}
          hitSlop={8}
          style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center", marginBottom: 6 }}
        >
          <AuroraIcon name="settings" size={19} color={C.chalk} />
        </Pressable>
      </View>

      {/* NAME + membership pill (pill UNCHANGED from the original design). */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginTop: 12, paddingHorizontal: 4 }}>
        <Text style={{ fontFamily: F.black, fontSize: 23, color: C.chalk, letterSpacing: -0.5 }}>{name}</Text>
        <View style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: lime, letterSpacing: 0.7 }}>{tier}</Text>
        </View>
      </View>

      {/* BIO + quiet HYBRID ID line. */}
      <View style={{ marginTop: 7, paddingHorizontal: 4 }}>
        {!!bioText && (
          <Text style={{ fontFamily: F.reg, fontSize: 13.5, color: C.chalk, opacity: 0.9, lineHeight: 20 }}>{bioText}</Text>
        )}
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: bioText ? 6 : 0 }}>
          HYBRID ID · {athleteId(email || name || "")} · {role === "coach" ? t("w.account.profile.role-coach") : t("w.account.profile.role-athlete")} · {t("w.account.profile.member-since")} {createdYear}
        </Text>
      </View>

      {/* SOCIAL COUNTS — followers / following / (derived) friends rank. */}
      <View style={{ flexDirection: "row", gap: 22, marginTop: 14, paddingHorizontal: 4 }}>
        {socialCounts.map((c) => (
          <View key={c.k} style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
            <Text style={{ fontFamily: F.black, fontSize: 17, color: C.chalk }}>{c.n}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.8, color: C.ash, textTransform: "uppercase" }}>{c.k}</Text>
          </View>
        ))}
      </View>

      {/* TABS — Overview / PRs / Activity */}
      <View style={{ flexDirection: "row", marginTop: 16, borderBottomWidth: 1, borderBottomColor: C.line }}>
        {([
          { id: "overview" as const, label: t("w.account.profile.tab-overview") },
          { id: "prs" as const, label: t("w.account.profile.tab-prs") },
          { id: "activity" as const, label: t("w.account.profile.tab-activity") },
        ]).map((tb) => {
          const on = tab === tb.id;
          return (
            <Pressable key={tb.id} onPress={() => setTab(tb.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, alignItems: "center", paddingVertical: 12 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: on ? C.chalk : C.ash }}>{tb.label}</Text>
              {on && <View style={{ position: "absolute", left: "18%", right: "18%", bottom: -1, height: 2, borderRadius: 2, backgroundColor: C.lime }} />}
            </Pressable>
          );
        })}
      </View>

      {/* TAB CONTENT */}
      {tab === "overview" && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 16 }}>
          {publicTiles.length > 0 ? (
            publicTiles.map((tile, i) => (
              <View key={`${tile.k}-${i}`} style={{ width: "31.5%", aspectRatio: 1, borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center", padding: 8, marginBottom: 9 }}>
                <AuroraIcon name={tile.icon} size={22} color={C.lime} />
                <Text numberOfLines={1} style={{ fontFamily: F.black, fontSize: 19, color: C.chalk, letterSpacing: -0.4, marginTop: 6 }}>{tile.v}</Text>
                <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 0.6, color: C.ash, textTransform: "uppercase", marginTop: 4, maxWidth: "100%" }}>{tile.k}</Text>
              </View>
            ))
          ) : (
            <View style={{ width: "100%", padding: 16, borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.ink2 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: 17 }}>{t("w.account.profile.pr-empty-mobile")}</Text>
            </View>
          )}
        </View>
      )}

      {tab === "prs" && (
        <View style={{ marginTop: 16 }}>
          {topPrs.length > 0 ? (
            topPrs.map(([lift, e1rm]) => (
              <View key={lift} style={{ padding: 13, borderWidth: 1, borderColor: C.line, borderRadius: 14, marginBottom: 9, backgroundColor: C.ink2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 11, flex: 1 }}>
                    <Text style={{ fontSize: fs.subtitle }}>🏆</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{lift}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, marginTop: 2 }}>e1RM</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: lime }}>{fmtWeight(e1rm, prefs.units)}</Text>
                </View>
                {/* relative-strength bar — each PR against your heaviest lift. */}
                <View style={{ height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 11, overflow: "hidden" }}>
                  <View style={{ width: `${Math.max(8, Math.round((e1rm / topPrs[0]![1]) * 100))}%`, height: "100%", borderRadius: 2, backgroundColor: lime }} />
                </View>
              </View>
            ))
          ) : (
            <View style={{ padding: 16, borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.ink2 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: 17 }}>{t("w.account.profile.pr-empty-mobile")}</Text>
            </View>
          )}
        </View>
      )}

      {tab === "activity" && (
        <View style={{ marginTop: 16 }}>
          {/* 26-week training heatmap */}
          <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 22, backgroundColor: C.ink2, padding: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 2 }}>
              {monthLabels(heat).map((m, i) => (
                <Text key={i} style={{ fontFamily: F.mono, fontSize: 8, color: C.ash, letterSpacing: 0.6 }}>{m}</Text>
              ))}
            </View>
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
                {dayStreak.current > 0 ? `${dayStreak.current}${t("w.account.profile.day-streak-suffix")}` : weekStreakBest > 0 ? `${weekStreakBest}${t("w.account.profile.week-best-suffix")}` : t("w.account.profile.no-streak")}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash }}>{t("w.account.profile.less")}</Text>
              {[0, 1, 2, 3, 4].map((l) => (
                <View key={l} style={{ width: 10, height: 10, borderRadius: 2.5, backgroundColor: heatColor(l as HeatCell["level"], C) }} />
              ))}
              <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash }}>{t("w.account.profile.more")}</Text>
            </View>
          </View>

          {/* Achievements — earned/locked badge tiles with progress. */}
          <SectionHeader C={C} title={t("w.account.profile.achievements")} action={`${earnedCount} ${t("w.account.profile.earned")}`} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 8 }}>
            {achievements.map((a) => {
              const pct = Math.round(a.progress * 100);
              return (
                <View key={a.id} style={{ width: "23%", alignItems: "center", marginBottom: 14 }}>
                  <View
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: a.earned ? `${C.lime}73` : C.line,
                      backgroundColor: a.earned ? `${C.lime}1f` : C.ink2,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 24, opacity: a.earned ? 1 : 0.38 }}>{a.icon}</Text>
                  </View>
                  <View style={{ width: 48, height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 8, overflow: "hidden" }}>
                    <View style={{ width: `${Math.max(6, pct)}%`, height: "100%", borderRadius: 2, backgroundColor: a.earned ? C.lime : `${C.lime}99` }} />
                  </View>
                  <Text numberOfLines={1} style={{ fontFamily: F.reg, fontSize: 8.5, color: C.ash, marginTop: 6, maxWidth: "100%", textAlign: "center" }}>{a.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          PRIVATE · ONLY YOU — HPI never appears on the public grid above; it
          lives here, clearly marked private and visible only to the owner. */}
      <SectionHeader C={C} title={t("w.account.profile.private-title")} action="🔒" />
      {showHpi ? (
        <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 22, padding: 18, backgroundColor: C.ink2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            {/* No training yet → honest empty state (unrated band + "—"), never a
                fabricated score. Same gating as the web client. */}
            <Ring value={hasData ? hpi.score : 0} size={64} color={C.lime} track={C.line}>
              <Text style={{ fontFamily: F.black, fontSize: 19, color: hasData ? C.chalk : C.ash }}>{hasData ? hpi.score : "—"}</Text>
            </Ring>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.6, color: C.ash, textTransform: "uppercase" }}>{t("w.account.profile.hpi-title")}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: lime, textTransform: "uppercase" }}>{t("w.account.profile.band")} · {hasData ? hpi.band : t("w.account.profile.unrated")}</Text>
                </View>
                {hasData && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: lime }}>{hpiDelta >= 0 ? `▲ +${hpiDelta}` : `▼ ${hpiDelta}`}</Text>}
              </View>
            </View>
          </View>
          {hasData && (
            <View style={{ marginTop: 14 }}>
              <Spark series={hpiTrace} color={C.lime} height={34} />
            </View>
          )}
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: hasData ? 10 : 14, lineHeight: 17 }}>
            {hasData
              ? `${t("w.account.profile.comp-strength")} ${hpi.components.strength} · ${t("w.account.profile.comp-engine")} ${hpi.components.endurance} · ${t("w.account.profile.comp-recovery")} ${hpi.components.recovery >= 0 ? "+" : ""}${hpi.components.recovery}`
              : t("w.account.profile.hpi-empty")}
          </Text>
          <Text style={{ fontFamily: F.mono, fontSize: 8.5, color: C.ash, marginTop: 8, opacity: 0.85 }}>
            {t("w.account.profile.private-note")}
          </Text>
        </View>
      ) : (
        <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 22, padding: 18, backgroundColor: C.ink2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 11 }}>🔒</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.6, color: C.ash, textTransform: "uppercase" }}>{t("w.account.profile.hpi-locked-title")}</Text>
          </View>
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 12, lineHeight: 20 }}>{t("w.account.profile.hpi-locked-body")}</Text>
          <Pressable onPress={() => router.push("/upgrade")} accessibilityRole="button" accessibilityLabel={t("w.account.profile.hpi-locked-cta")} style={{ alignSelf: "flex-start", marginTop: 12, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 20, paddingVertical: 11 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>✦ {t("w.account.profile.hpi-locked-cta")} →</Text>
          </Pressable>
        </View>
      )}

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

function heatColor(level: HeatCell["level"], C: P): string {
  if (level === 0) return C.line;
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

function SectionHeader({ C, title, action }: { C: P; title: string; action: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 13, marginHorizontal: 2 }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk, letterSpacing: -0.2 }}>{title}</Text>
      {!!action && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{action}</Text>}
    </View>
  );
}
