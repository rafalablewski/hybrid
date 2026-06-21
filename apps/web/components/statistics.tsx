"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { fs, space, sessionBuckets, weeklyRecap, type StatRange } from "@hybrid/core";
import { useSessions } from "@/lib/use-sessions";
import { AuroraIcon } from "@/components/aurora/icons";
import { useTemplate } from "@/lib/use-template";
import { useLang } from "@/lib/i18n";

const RANGES: { id: StatRange; key: string }[] = [
  { id: "week", key: "w.analyze.stats.week" },
  { id: "month", key: "w.analyze.stats.month" },
  { id: "year", key: "w.analyze.stats.year" },
];

/** Statistics (web) — web parity of the mobile screen, same @hybrid/core stats
 *  engine over the signed-in user's real sessions. Honest empty state. Works in
 *  BOTH templates: `embedded` (in the app-shell, reached from the sidebar / ⌘K)
 *  drops the full-screen chrome + back button; standalone (/statistics, e.g.
 *  from the landing) keeps them. Radii soften under Aurora. */
export default function StatisticsScreen({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const router = useRouter();
  const aurora = useTemplate().template === "aurora";
  const r = { card: aurora ? 24 : 12, chart: aurora ? 28 : 14, field: aurora ? 14 : 10, pill: aurora ? 999 : 10 };
  const { sessions } = useSessions();
  const [range, setRange] = useState<StatRange>("week");
  const buckets = useMemo(() => sessionBuckets(sessions, range), [sessions, range]);
  const recap = useMemo(() => weeklyRecap(sessions), [sessions]);
  const hasData = sessions.length > 0;
  const maxVal = Math.max(1, ...buckets.buckets.map((b) => b.value));
  const C = (v: string) => `var(--color-${v})`;
  const outer: CSSProperties = embedded
    ? { color: C("chalk"), fontFamily: "var(--font-display)", display: "flex", justifyContent: "center" }
    : { minHeight: "100vh", background: C("ink"), color: C("chalk"), fontFamily: "var(--font-display)", display: "flex", justifyContent: "center", padding: "32px 22px" };

  return (
    <div style={outer}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: space.ms, alignItems: "center" }}>
            {!embedded && (
              <button onClick={() => router.push("/app")} aria-label={t("w.analyze.stats.back")} style={{ width: 44, height: 44, borderRadius: r.field, border: `1px solid ${C("line")}`, background: "transparent", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center" }}>
                {aurora ? <AuroraIcon name="back" size={20} /> : <span style={{ fontSize: fs.heading }}>←</span>}
              </button>
            )}
            <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0, lineHeight: 1.1 }}>
              {t("w.analyze.stats.title").split("\n").flatMap((line, i) => (i === 0 ? [line] : [<br key={i} />, line]))}
            </h1>
          </div>
          <div style={{ textAlign: "right", marginTop: 6 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{t("w.analyze.stats.weeklyVolume")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: space.xs, justifyContent: "flex-end", marginTop: 2 }}>
              <AuroraIcon name="arrow-up" size={16} color={C("lime")} />
              <span style={{ fontWeight: 900, fontSize: fs.title }}>{Math.round(recap.volume)} kg</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: space.xxs, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: r.pill, padding: 4, marginTop: 18 }}>
          {RANGES.map((rg) => {
            const on = range === rg.id;
            return (
              <button key={rg.id} onClick={() => setRange(rg.id)} style={{ flex: 1, padding: "9px 0", borderRadius: r.pill, border: "none", cursor: "pointer", fontWeight: 700, fontSize: fs.body, background: on ? C("lime") : "transparent", color: on ? C("ink") : C("ash") }}>{t(rg.key)}</button>
            );
          })}
        </div>

        <div style={{ marginTop: 18, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: r.chart, padding: "18px 18px 26px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b style={{ fontSize: fs.subtitle }}>{t("w.analyze.stats.sessions")}</b>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{buckets.total} {t("w.analyze.stats.inRange")} {range}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", height: 130, marginTop: 16, gap: 7 }}>
            {buckets.buckets.map((b, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: space.xs }}>
                <div style={{ width: "100%", height: Math.max(4, (b.value / maxVal) * 104), borderRadius: 6, background: i === buckets.peakIndex ? C("lime") : C("line") }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C("ash") }}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: space.md, marginTop: 16 }}>
          <Mini icon="verified" label={t("w.analyze.stats.activeDays")} value={hasData ? String(buckets.activeDays) : "—"} color={C("lime")} radius={r.card} />
          <Mini icon="navigation" label={t("w.analyze.stats.distance")} value={hasData ? `${recap.distanceKm.toFixed(1)} km` : "—"} color={C("violet")} radius={r.card} />
          <Mini icon="play" label={t("w.analyze.stats.minutes")} value={hasData ? String(Math.round(recap.minutes)) : "—"} color={C("amber")} radius={r.card} />
        </div>

        {!hasData && (
          <p style={{ fontSize: fs.body, color: C("ash"), textAlign: "center", marginTop: 18, lineHeight: 1.5 }}>{t("w.analyze.stats.empty")}</p>
        )}
      </div>
    </div>
  );
}

function Mini({ icon, label, value, color, radius }: { icon: Parameters<typeof AuroraIcon>[0]["name"]; label: string; value: string; color: string; radius: number }) {
  const C = (v: string) => `var(--color-${v})`;
  return (
    <div style={{ flex: 1, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: radius, padding: 16 }}>
      <AuroraIcon name={icon} size={22} color={color} />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 8 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: fs.heading, marginTop: 2 }}>{value}</div>
    </div>
  );
}
