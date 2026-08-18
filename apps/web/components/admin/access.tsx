"use client";

import { useCallback, useEffect, useState } from "react";
import { groupedNav, sanitizePersonaAccess, AURORA_NAV_ICONS, type NavGroup, type Persona, type PersonaAccess } from "@hybrid/core";
import { fs, space, LINE, LIME, CHALK, ASH, AMBER, BLUE, disp, mono, Mono, Card, Chip, Select, txt } from "@/lib/ui";
import { AuroraIcon } from "../aurora/icons";

// The role-based data-access model (RBAC) — distinct from the per-feature persona
// matrix below. Moved here (admin-only Governance) from the old user-facing
// "Roles & access" screen. The per-feature persona matrix below is now the
// only entitlement surface — the Financials console that used to hold a static
// plan-inclusion table went with the 2026-08 strategy cuts.
const ROLE_MODEL = [
  ["Client", LIME, "Owns their own data. Sees only themselves. Private coach notes stay hidden."],
  ["Coach", BLUE, "Sees only athletes who accepted them (mutual consent). Can leave private notes. Also a client."],
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
  const cell = (v: string, label: string) => {
    const yes = v === "full" || v === "yes" || v === "yes (+private)";
    const no = v === "no";
    return (
      <td data-label={label} style={{ ...mono, fontSize: fs.body, textAlign: "center", padding: "11px 6px", borderBottom: `1px solid ${LINE}`, color: txt(no ? ASH : yes ? LIME : AMBER) }}>
        {no ? "—" : v}
      </td>
    );
  };
  return (
    <div style={{ marginBottom: 20 }}>
      <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block", marginBottom: 14 }} c={CHALK}>
        Three roles, each scoped. Access is enforced server-side by <i>relationship</i>, not the role
        label alone.
      </Mono>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: space.md, marginBottom: 14 }}>
        {ROLE_MODEL.map(([n, c, d]) => (
          <Card key={n} style={{ borderLeft: `3px solid ${c}` }}>
            <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, color: txt(c) }}>{n}</div>
            <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginTop: 6 }} c={CHALK}>{d}</Mono>
          </Card>
        ))}
      </div>
      <Card>
        <Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 12 }} c={ASH}>
          Permission matrix
        </Mono>
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <table className="adm-tbl" style={{ width: "100%", minWidth: 520, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Capability", "Client", "Coach", "Admin"].map((h, i) => (
                <th key={h} style={{ ...mono, fontSize: fs.caption, color: txt(i === 0 ? ASH : i === 1 ? LIME : i === 2 ? BLUE : AMBER), textTransform: "uppercase", textAlign: i === 0 ? "left" : "center", padding: "10px 6px", borderBottom: `1px solid ${LINE}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLE_PERMISSIONS.map((p) => (
              <tr key={p.cap}>
                <td data-label="Capability" style={{ ...disp, fontWeight: 600, fontSize: fs.bodyLg, padding: "11px 6px", borderBottom: `1px solid ${LINE}` }}>{p.cap}</td>
                {cell(p.client, "Client")}
                {cell(p.coach, "Coach")}
                {cell(p.admin, "Admin")}
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
  home: "Home", train: "Train", analyze: "Analyze", recovery: "Recovery", social: "Social", teams: "Teams", account: "Account",
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
  }, []);
  useEffect(load, [load]);

  const codeDefault = (item: { minPersona?: Persona }): Persona => item.minPersona ?? "casual";

  const change = async (id: string, def: Persona, chosen: Persona) => {
    const prev = { ...overrides }; // snapshot for rollback
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
          <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, marginBottom: 6 }}>Overrides not persisted yet</div>
          <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block" }} c={CHALK}>
            The <b>FeatureFlag</b> table doesn&apos;t exist yet — run{" "}
            <span style={{ color: txt(AMBER) }}>reference/sql-feature-flags.sql</span> in Supabase to make these persist.
            Until then the app runs on the code defaults below.
          </Mono>
        </Card>
      )}

      <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block", marginBottom: 14 }} c={CHALK}>
        Set the <b>minimum persona</b> for each feature. Personas nest (Casual ⊂ Athlete ⊂ Coach ⊂ Admin),
        so lowering a feature exposes it to <i>more</i> users. Anything above casual is hidden from a free user — the
        paid upgrade is sold on the single <b style={{ color: txt(LIME) }}>Unlock Full</b> page, not as per-feature locks.
        Changes take effect on the next client load — no deploy.
        {busy ? " – saving…" : ""}
      </Mono>
      <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 16 }} c={ASH}>
        {overrideCount} override{overrideCount === 1 ? "" : "s"} active.
      </Mono>

      {err && (
        <div role="alert">
          <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 16 }} c={AMBER}>
            {err}
          </Mono>
        </div>
      )}

      <div style={{ display: "grid", gap: space.lg }}>
        {groups.map(({ group, items }) => (
          <Card key={group}>
            <Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 12 }} c={BLUE}>
              {GROUP_LABEL[group]}
            </Mono>
            <div style={{ display: "grid", gap: space.sm }}>
              {items.map((item) => {
                const def = codeDefault(item);
                const current = overrides[item.id] ?? def;
                const overridden = overrides[item.id] !== undefined;
                return (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.md, padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...disp, fontWeight: 700, fontSize: fs.bodyLg, display: "flex", alignItems: "center", gap: 8 }}>
                        <AuroraIcon name={AURORA_NAV_ICONS[item.id] ?? "info"} size={18} strokeWidth={2.6} color={CHALK} />
                        {item.label}
                        {overridden && <Chip c={AMBER}>overridden</Chip>}
                      </div>
                      <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 2 }} c={ASH}>
                        {item.id} – default: {PERSONA_LABEL[def]}
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
