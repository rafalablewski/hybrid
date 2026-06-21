"use client";

import { useEffect, useState } from "react";
import { fs, space,
  buildTeamTree,
  flattenTree,
  canManageOrg,
  canRead,
  roleScope,
  ORG_ROLES,
  type OrgRole,
  type TeamNode,
} from "@hybrid/core";
import { useIsMobile } from "@/lib/use-media-query";
import { useLang } from "@/lib/i18n";

type Org = { id: string; name: string; role: OrgRole };
type Member = { id: string; userId: string; name: string; role: OrgRole; teamId: string | null; email?: string };
type Invite = { id: string; email: string; role: OrgRole; teamId: string | null };
type Detail = { org: { id: string; name: string }; myRole: OrgRole; myTeamId: string | null; teams: TeamNode[]; members: Member[]; invites: Invite[] };
type AthleteView = {
  name: string;
  hpi: { score: number; band: string; limiter: string };
  readiness: { score: number };
  summary: string;
  sessionCount: number;
  injury: { overall: number; band: string; flaggedCount: number; tissues?: { tissue: string; risk: number; band: string }[] };
};

const C = (v: string) => `var(--color-${v})`;

const hpiColor = (b: string) =>
  b === "peak" || b === "primed" || b === "low" ? "lime" : b === "moderate" ? "blue" : b === "compromised" || b === "elevated" ? "amber" : "red";

const ROLE_COLOR: Record<OrgRole, string> = {
  OWNER: "lime",
  DIRECTOR: "lime",
  COACH: "blue",
  MEDICAL: "amber",
  ANALYST: "violet",
  ATHLETE: "ash",
};

/** AURORA Org Graph (web) — same /api/org flow, team hierarchy + role-scoped
 *  staff management and Performance State, in the rounded Aurora style. */
