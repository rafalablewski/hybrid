"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionBlock } from "@hybrid/core";
import { INK2, LINE, LIME, CHALK, ASH, VIOLET, RED, ON_ACCENT, disp, cond, mono, Mono, Card } from "@/lib/ui";
import WorkoutBlocks, { uid, type EditableBlock } from "@/components/workout-blocks";
import { useIsMobile } from "@/lib/use-media-query";

const input = { ...mono, fontSize: 14, background: INK2, color: CHALK, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", outline: "none", minWidth: 0, boxSizing: "border-box" } as const;

type Template = { id: string; name: string; description: string | null; blocks: SessionBlock[]; createdAt: string };

export default function Builder() {
  const isMobile = useIsMobile();
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
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 16, alignItems: "start" }}>
      <div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workout name"
          style={{ ...input, ...disp, fontSize: 20, fontWeight: 800, width: "100%", marginBottom: 8 }} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)"
          style={{ ...input, width: "100%", marginBottom: 14 }} />

        <WorkoutBlocks
          blocks={blocks}
          setBlocks={setBlocks}
          emptyHint="Empty workout — add blocks below, or load a template."
          reorder
        />

        {msg && <Mono s={{ fontSize: 12, display: "block", marginBottom: 10 }} c={msg.ok ? LIME : RED}>{msg.text}</Mono>}
        <button onClick={save} disabled={saving || blocks.length === 0}
          style={{ ...disp, fontWeight: 800, fontSize: 15, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 12, padding: "13px 26px", cursor: saving || !blocks.length ? "default" : "pointer", opacity: saving || !blocks.length ? 0.5 : 1 }}>
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
