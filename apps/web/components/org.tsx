"use client";

import { useEffect, useState } from "react";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, disp, mono, Mono, Card, Chip } from "@/lib/ui";
import {
  buildTeamTree,
  flattenTree,
  canManageOrg,
  roleScope,
  type OrgRole,
  type TeamNode,
} from "@hybrid/core";

type Org = { id: string; name: string; role: OrgRole };
type Member = { id: string; name: string; role: OrgRole; teamId: string | null; email?: string };
type Detail = { org: { id: string; name: string }; myRole: OrgRole; teams: TeamNode[]; members: Member[] };

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

  const tree = detail ? flattenTree(buildTeamTree(detail.teams)) : [];
  const canManage = detail ? canManageOrg(detail.myRole) : false;

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
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            value={newOrg}
            onChange={(e) => setNewOrg(e.target.value)}
            placeholder="New organization name"
            style={input}
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
                  <input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="New team" style={input} />
                  <select value={newTeamParent} onChange={(e) => setNewTeamParent(e.target.value)} style={input}>
                    <option value="">(top level)</option>
                    {tree.map((t) => (
                      <option key={t.id} value={t.id}>{"— ".repeat(t.depth)}{t.name}</option>
                    ))}
                  </select>
                  <button onClick={addTeam} style={btn(LIME)}>Add team</button>
                </div>
              )}
            </Card>

            <Card>
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Staff & athletes</Mono>
              <div style={{ marginTop: 12 }}>
                {detail.members.map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
                    <Mono s={{ fontSize: 14 }} c={CHALK}>{m.name}{m.email ? ` · ${m.email}` : ""}</Mono>
                    <Chip c={ROLE_COLOR[m.role]}>{m.role.toLowerCase()}</Chip>
                  </div>
                ))}
              </div>
            </Card>
          </div>
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
  return { ...disp, fontWeight: 800, fontSize: 13, background: bg, color: "#0c0d0c", border: "none", borderRadius: 10, padding: "9px 16px", cursor: "pointer" };
}
function chip(active: boolean): React.CSSProperties {
  return { ...mono, fontSize: 12, padding: "7px 12px", borderRadius: 8, cursor: "pointer", background: active ? `${LIME}1a` : "transparent", color: active ? LIME : ASH, border: `1px solid ${active ? LIME : LINE}` };
}
