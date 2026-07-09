"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fs, space,
  trainingHeatmap,
  computeAchievements,
  lifetimePrCount,
  longestWeekStreak,
  streak,
  computePerformanceState,
  performanceTrajectory,
  toTrainingLog,
  bestE1rmMap,
  fmtWeight,
  fmtTonnage,
  sessionVolume,
  athleteId as makeAthleteId,
  canSeeHPI,
  type Achievement,
  type HeatCell,
  type LoggedSession,
  type Biometrics,
  type Macrocycle,
} from "@hybrid/core";
import { useSession } from "@/lib/session";
import { usePersona } from "@/lib/persona";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";

/**
 * AURORA Profile · "You" (web) — the Apple-ID / Tesla-account membership screen.
 * Centered account hero, a hairline spec strip, the HYBRID membership ID card,
 * an oversized HPI hero, a year-of-training heatmap, earned achievement badges,
 * personal records and the athlete module tiles. EVERY metric is computed from
 * the athlete's real logged sessions + recovery signals via @hybrid/core engines
 * — empty history degrades gracefully (no fabricated numbers).
 */
const C = (v: string) => `var(--color-${v})`;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export default function AuroraProfile({
  sessions,
  bio,
  onNavigate,
}: {
  sessions: LoggedSession[];
  bio?: Biometrics;
  macro?: Macrocycle | null;
  currentWeek?: number;
  /** In-shell navigation (keeps the sidebar); falls back to a route push. */
  onNavigate?: (screen: string) => void;
}) {
  const router = useRouter();
  const { t } = useLang();
  const { session, entitlement } = useSession();
  const prefs = useLoggerPrefs();
  const units = prefs.units;
  // HPI is a Full feature — free (casual) users see a locked teaser, not the score.
  const showHpi = canSeeHPI(usePersona());


  const name = session?.name ?? t("w.account.profile.athlete-fallback");
  const email = session?.email ?? "";
  const paid = entitlement === "paid";
  const tier = paid ? "FULL" : "FREE";
  const role = session?.role ?? "client";

  const go = (screen: string, route: string) => () => (onNavigate ? onNavigate(screen) : router.push(route));

  // ----- real data, computed from logged sessions -----
  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const hasData = sessions.length > 0;

  // HPI 12-point trace (oldest→today) + a 30-day delta from the trajectory.
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
    return state.hpi.score - traj[0]!.hpi;
  }, [traj, state.hpi.score]);

  // Spec strip + ID card metrics.
  const weekStreak = useMemo(() => longestWeekStreak(sessions), [sessions]);
  const prCount = useMemo(() => lifetimePrCount(sessions), [sessions]);
  const dayStreak = useMemo(() => streak(sessions), [sessions]);
  // Lifetime tonnage — total load × reps across every logged session (kg-domain,
  // formatted to the athlete's units: tonnes for kg, total lb for lb).
  const lifetimeTonnage = useMemo(() => sessions.reduce((sum, s) => sum + sessionVolume(s.blocks), 0), [sessions]);

  // Member-since year — the earliest session, or this year for a fresh account.
  const memberSince = useMemo(() => {
    if (sessions.length === 0) return new Date().getFullYear();
    // Guard against a missing/invalid startedAt (Date.parse → NaN would poison Math.min).
    const earliest = sessions.reduce((min, s) => {
      const t = Date.parse(s.startedAt);
      return Number.isNaN(t) ? min : Math.min(min, t);
    }, Infinity);
    return earliest === Infinity ? new Date().getFullYear() : new Date(earliest).getFullYear();
  }, [sessions]);

  // Athlete ID — a stable, anonymous hash (shared with mobile via @hybrid/core
  // so the same user sees the same ID). Seeded by email, else the raw account
  // name, so email-less accounts still get a distinct, language-independent ID.
  const athleteId = useMemo(() => makeAthleteId(email || (session?.name ?? "")), [email, session?.name]);

  const initials = useMemo(
    () => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "A",
    [name],
  );

  // Heatmap — 26 weeks of columns of 7 day cells.
  const heat = useMemo<HeatCell[][]>(() => trainingHeatmap(sessions, 26), [sessions]);
  const monthLabels = useMemo(() => {
    // sample the first row's date per ~quarter for the month strip.
    const idxs = [0, Math.floor(heat.length / 3), Math.floor((2 * heat.length) / 3), heat.length - 1];
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const i of idxs) {
      const d = heat[i]?.[0]?.date;
      const m = d ? MONTHS[new Date(`${d}T00:00:00Z`).getUTCMonth()]! : "";
      if (m && !seen.has(m)) { seen.add(m); labels.push(m); }
    }
    labels.push("NOW");
    return labels;
  }, [heat]);

  const achievements = useMemo<Achievement[]>(() => computeAchievements(sessions), [sessions]);

  // Top personal records — best e1RM per lift, descending, top 3.
  const prs = useMemo(() => {
    return [...bestE1rmMap(sessions).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [sessions]);

  // ----- styles (match the mockup; inline var(--color-…) like sibling Aurora screens) -----
  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 22 } as const;
  // Social summary — for the owner-only "set up your profile" nudge (top) and
  // the following/followers counts (above the membership card).
  const [socialP, setSocialP] = useState<{ profile?: { handle: string; bio?: string | null; avatarUrl?: string | null } | null } | null>(null);
  const [socialConns, setSocialConns] = useState<{ followers?: unknown[]; following?: unknown[] } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/social/profile").then((r) => r.json()).then((d) => { if (alive) setSocialP(d); }).catch(() => {});
    fetch("/api/social/connections").then((r) => r.json()).then((d) => { if (alive) setSocialConns(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const sClaimed = !!socialP?.profile;
  const sComplete = sClaimed && !!socialP!.profile!.bio && !!socialP!.profile!.avatarUrl;
  const followingN = socialConns?.following?.length ?? 0;
  const followersN = socialConns?.followers?.length ?? 0;
  const sectionHead = (title: string, action?: string) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "26px 2px 13px" }}>
      <div style={{ fontWeight: 800, fontSize: fs.subtitle, letterSpacing: "-.01em" }}>{title}</div>
      {action && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{action}</div>}
    </div>
  );

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", fontFamily: "var(--font-display)" }}>
      {/* SET UP YOUR PROFILE — owner-only nudge at the very top; encourages
          claiming a handle + adding a photo/bio. Hides once the profile is
          complete. (This screen is always your own, so it's only-you by nature.) */}
      {socialP && !sComplete && (
        <button
          onClick={go("settings", "/settings")}
          style={{ width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 18, border: `1px solid ${C("lime")}`, background: "linear-gradient(135deg, color-mix(in srgb, var(--color-lime) 12%, transparent), transparent)", borderRadius: 20, padding: 16, display: "flex", alignItems: "center", gap: 14, color: C("chalk") }}
        >
          <span style={{ width: 44, height: 44, borderRadius: 14, background: C("lime"), display: "grid", placeItems: "center", flexShrink: 0 }}>
            <AuroraIcon name="user-circle" size={22} color={C("ink")} />
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 16 }}>{sClaimed ? "Complete your profile" : "Set up your public profile"}</span>
            <span style={{ display: "block", color: C("ash"), fontSize: 13, marginTop: 2, lineHeight: 1.4 }}>{sClaimed ? "Add a photo and bio so friends recognise you." : "Claim a handle, add a photo and bio so friends can find and follow you."}</span>
          </span>
          <span style={{ color: C("lime"), fontWeight: 800, fontSize: 18 }}>→</span>
        </button>
      )}

      {/* ACCOUNT HERO — Apple-ID / Tesla account chrome */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ position: "relative", width: 98, height: 98 }}>
          <div
            style={{
              width: 98, height: 98, borderRadius: "50%",
              background: "linear-gradient(150deg, var(--color-ink2), transparent)",
              border: "1px solid var(--color-line)", display: "grid", placeItems: "center",
              fontWeight: 900, fontSize: 34, color: "var(--lime-text)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
            }}
          >
            {initials}
          </div>
          <button
            onClick={go("settings", "/settings")}
            aria-label={t("w.account.profile.edit")}
            style={{
              position: "absolute", right: -1, bottom: -1, width: 30, height: 30, borderRadius: "50%",
              background: C("lime"), color: C("ink"), display: "grid", placeItems: "center",
              fontSize: fs.body, border: `3px solid ${C("ink")}`, cursor: "pointer",
            }}
          >
            <AuroraIcon name="settings" size={14} strokeWidth={4} color={C("ink")} />
          </button>
        </div>
        <div style={{ fontWeight: 900, fontSize: 25, letterSpacing: "-.025em", marginTop: 15, display: "flex", alignItems: "center", gap: 9 }}>
          {name}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, border: `1px solid ${C("lime")}`, color: "var(--lime-text)", borderRadius: 999, padding: "3px 9px", letterSpacing: ".08em" }}>{tier}</span>
        </div>
        {/* ONE identity line — the Hybrid ID. (The membership card no longer
            repeats an "Athlete ID"; the email stays as quiet account contact.) */}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 8, letterSpacing: ".02em" }}>
          HYBRID ID · {athleteId}
        </div>
        {email && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 4, opacity: 0.8 }}>{email}</div>
        )}
        <div style={{ fontSize: 12.5, color: C("chalk"), marginTop: 8, opacity: 0.85, textTransform: "capitalize" }}>
          {role === "coach" ? t("w.account.profile.role-coach") : t("w.account.profile.role-athlete")} · {t("w.account.profile.member-since")} {memberSince}
        </div>
      </div>

      {/* SPEC STRIP — hairline-divided metrics */}
      <div style={{ display: "flex", border: `1px solid ${C("line")}`, borderRadius: 18, background: C("ink2"), marginTop: 20 }}>
        {[
          { n: showHpi ? (hasData ? String(state.hpi.score) : "—") : "🔒", k: "HPI" },
          { n: weekStreak > 0 ? `${weekStreak}w` : "—", k: t("w.account.profile.spec-streak") },
          { n: prCount > 0 ? String(prCount) : "—", k: "PRs" },
        ].map((c, i) => (
          <div key={c.k} style={{ flex: 1, textAlign: "center", padding: "15px 0", borderRight: i < 2 ? `1px solid ${C("line")}` : "none" }}>
            <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-.02em" }}>{c.n}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: ".12em", color: C("ash"), textTransform: "uppercase", marginTop: 5 }}>{c.k}</div>
          </div>
        ))}
      </div>

      {/* VOLUME STRIP — total sessions + lifetime tonnage (the two headline
          "how much have I done" numbers, computed from real logged sessions). */}
      <div style={{ display: "flex", border: `1px solid ${C("line")}`, borderRadius: 18, background: C("ink2"), marginTop: 12 }}>
        {[
          { n: hasData ? String(sessions.length) : "—", k: t("w.account.profile.id-sessions") },
          { n: hasData && lifetimeTonnage > 0 ? fmtTonnage(lifetimeTonnage, units) : "—", k: t("w.account.profile.spec-tonnage") },
        ].map((c, i) => (
          <div key={c.k} style={{ flex: 1, textAlign: "center", padding: "15px 0", borderRight: i < 1 ? `1px solid ${C("line")}` : "none" }}>
            <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-.02em" }}>{c.n}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: ".12em", color: C("ash"), textTransform: "uppercase", marginTop: 5 }}>{c.k}</div>
          </div>
        ))}
      </div>

      {/* ACTIONS */}
      <div style={{ display: "flex", gap: space.ms, marginTop: 14 }}>
        <button onClick={go("settings", "/settings")} style={{ flex: 1, textAlign: "center", borderRadius: 14, padding: 13, fontWeight: 700, fontSize: fs.body, background: C("lime"), border: `1px solid ${C("lime")}`, color: C("ink"), cursor: "pointer" }}>{t("w.account.profile.edit")}</button>
        <ShareCard name={name} hpi={showHpi && hasData ? state.hpi.score : null} band={showHpi ? state.hpi.band : ""} streak={weekStreak} prs={prCount} memberSince={memberSince} tier={tier} />
      </div>

      <div style={{ height: 1, background: C("line"), margin: "22px 0" }} />

      {/* FOLLOWING / FOLLOWERS — only these two, above the membership card. */}
      <div style={{ display: "flex", border: `1px solid ${C("line")}`, borderRadius: 18, background: C("ink2"), marginBottom: 18 }}>
        {[{ n: followingN, k: "Following" }, { n: followersN, k: "Followers" }].map((c, i) => (
          <div key={c.k} style={{ flex: 1, textAlign: "center", padding: "14px 0", borderRight: i < 1 ? `1px solid ${C("line")}` : "none" }}>
            <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-.02em" }}>{c.n}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: ".12em", color: C("ash"), textTransform: "uppercase", marginTop: 5 }}>{c.k}</div>
          </div>
        ))}
      </div>

      {/* ID CARD — premium membership card */}
      <div style={{ position: "relative", borderRadius: 22, padding: 18, overflow: "hidden", border: "1px solid var(--color-line)", background: "linear-gradient(160deg, var(--color-ink2), var(--color-ink) 60%)" }}>
        {/* faint diagonal etch */}
        <span style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(115deg, color-mix(in srgb, var(--color-lime) 6%, transparent) 0 1px, transparent 1px 14px)", opacity: 0.7, pointerEvents: "none" }} />
        {/* soft accent corner sheen */}
        <span style={{ position: "absolute", top: -60, right: -50, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, color-mix(in srgb, var(--color-lime) 22%, transparent), transparent 70%)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <div style={{ fontWeight: 900, fontSize: fs.body, letterSpacing: ".04em" }}>HYBRID<span style={{ color: C("lime") }}>.</span> · {t("w.account.profile.membership")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, border: `1px solid ${C("lime")}`, color: "var(--lime-text)", borderRadius: 999, padding: "4px 9px", letterSpacing: ".1em" }}>{tier} · {role === "coach" ? t("w.account.profile.coach-upper") : t("w.account.profile.member-upper")}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 30, position: "relative" }}>
          <IdMeta label={t("w.account.profile.id-member-since")} value={String(memberSince)} />
          <IdMeta label={t("w.account.profile.id-sessions")} value={hasData ? String(sessions.length) : "—"} />
          <IdMeta label={t("w.account.profile.id-index")} value={showHpi ? (hasData ? String(state.hpi.score) : "—") : "🔒"} lime />
        </div>
      </div>

      {/* HPI HERO — Full only; free (casual) users get a locked upsell. */}
      {showHpi ? (
        <div style={{ marginTop: 14, border: `1px solid ${C("line")}`, borderRadius: 22, padding: 18, background: "linear-gradient(180deg, var(--color-ink2), var(--color-ink))" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".18em", color: C("ash"), textTransform: "uppercase" }}>{t("w.account.profile.hpi-title")}</div>
          <BigNumber value={hasData ? state.hpi.score : null} />
          <span style={{ display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--lime-text)", border: `1px solid ${C("line")}`, borderRadius: 999, padding: "4px 10px", marginTop: 8, textTransform: "uppercase" }}>
            {t("w.account.profile.band")} · {hasData ? state.hpi.band : t("w.account.profile.unrated")}
          </span>
          {/* 12-bar trace */}
          <Trace series={hpiTrace} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 9 }}>
            {hasData ? (
              <>
                <span style={{ color: "var(--lime-text)" }}>{hpiDelta >= 0 ? "▲ +" : "▼ "}{hpiDelta}</span> {t("w.account.profile.vs-last-30")} · {t("w.account.profile.comp-strength")} {state.hpi.components.strength} · {t("w.account.profile.comp-engine")} {state.hpi.components.endurance} · {t("w.account.profile.comp-recovery")} {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}
              </>
            ) : (
              t("w.account.profile.hpi-empty")
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14, border: `1px solid ${C("line")}`, borderRadius: 22, padding: 18, background: "linear-gradient(180deg, var(--color-ink2), var(--color-ink))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".18em", color: C("ash"), textTransform: "uppercase" }}>
            <span>🔒</span>{t("w.account.profile.hpi-locked-title")}
          </div>
          <div style={{ fontWeight: 900, fontSize: 64, lineHeight: 0.9, letterSpacing: "-.05em", marginTop: 10, color: C("ash"), opacity: 0.5 }}>
            ——<span style={{ color: C("lime"), opacity: 0.5 }}>—</span>
          </div>
          <p style={{ fontSize: fs.body, lineHeight: 1.55, color: C("chalk"), marginTop: 12 }}>{t("w.account.profile.hpi-locked-body")}</p>
          <button onClick={go("upgrade", "/upgrade")} style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, border: "none", borderRadius: 999, background: C("lime"), padding: "11px 20px", fontWeight: 800, fontSize: fs.body, color: C("ink"), cursor: "pointer" }}>
            ✦ {t("w.account.profile.hpi-locked-cta")} →
          </button>
        </div>
      )}

      {/* TRAINING — year heatmap */}
      {sectionHead(t("w.account.profile.training"), `${sessions.length} ${sessions.length === 1 ? t("w.account.profile.session") : t("w.account.profile.sessions")} →`)}
      <div style={{ border: `1px solid ${C("line")}`, borderRadius: 22, background: "linear-gradient(180deg, var(--color-ink2), var(--color-ink))", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: C("ash"), letterSpacing: ".08em", marginBottom: 8, padding: "0 2px" }}>
          {monthLabels.map((m, i) => <span key={i}>{m}</span>)}
        </div>
        <div style={{ display: "grid", gridTemplateRows: "repeat(7,1fr)", gridAutoFlow: "column", gridAutoColumns: "1fr", gap: 3, height: 132 }}>
          {heat.map((col, ci) =>
            col.map((cell, ri) => (
              <div
                key={`${ci}-${ri}`}
                title={`${cell.date} · ${cell.count} session${cell.count === 1 ? "" : "s"}`}
                style={{ borderRadius: 2.5, background: heatBg(cell.level) }}
              />
            )),
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 11, fontFamily: "var(--font-mono)", fontSize: 8, color: C("ash") }}>
          <span style={{ color: "var(--lime-text)" }}>{weekStreak > 0 ? `${weekStreak}${t("w.account.profile.week-streak-suffix")}` : dayStreak.current > 0 ? `${dayStreak.current}${t("w.account.profile.day-streak-suffix")}` : t("w.account.profile.no-streak")}</span>
          <span style={{ flex: 1 }} />
          {t("w.account.profile.less")}
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} style={{ width: 10, height: 10, borderRadius: 2.5, display: "inline-block", background: heatBg(l as HeatCell["level"]) }} />
          ))}
          {t("w.account.profile.more")}
        </div>
      </div>

      {/* ACHIEVEMENTS — squared badges */}
      {sectionHead(t("w.account.profile.achievements"), `${achievements.filter((a) => a.earned).length} ${t("w.account.profile.earned")} →`)}
      <div style={{ display: "flex", gap: space.ms, overflowX: "auto", scrollbarWidth: "none" }}>
        {achievements.map((a) => {
          const pct = Math.round(a.progress * 100);
          return (
            <div key={a.id} style={{ flex: "none", width: 80, textAlign: "center" }}>
              <div
                title={a.detail}
                style={{
                  width: 76, height: 76, borderRadius: 20, display: "grid", placeItems: "center", fontSize: 27, margin: "0 auto",
                  border: `1px solid ${a.earned ? "color-mix(in srgb, var(--color-lime) 45%, transparent)" : C("line")}`,
                  background: a.earned ? "linear-gradient(160deg, color-mix(in srgb, var(--color-lime) 12%, var(--color-ink2)), var(--color-ink))" : C("ink2"),
                  boxShadow: a.earned ? "0 0 22px -10px color-mix(in srgb, var(--color-lime) 60%, transparent)" : "none",
                }}
              >
                {/* The real badge icon — full when earned, dimmed while locked; the
                    bar below shows how close you are (a padlock hid the goal). */}
                <span style={{ opacity: a.earned ? 1 : 0.4, filter: a.earned ? "none" : "grayscale(0.5)" }}>{a.icon}</span>
              </div>
              <div style={{ width: 60, height: 4, borderRadius: 2, background: C("line"), margin: "9px auto 0", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(6, pct)}%`, height: "100%", borderRadius: 2, background: a.earned ? C("lime") : "color-mix(in srgb, var(--color-lime) 60%, transparent)" }} />
              </div>
              <div style={{ fontSize: fs.nano, color: C("ash"), marginTop: 7, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: a.earned ? "var(--lime-text)" : C("ash"), marginTop: 2 }}>{a.earned ? "✓" : `${pct}%`}</div>
            </div>
          );
        })}
      </div>

      {/* PERSONAL RECORDS */}
      {sectionHead(t("w.account.profile.personal-records"), prs.length ? `${t("w.account.profile.see-all")} →` : undefined)}
      {prs.length ? (
        prs.map(([lift, e1rm]) => (
          <div key={lift} style={{ ...card, padding: "13px 14px", marginBottom: 9 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span style={{ fontSize: fs.subtitle }}>🏆</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: fs.bodyLg }}>{lift}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C("ash"), marginTop: 2 }}>e1RM</div>
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.note, color: "var(--lime-text)" }}>{fmtWeight(e1rm, units)}</div>
            </div>
            {/* relative-strength bar — each PR against your heaviest lift, so the
                records read as a quick visual ranking (matches the achievement bars). */}
            <div style={{ height: 4, borderRadius: 2, background: C("line"), marginTop: 11, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(8, Math.round((e1rm / prs[0]![1]) * 100))}%`, height: "100%", borderRadius: 2, background: C("lime") }} />
            </div>
          </div>
        ))
      ) : (
        <div style={{ ...card, padding: 16, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
          {t("w.account.profile.pr-empty")}
        </div>
      )}

    </div>
  );
}

