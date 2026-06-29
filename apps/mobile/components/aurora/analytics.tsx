import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import {
  totalVolume, sessionVolume, bestE1rmByLift, e1rmSeries, liftNames,
  kgToUnit, fmtTonnage, fmtWeight, type LoggedSession,
} from "@hybrid/core";
import { fetchSessions, fetchRoster, fetchAdminStats, type RosterRow, type AdminStats } from "../../lib/api";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useSession, type Role } from "../../lib/session";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, Spark } from "./kit";

/**
 * AURORA Analytics (mobile) — parity with apps/web/components/aurora/analytics.tsx.
 * The same three scopes (Client / Coach / Operator), reusing the exact engines
 * and the SAME backend (/api/coach/roster, /api/admin/stats). Recharts isn't
 * available on RN, so the web's line/bar charts become the dependency-free Spark
 * sparkline + View-built bars — same data, native rendering.
 */

type Scope = "athlete" | "coach" | "operator";
const SCOPES_FOR: Record<Role, Scope[]> = {
  client: ["athlete"],
  coach: ["coach"],
  admin: ["athlete", "coach", "operator"],
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function AuroraAnalytics() {
  const { role } = useSession();
  const allowed = SCOPES_FOR[role] ?? ["athlete"];
  // Land on the highest scope the role allows (admin → operator), like web.
  const [scope, setScope] = useState<Scope>(allowed[allowed.length - 1]!);

  return (
    <AuroraScreen>
      <ScopeHeader allowed={allowed} scope={scope} onScope={setScope} />
      {scope === "athlete" && <AthletePane />}
      {scope === "coach" && <CoachPane />}
      {scope === "operator" && <OperatorPane />}
    </AuroraScreen>
  );
}

function ScopeHeader({ allowed, scope, onScope }: { allowed: Scope[]; scope: Scope; onScope: (s: Scope) => void }) {
  const { palette: C } = useTheme();
  const META: Record<Scope, { label: string; color: string; note: string }> = {
    athlete: { label: "Client", color: C.lime, note: "Client scope · your own training data only. Nothing here is visible to other athletes." },
    coach: { label: "Coach", color: C.violet, note: "Coach scope · only athletes who accepted you (mutual consent). Aggregate roster view; private notes excluded." },
    operator: { label: "Admin", color: C.amber, note: "Operator scope · platform aggregates only — MAU, retention, content. No individual's private training data." },
  };
  const acc = META[scope].color;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.4, textTransform: "uppercase", color: acc }}>analytics</Text>
      <AHeading style={{ marginTop: 2 }}>Analytics</AHeading>
      {allowed.length > 1 && (
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12 }}>
          {(["athlete", "coach", "operator"] as const).filter((s) => allowed.includes(s)).map((s) => {
            const on = scope === s;
            const c = META[s].color;
            return (
              <Pressable
                key={s}
                onPress={() => onScope(s)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={{ borderWidth: 1, borderColor: on ? c : C.line, backgroundColor: on ? c : "transparent", borderRadius: 999, paddingVertical: 9, paddingHorizontal: 18 }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, textTransform: "uppercase", letterSpacing: 0.4, color: on ? C.onAccent : C.ash }}>{META[s].label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginTop: 14, padding: 12, borderRadius: 18, backgroundColor: `${acc}1f`, borderWidth: 1, borderColor: `${acc}55` }}>
        <Text style={{ color: acc, fontSize: fs.bodyLg }}>{scope === "operator" ? "⚙" : scope === "coach" ? "◆" : "●"}</Text>
        <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, lineHeight: 16, color: C.chalk }}>{META[scope].note}</Text>
      </View>
    </View>
  );
}

/* ---------- shared primitives ---------- */

function AStat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: string }) {
  const { palette: C } = useTheme();
  const col = accent ?? C.chalk;
  return (
    <ACard style={{ flex: 1, minWidth: 150, padding: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: col }} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{label}</Text>
      </View>
      <Text style={{ fontFamily: F.black, fontSize: 32, color: accent ? txt(C, col) : C.chalk, marginTop: 6 }}>{value}</Text>
      {sub ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{sub}</Text> : null}
    </ACard>
  );
}

function AFrame({ title, kicker, accent, children }: { title: string; kicker?: string; accent?: string; children: ReactNode }) {
  const { palette: C } = useTheme();
  return (
    <ACard style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: space.ms }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, flexShrink: 1 }}>{title}</Text>
        {kicker ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: accent ?? C.lime }}>{kicker}</Text> : null}
      </View>
      {children}
    </ACard>
  );
}

