"use client";

import { useCallback, useEffect, useState } from "react";
import { ALL_MUSCLES, LIBRARY_PATTERNS } from "@hybrid/core";
import { fs, space,
  INK,
  INK2,
  LINE,
  LIME,
  CHALK,
  ASH,
  AMBER,
  RED,
  ON_ACCENT,
  disp,
  cond,
  mono,
  Mono,
  Card,
  Chip,
  Select,
  txt,
} from "@/lib/ui";
import { useIsMobile } from "@/lib/use-media-query";

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

const PATTERNS = LIBRARY_PATTERNS;
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
  // When overriding a code built-in, its original name — so a rename can keep it
  // as an alias (prior logs stay resolvable + summaries canonicalize). null for
  // a fresh exercise or a plain custom edit.
  const [overrideOf, setOverrideOf] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const isMobile = useIsMobile();

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
    setOverrideOf(null);
    setEditing("new");
    setErr(null);
  }
  function openEdit(x: Exercise) {
    const builtin = x.source === "builtin";
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
    // A built-in has no DB row: editing it CREATES a custom override (POST),
    // remembering the original name to preserve as an alias on rename.
    setOverrideOf(builtin ? x.name : null);
    setEditing(builtin ? "new" : x.id);
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
    // Overriding a built-in that gets RENAMED: keep the original name as an alias
    // so prior logs resolve and every summary canonicalizes to the new name (the
    // PATCH route does this automatically on a custom rename; a create can't, so
    // we seed it here).
    const aliases = toList(draft.aliases);
    if (overrideOf && draft.name.trim() !== overrideOf && !aliases.includes(overrideOf)) {
      aliases.push(overrideOf);
    }
    const payload: Record<string, unknown> = {
      name: draft.name,
      pattern: draft.pattern,
      muscles: draft.muscles,
      baseLoad: draft.baseLoad.trim() === "" ? null : Number(draft.baseLoad),
      system: draft.system || null,
      kind: draft.kind,
      category: draft.category || null,
      equipment: toList(draft.equipment),
      aliases,
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
    setErr(null);
    try {
      const res = await fetch(`/api/admin/exercises/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
    } catch {
      setErr("That change didn't save — re-syncing.");
    }
    setBusy(false);
    load();
  }

  async function remove(x: Exercise) {
    if (!confirm(`Delete “${x.name}” permanently?`)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/exercises/${x.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setErr("Delete failed — re-syncing.");
    }
    setBusy(false);
    load();
  }

  const filtered = (list ?? []).filter(
    (x) => !q || x.name.toLowerCase().includes(q.toLowerCase()) || x.aliases.some((a) => a.toLowerCase().includes(q.toLowerCase())),
  );
  const builtinCount = (list ?? []).filter((x) => x.source === "builtin").length;
  const customCount = (list ?? []).length - builtinCount;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.md, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the library…"
          style={{ ...mono, fontSize: fs.bodyLg, flex: 1, minWidth: 200, maxWidth: 320, padding: "10px 14px", borderRadius: "var(--r-card)", background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
        />
        <Mono s={{ fontSize: fs.body }} c={ASH}>
          {list ? `${customCount} custom – ${builtinCount} built-in` : "…"}
        </Mono>
        {editing === null && (
          <button onClick={openNew} style={primaryBtn}>
            + New exercise
          </button>
        )}
      </div>
      <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 14 }} c={ASH}>
        Every exercise is editable — the code built-ins and your custom entries. Editing a built-in saves a custom
        override that supersedes it by name; renaming any exercise keeps the old name as an alias, so prior logs stay
        resolvable and every summary shows the new name.
      </Mono>

      {unavailable && (
        <Card style={{ marginBottom: 16, borderLeft: `3px solid ${AMBER}` }}>
          <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block" }} c={CHALK}>
            The <b>Exercise</b> table doesn&apos;t exist yet, so the built-ins below are read-only until it&apos;s
            created. Run <span style={{ color: txt(AMBER) }}>reference/sql-exercise.sql</span> in the Supabase SQL
            Editor to enable custom entries + overrides, then reload.
          </Mono>
        </Card>
      )}

      {editing !== null && (
        <Card style={{ marginBottom: 18, borderLeft: `3px solid ${LIME}` }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, marginBottom: 14 }}>
            {overrideOf ? `Override built-in “${overrideOf}”` : editing === "new" ? "New exercise" : "Edit exercise"}
          </div>
          {overrideOf && (
            <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 12, lineHeight: 1.6 }} c={ASH}>
              Saving creates a custom entry that supersedes the built-in by name. Rename the exercise here and the old
              name is kept as an alias automatically.
            </Mono>
          )}

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: space.md }}>
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
              {ALL_MUSCLES.map((m) => {
                const on = draft.muscles.includes(m);
                return (
                  <button
                    key={m}
                    onClick={() => toggleMuscle(m)}
                    style={{
                      ...cond,
                      fontSize: fs.body,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".08em",
                      padding: "8px 12px",
                      borderRadius: "var(--r-field)",
                      cursor: "pointer",
                      border: `1px solid ${on ? LIME : LINE}`,
                      background: on ? LIME : "transparent",
                      color: txt(on ? ON_ACCENT : ASH),
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: space.md }}>
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

          {err && <div role="alert"><Mono s={{ fontSize: fs.body, display: "block", marginBottom: 12 }} c={RED}>{err}</Mono></div>}

          <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
            <button disabled={busy} onClick={() => save("draft")} style={secondaryBtn}>Save draft</button>
            <button disabled={busy} onClick={() => save("published")} style={primaryBtn}>{editing === "new" ? "Publish" : "Save & publish"}</button>
            <button disabled={busy} onClick={() => setEditing(null)} style={ghostBtn}>Cancel</button>
          </div>
        </Card>
      )}

      {err && editing === null && (
        <div role="alert"><Mono s={{ fontSize: fs.body, display: "block", marginBottom: 12 }} c={RED}>{err}</Mono></div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: space.ms }}>
        {filtered.map((x) => {
          const isBuiltin = x.source === "builtin";
          return (
          <Card key={x.id} style={{ borderLeft: `3px solid ${isBuiltin ? LINE : STATUS_COLOR[x.status] ?? ASH}` }}>
            <div style={{ marginBottom: 6 }}>
              <Chip c={isBuiltin ? ASH : STATUS_COLOR[x.status] ?? ASH}>{isBuiltin ? "built-in" : x.status}</Chip>
              <Chip c={ASH}>{x.pattern}</Chip>
              <Chip c={ASH}>{x.kind}</Chip>
              {x.baseLoad != null && <Chip c={ASH}>{x.baseLoad}kg base</Chip>}
              {x.system && <Chip c={ASH}>{x.system}</Chip>}
            </div>
            <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle }}>{x.name}</div>
            <div style={{ marginTop: 6 }}>{x.muscles.map((m) => <Chip key={m} c={LIME}>{m}</Chip>)}</div>
            {x.aliases.length > 0 && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 6 }} c={ASH}>aka {x.aliases.join(", ")}</Mono>}
            {x.cues.length > 0 && (
              <Mono s={{ fontSize: fs.body, display: "block", marginTop: 6, lineHeight: 1.5 }} c={ASH}>
                {x.cues.map((c) => `• ${c}`).join("\n")}
              </Mono>
            )}

            <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap", marginTop: 14 }}>
              {isBuiltin ? (
                <button disabled={busy || unavailable} onClick={() => openEdit(x)} style={miniBtn} title={unavailable ? "Create the Exercise table to override built-ins" : undefined}>Edit / override</button>
              ) : (
                <>
                  <button disabled={busy} onClick={() => openEdit(x)} style={miniBtn}>Edit</button>
                  {x.status !== "published" ? (
                    <button disabled={busy} onClick={() => patch(x.id, { status: "published" })} style={miniBtn}>Publish</button>
                  ) : (
                    <button disabled={busy} onClick={() => patch(x.id, { status: "draft" })} style={miniBtn}>Unpublish</button>
                  )}
                  {x.status !== "archived" && <button disabled={busy} onClick={() => patch(x.id, { status: "archived" })} style={miniBtn}>Archive</button>}
                  <button disabled={busy} onClick={() => remove(x)} style={{ ...miniBtn, color: txt(RED), borderColor: `${RED}55` }}>Delete</button>
                </>
              )}
            </div>
          </Card>
          );
        })}

        {list && filtered.length === 0 && (
          <Card>
            <Mono s={{ fontSize: fs.bodyLg, textAlign: "center", display: "block", padding: 24 }} c={ASH}>
              {list.length === 0 ? "Couldn't load the catalog — retry." : "No matches."}
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
      <Mono s={{ fontSize: fs.micro, letterSpacing: ".12em", textTransform: "uppercase", display: "block", marginBottom: 6 }} c={ASH}>
        {label}
      </Mono>
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  ...mono,
  width: "100%",
  fontSize: fs.bodyLg,
  padding: "10px 14px",
  borderRadius: "var(--r-card)",
  background: INK2,
  color: CHALK,
  border: `1px solid ${LINE}`,
  outline: "none",
  boxSizing: "border-box",
};
const baseBtn: React.CSSProperties = {
  ...cond,
  fontSize: fs.bodyLg,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  padding: "9px 16px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  border: `1px solid ${LINE}`,
};
const primaryBtn: React.CSSProperties = { ...baseBtn, background: LIME, color: ON_ACCENT, border: `1px solid ${LIME}` };
const secondaryBtn: React.CSSProperties = { ...baseBtn, background: INK2, color: CHALK };
const ghostBtn: React.CSSProperties = { ...baseBtn, background: "transparent", color: txt(ASH) };
const miniBtn: React.CSSProperties = {
  ...cond,
  fontSize: fs.body,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  padding: "8px 12px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  border: `1px solid ${LINE}`,
  background: INK,
  color: CHALK,
};
