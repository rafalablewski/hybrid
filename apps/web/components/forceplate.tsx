"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { parseForcePlateCsv, type Signal } from "@hybrid/core";
import { fs, space,
  INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, ON_ACCENT,
  disp, cond, mono, tip, txt, Mono, Card, Chip, ChartFrame,
} from "@/lib/ui";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function ForcePlate() {
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

  const jumps = useMemo(
    () => signals.filter((s) => s.kind === "jumpHeight").sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)).map((s) => ({ date: fmt(s.ts), jh: s.value })),
    [signals],
  );

  const onFile = (file: File) => { const r = new FileReader(); r.onload = () => setCsv(String(r.result ?? "")); r.readAsText(file); };

  const doImport = async () => {
    if (!parsed || parsed.imported === 0) return;
    setImporting(true); setMsg(null);
    let ok = 0;
    for (const s of parsed.signals) {
      const res = await fetch("/api/signals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: s.kind, value: s.value, unit: s.unit, source: "forceplate", ts: s.ts }),
      });
      if (res.status === 401) { setMsg({ text: "Sign in to import.", ok: false }); setImporting(false); return; }
      if (res.ok) ok++;
    }
    setMsg({ text: `Imported ${ok} signal${ok === 1 ? "" : "s"} into your Performance State.`, ok: true });
    setCsv("");
    setImporting(false);
    load();
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <Card style={{ marginBottom: 16 }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>Import force-plate / jump CSV</Mono>
        <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block", margin: "8px 0 12px" }}>
          Drop a Hawkin / ForceDecks-style export. Recognized columns: jump height, asymmetry, body mass.
          Two shapes work — wide (a date column + metric columns) or long (date,metric,value,unit). Unknown
          columns are skipped, never guessed.
        </Mono>
        <div style={{ display: "flex", gap: space.sm, marginBottom: 8 }}>
          <label style={{ ...cond, fontSize: fs.caption, fontWeight: 700, textTransform: "uppercase", color: txt(LIME), background: `${LIME}1f`, border: `1px solid ${LIME}55`, borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}>
            Choose file
            <input type="file" accept=".csv,text/csv,text/plain" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </div>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="…or paste CSV here"
          rows={6}
          style={{ ...mono, fontSize: fs.body, width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none", resize: "vertical" }}
        />

        {parsed && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap", marginBottom: 6 }}>
              <Chip c={LIME}>{parsed.imported} signals from {parsed.rows} rows</Chip>
              {parsed.recognized.map((r) => <Chip key={r} c={BLUE}>{r}</Chip>)}
              {parsed.ignored.map((r) => <Chip key={r} c={ASH}>skipped: {r}</Chip>)}
            </div>
            {msg && <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 6 }} c={msg.ok ? LIME : RED}>{msg.text}</Mono>}
            <button onClick={doImport} disabled={importing || parsed.imported === 0}
              style={{ ...disp, fontWeight: 800, fontSize: fs.note, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 12, padding: "12px 24px", cursor: importing || !parsed.imported ? "default" : "pointer", opacity: importing || !parsed.imported ? 0.5 : 1 }}>
              {importing ? "Importing…" : `Import ${parsed.imported} signals →`}
            </button>
          </div>
        )}
      </Card>

      {jumps.length > 0 && (
        <ChartFrame title="Jump height" kicker="neuromuscular readiness" c={LIME}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={jumps} margin={{ left: -10, right: 8 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: ASH, fontSize: fs.micro }} stroke={LINE} />
              <YAxis unit="cm" tick={{ fill: ASH, fontSize: fs.micro }} stroke={LINE} domain={["dataMin - 2", "dataMax + 2"]} />
              <Tooltip contentStyle={tip} formatter={(v) => [`${v} cm`, "jump height"]} />
              <Line type="monotone" dataKey="jh" stroke={LIME} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 6 }}>
            A drop vs your baseline flags neuromuscular fatigue — this jump signal also feeds the Performance State injury-risk engine.
          </Mono>
        </ChartFrame>
      )}
    </div>
  );
}
