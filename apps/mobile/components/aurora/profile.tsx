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
  springs,
  springToRN,
  type BadgeAccent,
  type LoggedSession,
  type Achievement,
  type HeatCell,
  type AuroraIconName,
  ALPHA,
} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { useAccountSettings } from "../../lib/account";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useTheme, txt } from "../../lib/theme";
import { useFitnessLevel } from "../../lib/use-fitness-level";
import { leading, fs, space, F, PressScale as Pressable, FIXED_FONT_SCALE , tracking} from "../../lib/ui";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { AuroraScreen, RADIUS, CARD_PAD, ASection, ASegment } from "./kit";
import { getMyProfile, getConnections, getLeaderboard, sapi } from "../../lib/social-api";
import { NAV_HREF } from "../../lib/nav-href";
import { AuroraIcon } from "./icons";
import { StreakMark } from "./streak-mark";
import { LearnedLead } from "./learned";
import { AboutYouLead } from "./questionnaire";
import { LeadRail, LeadCard } from "./lead-rail";
import { withAlpha } from "./field";
import { Mark } from "./mark";

type P = ReturnType<typeof useTheme>["palette"];

/**
 * The badge's ink. The level ramp reuses the palette's existing tones rather
 * than inventing a colour per tier — ash and chalk for the lower tiers, the
 * lime accent-TEXT tone for advanced, gold reserved for elite. Every one is
 * an AA-guarded value (palette.test.ts), so the chip clears contrast on the
 * near-black card. Mirrors web's badgeInk in aurora/profile.tsx.
 */
