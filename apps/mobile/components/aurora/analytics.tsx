import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import {
  totalVolume, sessionVolume, bestTopLoadByLift, topLoadSeries, liftNames,
  kgToUnit, fmtTonnage, fmtWeight, normalizeAuthRole,
  analyticsScopesFor, resolveAnalyticsScope, analyticsScopeLabelKey, analyticsScopePrivacyKey,
  type LoggedSession, type AnalyticsScope,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { fetchRoster, type RosterRow } from "../../lib/api";
import { adminGet } from "../../lib/admin-api";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { ABack, AuroraScreen, ACard, AHeading, ASub, ASegment } from "./kit";

/**
 * AURORA Analytics — the 3-scope dashboard (Athlete / Coach / Operator), now
 * MOBILE-ONLY (analytics is mobile-first; the web nav no longer offers it — see
 * MOBILE_ONLY_NAV in @hybrid/core and the web-dashboards capability).
 *
 * Same engines and the same `/api/coach/roster` + `/api/admin/stats` endpoints
 * the web dashboard read, and the same `w.home.analytics.*` strings, so the
 * numbers can't drift from what web used to show. Charts are dependency-free
 * bars/sparks (the idiom every other mobile analytics screen uses — trends,
 * endurance, volume), not a charting library.
 *
 * Which scopes appear comes from the SHARED resolver in core
 * (analyticsScopesFor) — role-derived, never persona-derived — the same one the
 * web shell uses, so the clients can't disagree about who may see whose data.
 * With one scope the switcher is hidden entirely.
 */

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** A big stat tile — accent kicker, oversized number, optional sub. Mirrors the
 *  web AStat (which used a coloured dot); here the ACCENT IS THE NUMBER, since a
 *  dot before a label reads as decoration on mobile. */
function AStat({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  const C = useTheme().palette;
  return (
    <View style={{ width: "50%", padding: 5 }}>
      <ACard style={{ padding: 16 }}>
        <Text numberOfLines={2} style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{label}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: F.black, fontSize: 28, marginTop: 8, color: accent ? txt(C, accent) : C.chalk }}>{value}</Text>
        {!!sub && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 4 }}>{sub}</Text>}
      </ACard>
    </View>
  );
}

/** A section card — display-face title with an optional mono kicker on the RIGHT
 *  of the same row (the Explore SectionHead idiom; no marker on the left). */
function AFrame({ title, kicker, children }: { title: string; kicker?: string; children: React.ReactNode }) {
  const C = useTheme().palette;
  return (
    <ACard style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk }}>{title}</Text>
        {!!kicker && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{kicker}</Text>}
      </View>
      <View style={{ marginTop: 12 }}>{children}</View>
    </ACard>
  );
}

/** The "what this scope can and cannot see" note, shown above every dashboard.
 *  Same copy as web (analytics.privacy.*) — a left accent rule rather than a
 *  glyph, since a marker before a label reads as decoration. */
function PrivacyNote({ scope, accent }: { scope: AnalyticsScope; accent: string }) {
  const C = useTheme().palette;
  const { t } = useLang();
  return (
    <View style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, backgroundColor: `${accent}12`, borderLeftWidth: 3, borderLeftColor: accent }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, lineHeight: 17, color: C.chalk }}>{t(analyticsScopePrivacyKey(scope))}</Text>
    </View>
  );
}

function AEmpty({ title, body }: { title: string; body: string }) {
  const C = useTheme().palette;
  return (
    <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 30 }}>
      <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk, textAlign: "center" }}>{title}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, textAlign: "center", lineHeight: 20, marginTop: 8 }}>{body}</Text>
    </ACard>
  );
}

/** A column-bar chart with an axis floor, so a flat series still reads as bars.
 *  `highlightLast` lights the most recent column (the trends.tsx idiom). */
