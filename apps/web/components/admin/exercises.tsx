"use client";

import { useCallback, useEffect, useState } from "react";
import { ALL_MUSCLES } from "@hybrid/core";
import {
  INK,
  INK2,
  LINE,
  LIME,
  CHALK,
  ASH,
  AMBER,
  RED,
  disp,
  cond,
  mono,
  Mono,
  Card,
  Chip,
  Select,
} from "@/lib/ui";

type Exercise = {
  id: string;
  slug: string;
  name: string;
  pattern: string;
  muscles: string[];
  baseLoad: number | null;
  system: string | null;
  kind: string;
  category: string | null;
  equipment: string[];
  aliases: string[];
  description: string | null;
  cues: string[];
  videoUrl: string | null;
  status: "draft" | "published" | "archived";
  source: string;
  authorEmail: string | null;
};

const PATTERNS = ["squat", "hinge", "push", "pull", "lunge", "carry", "core", "cond"];
const STATUS_COLOR: Record<string, string> = { draft: ASH, published: LIME, archived: AMBER };

type Draft = {
  name: string;
  pattern: string;
  muscles: string[];
  baseLoad: string;
  system: string;
  kind: string;
  category: string;
  equipment: string;
  aliases: string;
  description: string;
  cues: string;
  videoUrl: string;
};

const EMPTY: Draft = {
  name: "",
  pattern: "squat",
  muscles: [],
  baseLoad: "",
  system: "",
  kind: "strength",
  category: "",
  equipment: "",
  aliases: "",
  description: "",
  cues: "",
  videoUrl: "",
};

const toList = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

