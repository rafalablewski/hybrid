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
  type Achievement,
  type HeatCell,
  type LoggedSession,
  type Biometrics,
  type Macrocycle,
} from "@hybrid/core";
import { useSession } from "@/lib/session";
import { useHasActiveCoach } from "@/lib/persona";
import { useLoggerPrefs } from "@/lib/logger-prefs";
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
  const { session, entitlement } = useSession();
  const prefs = useLoggerPrefs();
  const coached = useHasActiveCoach();
  const units = prefs.units;

  // Body: the latest logged bodyweight (most recent check-in with a weigh-in),
  // mirroring the mobile profile — the shell's `bio` is recovery-only.
  const [bodyKg, setBodyKg] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/checkins")
      .then((r) => (r.ok ? r.json() : { checkins: [] }))
      .then((d: { checkins?: { weekOf: string; bodyMassKg: number | null }[] }) => {
        if (!alive) return;
        const latest = (d.checkins ?? [])
          .filter((c) => typeof c.bodyMassKg === "number")
          .sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1))[0];
        setBodyKg(latest?.bodyMassKg ?? null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const name = session?.name ?? "Athlete";
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

  // Athlete ID — a stable, anonymous hash of the email (no PII leaked).
  const athleteId = useMemo(() => {
    let h = 0;
    for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
    const hex = h.toString(16).toUpperCase().padStart(8, "0").slice(0, 4);
    const chk = (h % 90) + 10;
    return `0x${hex}·${chk}`;
  }, [email]);

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
  const sectionHead = (title: string, action?: string) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "26px 2px 13px" }}>
      <div style={{ fontWeight: 800, fontSize: fs.subtitle, letterSpacing: "-.01em" }}>{title}</div>
      {action && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{action}</div>}
    </div>
  );

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", fontFamily: "var(--font-display)" }}>
      {/* ACCOUNT HERO — Apple-ID / Tesla account chrome */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ position: "relative", width: 98, height: 98 }}>
          <div
            style={{
              width: 98, height: 98, borderRadius: "50%",
              background: "linear-gradient(150deg,#3a3d36,rgba(22,24,20,0))",
              border: "1px solid #4a4d44", display: "grid", placeItems: "center",
              fontWeight: 900, fontSize: 34, color: C("lime-t"),
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
            }}
          >
            {initials}
          </div>
          <button
            onClick={go("settings", "/settings")}
            aria-label="Edit profile"
            style={{
              position: "absolute", right: -1, bottom: -1, width: 30, height: 30, borderRadius: "50%",
              background: C("lime"), color: C("ink"), display: "grid", placeItems: "center",
              fontSize: fs.body, border: `3px solid ${C("ink")}`, cursor: "pointer",
            }}
          >
            ✎
          </button>
        </div>
        <div style={{ fontWeight: 900, fontSize: 25, letterSpacing: "-.025em", marginTop: 15, display: "flex", alignItems: "center", gap: 9 }}>
          {name}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, border: `1px solid ${C("lime")}`, color: C("lime-t"), borderRadius: 999, padding: "3px 9px", letterSpacing: ".08em" }}>{tier}</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 8, letterSpacing: ".02em" }}>
          HYBRID ID · {email || "—"}
        </div>
        <div style={{ fontSize: 12.5, color: C("chalk"), marginTop: 8, opacity: 0.85, textTransform: "capitalize" }}>
          {role === "coach" ? "Coach" : "Hybrid Athlete"} · member since {memberSince}
        </div>
      </div>

      {/* SPEC STRIP — hairline-divided metrics */}
      <div style={{ display: "flex", border: `1px solid ${C("line")}`, borderRadius: 18, background: C("ink2"), marginTop: 20 }}>
        {[
          { n: hasData ? String(state.hpi.score) : "—", k: "HPI" },
          { n: weekStreak > 0 ? `${weekStreak}w` : "—", k: "Streak" },
          { n: prCount > 0 ? String(prCount) : "—", k: "PRs" },
        ].map((c, i) => (
          <div key={c.k} style={{ flex: 1, textAlign: "center", padding: "15px 0", borderRight: i < 2 ? `1px solid ${C("line")}` : "none" }}>
            <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-.02em" }}>{c.n}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: ".12em", color: C("ash"), textTransform: "uppercase", marginTop: 5 }}>{c.k}</div>
          </div>
        ))}
      </div>

      {/* ACTIONS */}
      <div style={{ display: "flex", gap: space.ms, marginTop: 14 }}>
        <button onClick={go("settings", "/settings")} style={{ flex: 1, textAlign: "center", borderRadius: 14, padding: 13, fontWeight: 700, fontSize: fs.body, background: C("lime"), border: `1px solid ${C("lime")}`, color: C("ink"), cursor: "pointer" }}>Edit profile</button>
        <ShareCard name={name} hpi={hasData ? state.hpi.score : null} band={state.hpi.band} streak={weekStreak} prs={prCount} memberSince={memberSince} tier={tier} />
      </div>

      <div style={{ height: 1, background: C("line"), margin: "22px 0" }} />

      {/* ID CARD — premium membership card */}
      <div style={{ position: "relative", borderRadius: 22, padding: 18, overflow: "hidden", border: "1px solid #34381f", background: "linear-gradient(160deg,#1a1c14,#0e100d 60%)" }}>
        {/* faint diagonal etch */}
        <span style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(115deg,rgba(196,240,53,.05) 0 1px,transparent 1px 14px)", opacity: 0.7, pointerEvents: "none" }} />
        {/* soft lime corner sheen */}
        <span style={{ position: "absolute", top: -60, right: -50, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle,rgba(196,240,53,.22),transparent 70%)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <div style={{ fontWeight: 900, fontSize: fs.body, letterSpacing: ".04em" }}>HYBRID<span style={{ color: C("lime") }}>.</span> · MEMBERSHIP</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, border: `1px solid ${C("lime")}`, color: C("lime-t"), borderRadius: 999, padding: "4px 9px", letterSpacing: ".1em" }}>{tier} · {role === "coach" ? "COACH" : "MEMBER"}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 30, position: "relative" }}>
          <IdMeta label="Member since" value={String(memberSince)} />
          <IdMeta label="Athlete ID" value={athleteId} />
          <IdMeta label="Index" value={hasData ? String(state.hpi.score) : "—"} lime />
        </div>
      </div>

      {/* HPI HERO */}
      <div style={{ marginTop: 14, border: `1px solid ${C("line")}`, borderRadius: 22, padding: 18, background: "linear-gradient(180deg,#121410,#0d0f0c)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".18em", color: C("ash"), textTransform: "uppercase" }}>Hybrid Performance Index</div>
        <BigNumber value={hasData ? state.hpi.score : null} />
        <span style={{ display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 9, color: C("lime-t"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "4px 10px", marginTop: 8, textTransform: "uppercase" }}>
          Band · {hasData ? state.hpi.band : "unrated"}
        </span>
        {/* 12-bar trace */}
        <Trace series={hpiTrace} />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 9 }}>
          {hasData ? (
            <>
              <span style={{ color: C("lime-t") }}>{hpiDelta >= 0 ? "▲ +" : "▼ "}{hpiDelta}</span> vs last 30 days · strength {state.hpi.components.strength} · engine {state.hpi.components.endurance} · recovery {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}
            </>
          ) : (
            "Log a session — your index, trace and band build from real training."
          )}
        </div>
      </div>

      {/* TRAINING — year heatmap */}
      {sectionHead("Training", `${sessions.length} session${sessions.length === 1 ? "" : "s"} →`)}
      <div style={{ border: `1px solid ${C("line")}`, borderRadius: 22, background: "linear-gradient(180deg,#121410,#0d0f0c)", padding: 16 }}>
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
          <span style={{ color: C("lime-t") }}>{weekStreak > 0 ? `${weekStreak}-week streak` : dayStreak.current > 0 ? `${dayStreak.current}-day streak` : "no streak yet"}</span>
          <span style={{ flex: 1 }} />
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} style={{ width: 10, height: 10, borderRadius: 2.5, display: "inline-block", background: heatBg(l as HeatCell["level"]) }} />
          ))}
          More
        </div>
      </div>

      {/* ACHIEVEMENTS — squared badges */}
      {sectionHead("Achievements", `${achievements.filter((a) => a.earned).length} earned →`)}
      <div style={{ display: "flex", gap: space.ms, overflowX: "auto", scrollbarWidth: "none" }}>
        {achievements.map((a) => (
          <div key={a.id} style={{ flex: "none", width: 76, textAlign: "center" }}>
            <div
              title={a.detail}
              style={{
                width: 76, height: 76, borderRadius: 20, display: "grid", placeItems: "center", fontSize: 27,
                border: `1px solid ${a.earned ? "rgba(196,240,53,.45)" : C("line")}`,
                background: a.earned ? "linear-gradient(160deg,#181a12,#0e100c)" : C("ink2"),
                boxShadow: a.earned ? "0 0 22px -10px rgba(196,240,53,.6)" : "none",
                color: a.earned ? undefined : C("ash"),
                opacity: a.earned ? 1 : 0.7,
                filter: a.earned ? "none" : "grayscale(0.6)",
              }}
            >
              {a.earned ? a.icon : "🔒"}
            </div>
            <div style={{ fontSize: fs.nano, color: C("ash"), marginTop: 8, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</div>
          </div>
        ))}
      </div>

      {/* PERSONAL RECORDS */}
      {sectionHead("Personal records", prs.length ? "See all →" : undefined)}
      {prs.length ? (
        prs.map(([lift, e1rm]) => (
          <div key={lift} style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px", marginBottom: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ fontSize: fs.subtitle }}>🏆</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: fs.bodyLg }}>{lift}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C("ash"), marginTop: 2 }}>e1RM</div>
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.note, color: C("lime-t") }}>{fmtWeight(e1rm, units)}</div>
          </div>
        ))
      ) : (
        <div style={{ ...card, padding: 16, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
          Log strength sets and your best lifts land here.
        </div>
      )}

      {/* MODULE TILES — your athlete */}
      {sectionHead("Your athlete", "Customize")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: space.ms }}>
        <Tile icon="∿" k="Readiness" big={hasData ? `${state.readiness.score}` : undefined} suffix={hasData ? "%" : undefined} sm={hasData ? undefined : "no data yet"} />
        <Tile icon="⚖" k="Body" sm={bodyKg != null ? fmtWeight(bodyKg, units) : "Log a weigh-in"} onClick={go("checkin", "/checkin")} />
        <Tile icon="⌚" k="Devices" sm={bio ? "Recovery · synced" : "Connect a device"} onClick={go("connections", "/connections")} />
        <Tile icon="👥" k="Coach" sm={coached ? "Coach · active" : "Find a coach"} onClick={go("coach", "/coach")} />
      </div>
    </div>
  );
}

