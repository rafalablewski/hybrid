"use client";

import { useEffect, useState } from "react";
import { canSaveRoutine, isFullAccess, FUNNEL, MOODS, SUGGESTED_TAGS, MAX_TAGS, tagLabelKey, type SessionBlock } from "@hybrid/core";
import { fs, space } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { usePersona } from "@/lib/persona";
import { track } from "@/lib/track";

const C = (v: string) => `var(--color-${v})`;
const tagLabel = (t: (k: string) => string, slug: string) => { const k = tagLabelKey(slug); return k ? t(k) : slug; };

/**
 * "Save as routine" — the post-finish card shared by both web loggers (classic +
 * Aurora). Saving a reusable routine belongs AFTER you finish, not on the live
 * logging surface, and it's the one place a workout name actually matters.
 *
 * Saving reusable routines is free up to FREE_TEMPLATE_LIMIT saved templates
 * (canSaveRoutine) — beyond that it's a FULL feature. A free (casual) user at
 * the limit sees a proper UPSELL here instead of the confusing "couldn't save"
 * error the API's 403 used to produce (the saved count is fetched on mount;
 * a stale count still lands on the upsell via the 403 path). Under the limit
 * everyone gets the three-state flow: collapsed pill → name field → saved.
 * Posts to /api/templates.
 */
export default function SaveRoutineCard({
  blocks,
  defaultName,
  onUpgrade,
  startOpen,
}: {
  blocks: SessionBlock[];
  defaultName: string;
  /** In-shell navigation to the upgrade screen (falls back to /upgrade). */
  onUpgrade?: () => void;
  /** Open the composer immediately (the Liquid-Field finish screen expands it
   *  straight from the ★ satellite; elsewhere it starts as the collapsed pill). */
  startOpen?: boolean;
}) {
  const { t } = useLang();
  const persona = usePersona();
  const [savedCount, setSavedCount] = useState(0);
  const [open, setOpen] = useState(!!startOpen);
  const [name, setName] = useState(defaultName);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "upsell">("idle");
  const [err, setErr] = useState("");

  // Free users are capped at FREE_TEMPLATE_LIMIT saved templates — fetch the
  // count so the card can upsell up-front instead of erroring on save. Full
  // users are unlimited, so skip the round-trip. A failed fetch deliberately
  // leaves the count at 0: the save button shows, and a save at the limit
  // still lands on the upsell via the API's 403 — never a silent failure.
  const isFree = !isFullAccess(persona);
  useEffect(() => {
    if (!isFree) return;
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => setSavedCount(((d as { templates?: unknown[] }).templates ?? []).length))
      .catch(() => {});
  }, [isFree]);
  const allowed = canSaveRoutine(persona, savedCount);

  const goUpgrade = () => {
    track(FUNNEL.upgradeEntryClick, { client: "web", source: "save-routine" });
    onUpgrade?.();
  };

  if (state === "saved")
    return (
      <div style={{ textAlign: "center", marginTop: 18, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("lime") }}>
        {t("w.train.logger.savedRoutine")}
      </div>
    );

  // Free user AT THE TEMPLATE LIMIT → the upsell card (either known up-front,
  // or a stale count let a 403 through on save). The first FREE_TEMPLATE_LIMIT
  // routines — and logging — are free.
  if (!allowed || state === "upsell")
    return (
      <div style={{ marginTop: 18, border: `1px solid color-mix(in srgb, ${C("lime")} 45%, transparent)`, background: `color-mix(in srgb, ${C("lime")} 8%, transparent)`, borderRadius: 16, padding: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--lime-text)" }}>
          ✦ {t("w.train.logger.routineFullTitle")}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 6, lineHeight: 1.55 }}>
          {t("w.train.logger.routineFullBlurb")}
        </div>
        <button
          onClick={goUpgrade}
          style={{ marginTop: 12, width: "100%", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.note, color: "var(--on-accent)", background: C("lime"), border: "none", borderRadius: 999, padding: "13px", cursor: "pointer" }}
        >
          {t("w.train.logger.routineUnlock")}
        </button>
      </div>
    );

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ width: "100%", marginTop: 18, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.note, color: C("lime"), background: `color-mix(in srgb, ${C("lime")} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${C("lime")} 45%, transparent)`, borderRadius: 999, padding: "14px", cursor: "pointer" }}
      >
        {t("w.train.logger.saveAsRoutine")}
      </button>
    );

  const save = async () => {
    setState("saving");
    setErr("");
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || t("w.train.logger.defaultRoutine"), blocks }),
      });
      if (!res.ok) {
        // 403 = the Full gate (persona was stale) → show the upsell, not an error.
        if (res.status === 403) { setState("upsell"); return; }
        setErr(res.status === 401 ? t("w.train.logger.signInRoutines") : t("w.train.logger.saveRoutineErr"));
        setState("idle");
        return;
      }
      setState("saved");
    } catch {
      setErr(t("w.train.logger.networkError"));
      setState("idle");
    }
  };

  return (
    <div style={{ marginTop: 18, border: `1px solid color-mix(in srgb, ${C("lime")} 40%, transparent)`, background: `color-mix(in srgb, ${C("lime")} 8%, transparent)`, borderRadius: 16, padding: 16 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("lime") }}>
        {t("w.train.logger.saveAsRoutine").replace(/^★\s*/, "")}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 4, lineHeight: 1.5 }}>
        {t("w.train.logger.saveRoutineHint")}
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("w.train.logger.routineNamePh")}
        style={{ marginTop: 11, width: "100%", fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("chalk"), background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 11, padding: "11px 13px", outline: "none", boxSizing: "border-box" }}
      />
      {err && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 8 }}>{err}</div>}
      <button
        onClick={save}
        disabled={state === "saving"}
        style={{ marginTop: 11, width: "100%", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.note, color: "var(--on-accent)", background: C("lime"), border: "none", borderRadius: 999, padding: "13px", cursor: state === "saving" ? "default" : "pointer", opacity: state === "saving" ? 0.6 : 1 }}
      >
        {state === "saving" ? t("w.train.logger.saving") : t("w.train.logger.saveToRoutines")}
      </button>
    </div>
  );
}