function Bars({ data, color, highlightLast }: { data: { label: string; v: number }[]; color: string; highlightLast?: boolean }) {
  const C = useTheme().palette;
  const max = Math.max(...data.map((d) => d.v), 1);
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 96, gap: 5 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, height: 6 + (d.v / max) * 84, borderRadius: 3, backgroundColor: highlightLast && i === data.length - 1 ? color : `${color}66` }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash }}>{data[0]?.label ?? ""}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash }}>{data[data.length - 1]?.label ?? ""}</Text>
      </View>
    </>
  );
}

/** A labelled horizontal meter — the mobile stand-in for the web's vertical
 *  category bar chart (adherence by client, language split). */
function MeterRow({ label, value, display, max, color }: { label: string; value: number; display: string; max: number; color: string }) {
  const C = useTheme().palette;
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5, gap: space.sm }}>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.caption, color: C.chalk }}>{label}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{display}</Text>
      </View>
      <View style={{ height: 7, borderRadius: 4, backgroundColor: C.ink, overflow: "hidden" }}>
        <View style={{ width: `${Math.min(100, (value / (max || 1)) * 100)}%`, height: "100%", borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

/** Shared table — horizontally scrollable so a wide roster never squeezes. */
function Table({ head, rows, widths }: { head: string[]; rows: React.ReactNode[][]; widths: number[] }) {
  const C = useTheme().palette;
  const cell = (w: number) => ({ width: w, paddingVertical: 12, paddingRight: 10 });
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line }}>
          {head.map((h, i) => (
            <Text key={h} numberOfLines={1} style={{ ...cell(widths[i] ?? 80), fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>{h}</Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={{ flexDirection: "row", borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: C.line }}>
            {r.map((c, j) => (
              <View key={j} style={cell(widths[j] ?? 80)}>
                {typeof c === "string" || typeof c === "number"
                  ? <Text numberOfLines={1} style={{ fontFamily: j === 0 ? F.semi : F.mono, fontSize: fs.caption, color: C.chalk }}>{c}</Text>
                  : c}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/* ---------- ATHLETE ---------- */
function AthleteAnalytics({ sessions }: { sessions: LoggedSession[] }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const bw = useBodyweightLookup();

  const view = useMemo(() => {
    if (sessions.length === 0) return null;
    const vol = totalVolume(sessions, bw);
    const prs = bestTopLoadByLift(sessions, bw).slice(0, 6);
    const topLift = liftNames(sessions)[0];
    const series = topLift
      ? topLoadSeries(sessions, topLift, bw).map((p) => ({ label: fmtDate(p.date), v: Math.round(kgToUnit(p.weightKg, units)) }))
      : [];
    // Newest-first from the API; reverse so the chart reads left→right in time.
    const volSeries = [...sessions].slice(0, 8).reverse().map((s) => ({ label: fmtDate(s.startedAt), v: Math.round(kgToUnit(sessionVolume(s.blocks, false, bw(s.startedAt)), units)) }));
    return { vol, prs, topLift, series, volSeries, lastReadiness: sessions.find((s) => typeof s.readiness === "number")?.readiness ?? null };
  }, [sessions, bw, units]);

  if (!view) return <AEmpty title={t("w.home.analytics.noAnalytics")} body={t("w.home.analytics.noAnalyticsBody")} />;
  const best = view.prs[0];

  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, marginTop: 12 }}>
        <AStat label={t("w.home.analytics.sessions")} value={sessions.length} accent={C.lime} />
        <AStat label={t("w.home.analytics.totalVolume")} value={fmtTonnage(view.vol, units)} />
        <AStat label={best ? `${best.lift} ${t("w.home.analytics.col.heaviest")}` : t("w.home.analytics.heaviest")} value={best ? fmtWeight(best.weightKg, units) : "—"} accent={C.lime} />
        <AStat label={t("w.home.analytics.lastReadiness")} value={view.lastReadiness ?? "—"} accent={C.blue} />
      </View>

      {view.series.length > 0 && (
        <AFrame title={`${view.topLift} – ${t("w.home.analytics.col.heaviest")}`} kicker={t("w.home.analytics.fromLogs")}>
          <Bars data={view.series} color={C.lime} highlightLast />
        </AFrame>
      )}

      <AFrame title={t("w.home.analytics.volPerSession")} kicker={t("w.home.analytics.tonnage")}>
        <Bars data={view.volSeries} color={C.blue} highlightLast />
      </AFrame>

      {view.prs.length > 0 && (
        <AFrame title={t("w.home.analytics.personalRecords")} kicker={t("w.home.analytics.heaviestPerLift")}>
          <Table
            head={[t("w.home.analytics.col.lift"), t("w.home.analytics.col.heaviest"), t("w.home.analytics.col.when")]}
            widths={[150, 100, 90]}
            rows={view.prs.map((p) => [p.lift, fmtWeight(p.weightKg, units), fmtDate(p.when)])}
          />
        </AFrame>
      )}
    </>
  );
}

/* ---------- COACH ---------- */
function CoachAnalytics() {
  const C = useTheme().palette;
  const { t } = useLang();
  const [roster, setRoster] = useState<RosterRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRoster().then((r) => { if (alive) setRoster(r); });
    return () => { alive = false; };
  }, []);

  if (roster === null) return <AEmpty title={t("w.home.analytics.loading")} body={t("w.home.analytics.loadingBody")} />;
  if (roster.length === 0) return <AEmpty title={t("w.home.analytics.noClients")} body={t("w.home.analytics.noClientsBody")} />;

  const avgAdh = Math.round(roster.reduce((s, c) => s + c.adherence, 0) / roster.length);
  const reads = roster.filter((c) => typeof c.readiness === "number");
  const avgRead = reads.length ? Math.round(reads.reduce((s, c) => s + (c.readiness ?? 0), 0) / reads.length) : null;
  const totalVol = roster.reduce((s, c) => s + c.volume, 0);
  const readColor = (r: number | null | undefined) => (r == null ? C.ash : r > 70 ? C.lime : r > 50 ? C.amber : C.red);

  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, marginTop: 12 }}>
        <AStat label={t("w.home.analytics.clients")} value={roster.length} accent={C.violet} />
        <AStat label={t("w.home.analytics.avgAdherence")} value={`${avgAdh}%`} accent={C.lime} />
        <AStat label={t("w.home.analytics.avgReadiness")} value={avgRead ?? "—"} accent={C.blue} />
        <AStat label={t("w.home.analytics.rosterVolume")} value={`${(totalVol / 1000).toFixed(1)}k`} sub="kg" />
      </View>

      <AFrame title={t("w.home.analytics.adherenceByClient")} kicker={t("w.home.analytics.last7days")}>
        {roster.map((c) => (
          <MeterRow key={c.linkId} label={c.name} value={c.adherence} display={`${c.adherence}%`} max={100} color={C.lime} />
        ))}
      </AFrame>

      <AFrame title={t("w.home.analytics.clientRoster")} kicker={t("w.home.analytics.consentedAthletes")}>
        <Table
          head={[t("w.home.analytics.col.athlete"), t("w.home.analytics.col.readiness"), t("w.home.analytics.col.adherence"), t("w.home.analytics.col.sessions"), t("w.home.analytics.col.last")]}
          widths={[130, 90, 90, 80, 90]}
          rows={roster.map((c) => [
            c.name,
            <Text key="r" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, readColor(c.readiness)) }}>{c.readiness ?? "—"}</Text>,
            `${c.adherence}%`,
            String(c.sessions),
            c.lastSession ? fmtDate(c.lastSession) : "—",
          ])}
        />
      </AFrame>
    </>
  );
}