export default function AuroraOrg() {
  const { t } = useLang();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [newOrg, setNewOrg] = useState("");
  const [newTeam, setNewTeam] = useState("");
  const [newTeamParent, setNewTeamParent] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("COACH");
  const [inviteErr, setInviteErr] = useState("");
  const [athlete, setAthlete] = useState<AthleteView | null>(null);
  const isMobile = useIsMobile();

  const loadOrgs = async () => {
    const res = await fetch("/api/org");
    if (res.ok) {
      const d = (await res.json()) as { orgs: Org[] };
      setOrgs(d.orgs);
      if (!selected && d.orgs[0]) setSelected(d.orgs[0].id);
    }
  };
  const loadDetail = async (id: string) => {
    const res = await fetch(`/api/org/${id}`);
    setDetail(res.ok ? ((await res.json()) as Detail) : null);
  };

  useEffect(() => {
    loadOrgs();
  }, []);
  useEffect(() => {
    if (selected) loadDetail(selected);
  }, [selected]);

  const createOrg = async () => {
    if (!newOrg.trim()) return;
    const res = await fetch("/api/org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newOrg }),
    });
    if (res.ok) {
      const d = (await res.json()) as { org: Org };
      setNewOrg("");
      await loadOrgs();
      setSelected(d.org.id);
    }
  };

  const addTeam = async () => {
    if (!selected || !newTeam.trim()) return;
    const res = await fetch(`/api/org/${selected}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTeam, parentId: newTeamParent || undefined }),
    });
    if (res.ok) {
      setNewTeam("");
      setNewTeamParent("");
      loadDetail(selected);
    }
  };

  const invite = async () => {
    if (!selected || !inviteEmail.trim()) return;
    setInviteErr("");
    const res = await fetch(`/api/org/${selected}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    if (res.ok) {
      const d = (await res.json().catch(() => ({}))) as { pending?: boolean };
      setInviteEmail("");
      setInviteErr(d.pending ? t("w.teams.org.invitedPending") : "");
      loadDetail(selected);
    } else {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setInviteErr(d.error ?? t("w.teams.org.couldNotAddMember"));
    }
  };

  const revokeInvite = async (iid: string) => {
    if (!selected) return;
    const res = await fetch(`/api/org/${selected}/invites/${iid}`, { method: "DELETE" });
    if (res.ok) loadDetail(selected);
  };

  const setMember = async (mid: string, patch: { role?: OrgRole; teamId?: string | null }) => {
    if (!selected) return;
    const res = await fetch(`/api/org/${selected}/members/${mid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) loadDetail(selected);
  };

  const viewAthlete = async (m: Member) => {
    if (!selected) return;
    setAthlete(null);
    const res = await fetch(`/api/org/${selected}/athlete/${m.userId}`);
    if (res.ok) {
      const d = (await res.json()) as Omit<AthleteView, "name">;
      setAthlete({ ...d, name: m.name });
    }
  };

  const tree = detail ? flattenTree(buildTeamTree(detail.teams)) : [];
  const canManage = detail ? canManageOrg(detail.myRole) : false;
  const canSeeAthletes = detail ? canRead(detail.myRole, "performance") : false;
  const teamName = (tid: string | null) => tree.find((t) => t.id === tid)?.name ?? "—";

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;
  const kicker = (color: string): React.CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C(color) });
  const input: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, padding: "10px 12px", borderRadius: 14, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, outline: "none" };
  const btn = (bg: string): React.CSSProperties => ({ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.body, background: C(bg), color: C("ink"), border: "none", borderRadius: 999, padding: "10px 18px", cursor: "pointer" });
  const orgChip = (active: boolean): React.CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: fs.caption, padding: "8px 14px", borderRadius: 999, cursor: "pointer", background: active ? `color-mix(in srgb, ${C("lime")} 16%, transparent)` : "transparent", color: active ? C("lime") : C("ash"), border: `1px solid ${active ? C("lime") : C("line")}` });
  const chip = (color: string, label: React.ReactNode) => <span style={{ background: `color-mix(in srgb, ${C(color)} 14%, transparent)`, color: C(color), borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro, marginRight: 6, marginBottom: 4, display: "inline-block" }}>{label}</span>;
  const selectStyle: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: fs.body, padding: "9px 12px", borderRadius: 14, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, outline: "none", cursor: "pointer" };

  return (
    <div style={{ display: "grid", gap: space.lg, fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={card}>
        <div style={kicker("lime")}>{t("w.teams.org.headerKicker")}</div>
        <div style={{ display: "flex", gap: space.sm, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          {orgs.map((o) => (
            <button key={o.id} onClick={() => setSelected(o.id)} style={orgChip(o.id === selected)}>
              {o.name} · {o.role.toLowerCase()}
            </button>
          ))}
          {orgs.length === 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{t("w.teams.org.noOrgs")}</span>}
        </div>
        <div style={{ display: "flex", gap: space.sm, marginTop: 12, flexWrap: "wrap" }}>
          <input value={newOrg} onChange={(e) => setNewOrg(e.target.value)} placeholder={t("w.teams.org.newOrgPlaceholder")} style={{ ...input, flex: "1 1 200px", minWidth: 0 }} />
          <button onClick={createOrg} style={btn("lime")}>{t("w.teams.org.createOrg")}</button>
        </div>
      </div>

      {detail && (
        <>
          <div style={card}>
            <div style={kicker("blue")}>{t("w.teams.org.yourAccess")} · {detail.myRole.toLowerCase()}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, marginTop: 6, color: C("chalk") }}>{roleScope(detail.myRole)}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: space.lg }}>
            <div style={card}>
              <div style={kicker("ash")}>{t("w.teams.org.teamHierarchy")}</div>
              <div style={{ marginTop: 12 }}>
                {tree.length === 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{t("w.teams.org.noTeams")}</span>}
                {tree.map((node) => {
                  const count = detail.members.filter((m) => m.teamId === node.id).length;
                  return (
                    <div key={node.id} style={{ padding: "8px 10px", marginLeft: node.depth * 18, marginBottom: 4 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, color: C("chalk") }}>{node.name}</span>
                      {count > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginLeft: 8, color: C("ash") }}>{count} {count === 1 ? t("w.teams.org.member") : t("w.teams.org.members")}</span>}
                    </div>
                  );
                })}
              </div>
              {canManage && (
                <div style={{ display: "flex", gap: space.sm, marginTop: 12, flexWrap: "wrap" }}>
                  <input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder={t("w.teams.org.newTeamPlaceholder")} style={{ ...input, flex: "1 1 140px", minWidth: 0 }} />
                  <select value={newTeamParent} onChange={(e) => setNewTeamParent(e.target.value)} style={selectStyle}>
                    <option value="">{t("w.teams.org.topLevel")}</option>
                    {tree.map((node) => (
                      <option key={node.id} value={node.id}>{"— ".repeat(node.depth)}{node.name}</option>
                    ))}
                  </select>
                  <button onClick={addTeam} style={btn("lime")}>{t("w.teams.org.addTeam")}</button>
                </div>
              )}
            </div>

            <div style={card}>
              <div style={kicker("ash")}>{t("w.teams.org.staffAthletes")}</div>
              <div style={{ marginTop: 12 }}>
                {detail.members.map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.sm, flexWrap: "wrap", padding: "8px 0", borderBottom: `1px solid ${C("line")}` }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, display: "block", color: m.role === "ATHLETE" && canSeeAthletes ? C("blue") : C("chalk") }}>
                        {m.role === "ATHLETE" && canSeeAthletes ? (
                          <span style={{ cursor: "pointer" }} onClick={() => viewAthlete(m)}>{m.name} →</span>
                        ) : (
                          m.name
                        )}
                        {m.email ? <span style={{ color: C("ash") }}> · {m.email}</span> : null}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{teamName(m.teamId)}</span>
                    </div>
                    {canManage ? (
                      <div style={{ display: "flex", gap: space.xs }}>
                        <select value={m.role} onChange={(e) => setMember(m.id, { role: e.target.value as OrgRole })} style={{ ...selectStyle, fontSize: fs.micro, padding: "5px 7px" }}>
                          {ORG_ROLES.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
                        </select>
                        <select value={m.teamId ?? ""} onChange={(e) => setMember(m.id, { teamId: e.target.value || null })} style={{ ...selectStyle, fontSize: fs.micro, padding: "5px 7px" }}>
                          <option value="">{t("w.teams.org.noTeam")}</option>
                          {tree.map((node) => <option key={node.id} value={node.id}>{"— ".repeat(node.depth)}{node.name}</option>)}
                        </select>
                      </div>
                    ) : (
                      chip(ROLE_COLOR[m.role], m.role.toLowerCase())
                    )}
                  </div>
                ))}
              </div>
              {canManage && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
                    <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="member@email.com" style={{ ...input, flex: "1 1 160px", minWidth: 0 }} />
                    <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrgRole)} style={selectStyle}>
                      {ORG_ROLES.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
                    </select>
                    <button onClick={invite} style={btn("lime")}>{t("w.teams.org.addMember")}</button>
                  </div>
                  {inviteErr && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 6, color: C("amber") }}>{inviteErr}</div>}
                </div>
              )}
              {canManage && detail.invites.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{t("w.teams.org.pendingInvites")}</div>
                  {detail.invites.map((iv) => (
                    <div key={iv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C("line")}` }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{iv.email} · {iv.role.toLowerCase()}</span>
                      <span style={{ cursor: "pointer", color: C("amber"), fontSize: fs.caption, fontFamily: "var(--font-mono)" }} onClick={() => revokeInvite(iv.id)}>{t("w.teams.org.revoke")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {athlete && (
            <div style={{ ...card, }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={kicker("blue")}>{t("w.teams.org.athleteTwin")} · {athlete.name}</div>
                <span style={{ cursor: "pointer", color: C("ash"), fontFamily: "var(--font-mono)" }} onClick={() => setAthlete(null)}>✕</span>
              </div>
              <div style={{ display: "flex", gap: space.xl, alignItems: "baseline", marginTop: 8 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 40, color: C(hpiColor(athlete.hpi.band)) }}>{athlete.hpi.score}</div>
                <div>
                  {chip(hpiColor(athlete.hpi.band), athlete.hpi.band)}
                  {chip("amber", `${t("w.teams.org.limiter")} · ${athlete.hpi.limiter}`)}
                  {chip(athlete.injury.flaggedCount ? "red" : "lime", `${t("w.teams.org.injury")} ${athlete.injury.overall}/100`)}
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, marginTop: 8, lineHeight: 1.5, color: C("chalk") }}>{athlete.summary}</div>
              {athlete.injury.tissues ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs, marginTop: 10 }}>
                  {athlete.injury.tissues.filter((t) => t.risk > 0).map((t) => chip(hpiColor(t.band), `${t.tissue} ${t.risk}`))}
                </div>
              ) : (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 8, color: C("ash") }}>
                  {athlete.injury.flaggedCount} {t("w.teams.org.tissuesFlagged")}
                </div>
              )}
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, marginTop: 8, color: C("ash") }}>{athlete.sessionCount} {t("w.teams.org.sessionsLogged")}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