/**
 * Optional inline session rename for the finish screen — "you can add a name
 * after you finish", but it's optional (most never do). Collapsed to a subtle
 * link; expands to an input that PATCHes the saved Session's title. Needs the
 * created session's id (null in demo/guest mode, where it stays local-only).
 */
export function SessionRename({
  sessionId,
  value,
  onRenamed,
}: {
  sessionId: string | null;
  value: string;
  onRenamed: (title: string) => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(value);
  const [saving, setSaving] = useState(false);

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 10, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), background: "none", border: `1px dashed ${C("line")}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}
      >
        {t("w.train.logger.nameOptional")}
      </button>
    );

  const commit = async () => {
    const next = name.trim();
    onRenamed(next || value);
    if (sessionId && next && next !== value) {
      setSaving(true);
      try {
        await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: next }),
        });
      } catch {
        /* best-effort — the local title is already updated */
      }
      setSaving(false);
    }
    setOpen(false);
  };

  return (
    <div style={{ display: "flex", gap: space.xs, justifyContent: "center", marginTop: 10 }}>
      <input
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        placeholder={t("w.train.logger.sessionTitlePh")}
        style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("chalk"), background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 10, padding: "8px 12px", outline: "none", textAlign: "center" }}
      />
      <button
        aria-label="Save"
        onClick={commit}
        disabled={saving}
        style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, color: "var(--on-accent)", background: C("lime"), border: "none", borderRadius: 10, padding: "8px 14px", cursor: "pointer" }}
      >
        ✓
      </button>
    </div>
  );
}

// A PRIVATE post-workout note — free text + a quick mood tap + context tags,
// PATCHed onto the just-finished session (owner-only, never shown to anyone
// else). Collapsed to a subtle link, like the rename; three states:
// pill → composer → saved. Mirrors the mobile SummaryNote.
export function SessionNote({ sessionId }: { sessionId: string | null }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const toggleTag = (slug: string) => setTags((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : cur.length < MAX_TAGS ? [...cur, slug] : cur));

  if (saved)
    return (
      <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)" }}>{t("w.train.note.saved")}</div>
    );

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 10, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), background: "none", border: `1px dashed ${C("line")}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}
      >
        ✎ {t("w.train.note.add")}
      </button>
    );

  const commit = async () => {
    const body = note.trim();
    if (sessionId && (body || mood != null || tags.length > 0)) {
      setSaving(true);
      let ok = false;
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: body, mood, tags }),
        });
        ok = res.ok;
      } catch { /* best-effort — stay open so the note can be retried */ }
      setSaving(false);
      setSaved(ok); // only collapse to "Note saved" when the write landed
      return;
    }
    setSaved(true); // nothing to write — just close the composer
  };

  return (
    <div style={{ marginTop: 12, textAlign: "left", border: `1px solid ${C("line")}`, borderRadius: 14, background: C("ink2"), padding: 14 }}>
      <textarea
        value={note}
        autoFocus
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("w.train.note.ph")}
        rows={2}
        style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "var(--font-display)", fontSize: fs.body, color: C("chalk"), background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 10, padding: "9px 11px" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{t("w.train.note.mood-q")}</span>
        {MOODS.map((m) => {
          const on = mood === m.value;
          return (
            <button key={m.value} onClick={() => setMood(on ? null : m.value)} aria-label={t(m.labelKey)} aria-pressed={on}
              style={{ width: 30, height: 30, borderRadius: 9, cursor: "pointer", fontSize: 15, lineHeight: 1, background: on ? "color-mix(in srgb, var(--color-lime) 10%, transparent)" : C("ink"), border: `1px solid ${on ? C("lime") : C("line")}` }}>{m.emoji}</button>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {SUGGESTED_TAGS.map((tg) => {
          const on = tags.includes(tg.slug);
          return (
            <button key={tg.slug} onClick={() => toggleTag(tg.slug)} aria-pressed={on}
              style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, borderRadius: 999, padding: "5px 10px", cursor: "pointer", color: on ? "var(--on-accent)" : C("ash"), background: on ? C("lime") : C("ink"), border: `1px solid ${on ? C("lime") : C("line")}`, fontWeight: on ? 600 : 400 }}>#{tagLabel(t, tg.slug)}</button>
          );
        })}
      </div>
      <button onClick={commit} disabled={saving} style={{ marginTop: 12, width: "100%", background: C("lime"), border: "none", borderRadius: 10, padding: "10px 0", cursor: "pointer", fontWeight: 800, fontSize: fs.caption, color: "var(--on-accent)", opacity: saving ? 0.6 : 1 }}>{t("common.save")}</button>
    </div>
  );
}
