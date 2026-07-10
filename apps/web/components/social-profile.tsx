"use client";

import { useEffect, useState } from "react";
import { normalizeHandle, isValidHandle, AVATAR_PRESETS } from "@hybrid/core";
import { useDialog } from "../lib/use-dialog";
import {
  C, useSocialTheme, card, Avatar, Btn, Pill, FollowButton, EmptyState, ScreenHead, Stars,
  VerifiedTick, jget, jsend, useBusy,
} from "./social-ui";

interface Stats { totalSessions: number; totalVolumeKg: number; currentStreak: number; topLifts: { lift: string; e1rm: number }[] }
interface MyProfile { handle: string; displayName: string | null; bio: string | null; visibility: string; avatarUrl: string | null }

function StatRow({ stats }: { stats: Stats | null }) {
  if (!stats) return null;
  const items = [
    { label: "Sessions", value: stats.totalSessions.toLocaleString() },
    { label: "Volume", value: `${Math.round(stats.totalVolumeKg / 1000)}t` },
    { label: "Streak", value: `${stats.currentStreak}d` },
  ];
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
      {items.map((i) => (
        <div key={i.label} style={{ flex: 1, textAlign: "center", padding: "10px 6px", background: C("ink2"), borderRadius: 12 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: C("chalk") }}>{i.value}</div>
          <div style={{ fontSize: 11, color: C("ash"), textTransform: "uppercase", letterSpacing: 0.5 }}>{i.label}</div>
        </div>
      ))}
    </div>
  );
}

