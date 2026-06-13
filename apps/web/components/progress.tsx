"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, RED, ON_ACCENT, disp, cond, mono, Mono, Card } from "@/lib/ui";

const BUCKET = "progress";
type Photo = { name: string; path: string; url: string; date: string };

// Progress photos — the strongest body-recomposition motivator. Images live in a
// private Supabase Storage bucket under the user's own folder (owner-folder RLS),
// listed straight from storage so there's no extra table to keep in sync.
export default function Progress() {
  const supabase = isSupabaseConfigured() ? createClient() : null;
  const [uid, setUid] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "no-auth" | "no-bucket">("loading");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!supabase) return setStatus("no-auth");
    const { data: u } = await supabase.auth.getUser();
    const id = u.user?.id ?? null;
    setUid(id);
    if (!id) return setStatus("no-auth");

    const { data, error } = await supabase.storage.from(BUCKET).list(id, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) return setStatus("no-bucket");
    const files = (data ?? []).filter((f) => f.id); // folders have null id
    const paths = files.map((f) => `${id}/${f.name}`);
    const signed = paths.length ? (await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)).data ?? [] : [];
    setPhotos(
      files.map((f, i) => ({
        name: f.name,
        path: `${id}/${f.name}`,
        url: signed[i]?.signedUrl ?? "",
        date: new Date(Number(f.name.split(".")[0]) || Date.parse(f.created_at ?? "") || Date.now()).toLocaleDateString(),
      })),
    );
    setStatus("ready");
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const upload = async (file: File) => {
    if (!supabase || !uid) return;
    setBusy(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${uid}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || "image/jpeg" });
    if (error) setStatus("no-bucket");
    else await load();
    setBusy(false);
  };

  const remove = async (path: string) => {
    if (!supabase) return;
    await supabase.storage.from(BUCKET).remove([path]);
    load();
  };

  if (status === "no-auth")
    return (
      <Card>
        <Mono s={{ fontSize: 13, lineHeight: 1.6 }}>
          Progress photos need a signed-in account with Supabase configured — the demo session has no private
          storage. Sign in to capture your transformation timeline.
        </Mono>
      </Card>
    );

  if (status === "no-bucket")
    return (
      <Card>
        <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block" }} c={RED}>
          The <strong>progress</strong> storage bucket isn&apos;t set up yet.
        </Mono>
        <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block", marginTop: 8 }}>
          Run <strong>reference/sql-progress-photos.sql</strong> in the Supabase SQL Editor — it creates the
          private bucket and owner-folder RLS. Then reload.
        </Mono>
      </Card>
    );

  return (
    <div style={{ maxWidth: 860 }}>
      <Card style={{ marginBottom: 16 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>Progress photos</Mono>
        <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block", margin: "8px 0 12px" }}>
          Same pose, same light, every couple of weeks. Private to you — stored under your own folder, never shared.
        </Mono>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          style={{ ...disp, fontWeight: 800, fontSize: 15, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 12, padding: "12px 24px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}>
          {busy ? "Uploading…" : "+ Add photo"}
        </button>
      </Card>

      {photos.length === 0 ? (
        <Mono s={{ fontSize: 13 }}>No photos yet — add your first to start the timeline.</Mono>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {photos.map((p) => (
            <div key={p.path} style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden", background: INK2 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.date} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px" }}>
                <Mono s={{ fontSize: 12 }}>{p.date}</Mono>
                <button onClick={() => remove(p.path)} style={{ ...cond, fontSize: 11, color: ASH, background: "none", border: "none", cursor: "pointer" }}>delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
