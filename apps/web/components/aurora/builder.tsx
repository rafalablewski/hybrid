"use client";

import { useCallback, useEffect, useState } from "react";
import { fs, space, canSaveRoutine, isFullAccess, FREE_TEMPLATE_LIMIT, FUNNEL, sessionSignal, fmtTonnage } from "@hybrid/core";

import type { SessionBlock, WeightUnit } from "@hybrid/core";
import WorkoutBlocks, { uid, type EditableBlock } from "@/components/workout-blocks";
import { MetaLine } from "./meta";
import { useIsMobile } from "@/lib/use-media-query";
import { useLang } from "@/lib/i18n";
import { useBodyweight } from "@/lib/use-bodyweight";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { usePersona } from "@/lib/persona";
import { track } from "@/lib/track";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
const input = { fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 14px", outline: "none", minWidth: 0, boxSizing: "border-box" } as const;

type Template = { id: string; name: string; description: string | null; blocks: SessionBlock[]; createdAt: string };

/** AURORA Builder (web) — the SIGNAL BOARD workout editor: a live session
 *  pulse (est. duration, tonnage, strength ⇄ endurance balance) over the shared
 *  WorkoutBlocks editor in signal mode (collapsible metric cards, per-set
 *  control), persisted via /api/templates. Twin of the mobile Builder. */
export default function AuroraBuilder({ onUpgrade }: { onUpgrade?: () => void }) {
  const { t: tr } = useLang();
  const prefs = useLoggerPrefs();
  // Bodyweight-aware tonnage: 10 BW pull-ups at 70 kg = 700 kg of work.
  const bodyweightKg = useBodyweight();
  // Building is free; a free user can SAVE up to FREE_TEMPLATE_LIMIT templates
  // (canSaveRoutine) — beyond that the save slot becomes the Full upsell.
  const persona = usePersona();
  const isFree = !isFullAccess(persona);
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

        <SessionPulse blocks={blocks} units={prefs.units} bodyweightKg={bodyweightKg} />

        <WorkoutBlocks
          blocks={blocks}
          setBlocks={setBlocks}
          emptyHint={tr("w.train.builder.emptyHint")}
          reorder
          signal
          velocity={prefs.velocity}
          rirMode={prefs.rpeAsRir}
          units={prefs.units}
          plateCalc={prefs.plateCalc}
          bodyweightKg={bodyweightKg}
        />

        {msg && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginBottom: 10, color: msg.ok ? C("lime") : C("red") }}>{msg.text}</div>}
        {canSaveRoutine(persona, templates.length) ? (
          <>
            <button onClick={save} disabled={saving || blocks.length === 0}
              style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.note, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "14px 28px", cursor: saving || !blocks.length ? "default" : "pointer", opacity: saving || !blocks.length ? 0.5 : 1 }}>
              {saving ? tr("w.train.builder.saving") : tr("w.train.builder.saveAsTemplate")}
            </button>
            {isFree && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 10 }}>
                {tr("w.train.builder.freeSlots").replace("{used}", String(templates.length)).replace("{limit}", String(FREE_TEMPLATE_LIMIT))}
              </div>
            )}
          </>
        ) : (
          // Free user at the template limit — more saved templates is Full.
          // Building/previewing (and the first FREE_TEMPLATE_LIMIT saves) stays free.
          <div style={{ border: `1px solid color-mix(in srgb, var(--premium-accent) 45%, transparent)`, background: `color-mix(in srgb, var(--premium-accent) 8%, transparent)`, borderRadius: 16, padding: 14 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--premium-accent-text)" }}>✦ {tr("w.train.logger.routineFullTitle")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 6, lineHeight: 1.5 }}>{tr("w.train.logger.routineFullBlurb")}</div>
            <button onClick={goUpgrade} style={{ marginTop: 12, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.note, background: "var(--premium-accent)", color: "var(--premium-accent-ink)", border: "none", borderRadius: 999, padding: "12px 24px", cursor: "pointer" }}>{tr("w.train.logger.routineUnlock")}</button>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{tr("w.train.builder.templateLibrary")}</div>
        {templates.length === 0 ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, marginTop: 10, color: C("ash") }}>{tr("w.train.builder.noTemplates")}</div>
        ) : (
          templates.map((t) => (
            <div key={t.id} style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
              <div style={{ fontWeight: 700, fontSize: fs.note }}>{t.name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{t.blocks.length} {tr("w.train.builder.blocks")}{t.description ? ` – ${t.description}` : ""}</div>
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

/**
 * The session pulse — "One Number": the routine's estimated duration IS the
 * interface, a single display-weight live readout that visibly grows with
 * every exercise added (composing feels like loading a bar, not filling a
 * form). Tonnage + moves ride along as one hairline meta; the strength ⇄
 * conditioning ⇄ endurance balance is a thin bar whose segment colours encode
 * modality (lime / violet / teal — information, not decoration), labelled
 * only for the modalities actually present. Replaces the old three stat
 * tiles + balance card (four boxes saying what one number can).
 */
function SessionPulse({ blocks, units, bodyweightKg }: { blocks: EditableBlock[]; units: WeightUnit; bodyweightKg?: number | null }) {
  const { t: tr } = useLang();
  const sig = sessionSignal(blocks, { bodyweightKg });
  const segs = [
    { pct: sig.split.strength, color: C("lime"), label: tr("w.train.signal.str"), textColor: "var(--lime-text)" },
    { pct: sig.split.conditioning, color: C("violet"), label: tr("w.train.signal.cond"), textColor: "var(--violet-text)" },
    { pct: sig.split.endurance, color: C("blue"), label: tr("w.train.signal.end"), textColor: "var(--blue-text)" },
  ];
  return (
    <div style={{ margin: "10px 2px 20px" }}>
      <div aria-label={`${sig.minutes} ${tr("w.train.signal.estTime")}`} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 56, letterSpacing: "-.03em", lineHeight: 1, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>
        {sig.minutes}<span style={{ fontSize: 22, fontWeight: 500, color: C("ash"), letterSpacing: 0 }}> min</span>
      </div>
      <MetaLine
        parts={[sig.tonnageKg > 0 ? fmtTonnage(sig.tonnageKg, units) : null, `${sig.moves} ${tr("w.train.signal.moves")}`]}
        style={{ display: "flex", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 10 }}
      />
      <div style={{ display: "flex", height: 4, borderRadius: 999, overflow: "hidden", background: C("ink2"), marginTop: 12 }}>
        {segs.map((s, i) => s.pct > 0 && <span key={i} style={{ width: `${s.pct}%`, background: s.color }} />)}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
        {segs.filter((s) => s.pct > 0).map((s, i) => (
          <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: s.textColor }}>{s.pct}% {s.label}</span>
        ))}
      </div>
    </div>
  );
}

function smallBtn(token: string): React.CSSProperties {
  const c = C(token);
  return { fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`, borderRadius: 999, padding: "8px 14px", cursor: "pointer" };
}
