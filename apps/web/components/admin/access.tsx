"use client";

import { useCallback, useEffect, useState } from "react";
import { groupedNav, NAV_ITEMS, sanitizePersonaAccess, type NavGroup, type Persona, type PersonaAccess } from "@hybrid/core";
import { LINE, LIME, CHALK, ASH, AMBER, VIOLET, disp, mono, Mono, Card, Chip, Select, txt } from "@/lib/ui";

const navLabel = (id: string) => NAV_ITEMS.find((i) => i.id === id)?.label ?? id;
type AccessReq = { id: string; userEmail: string; navId: string; createdAt: string };

// The role-based data-access model (RBAC) — distinct from the per-feature persona
// matrix below. Moved here (admin-only Governance) from the old user-facing
// "Roles & access" screen; the plan/entitlement matrix now lives in Financials.
const ROLE_MODEL = [
  ["Client", LIME, "Owns their own data. Sees only themselves. Private coach notes stay hidden."],
  ["Coach", VIOLET, "Sees only athletes who accepted them (mutual consent). Can leave private notes. Also a client."],
  ["Admin", AMBER, "Platform aggregates & content. No silent access to private training data; support access is audited."],
] as const;

const ROLE_PERMISSIONS = [
  { cap: "Own training data & analytics", client: "full", coach: "own", admin: "no" },
  { cap: "Other athletes' data", client: "no", coach: "consented only", admin: "aggregate" },
  { cap: "Leave coaching notes", client: "no", coach: "yes (+private)", admin: "no" },
  { cap: "Private coach notes visible", client: "no", coach: "own", admin: "no" },
  { cap: "Adjust someone's plan", client: "no", coach: "consented only", admin: "no" },
  { cap: "Platform metrics (MAU, retention)", client: "no", coach: "no", admin: "yes" },
  { cap: "Manage content & languages", client: "no", coach: "no", admin: "yes" },
  { cap: "Manage accounts & verify coaches", client: "no", coach: "no", admin: "yes" },
];

/** Read-only RBAC reference: the three roles + the data-access permission matrix.
 *  Access is enforced server-side by RELATIONSHIP, not the role label alone. */
