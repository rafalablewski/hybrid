"use client";

import { useCallback, useEffect, useState } from "react";
import { fs, space, canSaveRoutine, FUNNEL } from "@hybrid/core";

import type { SessionBlock } from "@hybrid/core";
import WorkoutBlocks, { uid, type EditableBlock } from "@/components/workout-blocks";
import { useIsMobile } from "@/lib/use-media-query";
import { useLang } from "@/lib/i18n";
import { usePersona } from "@/lib/persona";
import { track } from "@/lib/track";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;
const input = { fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "12px 14px", outline: "none", minWidth: 0, boxSizing: "border-box" } as const;

type Template = { id: string; name: string; description: string | null; blocks: SessionBlock[]; createdAt: string };

/** AURORA Builder (web) — workout template editor + library, reusing the exact
 *  WorkoutBlocks editor and /api/templates persistence. */
export default function AuroraBuilder({ onUpgrade }: { onUpgrade?: () => void }) {
  const { t: tr } = useLang();
  // Building is free; SAVING a reusable routine is Full (canSaveRoutine).
  const allowedSave = canSaveRoutine(usePersona());
  const goUpgrade = () => { track(FUNNEL.upgradeEntryClick, { client: "web", source: "builder-save" }); onUpgrade?.(); };
  const [name, setName] = useState(() => tr("w.train.builder.newWorkout"));
  const [description, setDescription] = useState("");
  const [blocks, setBlocks] = useState<EditableBlock[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const isMobile = useIsMobile();

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
        body: JSON.stringify({ name: name.trim() || tr("w.train.builder.defaultWorkout"), description, blocks: blocks.map(({ uid: _u, ...b }) => b) }),
      });
      if (res.status === 401) { setMsg({ text: tr("w.train.builder.signInSave"), ok: false }); setSaving(false); return; }
      if (res.status === 403) { setSaving(false); goUpgrade(); return; }
      if (!res.ok) { setMsg({ text: `${tr("w.train.builder.saveErrorPrefix")}${res.status}${tr("w.train.builder.saveErrorSuffix")}`, ok: false }); setSaving(false); return; }
      setMsg({ text: tr("w.train.builder.templateSaved"), ok: true });
      await load();
    } catch { setMsg({ text: tr("w.train.builder.networkError"), ok: false }); }
    setSaving(false);
  };

  const del = async (id: string) => { await fetch(`/api/templates/${id}`, { method: "DELETE" }); load(); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: space.lg, alignItems: "start", maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("w.train.builder.workoutNamePh")}
          style={{ ...input, fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, width: "100%", marginBottom: 8 }} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={tr("w.train.builder.descriptionPh")}
          style={{ ...input, width: "100%", marginBottom: 14 }} />

        <WorkoutBlocks
          blocks={blocks}
          setBlocks={setBlocks}
          emptyHint={tr("w.train.builder.emptyHint")}
          reorder
        />

        {msg && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginBottom: 10, color: msg.ok ? C("lime") : C("red") }}>{msg.text}</div>}
        {allowedSave ? (
          <button onClick={save} disabled={saving || blocks.length === 0}
            style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.note, background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: "14px 28px", cursor: saving || !blocks.length ? "default" : "pointer", opacity: saving || !blocks.length ? 0.5 : 1 }}>
            {saving ? tr("w.train.builder.saving") : tr("w.train.builder.saveAsTemplate")}
          </button>
        ) : (
          // Free user — saving a routine is Full. Building/previewing stays free.
          <div style={{ border: `1px solid color-mix(in srgb, ${C("lime")} 45%, transparent)`, background: `color-mix(in srgb, ${C("lime")} 8%, transparent)`, borderRadius: 16, padding: 14 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--lime-text)" }}>✦ {tr("w.train.logger.routineFullTitle")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 6, lineHeight: 1.5 }}>{tr("w.train.logger.routineFullBlurb")}</div>
            <button onClick={goUpgrade} style={{ marginTop: 12, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.note, background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: "12px 24px", cursor: "pointer" }}>{tr("w.train.logger.routineUnlock")}</button>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{tr("w.train.builder.templateLibrary")}</div>
        {templates.length === 0 ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, marginTop: 10, color: C("ash") }}>{tr("w.train.builder.noTemplates")}</div>
        ) : (
          templates.map((t) => (
            <div key={t.id} style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
              <div style={{ fontWeight: 700, fontSize: fs.note }}>{t.name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{t.blocks.length} {tr("w.train.builder.blocks")}{t.description ? ` · ${t.description}` : ""}</div>
              <div style={{ display: "flex", gap: space.sm, marginTop: 8 }}>
                <button onClick={() => loadTemplate(t)} style={smallBtn("lime")}>{tr("w.train.builder.load")}</button>
                <button onClick={() => del(t.id)} style={smallBtn("ash")}>{tr("w.train.builder.delete")}</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function smallBtn(token: string): React.CSSProperties {
  const c = C(token);
  return { fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`, borderRadius: 999, padding: "7px 14px", cursor: "pointer" };
}
