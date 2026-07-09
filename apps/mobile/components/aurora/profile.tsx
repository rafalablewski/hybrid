import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
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
  fmtTonnage,
  sessionVolume,
  athleteId,
  canSeeHPI,
  type LoggedSession,
  type Achievement,
  type HeatCell,
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
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, RADIUS } from "./kit";
import { getMyProfile, getConnections } from "../../lib/social-api";
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
  const { t } = useLang();
  const router = useRouter();
  const { name, email, role, entitlement, createdYear } = useIdentity();
  const prefs = useLoggerPrefs();
  // HPI is a Full feature — free (casual) users see a locked teaser, not the score.
  const showHpi = canSeeHPI(usePersona());

  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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

  // Social summary — owner-only "set up your profile" nudge (top) + the
  // following/followers counts (above the membership card).
  const [socialP, setSocialP] = useState<any>(null);
  const [socialConns, setSocialConns] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    getMyProfile().then((d: any) => { if (alive) setSocialP(d); }).catch(() => {});
    getConnections().then((d: any) => { if (alive) setSocialConns(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const sClaimed = !!socialP?.profile;
  const sComplete = sClaimed && !!socialP.profile.bio && !!socialP.profile.avatarUrl;
  const followingN = socialConns?.following?.length ?? 0;
  const followersN = socialConns?.followers?.length ?? 0;

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
            <Text style={{ fontFamily: F.bold, fontWeight: "800", fontSize: 16, color: C.chalk }}>{sClaimed ? "Complete your profile" : "Set up your public profile"}</Text>
            <Text style={{ color: C.ash, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{sClaimed ? "Add a photo and bio so friends recognise you." : "Claim a handle, add a photo and bio so friends can find and follow you."}</Text>
          </View>
          <Text style={{ color: C.lime, fontFamily: F.bold, fontSize: 18 }}>→</Text>
        </Pressable>
      )}

      {/* ACCOUNT HERO — centered avatar + Apple-ID identifier */}
      <View style={{ alignItems: "center" }}>
        <View style={{ width: 98, height: 98 }}>
          <View style={{ width: 98, height: 98, borderRadius: 49, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.black, fontSize: 34, color: lime }}>{initials}</Text>
          </View>
          <Pressable
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
            accessibilityLabel={t("w.account.profile.edit")}
            hitSlop={10}
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
          {role === "coach" ? t("w.account.profile.role-coach") : t("w.account.profile.role-athlete")} · {t("w.account.profile.member-since")} {createdYear}
        </Text>
      </View>

      {/* SPEC STRIP — hairline-divided HPI / Streak / PRs */}
      <View style={{ flexDirection: "row", borderWidth: 1, borderColor: C.line, borderRadius: 18, backgroundColor: C.ink2, marginTop: 20 }}>
        <SpecCol C={C} n={showHpi ? `${hpi.score}` : "🔒"} k="HPI" first />
        <SpecCol C={C} n={`${weekStreakBest}w`} k={t("w.account.profile.spec-streak")} />
        <SpecCol C={C} n={`${prCount}`} k="PRs" />
      </View>

      {/* VOLUME STRIP — total sessions + lifetime tonnage (the two headline
          "how much have I done" numbers, from real logged sessions). */}
      <View style={{ flexDirection: "row", borderWidth: 1, borderColor: C.line, borderRadius: 18, backgroundColor: C.ink2, marginTop: 12 }}>
        <SpecCol C={C} n={hasData ? `${sessions.length}` : "—"} k={t("w.account.profile.id-sessions")} first />
        <SpecCol C={C} n={hasData && lifetimeTonnage > 0 ? fmtTonnage(lifetimeTonnage, prefs.units) : "—"} k={t("w.account.profile.spec-tonnage")} />
      </View>

      {/* ACTIONS */}
      <View style={{ flexDirection: "row", gap: space.ms, marginTop: 14 }}>
        <Pressable onPress={() => router.push("/settings")} style={{ flex: 1, alignItems: "center", backgroundColor: C.lime, borderRadius: 14, paddingVertical: 13 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{t("w.account.profile.edit")}</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/statistics")} style={{ flex: 1, alignItems: "center", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 13 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.account.profile.share-card")}</Text>
        </Pressable>
      </View>

      <View style={{ height: 1, backgroundColor: C.line, marginVertical: 22 }} />

      {/* FOLLOWING / FOLLOWERS — only these two, above the membership card. */}
      <View style={{ flexDirection: "row", borderWidth: 1, borderColor: C.line, borderRadius: 18, backgroundColor: C.ink2, marginBottom: 18 }}>
        {[{ n: followingN, k: "Following" }, { n: followersN, k: "Followers" }].map((c, i) => (
          <View key={c.k} style={{ flex: 1, alignItems: "center", paddingVertical: 14, borderRightWidth: i < 1 ? 1 : 0, borderRightColor: C.line }}>
            <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk }}>{c.n}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: 1.2, color: C.ash, textTransform: "uppercase", marginTop: 5 }}>{c.k}</Text>
          </View>
        ))}
      </View>

      {/* ID CARD — premium membership card */}
      <View style={{ position: "relative", borderRadius: 22, padding: 18, overflow: "hidden", borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2 }}>
        {/* soft lime corner sheen */}
        <View pointerEvents="none" style={{ position: "absolute", top: -60, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: C.lime, opacity: 0.12 }} />
        {/* faint diagonal etch */}
        <View pointerEvents="none" style={{ position: "absolute", top: 30, left: -40, width: 260, height: 1, backgroundColor: C.lime, opacity: 0.06, transform: [{ rotate: "20deg" }] }} />
        <View pointerEvents="none" style={{ position: "absolute", top: 70, left: -40, width: 260, height: 1, backgroundColor: C.lime, opacity: 0.06, transform: [{ rotate: "20deg" }] }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk, letterSpacing: 0.3 }}>
            HYBRID<Text style={{ color: C.lime }}>.</Text> · {t("w.account.profile.membership")}
          </Text>
          <View style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 4 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: lime, letterSpacing: 0.8 }}>{tier} · {role === "coach" ? t("w.account.profile.coach-upper") : t("w.account.profile.member-upper")}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 30 }}>
          <IdMeta C={C} label={t("w.account.profile.id-member-since")} value={`${createdYear}`} />
          <IdMeta C={C} label={t("w.account.profile.id-sessions")} value={`${sessions.length}`} />
          <IdMeta C={C} label={t("w.account.profile.id-index")} value={showHpi ? `${hpi.score}` : "🔒"} accent />
        </View>
      </View>

      {/* HPI HERO — Full only; free (casual) users get a locked upsell. */}
      {showHpi ? (
        <View style={{ marginTop: 14, borderWidth: 1, borderColor: C.line, borderRadius: 22, padding: 18, backgroundColor: C.ink2 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.6, color: C.ash, textTransform: "uppercase" }}>{t("w.account.profile.hpi-title")}</Text>
          <Text style={{ fontFamily: F.black, fontSize: 80, lineHeight: 80, letterSpacing: -3, color: C.chalk, marginTop: 10 }}>
            {hpiHead(hpi.score)}<Text style={{ color: C.lime }}>{hpiTail(hpi.score)}</Text>
          </Text>
          <View style={{ alignSelf: "flex-start", borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4, marginTop: 10 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: lime, textTransform: "uppercase" }}>{t("w.account.profile.band")} · {hpi.band}</Text>
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
                  style={{ flex: 1, height: 6 + ((v - min) / range) * 28, borderRadius: 2, backgroundColor: i === hpiTrace.length - 1 ? C.lime : C.line }}
                />
              ));
            })()}
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 9 }}>
            <Text style={{ color: lime }}>{hpiDelta >= 0 ? "▲ +" : "▼ "}{hpiDelta}</Text> {t("w.account.profile.vs-first-read")} · {t("w.account.profile.comp-strength")} {hpi.components.strength} · {t("w.account.profile.comp-engine")} {hpi.components.endurance} · {t("w.account.profile.comp-recovery")} {hpi.components.recovery >= 0 ? "+" : ""}{hpi.components.recovery}
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 14, borderWidth: 1, borderColor: C.line, borderRadius: 22, padding: 18, backgroundColor: C.ink2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 11 }}>🔒</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.6, color: C.ash, textTransform: "uppercase" }}>{t("w.account.profile.hpi-locked-title")}</Text>
          </View>
          <Text style={{ fontFamily: F.black, fontSize: 64, lineHeight: 64, letterSpacing: -3, color: C.ash, opacity: 0.5, marginTop: 10 }}>
            ——<Text style={{ color: C.lime }}>—</Text>
          </Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 12, lineHeight: 20 }}>{t("w.account.profile.hpi-locked-body")}</Text>
          <Pressable onPress={() => router.push("/upgrade")} accessibilityRole="button" accessibilityLabel={t("w.account.profile.hpi-locked-cta")} style={{ alignSelf: "flex-start", marginTop: 12, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 20, paddingVertical: 11 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>✦ {t("w.account.profile.hpi-locked-cta")} →</Text>
          </Pressable>
        </View>
      )}

      {/* TRAINING — 26-week heatmap */}
      <SectionHeader C={C} title={t("w.account.profile.training")} action={`${sessions.length} ${t("w.account.profile.sessions")}`} />
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

      {/* ACHIEVEMENTS — squared badge tiles */}
      <SectionHeader C={C} title={t("w.account.profile.achievements")} action={`${achievements.filter((a) => a.earned).length} ${t("w.account.profile.earned")}`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.ms }}>
        {achievements.map((a) => {
          const pct = Math.round(a.progress * 100);
          return (
            <View key={a.id} style={{ width: 80, alignItems: "center" }}>
              <View
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: a.earned ? `${C.lime}73` : C.line,
                  backgroundColor: a.earned ? `${C.lime}1f` : C.ink2,
                  alignItems: "center",
                  justifyContent: "center",
                  ...(a.earned
                    ? { shadowColor: C.lime, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 4 }
                    : {}),
                }}
              >
                {/* The real badge icon — full when earned, dimmed while locked. A
                    padlock hid what you're working toward; the bar below shows how
                    close you are, so a locked badge motivates instead of deadends. */}
                <Text style={{ fontSize: 27, opacity: a.earned ? 1 : 0.38 }}>{a.icon}</Text>
              </View>
              <View style={{ width: 60, height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 9, overflow: "hidden" }}>
                <View style={{ width: `${Math.max(6, pct)}%`, height: "100%", borderRadius: 2, backgroundColor: a.earned ? C.lime : `${C.lime}99` }} />
              </View>
              <Text numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.nano, color: C.ash, marginTop: 7, maxWidth: 80, textAlign: "center" }}>{a.label}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 8.5, color: a.earned ? lime : C.ash, marginTop: 2 }}>{a.earned ? "✓" : `${pct}%`}</Text>
            </View>
          );
        })}
      </ScrollView>

      {/* PERSONAL RECORDS — top lifts by e1RM */}
      <SectionHeader C={C} title={t("w.account.profile.personal-records")} action={hasData ? t("w.account.profile.by-e1rm") : ""} />
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
            {/* relative-strength bar — each PR against your heaviest lift, so the
                records read as a quick visual ranking (matches the achievement bars). */}
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
