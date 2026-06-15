"use client";

import { useCallback, useEffect, useState } from "react";
import { groupedNav, sanitizePersonaAccess, type NavGroup, type Persona, type PersonaAccess } from "@hybrid/core";
import { LINE, LIME, CHALK, ASH, AMBER, VIOLET, disp, mono, Mono, Card, Chip, Select, txt } from "@/lib/ui";

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
  const groups = groupedNav();

  const load = useCallback(() => {
    fetch("/api/admin/flags")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        const row = (d.flags as FlagRow[] | undefined)?.find((f) => f.key === KEY);
        setOverrides(sanitizePersonaAccess(row?.value));
      })
      .catch(() => setOverrides({}));
  }, []);
  useEffect(load, [load]);

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

      <Mono s={{ fontSize: 12, lineHeight: 1.6, display: "block", marginBottom: 14 }} c={CHALK}>
        Set the <b>minimum persona</b> for each feature. Personas nest (Casual ⊂ Athlete ⊂ Coach ⊂ Admin),
        so lowering a feature exposes it to <i>more</i> users. Changes take effect on the next client load — no deploy.
        {busy ? " · saving…" : ""}
      </Mono>
      <Mono s={{ fontSize: 11, display: "block", marginBottom: 16 }} c={ASH}>
        {overrideCount} override{overrideCount === 1 ? "" : "s"} active.
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
