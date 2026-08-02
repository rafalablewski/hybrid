"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fs, space,
  trainingHeatmap,
  computeAchievements,
  longestWeekStreak,
  streak,
  topLoadMap,
  fmtWeight,
  fmtTonnage,
  sessionVolume,
  totalVolume,
  athleteId as makeAthleteId,
  canSeeHPI,
  type Achievement,
  type HeatCell,
  type LoggedSession,
  type Biometrics,
  type Macrocycle,
  type AuroraIconName,
} from "@hybrid/core";
import { useSession } from "@/lib/session";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { usePersona } from "@/lib/persona";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
import PrivateTab from "./private-tab";

/**
 * AURORA Profile · "You" (web) — the SOCIAL layout: a cover banner, an
 * overlapping avatar with an edit icon (the shared "settings" glyph — the mobile
 * kit has no pencil PNG asset, so both clients use the one glyph for parity; a
 * dedicated pencil is a blocked follow-up needing a new design-kit asset), name
 * + the (unchanged) membership pill, bio, follower/following/rank counts, tabs
 * (Overview / PRs / Activity) and a 3-column grid of PUBLIC highlight tiles.
 * Kept at parity with the mobile client.
 *
 * Privacy: HPI is PRIVATE — deliberately absent from the public highlight grid
 * and every follower-facing surface. It lives only in a clearly-marked
 * "Private · only you" card at the bottom (this screen is always your own
 * profile). Every metric is computed from the athlete's real logged sessions +
 * recovery signals via @hybrid/core engines — empty history degrades gracefully
 * (no fabricated numbers).
 */
const C = (v: string) => `var(--color-${v})`;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

