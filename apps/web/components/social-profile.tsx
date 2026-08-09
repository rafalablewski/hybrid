"use client";

import { accentText } from "@/lib/ui";
import { useEffect, useState } from "react";
import { normalizeHandle, isValidHandle, AVATAR_PRESETS } from "@hybrid/core";
import type { PublicProfileResponse, OwnProfileResponse, MutationResult } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { C, useSocialTheme, card, Avatar, Btn, Pill, EmptyState, jget, jsend } from "./social-ui";

/**
 * The profile EDITOR. Viewing SOMEBODY ELSE is not here any more: a person has
 * their own page now (components/user-page.tsx, `?s=user&u=<handle>`), and the
 * drawer this file used to carry was the reason a coach existed twice in the
 * product — once as an athlete you could peek at, once as a storefront.
 */

interface MyProfile { handle: string; displayName: string | null; bio: string | null; visibility: string; avatarUrl: string | null }

// ----- The EDIT form (handle · name · bio · avatar · privacy/visibility).
// Lives in Settings AND the dedicated Edit-profile surface — NOT inline on the
// Profile screen. `onDone` (when provided) shows a Back/Cancel + fires on save.
type FieldKey = "name" | "handle" | "displayName" | "bio" | "email" | "visibility";
interface AccountBits {
  name: string; setName: (v: string) => void; saveName: () => void;
  email?: string | null; newEmail: string; setNewEmail: (v: string) => void; changeEmail: () => void;
  busy: boolean; msg?: string | null;
}

