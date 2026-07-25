import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import {
  totalVolume, sessionVolume, bestTopLoadByLift, topLoadSeries, liftNames,
  kgToUnit, fmtTonnage, fmtWeight, type LoggedSession,
} from "@hybrid/core";
import { fetchRoster, fetchAdminStats, type RosterRow, type AdminStats } from "../../lib/api";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { usePersona } from "../../lib/persona";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { ABack, AuroraScreen, ACard, AHeading, RADIUS, Spark } from "./kit";
import FetchError from "./fetch-error";

/**
 * AURORA Analytics (mobile) — the twin of the web dashboard
 * (apps/web/components/aurora/analytics.tsx), rendering the SAME three scopes
 * off the SAME engines and the SAME endpoints, so the two clients can never
 * report different numbers:
 *   - CLIENT   — every athlete: sessions, tonnage, heaviest lift, readiness,
 *                a top-lift progression sparkline, per-session volume bars and
 *                the personal-records list.
 *   - COACH    — additionally, for a coach/admin: roster size, average
 *                adherence + readiness, roster tonnage, an adherence bar per
 *                athlete and the roster list.
 *   - OPERATOR — additionally, for an admin: platform totals, plan popularity
 *                and the language split.
 *
 * Charts are the house mobile idiom rather than a charting library: the shared
 * `Spark` for the trend line and plain measured bars for the rest — the same
 * data, drawn the way the rest of the app draws it.
 *
 * This screen closes the `mobile-analytics` gap: the destination previously
 * resolved on web only, and mobile's More hub tagged it "WEB".
 */

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** A stat tile — mono kicker, oversized number, optional sub. No leading dot:
 *  a decorative marker before a label is house-banned. */
function AStat({ C, label, value, sub, accent }: { C: Palette; label: string; value: ReactNode; sub?: string; accent?: string }) {
  return (
    <ACard style={{ flex: 1, minWidth: 150, padding: 18 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{label}</Text>
      <Text style={{ fontFamily: F.black, fontSize: 30, lineHeight: 34, color: accent ?? C.chalk, marginTop: 6 }}>{value}</Text>
      {sub ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 4 }}>{sub}</Text> : null}
    </ACard>
  );
}

/** A titled section card. The meta sits on the RIGHT of the title row (Explore's
 *  SectionHead idiom) — never a marker on the left. */
function AFrame({ C, title, kicker, accent, children }: { C: Palette; title: string; kicker?: string; accent?: string; children: ReactNode }) {
  return (
    <ACard style={{ marginTop: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.ms }}>
        <Text style={{ flexShrink: 1, fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{title}</Text>
        {kicker ? <Text style={{ fontFamily: F.mono, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1.2, color: accent ?? C.ash }}>{kicker}</Text> : null}
      </View>
      <View style={{ marginTop: 12 }}>{children}</View>
    </ACard>
  );
}

function AEmpty({ C, title, body }: { C: Palette; title: string; body: string }) {
  return (
    <ACard style={{ marginTop: space.md, alignItems: "center", paddingVertical: 36 }}>
      <Text style={{ fontFamily: F.black, fontSize: fs.heading, color: C.chalk, textAlign: "center" }}>{title}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginTop: 10, textAlign: "center", lineHeight: 20, maxWidth: 320 }}>{body}</Text>
    </ACard>
  );
}

/** A labelled horizontal bar — the mobile stand-in for the web's bar charts. */
function BarRow({ C, label, value, max, suffix = "", color }: { C: Palette; label: string; value: number; max: number; suffix?: string; color: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.ms }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{label}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{value}{suffix}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: C.ink, overflow: "hidden", marginTop: 5 }}>
        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: color }} />
      </View>
    </View>
  );
}

/** A compact key/value list — the mobile stand-in for the web's tables (a real
 *  table doesn't survive a phone's width). */
function Rows({ C, rows }: { C: Palette; rows: { key: string; label: string; right: ReactNode; sub?: string }[] }) {
  return (
    <View>
      {rows.map((r, i) => (
        <View key={r.key} style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: 11, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{r.label}</Text>
            {r.sub ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{r.sub}</Text> : null}
          </View>
          {r.right}
        </View>
      ))}
    </View>
  );
}

