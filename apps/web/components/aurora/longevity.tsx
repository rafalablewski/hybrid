"use client";

import { useEffect, useState } from "react";
import { fs, space, longevityReport } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";

type ApiSignal = { kind: string; value: number; ts: string };

/** AURORA Longevity (web) — same longevityReport engine + Signal prefill as the
 *  classic, in the rounded Aurora style. */
export default function AuroraLongevity() {
  const { t } = useLang();
  const [f, setF] = useState({ age: "", restingHr: "", hrv: "", vo2: "", sleepH: "" });
  const C = (v: string) => `var(--color-${v})`;

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
  const deltaColor = report.delta <= 0 ? C("lime") : report.delta < 4 ? C("amber") : C("red");

  const fields: [keyof typeof f, string, string][] = [
    ["age", "w.recovery.longevity.fAge", "yr"], ["restingHr", "w.recovery.longevity.fRestingHr", "bpm"], ["hrv", "HRV", "ms"], ["vo2", "VO₂", "ml/kg/min"], ["sleepH", "w.recovery.longevity.fSleep", "h"],
  ];
  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 22 } as const;
  const input = { fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, padding: "12px 12px", borderRadius: 16, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, width: "100%", boxSizing: "border-box" as const };
  const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro }}>{label}</span>;

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{t("w.recovery.longevity.title")}</h1>
        <AuroraIcon name="heart" size={24} color={C("lime")} />
      </div>
      <p style={{ fontSize: fs.bodyLg, lineHeight: 1.5, color: C("ash"), marginTop: 8 }}>{t("w.recovery.longevity.intro")}</p>

      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.recovery.longevity.yourMarkers")}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 2 }}>{t("w.recovery.longevity.prefillNote")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: space.ms, marginTop: 12 }}>
          {fields.map(([k, label, unit]) => (
            <label key={k}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", display: "block", marginBottom: 4, color: C("ash") }}>{t(label)} ({unit})</span>
              <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} inputMode="decimal" placeholder="—" style={input} />
            </label>
          ))}
        </div>
      </div>

      {!hasMarkers ? (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.recovery.longevity.bioAge")}</div>
          <p style={{ fontSize: fs.bodyLg, lineHeight: 1.6, marginTop: 10 }}>{t("w.recovery.longevity.bioAgeEmpty")}</p>
        </div>
      ) : (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.recovery.longevity.bioAge")}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: space.md, margin: "6px 0", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900, fontSize: 48, color: deltaColor }}>{report.bioAge}</div>
            {chip(deltaColor, `${report.delta <= 0 ? "" : "+"}${report.delta} ${t("w.recovery.longevity.yrVsAge")}`)}
            {chip(C("lime"), `${t("w.recovery.longevity.healthspan")} ${report.healthspanScore}`)}
          </div>
          <div style={{ marginTop: 8 }}>
            {report.contributions.map((c) => (
              <div key={c.marker} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: `1px solid ${C("line")}` }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption }}>{c.marker} <span style={{ color: C("ash") }}>– {c.note}</span></span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: c.deltaYears <= 0 ? C("lime") : C("amber") }}>{c.deltaYears <= 0 ? "" : "+"}{c.deltaYears} yr</span>
              </div>
            ))}
          </div>
          {report.flags.length > 0 && <div style={{ marginTop: 8 }}>{report.flags.map((fl) => <div key={fl} style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("amber") }}>⚠ {fl}</div>)}</div>}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 10 }}>{t("w.recovery.longevity.model")} {report.modelVersion}</div>
        </div>
      )}
    </div>
  );
}