export default function AdminExercises() {
  const [list, setList] = useState<Exercise[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/exercises")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        setList(d.exercises ?? []);
      })
      .catch(() => setList([]));
  }, []);

  useEffect(load, [load]);

  function openNew() {
    setDraft(EMPTY);
    setEditing("new");
    setErr(null);
  }
  function openEdit(x: Exercise) {
    setDraft({
      name: x.name,
      pattern: x.pattern,
      muscles: x.muscles,
      baseLoad: x.baseLoad == null ? "" : String(x.baseLoad),
      system: x.system ?? "",
      kind: x.kind,
      category: x.category ?? "",
      equipment: x.equipment.join(", "),
      aliases: x.aliases.join(", "),
      description: x.description ?? "",
      cues: x.cues.join("\n"),
      videoUrl: x.videoUrl ?? "",
    });
    setEditing(x.id);
    setErr(null);
  }

  function toggleMuscle(m: string) {
    setDraft((d) => ({
      ...d,
      muscles: d.muscles.includes(m) ? d.muscles.filter((x) => x !== m) : [...d.muscles, m],
    }));
  }

  async function save(status?: Exercise["status"]) {
    if (!draft.name.trim()) return setErr("Name is required.");
    if (draft.muscles.length === 0) return setErr("Pick at least one muscle.");
    setBusy(true);
    setErr(null);
    const payload: Record<string, unknown> = {
      name: draft.name,
      pattern: draft.pattern,
      muscles: draft.muscles,
      baseLoad: draft.baseLoad.trim() === "" ? null : Number(draft.baseLoad),
      system: draft.system || null,
      kind: draft.kind,
      category: draft.category || null,
      equipment: toList(draft.equipment),
      aliases: toList(draft.aliases),
      description: draft.description || null,
      cues: toList(draft.cues),
      videoUrl: draft.videoUrl || null,
    };
    if (status) payload.status = status;

    const isNew = editing === "new";
    const res = await fetch(isNew ? "/api/admin/exercises" : `/api/admin/exercises/${editing}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setErr(d.error ?? "Save failed.");
    }
    setEditing(null);
    load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/admin/exercises/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    load();
  }

  async function remove(x: Exercise) {
    if (!confirm(`Delete “${x.name}” permanently?`)) return;
    setBusy(true);
    await fetch(`/api/admin/exercises/${x.id}`, { method: "DELETE" });
    setBusy(false);
    load();
  }

  if (unavailable)
    return (
      <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Exercise library not initialized</div>
        <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block" }} c={CHALK}>
          The <b>Exercise</b> table doesn&apos;t exist yet. Run{" "}
          <span style={{ color: AMBER }}>reference/sql-exercise.sql</span> in the Supabase SQL Editor to create it,
          then reload.
        </Mono>
      </Card>
    );

  const filtered = (list ?? []).filter(
    (x) => !q || x.name.toLowerCase().includes(q.toLowerCase()) || x.aliases.some((a) => a.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the library…"
          style={{ ...mono, fontSize: 13, flex: 1, maxWidth: 320, padding: "10px 14px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
        />
        <Mono s={{ fontSize: 12 }} c={ASH}>
          {list ? `${list.length} custom` : "…"} · + built-ins
        </Mono>
        {editing === null && (
          <button onClick={openNew} style={primaryBtn}>
            + New exercise
          </button>
        )}
      </div>
      <Mono s={{ fontSize: 11, display: "block", marginBottom: 14 }} c={ASH}>
        Custom exercises merge over the built-in catalog by name and become pickable across the app. The 9 built-ins
        live in code; you only manage additions + overrides here.
      </Mono>

      {editing !== null && (
        <Card style={{ marginBottom: 18, borderLeft: `3px solid ${LIME}` }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 16, marginBottom: 14 }}>
            {editing === "new" ? "New exercise" : "Edit exercise"}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Name (the engine key)">
              <input value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Zercher Squat" style={input} />
            </Field>
            <Field label="Category (optional)">
              <input value={draft.category} maxLength={60} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="e.g. Lower / Olympic" style={input} />
            </Field>
            <Field label="Pattern">
              <Select value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}>
                {PATTERNS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="Kind">
              <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                <option value="strength">Strength</option>
                <option value="conditioning">Conditioning</option>
              </Select>
            </Field>
            <Field label="Base load (kg, blank for conditioning)">
              <input value={draft.baseLoad} inputMode="decimal" onChange={(e) => setDraft({ ...draft, baseLoad: e.target.value })} placeholder="100" style={input} />
            </Field>
            <Field label="Energy system (conditioning)">
              <Select value={draft.system} onChange={(e) => setDraft({ ...draft, system: e.target.value })}>
                <option value="">— none —</option>
                <option value="anaerobic">Anaerobic</option>
                <option value="threshold">Threshold</option>
                <option value="aerobic">Aerobic</option>
              </Select>
            </Field>
          </div>

          <Field label="Muscles worked (drives fatigue + volume attribution)">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ALL_MUSCLES.map((m) => {
                const on = draft.muscles.includes(m);
                return (
                  <button
                    key={m}
                    onClick={() => toggleMuscle(m)}
                    style={{
                      ...cond,
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                      padding: "6px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      border: `1px solid ${on ? LIME : LINE}`,
                      background: on ? LIME : "transparent",
                      color: on ? "#0c0d0c" : ASH,
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Equipment (comma-separated)">
              <input value={draft.equipment} onChange={(e) => setDraft({ ...draft, equipment: e.target.value })} placeholder="barbell, rack" style={input} />
            </Field>
            <Field label="Aliases (comma-separated)">
              <input value={draft.aliases} onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} placeholder="Zerchers" style={input} />
            </Field>
          </div>

          <Field label="Description (optional)">
            <textarea value={draft.description} maxLength={2000} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
          </Field>
          <Field label="Coaching cues (one per line)">
            <textarea value={draft.cues} onChange={(e) => setDraft({ ...draft, cues: e.target.value })} rows={3} placeholder={"Brace before the descent\nElbows inside the knees"} style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
          </Field>
          <Field label="Demo video URL (optional)">
            <input value={draft.videoUrl} onChange={(e) => setDraft({ ...draft, videoUrl: e.target.value })} placeholder="https://…" style={input} />
          </Field>

          {err && <Mono s={{ fontSize: 12, display: "block", marginBottom: 12 }} c={RED}>{err}</Mono>}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button disabled={busy} onClick={() => save("draft")} style={secondaryBtn}>Save draft</button>
            <button disabled={busy} onClick={() => save("published")} style={primaryBtn}>{editing === "new" ? "Publish" : "Save & publish"}</button>
            <button disabled={busy} onClick={() => setEditing(null)} style={ghostBtn}>Cancel</button>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((x) => (
          <Card key={x.id} style={{ borderLeft: `3px solid ${STATUS_COLOR[x.status] ?? ASH}` }}>
            <div style={{ marginBottom: 6 }}>
              <Chip c={STATUS_COLOR[x.status] ?? ASH}>{x.status}</Chip>
              <Chip c={ASH}>{x.pattern}</Chip>
              <Chip c={ASH}>{x.kind}</Chip>
              {x.baseLoad != null && <Chip c={ASH}>{x.baseLoad}kg base</Chip>}
              {x.system && <Chip c={ASH}>{x.system}</Chip>}
            </div>
            <div style={{ ...disp, fontWeight: 800, fontSize: 16 }}>{x.name}</div>
            <div style={{ marginTop: 6 }}>{x.muscles.map((m) => <Chip key={m} c={LIME}>{m}</Chip>)}</div>
            {x.aliases.length > 0 && <Mono s={{ fontSize: 11, display: "block", marginTop: 6 }} c={ASH}>aka {x.aliases.join(", ")}</Mono>}
            {x.cues.length > 0 && (
              <Mono s={{ fontSize: 12, display: "block", marginTop: 6, lineHeight: 1.5 }} c={ASH}>
                {x.cues.map((c) => `• ${c}`).join("\n")}
              </Mono>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
              <button disabled={busy} onClick={() => openEdit(x)} style={miniBtn}>Edit</button>
              {x.status !== "published" ? (
                <button disabled={busy} onClick={() => patch(x.id, { status: "published" })} style={miniBtn}>Publish</button>
              ) : (
                <button disabled={busy} onClick={() => patch(x.id, { status: "draft" })} style={miniBtn}>Unpublish</button>
              )}
              {x.status !== "archived" && <button disabled={busy} onClick={() => patch(x.id, { status: "archived" })} style={miniBtn}>Archive</button>}
              <button disabled={busy} onClick={() => remove(x)} style={{ ...miniBtn, color: RED, borderColor: `${RED}55` }}>Delete</button>
            </div>
          </Card>
        ))}

        {list && filtered.length === 0 && (
          <Card>
            <Mono s={{ fontSize: 13, textAlign: "center", display: "block", padding: 24 }} c={ASH}>
              {list.length === 0 ? "No custom exercises yet. Add one to extend the catalog." : "No matches."}
            </Mono>
          </Card>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Mono s={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", display: "block", marginBottom: 6 }} c={ASH}>
        {label}
      </Mono>
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  ...mono,
  width: "100%",
  fontSize: 13,
  padding: "10px 14px",
  borderRadius: 10,
  background: INK2,
  color: CHALK,
  border: `1px solid ${LINE}`,
  outline: "none",
  boxSizing: "border-box",
};
const baseBtn: React.CSSProperties = {
  ...cond,
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  padding: "9px 16px",
  borderRadius: 9,
  cursor: "pointer",
  border: `1px solid ${LINE}`,
};
const primaryBtn: React.CSSProperties = { ...baseBtn, background: LIME, color: "#0c0d0c", border: `1px solid ${LIME}` };
const secondaryBtn: React.CSSProperties = { ...baseBtn, background: INK2, color: CHALK };
const ghostBtn: React.CSSProperties = { ...baseBtn, background: "transparent", color: ASH };
const miniBtn: React.CSSProperties = {
  ...cond,
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  padding: "6px 12px",
  borderRadius: 8,
  cursor: "pointer",
  border: `1px solid ${LINE}`,
  background: INK,
  color: CHALK,
};
