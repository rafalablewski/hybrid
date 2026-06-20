"use client";

import { useEffect, useState } from "react";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, ON_ACCENT, disp, mono, txt, Mono, Card, Chip, Select } from "@/lib/ui";
import { useIsMobile } from "@/lib/use-media-query";
import {
  buildTeamTree,
  flattenTree,
  canManageOrg,
  canRead,
  roleScope,
  ORG_ROLES,
  type OrgRole,
  type TeamNode,
} from "@hybrid/core";

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

const hpiColor = (b: string) =>
  b === "peak" || b === "primed" || b === "low" ? LIME : b === "moderate" ? BLUE : b === "compromised" || b === "elevated" ? AMBER : RED;

const ROLE_COLOR: Record<OrgRole, string> = {
  OWNER: LIME,
  DIRECTOR: LIME,
  COACH: BLUE,
  MEDICAL: AMBER,
  ANALYST: VIOLET,
  ATHLETE: ASH,
};

// The Org Graph — a club/federation as one governed organization: a team
// hierarchy (first team → academy → U12) + staff with role-scoped access.
export default function Org() {
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
      setInviteErr(d.pending ? "Invited — they'll join on first sign-in." : "");
      loadDetail(selected);
    } else {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setInviteErr(d.error ?? "could not add member");
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

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card style={{ borderLeft: `3px solid ${LIME}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          Org Graph · Team Operating System
        </Mono>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          {orgs.map((o) => (
            <button key={o.id} onClick={() => setSelected(o.id)} style={chip(o.id === selected)}>
              {o.name} · {o.role.toLowerCase()}
            </button>
          ))}
          {orgs.length === 0 && <Mono s={{ fontSize: 13 }}>No organizations yet — create one to run a club or academy.</Mono>}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input
            value={newOrg}
            onChange={(e) => setNewOrg(e.target.value)}
            placeholder="New organization name"
            style={{ ...input, flex: 1, minWidth: 180 }}
          />
          <button onClick={createOrg} style={btn(LIME)}>Create org</button>
        </div>
      </Card>

      {detail && (
        <>
          <Card>
            <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>
              Your access · {detail.myRole.toLowerCase()}
            </Mono>
            <Mono s={{ fontSize: 13, display: "block", marginTop: 6 }} c={CHALK}>{roleScope(detail.myRole)}</Mono>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <Card>
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Team hierarchy</Mono>
              <div style={{ marginTop: 12 }}>
                {tree.length === 0 && <Mono s={{ fontSize: 13 }}>No teams yet.</Mono>}
                {tree.map((t) => {
                  const count = detail.members.filter((m) => m.teamId === t.id).length;
                  return (
                    <div
                      key={t.id}
                      style={{
                        padding: "8px 10px",
                        marginLeft: t.depth * 18,
                        borderLeft: `2px solid ${t.depth ? LINE : LIME}`,
                        marginBottom: 4,
                      }}
                    >
                      <Mono s={{ fontSize: 14 }} c={CHALK}>{t.name}</Mono>
                      {count > 0 && <Mono s={{ fontSize: 11, marginLeft: 8 }} c={ASH}>{count} member{count === 1 ? "" : "s"}</Mono>}
                    </div>
                  );
                })}
              </div>
              {canManage && (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="New team" style={{ ...input, flex: 1, minWidth: 140 }} />
                  <Select value={newTeamParent} onChange={(e) => setNewTeamParent(e.target.value)}>
                    <option value="">(top level)</option>
                    {tree.map((t) => (
                      <option key={t.id} value={t.id}>{"— ".repeat(t.depth)}{t.name}</option>
                    ))}
                  </Select>
                  <button onClick={addTeam} style={btn(LIME)}>Add team</button>
                </div>
              )}
            </Card>

            <Card>
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Staff & athletes</Mono>
              <div style={{ marginTop: 12 }}>
                {detail.members.map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
                    <div style={{ minWidth: 0 }}>
                      <Mono s={{ fontSize: 14, display: "block" }} c={m.role === "ATHLETE" && canSeeAthletes ? BLUE : CHALK}>
                        {m.role === "ATHLETE" && canSeeAthletes ? (
                          <span style={{ cursor: "pointer" }} onClick={() => viewAthlete(m)}>{m.name} →</span>
                        ) : (
                          m.name
                        )}
                        {m.email ? <span style={{ color: txt(ASH) }}> · {m.email}</span> : null}
                      </Mono>
                      <Mono s={{ fontSize: 10 }} c={ASH}>{teamName(m.teamId)}</Mono>
                    </div>
                    {canManage ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <Select value={m.role} onChange={(e) => setMember(m.id, { role: e.target.value as OrgRole })} style={{ fontSize: 11, paddingTop: 5, paddingBottom: 5, paddingLeft: 7 }}>
                          {ORG_ROLES.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
                        </Select>
                        <Select value={m.teamId ?? ""} onChange={(e) => setMember(m.id, { teamId: e.target.value || null })} style={{ fontSize: 11, paddingTop: 5, paddingBottom: 5, paddingLeft: 7 }}>
                          <option value="">no team</option>
                          {tree.map((t) => <option key={t.id} value={t.id}>{"— ".repeat(t.depth)}{t.name}</option>)}
                        </Select>
                      </div>
                    ) : (
                      <Chip c={ROLE_COLOR[m.role]}>{m.role.toLowerCase()}</Chip>
                    )}
                  </div>
                ))}
              </div>
              {canManage && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="member@email.com" style={{ ...input, flex: 1, minWidth: 160 }} />
                    <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrgRole)}>
                      {ORG_ROLES.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
                    </Select>
                    <button onClick={invite} style={btn(LIME)}>Add member</button>
                  </div>
                  {inviteErr && <Mono s={{ fontSize: 11, display: "block", marginTop: 6 }} c={AMBER}>{inviteErr}</Mono>}
                </div>
              )}
              {canManage && detail.invites.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>Pending invites</Mono>
                  {detail.invites.map((iv) => (
                    <div key={iv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${LINE}` }}>
                      <Mono s={{ fontSize: 12 }} c={ASH}>{iv.email} · {iv.role.toLowerCase()}</Mono>
                      <span style={{ cursor: "pointer", color: txt(AMBER), fontSize: 12 }} onClick={() => revokeInvite(iv.id)}>revoke</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {athlete && (
            <Card style={{ borderLeft: `3px solid ${hpiColor(athlete.hpi.band)}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>
                  Athlete Twin · {athlete.name}
                </Mono>
                <span style={{ cursor: "pointer", color: txt(ASH), fontFamily: "monospace" }} onClick={() => setAthlete(null)}>✕</span>
              </div>
              <div style={{ display: "flex", gap: 20, alignItems: "baseline", marginTop: 8 }}>
                <div style={{ ...disp, fontWeight: 900, fontSize: 40, color: txt(hpiColor(athlete.hpi.band)) }}>{athlete.hpi.score}</div>
                <div>
                  <Chip c={hpiColor(athlete.hpi.band)}>{athlete.hpi.band}</Chip>
                  <Chip c={AMBER}>limiter · {athlete.hpi.limiter}</Chip>
                  <Chip c={athlete.injury.flaggedCount ? RED : LIME}>injury {athlete.injury.overall}/100</Chip>
                </div>
              </div>
              <Mono s={{ fontSize: 13, display: "block", marginTop: 8, lineHeight: 1.5 }} c={CHALK}>{athlete.summary}</Mono>
              {athlete.injury.tissues ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {athlete.injury.tissues.filter((t) => t.risk > 0).map((t) => (
                    <Chip key={t.tissue} c={hpiColor(t.band)}>{t.tissue} {t.risk}</Chip>
                  ))}
                </div>
              ) : (
                <Mono s={{ fontSize: 11, display: "block", marginTop: 8 }} c={ASH}>
                  {athlete.injury.flaggedCount} tissue(s) flagged · tissue-level detail is medical-tier
                </Mono>
              )}
              <Mono s={{ fontSize: 10, display: "block", marginTop: 8 }} c={ASH}>{athlete.sessionCount} sessions logged</Mono>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

const input: React.CSSProperties = {
  ...mono,
  fontSize: 14,
  padding: "9px 11px",
  borderRadius: 10,
  background: INK2,
  color: CHALK,
  border: `1px solid ${LINE}`,
  outline: "none",
};
function btn(bg: string): React.CSSProperties {
  return { ...disp, fontWeight: 800, fontSize: 13, background: bg, color: ON_ACCENT, border: "none", borderRadius: 10, padding: "9px 16px", cursor: "pointer" };
}
function chip(active: boolean): React.CSSProperties {
  return { ...mono, fontSize: 12, padding: "7px 12px", borderRadius: 8, cursor: "pointer", background: active ? `${LIME}1a` : "transparent", color: txt(active ? LIME : ASH), border: `1px solid ${active ? LIME : LINE}` };
}