type TabId = "overview" | "prs" | "activity" | "private";

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

  const [tab, setTab] = useState<TabId>("overview");

  const name = session?.name ?? t("w.account.profile.athlete-fallback");
  const email = session?.email ?? "";
  const paid = entitlement === "paid";
  const tier = paid ? "FULL" : "FREE";

  const go = (screen: string, route: string) => () => (onNavigate ? onNavigate(screen) : router.push(route));

  // Highlight curation — the owner's private arrangement of the public Overview
  // grid: which tiles are hidden, and the order they sit in. Loaded once; the
  // grid's edit mode (long-press) drives both, and persists to /api/highlights.
  const [hidden, setHidden] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/highlights").then((r) => r.json()).then((d) => {
      if (!alive) return;
      setHidden(d.hidden ?? []);
      setOrder(d.order ?? []);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const toggleHidden = useCallback((key: string, next: boolean) => {
    setHidden((h) => (next ? [...new Set([...h, key])] : h.filter((k) => k !== key)));
    fetch("/api/highlights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, hidden: next }) })
      .then((r) => r.json()).then((d) => { if (d.hidden) setHidden(d.hidden); }).catch(() => {});
  }, []);
  const persistOrder = useCallback((keys: string[]) => {
    setOrder(keys);
    fetch("/api/highlights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: keys }) })
      .then((r) => r.json()).then((d) => { if (d.order) setOrder(d.order); }).catch(() => {});
  }, []);

  // ----- real data, computed from logged sessions -----
  // HPI / readiness / injury-risk belong to the Cockpit — the Private tab LINKS
  // there instead of recomputing them, so the profile never duplicates the
  // command center. Everything below feeds the PUBLIC grid (PRs, streak, tonnage).
  const hasData = sessions.length > 0;

  const bw = useBodyweightLookup();
  const weekStreak = useMemo(() => longestWeekStreak(sessions), [sessions]);
  const dayStreak = useMemo(() => streak(sessions), [sessions]);
  // Lifetime tonnage — total load × reps across every logged session (kg-domain,
  // formatted to the athlete's units: tonnes for kg, total lb for lb).
  const lifetimeTonnage = useMemo(() => totalVolume(sessions, bw), [sessions, bw]);

  // Member-since year — the earliest session, or this year for a fresh account.
  const memberSince = useMemo(() => {
    if (sessions.length === 0) return new Date().getFullYear();
    const earliest = sessions.reduce((min, s) => {
      const ts = Date.parse(s.startedAt);
      return Number.isNaN(ts) ? min : Math.min(min, ts);
    }, Infinity);
    return earliest === Infinity ? new Date().getFullYear() : new Date(earliest).getFullYear();
  }, [sessions]);

  // Athlete ID — a stable, anonymous hash (shared with mobile via @hybrid/core).
  const athleteId = useMemo(() => makeAthleteId(email || (session?.name ?? "")), [email, session?.name]);

  const initials = useMemo(
    () => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "A",
    [name],
  );

  // Heatmap — 26 weeks of columns of 7 day cells.
  const heat = useMemo<HeatCell[][]>(() => trainingHeatmap(sessions, 26), [sessions]);
  const monthLabels = useMemo(() => {
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

  const achievements = useMemo<Achievement[]>(() => computeAchievements(sessions, bw), [sessions, bw]);
  const earnedCount = useMemo(() => achievements.filter((a) => a.earned).length, [achievements]);

  // Top personal records — heaviest actual lift per movement, descending, top 3.
  const prs = useMemo(() => {
    return [...topLoadMap(sessions).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [sessions]);

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28 } as const;

  // Social summary — owner-only "set up your profile" nudge, the public bio +
  // avatar, the following/followers counts and (derived) friends rank.
  const [socialP, setSocialP] = useState<{ profile?: { handle: string; bio?: string | null; avatarUrl?: string | null } | null } | null>(null);
  const [socialConns, setSocialConns] = useState<{ followers?: unknown[]; following?: unknown[] } | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/social/profile").then((r) => r.json()).then((d) => { if (alive) setSocialP(d); }).catch(() => {});
    fetch("/api/social/connections").then((r) => r.json()).then((d) => { if (alive) setSocialConns(d); }).catch(() => {});
    // Friends leaderboard (this week's volume) → my position among mutual follows.
    // Only meaningful when there's more than just me on the board; otherwise omitted.
    fetch("/api/social/leaderboard?metric=volume").then((r) => r.json()).then((d) => {
      const board = d?.board;
      if (alive && Array.isArray(board) && board.length > 1) {
        const me = board.find((row: { isMe?: boolean }) => row?.isMe) as { rank?: number } | undefined;
        if (me?.rank) setRank(me.rank);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const sClaimed = !!socialP?.profile;
  const sComplete = sClaimed && !!socialP!.profile!.bio && !!socialP!.profile!.avatarUrl;
  const bioText = socialP?.profile?.bio ?? "";
  const avatarUrl = socialP?.profile?.avatarUrl ?? "";
  const followingN = socialConns?.following?.length ?? 0;
  const followersN = socialConns?.followers?.length ?? 0;

  const streakLabel = dayStreak.current > 0 ? `${dayStreak.current}d` : weekStreak > 0 ? `${weekStreak}w` : "—";

  // This-week snapshot — sessions logged + tonnage moved in the last 7 days.
  // A current-focus band above the tiles; distinct from the lifetime tiles and
  // the 26-week Activity heatmap, so it adds signal without duplicating them.
  const thisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let count = 0, vol = 0;
    for (const s of sessions) {
      const ts = Date.parse(s.startedAt);
      if (!Number.isNaN(ts) && ts >= cutoff) { count++; vol += sessionVolume(s.blocks, false, bw(s.startedAt)); }
    }
    return { count, vol };
  }, [sessions]);

  // PUBLIC highlight tiles — everything a follower is allowed to see. HPI is
  // intentionally NOT here. Built from real logged data; empty data → the tile
  // is omitted rather than faked. Each tile carries a stable `hkey` so the owner
  // can hide/show it (long-press on Overview). Per-lift detail lives in the PRs
  // tab, so only the single best lift is surfaced here (no duplication).
  const publicTiles = useMemo(() => {
    // Each tile type → an apt EXISTING AuroraIconName (identical mapping on
    // mobile): PR/lift = arrow-up, streak = check-circle, sessions =
    // calendar-event, tonnage = list-check, badges = verified.
    const out: { v: string; k: string; icon: AuroraIconName; hkey: string }[] = [];
    const topPr = prs[0];
    if (topPr) out.push({ v: fmtWeight(topPr[1], units), k: `${topPr[0]} PR`, icon: "arrow-up", hkey: `pr:${topPr[0]}` });
    if (weekStreak > 0 || dayStreak.current > 0) out.push({ v: streakLabel, k: t("w.account.profile.spec-streak"), icon: "check-circle", hkey: "streak" });
    if (hasData) out.push({ v: String(sessions.length), k: t("w.account.profile.id-sessions"), icon: "calendar-event", hkey: "sessions" });
    if (hasData && lifetimeTonnage > 0) out.push({ v: fmtTonnage(lifetimeTonnage, units), k: t("w.account.profile.spec-tonnage"), icon: "list-check", hkey: "tonnage" });
    if (earnedCount > 0) out.push({ v: String(earnedCount), k: t("w.account.profile.achievements"), icon: "verified", hkey: "badges" });
    return out.slice(0, 6);
  }, [prs, units, weekStreak, dayStreak.current, streakLabel, hasData, sessions.length, lifetimeTonnage, earnedCount, t]);

  const socialCounts = useMemo(() => {
    const out = [
      { n: String(followersN), k: t("w.account.profile.followers") },
      { n: String(followingN), k: t("w.account.profile.following") },
    ];
    if (rank != null) out.push({ n: `#${rank}`, k: t("w.account.profile.rank") });
    return out;
  }, [followersN, followingN, rank, t]);

  const sectionHead = (title: string, action?: string) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "26px 2px 12px" }}>
      {/* Display face per the SectionHead standard — Mincho under Kyoto Hour. */}
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.subtitle, letterSpacing: "-.01em" }}>{title}</div>
      {action && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{action}</div>}
    </div>
  );

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", fontFamily: "var(--font-display)" }}>
      {/* SET UP YOUR PROFILE — owner-only nudge; hides once photo + bio exist. */}
      {socialP && !sComplete && (
        <button
          onClick={go("settings", "/settings")}
          style={{ width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 18, border: `1px solid ${C("lime")}`, background: "linear-gradient(135deg, color-mix(in srgb, var(--color-lime) 12%, transparent), transparent)", borderRadius: 28, padding: 16, display: "flex", alignItems: "center", gap: 14, color: C("chalk") }}
        >
          <span style={{ width: 44, height: 44, borderRadius: 12, background: C("lime"), display: "grid", placeItems: "center", flexShrink: 0 }}>
            <AuroraIcon name="user-circle" size={22} color={C("ink")} />
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 16 }}>{sClaimed ? t("w.account.profile.setup-complete-title") : t("w.account.profile.setup-title")}</span>
            <span style={{ display: "block", color: C("ash"), fontSize: 13, marginTop: 2, lineHeight: 1.4 }}>{sClaimed ? t("w.account.profile.setup-complete-body") : t("w.account.profile.setup-body")}</span>
          </span>
          <span style={{ color: C("lime"), fontWeight: 800, fontSize: 18 }}>→</span>
        </button>
      )}

      {/* COVER BANNER — Aurora gradient wash with a lime corner glow. The
          edit-profile control lives as a frosted chip in the banner's top-right
          (the classic "edit cover" spot) — out of the content flow, away from
          the avatar and name. Uses the shared "edit" glyph (a dedicated pencil
          asset is a blocked follow-up). */}
      <div style={{ position: "relative", height: 96, borderRadius: 28, overflow: "hidden", background: "linear-gradient(120deg, color-mix(in srgb, var(--color-violet) 45%, transparent), color-mix(in srgb, var(--color-lime) 22%, transparent) 45%, var(--color-ink2))" }}>
        <span style={{ position: "absolute", top: -34, right: -24, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, color-mix(in srgb, var(--color-lime) 32%, transparent), transparent 70%)", pointerEvents: "none" }} />
        <button
          onClick={go("settings", "/settings")}
          aria-label={t("w.account.profile.edit")}
          style={{ position: "absolute", top: 12, right: 12, width: 38, height: 38, borderRadius: 12, background: "color-mix(in srgb, var(--color-ink) 55%, transparent)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", border: "1px solid rgba(255, 255, 255, 0.16)", color: C("chalk"), display: "grid", placeItems: "center", cursor: "pointer" }}
        >
          <AuroraIcon name="edit" size={17} color={C("chalk")} />
        </button>
      </div>

      {/* HEAD — avatar overlapping the cover. The edit-profile control moved
          into the banner (above); no Edit / Share buttons in this row. */}
      <div style={{ display: "flex", alignItems: "flex-end", marginTop: -40, padding: "0 4px" }}>
        <div style={{ width: 84, height: 84, borderRadius: "50%", border: `3px solid ${C("ink")}`, boxShadow: "0 0 0 2px var(--color-lime)", background: C("ink2"), display: "grid", placeItems: "center", overflow: "hidden", fontWeight: 900, fontSize: 32, color: "var(--lime-text)" }}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            initials
          )}
        </div>
      </div>

      {/* NAME + membership pill (pill UNCHANGED from the original design). */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "0 4px" }}>
        <span style={{ fontWeight: 900, fontSize: 23, letterSpacing: "-.02em" }}>{name}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, border: `1px solid ${C("lime")}`, color: "var(--lime-text)", borderRadius: 999, padding: "3px 8px", letterSpacing: ".08em" }}>{tier}</span>
      </div>

      {/* BIO + quiet HYBRID ID line. */}
      <div style={{ marginTop: 8, padding: "0 4px" }}>
        {!!bioText && <div style={{ fontSize: 14, color: C("chalk"), opacity: 0.9, lineHeight: 1.5 }}>{bioText}</div>}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: bioText ? 6 : 0, letterSpacing: ".08em", lineHeight: 1.6 }}>
          <div><span style={{ opacity: 0.75 }}>HYBRID ID</span>&nbsp;&nbsp;{athleteId}</div>
          <div style={{ opacity: 0.75 }}>{t("w.account.profile.member-since")} {memberSince}</div>
        </div>
      </div>

      {/* SOCIAL COUNTS — followers / following / (derived) friends rank. */}
      <div style={{ display: "flex", gap: 22, marginTop: 14, padding: "0 4px" }}>
        {socialCounts.map((c) => (
          <div key={c.k} style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ fontWeight: 900, fontSize: 17 }}>{c.n}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".12em", color: C("ash"), textTransform: "uppercase" }}>{c.k}</span>
          </div>
        ))}
      </div>

      {/* TABS — Overview / PRs / Activity */}
      <div style={{ display: "flex", marginTop: 16, borderBottom: `1px solid ${C("line")}` }}>
        {([
          { id: "overview" as const, label: t("w.account.profile.tab-overview") },
          { id: "prs" as const, label: t("w.account.profile.tab-prs") },
          { id: "activity" as const, label: t("w.account.profile.tab-activity") },
          // 4th, owner-only tab — this screen is always your own profile.
          // (The lock renders as a drawn AuroraIcon beside the label, not an
          // emoji inside the string — see the tab renderer below.)
          { id: "private" as const, label: t("w.account.profile.tab-private") },
        ]).map((tb) => {
          const on = tab === tb.id;
          return (
            <button
              key={tb.id}
              role="tab"
              aria-selected={on}
              onClick={() => setTab(tb.id)}
              style={{ flex: 1, textAlign: "center", padding: "12px 0", position: "relative", background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: fs.caption, whiteSpace: "nowrap", color: on ? C("chalk") : C("ash") }}
            >
              {tb.id === "private" ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, verticalAlign: "middle" }}>
                  <AuroraIcon name="lock" size={13} />
                  {tb.label}
                </span>
              ) : tb.label}
              {on && <span style={{ position: "absolute", left: "18%", right: "18%", bottom: -1, height: 2, borderRadius: 2, background: C("lime") }} />}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}
      {tab === "overview" && (
        <div style={{ marginTop: 16 }}>
          {/* THIS WEEK — a current-focus snapshot above the lifetime tiles. */}
          {thisWeek.count > 0 && (
            <div style={{ border: `1px solid ${C("line")}`, borderRadius: 16, background: C("ink2"), padding: "12px 14px", marginBottom: space.sm }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.account.profile.ov-tw")}</div>
              <div style={{ display: "flex", gap: 26, marginTop: 8 }}>
                {[{ v: String(thisWeek.count), k: t("w.account.profile.id-sessions") }, { v: fmtTonnage(thisWeek.vol, units), k: t("w.account.profile.spec-tonnage") }].map((s) => (
                  <div key={s.k} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontWeight: 900, fontSize: 19, letterSpacing: "-.02em" }}>{s.v}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".08em", color: C("ash"), textTransform: "uppercase" }}>{s.k}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {publicTiles.length > 0 ? (
            <HighlightGrid
              tiles={publicTiles}
              hidden={hidden}
              order={order}
              onToggleHidden={toggleHidden}
              onPersistOrder={persistOrder}
              t={t}
            />
          ) : (
            <div style={{ ...card, padding: 16, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
              {t("w.account.profile.pr-empty")}
            </div>
          )}
        </div>
      )}

      {tab === "prs" && (
        <div style={{ marginTop: 16 }}>
          {prs.length ? (
            prs.map(([lift, wt]) => (
              <div key={lift} style={{ ...card, padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <AuroraIcon name="trophy" size={fs.subtitle + 2} color={C("chalk")} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: fs.bodyLg }}>{lift}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C("ash"), marginTop: 2 }}>{t("w.account.profile.pr-metric")}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.note, color: "var(--lime-text)" }}>{fmtWeight(wt, units)}</div>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: C("line"), marginTop: 12, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(8, Math.round((wt / prs[0]![1]) * 100))}%`, height: "100%", borderRadius: 2, background: C("lime") }} />
                </div>
              </div>
            ))
          ) : (
            <div style={{ ...card, padding: 16, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
              {t("w.account.profile.pr-empty")}
            </div>
          )}
        </div>
      )}

      {tab === "activity" && (
        <div style={{ marginTop: 16 }}>
          {/* 26-week training heatmap */}
          <div style={{ border: `1px solid ${C("line")}`, borderRadius: 28, background: "linear-gradient(180deg, var(--color-ink2), var(--color-ink))", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: C("ash"), letterSpacing: ".08em", marginBottom: 8, padding: "0 2px" }}>
              {monthLabels.map((m, i) => <span key={i}>{m}</span>)}
            </div>
            <div style={{ display: "grid", gridTemplateRows: "repeat(7,1fr)", gridAutoFlow: "column", gridAutoColumns: "1fr", gap: 3, height: 132 }}>
              {heat.map((col, ci) =>
                col.map((cell, ri) => (
                  <div
                    key={`${ci}-${ri}`}
                    title={`${cell.date} – ${cell.count} session${cell.count === 1 ? "" : "s"}`}
                    style={{ borderRadius: 2.5, background: heatBg(cell.level) }}
                  />
                )),
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 8, color: C("ash") }}>
              <span style={{ color: "var(--lime-text)" }}>{weekStreak > 0 ? `${weekStreak}${t("w.account.profile.week-streak-suffix")}` : dayStreak.current > 0 ? `${dayStreak.current}${t("w.account.profile.day-streak-suffix")}` : t("w.account.profile.no-streak")}</span>
              <span style={{ flex: 1 }} />
              {t("w.account.profile.less")}
              {[0, 1, 2, 3, 4].map((l) => (
                <span key={l} style={{ width: 10, height: 10, borderRadius: 2.5, display: "inline-block", background: heatBg(l as HeatCell["level"]) }} />
              ))}
              {t("w.account.profile.more")}
            </div>
          </div>

          {/* Achievements — earned/locked badges with progress. */}
          {sectionHead(t("w.account.profile.achievements"), `${earnedCount} ${t("w.account.profile.earned")}`)}
          {/* Full-bleed rail: negative margins the width of the shell gutter
              (--page-pad-x) pull the scroll clip to the true screen edge, with
              matching internal padding so resting tiles stay on the column. */}
          <div style={{ display: "flex", gap: space.ms, overflowX: "auto", scrollbarWidth: "none", padding: "4px var(--page-pad-x, 16px)", margin: "-4px calc(-1 * var(--page-pad-x, 16px)) 0" }}>
            {achievements.map((a) => {
              const pct = Math.round(a.progress * 100);
              return (
                <div key={a.id} style={{ flex: "none", width: 80, textAlign: "center" }}>
                  <div
                    title={a.detail}
                    style={{
                      width: 76, height: 76, borderRadius: 16, display: "grid", placeItems: "center", fontSize: 27, margin: "0 auto",
                      border: `1px solid ${a.earned ? "color-mix(in srgb, var(--color-lime) 45%, transparent)" : C("line")}`,
                      background: a.earned ? "linear-gradient(160deg, color-mix(in srgb, var(--color-lime) 12%, var(--color-ink2)), var(--color-ink))" : C("ink2"),
                      boxShadow: a.earned ? "0 0 22px -10px color-mix(in srgb, var(--color-lime) 60%, transparent)" : "none",
                    }}
                  >
                    <span style={{ opacity: a.earned ? 1 : 0.4, filter: a.earned ? "none" : "grayscale(0.5)" }}>{a.icon}</span>
                  </div>
                  <div style={{ width: 60, height: 4, borderRadius: 2, background: C("line"), margin: "8px auto 0", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(6, pct)}%`, height: "100%", borderRadius: 2, background: a.earned ? C("lime") : "color-mix(in srgb, var(--color-lime) 60%, transparent)" }} />
                  </div>
                  <div style={{ fontSize: fs.nano, color: C("ash"), marginTop: 8, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: a.earned ? "var(--lime-text)" : C("ash"), marginTop: 2 }}>{a.earned ? "✓" : `${pct}%`}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          PRIVATE tab — identity & self-tracking with no other home. HPI /
          readiness / injury-risk are NOT duplicated; the Command-center row LINKS
          to the Cockpit. Body & Journal are Full features (locked teaser for
          free). Curating the public grid lives on Overview (press & hold a card);
          privacy & visibility are managed in Settings. */}
      {tab === "private" && (
        <PrivateTab
          isFull={showHpi}
          units={units}
          nav={(screen) => go(screen, `/${screen}`)()}
        />
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGHLIGHT GRID — the public Overview tiles with Apple-style edit mode.
//
//   • Tap a tile        → nothing (it's a display tile; can't be hidden by accident).
//   • Press & hold      → edit mode: tiles wiggle, a "–" appears on each.
//   • Drag in edit mode → reorder; the arrangement persists (/api/highlights).
//   • Tap "–"           → hide the tile; it drops into the restore tray.
//   • Tap a tray chip   → restore it. Done / Esc / tap-away → leave edit mode.
//
// Reorder is pointer-driven with no DOM reshuffle mid-drag: at grab we snapshot
// each tile's slot rect, translate the neighbours toward the vacated slot, and
// commit the new order once on drop — so React never fights the in-flight drag.
// ─────────────────────────────────────────────────────────────────────────────
type HlTile = { v: string; k: string; icon: AuroraIconName; hkey: string };

function HighlightGrid({
  tiles, hidden, order, onToggleHidden, onPersistOrder, t,
}: {
  tiles: HlTile[];
  hidden: string[];
  order: string[];
  onToggleHidden: (key: string, next: boolean) => void;
  onPersistOrder: (keys: string[]) => void;
  t: (k: string) => string;
}) {
  const tileMap = useMemo(() => new Map(tiles.map((x) => [x.hkey, x])), [tiles]);
  const presentKeys = useMemo(() => tiles.map((x) => x.hkey), [tiles]);
  // Reconcile the persisted order against the tiles that currently have data:
  // known keys keep their saved order, any newly-earned key appends at the end.
  const reconcile = useCallback((ord: string[]) => {
    const known = new Set(presentKeys);
    const inOrder = ord.filter((k) => known.has(k));
    const seen = new Set(inOrder);
    return [...inOrder, ...presentKeys.filter((k) => !seen.has(k))];
  }, [presentKeys]);

  const [localOrder, setLocalOrder] = useState<string[]>(() => reconcile(order));
  const [editMode, setEditMode] = useState(false);
  // Which tile is being dragged — kept in state (not just a class) so React's
  // re-render of `className` can't strip the "dragging" marker mid-drag.
  const [dragKey, setDragKey] = useState<string | null>(null);

  const draggingRef = useRef(false);
  useEffect(() => {
    // Re-sync when the server order or the set of present tiles changes — but
    // never yank the arrangement out from under an in-progress drag.
    if (draggingRef.current) return;
    setLocalOrder(reconcile(order));
  }, [order, reconcile]);

  const localOrderRef = useRef(localOrder); localOrderRef.current = localOrder;
  const hiddenRef = useRef(hidden); hiddenRef.current = hidden;

  const visibleKeys = localOrder.filter((k) => !hidden.includes(k));
  const hiddenKeys = localOrder.filter((k) => hidden.includes(k));

  const nodes = useRef(new Map<string, HTMLDivElement>());
  const setNode = (k: string) => (el: HTMLDivElement | null) => { if (el) nodes.current.set(k, el); else nodes.current.delete(k); };

  type Slot = { key: string; left: number; top: number; w: number; h: number };
  const drag = useRef<null | { key: string; slots: Slot[]; dragIndex: number; targetIndex: number; grabX: number; grabY: number }>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef({ x: 0, y: 0 });
  const clearTimer = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };

  const beginDrag = useCallback((key: string, clientX: number, clientY: number) => {
    const visible = localOrderRef.current.filter((k) => !hiddenRef.current.includes(k));
    const slots: Slot[] = visible.map((k) => {
      const r = nodes.current.get(k)!.getBoundingClientRect();
      return { key: k, left: r.left, top: r.top, w: r.width, h: r.height };
    });
    const dragIndex = visible.indexOf(key);
    if (dragIndex < 0) return;
    const home = slots[dragIndex]!;
    drag.current = { key, slots, dragIndex, targetIndex: dragIndex, grabX: clientX - home.left, grabY: clientY - home.top };
    draggingRef.current = true;
    setDragKey(key);
    const node = nodes.current.get(key);
    if (node) { node.style.transition = "none"; node.style.zIndex = "50"; }
  }, []);

  const layoutShifts = () => {
    const d = drag.current; if (!d) return;
    d.slots.forEach((s, i) => {
      if (i === d.dragIndex) return;
      let to = i;
      if (d.dragIndex < d.targetIndex && i > d.dragIndex && i <= d.targetIndex) to = i - 1;
      else if (d.targetIndex < d.dragIndex && i >= d.targetIndex && i < d.dragIndex) to = i + 1;
      const node = nodes.current.get(s.key); if (!node) return;
      node.style.transition = "transform .2s cubic-bezier(.2,.8,.2,1)";
      node.style.transform = to === i ? "" : `translate(${d.slots[to]!.left - s.left}px, ${d.slots[to]!.top - s.top}px)`;
    });
  };

  const doDragMove = (clientX: number, clientY: number) => {
    const d = drag.current; if (!d) return;
    const home = d.slots[d.dragIndex]!;
    const node = nodes.current.get(d.key);
    if (node) node.style.transform = `translate(${clientX - home.left - d.grabX}px, ${clientY - home.top - d.grabY}px) scale(1.06)`;
    // Nearest slot centre → target index.
    let best = d.dragIndex, bestDist = Infinity;
    d.slots.forEach((s, i) => {
      const dist = (clientX - (s.left + s.w / 2)) ** 2 + (clientY - (s.top + s.h / 2)) ** 2;
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    if (best !== d.targetIndex) { d.targetIndex = best; layoutShifts(); }
  };

  const endDrag = () => {
    const d = drag.current; if (!d) return;
    drag.current = null;
    const visible = d.slots.map((s) => s.key);
    const newVisible = [...visible];
    newVisible.splice(d.dragIndex, 1);
    newVisible.splice(d.targetIndex, 0, d.key);
    const changed = newVisible.join(" ") !== visible.join(" ");
    const q = [...newVisible];
    const newFull = localOrderRef.current.map((k) => (hiddenRef.current.includes(k) ? k : q.shift()!));

    const commit = () => {
      d.slots.forEach((s) => { const n = nodes.current.get(s.key); if (n) { n.style.transition = ""; n.style.transform = ""; n.style.zIndex = ""; } });
      draggingRef.current = false;
      setDragKey(null);
      if (changed) { setLocalOrder(newFull); onPersistOrder(newFull); }
    };

    if (changed) {
      // Settle the dragged tile into its new slot, then commit the reorder.
      const from = d.slots[d.dragIndex]!, to = d.slots[d.targetIndex]!;
      const node = nodes.current.get(d.key);
      if (node) { node.style.transition = "transform .18s cubic-bezier(.2,.8,.2,1)"; node.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px)`; }
      window.setTimeout(commit, 170);
    } else {
      commit();
    }
  };

  const onDown = (key: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pressStart.current = { x: e.clientX, y: e.clientY };
    if (editMode) { beginDrag(key, e.clientX, e.clientY); }
    else {
      clearTimer();
      pressTimer.current = setTimeout(() => { setEditMode(true); beginDrag(key, pressStart.current.x, pressStart.current.y); }, 450);
    }
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current) { e.preventDefault(); doDragMove(e.clientX, e.clientY); return; }
    if (pressTimer.current) {
      const dx = e.clientX - pressStart.current.x, dy = e.clientY - pressStart.current.y;
      if (Math.hypot(dx, dy) > 10) clearTimer(); // a scroll, not a long-press
    }
  };
  const onUp = () => { clearTimer(); if (drag.current) endDrag(); };
  const onKey = (key: string) => (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (editMode) onToggleHidden(key, true); else setEditMode(true);
  };

  // Leave edit mode on Esc or a tap outside the grid / tray / Done bar.
  useEffect(() => {
    if (!editMode) return;
    const onDoc = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.closest(".hl-tile") || el.closest("[data-hl-keep]"))) return;
      setEditMode(false);
    };
    const onKeyDoc = (e: KeyboardEvent) => { if (e.key === "Escape") setEditMode(false); };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKeyDoc);
    return () => { document.removeEventListener("pointerdown", onDoc); document.removeEventListener("keydown", onKeyDoc); };
  }, [editMode]);

  const minus = (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#111" strokeWidth={3} strokeLinecap="round"><line x1="6" y1="12" x2="18" y2="12" /></svg>
  );

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: space.sm }}>
        {visibleKeys.map((key) => {
          const tile = tileMap.get(key)!;
          return (
            <div
              key={key}
              ref={setNode(key)}
              className={`hl-tile${editMode ? " edit" : ""}${dragKey === key ? " dragging" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={tile.k}
              onPointerDown={onDown(key)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onKeyDown={onKey(key)}
              style={{ position: "relative", aspectRatio: "1", touchAction: editMode ? "none" : "auto", cursor: editMode ? "grab" : "default", userSelect: "none" }}
            >
              {editMode && (
                <button
                  data-hl-del
                  aria-label={t("w.account.profile.priv-hide")}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onToggleHidden(key, true); }}
                  style={{ position: "absolute", top: -7, left: -7, width: 24, height: 24, borderRadius: "50%", background: "#e8e8e8", border: "2px solid var(--color-ink)", display: "grid", placeItems: "center", cursor: "pointer", zIndex: 6, padding: 0, boxShadow: "0 2px 6px rgba(0,0,0,.5)" }}
                >
                  {minus}
                </button>
              )}
              <div className="hl-wig" style={{ width: "100%", height: "100%", border: `1px solid ${C("line")}`, borderRadius: 16, background: C("ink2"), display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 8, textAlign: "center", boxShadow: editMode ? "0 6px 18px -12px rgba(0,0,0,.6)" : "none" }}>
                <AuroraIcon name={tile.icon} size={22} color={C("lime")} />
                <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", marginTop: 6 }}>{tile.v}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: ".08em", color: C("ash"), textTransform: "uppercase", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{tile.k}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* HIDDEN — restore tray. Shown whenever anything is hidden. */}
      {hiddenKeys.length > 0 && (
        <div data-hl-keep style={{ marginTop: 16, borderTop: `1px dashed ${C("line")}`, paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".12em", color: C("ash"), textTransform: "uppercase", marginBottom: 10 }}>
            <AuroraIcon name="eye" size={12} color={C("ash")} />{t("w.account.profile.ov-restore")}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {hiddenKeys.map((key) => {
              const tile = tileMap.get(key)!;
              return (
                <button
                  key={key}
                  onClick={() => onToggleHidden(key, false)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px 8px 8px", border: `1px solid ${C("line")}`, borderRadius: 12, background: C("ink2"), color: C("ash"), cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" }}
                >
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: C("lime"), color: C("ink"), display: "grid", placeItems: "center", fontWeight: 900, fontSize: 15, lineHeight: 1 }}>+</span>
                  {tile.k}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C("ash"), marginTop: 10, letterSpacing: ".08em" }}>{editMode ? t("w.account.profile.ov-edit-hint") : t("w.account.profile.ov-hint")}</div>

      {/* DONE — fixed bar while editing. */}
      {editMode && (
        <div data-hl-keep style={{ position: "fixed", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", padding: 16, zIndex: 60, pointerEvents: "none" }}>
          <button
            onClick={() => setEditMode(false)}
            style={{ pointerEvents: "auto", background: C("chalk"), color: C("ink"), border: "none", fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", padding: "14px 40px", borderRadius: 16, cursor: "pointer", boxShadow: "0 10px 30px rgba(0,0,0,.5)" }}
          >
            {t("w.account.profile.ov-done")}
          </button>
        </div>
      )}
    </>
  );
}

// ----- helpers -----

function heatBg(level: HeatCell["level"]): string {
  switch (level) {
    case 1: return "color-mix(in srgb, var(--color-lime) 28%, transparent)";
    case 2: return "color-mix(in srgb, var(--color-lime) 50%, transparent)";
    case 3: return "color-mix(in srgb, var(--color-lime) 74%, transparent)";
    case 4: return "var(--color-lime)";
    default: return "var(--color-line)";
  }
}