/* ---------- OPERATOR ---------- */
type AdminStats = {
  totalUsers: number; sessions: number; coaches: number; mau: number; newUsers30: number;
  planPopularity: { goal: string; n: number }[]; langSplit: { lang: string; n: number }[];
};

function OperatorAnalytics() {
  const C = useTheme().palette;
  const { t } = useLang();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    adminGet<AdminStats>("/api/admin/stats").then((r) => {
      if (!alive) return;
      if (r.ok && r.data) setStats(r.data); else setErr(true);
    });
    return () => { alive = false; };
  }, []);

  if (err) return <AEmpty title={t("w.home.analytics.adminOnly")} body={t("w.home.analytics.adminOnlyBody")} />;
  if (!stats) return <AEmpty title={t("w.home.analytics.loading")} body={t("w.home.analytics.loadingBody")} />;

  const maxPlan = Math.max(...stats.planPopularity.map((p) => p.n), 1);
  const maxLang = Math.max(...stats.langSplit.map((l) => l.n), 1);

  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, marginTop: 12 }}>
        <AStat label={t("w.home.analytics.totalUsers")} value={stats.totalUsers.toLocaleString()} sub={`+${stats.newUsers30} / 30d`} accent={C.lime} />
        <AStat label={t("w.home.analytics.active30d")} value={stats.mau.toLocaleString()} sub={t("w.home.analytics.trainedIn30d")} accent={C.lime} />
        <AStat label={t("w.home.analytics.sessionsLogged")} value={stats.sessions.toLocaleString()} />
        <AStat label={t("w.home.analytics.coaches")} value={stats.coaches.toLocaleString()} accent={C.violet} />
      </View>

      {stats.planPopularity.length > 0 && (
        <AFrame title={t("w.home.analytics.plansEnrolled")} kicker={t("w.home.analytics.byGoal")}>
          {stats.planPopularity.map((p) => (
            <MeterRow key={p.goal} label={p.goal} value={p.n} display={String(p.n)} max={maxPlan} color={C.lime} />
          ))}
        </AFrame>
      )}

      {stats.langSplit.length > 0 && (
        <AFrame title={t("w.home.analytics.languageSplit")} kicker={t("w.home.analytics.usersByLanguage")}>
          {stats.langSplit.map((l) => (
            <MeterRow key={l.lang} label={l.lang} value={l.n} display={String(l.n)} max={maxLang} color={C.blue} />
          ))}
        </AFrame>
      )}

      {stats.totalUsers === 0 && (
        <ACard style={{ marginTop: 16, alignItems: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.home.analytics.noUsers")}</Text>
        </ACard>
      )}
    </>
  );
}