// ----- helpers -----

function heatBg(level: HeatCell["level"]): string {
  switch (level) {
    case 1: return "rgba(196,240,53,.28)";
    case 2: return "rgba(196,240,53,.5)";
    case 3: return "rgba(196,240,53,.74)";
    case 4: return "var(--color-lime)";
    default: return "#1b1e18";
  }
}

function IdMeta({ label, value, lime }: { label: string; value: string; lime?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: ".12em", color: C("ash"), textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: lime ? C("lime-t") : C("chalk"), marginTop: 4 }}>{value}</div>
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
        return <div key={i} style={{ flex: 1, borderRadius: 2, height: `${pct}%`, background: isLast && series.length >= 2 ? C("lime") : "#2c2f27" }} />;
      })}
    </div>
  );
}

function Tile({ icon, k, big, suffix, sm, onClick }: { icon: string; k: string; big?: string; suffix?: string; sm?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        border: `1px solid ${C("line")}`, borderRadius: 20, padding: 15, background: C("ink2"), minHeight: 96,
        display: "flex", flexDirection: "column", justifyContent: "space-between", textAlign: "left",
        cursor: onClick ? "pointer" : "default", color: C("chalk"), fontFamily: "var(--font-display)",
      }}
    >
      <span style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(243,244,239,.06)", border: `1px solid ${C("line")}`, display: "grid", placeItems: "center", fontSize: fs.note }}>{icon}</span>
      <span style={{ display: "block" }}>
        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash") }}>{k}</span>
        {big ? (
          <span style={{ fontWeight: 900, fontSize: 23, letterSpacing: "-.02em" }}>{big}{suffix && <span style={{ fontSize: fs.caption, color: C("ash") }}>{suffix}</span>}</span>
        ) : (
          <span style={{ fontWeight: 700, fontSize: 13.5, marginTop: 2, display: "block" }}>{sm}</span>
        )}
      </span>
    </button>
  );
}

/** Share card — copies a one-line membership summary to the clipboard. */
function ShareCard({ name, hpi, band, streak: wk, prs, memberSince, tier }: { name: string; hpi: number | null; band: string; streak: number; prs: number; memberSince: number; tier: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1800);
    return () => clearTimeout(t);
  }, [done]);
  const share = async () => {
    const text = `HYBRID · ${name} (${tier})\nHPI ${hpi ?? "—"} · band ${band}\n${wk}-week streak · ${prs} PRs · member since ${memberSince}\napp.hybrid.app`;
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
      {done ? "Copied ✓" : "Share card"}
    </button>
  );
}
