"use client";

import { useCallback, useEffect, useState } from "react";
import { groupedNav, NAV_ITEMS, sanitizePersonaAccess, sanitizeUpsellNav, type NavGroup, type Persona, type PersonaAccess } from "@hybrid/core";
import { LINE, LIME, CHALK, ASH, AMBER, VIOLET, BLUE, disp, mono, Mono, Card, Chip, Select, txt } from "@/lib/ui";

const navLabel = (id: string) => NAV_ITEMS.find((i) => i.id === id)?.label ?? id;
type AccessReq = { id: string; userEmail: string; navId: string; createdAt: string };

const PERSONAS: Persona[] = ["casual", "athlete", "coach", "admin"];
const PERSONA_LABEL: Record<Persona, string> = { casual: "Casual", athlete: "Athlete", coach: "Coach", admin: "Admin" };
const GROUP_LABEL: Record<NavGroup, string> = {
  home: "Home", train: "Train", analyze: "Analyze", recovery: "Recovery", teams: "Teams", account: "Account",
};
const KEY = "access.personaNav";
const KEY_UPSELL = "access.upsellNav";

type FlagRow = { key: string; value: unknown };

/**
 * Admin → Access control: who sees what. Per nav item, the admin sets the
 * MINIMUM persona that can see it (lower = more users — casual ⊂ athlete ⊂ coach
 * ⊂ admin). Lower "Velocity"/"Analytics" to Casual to give a retail user the
 * stats; raise an item to hide it. Stored as the access.personaNav flag value.
 */
export default function AdminAccess() {
  const [overrides, setOverrides] = useState<PersonaAccess>({});
  // Which features a casual (free) user sees as a LOCKED upgrade bait rather than
  // hidden — the admin-controlled freemium funnel (access.upsellNav flag).
  const [upsell, setUpsell] = useState<string[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState<AccessReq[]>([]);
  const groups = groupedNav();

  const load = useCallback(() => {
    fetch("/api/admin/flags")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        const rows = d.flags as FlagRow[] | undefined;
        setOverrides(sanitizePersonaAccess(rows?.find((f) => f.key === KEY)?.value));
        const upsellRow = rows?.find((f) => f.key === KEY_UPSELL);
        // absent flag → the code default (Cockpit); explicit value → as configured
        setUpsell(upsellRow ? sanitizeUpsellNav(upsellRow.value) : ["cockpit"]);
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
    const next: PersonaAccess = { ...overrides };
    if (chosen === def) delete next[id];
    else next[id] = chosen;
    setOverrides(next);
    setBusy(true);
    await fetch("/api/admin/flags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: KEY, value: next }),
    }).catch(() => {});
    setBusy(false);
  };

  // Toggle whether a (non-casual) feature is shown to casual as a locked bait.
  const toggleUpsell = async (id: string, locked: boolean) => {
    const next = locked ? [...new Set([...upsell, id])] : upsell.filter((x) => x !== id);
    setUpsell(next);
    setBusy(true);
    await fetch("/api/admin/flags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: KEY_UPSELL, value: next }),
    }).catch(() => {});
    setBusy(false);
  };

  const overrideCount = Object.keys(overrides).length;

  return (
    <div>
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
                  <button onClick={() => decide(r.id, "approve")} style={{ ...mono, fontSize: 12, fontWeight: 700, color: txt(LIME), background: `${LIME}1a`, border: `1px solid ${LIME}`, borderRadius: 9, padding: "7px 14px", cursor: "pointer" }}>Approve</button>
                  <button onClick={() => decide(r.id, "deny")} style={{ ...mono, fontSize: 12, color: txt(ASH), background: "none", border: `1px solid ${LINE}`, borderRadius: 9, padding: "7px 14px", cursor: "pointer" }}>Deny</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Mono s={{ fontSize: 12, lineHeight: 1.6, display: "block", marginBottom: 14 }} c={CHALK}>
        Set the <b>minimum persona</b> for each feature (right). Personas nest (Casual ⊂ Athlete ⊂ Coach ⊂ Admin),
        so lowering a feature exposes it to <i>more</i> users. For anything <i>above</i> casual you also choose what a
        free user sees (left): <b>hidden</b>, or <b style={{ color: txt(BLUE) }}>locked 🔒</b> — a teaser that baits the
        Full upgrade. Changes take effect on the next client load — no deploy.
        {busy ? " · saving…" : ""}
      </Mono>
      <Mono s={{ fontSize: 11, display: "block", marginBottom: 16 }} c={ASH}>
        {overrideCount} persona override{overrideCount === 1 ? "" : "s"} · {upsell.length} casual bait{upsell.length === 1 ? "" : "s"} active.
      </Mono>

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
                // The casual control only applies when the feature is ABOVE casual
                // (otherwise it's already shown to everyone). "today" is the free
                // home and can't be a bait.
                const casualAware = current !== "casual" && item.id !== "today";
                const locked = upsell.includes(item.id);
                return (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...disp, fontWeight: 700, fontSize: 14 }}>
                        {item.icon} {item.label}
                        {overridden && <span style={{ marginLeft: 8 }}><Chip c={AMBER}>overridden</Chip></span>}
                        {casualAware && locked && <span style={{ marginLeft: 8 }}><Chip c={BLUE}>🔒 casual bait</Chip></span>}
                      </div>
                      <Mono s={{ fontSize: 10, display: "block", marginTop: 2 }} c={ASH}>
                        {item.id} · default: {PERSONA_LABEL[def]}
                      </Mono>
                    </div>
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                      {casualAware && (
                        <Select
                          value={locked ? "locked" : "hidden"}
                          onChange={(e) => toggleUpsell(item.id, e.target.value === "locked")}
                          title="What a casual (free) user sees for this feature"
                        >
                          <option value="hidden">Casual: hidden</option>
                          <option value="locked">Casual: locked 🔒</option>
                        </Select>
                      )}
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
