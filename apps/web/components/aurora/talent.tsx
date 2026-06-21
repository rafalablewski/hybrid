"use client";

import { useEffect, useState } from "react";
import { fs, space, METRIC_LABEL, BENCHMARK_METRICS, type BenchmarkMetric } from "@hybrid/core";
import { useIsMobile } from "@/lib/use-media-query";
import { useLang } from "@/lib/i18n";

type Bench = { metric: BenchmarkMetric; value: number; percentile: number; cohortMean: number; potentialPercentile: number };
type Report = { cohort: { sport: string; sex: string; age: number }; benchmarks: Bench[]; overall: number; potential: number; modelVersion: string };
type Profile = { sport: string; sex: string; age: number; visibility: string; metrics: Record<string, number>; moderationStatus?: string } | null;
type Result = { id: string; name: string; sport: string; age: number; sex: string; percentile: number; potential: number };

const C = (v: string) => `var(--color-${v})`;
const SPORTS = ["Hyrox", "Triathlon", "Running", "Cycling", "Swimming", "Powerlifting", "Bodybuilding", "Hybrid"];
const pctColor = (p: number) => (p >= 90 ? "lime" : p >= 70 ? "blue" : p >= 40 ? "amber" : "ash");

/** AURORA Talent Graph (web) — same /api/talent + /api/talent/search + /api/reports
 *  flow: benchmarks, maturation-adjusted potential and discovery, in the rounded
 *  Aurora style. */
