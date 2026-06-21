"use client";

import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { fs, space,
  colors, totalVolume, sessionVolume, bestE1rmByLift, e1rmSeries, liftNames,
  kgToUnit, fmtTonnage, fmtWeight, type LoggedSession,
} from "@hybrid/core";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useLang } from "@/lib/i18n";
import type { RosterRow } from "@/lib/use-roster";

/**
 * AURORA Analytics — bespoke rounded dashboards for all three scopes (Client /
 * Coach / Operator), reusing the exact data + engines as the classic screens.
 * Big 28-radius cards with soft depth, the Aurora stat tile, pill-framed charts,
 * and the brand accents — a real dashboard, not the token-skinned classic grid.
 */
const C = (v: string) => `var(--color-${v})`;
const card: CSSProperties = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 22 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: space.lg };
const chartTip = { background: colors.ink2, border: `1px solid ${colors.line}`, borderRadius: 14, fontFamily: "var(--font-mono)", fontSize: fs.caption } as const;
const mono = { fontFamily: "var(--font-mono)" } as const;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** A big rounded stat tile — accent kicker, oversized number, optional sub. */
function AStat({ label, value, sub, accent = "chalk" }: { label: string; value: ReactNode; sub?: string; accent?: string }) {
  return (
    <div style={{ ...card, padding: 20, display: "flex", flexDirection: "column", gap: space.xs }}>
      <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: C(accent) }} />
        <span style={{ ...mono, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{label}</span>
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 34, lineHeight: 1, color: C(accent === "chalk" ? "chalk" : accent) }}>{value}</div>
      {sub && <div style={{ ...mono, fontSize: fs.micro, color: C("ash") }}>{sub}</div>}
    </div>
  );
}

