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
export function SocialProfileEdit({ onDone, embedded }: { onDone?: () => void; embedded?: boolean }) {
  const { aurora } = useSocialTheme();
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<MyProfile>({ handle: "", displayName: "", bio: "", visibility: "followers", avatarUrl: "" });
  const [err, setErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState(false);
  const busy = useBusy();

  const load = async () => {
    const d: any = await jget("/api/social/profile");
    setData(d);
    if (d.profile) setForm({ handle: d.profile.handle, displayName: d.profile.displayName ?? "", bio: d.profile.bio ?? "", visibility: d.profile.visibility, avatarUrl: d.profile.avatarUrl ?? "" });
    else setForm((f) => ({ ...f, handle: d.suggestedHandle ?? "" }));
  };
  useEffect(() => { load(); }, []);

  const save = () => busy.run("save", async () => {
    setErr(null);
    const h = normalizeHandle(form.handle);
    if (!isValidHandle(h)) { setErr("Handle must be 3–20 chars: a–z, 0–9, _"); return; }
    const r: any = await jsend("/api/social/profile", "PUT", { ...form, handle: h });
    if (r.error) { setErr(r.error); return; }
    if (onDone) onDone();
    else { setSavedMsg(true); setTimeout(() => setSavedMsg(false), 1500); }
  });

  if (!data) return <EmptyState title="Loading…" />;
  const claimed = !!data.profile;
  const field = (label: string, node: React.ReactNode) => (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", fontSize: 12, color: C("ash"), marginBottom: 4 }}>{label}</span>
      {node}
    </label>
  );
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: aurora ? 14 : 8, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontFamily: "var(--font-display)", fontSize: 14 } as const;

  const inner = (
    <>
      {!claimed && <p style={{ color: C("ash"), fontSize: 13, marginTop: 0 }}>Claim a handle so friends can find and follow you.</p>}
      {/* Avatar — a real preview + one-tap branded gradient presets. A photo
          upload is coming with the avatars Storage bucket (social-avatar-upload). */}
      {field("Profile photo", (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Avatar url={form.avatarUrl} name={form.displayName || form.handle} handle={form.handle} size={64} />
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {AVATAR_PRESETS.map((p) => (
                <button key={p.id} onClick={() => setForm({ ...form, avatarUrl: p.uri })} aria-label={`Preset ${p.id}`} aria-pressed={form.avatarUrl === p.uri}
                  style={{ width: 34, height: 34, borderRadius: "50%", padding: 0, cursor: "pointer", overflow: "hidden", background: "none", border: `2px solid ${form.avatarUrl === p.uri ? C("lime") : "transparent"}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.uri} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <button disabled title="Photo upload is coming soon" style={{ fontFamily: "var(--font-mono)", fontSize: 12, padding: "8px 12px", borderRadius: aurora ? 12 : 8, border: `1px solid ${C("line")}`, background: "transparent", color: C("ash"), cursor: "not-allowed", whiteSpace: "nowrap" }}>Upload photo (soon)</button>
            <input style={inputStyle} value={form.avatarUrl ?? ""} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} placeholder="or paste an image URL" />
          </div>
        </div>
      ))}
      {field("Handle", <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: C("ash"), fontFamily: "var(--font-mono)" }}>@</span><input style={inputStyle} value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="handle" /></div>)}
      {field("Display name", <input style={inputStyle} value={form.displayName ?? ""} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Optional" />)}
      {field("Bio", <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.bio ?? ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={280} placeholder="Hybrid athlete · runner · lifter…" />)}
      {field("Who can see your results", (
        <div style={{ display: "flex", gap: 8 }}>
          {(["public", "followers", "private"] as const).map((v) => (
            <Pill key={v} active={form.visibility === v} onClick={() => setForm({ ...form, visibility: v })}>{v === "public" ? "Public" : v === "followers" ? "Followers" : "Private"}</Pill>
          ))}
        </div>
      ))}
      {err && <div role="alert" style={{ color: C("red"), fontSize: 13, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Btn onClick={save} disabled={busy.is("save")}>{busy.is("save") ? "Saving…" : savedMsg ? "Saved ✓" : claimed ? "Save" : "Claim handle"}</Btn>
        {onDone && <Btn ghost onClick={onDone}>{claimed ? "Done" : "Back"}</Btn>}
      </div>
    </>
  );

  // Embedded (inside the unified Edit-profile card) drops the extra card + label.
  if (embedded) return inner;
  return (
    <div style={{ maxWidth: 460 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginBottom: 10 }}>Public profile</div>
      <div style={card(aurora)}>{inner}</div>
    </div>
  );
}
