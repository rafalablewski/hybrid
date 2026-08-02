"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { parseForcePlateCsv, type Signal } from "@hybrid/core";
import { fs, space, LINE, LINE_HEX, LIME, LIME_HEX, ASH, tip } from "@/lib/ui";
import { useLang } from "@/lib/i18n";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.nano }}>{label}</span>;

/** AURORA Force plate (web) — CSV import into the Signal ontology + jump-height
 *  trend, reusing the exact parseForcePlateCsv + /api/signals flow. */
export default function AuroraForcePlate() {
  const { t } = useLang();
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/signals");
      if (!res.ok) return setSignals([]);
      const d = (await res.json()) as { signals?: { userId: string; kind: string; value: number; unit: string; source: string; ts: string }[] };
      setSignals((d.signals ?? []).map((s) => ({ athleteId: s.userId, kind: s.kind as Signal["kind"], value: s.value, unit: s.unit, source: s.source, ts: s.ts })));
    } catch { setSignals([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const parsed = useMemo(() => (csv.trim() ? parseForcePlateCsv(csv, { athleteId: "" }) : null), [csv]);
  const jumps = useMemo(() => signals.filter((s) => s.kind === "jumpHeight").sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)).map((s) => ({ date: fmt(s.ts), jh: s.value })), [signals]);
  const onFile = (file: File) => { const r = new FileReader(); r.onload = () => setCsv(String(r.result ?? "")); r.readAsText(file); };

  const doImport = async () => {
    if (!parsed || parsed.imported === 0) return;
    setImporting(true); setMsg(null);
    let ok = 0;
    for (const s of parsed.signals) {
      const res = await fetch("/api/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: s.kind, value: s.value, unit: s.unit, source: "forceplate", ts: s.ts }) });
      if (res.status === 401) { setMsg({ text: t("w.analyze.fp.signInImport"), ok: false }); setImporting(false); return; }
      if (res.ok) ok++;
    }
    setMsg({ text: `${t("w.analyze.fp.importedPre")} ${ok} ${ok === 1 ? t("w.analyze.fp.signal") : t("w.analyze.fp.signals")} ${t("w.analyze.fp.importedTail")}`, ok: true });
    setCsv(""); setImporting(false); load();
  };

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: "0 0 16px" }}>{t("w.analyze.fp.title")}</h1>
      <div style={card}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.analyze.fp.importTitle")}</div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, lineHeight: 1.6, margin: "8px 0 12px", color: C("ash") }}>{t("w.analyze.fp.importBody")}</p>
        <div style={{ display: "flex", gap: space.sm, marginBottom: 8 }}>
          <label style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, textTransform: "uppercase", color: C("lime"), background: `color-mix(in srgb, ${C("lime")} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${C("lime")} 40%, transparent)`, borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}>
            {t("w.analyze.fp.chooseFile")}<input type="file" accept=".csv,text/csv,text/plain" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </div>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={t("w.analyze.fp.pasteCsv")} rows={6}
          style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 16, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, outline: "none", resize: "vertical" }} />
        {parsed && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap", marginBottom: 8 }}>
              {chip(C("lime"), `${parsed.imported} ${t("w.analyze.fp.signalsFromPre")} ${parsed.rows} ${t("w.analyze.fp.rows")}`)}
              {parsed.recognized.map((r) => <span key={r}>{chip(C("ash"), r)}</span>)}
              {parsed.ignored.map((r) => <span key={r}>{chip(C("ash"), `${t("w.analyze.fp.skipped")} ${r}`)}</span>)}
            </div>
            {msg && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginBottom: 6, color: msg.ok ? C("lime") : C("red") }}>{msg.text}</div>}
            <button onClick={doImport} disabled={importing || parsed.imported === 0} style={{ fontWeight: 700, fontSize: fs.note, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "12px 24px", cursor: importing || !parsed.imported ? "default" : "pointer", opacity: importing || !parsed.imported ? 0.5 : 1 }}>{importing ? t("w.analyze.fp.importing") : `${t("w.analyze.fp.importPre")} ${parsed.imported} ${t("w.analyze.fp.importTail")}`}</button>
          </div>
        )}
      </div>

      {jumps.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime"), marginBottom: 10 }}>{t("w.analyze.fp.jumpTitle")}</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={jumps} margin={{ left: -10, right: 8 }}><CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fill: ASH, fontSize: fs.micro }} stroke={LINE_HEX} /><YAxis unit="cm" tick={{ fill: ASH, fontSize: fs.micro }} stroke={LINE_HEX} domain={["dataMin - 2", "dataMax + 2"]} /><Tooltip contentStyle={tip} formatter={(v) => [`${v} cm`, t("w.analyze.fp.jumpLabel")]} /><Line type="monotone" dataKey="jh" stroke={LIME_HEX} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} /></LineChart>
          </ResponsiveContainer>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 6, color: C("ash") }}>{t("w.analyze.fp.jumpNote")}</div>
        </div>
      )}
    </div>
  );
}
