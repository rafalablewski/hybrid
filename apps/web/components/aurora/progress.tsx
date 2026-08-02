"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fs, space } from "@hybrid/core";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";

const BUCKET = "progress";
type Photo = { name: string; path: string; url: string; date: string };

/** AURORA Progress photos (web) — same private Supabase Storage capture/timeline
 *  as the classic, in the rounded Aurora style. */
export default function AuroraProgress() {
  const { t } = useLang();
  const supabase = isSupabaseConfigured() ? createClient() : null;
  const [uid, setUid] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "no-auth" | "no-bucket">("loading");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const C = (v: string) => `var(--color-${v})`;

  const load = useCallback(async () => {
    if (!supabase) return setStatus("no-auth");
    const { data: u } = await supabase.auth.getUser();
    const id = u.user?.id ?? null;
    setUid(id);
    if (!id) return setStatus("no-auth");
    const { data, error } = await supabase.storage.from(BUCKET).list(id, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    if (error) return setStatus("no-bucket");
    const files = (data ?? []).filter((f) => f.id);
    const paths = files.map((f) => `${id}/${f.name}`);
    const signed = paths.length ? (await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)).data ?? [] : [];
    setPhotos(files.map((f, i) => ({
      name: f.name,
      path: `${id}/${f.name}`,
      url: signed[i]?.signedUrl ?? "",
      date: new Date(Number(f.name.split(".")[0]) || Date.parse(f.created_at ?? "") || Date.now()).toLocaleDateString(),
    })));
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

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
  const notice = (color: string, body: React.ReactNode) => (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ ...card, color }}>{body}</div>
    </div>
  );

  if (status === "no-auth") return notice(C("chalk"), t("w.recovery.progress.noAuth"));
  if (status === "no-bucket") return notice(C("red"), <>{t("w.recovery.progress.noBucketPre")} <strong>progress</strong> {t("w.recovery.progress.noBucketMid")} <strong>reference/sql-progress-photos.sql</strong> {t("w.recovery.progress.noBucketPost")}</>);

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{t("w.recovery.progress.title")}</h1>

      <div style={{ ...card, marginTop: 16 }}>
        <p style={{ fontSize: fs.bodyLg, lineHeight: 1.6, margin: "0 0 16px" }}>{t("w.recovery.progress.intro")}</p>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: space.sm, fontWeight: 700, fontSize: fs.note, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "12px 24px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}>
          <AuroraIcon name="add" size={18} color={C("ink")} />{busy ? t("w.recovery.progress.uploading") : t("w.recovery.progress.addPhoto")}
        </button>
      </div>

      {photos.length === 0 ? (
        <div style={{ fontSize: fs.body, color: C("ash"), marginTop: 16 }}>{t("w.recovery.progress.empty")}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: space.md, marginTop: 16 }}>
          {photos.map((p) => (
            <div key={p.path} style={{ border: `1px solid ${C("line")}`, borderRadius: 28, overflow: "hidden", background: C("ink2") }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.date} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption }}>{p.date}</span>
                <button onClick={() => remove(p.path)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("red"), background: "none", border: "none", cursor: "pointer" }}>{t("w.recovery.progress.delete")}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
