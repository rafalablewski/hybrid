"use client";

import { useState } from "react";
import { INK2, LINE, LIME, CHALK, ASH, AMBER, BLUE, disp, mono, Mono, Card } from "@/lib/ui";

// Manual readiness check-in. Feeds HRV / resting HR / sleep into the Biometric
// table; readiness recomputes from it. Wearable sync (HealthKit/WHOOP) replaces
// the inputs later without changing the engine.
const FIELDS = [
  { key: "hrv", label: "HRV", unit: "ms", ph: "62", color: LIME },
  { key: "restingHr", label: "Resting HR", unit: "bpm", ph: "54", color: BLUE },
  { key: "sleepH", label: "Sleep", unit: "h", ph: "7.5", color: AMBER },
] as const;

export default function BioCheckin({ onSaved }: { onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const save = async () => {
    setSaving(true);
    setDone(false);
    const payload: Record<string, number> = {};
    for (const f of FIELDS) {
      const n = parseFloat(vals[f.key] ?? "");
      if (Number.isFinite(n)) payload[f.key] = n;
    }
    const res = await fetch("/api/biometrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
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
          style={{ ...disp, fontWeight: 800, fontSize: 14, background: LIME, color: "#0c0d0c", border: "none", borderRadius: 10, padding: "11px 20px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "…" : done ? "✓ Saved" : "Save"}
        </button>
      </div>
    </Card>
  );
}