/* ---------- SCREEN ---------- */
export default function AuroraAnalytics() {
  const C = useTheme().palette;
  const { t } = useLang();
  const { role } = useSession();
  const { data: sessions = [], isFetching, refetch } = useSessionsQuery();
  useRefreshOnFocus(refetch);

  const authRole = normalizeAuthRole(role);
  const allowed = useMemo(() => analyticsScopesFor(authRole), [authRole]);
  const options = useMemo(() => allowed.map((id) => ({ id, label: t(analyticsScopeLabelKey(id)) })), [allowed, t]);

  // Land on the highest scope the role holds (an admin opens on the platform
  // view), matching the web shell.
  const [scope, setScope] = useState<AnalyticsScope>("athlete");
  useEffect(() => { setScope(allowed[allowed.length - 1]!); }, [allowed]);
  // A demotion mid-session must not leave the user on a scope they've lost.
  const active = resolveAnalyticsScope(authRole, scope);

  return (
    <AuroraScreen refreshing={isFetching} onRefresh={refetch}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
        <AHeading style={{ fontSize: fs.display }}>{t("nav.analytics")}</AHeading>
      </View>
      <ASub style={{ marginTop: 10 }}>{t("analytics.subtitle")}</ASub>

      {options.length > 1 && (
        <View style={{ marginTop: 16 }}>
          <ASegment options={options} value={active} onPick={setScope} />
        </View>
      )}

      <PrivacyNote scope={active} accent={active === "operator" ? C.amber : active === "coach" ? C.violet : C.lime} />

      {active === "athlete" && <AthleteAnalytics sessions={sessions} />}
      {active === "coach" && <CoachAnalytics />}
      {active === "operator" && <OperatorAnalytics />}
    </AuroraScreen>
  );
}