const badgeInk = (C: P, accent: BadgeAccent): string =>
  accent === "amber" ? C.amber : accent === "lime" ? txt(C, C.lime) : accent === "chalk" ? C.chalk : C.ash;
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
  const { palette: C } = useTheme();
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
    // Tonnage, then the session count — core figure-order.ts, the order every
    // other surface lists the same two figures in.
    if (hasData && lifetimeTonnage > 0) out.push({ v: fmtTonnage(lifetimeTonnage, prefs.units), k: t("w.account.profile.spec-tonnage"), icon: "list-check", hkey: "tonnage" });
    if (hasData) out.push({ v: `${sessions.length}`, k: t("w.account.profile.id-sessions"), icon: "calendar-event", hkey: "sessions" });
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
      {/* THE LEAD RAIL — what the app knows about you, what you told it, and
          (while it is still incomplete) your profile. Three parallel
          invitations, laid INLINE as a snapping left/right rail rather than
          stacked.

          The order is still the argument. Everything below this is who you are
          to other people — a banner, an avatar, follower counts, the public
          highlight grid — and none of it is what the app knows about YOU. The
          ceilings it measured, the recovery rate it clocked and the readiness
          pattern it found are the only things on this screen that no other app
          could show you, and until now they were three levels deep behind a
          disclosure on another tab (components/aurora/learned.tsx).

          What stacking got wrong was the SHAPE, not the priority. The three
          cards ran ~326dp before the cover even began — 41% of the visible
          content area on a 6.7-inch screen, and the whole of it on a 4.7-inch
          one, where the athlete scrolled to reach their own face. The rail runs
          ~121dp for the same three. And the vertical order implied a ranking
          none of these three has over the other two. Side by side they read as
          the set they are, and the identity block is back where a profile
          starts.

          The second card is the model's other half: what the app WORKED OUT
          about you beside what you TOLD it — two authorities on the same
          question, adjacent, because neither is complete alone and the second
          is the one you can act on. The questionnaire had no home before it;
          its two doors were both deep inside Performance (a sheet reached
          through a drawer on the Volume card, and the foot of the monthly
          story), which is to say it could only be found by someone already
          looking for it. A screen holding a person's body, training age and
          recovery belongs where their name and their photo are.

          The third is the owner-only "set up your profile" nudge; it hides once
          the profile has a photo + bio, and the rail closes to two. (This
          screen is always your own.) */}
      <LeadRail>
        <LearnedLead inline sessions={sessions} onOpen={() => router.push("/learned")} />
        <AboutYouLead inline sessions={sessions} onOpen={() => router.push("/questionnaire")} />
        {socialP && !sComplete ? (
          /* THE INVITATION, in the same skeleton as the two readings beside it.
             It carried a shape of its own until the rail put the three in one
             row: a bigger title, a system-font body, no kicker, no accessible
             name, its own hand-drawn chrome, and a 44dp icon tile that pushed
             its text 56dp right of theirs. The lime rim and wash are the whole
             of its distinction now — the one card that asks you to DO something
             rather than reporting what the app found. */
          <LeadCard
            inline
            accent
            kicker={t("w.account.profile.setup-kicker")}
            title={sClaimed ? t("w.account.profile.setup-complete-title") : t("w.account.profile.setup-title")}
            body={sClaimed ? t("w.account.profile.setup-complete-body") : t("w.account.profile.setup-body")}
            onPress={() => router.push("/profile-edit")}
            a11yLabel={[
              t("w.account.profile.setup-kicker"),
              sClaimed ? t("w.account.profile.setup-complete-title") : t("w.account.profile.setup-title"),
              sClaimed ? t("w.account.profile.setup-complete-body") : t("w.account.profile.setup-body"),
            ].join(" – ")}
          />
        ) : null}
      </LeadRail>

      {/* COVER BANNER — Aurora gradient wash with a lime corner glow. The
          edit-profile control lives as a frosted chip in the banner's top-right
          (the classic "edit cover" spot) — out of the content flow, away from
          the avatar and name. */}
      <View style={{ height: 96, borderRadius: RADIUS.card, overflow: "hidden" }}>
        <LinearGradient
          colors={[withAlpha(C.blue, 0.4), withAlpha(C.lime, 0.2), C.ink2]}
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
          style={{ position: "absolute", top: 12, right: 12, width: 38, height: 38, borderRadius: RADIUS.inner, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" }}
        >
          <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
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
          {/* RADIUS.pill on a SQUARE box IS a circle — RN clamps a radius to half the
              side, so 999 on 84×84 renders exactly what the raw `42` here used to.
              That number was arithmetic wearing the costume of a style choice, which
              is how a radius sweep ends up squaring an avatar. */}
          <View style={{ width: 84, height: 84, borderRadius: RADIUS.pill, borderWidth: 3, borderColor: C.ink, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
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
        <Text style={{ fontFamily: F.black, fontSize: 23, color: C.chalk, letterSpacing: tracking(23) }}>{name}</Text>
        <View style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: lime, letterSpacing: tracking(fs.nano, "label") }}>{tier}</Text>
        </View>
        {badge && (
          <Pressable
            onPress={() => router.push("/performance")}
            accessibilityRole="button"
            accessibilityLabel={t("w.analyze.vol.levelCardTitle")}
            style={{ borderWidth: 1, borderColor: badgeInk(C, badge.accent), borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: badgeInk(C, badge.accent), letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase" }}>
              {t(badge.key)}
            </Text>
          </Pressable>
        )}
      </View>

      {/* BIO + quiet HYBRID ID line. */}
      <View style={{ marginTop: 8, paddingHorizontal: 0 }}>
        {!!bioText && (
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, opacity: 0.9, lineHeight: 20 }}>{bioText}</Text>
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
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.user.viewAsOthers")}  ›</Text>
          </Pressable>
        ) : null}
      </View>

      {/* SOCIAL COUNTS — followers / following / (derived) friends rank. */}
      <View style={{ flexDirection: "row", gap: 24, marginTop: 16, paddingHorizontal: 0 }}>
        {socialCounts.map((c) => (
          <View key={c.k} style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk }}>{c.n}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: C.ash, textTransform: "uppercase" }}>{c.k}</Text>
          </View>
        ))}
      </View>

      {/* TABS — Overview / PRs / Activity, on the app's ONE segmented control.
          There is no 4th "Private" tab: it held a link to Performance, a link
          to Settings and Body & progress, so two thirds of it duplicated
          doorways the app already has. Body & progress moved to Nutrition →
          Body, next to the weigh-in its targets are steered by.

          This was a segmented control drawn by hand — three equal widths, and
          a 2dp rule inset 18% either side that appeared under one label and
          vanished from under another, so the one thing the control exists to
          say was the one thing it never showed happening. Worse, that rule was
          CHARTREUSE: the app's single "go" colour, spent on a control that goes
          nowhere, which is exactly what the nutrition picker's first pass
          deleted. `ASegment` carries selection on a neutral lens that travels
          on springs.lens with a haptic, and the accent goes back to meaning
          "this does something".

          The hairline under the row went with it. It was the tab row's
          underline doing double duty as the content's top edge; a track is an
          object, not a rule, and the content below already sets its own step. */}
      <View style={{ marginTop: 16 }}>
        <ASegment
          options={[
            { id: "overview" as const, label: t("w.account.profile.tab-overview") },
            { id: "prs" as const, label: t("w.account.profile.tab-prs") },
            { id: "activity" as const, label: t("w.account.profile.tab-activity") },
          ]}
          value={tab}
          onPick={setTab}
        />
      </View>

      {/* TAB CONTENT */}
      {tab === "overview" && (
        <View style={{ marginTop: 16 }}>
          {/* THIS WEEK — a current-focus snapshot above the lifetime tiles. */}
          {thisWeek.count > 0 && (
            <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, backgroundColor: C.ink2, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "caps"), textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.ov-tw")}</Text>
              <View style={{ flexDirection: "row", gap: 24, marginTop: 8 }}>
                {[{ v: fmtTonnage(thisWeek.vol, prefs.units), k: t("w.account.profile.spec-tonnage") }, { v: `${thisWeek.count}`, k: t("w.account.profile.id-sessions") }].map((s) => (
                  <View key={s.k} style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                    <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk, letterSpacing: tracking(fs.title) }}>{s.v}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: C.ash, textTransform: "uppercase" }}>{s.k}</Text>
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
            <View style={{ width: "100%", padding: 16, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, backgroundColor: C.ink2 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>{t("w.account.profile.pr-empty-mobile")}</Text>
            </View>
          )}
        </View>
      )}

      {tab === "prs" && (
        <View style={{ marginTop: 16 }}>
          {topPrs.length > 0 ? (
            topPrs.map(([lift, wt]) => (
              <View key={lift} style={{ padding: 12, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, marginBottom: 8, backgroundColor: C.ink2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                    <AuroraIcon name="trophy" size={fs.subtitle + 2} color={C.chalk} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{lift}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t("w.account.profile.pr-metric")}</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: lime }}>{fmtWeight(wt, prefs.units)}</Text>
                </View>
                {/* relative-strength bar — each PR against your heaviest lift. */}
                <View style={{ height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 12, overflow: "hidden" }}>
                  <View style={{ width: `${Math.max(8, Math.round((wt / topPrs[0]![1]) * 100))}%`, height: "100%", borderRadius: 2, backgroundColor: lime }} />
                </View>
              </View>
            ))
          ) : (
            <View style={{ padding: 16, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, backgroundColor: C.ink2 }}>
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
                <Text key={i} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: tracking(fs.nano, "label") }}>{m}</Text>
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
                      borderRadius: RADIUS.field,
                      borderWidth: 1,
                      borderColor: a.earned ? withAlpha(C.lime, ALPHA.rim) : C.line,
                      backgroundColor: a.earned ? withAlpha(C.lime, ALPHA.fill) : C.ink2,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Mark mark={a.mark} size={fs.display} color={a.earned ? txt(C, C.lime) as string : C.ash} />
                  </View>
                  <View style={{ width: 48, height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 8, overflow: "hidden" }}>
                    <View style={{ width: `${Math.max(6, pct)}%`, height: "100%", borderRadius: 2, backgroundColor: a.earned ? C.lime : withAlpha(C.lime, 0.6) }} />
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
  return level === 4 ? C.lime : withAlpha(C.lime, op);
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
        Animated.spring(scale, { toValue: 1.06, useNativeDriver: true, ...springToRN(springs.press) }).start();
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
              // A dragged tile grows (the `scale` above) and casts a shadow, so
              // it reads as picked UP rather than merely as the one that
              // happens to be moving. `elevation` alone said that on Android
              // and nothing at all on iOS, which is the platform this ships to.
              // Static rather than interpolated: the scale beside it is
              // native-driven, and a JS-driven shadow in the same style node is
              // the one combination RN refuses.
              style={{ width: "31.5%", aspectRatio: 1, marginBottom: 8, zIndex: isDrag ? 50 : 0, elevation: isDrag ? 8 : 0, shadowColor: "#000", shadowOpacity: isDrag ? 0.4 : 0, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, transform }}
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
                <Animated.View style={{ width: "100%", height: "100%", borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center", padding: 8, transform: editMode && !isDrag ? [{ rotate: rotations[idx % 3] }] : [] }}>
                  <AuroraIcon name={tile.icon} size={22} color={C.lime} />
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.black, fontSize: 19, color: C.chalk, letterSpacing: tracking(19), marginTop: 6 }}>{tile.v}</Text>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: C.ash, textTransform: "uppercase", marginTop: 4, maxWidth: "100%" }}>{tile.k}</Text>
                </Animated.View>
              </Pressable>
              {editMode && (
                <Pressable
                  onPress={() => onToggleHidden(key, true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t("w.account.profile.priv-hide")}
                  style={{ position: "absolute", top: -7, left: -7, width: 24, height: 24, borderRadius: RADIUS.inner, backgroundColor: "#e8e8e8", borderWidth: 2, borderColor: C.ink, alignItems: "center", justifyContent: "center", zIndex: 6 }}
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
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "caps"), color: C.ash, textTransform: "uppercase" }}>{t("w.account.profile.ov-restore")}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {hiddenKeys.map((key) => {
              const tile = tileMap.get(key)!;
              return (
                <Pressable key={key} onPress={() => onToggleHidden(key, false)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingLeft: 8, paddingRight: 12, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.inner, backgroundColor: C.ink2 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.lime, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg, "tight"), color: C.ink }}>+</Text>
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: C.ash, textTransform: "uppercase" }}>{tile.k}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: tracking(fs.nano, "label"), flex: 1 }}>{editMode ? t("w.account.profile.ov-edit-hint") : t("w.account.profile.ov-hint")}</Text>
        {editMode && (
          <Pressable onPress={() => setEditMode(false)} accessibilityRole="button" style={{ backgroundColor: C.chalk, borderRadius: RADIUS.inner, paddingVertical: 8, paddingHorizontal: 20 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.micro, letterSpacing: tracking(fs.micro, "caps"), textTransform: "uppercase", color: C.ink }}>{t("w.account.profile.ov-done")}</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

