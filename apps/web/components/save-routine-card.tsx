"use client";

import { useState } from "react";
import type { SessionBlock } from "@hybrid/core";
import { fs, space } from "@/lib/ui";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;

/**
 * "Save as routine" — the post-finish card shared by both web loggers (classic +
 * Aurora). Saving a reusable routine belongs AFTER you finish, not on the live
 * logging surface, and it's the one place a workout name actually matters. Three
 * states: a collapsed pill → an inline name field → a saved confirmation.
 * Posts to /api/templates (the same route the old bottom button used).
 */
export default function SaveRoutineCard({
  blocks,
  defaultName,
}: {
  blocks: SessionBlock[];
  defaultName: string;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [err, setErr] = useState("");

  if (state === "saved")
    return (
      <div style={{ textAlign: "center", marginTop: 18, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("lime") }}>
        {t("w.train.logger.savedRoutine")}
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
      {err && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 8 }}>{err}</div>}
      <button
        onClick={save}
        disabled={state === "saving"}
        style={{ marginTop: 11, width: "100%", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.note, color: C("ink"), background: C("lime"), border: "none", borderRadius: 999, padding: "13px", cursor: state === "saving" ? "default" : "pointer", opacity: state === "saving" ? 0.6 : 1 }}
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
        onClick={commit}
        disabled={saving}
        style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, color: C("ink"), background: C("lime"), border: "none", borderRadius: 10, padding: "8px 14px", cursor: "pointer" }}
      >
        ✓
      </button>
    </div>
  );
}
