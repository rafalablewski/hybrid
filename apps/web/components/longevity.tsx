"use client";

import { useEffect, useState } from "react";
import { fs, space, INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, disp, mono, Mono, Card, Chip } from "@/lib/ui";
import { longevityReport } from "@hybrid/core";
import { useIsMobile } from "@/lib/use-media-query";

type ApiSignal = { kind: string; value: number; ts: string };

const deltaColor = (d: number) => (d <= -3 ? LIME : d < 1 ? BLUE : d < 4 ? AMBER : RED);

export default function Longevity() {
  const isMobile = useIsMobile();
  const [f, setF] = useState({ age: "", restingHr: "", hrv: "", vo2: "", sleepH: "" });

  // prefill recovery markers from the latest signals
  useEffect(() => {
    fetch("/api/signals").then(async (r) => {
      if (!r.ok) return;
      const { signals } = (await r.json()) as { signals: ApiSignal[] };
      const latest = (kind: string) => signals.find((s) => s.kind === kind)?.value;
      setF((prev) => ({
        ...prev,
        restingHr: latest("restingHr") != null ? String(latest("restingHr")) : prev.restingHr,
        hrv: latest("hrv") != null ? String(latest("hrv")) : prev.hrv,
        sleepH: latest("sleep") != null ? String(Math.round(latest("sleep")! * 10) / 10) : prev.sleepH,
      }));
    });
  }, []);

  const num = (s: string) => (s.trim() && Number.isFinite(parseFloat(s)) ? parseFloat(s) : undefined);
  const age = num(f.age) ?? 35;
  const markers = { restingHr: num(f.restingHr), hrv: num(f.hrv), vo2: num(f.vo2), sleepH: num(f.sleepH) };
  const hasMarkers = Object.values(markers).some((v) => v !== undefined);
  const report = longevityReport({ age, ...markers });

  const fields: [keyof typeof f, string, string][] = [
    ["age", "Age", "yr"],
    ["restingHr", "Resting HR", "bpm"],
    ["hrv", "HRV", "ms"],
    ["vo2", "VO₂", "ml/kg/min"],
    ["sleepH", "Sleep", "h"],
  ];

  return (
    <div style={{ display: "grid", gap: space.lg }}>
      <Card style={{ borderLeft: `3px solid ${VIOLET}` }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>
          Performance medicine · healthspan
        </Mono>
        <Mono s={{ fontSize: fs.body, display: "block", marginTop: 6, lineHeight: 1.5 }} c={CHALK}>
          The same recovery signals that drive readiness also predict healthspan. Estimate biological
          age vs chronological from resting HR, HRV, VO₂ and sleep. Heuristic v0 — not a diagnostic.
        </Mono>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: space.lg }}>
        <Card>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }}>Markers</Mono>
          <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 2 }} c={ASH}>recovery markers prefilled from your latest signals when available</Mono>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: space.sm, marginTop: 12 }}>
            {fields.map(([k, label, unit]) => (
              <label key={k}>
                <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", display: "block", marginBottom: 4 }} c={ASH}>{label} ({unit})</Mono>
                <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} inputMode="decimal" style={input} />
              </label>
            ))}
          </div>
        </Card>

        {!hasMarkers ? (
          <Card style={{ borderLeft: `3px solid ${BLUE}` }}>
            <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>Biological age</Mono>
            <Mono s={{ fontSize: fs.body, display: "block", marginTop: 10, lineHeight: 1.6 }} c={CHALK}>
              Enter at least one recovery marker (resting HR, HRV, VO₂ or sleep) — or connect a wearable —
              and your biological-age estimate appears here. Nothing is pre-filled.
            </Mono>
          </Card>
        ) : (
        <Card style={{ borderLeft: `3px solid ${deltaColor(report.delta)}` }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>Biological age</Mono>
          <div style={{ display: "flex", alignItems: "baseline", gap: space.md, margin: "6px 0" }}>
            <div style={{ ...disp, fontWeight: 900, fontSize: 48, color: deltaColor(report.delta) }}>{report.bioAge}</div>
            <Chip c={deltaColor(report.delta)}>{report.delta <= 0 ? `${report.delta}` : `+${report.delta}`} yr vs age</Chip>
            <Chip c={ASH}>healthspan {report.healthspanScore}</Chip>
          </div>
          <div style={{ marginTop: 8 }}>
            {report.contributions.map((c) => (
              <div key={c.marker} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <Mono s={{ fontSize: fs.caption }} c={CHALK}>{c.marker} <span style={{ color: ASH }}>· {c.note}</span></Mono>
                <Mono s={{ fontSize: fs.caption }} c={c.deltaYears <= 0 ? LIME : AMBER}>{c.deltaYears <= 0 ? "" : "+"}{c.deltaYears} yr</Mono>
              </div>
            ))}
          </div>
          {report.flags.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {report.flags.map((fl) => <Mono key={fl} s={{ fontSize: fs.micro, display: "block" }} c={AMBER}>⚠ {fl}</Mono>)}
            </div>
          )}
          <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 10 }} c={ASH}>model {report.modelVersion}</Mono>
        </Card>
        )}
      </div>
    </div>
  );
}

const input: React.CSSProperties = { ...mono, fontSize: fs.bodyLg, padding: "8px 10px", borderRadius: 9, background: INK2, color: CHALK, border: `1px solid ${LINE}`, width: "100%" };
