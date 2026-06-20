"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
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
  txt,
} from "@/lib/ui";

const BUCKET = "media";

type Asset = {
  id: string;
  path: string;
  url: string;
  title: string;
  alt: string | null;
  kind: "image" | "video" | "other";
  contentType: string | null;
  sizeBytes: number | null;
  tags: string[];
  status: "draft" | "published" | "archived";
  authorEmail: string | null;
  createdAt: string;
};

const STATUS_COLOR: Record<string, string> = { draft: ASH, published: LIME, archived: AMBER };

function kindOf(ct: string): Asset["kind"] {
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  return "other";
}
function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
}
function fmtSize(b: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminMedia() {
  const supabase = isSupabaseConfigured() ? createClient() : null;
  const [list, setList] = useState<Asset[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ title: string; alt: string; tags: string }>({ title: "", alt: "", tags: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch("/api/admin/media")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        setList(d.assets ?? []);
      })
      .catch(() => setList([]));
  }, []);

  useEffect(load, [load]);

  async function upload(file: File) {
    if (!supabase) return setErr("Storage isn't configured (Supabase keys missing).");
    setBusy(true);
    setErr(null);
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    const path = `assets/${id}-${safeName(file.name)}`;
    const contentType = file.type || "application/octet-stream";

    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
    if (up.error) {
      setBusy(false);
      return setErr(`Upload failed: ${up.error.message}. Run reference/sql-media-library.sql and confirm you're an admin.`);
    }
    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    const res = await fetch("/api/admin/media", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path,
        url,
        title: file.name.replace(/\.[^.]+$/, ""),
        kind: kindOf(contentType),
        contentType,
        sizeBytes: file.size,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setErr(d.error ?? "Could not register the upload.");
    }
    load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/media/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
    } catch {
      setErr("That change didn't save — re-syncing.");
    }
    setBusy(false);
    setEdit(null);
    load();
  }

  async function remove(a: Asset) {
    if (!confirm(`Delete “${a.title}” permanently (file + catalog entry)?`)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/media/${a.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setErr("Delete failed — re-syncing.");
    }
    setBusy(false);
    load();
  }

  function copy(url: string, id: string) {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    });
  }

  function openEdit(a: Asset) {
    setEditForm({ title: a.title, alt: a.alt ?? "", tags: a.tags.join(", ") });
    setEdit(a.id);
  }

  if (unavailable)
    return (
      <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Media library not initialized</div>
        <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block" }} c={CHALK}>
          The <b>MediaAsset</b> table + <b>media</b> bucket don&apos;t exist yet. Run{" "}
          <span style={{ color: txt(AMBER) }}>reference/sql-media-library.sql</span> in the Supabase SQL Editor, then reload.
        </Mono>
      </Card>
    );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <Mono s={{ fontSize: 12 }} c={ASH}>
          {list ? `${list.length} asset${list.length === 1 ? "" : "s"}` : "…"} · public CDN URLs
        </Mono>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <button disabled={busy || !supabase} onClick={() => fileRef.current?.click()} style={{ ...primaryBtn, opacity: busy || !supabase ? 0.6 : 1 }}>
            {busy ? "Uploading…" : "↑ Upload media"}
          </button>
        </div>
      </div>
      <Mono s={{ fontSize: 11, display: "block", marginBottom: 16 }} c={ASH}>
        Upload demo clips + images once; copy a URL into an exercise&apos;s demo-video field or an announcement.
      </Mono>

      {err && <Mono s={{ fontSize: 12, display: "block", marginBottom: 14 }} c={RED}>{err}</Mono>}
      {!supabase && (
        <Card style={{ borderLeft: `3px solid ${AMBER}`, marginBottom: 14 }}>
          <Mono s={{ fontSize: 12, lineHeight: 1.5, display: "block" }} c={CHALK}>
            Storage isn&apos;t configured in this environment — uploading is disabled. The catalog below still lists
            registered assets.
          </Mono>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))", gap: 12 }}>
        {list?.map((a) => (
          <Card key={a.id} style={{ padding: 0, overflow: "hidden", borderLeft: `3px solid ${STATUS_COLOR[a.status] ?? ASH}` }}>
            <div style={{ aspectRatio: "16 / 10", background: INK, display: "grid", placeItems: "center", overflow: "hidden" }}>
              {a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.alt ?? a.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : a.kind === "video" ? (
                <video src={a.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline preload="metadata" />
              ) : (
                <span style={{ fontSize: 32, color: txt(ASH) }}>⎙</span>
              )}
            </div>

            <div style={{ padding: 12 }}>
              <div style={{ marginBottom: 6 }}>
                <Chip c={STATUS_COLOR[a.status] ?? ASH}>{a.status}</Chip>
                <Chip c={ASH}>{a.kind}</Chip>
                {a.sizeBytes ? <Chip c={ASH}>{fmtSize(a.sizeBytes)}</Chip> : null}
              </div>

              {edit === a.id ? (
                <div>
                  <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder="Title" style={input} />
                  <input value={editForm.alt} onChange={(e) => setEditForm({ ...editForm, alt: e.target.value })} placeholder="Alt / caption" style={{ ...input, marginTop: 6 }} />
                  <input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} placeholder="tags, comma-separated" style={{ ...input, marginTop: 6 }} />
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button disabled={busy} onClick={() => patch(a.id, { title: editForm.title, alt: editForm.alt || null, tags: editForm.tags.split(",").map((t) => t.trim()).filter(Boolean) })} style={miniBtn}>Save</button>
                    <button disabled={busy} onClick={() => setEdit(null)} style={miniBtn}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ ...disp, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
                  {a.tags.length > 0 && <div style={{ marginTop: 6 }}>{a.tags.map((t) => <Chip key={t} c={ASH}>{t}</Chip>)}</div>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    <button onClick={() => copy(a.url, a.id)} style={miniBtn}>{copied === a.id ? "Copied ✓" : "Copy URL"}</button>
                    <button disabled={busy} onClick={() => openEdit(a)} style={miniBtn}>Edit</button>
                    {a.status !== "published" ? (
                      <button disabled={busy} onClick={() => patch(a.id, { status: "published" })} style={miniBtn}>Publish</button>
                    ) : (
                      <button disabled={busy} onClick={() => patch(a.id, { status: "draft" })} style={miniBtn}>Unpublish</button>
                    )}
                    {a.status !== "archived" && <button disabled={busy} onClick={() => patch(a.id, { status: "archived" })} style={miniBtn}>Archive</button>}
                    <button disabled={busy} onClick={() => remove(a)} style={{ ...miniBtn, color: txt(RED), borderColor: `${RED}55` }}>Delete</button>
                  </div>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      {list && list.length === 0 && (
        <Card>
          <Mono s={{ fontSize: 13, textAlign: "center", display: "block", padding: 24 }} c={ASH}>
            No media yet. Upload a demo clip or image to start the library.
          </Mono>
        </Card>
      )}
    </div>
  );
}

const input: React.CSSProperties = {
  ...mono,
  width: "100%",
  fontSize: 12,
  padding: "8px 10px",
  borderRadius: "var(--r-field)",
  background: INK2,
  color: CHALK,
  border: `1px solid ${LINE}`,
  outline: "none",
  boxSizing: "border-box",
};
const primaryBtn: React.CSSProperties = {
  ...cond,
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  padding: "9px 16px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  background: LIME,
  color: ON_ACCENT,
  border: `1px solid ${LIME}`,
};
const miniBtn: React.CSSProperties = {
  ...cond,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  padding: "5px 10px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  border: `1px solid ${LINE}`,
  background: INK,
  color: CHALK,
};