// ----- A slide-over for viewing ANY user's public profile (reused by feed / discover / leaderboard).
export function ProfileDrawer({ handle, onClose }: { handle: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [compare, setCompare] = useState<any>(null);
  const busy = useBusy();
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  const load = () => jget(`/api/social/profile/${handle}`).then(setData);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [handle]);

  const p = data?.profile;
  const relation: string = data?.relation ?? "none";

  const doFollow = () => busy.run("f", async () => { await jsend("/api/social/follow", "POST", { handle }); await load(); });
  const doUnfollow = () => busy.run("f", async () => { await jsend("/api/social/follow", "DELETE", { handle }); await load(); });
  const runCompare = () => busy.run("c", async () => { const r: any = await jget(`/api/social/compare?handle=${handle}`); setCompare(r.compare ?? null); });
  const doBlock = () => { if (!window.confirm(`Block @${handle}? You'll disappear from each other's feeds, search and leaderboards.`)) return; busy.run("b", async () => { await jsend("/api/social/block", "POST", { handle }); onClose(); }); };
  const doReport = () => { if (!p?.userId) return; if (!window.confirm(`Report @${handle} to the moderators?`)) return; busy.run("r", async () => { await jsend("/api/reports", "POST", { targetType: "socialProfile", targetId: p.userId, reason: "inappropriate" }); alert("Thanks — reported to the moderators."); }); };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ width: "min(460px, 100%)", height: "100%", background: C("ink"), borderLeft: `1px solid ${C("line")}`, padding: 20, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: C("ash"), fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        {!p ? (
          <EmptyState title="Loading…" />
        ) : (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={64} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: C("chalk") }}>{p.displayName || `@${p.handle}`}</span>
                  {p.coachVerified && <VerifiedTick />}
                </div>
                <div style={{ color: C("ash"), fontFamily: "var(--font-mono)", fontSize: 13 }}>@{p.handle}</div>
              </div>
            </div>
            {p.bio && <p style={{ color: C("chalk"), fontSize: 14, lineHeight: 1.5, marginTop: 12 }}>{p.bio}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <FollowButton relation={relation} onFollow={doFollow} onUnfollow={doUnfollow} busy={busy.is("f")} />
              {data?.canViewResults && relation !== "self" && <Btn ghost small onClick={runCompare} disabled={busy.is("c")}>Compare</Btn>}
              {p.isCoach && <Btn ghost small onClick={() => { window.location.hash = `coaches`; }}>View coaching →</Btn>}
            </div>

            {data?.canViewResults ? (
              <StatRow stats={data.stats} />
            ) : (
              <div style={{ marginTop: 14, padding: 14, background: C("ink2"), borderRadius: 12, color: C("ash"), fontSize: 13 }}>
                🔒 This athlete's results are private. {relation === "requested" ? "Your follow request is pending." : "Follow them to see their training."}
              </div>
            )}

            {data?.stats?.topLifts?.length > 0 && data.canViewResults && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: C("ash"), textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Top lifts</div>
                {data.stats.topLifts.map((l: any) => (
                  <div key={l.lift} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C("line")}` }}>
                    <span style={{ color: C("chalk") }}>{l.lift}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: C("lime") }}>{l.e1rm} kg</span>
                  </div>
                ))}
              </div>
            )}

            {relation !== "self" && (
              <div style={{ display: "flex", gap: 16, marginTop: 18, borderTop: `1px solid ${C("line")}`, paddingTop: 14 }}>
                <button onClick={doReport} disabled={busy.is("r")} style={{ background: "none", border: "none", cursor: "pointer", color: C("ash"), fontSize: 12, fontFamily: "var(--font-display)" }}>⚐ Report</button>
                <button onClick={doBlock} disabled={busy.is("b")} style={{ background: "none", border: "none", cursor: "pointer", color: C("red"), fontSize: 12, fontFamily: "var(--font-display)" }}>⊘ Block</button>
              </div>
            )}

            {compare && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: C("chalk"), marginBottom: 8 }}>
                  You {compare.score.a} — {compare.score.b} {p.displayName || "@" + p.handle}
                </div>
                {[...compare.lines, ...compare.sharedLifts.map((s: any) => ({ ...s, label: s.lift, unit: "kg" }))].map((l: any, i: number) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C("line")}` }}>
                    <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: l.leader === "a" ? C("lime") : C("chalk") }}>{l.a}{l.unit}</span>
                    <span style={{ fontSize: 11, color: C("ash"), textAlign: "center", whiteSpace: "nowrap" }}>{l.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: l.leader === "b" ? C("lime") : C("chalk") }}>{l.b}{l.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

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
  const { aurora } = useSocialTheme();
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<MyProfile>({ handle: "", displayName: "", bio: "", visibility: "followers", avatarUrl: "" });
  const [err, setErr] = useState<string | null>(null);
  const [avail, setAvail] = useState<null | "checking" | "ok" | "taken">(null);
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const d: any = await jget("/api/social/profile");
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
        const r: any = await jget(`/api/social/profile/${h}`);
        if (active) setAvail(r?.profile ? "taken" : "ok");
      } catch { if (active) setAvail("ok"); }
    }, 450);
    return () => { active = false; clearTimeout(id); };
  }, [form.handle, data]);

  // Persist all social fields at once; returns success so a focused field editor
  // closes only when the save actually went through.
  const saveSocial = async (): Promise<boolean> => {
    setErr(null);
    const h = normalizeHandle(form.handle);
    if (!isValidHandle(h)) { setErr("Handle must be 3–20 chars: a–z, 0–9, _"); return false; }
    const r: any = await jsend("/api/social/profile", "PUT", { ...form, handle: h });
    if (r.error) { setErr(r.error); return false; }
    onProfileUpdate?.({ handle: h, displayName: form.displayName, bio: form.bio, avatarUrl: form.avatarUrl });
    return true;
  };
  const fieldSaveSocial = async () => { setSaving(true); const ok = await saveSocial(); setSaving(false); if (ok) setEditing(null); };

  if (!data) return <EmptyState title="Loading…" />;
  const claimed = !!data.profile;
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: aurora ? 14 : 8, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontFamily: "var(--font-display)", fontSize: 14 } as const;
  const hNorm = normalizeHandle(form.handle);
  const fmtValid = isValidHandle(hNorm);
  const isMine = !!data?.profile && hNorm === data.profile.handle;
  const bioLen = (form.bio ?? "").length;
  const visLabel = form.visibility === "public" ? "Public" : form.visibility === "private" ? "Private" : "Followers";

  // ── FOCUSED FIELD EDITOR ──────────────────────────────────────────────────
  if (editing) {
    const back = () => { setErr(null); setEditing(null); };
    const titles: Record<FieldKey, string> = { name: "Your name", handle: "Username", displayName: "Display name", bio: "Bio", email: "Email", visibility: "Who can see your results" };
    return (
      <div>
        <button onClick={back} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, marginBottom: 16, cursor: "pointer", color: C("chalk") }}>
          <span style={{ fontSize: 20 }}>‹</span>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20 }}>{titles[editing]}</span>
        </button>
        {editing === "name" && account && (<>
          <input autoFocus style={inputStyle} value={account.name} onChange={(e) => account.setName(e.target.value)} placeholder="Your name" />
          <div style={{ marginTop: 12 }}><Btn onClick={() => { account.saveName(); back(); }} disabled={account.busy}>Save</Btn></div>
        </>)}
        {editing === "email" && account && (<>
          <input autoFocus type="email" style={inputStyle} value={account.newEmail} onChange={(e) => account.setNewEmail(e.target.value)} placeholder={account.email ?? "new@email.com"} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 8 }}>We’ll email the new address to confirm the change.</div>
          <div style={{ marginTop: 12 }}><Btn onClick={() => { account.changeEmail(); back(); }} disabled={account.busy || !account.newEmail.trim()}>Update email</Btn></div>
        </>)}
        {editing === "handle" && (<>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: C("ash"), fontFamily: "var(--font-mono)" }}>@</span><input autoFocus style={inputStyle} value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="handle" /></div>
          {form.handle.length > 0 && (
            <div aria-live="polite" style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11 }}>
              {!fmtValid ? <span style={{ color: C("red") }}>✕ Handle must be 3–20 chars: a–z, 0–9, _</span>
                : avail === "taken" ? <span style={{ color: C("red") }}>✕ @{hNorm} is taken</span>
                : avail === "checking" ? <span style={{ color: C("ash") }}>Checking availability…</span>
                : <span style={{ color: "var(--lime-text)" }}>✓ {isMine ? "This is your handle" : `@${hNorm} is available`}</span>}
            </div>
          )}
          {err && <div role="alert" style={{ color: C("red"), fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ marginTop: 12 }}><Btn onClick={fieldSaveSocial} disabled={saving}>{saving ? "Saving…" : claimed ? "Save" : "Claim handle"}</Btn></div>
        </>)}
        {editing === "displayName" && (<>
          <input autoFocus style={inputStyle} value={form.displayName ?? ""} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Optional" />
          {err && <div role="alert" style={{ color: C("red"), fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ marginTop: 12 }}><Btn onClick={fieldSaveSocial} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn></div>
        </>)}
        {editing === "bio" && (<>
          <textarea autoFocus style={{ ...inputStyle, minHeight: 96, resize: "vertical" }} value={form.bio ?? ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={280} placeholder="Hybrid athlete · runner · lifter…" />
          <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: bioLen >= 280 ? C("red") : C("ash"), marginTop: 6 }}>{bioLen}/280</div>
          {err && <div role="alert" style={{ color: C("red"), fontSize: 13, marginTop: 4 }}>{err}</div>}
          <div style={{ marginTop: 12 }}><Btn onClick={fieldSaveSocial} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn></div>
        </>)}
        {editing === "visibility" && (<>
          <div style={{ display: "flex", gap: 8 }}>
            {(["public", "followers", "private"] as const).map((v) => (
              <Pill key={v} active={form.visibility === v} onClick={() => setForm({ ...form, visibility: v })}>{v === "public" ? "Public" : v === "followers" ? "Followers" : "Private"}</Pill>
            ))}
          </div>
          {err && <div role="alert" style={{ color: C("red"), fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ marginTop: 12 }}><Btn onClick={fieldSaveSocial} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn></div>
        </>)}
      </div>
    );
  }

  // ── LIST (preview + avatar + tappable rows) ───────────────────────────────
  const rows: { key: FieldKey; label: string; value: string; muted: boolean }[] = [
    ...(account ? [{ key: "name" as const, label: "Name", value: account.name || "Add your name", muted: !account.name }] : []),
    { key: "handle", label: "Username", value: form.handle ? `@${form.handle}` : "Claim a handle", muted: !form.handle },
    { key: "displayName", label: "Display name", value: form.displayName || "Optional", muted: !form.displayName },
    { key: "bio", label: "Bio", value: form.bio || "Add a bio", muted: !form.bio },
    ...(account ? [{ key: "email" as const, label: "Email", value: account.email || "Add an email", muted: !account.email }] : []),
    { key: "visibility", label: "Visibility", value: visLabel, muted: false },
  ];

  const body = (
    <>
      {/* Live "what followers see" preview — updates as you type. */}
      <div style={{ position: "relative", borderRadius: aurora ? 16 : 10, padding: 14, marginBottom: 16, background: C("ink2"), border: `1px solid ${C("line")}` }}>
        <span style={{ position: "absolute", top: 12, right: 12, fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: C("ash"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "3px 9px" }}>{visLabel}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar url={form.avatarUrl} name={form.displayName || form.handle} handle={form.handle} size={48} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, color: C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.displayName || form.handle || "Your name"}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--lime-text)" }}>@{form.handle || "handle"}</div>
          </div>
        </div>
        {form.bio ? <div style={{ fontSize: 13, color: C("chalk"), marginTop: 10, lineHeight: 1.5 }}>{form.bio}</div> : null}
      </div>

      {/* Avatar — preview + one-tap branded gradient presets (photo upload soon). */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Avatar url={form.avatarUrl} name={form.displayName || form.handle} handle={form.handle} size={72} />
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "center" }}>
          {AVATAR_PRESETS.map((p) => (
            <button key={p.id} onClick={() => setForm({ ...form, avatarUrl: p.uri })} aria-label={`Preset ${p.id}`} aria-pressed={form.avatarUrl === p.uri}
              style={{ width: 34, height: 34, borderRadius: "50%", padding: 0, cursor: "pointer", overflow: "hidden", background: "none", border: `2px solid ${form.avatarUrl === p.uri ? C("lime") : "transparent"}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.uri} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {form.avatarUrl && <Btn onClick={fieldSaveSocial} disabled={saving}>{saving ? "Saving…" : "Save photo"}</Btn>}
          <button disabled title="Photo upload is coming soon" style={{ fontFamily: "var(--font-mono)", fontSize: 12, padding: "8px 12px", borderRadius: aurora ? 12 : 8, border: `1px solid ${C("line")}`, background: "transparent", color: C("ash"), cursor: "not-allowed", whiteSpace: "nowrap" }}>Upload photo (soon)</button>
        </div>
      </div>

      {/* Tap-a-row list. */}
      <div style={{ border: `1px solid ${C("line")}`, borderRadius: aurora ? 16 : 10, overflow: "hidden" }}>
        {rows.map((row, i) => (
          <button key={row.key} onClick={() => setEditing(row.key)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "13px 14px", background: "none", border: "none", borderTop: i > 0 ? `1px solid ${C("line")}` : "none", cursor: "pointer" }}>
            <span style={{ width: 92, flex: "none", fontSize: 12, color: C("ash") }}>{row.label}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: row.muted ? C("ash") : C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.value}</span>
            <span style={{ color: C("ash"), fontSize: 16 }}>›</span>
          </button>
        ))}
      </div>

      {onDone && <div style={{ marginTop: 14 }}><Btn ghost onClick={onDone}>Done</Btn></div>}
      {account?.msg && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", marginTop: 10, color: account.msg.startsWith("✓") ? "var(--lime-text)" : C("ash") }}>{account.msg}</div>}
    </>
  );

  if (embedded) return body;
  return (
    <div style={{ maxWidth: 460 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginBottom: 10 }}>Edit profile</div>
      <div style={card(aurora)}>{body}</div>
    </div>
  );
}
