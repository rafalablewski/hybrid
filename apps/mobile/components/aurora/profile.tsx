import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Image, StyleSheet, Animated, PanResponder } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useRouter, useFocusEffect } from "expo-router";
import {
  STREAK_DESTINATION,
  STREAK_ARIA_KEY,
  trainingHeatmap,
  computeAchievements,
  topLoadMap,
  longestWeekStreak,
  streak,
  fmtWeight,
  fmtTonnage,
  sessionVolume,
  totalVolume,
  athleteId,
  userPagePath,
  type BadgeAccent,
  type LoggedSession,
  type Achievement,
  type HeatCell,
  type AuroraIconName,
} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { useAccountSettings } from "../../lib/account";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useTheme, txt } from "../../lib/theme";
import { useFitnessLevel } from "../../lib/use-fitness-level";
import { leading, fs, F, serifIf, PressScale, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { AuroraScreen, RADIUS, CARD_PAD, ASection } from "./kit";
import { getMyProfile, getConnections, getLeaderboard, sapi } from "../../lib/social-api";
import { NAV_HREF } from "../../lib/nav-href";
import { AuroraIcon } from "./icons";
import { StreakMark } from "./streak-mark";
import { ArrowGlyph } from "./cta-label";

type P = ReturnType<typeof useTheme>["palette"];

/**
 * The badge's ink. The level ramp reuses the palette's existing tones rather
 * than inventing a colour per tier — ash and chalk for the lower tiers, the
 * lime accent-TEXT tone for advanced, gold reserved for elite. Every one is a
 * per-theme AA-guarded value (palette.test.ts), so the chip clears contrast on
 * Kyoto Hour's washi card as well as on Aurora's near-black. Mirrors web's
 * badgeInk in aurora/profile.tsx.
 */
const badgeInk = (C: P, accent: BadgeAccent): string =>
  accent === "gold" ? C.gold : accent === "lime" ? txt(C, C.lime) : accent === "chalk" ? C.chalk : C.ash;
type TabId = "overview" | "prs" | "activity";

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
 * grid and every follower-facing surface. It lives on Performance, behind the
 * Full gate, and this screen never restates it. Every metric here is computed
 * from the same engines the rest of the app runs (real sessions + signals); an
 * empty history degrades to honest zeros / omitted tiles — nothing here is
 * fabricated.
 */
export default function AuroraProfile() {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { name, email, entitlement, createdYear } = useIdentity();
  const prefs = useLoggerPrefs();

  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  // Highlight curation — the owner's private arrangement of the public Overview
  // grid: which tiles are hidden, and the order they sit in. Loaded once; the
  // grid's edit mode (long-press) drives both and persists to /api/highlights.
  const [hidden, setHidden] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    sapi<{ hidden?: string[]; order?: string[] }>("/api/highlights").then((d) => {
      if (!alive) return;
      setHidden(d.hidden ?? []);
      setOrder(d.order ?? []);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const toggleHidden = useCallback((key: string, next: boolean) => {
    setHidden((h) => (next ? [...new Set([...h, key])] : h.filter((k) => k !== key)));
    sapi<{ hidden?: string[] }>("/api/highlights", "POST", { key, hidden: next }).then((d) => { if (d.hidden) setHidden(d.hidden); }).catch(() => {});
  }, []);
  const persistOrder = useCallback((keys: string[]) => {
    setOrder(keys);
    sapi<{ order?: string[] }>("/api/highlights", "POST", { order: keys }).then((d) => { if (d.order) setOrder(d.order); }).catch(() => {});
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
  const bw = useBodyweightLookup();
  // The SAME estimate the Performance card and the Volume working read, so
  // the profile can never claim a level the rest of the app contradicts.
  const { badge } = useFitnessLevel(sessions);
  const heat = useMemo<HeatCell[][]>(() => trainingHeatmap(sessions, 26), [sessions]);
  const achievements = useMemo<Achievement[]>(() => computeAchievements(sessions, bw), [sessions, bw]);
  const prMap = useMemo(() => topLoadMap(sessions, bw), [sessions, bw]);
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
  const lifetimeTonnage = useMemo(() => totalVolume(sessions, bw), [sessions, bw]);
  // This-week snapshot — sessions logged + tonnage moved in the last 7 days. A
  // current-focus band above the tiles; distinct from the lifetime tiles and the
  // 26-week Activity heatmap, so it adds signal without duplicating them.
  const thisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let count = 0, vol = 0;
    for (const s of sessions) {
      const ts = Date.parse(s.startedAt);
      if (!Number.isNaN(ts) && ts >= cutoff) { count++; vol += sessionVolume(s.blocks, false, bw(s.startedAt)); }
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
    // THE STREAK TILE opens the HISTORY, the same place the streak mark does
    // (STREAK_DESTINATION, so the tile and the mark cannot point at two
    // screens) and with the same accessible name. Only when there IS a current
    // day streak: the tile falls back to the longest-WEEK figure, and that is
    // not what the history's day grid would be answering.
    if (weekStreakBest > 0 || dayStreak.current > 0) out.push({
      v: streakLabel,
      k: t("w.account.profile.spec-streak"),
      icon: "check-circle",
      hkey: "streak",
      ...(dayStreak.current > 0
        ? { to: STREAK_DESTINATION, aria: t(STREAK_ARIA_KEY).replace("{n}", String(dayStreak.current)) }
        : {}),
    });
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
        /* an icon-tile ROW (tile + text + chevron), not a full-width card — it
           keeps the compact inset. See CARD_PAD for the variants that stay 16. */
        <Pressable onPress={() => router.push("/profile-edit")} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.lime, backgroundColor: `${C.lime}14`, borderRadius: RADIUS.card, padding: 16, marginBottom: 16 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.lime, alignItems: "center", justifyContent: "center" }}>
            <AuroraIcon name="user-circle" size={22} color={C.onAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontWeight: "800", fontSize: 16, color: C.chalk }}>{sClaimed ? t("w.account.profile.setup-complete-title") : t("w.account.profile.setup-title")}</Text>
            <Text style={{ color: C.ash, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{sClaimed ? t("w.account.profile.setup-complete-body") : t("w.account.profile.setup-body")}</Text>
          </View>
          <ArrowGlyph size={16} color={txt(C, C.lime)} />
        </Pressable>
      )}

      {/* COVER BANNER — Aurora gradient wash with a lime corner glow. The
          edit-profile control lives as a frosted chip in the banner's top-right
          (the classic "edit cover" spot) — out of the content flow, away from
          the avatar and name. */}
      <View style={{ height: 96, borderRadius: RADIUS.card, overflow: "hidden" }}>
        <LinearGradient
          colors={[`${C.violet}66`, `${C.lime}33`, C.ink2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={{ position: "absolute", top: -34, right: -24, width: 170, height: 170, borderRadius: 85, backgroundColor: C.lime, opacity: 0.18 }} />
        <Pressable
          onPress={() => router.push("/profile-edit")}
          accessibilityRole="button"
          accessibilityLabel={t("w.account.profile.edit")}
          hitSlop={8}
          style={{ position: "absolute", top: 12, right: 12, width: 38, height: 38, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" }}
        >
          <BlurView intensity={24} tint={scheme} style={StyleSheet.absoluteFill} />
          <AuroraIcon name="edit" size={17} color={C.chalk} />
        </Pressable>
      </View>

      {/* HEAD — avatar overlapping the cover. The edit-profile control moved
          into the banner (above); no Edit / Share buttons in this row. */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: -40, paddingHorizontal: 0 }}>
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
      </View>

      {/* NAME + membership pill (pill UNCHANGED from the original design), and
          the LEVEL BADGE beside it.

          The badge is EARNED, never claimed: it renders only the log-derived
          estimate, never the self-assessed onboarding answer, and it shows
          nothing at all until two independent results back it (see badgeFor).
          That is the whole reason it is worth showing to other people —
          everyone's badge means the same thing.

          One word, and only one word. PR loads are already public tiles on this
          screen, so publishing the ratio beside them would let anyone divide and
          recover the athlete's body mass. The figures stay on Performance. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingHorizontal: 0, flexWrap: "wrap" }}>
        <Text style={{ fontFamily: F.black, fontSize: 23, color: C.chalk, letterSpacing: -0.5 }}>{name}</Text>
        <View style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: lime, letterSpacing: 0.9 }}>{tier}</Text>
        </View>
        {badge && (
          <Pressable
            onPress={() => router.push("/performance")}
            accessibilityRole="button"
            accessibilityLabel={t("w.analyze.vol.levelCardTitle")}
            style={{ borderWidth: 1, borderColor: badgeInk(C, badge.accent), borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: badgeInk(C, badge.accent), letterSpacing: 0.9, textTransform: "uppercase" }}>
              {t(badge.key)}
            </Text>
          </Pressable>
        )}
      </View>

      {/* BIO + quiet HYBRID ID line. */}
      <View style={{ marginTop: 8, paddingHorizontal: 0 }}>
        {!!bioText && (
          <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.chalk, opacity: 0.9, lineHeight: 20 }}>{bioText}</Text>
        )}
        <View style={{ marginTop: bioText ? 6 : 0, gap: 2 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}><Text style={{ opacity: 0.75 }}>HYBRID ID</Text>{"  "}{athleteId(email || name || "")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, opacity: 0.75 }}>{t("w.account.profile.member-since")} {createdYear}</Text>
        </View>
        {/* VIEW AS OTHERS SEE IT — your own individual user page. It is the only
            honest preview of what your visibility setting actually does, and
            without it the page's `self` state was unreachable from the app. It
            LEAVES, so it takes the arrow; it is a door, so it wears no card. */}
        {socialP?.profile?.handle ? (
          <Pressable onPress={() => router.push(userPagePath(socialP.profile.handle))} style={{ alignSelf: "flex-start", marginTop: 10 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 13, color: txt(C, C.lime) }}>{t("w.user.viewAsOthers")}  ›</Text>
          </Pressable>
        ) : null}
      </View>

      {/* SOCIAL COUNTS — followers / following / (derived) friends rank. */}
      <View style={{ flexDirection: "row", gap: 24, marginTop: 16, paddingHorizontal: 0 }}>
        {socialCounts.map((c) => (
          <View key={c.k} style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
            <Text style={{ fontFamily: F.black, fontSize: 17, color: C.chalk }}>{c.n}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, color: C.ash, textTransform: "uppercase" }}>{c.k}</Text>
          </View>
        ))}
      </View>

      {/* TABS — Overview / PRs / Activity.
          There is no 4th "Private" tab: it held a link to Performance, a link
          to Settings and Body & progress, so two thirds of it duplicated
          doorways the app already has. Body & progress moved to Nutrition →
          Body, next to the weigh-in its targets are steered by. */}
      <View style={{ flexDirection: "row", marginTop: 16, borderBottomWidth: 1, borderBottomColor: C.line }}>
        {([
          { id: "overview" as const, label: t("w.account.profile.tab-overview") },
          { id: "prs" as const, label: t("w.account.profile.tab-prs") },
          { id: "activity" as const, label: t("w.account.profile.tab-activity") },
        ]).map((tb) => {
          const on = tab === tb.id;
          return (
            <PressScale key={tb.id} onPress={() => setTab(tb.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, alignItems: "center", paddingVertical: 12 }}>
              <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.caption, color: on ? C.chalk : C.ash }}>{tb.label}</Text>
              {on && <View style={{ position: "absolute", left: "18%", right: "18%", bottom: -1, height: 2, borderRadius: 2, backgroundColor: C.lime }} />}
            </PressScale>
          );
        })}
      </View>

      {/* TAB CONTENT */}
      {tab === "overview" && (
        <View style={{ marginTop: 16 }}>
          {/* THIS WEEK — a current-focus snapshot above the lifetime tiles. */}
          {thisWeek.count > 0 && (
            <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.ink2, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.ov-tw")}</Text>
              <View style={{ flexDirection: "row", gap: 24, marginTop: 8 }}>
                {[{ v: `${thisWeek.count}`, k: t("w.account.profile.id-sessions") }, { v: fmtTonnage(thisWeek.vol, prefs.units), k: t("w.account.profile.spec-tonnage") }].map((s) => (
                  <View key={s.k} style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                    <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk, letterSpacing: -0.5 }}>{s.v}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, color: C.ash, textTransform: "uppercase" }}>{s.k}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {publicTiles.length > 0 ? (
            <HighlightGrid
              C={C}
              tiles={publicTiles}
              onOpen={(to) => router.push(NAV_HREF[to] ?? "/history")}
              hidden={hidden}
              order={order}
              onToggleHidden={toggleHidden}
              onPersistOrder={persistOrder}
              t={t}
            />
          ) : (
            <View style={{ width: "100%", padding: 16, borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.ink2 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>{t("w.account.profile.pr-empty-mobile")}</Text>
            </View>
          )}
        </View>
      )}

      {tab === "prs" && (
        <View style={{ marginTop: 16 }}>
          {topPrs.length > 0 ? (
            topPrs.map(([lift, wt]) => (
              <View key={lift} style={{ padding: 12, borderWidth: 1, borderColor: C.line, borderRadius: 16, marginBottom: 8, backgroundColor: C.ink2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                    <AuroraIcon name="trophy" size={fs.subtitle + 2} color={C.chalk} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{lift}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t("w.account.profile.pr-metric")}</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: lime }}>{fmtWeight(wt, prefs.units)}</Text>
                </View>
                {/* relative-strength bar — each PR against your heaviest lift. */}
                <View style={{ height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 12, overflow: "hidden" }}>
                  <View style={{ width: `${Math.max(8, Math.round((wt / topPrs[0]![1]) * 100))}%`, height: "100%", borderRadius: 2, backgroundColor: lime }} />
                </View>
              </View>
            ))
          ) : (
            <View style={{ padding: 16, borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.ink2 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>{t("w.account.profile.pr-empty-mobile")}</Text>
            </View>
          )}
        </View>
      )}

      {tab === "activity" && (
        <View style={{ marginTop: 16 }}>
          {/* 26-week training heatmap */}
          <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, backgroundColor: C.ink2, padding: CARD_PAD }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 2 }}>
              {monthLabels(heat).map((m, i) => (
                <Text key={i} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: 0.9 }}>{m}</Text>
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12 }}>
              {/* THE STREAK — the shared mark (aurora/streak-mark.tsx), the
                  same one the app header wears, so the figure under the
                  heat-map is no longer a bare chartreuse "17d" that says the
                  same thing in a different voice and does nothing when tapped.
                  It opens the history — which is what this heat-map is a
                  picture of. The two fallbacks are NOT the day-streak (a
                  longest-week figure, or nothing yet), so they stay plain
                  text. */}
              {dayStreak.current > 0 ? (
                <StreakMark />
              ) : (
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: lime }}>
                  {weekStreakBest > 0 ? `${weekStreakBest}${t("w.account.profile.week-best-suffix")}` : t("w.account.profile.no-streak")}
                </Text>
              )}
              <View style={{ flex: 1 }} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.account.profile.less")}</Text>
              {[0, 1, 2, 3, 4].map((l) => (
                <View key={l} style={{ width: 10, height: 10, borderRadius: 2.5, backgroundColor: heatColor(l as HeatCell["level"], C) }} />
              ))}
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.account.profile.more")}</Text>
            </View>
          </View>

          {/* Achievements — earned/locked badge tiles with progress. */}
          <ASection title={t("w.account.profile.achievements")} meta={`${earnedCount} ${t("w.account.profile.earned")}`} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 8 }}>
            {achievements.map((a) => {
              const pct = Math.round(a.progress * 100);
              return (
                <View key={a.id} style={{ width: "23%", alignItems: "center", marginBottom: 16 }}>
                  <View
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 16,
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
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.nano, color: C.ash, marginTop: 6, maxWidth: "100%", textAlign: "center" }}>{a.label}</Text>
                </View>
              );
            })}
          </View>
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