function AEmpty({ title, body }: { title: string; body: string }) {
  const { palette: C } = useTheme();
  return (
    <ACard style={{ alignItems: "center", paddingVertical: 44 }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk, textAlign: "center" }}>{title}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, textAlign: "center", marginTop: 10, lineHeight: 20 }}>{body}</Text>
    </ACard>
  );
}

/** A horizontal labelled bar list (the RN parity of the web recharts bars). */
function BarList({ rows, color, fmt }: { rows: { label: string; value: number }[]; color: string; fmt?: (n: number) => string }) {
  const { palette: C } = useTheme();
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r, i) => (
        <View key={`${r.label}-${i}`}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }} numberOfLines={1}>{r.label}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{fmt ? fmt(r.value) : r.value}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: C.ink, overflow: "hidden" }}>
            <View style={{ width: `${(r.value / max) * 100}%`, height: "100%", borderRadius: 4, backgroundColor: color }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A compact data table — header + rows of cells (first cell is the label). */
function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  const { palette: C } = useTheme();
  return (
    <View>
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 8 }}>
        {head.map((h, i) => (
          <Text key={h} style={{ flex: i === 0 ? 2 : 1, fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash, textAlign: i === 0 ? "left" : "right" }}>{h}</Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={{ flexDirection: "row", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line, alignItems: "center" }}>
          {r.map((cell, ci) => (
            <View key={ci} style={{ flex: ci === 0 ? 2 : 1, alignItems: ci === 0 ? "flex-start" : "flex-end" }}>
              {typeof cell === "string" || typeof cell === "number" ? (
                <Text style={{ fontFamily: ci === 0 ? F.semi : F.mono, fontSize: fs.body, color: C.chalk }} numberOfLines={1}>{cell}</Text>
              ) : cell}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/* ---------- CLIENT ---------- */
function AthletePane() {
  const { t } = useLang();
  const { palette: C } = useTheme();
  const units = useLoggerPrefs().units;
  const [sessions, setSessions] = useState<LoggedSession[] | null>(null);

  useEffect(() => { fetchSessions().then(setSessions); }, []);

  if (sessions === null) return <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.home.analytics.loading")}</Text>;
  if (sessions.length === 0)
    return <AEmpty title={t("w.home.analytics.noAnalytics")} body={t("w.home.analytics.noAnalyticsBody")} />;

  const vol = totalVolume(sessions);
  const prs = bestE1rmByLift(sessions).slice(0, 6);
  const topLift = liftNames(sessions)[0];
  const series = topLift ? e1rmSeries(sessions, topLift).map((p) => Math.round(kgToUnit(p.e1rm, units))) : [];
  const volSeries = [...sessions].slice(0, 8).reverse().map((s) => ({ label: fmtDate(s.startedAt), value: Math.round(kgToUnit(sessionVolume(s.blocks), units)) }));
  const lastReadiness = sessions.find((s) => typeof s.readiness === "number")?.readiness ?? null;
  const best = prs[0];

  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <AStat label={t("w.home.analytics.sessions")} value={sessions.length} accent={C.lime} />
        <AStat label={t("w.home.analytics.totalVolume")} value={fmtTonnage(vol, units)} />
        <AStat label={best ? `${best.lift} e1RM` : t("w.home.analytics.bestE1rm")} value={best ? fmtWeight(best.e1rm, units) : "—"} accent={C.lime} />
        <AStat label={t("w.home.analytics.lastReadiness")} value={lastReadiness ?? "—"} accent={C.blue} />
      </View>

      {series.length > 1 && (
        <AFrame title={`${topLift} · e1RM`} kicker={t("w.home.analytics.fromLogs")}>
          <Spark series={series} color={C.lime} height={64} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{series[0]}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.lime) }}>{series[series.length - 1]} {units}</Text>
          </View>
        </AFrame>
      )}

      <AFrame title={t("w.home.analytics.volPerSession")} kicker={t("w.home.analytics.tonnage")} accent={C.blue}>
        <BarList rows={volSeries} color={C.blue} fmt={(n) => `${n.toLocaleString()} ${units}`} />
      </AFrame>

      {prs.length > 0 && (
        <AFrame title={t("w.home.analytics.personalRecords")} kicker={t("w.home.analytics.bestE1rmPerLift")}>
          <Table
            head={[t("w.home.analytics.col.lift"), t("w.home.analytics.col.bestE1rm"), t("w.home.analytics.col.when")]}
            rows={prs.map((p) => [p.lift, fmtWeight(p.e1rm, units), fmtDate(p.when)])}
          />
        </AFrame>
      )}
    </View>
  );
}

/* ---------- COACH ---------- */
function CoachPane() {
  const { t } = useLang();
  const { palette: C } = useTheme();
  const [roster, setRoster] = useState<RosterRow[] | null>(null);

  useEffect(() => { fetchRoster().then(setRoster); }, []);

  if (roster === null) return <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.home.analytics.loading")}</Text>;
  if (roster.length === 0)
    return <AEmpty title={t("w.home.analytics.noClients")} body={t("w.home.analytics.noClientsBody")} />;

  const avgAdh = Math.round(roster.reduce((s, c) => s + c.adherence, 0) / roster.length);
  const reads = roster.filter((c) => typeof c.readiness === "number");
  const avgRead = reads.length ? Math.round(reads.reduce((s, c) => s + (c.readiness ?? 0), 0) / reads.length) : null;
  const totalVol = roster.reduce((s, c) => s + c.volume, 0);
  const readColor = (r: number | null | undefined) => (r == null ? C.ash : r > 70 ? txt(C, C.lime) : r > 50 ? txt(C, C.amber) : txt(C, C.red));

  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <AStat label={t("w.home.analytics.clients")} value={roster.length} accent={C.violet} />
        <AStat label={t("w.home.analytics.avgAdherence")} value={`${avgAdh}%`} accent={C.lime} />
        <AStat label={t("w.home.analytics.avgReadiness")} value={avgRead ?? "—"} accent={C.blue} />
        <AStat label={t("w.home.analytics.rosterVolume")} value={`${(totalVol / 1000).toFixed(1)}k`} sub="kg" />
      </View>

      <AFrame title={t("w.home.analytics.adherenceByClient")} kicker={t("w.home.analytics.last7days")}>
        <BarList rows={[...roster].sort((a, b) => b.adherence - a.adherence).map((c) => ({ label: c.name, value: c.adherence }))} color={C.lime} fmt={(n) => `${n}%`} />
      </AFrame>

      <AFrame title={t("w.home.analytics.clientRoster")} kicker={t("w.home.analytics.consentedAthletes")} accent={C.violet}>
        <Table
          head={[t("w.home.analytics.col.athlete"), t("w.home.analytics.col.readiness"), t("w.home.analytics.col.adherence"), t("w.home.analytics.col.sessions")]}
          rows={roster.map((c) => [
            c.name,
            <Text key="r" style={{ fontFamily: F.mono, fontSize: fs.body, color: readColor(c.readiness) }}>{c.readiness ?? "—"}</Text>,
            `${c.adherence}%`,
            String(c.sessions),
          ])}
        />
      </AFrame>
    </View>
  );
}

/* ---------- OPERATOR ---------- */
function OperatorPane() {
  const { t } = useLang();
  const { palette: C } = useTheme();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetchAdminStats().then((d) => (d ? setStats(d) : setErr(true)));
  }, []);

  if (err) return <AEmpty title={t("w.home.analytics.adminOnly")} body={t("w.home.analytics.adminOnlyBody")} />;
  if (!stats) return <AEmpty title={t("w.home.analytics.loading")} body={t("w.home.analytics.loadingBody")} />;

  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <AStat label={t("w.home.analytics.totalUsers")} value={stats.totalUsers.toLocaleString()} sub={`+${stats.newUsers30} / 30d`} accent={C.lime} />
        <AStat label={t("w.home.analytics.active30d")} value={stats.mau.toLocaleString()} sub={t("w.home.analytics.trainedIn30d")} accent={C.lime} />
        <AStat label={t("w.home.analytics.sessionsLogged")} value={stats.sessions.toLocaleString()} />
        <AStat label={t("w.home.analytics.coaches")} value={stats.coaches.toLocaleString()} accent={C.violet} />
      </View>

      {stats.planPopularity.length > 0 && (
        <AFrame title={t("w.home.analytics.plansEnrolled")} kicker={t("w.home.analytics.byGoal")}>
          <BarList rows={stats.planPopularity.map((p) => ({ label: p.goal, value: p.n }))} color={C.lime} />
        </AFrame>
      )}

      {stats.langSplit.length > 0 && (
        <AFrame title={t("w.home.analytics.languageSplit")} kicker={t("w.home.analytics.usersByLanguage")} accent={C.blue}>
          <BarList rows={stats.langSplit.map((l) => ({ label: l.lang, value: l.n }))} color={C.lime} />
        </AFrame>
      )}

      {stats.totalUsers === 0 && (
        <ACard style={{ marginTop: 14, alignItems: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.home.analytics.noUsers")}</Text>
        </ACard>
      )}
    </View>
  );
}
