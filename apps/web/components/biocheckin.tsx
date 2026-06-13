"use client";

import { useState } from "react";
import { INK2, LINE, LIME, CHALK, ASH, AMBER, BLUE, ON_ACCENT, disp, mono, Mono, Card } from "@/lib/ui";

// Manual readiness check-in. Writes HRV / resting HR / sleep to the Biometric
// table AND the Signal ontology (the path wearable sync will feed); readiness +
// the Athlete Twin recompute from it.
const FIELDS = [
  { key: "hrv", signal: "hrv", label: "HRV", unit: "ms", ph: "62", color: LIME },
  { key: "restingHr", signal: "restingHr", label: "Resting HR", unit: "bpm", ph: "54", color: BLUE },
  { key: "sleepH", signal: "sleep", label: "Sleep", unit: "h", ph: "7.5", color: AMBER },
] as const;

export default function BioCheckin({ onSaved }: { onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const save = async () => {
    setSaving(true);
    setDone(false);
    const payload: Record<string, number> = {};
    const signals: { key: string; signal: string; unit: string; value: number }[] = [];
    for (const f of FIELDS) {
      const n = parseFloat(vals[f.key] ?? "");
      if (Number.isFinite(n)) {
        payload[f.key] = n;
        signals.push({ key: f.key, signal: f.signal, unit: f.unit, value: n });
      }
    }
    const res = await fetch("/api/biometrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    // Mirror each reading into the Signal ontology (best-effort).
    await Promise.allSettled(
      signals.map((s) =>
        fetch("/api/signals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: s.signal, value: s.value, unit: s.unit, source: "manual" }),
        }),
      ),
    );
    setSaving(false);
    if (res.ok) {
      setDone(true);
      setVals({});
      onSaved();
    }
  };

  return (
    <Card span={2} style={{ borderLeft: `3px solid ${AMBER}` }}>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>
        Readiness check-in
      </Mono>
      <Mono s={{ fontSize: 12, display: "block", marginTop: 4 }}>
        Enter today&apos;s wearable readings — your readiness recomputes from them.
      </Mono>
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <Mono s={{ fontSize: 10, textTransform: "uppercase", display: "block", marginBottom: 4 }} c={f.color}>
              {f.label} ({f.unit})
            </Mono>
            <input
              value={vals[f.key] ?? ""}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.ph}
              inputMode="decimal"
              style={{ ...mono, fontSize: 15, width: 90, padding: "9px 11px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
            />
          </div>
        ))}
        <button
          onClick={save}
          disabled={saving}
          style={{ ...disp, fontWeight: 800, fontSize: 14, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 10, padding: "11px 20px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "…" : done ? "✓ Saved" : "Save"}
        </button>
      </div>
    </Card>
  );
}