/* ---------- CLIENT ---------- */
function AthleteAnalytics({ C, sessions }: { C: Palette; sessions: LoggedSession[] }) {
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const bw = useBodyweightLookup();

  const model = useMemo(() => {
    if (sessions.length === 0) return null;
    const prs = bestTopLoadByLift(sessions, bw).slice(0, 6);
    const topLift = liftNames(sessions)[0];
    return {
      vol: totalVolume(sessions, bw),
      prs,
      topLift,
      series: topLift ? topLoadSeries(sessions, topLift, bw).map((p) => Math.round(kgToUnit(p.weightKg, units))) : [],
      volSeries: [...sessions].slice(0, 8).reverse().map((s) => ({
        label: fmtDate(s.startedAt),
        vol: Math.round(kgToUnit(sessionVolume(s.blocks, false, bw(s.startedAt)), units)),
      })),
      lastReadiness: sessions.find((s) => typeof s.readiness === "number")?.readiness ?? null,
      best: prs[0],
    };
  }, [sessions, bw, units]);

  if (!model) return <AEmpty C={C} title={t("w.home.analytics.noAnalytics")} body={t("w.home.analytics.noAnalyticsBody")} />;
  const maxVol = Math.max(...model.volSeries.map((v) => v.vol), 1);

  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.ms, marginTop: space.md }}>
        <AStat C={C} label={t("w.home.analytics.sessions")} value={sessions.length} accent={txt(C, C.lime)} />
        <AStat C={C} label={t("w.home.analytics.totalVolume")} value={fmtTonnage(model.vol, units)} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.ms, marginTop: space.ms }}>
        <AStat C={C} label={model.best ? `${model.best.lift} ${t("w.home.analytics.col.heaviest")}` : t("w.home.analytics.heaviest")} value={model.best ? fmtWeight(model.best.weightKg, units) : "—"} accent={txt(C, C.lime)} />
        <AStat C={C} label={t("w.home.analytics.lastReadiness")} value={model.lastReadiness ?? "—"} accent={txt(C, C.blue)} />
      </View>

      {model.series.length > 1 && model.topLift ? (
        <AFrame C={C} title={`${model.topLift} – ${t("w.home.analytics.col.heaviest")}`} kicker={t("w.home.analytics.fromLogs")} accent={txt(C, C.lime)}>
          <Spark series={model.series} color={txt(C, C.lime)} height={80} />
        </AFrame>
      ) : null}

      <AFrame C={C} title={t("w.home.analytics.volPerSession")} kicker={t("w.home.analytics.tonnage")} accent={txt(C, C.blue)}>
        {model.volSeries.map((v, i) => (
          <BarRow key={`${v.label}-${i}`} C={C} label={v.label} value={v.vol} max={maxVol} color={txt(C, C.blue)} />
        ))}
      </AFrame>

      {model.prs.length > 0 ? (
        <AFrame C={C} title={t("w.home.analytics.personalRecords")} kicker={t("w.home.analytics.heaviestPerLift")}>
          <Rows
            C={C}
            rows={model.prs.map((p) => ({
              key: p.lift,
              label: p.lift,
              sub: fmtDate(p.when),
              right: <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{fmtWeight(p.weightKg, units)}</Text>,
            }))}
          />
        </AFrame>
      ) : null}
    </>
  );
}

/* ---------- COACH ---------- */
function CoachAnalytics({ C, roster }: { C: Palette; roster: RosterRow[] }) {
  const { t } = useLang();
  if (roster.length === 0) return <AEmpty C={C} title={t("w.home.analytics.noClients")} body={t("w.home.analytics.noClientsBody")} />;

  const avgAdh = Math.round(roster.reduce((s, c) => s + c.adherence, 0) / roster.length);
  const reads = roster.filter((c) => typeof c.readiness === "number");
  const avgRead = reads.length ? Math.round(reads.reduce((s, c) => s + (c.readiness ?? 0), 0) / reads.length) : null;
  const totalVol = roster.reduce((s, c) => s + c.volume, 0);
  const readColor = (r: number | null | undefined) => (r == null ? C.ash : r > 70 ? txt(C, C.lime) : r > 50 ? txt(C, C.amber) : txt(C, C.red));

  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.ms, marginTop: space.lg }}>
        <AStat C={C} label={t("w.home.analytics.clients")} value={roster.length} accent={txt(C, C.violet)} />
        <AStat C={C} label={t("w.home.analytics.avgAdherence")} value={`${avgAdh}%`} accent={txt(C, C.lime)} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.ms, marginTop: space.ms }}>
        <AStat C={C} label={t("w.home.analytics.avgReadiness")} value={avgRead ?? "—"} accent={txt(C, C.blue)} />
        <AStat C={C} label={t("w.home.analytics.rosterVolume")} value={`${(totalVol / 1000).toFixed(1)}k`} sub="kg" />
      </View>

      <AFrame C={C} title={t("w.home.analytics.adherenceByClient")} kicker={t("w.home.analytics.last7days")} accent={txt(C, C.lime)}>
        {roster.map((c) => (
          <BarRow key={c.linkId} C={C} label={c.name} value={c.adherence} max={100} suffix="%" color={txt(C, C.lime)} />
        ))}
      </AFrame>

      <AFrame C={C} title={t("w.home.analytics.clientRoster")} kicker={t("w.home.analytics.consentedAthletes")} accent={txt(C, C.violet)}>
        <Rows
          C={C}
          rows={roster.map((c) => ({
            key: c.linkId,
            label: c.name,
            sub: `${c.sessions} ${t("w.home.analytics.col.sessions")} – ${c.lastSession ? fmtDate(c.lastSession) : "—"}`,
            right: (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: readColor(c.readiness) }}>{c.readiness ?? "—"}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{c.adherence}%</Text>
              </View>
            ),
          }))}
        />
      </AFrame>
    </>
  );
}