// ----- helpers -----

function heatBg(level: HeatCell["level"]): string {
  // Themed accent ramp — lime in Aurora, clay in Japandi; empty cells use the
  // themed hairline so they're a faint warm cell on light, not a black square.
  switch (level) {
    case 1: return "color-mix(in srgb, var(--color-lime) 28%, transparent)";
    case 2: return "color-mix(in srgb, var(--color-lime) 50%, transparent)";
    case 3: return "color-mix(in srgb, var(--color-lime) 74%, transparent)";
    case 4: return "var(--color-lime)";
    default: return "var(--color-line)";
  }
}

function IdMeta({ label, value, lime }: { label: string; value: string; lime?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: ".12em", color: C("ash"), textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: lime ? "var(--lime-text)" : C("chalk"), marginTop: 4 }}>{value}</div>
    </div>
  );
}

function BigNumber({ value }: { value: number | null }) {
  const s = value == null ? "—" : String(value);
  const head = s.slice(0, -1);
  const last = s.slice(-1);
  return (
    <div style={{ fontWeight: 900, fontSize: 80, lineHeight: 0.86, letterSpacing: "-.05em", marginTop: 10 }}>
      {head}
      <span style={{ color: C("lime") }}>{last}</span>
    </div>
  );
}

function Trace({ series }: { series: number[] }) {
  // 12 bars; the last is highlighted lime. Heights are scaled within the window.
  const bars = series.length >= 2 ? series : Array(12).fill(0);
  const max = Math.max(1, ...bars);
  const min = Math.min(...bars);
  const range = max - min || 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 34, marginTop: 14 }}>
      {bars.map((v, i) => {
        const pct = series.length >= 2 ? 30 + ((v - min) / range) * 64 : 22;
        const isLast = i === bars.length - 1;
        return <div key={i} style={{ flex: 1, borderRadius: 2, height: `${pct}%`, background: isLast && series.length >= 2 ? C("lime") : C("line") }} />;
      })}
    </div>
  );
}


/** Share card — copies a one-line membership summary to the clipboard. */
function ShareCard({ name, hpi, band, streak: wk, prs, memberSince, tier }: { name: string; hpi: number | null; band: string; streak: number; prs: number; memberSince: number; tier: string }) {
  const { t } = useLang();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 1800);
    return () => clearTimeout(timer);
  }, [done]);
  const share = async () => {
    const text = `HYBRID · ${name} (${tier})\nHPI ${hpi ?? "—"} · ${t("w.account.profile.share-band")} ${band}\n${wk}${t("w.account.profile.week-streak-suffix")} · ${prs} PRs · ${t("w.account.profile.member-since")} ${memberSince}\napp.hybrid.app`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "HYBRID", text });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      setDone(true);
    } catch {
      /* user dismissed the share sheet — no-op */
    }
  };
  return (
    <button onClick={share} style={{ flex: 1, textAlign: "center", borderRadius: 14, padding: 13, fontWeight: 700, fontSize: fs.body, background: C("ink2"), border: `1px solid ${C("line")}`, color: C("chalk"), cursor: "pointer" }}>
      {done ? t("w.account.profile.copied") : t("w.account.profile.share-card")}
    </button>
  );
}
