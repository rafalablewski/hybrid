"use client";

import { useCallback, useEffect, useState } from "react";
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

type Announcement = {
  id: string;
  title: string;
  body: string;
  level: "info" | "success" | "warning";
  audience: "all" | "coaches" | "clients";
  status: "draft" | "published" | "archived";
  pinned: boolean;
  publishAt: string | null;
  expiresAt: string | null;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
};

const LEVEL_COLOR: Record<Announcement["level"], string> = { info: LIME, success: LIME, warning: AMBER };
const STATUS_COLOR: Record<Announcement["status"], string> = { draft: ASH, published: LIME, archived: AMBER };

type Draft = {
  title: string;
  body: string;
  level: Announcement["level"];
  audience: Announcement["audience"];
  pinned: boolean;
  publishAt: string; // datetime-local value
  expiresAt: string;
};

const EMPTY: Draft = { title: "", body: "", level: "info", audience: "all", pinned: false, publishAt: "", expiresAt: "" };

// ISO ⇆ <input type="datetime-local"> (which speaks local time, no zone/seconds).
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

export default function AdminAnnouncements() {
  const [list, setList] = useState<Announcement[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const load = useCallback(() => {
    fetch("/api/admin/announcements")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        setList(d.announcements ?? []);
      })
      .catch(() => setList([]));
  }, []);

  useEffect(load, [load]);

  function openNew() {
    setDraft(EMPTY);
    setEditing("new");
    setErr(null);
  }
  function openEdit(a: Announcement) {
    setDraft({
      title: a.title,
      body: a.body,
      level: a.level,
      audience: a.audience,
      pinned: a.pinned,
      publishAt: toLocalInput(a.publishAt),
      expiresAt: toLocalInput(a.expiresAt),
    });
    setEditing(a.id);
    setErr(null);
  }

  async function save(status?: Announcement["status"]) {
    if (!draft.title.trim() || !draft.body.trim()) {
      setErr("Title and body are required.");
      return;
    }
    setBusy(true);
    setErr(null);
    const payload: Record<string, unknown> = {
      title: draft.title,
      body: draft.body,
      level: draft.level,
      audience: draft.audience,
      pinned: draft.pinned,
      publishAt: fromLocalInput(draft.publishAt),
      expiresAt: fromLocalInput(draft.expiresAt),
    };
    if (status) payload.status = status;

    const isNew = editing === "new";
    const res = await fetch(isNew ? "/api/admin/announcements" : `/api/admin/announcements/${editing}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error ?? "Save failed.");
      return;
    }
    setEditing(null);
    load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
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

  async function remove(a: Announcement) {
    if (!confirm(`Delete “${a.title}” permanently?`)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/announcements/${a.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setErr("Delete failed — re-syncing.");
    }
    setBusy(false);
    load();
  }

  if (unavailable)
    return (
      <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Announcements not initialized</div>
        <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.6, display: "block" }} c={CHALK}>
          The <b>Announcement</b> table doesn&apos;t exist yet. Run{" "}
          <span style={{ color: txt(AMBER) }}>reference/sql-announcement.sql</span> in the Supabase SQL Editor to
          create it, then reload.
        </Mono>
      </Card>
    );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Mono s={{ fontSize: fs.body }} c={ASH}>
          {list ? `${list.length} announcement${list.length === 1 ? "" : "s"}` : "…"} · broadcast to the app
        </Mono>
        {editing === null && (
          <button onClick={openNew} style={primaryBtn}>
            + New announcement
          </button>
        )}
      </div>

      {editing !== null && (
        <Card style={{ marginBottom: 18, borderLeft: `3px solid ${LIME}` }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, marginBottom: 14 }}>
            {editing === "new" ? "New announcement" : "Edit announcement"}
          </div>

          <Field label="Title">
            <input
              value={draft.title}
              maxLength={160}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g. New: editable plan templates are live"
              style={input}
            />
          </Field>

          <Field label="Body">
            <textarea
              value={draft.body}
              maxLength={4000}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="What you want every athlete to see…"
              rows={4}
              style={{ ...input, resize: "vertical", lineHeight: 1.5 }}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: space.md }}>
            <Field label="Level">
              <Select value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value as Draft["level"] })}>
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
              </Select>
            </Field>
            <Field label="Audience">
              <Select value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value as Draft["audience"] })}>
                <option value="all">Everyone</option>
                <option value="coaches">Coaches</option>
                <option value="clients">Clients</option>
              </Select>
            </Field>
            <Field label="Publish at (optional)">
              <input
                type="datetime-local"
                value={draft.publishAt}
                onChange={(e) => setDraft({ ...draft, publishAt: e.target.value })}
                style={input}
              />
            </Field>
            <Field label="Expires at (optional)">
              <input
                type="datetime-local"
                value={draft.expiresAt}
                onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
                style={input}
              />
            </Field>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: space.sm, margin: "6px 0 16px", cursor: "pointer" }}>
            <input type="checkbox" checked={draft.pinned} onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })} />
            <Mono s={{ fontSize: fs.bodyLg }} c={CHALK}>Pin as a dismissible banner at the top of the app</Mono>
          </label>

          {err && (
            <div role="alert">
              <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 12 }} c={RED}>
                {err}
              </Mono>
            </div>
          )}

          <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
            <button disabled={busy} onClick={() => save("draft")} style={secondaryBtn}>
              Save draft
            </button>
            <button disabled={busy} onClick={() => save("published")} style={primaryBtn}>
              {editing === "new" ? "Publish" : "Save & publish"}
            </button>
            <button disabled={busy} onClick={() => setEditing(null)} style={ghostBtn}>
              Cancel
            </button>
          </div>
        </Card>
      )}

      {err && editing === null && (
        <div role="alert">
          <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 12 }} c={RED}>
            {err}
          </Mono>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: space.ms }}>
        {list?.map((a) => (
          <Card key={a.id} style={{ borderLeft: `3px solid ${STATUS_COLOR[a.status]}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: space.md, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ marginBottom: 6 }}>
                  <Chip c={STATUS_COLOR[a.status]}>{a.status}</Chip>
                  <Chip c={LEVEL_COLOR[a.level]}>{a.level}</Chip>
                  <Chip c={ASH}>{a.audience}</Chip>
                  {a.pinned && <Chip c={AMBER}>📌 pinned</Chip>}
                </div>
                <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle }}>{a.title}</div>
                <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.5, display: "block", marginTop: 4, whiteSpace: "pre-wrap" }} c={ASH}>
                  {a.body}
                </Mono>
                <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={ASH}>
                  {a.authorEmail}
                  {a.publishAt ? ` · live ${new Date(a.publishAt).toLocaleString()}` : ""}
                  {a.expiresAt ? ` · ends ${new Date(a.expiresAt).toLocaleString()}` : ""}
                </Mono>
              </div>
            </div>

            <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap", marginTop: 14 }}>
              <button disabled={busy} onClick={() => openEdit(a)} style={miniBtn}>Edit</button>
              {a.status !== "published" ? (
                <button disabled={busy} onClick={() => patch(a.id, { status: "published" })} style={miniBtn}>Publish</button>
              ) : (
                <button disabled={busy} onClick={() => patch(a.id, { status: "draft" })} style={miniBtn}>Unpublish</button>
              )}
              {a.status !== "archived" && (
                <button disabled={busy} onClick={() => patch(a.id, { status: "archived" })} style={miniBtn}>Archive</button>
              )}
              <button disabled={busy} onClick={() => patch(a.id, { pinned: !a.pinned })} style={miniBtn}>
                {a.pinned ? "Unpin" : "Pin"}
              </button>
              <button disabled={busy} onClick={() => remove(a)} style={{ ...miniBtn, color: txt(RED), borderColor: `${RED}55` }}>
                Delete
              </button>
            </div>
          </Card>
        ))}

        {list && list.length === 0 && (
          <Card>
            <Mono s={{ fontSize: fs.bodyLg, textAlign: "center", display: "block", padding: 24 }} c={ASH}>
              No announcements yet. Create one to broadcast to the app.
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
      <Mono s={{ fontSize: fs.micro, letterSpacing: ".1em", textTransform: "uppercase", display: "block", marginBottom: 6 }} c={ASH}>
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
  letterSpacing: ".05em",
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
  letterSpacing: ".04em",
  padding: "8px 12px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  border: `1px solid ${LINE}`,
  background: INK,
  color: CHALK,
};