// ─────────────────────────────────────────────────────────────────────────────
// HIGHLIGHT GRID (mobile) — the public Overview tiles with Apple-style edit mode,
// at parity with the web grid. Long-press a tile → edit mode (tiles wiggle, a "–"
// appears); drag to reorder (persisted); tap "–" to hide → it drops into the
// restore tray; tap a chip to restore; Done to leave. A plain tap never hides a
// tile. Built on the RN built-ins (PanResponder + Animated) — no gesture-handler
// / reanimated dependency. Reorder mirrors web: snapshot each tile's slot at
// grab, translate neighbours toward the vacated slot, commit the order on drop.
// ─────────────────────────────────────────────────────────────────────────────
/** A highlight tile. `to` is a nav id (see lib/nav-href): a tile that CARRIES a
 *  destination opens it on a tap, while the long-press still enters edit mode.
 *  Most tiles are figures with nowhere to go and simply omit it. `aria` names
 *  what a tapping tile does, since "Streak" alone says neither the value nor
 *  where it leads. Mirrors web profile.tsx. */
type HlTile = { v: string; k: string; icon: AuroraIconName; hkey: string; to?: string; aria?: string };
type Slot = { key: string; x: number; y: number; w: number; h: number };

function HighlightGrid({
  C, tiles, hidden, order, onToggleHidden, onPersistOrder, onOpen, t,
}: {
  C: P;
  tiles: HlTile[];
  hidden: string[];
  order: string[];
  onToggleHidden: (key: string, next: boolean) => void;
  onPersistOrder: (keys: string[]) => void;
  /** Open a tile's destination (its `to` nav id). Never fires in edit mode —
   *  there the tap belongs to the rearrange. */
  onOpen: (to: string) => void;
  t: (k: string) => string;
}) {
  const tileMap = useMemo(() => new Map(tiles.map((x) => [x.hkey, x])), [tiles]);
  const presentKeys = useMemo(() => tiles.map((x) => x.hkey), [tiles]);
  const reconcile = useCallback((ord: string[]) => {
    const known = new Set(presentKeys);
    const inOrder = ord.filter((k) => known.has(k));
    const seen = new Set(inOrder);
    return [...inOrder, ...presentKeys.filter((k) => !seen.has(k))];
  }, [presentKeys]);

  const [localOrder, setLocalOrder] = useState<string[]>(() => reconcile(order));
  const [editMode, setEditMode] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const draggingRef = useRef(false);
  useEffect(() => { if (!draggingRef.current) setLocalOrder(reconcile(order)); }, [order, reconcile]);

  const editModeRef = useRef(editMode); editModeRef.current = editMode;
  const localOrderRef = useRef(localOrder); localOrderRef.current = localOrder;
  const hiddenRef = useRef(hidden); hiddenRef.current = hidden;
  const persistRef = useRef(onPersistOrder); persistRef.current = onPersistOrder;

  const visibleKeys = localOrder.filter((k) => !hidden.includes(k));
  const hiddenKeys = localOrder.filter((k) => hidden.includes(k));

  // Per-tile layout (relative to the grid) + a persistent translate value.
  const layouts = useRef(new Map<string, { x: number; y: number; w: number; h: number }>());
  const translates = useRef(new Map<string, Animated.ValueXY>());
  const getTr = (k: string) => {
    let v = translates.current.get(k);
    if (!v) { v = new Animated.ValueXY({ x: 0, y: 0 }); translates.current.set(k, v); }
    return v;
  };
  const scale = useRef(new Animated.Value(1)).current;

  // Grid origin in window coords — to map absolute touches to grid-local space.
  const gridRef = useRef<View | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const measure = () => { gridRef.current?.measureInWindow((x, y) => { origin.current = { x, y }; }); };

  const drag = useRef<null | { key: string; slots: Slot[]; dragIndex: number; targetIndex: number; baseX: number; baseY: number }>(null);

  const layoutShifts = () => {
    const d = drag.current; if (!d) return;
    d.slots.forEach((s, i) => {
      if (i === d.dragIndex) return;
      let to = i;
      if (d.dragIndex < d.targetIndex && i > d.dragIndex && i <= d.targetIndex) to = i - 1;
      else if (d.targetIndex < d.dragIndex && i >= d.targetIndex && i < d.dragIndex) to = i + 1;
      Animated.timing(getTr(s.key), {
        toValue: { x: d.slots[to]!.x - s.x, y: d.slots[to]!.y - s.y },
        duration: 160, useNativeDriver: true,
      }).start();
    });
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Once we own the drag, don't let the parent ScrollView (AuroraScreen)
      // reclaim the gesture on a vertical move and terminate the reorder.
      onPanResponderTerminationRequest: () => false,
      onMoveShouldSetPanResponder: (e, g) => {
        if (!editModeRef.current) return false;
        if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) return false;
        const relX = e.nativeEvent.pageX - origin.current.x;
        const relY = e.nativeEvent.pageY - origin.current.y;
        const visible = localOrderRef.current.filter((k) => !hiddenRef.current.includes(k));
        return visible.some((k) => {
          const l = layouts.current.get(k);
          return !!l && relX >= l.x && relX <= l.x + l.w && relY >= l.y && relY <= l.y + l.h;
        });
      },
      onPanResponderGrant: (e, g) => {
        const relX = e.nativeEvent.pageX - origin.current.x;
        const relY = e.nativeEvent.pageY - origin.current.y;
        const visible = localOrderRef.current.filter((k) => !hiddenRef.current.includes(k));
        // Don't start a drag until every visible tile has a measured layout —
        // otherwise a missing rect would crash here, and dropping unmeasured
        // tiles from `slots` would desync the order rebuild in endDrag.
        if (!visible.every((k) => layouts.current.has(k))) return;
        const slots: Slot[] = visible.map((k) => { const l = layouts.current.get(k)!; return { key: k, x: l.x, y: l.y, w: l.w, h: l.h }; });
        const di = slots.findIndex((s) => relX >= s.x && relX <= s.x + s.w && relY >= s.y && relY <= s.y + s.h);
        if (di < 0) return;
        drag.current = { key: slots[di]!.key, slots, dragIndex: di, targetIndex: di, baseX: relX - g.dx, baseY: relY - g.dy };
        draggingRef.current = true;
        setDragKey(slots[di]!.key);
        getTr(slots[di]!.key).setValue({ x: g.dx, y: g.dy });
        scale.setValue(1);
        Animated.spring(scale, { toValue: 1.06, useNativeDriver: true, friction: 6 }).start();
      },
      onPanResponderMove: (_e, g) => {
        const d = drag.current; if (!d) return;
        getTr(d.key).setValue({ x: g.dx, y: g.dy });
        const curX = d.baseX + g.dx, curY = d.baseY + g.dy;
        let best = d.dragIndex, bestDist = Infinity;
        d.slots.forEach((s, i) => {
          const dist = (curX - (s.x + s.w / 2)) ** 2 + (curY - (s.y + s.h / 2)) ** 2;
          if (dist < bestDist) { bestDist = dist; best = i; }
        });
        if (best !== d.targetIndex) { d.targetIndex = best; layoutShifts(); }
      },
      onPanResponderRelease: () => endDrag(),
      onPanResponderTerminate: () => endDrag(),
    }),
  ).current;

  const endDrag = () => {
    const d = drag.current; if (!d) { setDragKey(null); return; }
    drag.current = null;
    const visible = d.slots.map((s) => s.key);
    const newVisible = [...visible];
    newVisible.splice(d.dragIndex, 1);
    newVisible.splice(d.targetIndex, 0, d.key);
    const changed = newVisible.join(" ") !== visible.join(" ");
    const q = [...newVisible];
    const newFull = localOrderRef.current.map((k) => (hiddenRef.current.includes(k) ? k : q.shift()!));
    // Stop any in-flight neighbour-shift animations before zeroing, or they'd
    // fight the reset and glitch tiles back toward their animated targets.
    d.slots.forEach((s) => { const tr = getTr(s.key); tr.stopAnimation(); tr.setValue({ x: 0, y: 0 }); });
    scale.setValue(1);
    draggingRef.current = false;
    setDragKey(null);
    if (changed) { setLocalOrder(newFull); persistRef.current(newFull); }
  };

  // Wiggle loop while editing — per-tile stagger (leg duration varies by tile
  // index % 3, mirroring web's hlWiggle 340/300/380ms nth-child ladder) and
  // skipped entirely under Reduce Motion (web parity: prefers-reduced-motion
  // disables the animation).
  const reducedMotion = useReducedMotion();
  const wigs = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  useEffect(() => {
    if (!editMode || reducedMotion) { wigs.forEach((w) => { w.stopAnimation(); w.setValue(0); }); return; }
    // Small start offsets stand in for web's negative animation-delays, so
    // neighbouring tiles never wiggle in unison.
    const variants = [{ dur: 340, delay: 0 }, { dur: 300, delay: 120 }, { dur: 380, delay: 200 }];
    const loops = variants.map(({ dur }, i) => Animated.loop(Animated.sequence([
      Animated.timing(wigs[i], { toValue: 1, duration: dur, useNativeDriver: true }),
      Animated.timing(wigs[i], { toValue: -1, duration: dur, useNativeDriver: true }),
    ])));
    const timers = variants.map(({ delay }, i) => setTimeout(() => loops[i].start(), delay));
    return () => { timers.forEach((tm) => clearTimeout(tm)); loops.forEach((l) => l.stop()); wigs.forEach((w) => w.setValue(0)); };
  }, [editMode, reducedMotion, wigs]);
  const rotations = wigs.map((w) => w.interpolate({ inputRange: [-1, 1], outputRange: ["-0.9deg", "0.9deg"] }));

  return (
    <>
      <View
        ref={gridRef}
        onLayout={measure}
        onTouchStart={measure}
        {...pan.panHandlers}
        style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}
      >
        {visibleKeys.map((key, idx) => {
          const tile = tileMap.get(key)!;
          const isDrag = dragKey === key;
          const tr = getTr(key);
          const transform: Array<{ translateX: Animated.Value } | { translateY: Animated.Value } | { scale: Animated.Value }> = [{ translateX: tr.x }, { translateY: tr.y }];
          if (isDrag) transform.push({ scale });
          return (
            <Animated.View
              key={key}
              onLayout={(e) => { const { x, y, width, height } = e.nativeEvent.layout; layouts.current.set(key, { x, y, w: width, h: height }); }}
              style={{ width: "31.5%", aspectRatio: 1, marginBottom: 8, zIndex: isDrag ? 50 : 0, elevation: isDrag ? 8 : 0, transform }}
            >
              <Pressable
                onPress={tile.to && !editMode ? () => onOpen(tile.to!) : undefined}
                onLongPress={() => setEditMode(true)}
                delayLongPress={450}
                accessibilityRole="button"
                // The value belongs in the name: a tile that announced only
                // "Streak" told a screen-reader user everything except the
                // number they came for.
                accessibilityLabel={tile.aria ?? `${tile.v} ${tile.k}`}
                style={{ width: "100%", height: "100%" }}
              >
                <Animated.View style={{ width: "100%", height: "100%", borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center", padding: 8, transform: editMode && !isDrag ? [{ rotate: rotations[idx % 3] }] : [] }}>
                  <AuroraIcon name={tile.icon} size={22} color={C.lime} />
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.black, fontSize: 19, color: C.chalk, letterSpacing: -0.5, marginTop: 6 }}>{tile.v}</Text>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, color: C.ash, textTransform: "uppercase", marginTop: 4, maxWidth: "100%" }}>{tile.k}</Text>
                </Animated.View>
              </Pressable>
              {editMode && (
                <Pressable
                  onPress={() => onToggleHidden(key, true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t("w.account.profile.priv-hide")}
                  style={{ position: "absolute", top: -7, left: -7, width: 24, height: 24, borderRadius: 12, backgroundColor: "#e8e8e8", borderWidth: 2, borderColor: C.ink, alignItems: "center", justifyContent: "center", zIndex: 6 }}
                >
                  <View style={{ width: 11, height: 2.5, borderRadius: 2, backgroundColor: "#111" }} />
                </Pressable>
              )}
            </Animated.View>
          );
        })}
      </View>

      {/* HIDDEN — restore tray. */}
      {hiddenKeys.length > 0 && (
        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, borderStyle: "dashed", paddingTop: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <AuroraIcon name="eye" size={12} color={C.ash} />
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, color: C.ash, textTransform: "uppercase" }}>{t("w.account.profile.ov-restore")}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {hiddenKeys.map((key) => {
              const tile = tileMap.get(key)!;
              return (
                <Pressable key={key} onPress={() => onToggleHidden(key, false)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingLeft: 8, paddingRight: 12, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.ink2 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.lime, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: F.black, fontSize: 15, lineHeight: 17, color: C.ink }}>+</Text>
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, color: C.ash, textTransform: "uppercase" }}>{tile.k}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: 0.9, flex: 1 }}>{editMode ? t("w.account.profile.ov-edit-hint") : t("w.account.profile.ov-hint")}</Text>
        {editMode && (
          <Pressable onPress={() => setEditMode(false)} accessibilityRole="button" style={{ backgroundColor: C.chalk, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 20 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: C.ink }}>{t("w.account.profile.ov-done")}</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