export function SocialProfileEdit({ onDone, embedded, account, onProfileUpdate }: { onDone?: () => void; embedded?: boolean; account?: AccountBits; onProfileUpdate?: (p: Pick<MyProfile, "handle" | "displayName" | "bio" | "avatarUrl">) => void }) {
  const { t } = useLang();
  const { aurora } = useSocialTheme();
  const [data, setData] = useState<OwnProfileResponse | null>(null);
  const [form, setForm] = useState<MyProfile>({ handle: "", displayName: "", bio: "", visibility: "public", avatarUrl: "" });
  const [err, setErr] = useState<string | null>(null);
  const [avail, setAvail] = useState<null | "checking" | "ok" | "taken">(null);
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const d = await jget<OwnProfileResponse>("/api/social/profile");
    setData(d);
    if (d.profile) setForm({ handle: d.profile.handle, displayName: d.profile.displayName ?? "", bio: d.profile.bio ?? "", visibility: d.profile.visibility, avatarUrl: d.profile.avatarUrl ?? "" });
    else setForm((f) => ({ ...f, handle: d.suggestedHandle ?? "" }));
  };
  useEffect(() => { load(); }, []);

  // Live handle availability — debounced. Format is validated instantly; a
  // valid, changed handle is checked against the server (404 = free).
  useEffect(() => {
    const h = normalizeHandle(form.handle);
    if (!h || !isValidHandle(h)) { setAvail(null); return; }
    if (data?.profile && h === data.profile.handle) { setAvail("ok"); return; }
    setAvail("checking");
    let active = true; // ignore a stale response if the handle changed meanwhile
    const id = setTimeout(async () => {
      try {
        const r = await jget<PublicProfileResponse>(`/api/social/profile/${h}`);
        if (active) setAvail(r?.profile ? "taken" : "ok");
      } catch { if (active) setAvail("ok"); }
    }, 450);
    return () => { active = false; clearTimeout(id); };
  }, [form.handle, data]);

  // Persist all social fields at once; returns success so a focused field editor
  // closes only when the save actually went through.
  const saveSocial = async (override?: Partial<typeof form>): Promise<boolean> => {
    setErr(null);
    const next = { ...form, ...override };
    const h = normalizeHandle(next.handle);
    if (!isValidHandle(h)) { setErr(t("w.profile.handleRule")); return false; }
    const r = await jsend<MutationResult>("/api/social/profile", "PUT", { ...next, handle: h });
    if (r.error) { setErr(r.error); return false; }
    onProfileUpdate?.({ handle: h, displayName: next.displayName, bio: next.bio, avatarUrl: next.avatarUrl });
    return true;
  };
  const fieldSaveSocial = async () => { setSaving(true); const ok = await saveSocial(); setSaving(false); if (ok) setEditing(null); };

  if (!data) return <EmptyState title={t("common.loading")} />;
  const claimed = !!data.profile;
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: aurora ? 14 : 8, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontFamily: "var(--font-display)", fontSize: 14 } as const;
  const hNorm = normalizeHandle(form.handle);
  const fmtValid = isValidHandle(hNorm);
  const isMine = !!data?.profile && hNorm === data.profile.handle;
  const bioLen = (form.bio ?? "").length;

  // ── FOCUSED FIELD EDITOR ──────────────────────────────────────────────────
  if (editing) {
    const back = () => { setErr(null); setEditing(null); };
    const titles: Record<FieldKey, string> = { name: t("w.profile.titleName"), handle: t("w.profile.username"), displayName: t("w.profile.displayName"), bio: t("w.profile.bioLabel"), email: t("w.profile.email"), visibility: t("w.profile.whoCanSee") };
    return (
      <div>
        <button className="pressable" onClick={back} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, marginBottom: 16, cursor: "pointer", color: C("chalk") }}>
          <span style={{ fontSize: 20 }}>‹</span>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20 }}>{titles[editing]}</span>
        </button>
        {editing === "name" && account && (<>
          <input autoFocus style={inputStyle} value={account.name} onChange={(e) => account.setName(e.target.value)} placeholder={t("w.profile.namePlaceholder")} />
          <div style={{ marginTop: 12 }}><Btn onClick={() => { account.saveName(); back(); }} disabled={account.busy}>{t("common.save")}</Btn></div>
        </>)}
        {editing === "email" && account && (<>
          <input autoFocus type="email" style={inputStyle} value={account.newEmail} onChange={(e) => account.setNewEmail(e.target.value)} placeholder={account.email ?? "new@email.com"} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 8 }}>{t("w.profile.emailConfirm")}</div>
          <div style={{ marginTop: 12 }}><Btn onClick={() => { account.changeEmail(); back(); }} disabled={account.busy || !account.newEmail.trim()}>{t("w.profile.updateEmail")}</Btn></div>
        </>)}
        {editing === "handle" && (<>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: C("ash"), fontFamily: "var(--font-mono)" }}>@</span><input autoFocus style={inputStyle} value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder={t("w.profile.handlePlaceholder")} /></div>
          {form.handle.length > 0 && (
            <div aria-live="polite" style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11 }}>
              {!fmtValid ? <span style={{ color: accentText("red") }}>✕ {t("w.profile.handleRule")}</span>
                : avail === "taken" ? <span style={{ color: accentText("red") }}>✕ {t("w.profile.handleTaken").replace("{h}", hNorm)}</span>
                : avail === "checking" ? <span style={{ color: C("ash") }}>{t("w.profile.checking")}</span>
                : <span style={{ color: "var(--lime-text)" }}>✓ {isMine ? t("w.profile.yourHandle") : t("w.profile.handleAvailable").replace("{h}", hNorm)}</span>}
            </div>
          )}
          {err && <div role="alert" style={{ color: accentText("red"), fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ marginTop: 12 }}><Btn onClick={fieldSaveSocial} disabled={saving}>{saving ? t("w.profile.saving") : claimed ? t("common.save") : t("w.profile.claimHandle")}</Btn></div>
        </>)}
        {editing === "displayName" && (<>
          <input autoFocus style={inputStyle} value={form.displayName ?? ""} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder={t("w.profile.optional")} />
          {err && <div role="alert" style={{ color: accentText("red"), fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ marginTop: 12 }}><Btn onClick={fieldSaveSocial} disabled={saving}>{saving ? t("w.profile.saving") : t("common.save")}</Btn></div>
        </>)}
        {editing === "bio" && (<>
          <textarea autoFocus style={{ ...inputStyle, minHeight: 96, resize: "vertical" }} value={form.bio ?? ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={280} placeholder={t("w.profile.bioPlaceholder")} />
          <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: bioLen >= 280 ? C("red") : C("ash"), marginTop: 6 }}>{bioLen}/280</div>
          {err && <div role="alert" style={{ color: accentText("red"), fontSize: 13, marginTop: 4 }}>{err}</div>}
          <div style={{ marginTop: 12 }}><Btn onClick={fieldSaveSocial} disabled={saving}>{saving ? t("w.profile.saving") : t("common.save")}</Btn></div>
        </>)}
        {editing === "visibility" && (<>
          <div style={{ display: "flex", gap: 8 }}>
            {(["public", "followers", "private"] as const).map((v) => (
              <Pill key={v} active={form.visibility === v} onClick={() => setForm({ ...form, visibility: v })}>{v === "public" ? t("w.profile.visPublic") : v === "followers" ? t("w.profile.visFollowers") : t("w.profile.visPrivate")}</Pill>
            ))}
          </div>
          {err && <div role="alert" style={{ color: accentText("red"), fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ marginTop: 12 }}><Btn onClick={fieldSaveSocial} disabled={saving}>{saving ? t("w.profile.saving") : t("common.save")}</Btn></div>
        </>)}
      </div>
    );
  }

  // ── SECTIONED editor ──────────────────────────────────────────────────────
  // Every part of the screen sits in a labelled section (Photo · Identity ·
  // Contact · Visibility) — the app-wide settings pattern. Text fields open the
  // focused editor; Visibility is an inline segment that saves on change.
  const identityRows: { key: FieldKey; label: string; value: string; muted: boolean }[] = [
    ...(account ? [{ key: "name" as const, label: t("w.profile.name"), value: account.name || t("w.profile.addName"), muted: !account.name }] : []),
    { key: "handle", label: t("w.profile.username"), value: form.handle ? `@${form.handle}` : t("w.profile.claimAHandle"), muted: !form.handle },
    { key: "displayName", label: t("w.profile.displayName"), value: form.displayName || t("w.profile.optional"), muted: !form.displayName },
    { key: "bio", label: t("w.profile.bioLabel"), value: form.bio || t("w.profile.addBio"), muted: !form.bio },
  ];
  const contactRows: { key: FieldKey; label: string; value: string; muted: boolean }[] =
    account ? [{ key: "email", label: t("w.profile.email"), value: account.email || t("w.profile.addEmail"), muted: !account.email }] : [];

  const pickVisibility = (v: "public" | "followers" | "private") => {
    setForm({ ...form, visibility: v });
    if (claimed) void (async () => { setSaving(true); await saveSocial({ visibility: v }); setSaving(false); })();
  };

  const secLabel = (text: string, first?: boolean) => (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginBottom: 10, marginLeft: 4, marginTop: first ? 0 : 20 }}>{text}</div>
  );
  const rowList = (items: { key: FieldKey; label: string; value: string; muted: boolean }[]) => (
    <div style={{ border: `1px solid ${C("line")}`, borderRadius: aurora ? 16 : 10, overflow: "hidden" }}>
      {items.map((row, i) => (
        <button className="pressable" key={row.key} onClick={() => setEditing(row.key)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "13px 14px", background: "none", border: "none", borderTop: i > 0 ? `1px solid ${C("line")}` : "none", cursor: "pointer" }}>
          <span style={{ width: 96, flex: "none", fontSize: 12, color: C("ash") }}>{row.label}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: row.muted ? C("ash") : C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.value}</span>
          <span style={{ color: C("ash"), fontSize: 16 }}>›</span>
        </button>
      ))}
    </div>
  );

  const body = (
    <>
      {/* ── PHOTO ── avatar + one-tap branded gradient presets (upload soon). */}
      {secLabel(t("w.profile.secPhoto"), true)}
      <div style={{ display: "flex", alignItems: "center", gap: 14, border: `1px solid ${C("line")}`, borderRadius: aurora ? 16 : 10, padding: 14 }}>
        <Avatar url={form.avatarUrl} name={form.displayName || form.handle} handle={form.handle} size={58} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: C("chalk") }}>{t("w.profile.presetAvatar")}</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
            {AVATAR_PRESETS.map((p) => (
              <button className="pressable" key={p.id} onClick={() => setForm({ ...form, avatarUrl: p.uri })} aria-label={t("w.profile.presetAria").replace("{n}", String(p.id))} aria-pressed={form.avatarUrl === p.uri}
                style={{ width: 30, height: 30, borderRadius: "50%", padding: 0, cursor: "pointer", overflow: "hidden", background: "none", border: `2px solid ${form.avatarUrl === p.uri ? C("lime") : "transparent"}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.uri} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        {form.avatarUrl && <Btn onClick={fieldSaveSocial} disabled={saving}>{saving ? t("w.profile.saving") : t("w.profile.savePhoto")}</Btn>}
        <button className="pressable" disabled title={t("w.profile.uploadSoonTitle")} style={{ fontFamily: "var(--font-mono)", fontSize: 12, padding: "8px 12px", borderRadius: aurora ? 12 : 8, border: `1px solid ${C("line")}`, background: "transparent", color: C("ash"), cursor: "not-allowed", whiteSpace: "nowrap" }}>{t("w.profile.uploadSoon")}</button>
      </div>

      {/* ── IDENTITY ── name, handle, display name, bio. */}
      {secLabel(t("w.profile.secIdentity"))}
      {rowList(identityRows)}

      {/* ── CONTACT ── account email. */}
      {contactRows.length > 0 && (<>{secLabel(t("w.profile.secContact"))}{rowList(contactRows)}</>)}

      {/* ── VISIBILITY ── inline segment, saves on change. */}
      {secLabel(t("w.profile.secVisibility"))}
      <div style={{ border: `1px solid ${C("line")}`, borderRadius: aurora ? 16 : 10, padding: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {(["public", "followers", "private"] as const).map((v) => (
            <Pill key={v} active={form.visibility === v} onClick={() => pickVisibility(v)}>{v === "public" ? t("w.profile.visPublic") : v === "followers" ? t("w.profile.visFollowers") : t("w.profile.visPrivate")}</Pill>
          ))}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 10 }}>{t("w.profile.visibilityNote")}</div>
      </div>

      {onDone && <div style={{ marginTop: 18 }}><Btn ghost onClick={onDone}>{t("common.done")}</Btn></div>}
      {err && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", marginTop: 10, color: accentText("red") }}>{err}</div>}
      {account?.msg && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", marginTop: 10, color: account.msg.startsWith("✓") ? "var(--lime-text)" : C("ash") }}>{account.msg}</div>}
    </>
  );

  if (embedded) return body;
  return (
    <div style={{ maxWidth: 460 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginBottom: 10 }}>{t("w.profile.editProfile")}</div>
      <div style={card(aurora)}>{body}</div>
    </div>
  );
}
