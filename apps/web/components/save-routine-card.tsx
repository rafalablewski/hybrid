"use client";

import { useEffect, useState } from "react";
import { canSaveRoutine, isFullAccess, FUNNEL, type SessionBlock } from "@hybrid/core";
import { fs, space } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { usePersona } from "@/lib/persona";
import { track } from "@/lib/track";

const C = (v: string) => `var(--color-${v})`;

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
}: {
  blocks: SessionBlock[];
  defaultName: string;
  /** In-shell navigation to the upgrade screen (falls back to /upgrade). */
  onUpgrade?: () => void;
}) {
  const { t } = useLang();
  const persona = usePersona();
  const [savedCount, setSavedCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "upsell">("idle");
  const [err, setErr] = useState("");

  // Free users are capped at FREE_TEMPLATE_LIMIT saved templates — fetch the
  // count so the card can upsell up-front instead of erroring on save. Full
  // users are unlimited, so skip the round-trip.
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
