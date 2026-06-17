"use client";

import { useCallback, useEffect, useState } from "react";
import { ALL_MUSCLES } from "@hybrid/core";
import { INK2, LINE, LIME, CHALK, ASH, VIOLET, RED, ON_ACCENT, disp, cond, mono, Mono, Card } from "@/lib/ui";

// Athlete+ "My exercises": create your OWN movements (POST /api/user-exercises).
// They flow into the logger + builder picker automatically (GET /api/exercises
// returns the caller's own exercises). Free users see an upgrade nudge instead.
const PATTERNS = ["squat", "hinge", "push", "pull", "lunge", "carry", "core", "cond"] as const;
const input = { ...mono, fontSize: 13, background: INK2, color: CHALK, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", outline: "none", width: "100%", boxSizing: "border-box" } as const;

type Mine = { id: string; name: string; pattern: string; muscles: string[]; kind: string };

export default function CustomExercises({ onUpgrade }: { onUpgrade?: () => void }) {
  const [mine, setMine] = useState<Mine[]>([]);
  const [canCreate, setCanCreate] = useState(true);
  const [name, setName] = useState("");
  const [pattern, setPattern] = useState<string>("push");
  const [kind, setKind] = useState("strength");
  const [muscles, setMuscles] = useState<string[]>([]);
  const [equipment, setEquipment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/user-exercises");
      if (!res.ok) return;
      const j = (await res.json()) as { exercises?: Mine[]; canCreate?: boolean };
      setMine(j.exercises ?? []);
      setCanCreate(j.canCreate !== false);
    } catch { /* degrade silently */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleMuscle = (m: string) => setMuscles((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  const create = async () => {
    if (!name.trim() || muscles.length === 0) { setMsg({ text: "Name and at least one muscle are required.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/user-exercises", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), pattern, kind, muscles, equipment: equipment.split(",").map((s) => s.trim()).filter(Boolean) }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 403) { setMsg({ text: j.error ?? "Custom exercises are part of Full.", ok: false }); setCanCreate(false); setBusy(false); return; }
      if (!res.ok) { setMsg({ text: j.error ?? `Couldn't save (HTTP ${res.status}).`, ok: false }); setBusy(false); return; }
      setMsg({ text: `Added "${name.trim()}" — it's now in your logger & builder picker.`, ok: true });
      setName(""); setMuscles([]); setEquipment("");
      await load();
    } catch { setMsg({ text: "Network error — try again.", ok: false }); }
    setBusy(false);
  };

  const del = async (id: string) => { await fetch(`/api/user-exercises/${id}`, { method: "DELETE" }); load(); };

  return (
    <Card style={{ marginTop: 16 }}>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>My exercises</Mono>

      {!canCreate ? (
        <>
          <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block", marginTop: 10 }} c={CHALK}>
            Add your own movements — they show up in your logger &amp; builder picker. It&apos;s part of Full.
          </Mono>
          {onUpgrade && (
            <button onClick={onUpgrade} style={{ ...mono, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: ON_ACCENT, background: LIME, border: "none", borderRadius: 10, padding: "9px 16px", cursor: "pointer", marginTop: 10 }}>
              Unlock Full →
            </button>
          )}
        </>
      ) : (
        <>
          <Mono s={{ fontSize: 12, display: "block", margin: "8px 0 10px" }}>Add a movement we don&apos;t have — it joins your picker everywhere.</Mono>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Exercise name (e.g. Spoto Press)" style={input} />
            <div style={{ display: "flex", gap: 8 }}>
              <select value={pattern} onChange={(e) => setPattern(e.target.value)} style={{ ...input, flex: 1 }}>
                {PATTERNS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ ...input, flex: 1 }}>
                <option value="strength">strength</option>
                <option value="conditioning">conditioning</option>
              </select>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ALL_MUSCLES.map((m) => (
                <button key={m} onClick={() => toggleMuscle(m)}
                  style={{ ...cond, fontSize: 11, padding: "5px 10px", borderRadius: 999, cursor: "pointer", border: `1px solid ${muscles.includes(m) ? LIME : LINE}`, background: muscles.includes(m) ? `${LIME}22` : "transparent", color: muscles.includes(m) ? LIME : ASH }}>
                  {m}
                </button>
              ))}
            </div>
            <input value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Equipment (comma-separated, optional)" style={input} />
            {msg && <Mono s={{ fontSize: 12, display: "block" }} c={msg.ok ? LIME : RED}>{msg.text}</Mono>}
            <button onClick={create} disabled={busy}
              style={{ ...disp, fontWeight: 800, fontSize: 14, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 10, padding: "10px 18px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, alignSelf: "flex-start" }}>
              {busy ? "Adding…" : "Add exercise →"}
            </button>
          </div>
        </>
      )}

      {mine.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {mine.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, marginTop: 8, borderTop: `1px solid ${LINE}` }}>
              <div>
                <div style={{ ...disp, fontWeight: 700, fontSize: 14 }}>{m.name}</div>
                <Mono s={{ fontSize: 11 }} c={ASH}>{m.pattern} · {m.kind} · {m.muscles.join(", ")}</Mono>
              </div>
              <button onClick={() => del(m.id)} style={{ ...cond, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: ASH, background: `${ASH}1f`, border: `1px solid ${ASH}55`, borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