export default function AuroraTalent() {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const [profile, setProfile] = useState<Profile>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [hpi, setHpi] = useState<number | null>(null);
  const [form, setForm] = useState({ sport: "Hybrid", sex: "M", age: "", relStrength: "", vo2: "", durability: "", visibility: "private" });

  // discovery
  const [q, setQ] = useState({ sport: "", metric: "hpi" as BenchmarkMetric, minPct: "80", byPotential: false });
  const [results, setResults] = useState<Result[]>([]);

  const load = async () => {
    const res = await fetch("/api/talent");
    if (res.ok) {
      const d = (await res.json()) as { profile: Profile; report: Report | null; computedHpi: number };
      setProfile(d.profile);
      setReport(d.report);
      setHpi(d.computedHpi);
      if (d.profile)
        setForm((f) => ({
          ...f,
          sport: d.profile!.sport,
          sex: d.profile!.sex,
          age: String(d.profile!.age),
          relStrength: d.profile!.metrics.relStrength != null ? String(d.profile!.metrics.relStrength) : "",
          vo2: d.profile!.metrics.vo2 != null ? String(d.profile!.metrics.vo2) : "",
          durability: d.profile!.metrics.durability != null ? String(d.profile!.metrics.durability) : "",
          visibility: d.profile!.visibility,
        }));
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const numOrU = (s: string) => (s.trim() && Number.isFinite(parseFloat(s)) ? parseFloat(s) : undefined);
    await fetch("/api/talent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sport: form.sport,
        sex: form.sex,
        age: parseInt(form.age, 10),
        visibility: form.visibility,
        metrics: { relStrength: numOrU(form.relStrength), vo2: numOrU(form.vo2), durability: numOrU(form.durability) },
      }),
    });
    load();
  };

  const search = async () => {
    const p = new URLSearchParams({ metric: q.metric, minPct: q.minPct, ...(q.sport ? { sport: q.sport } : {}), ...(q.byPotential ? { byPotential: "1" } : {}) });
    const res = await fetch(`/api/talent/search?${p.toString()}`);
    if (res.ok) setResults(((await res.json()) as { results: Result[] }).results);
  };

  // Flag a discoverable profile for the moderation queue.
  const flagProfile = async (id: string) => {
    const reason = prompt(t("w.teams.talent.reportPrompt"), "inappropriate");
    if (reason === null) return;
    await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetType: "talentProfile", targetId: id, reason: reason.trim().toLowerCase() }),
    });
    alert(t("w.teams.talent.reportThanks"));
  };

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;
  const kicker = (color: string): React.CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C(color) });
  const input: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: fs.body, padding: "9px 12px", borderRadius: 14, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, outline: "none" };
  const selectStyle: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: fs.body, padding: "9px 12px", borderRadius: 14, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, outline: "none", cursor: "pointer" };
  const btn: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.body, background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: "10px 18px", cursor: "pointer" };
  const chip = (color: string, label: React.ReactNode) => <span style={{ background: `color-mix(in srgb, ${C(color)} 14%, transparent)`, color: C(color), borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro, marginRight: 6, marginBottom: 4, display: "inline-block" }}>{label}</span>;

  return (
    <div style={{ display: "grid", gap: space.lg, fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ ...card, }}>
        <div style={kicker("violet")}>{t("w.teams.talent.headerKicker")}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, marginTop: 6, lineHeight: 1.5, color: C("chalk") }}>
          {t("w.teams.talent.headerBody")}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 6, color: C("ash") }}>
          {t("w.teams.talent.liveHpi")} {hpi ?? "—"}{report ? ` · ${t("w.teams.talent.model")} ${report.modelVersion}` : ""}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: space.lg }}>
        <div style={card}>
          <div style={kicker("ash")}>{t("w.teams.talent.yourProfile")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: space.sm, marginTop: 12 }}>
            <select value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })} style={selectStyle}>
              {SPORTS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })} style={selectStyle}>
              <option value="M">{t("w.teams.talent.male")}</option>
              <option value="F">{t("w.teams.talent.female")}</option>
            </select>
            <input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder={t("w.teams.talent.age")} inputMode="numeric" style={input} />
            <input value={form.relStrength} onChange={(e) => setForm({ ...form, relStrength: e.target.value })} placeholder={t("w.teams.talent.relStrength")} inputMode="decimal" style={input} />
            <input value={form.vo2} onChange={(e) => setForm({ ...form, vo2: e.target.value })} placeholder={t("w.teams.talent.vo2")} inputMode="decimal" style={input} />
            <input value={form.durability} onChange={(e) => setForm({ ...form, durability: e.target.value })} placeholder={t("w.teams.talent.durability")} inputMode="decimal" style={input} />
          </div>
          <label style={{ display: "flex", gap: space.sm, alignItems: "center", marginTop: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={form.visibility === "discoverable"} onChange={(e) => setForm({ ...form, visibility: e.target.checked ? "discoverable" : "private" })} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: form.visibility === "discoverable" ? C("lime") : C("ash") }}>{t("w.teams.talent.discoverable")}</span>
          </label>
          {profile?.visibility === "discoverable" && profile?.moderationStatus === "pending" && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginTop: 8, color: C("amber") }}>
              ⏳ {t("w.teams.talent.pendingReview")}
            </div>
          )}
          {profile?.moderationStatus === "rejected" && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginTop: 8, color: C("ash") }}>
              {t("w.teams.talent.rejected")}
            </div>
          )}
          <button onClick={save} style={{ ...btn, marginTop: 12 }}>{t("w.teams.talent.saveProfile")}</button>
        </div>

        <div style={card}>
          <div style={kicker("ash")}>{t("w.teams.talent.yourBenchmarks")}</div>
          {!report && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, marginTop: 12, color: C("ash") }}>{t("w.teams.talent.saveToSeePercentiles")}</div>}
          {report && (
            <>
              <div style={{ display: "flex", gap: space.sm, margin: "10px 0 14px" }}>
                {chip(pctColor(report.overall), `${t("w.teams.talent.overall")} ${report.overall}${t("w.teams.talent.ordinal")}`)}
                {chip(pctColor(report.potential), `${t("w.teams.talent.potential")} ${report.potential}${t("w.teams.talent.ordinal")}`)}
              </div>
              {report.benchmarks.map((b) => (
                <div key={b.metric} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("chalk") }}>{METRIC_LABEL[b.metric]}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{b.value} · {t("w.teams.talent.cohort")} {b.cohortMean}</span>
                  </div>
                  <div style={{ position: "relative", height: 8, borderRadius: 999, background: C("ink"), marginTop: 4, overflow: "hidden" }}>
                    <div style={{ width: `${b.potentialPercentile}%`, height: "100%", background: `color-mix(in srgb, ${C("violet")} 40%, transparent)`, position: "absolute" }} />
                    <div style={{ width: `${b.percentile}%`, height: "100%", background: C(pctColor(b.percentile)), position: "absolute" }} />
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{b.percentile}{t("w.teams.talent.ordinal")}{b.potentialPercentile > b.percentile ? ` · ${b.potentialPercentile}${t("w.teams.talent.ordinal")} ${t("w.teams.talent.potentialWord")}` : ""}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div style={{ ...card, }}>
        <div style={kicker("lime")}>{t("w.teams.talent.discoverTalent")}</div>
        <div style={{ display: "flex", gap: space.sm, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select value={q.sport} onChange={(e) => setQ({ ...q, sport: e.target.value })} style={selectStyle}>
            <option value="">{t("w.teams.talent.anySport")}</option>
            {SPORTS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={q.metric} onChange={(e) => setQ({ ...q, metric: e.target.value as BenchmarkMetric })} style={selectStyle}>
            {BENCHMARK_METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
          </select>
          <input value={q.minPct} onChange={(e) => setQ({ ...q, minPct: e.target.value })} placeholder={t("w.teams.talent.minPercentile")} inputMode="numeric" style={{ ...input, width: 120 }} />
          <label style={{ display: "flex", gap: space.xs, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={q.byPotential} onChange={(e) => setQ({ ...q, byPotential: e.target.checked })} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.teams.talent.byPotential")}</span>
          </label>
          <button onClick={search} style={btn}>{t("w.teams.talent.search")}</button>
        </div>
        <div style={{ marginTop: 14 }}>
          {results.length === 0 && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{t("w.teams.talent.noMatch")}</div>}
          {results.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C("line")}` }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("chalk") }}>{r.name} · {r.sport} · {r.sex}{r.age}</span>
              <div style={{ display: "flex", gap: space.xs, alignItems: "center" }}>
                {chip(pctColor(r.percentile), `${r.percentile}${t("w.teams.talent.ordinal")}`)}
                {r.potential > r.percentile && chip("violet", `${r.potential}${t("w.teams.talent.ordinal")} ${t("w.teams.talent.potAbbr")}`)}
                <button
                  onClick={() => flagProfile(r.id)}
                  title={t("w.teams.talent.reportTitle")}
                  style={{ background: "transparent", border: "none", color: C("ash"), cursor: "pointer", fontSize: fs.bodyLg, padding: "2px 4px" }}
                >
                  ⚑
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
