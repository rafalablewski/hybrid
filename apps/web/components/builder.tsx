"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionBlock, StrengthSet } from "@hybrid/core";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, RED, disp, cond, mono, Mono, Card } from "@/lib/ui";

const CATALOG = ["Back Squat", "Front Squat", "Deadlift", "Bench Press", "Overhead Press", "Barbell Row", "Romanian Deadlift", "Pull-up", "Power Clean"];
type EditableBlock = SessionBlock & { uid: string };
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));
const input = { ...mono, fontSize: 14, background: INK2, color: CHALK, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", outline: "none" } as const;

type Template = { id: string; name: string; description: string | null; blocks: SessionBlock[]; createdAt: string };

export default function Builder() {
  const [name, setName] = useState("New workout");
  const [description, setDescription] = useState("");
  const [blocks, setBlocks] = useState<EditableBlock[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/templates");
      setTemplates(res.ok ? ((await res.json()) as { templates?: Template[] }).templates ?? [] : []);
    } catch { setTemplates([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const addStrength = () => setBlocks((b) => [...b, { uid: uid(), kind: "strength", name: "Back Squat", sets: [{ load: "", reps: "", rpe: "" }] }]);
  const addCond = () => setBlocks((b) => [...b, { uid: uid(), kind: "conditioning", name: "Row Intervals", minutes: 12, rpe: 8 }]);
  const removeBlock = (u: string) => setBlocks((bs) => bs.filter((b) => b.uid !== u));
  const duplicate = (u: string) => setBlocks((bs) => {
    const i = bs.findIndex((b) => b.uid === u);
    if (i < 0) return bs;
    const copy = { ...structuredClone(bs[i]!), uid: uid() } as EditableBlock;
    return [...bs.slice(0, i + 1), copy, ...bs.slice(i + 1)];
  });
  const move = (u: string, dir: -1 | 1) => setBlocks((bs) => {
    const i = bs.findIndex((b) => b.uid === u);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= bs.length) return bs;
    const next = [...bs];
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next;
  });
  const patch = (u: string, fn: (b: EditableBlock) => EditableBlock) => setBlocks((bs) => bs.map((b) => (b.uid === u ? fn(b) : b)));
  const rename = (u: string, name: string) => patch(u, (b) => ({ ...b, name } as EditableBlock));
  const updateSet = (u: string, i: number, k: keyof StrengthSet, v: string) =>
    patch(u, (b) => (b.kind === "strength" ? { ...b, sets: b.sets.map((s, j) => (j === i ? ({ ...s, [k]: v } as StrengthSet) : s)) } : b));
  const addSet = (u: string) => patch(u, (b) => (b.kind === "strength" ? { ...b, sets: [...b.sets, { load: "", reps: "", rpe: "" }] } : b));
  const removeSet = (u: string, i: number) => patch(u, (b) => (b.kind === "strength" ? { ...b, sets: b.sets.filter((_, j) => j !== i) } : b));
  const setCond = (u: string, k: "minutes" | "rpe", v: number) =>
    patch(u, (b) => (b.kind === "conditioning" ? ({ ...b, [k]: v } as EditableBlock) : b));

  const loadTemplate = (t: Template) => {
    setName(t.name);
    setDescription(t.description ?? "");
    setBlocks(t.blocks.map((b) => ({ ...structuredClone(b), uid: uid() }) as EditableBlock));
    setMsg(null);
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Workout", description, blocks: blocks.map(({ uid: _u, ...b }) => b) }),
      });
      if (res.status === 401) { setMsg({ text: "Sign in to save templates.", ok: false }); setSaving(false); return; }
      if (!res.ok) { setMsg({ text: `Couldn't save (HTTP ${res.status}). The WorkoutTemplate table may need creating — run reference/sql-workout-builder.sql.`, ok: false }); setSaving(false); return; }
      setMsg({ text: "Template saved.", ok: true });
      await load();
    } catch { setMsg({ text: "Network error.", ok: false }); }
    setSaving(false);
  };

  const del = async (id: string) => { await fetch(`/api/templates/${id}`, { method: "DELETE" }); load(); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, alignItems: "start" }}>
      <div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workout name"
          style={{ ...input, ...disp, fontSize: 20, fontWeight: 800, width: "100%", boxSizing: "border-box", marginBottom: 8 }} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)"
          style={{ ...input, width: "100%", boxSizing: "border-box", marginBottom: 14 }} />

        {blocks.length === 0 && (
          <Card style={{ textAlign: "center", padding: 32, marginBottom: 12 }}>
            <Mono s={{ fontSize: 13 }}>Empty workout — add blocks below, or load a template.</Mono>
          </Card>
        )}

        {blocks.map((b, idx) => (
          <Card key={b.uid} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <Mono s={{ fontSize: 10, textTransform: "uppercase" }} c={b.kind === "strength" ? LIME : BLUE}>{b.kind}</Mono>
              <input list="builder-catalog" value={b.name} onChange={(e) => rename(b.uid, e.target.value)} style={{ ...input, ...disp, fontWeight: 700, flex: 1 }} />
              <button onClick={() => move(b.uid, -1)} disabled={idx === 0} style={iconBtn(ASH)}>↑</button>
              <button onClick={() => move(b.uid, 1)} disabled={idx === blocks.length - 1} style={iconBtn(ASH)}>↓</button>
              <button onClick={() => duplicate(b.uid)} style={iconBtn(BLUE)}>⧉</button>
              <button onClick={() => removeBlock(b.uid)} style={iconBtn(RED)}>✕</button>
            </div>
            {b.kind === "strength" ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 28px", gap: 6, marginBottom: 4 }}>
                  {["load", "reps", "rpe", "m/s", ""].map((h) => <Mono key={h} s={{ fontSize: 10, textTransform: "uppercase" }}>{h}</Mono>)}
                </div>
                {b.sets.map((s, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 28px", gap: 6, marginBottom: 6 }}>
                    <input value={s.load} onChange={(e) => updateSet(b.uid, i, "load", e.target.value)} placeholder="100" style={input} />
                    <input value={s.reps} onChange={(e) => updateSet(b.uid, i, "reps", e.target.value)} placeholder="5" style={input} />
                    <input value={s.rpe ?? ""} onChange={(e) => updateSet(b.uid, i, "rpe", e.target.value)} placeholder="8" style={input} />
                    <input value={s.vel ?? ""} onChange={(e) => updateSet(b.uid, i, "vel", e.target.value)} placeholder="0.50" style={input} />
                    <button onClick={() => removeSet(b.uid, i)} style={{ ...iconBtn(ASH), padding: 0 }}>−</button>
                  </div>
                ))}
                <button onClick={() => addSet(b.uid)} style={smallBtn(ASH)}>+ set</button>
              </>
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Mono s={{ fontSize: 11 }}>minutes</Mono>
                <input value={String(b.minutes ?? "")} onChange={(e) => setCond(b.uid, "minutes", Number(e.target.value) || 0)} style={{ ...input, width: 70 }} />
                <Mono s={{ fontSize: 11 }}>rpe</Mono>
                <input value={String(b.rpe ?? "")} onChange={(e) => setCond(b.uid, "rpe", Number(e.target.value) || 0)} style={{ ...input, width: 70 }} />
              </div>
            )}
          </Card>
        ))}

        <datalist id="builder-catalog">{CATALOG.map((c) => <option key={c} value={c} />)}</datalist>

        <div style={{ display: "flex", gap: 8, marginTop: 4, marginBottom: 14 }}>
          <button onClick={addStrength} style={smallBtn(LIME)}>+ Strength</button>
          <button onClick={addCond} style={smallBtn(BLUE)}>+ Conditioning</button>
        </div>

        {msg && <Mono s={{ fontSize: 12, display: "block", marginBottom: 10 }} c={msg.ok ? LIME : RED}>{msg.text}</Mono>}
        <button onClick={save} disabled={saving || blocks.length === 0}
          style={{ ...disp, fontWeight: 800, fontSize: 15, background: LIME, color: "#0c0d0c", border: "none", borderRadius: 12, padding: "13px 26px", cursor: saving || !blocks.length ? "default" : "pointer", opacity: saving || !blocks.length ? 0.5 : 1 }}>
          {saving ? "Saving…" : "Save as template →"}
        </button>
      </div>

      {/* template library */}
      <Card>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Template library</Mono>
        {templates.length === 0 ? (
          <Mono s={{ fontSize: 13, display: "block", marginTop: 10 }}>No templates yet. Build one and save it.</Mono>
        ) : (
          templates.map((t) => (
            <div key={t.id} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
              <div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{t.name}</div>
              <Mono s={{ fontSize: 11 }}>{t.blocks.length} blocks{t.description ? ` · ${t.description}` : ""}</Mono>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button onClick={() => loadTemplate(t)} style={smallBtn(LIME)}>Load</button>
                <button onClick={() => del(t.id)} style={smallBtn(ASH)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function smallBtn(c: string) {
  return { ...cond, fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".04em", color: c, background: `${c}1f`, border: `1px solid ${c}55`, borderRadius: 8, padding: "6px 12px", cursor: "pointer" };
}
function iconBtn(c: string) {
  return { ...cond, fontSize: 13, fontWeight: 700, color: c, background: "transparent", border: `1px solid ${c}55`, borderRadius: 8, width: 30, height: 30, cursor: "pointer" };
}
