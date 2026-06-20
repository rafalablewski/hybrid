"use client";

import { useEffect, useState } from "react";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, ON_ACCENT, disp, mono, Mono, Card, Chip, Select } from "@/lib/ui";
import { METRIC_LABEL, BENCHMARK_METRICS, type BenchmarkMetric } from "@hybrid/core";
import { useIsMobile } from "@/lib/use-media-query";

type Bench = { metric: BenchmarkMetric; value: number; percentile: number; cohortMean: number; potentialPercentile: number };
type Report = { cohort: { sport: string; sex: string; age: number }; benchmarks: Bench[]; overall: number; potential: number; modelVersion: string };
type Profile = { sport: string; sex: string; age: number; visibility: string; metrics: Record<string, number>; moderationStatus?: string } | null;
type Result = { id: string; name: string; sport: string; age: number; sex: string; percentile: number; potential: number };

const SPORTS = ["Hyrox", "Triathlon", "Running", "Cycling", "Swimming", "Powerlifting", "Bodybuilding", "Hybrid"];
const pctColor = (p: number) => (p >= 90 ? LIME : p >= 70 ? BLUE : p >= 40 ? AMBER : ASH);

export default function Talent() {
  const [profile, setProfile] = useState<Profile>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [hpi, setHpi] = useState<number | null>(null);
  const [form, setForm] = useState({ sport: "Hybrid", sex: "M", age: "", relStrength: "", vo2: "", durability: "", visibility: "private" });

  // discovery
  const [q, setQ] = useState({ sport: "", metric: "hpi" as BenchmarkMetric, minPct: "80", byPotential: false });
  const [results, setResults] = useState<Result[]>([]);
  const isMobile = useIsMobile();

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
    const reason = prompt("Report this profile — reason? (inappropriate / fake / spam / other)", "inappropriate");
    if (reason === null) return;
    await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetType: "talentProfile", targetId: id, reason: reason.trim().toLowerCase() }),
    });
    alert("Thanks — our team will review it.");
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card style={{ borderLeft: `3px solid ${VIOLET}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>
          Talent Graph · benchmarks & discovery
        </Mono>
        <Mono s={{ fontSize: 13, display: "block", marginTop: 6, lineHeight: 1.5 }} c={CHALK}>
          Benchmark against your age/sex/sport cohort. Maturation-adjusted projection separates real
          talent from early physical maturity. Opt in to be discoverable — the talent market.
        </Mono>
        <Mono s={{ fontSize: 11, display: "block", marginTop: 6 }} c={ASH}>
          Live HPI from your Twin: {hpi ?? "—"}{report ? ` · model ${report.modelVersion}` : ""}
        </Mono>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <Card>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Your profile</Mono>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
            <Select value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })}>
              {SPORTS.map((s) => <option key={s}>{s}</option>)}
            </Select>
            <Select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </Select>
            <input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="Age" inputMode="numeric" style={input} />
            <input value={form.relStrength} onChange={(e) => setForm({ ...form, relStrength: e.target.value })} placeholder="Rel. strength (×BW)" inputMode="decimal" style={input} />
            <input value={form.vo2} onChange={(e) => setForm({ ...form, vo2: e.target.value })} placeholder="VO₂ proxy" inputMode="decimal" style={input} />
            <input value={form.durability} onChange={(e) => setForm({ ...form, durability: e.target.value })} placeholder="Durability" inputMode="decimal" style={input} />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={form.visibility === "discoverable"} onChange={(e) => setForm({ ...form, visibility: e.target.checked ? "discoverable" : "private" })} />
            <Mono s={{ fontSize: 12 }} c={form.visibility === "discoverable" ? LIME : ASH}>Discoverable by clubs &amp; federations</Mono>
          </label>
          {profile?.visibility === "discoverable" && profile?.moderationStatus === "pending" && (
            <Mono s={{ fontSize: 12, display: "block", marginTop: 8 }} c={AMBER}>
              ⏳ Pending review — your profile appears in discovery once a moderator approves it.
            </Mono>
          )}
          {profile?.moderationStatus === "rejected" && (
            <Mono s={{ fontSize: 12, display: "block", marginTop: 8 }} c={ASH}>
              This profile was not approved for discovery. Edit and re-save to request another review.
            </Mono>
          )}
          <button onClick={save} style={{ ...btn, marginTop: 12 }}>Save profile</button>
        </Card>

        <Card>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Your benchmarks</Mono>
          {!report && <Mono s={{ fontSize: 13, display: "block", marginTop: 12 }}>Save your profile to see percentiles.</Mono>}
          {report && (
            <>
              <div style={{ display: "flex", gap: 8, margin: "10px 0 14px" }}>
                <Chip c={pctColor(report.overall)}>overall {report.overall}th</Chip>
                <Chip c={pctColor(report.potential)}>potential {report.potential}th</Chip>
              </div>
              {report.benchmarks.map((b) => (
                <div key={b.metric} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <Mono s={{ fontSize: 12 }} c={CHALK}>{METRIC_LABEL[b.metric]}</Mono>
                    <Mono s={{ fontSize: 11 }} c={ASH}>{b.value} · cohort {b.cohortMean}</Mono>
                  </div>
                  <div style={{ position: "relative", height: 8, borderRadius: 4, background: INK2, marginTop: 4, overflow: "hidden" }}>
                    <div style={{ width: `${b.potentialPercentile}%`, height: "100%", background: `${VIOLET}55`, position: "absolute" }} />
                    <div style={{ width: `${b.percentile}%`, height: "100%", background: pctColor(b.percentile), position: "absolute" }} />
                  </div>
                  <Mono s={{ fontSize: 10 }} c={ASH}>{b.percentile}th{b.potentialPercentile > b.percentile ? ` · ${b.potentialPercentile}th potential` : ""}</Mono>
                </div>
              ))}
            </>
          )}
        </Card>
      </div>

      <Card style={{ borderLeft: `3px solid ${LIME}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>Discover talent</Mono>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Select value={q.sport} onChange={(e) => setQ({ ...q, sport: e.target.value })}>
            <option value="">Any sport</option>
            {SPORTS.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Select value={q.metric} onChange={(e) => setQ({ ...q, metric: e.target.value as BenchmarkMetric })}>
            {BENCHMARK_METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
          </Select>
          <input value={q.minPct} onChange={(e) => setQ({ ...q, minPct: e.target.value })} placeholder="min percentile" inputMode="numeric" style={{ ...input, width: 120 }} />
          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={q.byPotential} onChange={(e) => setQ({ ...q, byPotential: e.target.checked })} />
            <Mono s={{ fontSize: 12 }}>by potential</Mono>
          </label>
          <button onClick={search} style={btn}>Search</button>
        </div>
        <div style={{ marginTop: 14 }}>
          {results.length === 0 && <Mono s={{ fontSize: 13 }}>No discoverable athletes match yet.</Mono>}
          {results.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
              <Mono s={{ fontSize: 13 }} c={CHALK}>{r.name} · {r.sport} · {r.sex}{r.age}</Mono>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Chip c={pctColor(r.percentile)}>{r.percentile}th</Chip>
                {r.potential > r.percentile && <Chip c={VIOLET}>{r.potential}th pot.</Chip>}
                <button
                  onClick={() => flagProfile(r.id)}
                  title="Report this profile"
                  style={{ background: "transparent", border: "none", color: ASH, cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
                >
                  ⚑
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

const input: React.CSSProperties = { ...mono, fontSize: 13, padding: "8px 10px", borderRadius: 9, background: INK2, color: CHALK, border: `1px solid ${LINE}` };
const btn: React.CSSProperties = { ...disp, fontWeight: 800, fontSize: 13, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 9, padding: "9px 16px", cursor: "pointer" };
