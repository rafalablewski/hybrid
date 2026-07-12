import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import {
  trainingHeatmap,
  computeAchievements,
  bestE1rmMap,
  longestWeekStreak,
  streak,
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
import { fetchSessions } from "../../lib/api";
import { useSession } from "../../lib/session";
import { usePersona } from "../../lib/persona";
import { useLang } from "../../lib/i18n";
import { useAccountSettings } from "../../lib/account";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useTheme, txt } from "../../lib/theme";
import { fs, F } from "../../lib/ui";
import { AuroraScreen, RADIUS } from "./kit";
import { getMyProfile, getConnections, getLeaderboard, sapi } from "../../lib/social-api";
import PrivateTab from "./private-tab";
import { AuroraIcon } from "./icons";

type P = ReturnType<typeof useTheme>["palette"];
type TabId = "overview" | "prs" | "activity" | "private";

/**
 * AURORA profile — the "You" account screen, reworked into the SOCIAL layout: a
 * cover banner, an overlapping avatar with an edit-profile icon (the "edit"
 * pencil glyph — a dedicated asset (assets/icons/edit.png) + shared SVG path so
 * it's no longer confused with the settings gear, kept in lockstep web↔mobile),
 * name + the (unchanged) membership pill,
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
  const { name, email, entitlement, createdYear } = useIdentity();
  const prefs = useLoggerPrefs();
  // HPI is a Full feature — free (casual) users see a locked teaser, not the score.
  const showHpi = canSeeHPI(usePersona());

  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  // Long-press curation on the Overview grid: which tile's Hide/Show menu is open.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Hidden highlights — the PR/badge keys the owner keeps off the public grid.
  // Loaded once; the Private tab toggles them and the Overview grid honours them.
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    sapi<{ hidden?: string[] }>("/api/highlights").then((d) => { if (alive) setHidden(d.hidden ?? []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const toggleHidden = useCallback((key: string, next: boolean) => {
    setHidden((h) => (next ? [...new Set([...h, key])] : h.filter((k) => k !== key)));
    sapi<{ hidden?: string[] }>("/api/highlights", "POST", { key, hidden: next }).then((d) => { if (d.hidden) setHidden(d.hidden); }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setRefreshing(true);
    fetchSessions()
      .then((s) => setSessions(s))
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // HPI / readiness / injury-risk are the Cockpit's job — the Private tab LINKS
  // there rather than recomputing them here, so the profile never duplicates the
  // command center. The metrics below feed the PUBLIC grid (PRs, streak, tonnage).
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
  // This-week snapshot — sessions logged + tonnage moved in the last 7 days. A
  // current-focus band above the tiles; distinct from the lifetime tiles and the
  // 26-week Activity heatmap, so it adds signal without duplicating them.
  const thisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let count = 0, vol = 0;
    for (const s of sessions) {
      const ts = Date.parse(s.startedAt);
      if (!Number.isNaN(ts) && ts >= cutoff) { count++; vol += sessionVolume(s.blocks); }
    }
    return { count, vol };
  }, [sessions]);

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
    // tonnage = list-check, badges = verified. Each carries a stable `hkey` so
    // the owner can hide/show it (long-press on Overview). Per-lift detail lives
    // in the PRs tab, so only the single best lift is surfaced here.
    const out: { v: string; k: string; icon: AuroraIconName; hkey: string }[] = [];
    const topPr = topPrs[0];
    if (topPr) out.push({ v: fmtWeight(topPr[1], prefs.units), k: `${topPr[0]} PR`, icon: "arrow-up", hkey: `pr:${topPr[0]}` });
    if (weekStreakBest > 0 || dayStreak.current > 0) out.push({ v: streakLabel, k: t("w.account.profile.spec-streak"), icon: "check-circle", hkey: "streak" });
    if (hasData) out.push({ v: `${sessions.length}`, k: t("w.account.profile.id-sessions"), icon: "calendar-event", hkey: "sessions" });
    if (hasData && lifetimeTonnage > 0) out.push({ v: fmtTonnage(lifetimeTonnage, prefs.units), k: t("w.account.profile.spec-tonnage"), icon: "list-check", hkey: "tonnage" });
    if (earnedCount > 0) out.push({ v: `${earnedCount}`, k: t("w.account.profile.achievements"), icon: "verified", hkey: "badges" });
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
          <Text style={{ color: txt(C, C.lime), fontFamily: F.bold, fontSize: 18 }}>→</Text>
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

      {/* HEAD — avatar overlapping the cover + the edit-profile icon (the
          "edit" pencil glyph, distinct from the settings gear) where a follower
          would see "Follow". No Edit / Share buttons anywhere. */}
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
          <AuroraIcon name="edit" size={19} color={C.chalk} />
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
        <View style={{ marginTop: bioText ? 6 : 0, gap: 2 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}><Text style={{ opacity: 0.75 }}>HYBRID ID</Text>{"  "}{athleteId(email || name || "")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, opacity: 0.75 }}>{t("w.account.profile.member-since")} {createdYear}</Text>
        </View>
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
          // 4th, owner-only tab — this screen is always your own profile.
          { id: "private" as const, label: `🔒 ${t("w.account.profile.tab-private")}` },
        ]).map((tb) => {
          const on = tab === tb.id;
          return (
            <Pressable key={tb.id} onPress={() => setTab(tb.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, alignItems: "center", paddingVertical: 12 }}>
              <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.caption, color: on ? C.chalk : C.ash }}>{tb.label}</Text>
              {on && <View style={{ position: "absolute", left: "18%", right: "18%", bottom: -1, height: 2, borderRadius: 2, backgroundColor: C.lime }} />}
            </Pressable>
          );
        })}
      </View>

      {/* TAB CONTENT */}
      {tab === "overview" && (
        <View style={{ marginTop: 16 }}>
          {/* THIS WEEK — a current-focus snapshot above the lifetime tiles. */}
          {thisWeek.count > 0 && (
            <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.ink2, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 9 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.ov-tw")}</Text>
              <View style={{ flexDirection: "row", gap: 26, marginTop: 8 }}>
                {[{ v: `${thisWeek.count}`, k: t("w.account.profile.id-sessions") }, { v: fmtTonnage(thisWeek.vol, prefs.units), k: t("w.account.profile.spec-tonnage") }].map((s) => (
                  <View key={s.k} style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                    <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk, letterSpacing: -0.4 }}>{s.v}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.7, color: C.ash, textTransform: "uppercase" }}>{s.k}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {publicTiles.length > 0 ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                {publicTiles.map((tile, i) => {
                  const isHidden = hidden.includes(tile.hkey);
                  const open = menuFor === tile.hkey;
                  return (
                    <Pressable
                      key={`${tile.hkey}-${i}`}
                      onLongPress={() => setMenuFor(tile.hkey)}
                      onPress={() => { if (menuFor) setMenuFor(null); }}
                      delayLongPress={400}
                      accessibilityRole="button"
                      accessibilityLabel={tile.k}
                      style={{ width: "31.5%", aspectRatio: 1, borderWidth: 1, borderColor: open ? C.lime : C.line, borderRadius: 14, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center", padding: 8, marginBottom: 9, opacity: isHidden ? 0.4 : 1, overflow: "hidden" }}
                    >
                      <AuroraIcon name={tile.icon} size={22} color={C.lime} />
                      <Text numberOfLines={1} style={{ fontFamily: F.black, fontSize: 19, color: C.chalk, letterSpacing: -0.4, marginTop: 6 }}>{tile.v}</Text>
                      <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 0.6, color: C.ash, textTransform: "uppercase", marginTop: 4, maxWidth: "100%" }}>{tile.k}</Text>
                      {isHidden && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 5 }}>
                          <AuroraIcon name="eye" size={10} color={C.ash} />
                          <Text style={{ fontFamily: F.mono, fontSize: 7.5, letterSpacing: 0.6, color: C.ash, textTransform: "uppercase" }}>{t("w.account.profile.ov-hidden")}</Text>
                        </View>
                      )}
                      {open && (
                        <Pressable
                          onPress={() => { toggleHidden(tile.hkey, !isHidden); setMenuFor(null); }}
                          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, borderWidth: 1, borderColor: C.lime, backgroundColor: `${C.ink}d9`, alignItems: "center", justifyContent: "center", gap: 4 }}
                        >
                          <AuroraIcon name="eye" size={18} color={txt(C, C.lime)} />
                          <Text style={{ fontFamily: F.mono, fontSize: 11, fontWeight: "700", color: txt(C, C.lime) }}>{isHidden ? t("w.account.profile.priv-show") : t("w.account.profile.priv-hide")}</Text>
                        </Pressable>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: 8.5, color: C.ash, marginTop: 1, letterSpacing: 0.2 }}>{t("w.account.profile.ov-hint")}</Text>
            </>
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

      {/* PRIVATE tab — the interactive owner-only surface (Cockpit link, Body &
          progress, Journal, privacy & visibility → Settings). HPI/readiness/risk
          are NOT duplicated — the Command-center row links to the Cockpit.
          Curating the public grid lives on Overview (long-press a card). */}
      {tab === "private" && <PrivateTab isFull={showHpi} />}

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