function RoleModel() {
  const cell = (v: string) => {
    const yes = v === "full" || v === "yes" || v === "yes (+private)";
    const no = v === "no";
    return (
      <td style={{ ...mono, fontSize: 12, textAlign: "center", padding: "11px 6px", borderBottom: `1px solid ${LINE}`, color: txt(no ? ASH : yes ? LIME : AMBER) }}>
        {no ? "—" : v}
      </td>
    );
  };
  return (
    <div style={{ marginBottom: 20 }}>
      <Mono s={{ fontSize: 12, lineHeight: 1.6, display: "block", marginBottom: 14 }} c={CHALK}>
        Three roles, each scoped. Access is enforced server-side by <i>relationship</i>, not the role
        label alone.
      </Mono>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12, marginBottom: 14 }}>
        {ROLE_MODEL.map(([n, c, d]) => (
          <Card key={n} style={{ borderLeft: `3px solid ${c}` }}>
            <div style={{ ...disp, fontWeight: 800, fontSize: 16, color: txt(c) }}>{n}</div>
            <Mono s={{ fontSize: 12, lineHeight: 1.5, display: "block", marginTop: 6 }} c={CHALK}>{d}</Mono>
          </Card>
        ))}
      </div>
      <Card>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 12 }} c={ASH}>
          Permission matrix
        </Mono>
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Capability", "Client", "Coach", "Admin"].map((h, i) => (
                <th key={h} style={{ ...mono, fontSize: 11, color: txt(i === 0 ? ASH : i === 1 ? LIME : i === 2 ? VIOLET : AMBER), textTransform: "uppercase", textAlign: i === 0 ? "left" : "center", padding: "8px 6px", borderBottom: `1px solid ${LINE}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLE_PERMISSIONS.map((p) => (
              <tr key={p.cap}>
                <td style={{ ...disp, fontWeight: 600, fontSize: 13, padding: "11px 6px", borderBottom: `1px solid ${LINE}` }}>{p.cap}</td>
                {cell(p.client)}
                {cell(p.coach)}
                {cell(p.admin)}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}

const PERSONAS: Persona[] = ["casual", "athlete", "coach", "admin"];
const PERSONA_LABEL: Record<Persona, string> = { casual: "Casual", athlete: "Athlete", coach: "Coach", admin: "Admin" };
const GROUP_LABEL: Record<NavGroup, string> = {
  home: "Home", train: "Train", analyze: "Analyze", recovery: "Recovery", teams: "Teams", account: "Account",
};
const KEY = "access.personaNav";

type FlagRow = { key: string; value: unknown };

/**
 * Admin → Access control: who sees what. Per nav item, the admin sets the
 * MINIMUM persona that can see it (lower = more users — casual ⊂ athlete ⊂ coach
 * ⊂ admin). Lower "Velocity"/"Analytics" to Casual to give a retail user the
 * stats; raise an item to hide it. Stored as the access.personaNav flag value.
 */
export default function AdminAccess() {
  const [overrides, setOverrides] = useState<PersonaAccess>({});
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [requests, setRequests] = useState<AccessReq[]>([]);
  const groups = groupedNav();

  const load = useCallback(() => {
    fetch("/api/admin/flags")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        const rows = d.flags as FlagRow[] | undefined;
        setOverrides(sanitizePersonaAccess(rows?.find((f) => f.key === KEY)?.value));
      })
      .catch(() => setOverrides({}));
    fetch("/api/admin/access-requests")
      .then((r) => (r.ok ? r.json() : { requests: [] }))
      .then((d) => setRequests(d.requests ?? []))
      .catch(() => setRequests([]));
  }, []);
  useEffect(load, [load]);

  const decide = async (id: string, action: "approve" | "deny") => {
    setRequests((r) => r.filter((x) => x.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/admin/access-requests/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error();
    } catch {
      load(); // re-sync the queue from the server on failure
    }
  };

  const codeDefault = (item: { minPersona?: Persona }): Persona => item.minPersona ?? "casual";

  const change = async (id: string, def: Persona, chosen: Persona) => {
    const prev = overrides; // snapshot for rollback
    const next: PersonaAccess = { ...overrides };
    if (chosen === def) delete next[id];
    else next[id] = chosen;
    setOverrides(next);
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/flags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: KEY, value: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setOverrides(prev); // roll back the optimistic change
      setErr("Couldn't save that access change — reverted.");
    }
    setBusy(false);
  };

  const overrideCount = Object.keys(overrides).length;

  return (
    <div>
      <RoleModel />

      {unavailable && (
        <Card style={{ borderLeft: `3px solid ${AMBER}`, marginBottom: 16 }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Overrides not persisted yet</div>
          <Mono s={{ fontSize: 12, lineHeight: 1.6, display: "block" }} c={CHALK}>
            The <b>FeatureFlag</b> table doesn&apos;t exist yet — run{" "}
            <span style={{ color: txt(AMBER) }}>reference/sql-feature-flags.sql</span> in Supabase to make these persist.
            Until then the app runs on the code defaults below.
          </Mono>
        </Card>
      )}

      {requests.length > 0 && (
        <Card style={{ borderLeft: `3px solid ${VIOLET}`, marginBottom: 16 }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 10 }} c={VIOLET}>
            Pending access requests · {requests.length}
          </Mono>
          <div style={{ display: "grid", gap: 8 }}>
            {requests.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...disp, fontWeight: 700, fontSize: 14 }}>{r.userEmail}</div>
                  <Mono s={{ fontSize: 11, display: "block", marginTop: 2 }} c={ASH}>wants <b style={{ color: txt(CHALK) }}>{navLabel(r.navId)}</b></Mono>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => decide(r.id, "approve")} style={{ ...mono, fontSize: 12, fontWeight: 700, color: txt(LIME), background: `${LIME}1a`, border: `1px solid ${LIME}`, borderRadius: "var(--r-field)", padding: "7px 14px", cursor: "pointer" }}>Approve</button>
                  <button onClick={() => decide(r.id, "deny")} style={{ ...mono, fontSize: 12, color: txt(ASH), background: "none", border: `1px solid ${LINE}`, borderRadius: "var(--r-field)", padding: "7px 14px", cursor: "pointer" }}>Deny</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Mono s={{ fontSize: 12, lineHeight: 1.6, display: "block", marginBottom: 14 }} c={CHALK}>
        Set the <b>minimum persona</b> for each feature. Personas nest (Casual ⊂ Athlete ⊂ Coach ⊂ Admin),
        so lowering a feature exposes it to <i>more</i> users. Anything above casual is hidden from a free user — the
        paid upgrade is sold on the single <b style={{ color: txt(LIME) }}>Unlock Full</b> page, not as per-feature locks.
        Changes take effect on the next client load — no deploy.
        {busy ? " · saving…" : ""}
      </Mono>
      <Mono s={{ fontSize: 11, display: "block", marginBottom: 16 }} c={ASH}>
        {overrideCount} override{overrideCount === 1 ? "" : "s"} active.
      </Mono>

      {err && (
        <Mono s={{ fontSize: 12, display: "block", marginBottom: 16 }} c={AMBER}>
          {err}
        </Mono>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        {groups.map(({ group, items }) => (
          <Card key={group}>
            <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 12 }} c={VIOLET}>
              {GROUP_LABEL[group]}
            </Mono>
            <div style={{ display: "grid", gap: 8 }}>
              {items.map((item) => {
                const def = codeDefault(item);
                const current = overrides[item.id] ?? def;
                const overridden = overrides[item.id] !== undefined;
                return (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...disp, fontWeight: 700, fontSize: 14 }}>
                        {item.icon} {item.label}
                        {overridden && <span style={{ marginLeft: 8 }}><Chip c={AMBER}>overridden</Chip></span>}
                      </div>
                      <Mono s={{ fontSize: 10, display: "block", marginTop: 2 }} c={ASH}>
                        {item.id} · default: {PERSONA_LABEL[def]}
                      </Mono>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <Select value={current} onChange={(e) => change(item.id, def, e.target.value as Persona)}>
                        {PERSONAS.map((p) => (
                          <option key={p} value={p}>Visible from {PERSONA_LABEL[p]}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