/* ---------- OPERATOR ---------- */
function OperatorAnalytics({ C, stats }: { C: Palette; stats: AdminStats }) {
  const { t } = useLang();
  const maxPlan = Math.max(...stats.planPopularity.map((p) => p.n), 1);
  const maxLang = Math.max(...stats.langSplit.map((l) => l.n), 1);

  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.ms, marginTop: space.lg }}>
        <AStat C={C} label={t("w.home.analytics.totalUsers")} value={stats.totalUsers.toLocaleString()} sub={`+${stats.newUsers30} / 30d`} accent={txt(C, C.lime)} />
        <AStat C={C} label={t("w.home.analytics.active30d")} value={stats.mau.toLocaleString()} sub={t("w.home.analytics.trainedIn30d")} accent={txt(C, C.lime)} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.ms, marginTop: space.ms }}>
        <AStat C={C} label={t("w.home.analytics.sessionsLogged")} value={stats.sessions.toLocaleString()} />
        <AStat C={C} label={t("w.home.analytics.coaches")} value={stats.coaches.toLocaleString()} accent={txt(C, C.violet)} />
      </View>

      {stats.planPopularity.length > 0 ? (
        <AFrame C={C} title={t("w.home.analytics.plansEnrolled")} kicker={t("w.home.analytics.byGoal")} accent={txt(C, C.lime)}>
          {stats.planPopularity.map((p) => (
            <BarRow key={p.goal} C={C} label={p.goal} value={p.n} max={maxPlan} color={txt(C, C.lime)} />
          ))}
        </AFrame>
      ) : null}

      {stats.langSplit.length > 0 ? (
        <AFrame C={C} title={t("w.home.analytics.languageSplit")} kicker={t("w.home.analytics.usersByLanguage")} accent={txt(C, C.blue)}>
          {stats.langSplit.map((l) => (
            <BarRow key={l.lang} C={C} label={l.lang} value={l.n} max={maxLang} color={txt(C, C.blue)} />
          ))}
        </AFrame>
      ) : null}

      {stats.totalUsers === 0 ? (
        <ACard style={{ marginTop: space.md, alignItems: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.home.analytics.noUsers")}</Text>
        </ACard>
      ) : null}
    </>
  );
}

export default function AuroraAnalytics() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const persona = usePersona();
  const { data: sessions = [], isError, refetch } = useSessionsQuery();
  useRefreshOnFocus(refetch);

  const isCoach = persona === "coach" || persona === "admin";
  const isAdmin = persona === "admin";

  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [scopesLoading, setScopesLoading] = useState(false);

  // Only the personas that RENDER a scope pay for its fetch.
  useEffect(() => {
    if (!isCoach) return;
    let alive = true;
    setScopesLoading(true);
    Promise.all([fetchRoster(), isAdmin ? fetchAdminStats() : Promise.resolve(null)])
      .then(([r, s]) => {
        if (!alive) return;
        setRoster(r);
        setStats(s);
      })
      .finally(() => { if (alive) setScopesLoading(false); });
    return () => { alive = false; };
  }, [isCoach, isAdmin]);

  return (
    <AuroraScreen>
      <ABack />
      <AHeading style={{ fontSize: fs.display, marginTop: 12 }}>{t("nav.analytics")}</AHeading>

      {isError ? (
        <FetchError onRetry={refetch} />
      ) : (
        <AthleteAnalytics C={C} sessions={sessions} />
      )}

      {isCoach ? (
        scopesLoading ? (
          <View style={{ paddingVertical: 30, alignItems: "center" }}>
            <ActivityIndicator color={C.lime} />
          </View>
        ) : (
          <>
            <CoachAnalytics C={C} roster={roster ?? []} />
            {isAdmin && stats ? <OperatorAnalytics C={C} stats={stats} /> : null}
          </>
        )
      ) : null}

      <View style={{ height: RADIUS.card }} />
    </AuroraScreen>
  );
}