/** A section/chart card spanning `span` of the 4 columns. */
function AFrame({ title, kicker, accent = "lime", span = 2, children }: { title: string; kicker?: string; accent?: string; span?: number; children: ReactNode }) {
  return (
    <div style={{ ...card, gridColumn: `span ${span}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: space.ms, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.subtitle, color: C("chalk") }}>{title}</span>
        {kicker && <span style={{ ...mono, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".12em", color: C(accent) }}>{kicker}</span>}
      </div>
      {children}
    </div>
  );
}

function AEmpty({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div style={{ ...card, textAlign: "center", padding: 60 }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.heading, color: C("chalk") }}>{title}</div>
      <p style={{ ...mono, fontSize: fs.body, marginTop: 10, maxWidth: 460, marginInline: "auto", lineHeight: 1.6, color: C("ash") }}>{body}</p>
    </div>
  );
}

const axis = { stroke: colors.ash, style: { ...mono, fontSize: fs.micro } } as const;

/* ---------- CLIENT ---------- */
export function AuroraAthleteAnalytics({ sessions = [] }: { sessions?: LoggedSession[] }) {
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  if (sessions.length === 0)
    return <AEmpty title={t("w.home.analytics.noAnalytics")} body={t("w.home.analytics.noAnalyticsBody")} />;

  const vol = totalVolume(sessions);
  const prs = bestE1rmByLift(sessions).slice(0, 6);
  const topLift = liftNames(sessions)[0];
  const series = topLift ? e1rmSeries(sessions, topLift).map((p) => ({ w: fmtDate(p.date), e1rm: Math.round(kgToUnit(p.e1rm, units)) })) : [];
  const volSeries = [...sessions].slice(0, 8).reverse().map((s) => ({ w: fmtDate(s.startedAt), vol: Math.round(kgToUnit(sessionVolume(s.blocks), units)) }));
  const lastReadiness = sessions.find((s) => typeof s.readiness === "number")?.readiness ?? null;
  const best = prs[0];

  return (
    <div style={grid}>
      <AStat label={t("w.home.analytics.sessions")} value={sessions.length} accent="lime" />
      <AStat label={t("w.home.analytics.totalVolume")} value={fmtTonnage(vol, units)} />
      <AStat label={best ? `${best.lift} e1RM` : t("w.home.analytics.bestE1rm")} value={best ? fmtWeight(best.e1rm, units) : "—"} accent="lime" />
      <AStat label={t("w.home.analytics.lastReadiness")} value={lastReadiness ?? "—"} accent="blue" />

      {series.length > 0 && (
        <AFrame title={`${topLift} · e1RM`} kicker={t("w.home.analytics.fromLogs")} span={2}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series}>
              <CartesianGrid stroke={colors.line} strokeDasharray="3 3" />
              <XAxis dataKey="w" {...axis} /><YAxis {...axis} domain={["auto", "auto"]} />
              <Tooltip contentStyle={chartTip} />
              <Line type="monotone" dataKey="e1rm" stroke={colors.lime} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </AFrame>
      )}

      <AFrame title={t("w.home.analytics.volPerSession")} kicker={t("w.home.analytics.tonnage")} accent="blue" span={series.length > 0 ? 2 : 4}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={volSeries}>
            <CartesianGrid stroke={colors.line} strokeDasharray="3 3" />
            <XAxis dataKey="w" {...axis} /><YAxis {...axis} />
            <Tooltip contentStyle={chartTip} />
            <Bar dataKey="vol" fill={colors.blue} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </AFrame>

      {prs.length > 0 && (
        <AFrame title={t("w.home.analytics.personalRecords")} kicker={t("w.home.analytics.bestE1rmPerLift")} span={4}>
          <Table head={[t("w.home.analytics.col.lift"), t("w.home.analytics.col.bestE1rm"), t("w.home.analytics.col.when")]} rows={prs.map((p) => [p.lift, fmtWeight(p.e1rm, units), fmtDate(p.when)])} />
        </AFrame>
      )}
    </div>
  );
}

/* ---------- COACH ---------- */
export function AuroraCoachAnalytics({ roster = [] }: { roster?: RosterRow[] }) {
  const { t } = useLang();
  if (roster.length === 0)
    return <AEmpty title={t("w.home.analytics.noClients")} body={t("w.home.analytics.noClientsBody")} />;

  const avgAdh = Math.round(roster.reduce((s, c) => s + c.adherence, 0) / roster.length);
  const reads = roster.filter((c) => typeof c.readiness === "number");
  const avgRead = reads.length ? Math.round(reads.reduce((s, c) => s + (c.readiness ?? 0), 0) / reads.length) : null;
  const totalVol = roster.reduce((s, c) => s + c.volume, 0);
  const readColor = (r: number | null | undefined) => (r == null ? C("ash") : r > 70 ? C("lime") : r > 50 ? C("amber") : C("red"));

  return (
    <div style={grid}>
      <AStat label={t("w.home.analytics.clients")} value={roster.length} accent="violet" />
      <AStat label={t("w.home.analytics.avgAdherence")} value={`${avgAdh}%`} accent="lime" />
      <AStat label={t("w.home.analytics.avgReadiness")} value={avgRead ?? "—"} accent="blue" />
      <AStat label={t("w.home.analytics.rosterVolume")} value={`${(totalVol / 1000).toFixed(1)}k`} sub="kg" />

      <AFrame title={t("w.home.analytics.adherenceByClient")} kicker={t("w.home.analytics.last7days")} span={4}>
        <ResponsiveContainer width="100%" height={Math.max(120, roster.length * 44)}>
          <BarChart data={roster} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid stroke={colors.line} strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 100]} {...axis} />
            <YAxis type="category" dataKey="name" stroke={colors.ash} width={90} style={{ ...mono, fontSize: fs.nano }} />
            <Tooltip contentStyle={chartTip} />
            <Bar dataKey="adherence" fill={colors.lime} radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </AFrame>

      <AFrame title={t("w.home.analytics.clientRoster")} kicker={t("w.home.analytics.consentedAthletes")} accent="violet" span={4}>
        <Table
          head={[t("w.home.analytics.col.athlete"), t("w.home.analytics.col.readiness"), t("w.home.analytics.col.adherence"), t("w.home.analytics.col.sessions"), t("w.home.analytics.col.last")]}
          rows={roster.map((c) => [
            c.name,
            <span key="r" style={{ color: readColor(c.readiness) }}>{c.readiness ?? "—"}</span>,
            `${c.adherence}%`,
            String(c.sessions),
            c.lastSession ? fmtDate(c.lastSession) : "—",
          ])}
        />
      </AFrame>
    </div>
  );
}

/* ---------- OPERATOR ---------- */
type AdminStats = {
  totalUsers: number; sessions: number; coaches: number; mau: number; newUsers30: number;
  planPopularity: { goal: string; n: number }[]; langSplit: { lang: string; n: number }[];
};

export function AuroraOperatorAnalytics() {
  const { t } = useLang();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/stats", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: AdminStats) => setStats(d))
      .catch((e) => { if ((e as Error).name !== "AbortError") setErr(true); });
    return () => controller.abort();
  }, []);

  if (err) return <AEmpty title={t("w.home.analytics.adminOnly")} body={t("w.home.analytics.adminOnlyBody")} />;
  if (!stats) return <AEmpty title={t("w.home.analytics.loading")} body={t("w.home.analytics.loadingBody")} />;

  return (
    <div style={grid}>
      <AStat label={t("w.home.analytics.totalUsers")} value={stats.totalUsers.toLocaleString()} sub={`+${stats.newUsers30} / 30d`} accent="lime" />
      <AStat label={t("w.home.analytics.active30d")} value={stats.mau.toLocaleString()} sub={t("w.home.analytics.trainedIn30d")} accent="lime" />
      <AStat label={t("w.home.analytics.sessionsLogged")} value={stats.sessions.toLocaleString()} />
      <AStat label={t("w.home.analytics.coaches")} value={stats.coaches.toLocaleString()} accent="violet" />

      {stats.planPopularity.length > 0 && (
        <AFrame title={t("w.home.analytics.plansEnrolled")} kicker={t("w.home.analytics.byGoal")} span={2}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.planPopularity}>
              <CartesianGrid stroke={colors.line} strokeDasharray="3 3" />
              <XAxis dataKey="goal" {...axis} /><YAxis {...axis} allowDecimals={false} />
              <Tooltip contentStyle={chartTip} />
              <Bar dataKey="n" fill={colors.lime} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </AFrame>
      )}

      {stats.langSplit.length > 0 && (
        <AFrame title={t("w.home.analytics.languageSplit")} kicker={t("w.home.analytics.usersByLanguage")} accent="blue" span={2}>
          <div style={{ display: "flex", flexDirection: "column", gap: space.ms, marginTop: 4 }}>
            {(() => {
              const max = Math.max(...stats.langSplit.map((x) => x.n)) || 1;
              return stats.langSplit.map((l) => (
                <div key={l.lang}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ ...mono, fontSize: fs.body, color: C("chalk") }}>{l.lang}</span>
                    <span style={{ ...mono, fontSize: fs.caption, color: C("ash") }}>{l.n}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: C("ink"), overflow: "hidden" }}>
                    <div style={{ width: `${(l.n / max) * 100}%`, height: "100%", background: C("blue") }} />
                  </div>
                </div>
              ));
            })()}
          </div>
        </AFrame>
      )}

      {stats.totalUsers === 0 && (
        <div style={{ ...card, gridColumn: "span 4", textAlign: "center" }}>
          <span style={{ ...mono, fontSize: fs.body, color: C("ash") }}>{t("w.home.analytics.noUsers")}</span>
        </div>
      )}
    </div>
  );
}

/* Shared rounded table */
function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div style={{ overflowX: "auto", maxWidth: "100%" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
      <thead>
        <tr>{head.map((h) => <th key={h} style={{ ...mono, fontSize: 10.5, color: C("ash"), textTransform: "uppercase", letterSpacing: ".08em", textAlign: "left", padding: "8px 0", borderBottom: `1px solid ${C("line")}` }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td key={j} style={{ fontFamily: j === 0 ? "var(--font-display)" : "var(--font-mono)", fontWeight: j === 0 ? 600 : 400, fontSize: fs.bodyLg, color: C("chalk"), padding: "12px 0", borderBottom: `1px solid ${C("line")}` }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
