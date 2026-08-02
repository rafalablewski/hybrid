"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  editableBlockFields,
  sessionEditDirty,
  sessionEditDraft,
  sessionEditPatch,
  type LoggedSession,
  type SessionEditDraft,
} from "@hybrid/core";
import Sheet from "@/components/aurora/sheet";
import { useLang } from "@/lib/i18n";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { fs, space, ASH, CHALK, INK2, LINE, LIME, ON_ACCENT, AMBER, Button, mono } from "@/lib/ui";

/**
 * EDIT WORKOUT (web) — correct the figures you typed into a workout you already
 * saved (a distance that got skipped, a fat-fingered time, the wrong load on a
 * set) without deleting the session and throwing away its PRs, your feel report
 * and any device match.
 *
 * The model is shared — core/session-edit.ts builds the draft and folds it back
 * onto the ORIGINAL blocks, so nothing this sheet doesn't show (stroke, incline,
 * zone, superset group, a set's role or measured rest) can be lost by an edit.
 * Mobile parity: apps/mobile/components/session-edit.tsx.
 */
export function SessionEditSheet({
  session,
  open,
  onClose,
  onSaved,
}: {
  session: LoggedSession;
  open: boolean;
  onClose: () => void;
  /** fired after the server accepted the correction */
  onSaved: () => void;
}) {
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const [draft, setDraft] = useState<SessionEditDraft>(() => sessionEditDraft(session, { units }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Re-seed each time the sheet opens: a cancelled edit must not linger, and a
  // refetch may have landed while it was closed.
  useEffect(() => {
    if (open) {
      setDraft(sessionEditDraft(session, { units }));
      setError(false);
    }
  }, [open, session, units]);

  const dirty = sessionEditDirty(session, draft, { units });

  const setBlock = (i: number, patch: Partial<SessionEditDraft["blocks"][number]>) =>
    setDraft((d) => ({ ...d, blocks: d.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const setSet = (i: number, j: number, patch: Partial<SessionEditDraft["blocks"][number]["sets"][number]>) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, bi) => (bi === i ? { ...b, sets: b.sets.map((s, si) => (si === j ? { ...s, ...patch } : s)) } : b)),
    }));
  const addSet = (i: number) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, bi) => (bi === i ? { ...b, sets: [...b.sets, { load: "", reps: "", rpe: "" }] } : b)),
    }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionEditPatch(session, draft, { units })),
      });
      if (!res.ok) throw new Error("patch failed");
      onSaved();
      onClose();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const field: CSSProperties = {
    ...mono,
    fontSize: fs.body,
    color: CHALK,
    background: INK2,
    border: `1px solid ${LINE}`,
    borderRadius: 10,
    padding: "9px 10px",
    width: "100%",
    boxSizing: "border-box",
  };
  const label: CSSProperties = { ...mono, fontSize: 9, letterSpacing: 1, color: ASH, textTransform: "uppercase", display: "block", marginBottom: 5 };

  // `cap` is omitted inside a set table, which captions its COLUMNS once —
  // three identical LOAD/REPS/RPE rows down a bench-press block is noise. The
  // aria-label carries the name a sighted user reads off the column head.
  const num = (cap: string, value: string, onChange: (v: string) => void, showCap = true) => (
    <label key={cap} style={{ flex: 1, minWidth: 88 }}>
      {showCap && <span style={label}>{cap}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="—"
        aria-label={cap}
        style={field}
      />
    </label>
  );

  return (
    <Sheet open={open} onClose={onClose} title={t("session.edit.title")} sub={t("session.edit.lead")} maxWidth={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: space.md, maxHeight: "62vh", overflowY: "auto" }}>
        <label>
          <span style={label}>{t("session.edit.name")}</span>
          <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder={session.title} style={field} />
        </label>

        {draft.blocks.map((b, i) => {
          const orig = session.blocks[i];
          const fields = editableBlockFields({
            kind: b.kind,
            name: b.name,
            elevation: orig && orig.kind === "cardio" ? orig.elevation : undefined,
          });
          return (
            <div key={`${b.name}-${i}`} style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: fs.body, color: CHALK, marginBottom: 10 }}>{b.name}</div>

              {fields.sets ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Column captions once, above the rows — the set-number
                      column keeps its width so the grid stays square. */}
                  <div style={{ display: "flex", gap: space.sm }} aria-hidden>
                    <span style={{ width: 18 }} />
                    <span style={{ ...label, flex: 1, minWidth: 88, marginBottom: 0 }}>{t("session.edit.load")} ({units})</span>
                    <span style={{ ...label, flex: 1, minWidth: 88, marginBottom: 0 }}>{t("session.edit.reps")}</span>
                    <span style={{ ...label, flex: 1, minWidth: 88, marginBottom: 0 }}>{t("session.edit.rpe")}</span>
                  </div>
                  {b.sets.map((s, j) => (
                    <div key={j} style={{ display: "flex", alignItems: "center", gap: space.sm }}>
                      <span style={{ ...mono, fontSize: fs.caption, color: ASH, width: 18 }}>{j + 1}</span>
                      {num(`${t("session.edit.load")} (${units})`, s.load, (v) => setSet(i, j, { load: v }), false)}
                      {num(t("session.edit.reps"), s.reps, (v) => setSet(i, j, { reps: v }), false)}
                      {num(t("session.edit.rpe"), s.rpe, (v) => setSet(i, j, { rpe: v }), false)}
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
                    <span style={{ ...mono, fontSize: fs.caption, color: ASH }}>{t("session.edit.emptySet")}</span>
                    <button className="pressable"
                      onClick={() => addSet(i)}
                      style={{ ...mono, fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      + {t("session.edit.addSet")}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm }}>
                  {fields.distance && num(`${t("session.edit.distance")} (${fields.distanceUnit})`, b.distance, (v) => setBlock(i, { distance: v }))}
                  {fields.minutes && num(t("session.edit.minutes"), b.minutes, (v) => setBlock(i, { minutes: v }))}
                  {fields.rounds && num(t("session.edit.rounds"), b.rounds, (v) => setBlock(i, { rounds: v }))}
                  {fields.elevation && num(t("session.edit.elevation"), b.elevation, (v) => setBlock(i, { elevation: v }))}
                  {fields.rpe && num(t("session.edit.rpe"), b.rpe, (v) => setBlock(i, { rpe: v }))}
                </div>
              )}
            </div>
          );
        })}

        {/* A matched session's numbers still come off the wrist everywhere else
            — say so here rather than let a corrected figure look like it
            changed nothing. */}
        {session.device && <div style={{ ...mono, fontSize: fs.caption, lineHeight: 1.5, color: ASH }}>{t("session.edit.matched")}</div>}
        {error && <div style={{ ...mono, fontSize: fs.caption, color: AMBER }}>{t("session.edit.error")}</div>}
      </div>

      <div style={{ display: "flex", gap: space.sm, marginTop: space.md }}>
        <Button label={t("common.cancel")} variant="outline" onClick={onClose} />
        <button className="pressable"
          onClick={() => void save()}
          disabled={saving || !dirty}
          style={{
            flex: 1,
            fontWeight: 900,
            fontSize: fs.body,
            color: ON_ACCENT,
            background: LIME,
            border: "none",
            borderRadius: 14,
            padding: "14px 0",
            cursor: saving || !dirty ? "default" : "pointer",
            opacity: saving || !dirty ? 0.45 : 1,
          }}
        >
          {t("common.save")}
        </button>
      </div>
    </Sheet>
  );
}
