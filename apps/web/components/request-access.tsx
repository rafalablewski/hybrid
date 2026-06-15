"use client";

import { useEffect, useState } from "react";
import { NAV_ITEMS, navVisibleTo, sanitizePersonaAccess } from "@hybrid/core";
import { usePersona } from "@/lib/persona";
import { useFlags } from "@/lib/use-flags";
import { LINE, LIME, ASH, CHALK, disp, mono, Mono, Card, txt } from "@/lib/ui";

const GRANTABLE = NAV_ITEMS.filter((i) => i.minPersona && i.minPersona !== "casual");

/**
 * Lets a user ask an admin to unlock a feature their persona can't see (the
 * "Joe wants the stats → an admin grants it" path). Lists only currently-hidden
 * features; an approved one disappears (its grant makes it visible). Renders
 * nothing when there's nothing to request.
 */
export default function RequestAccess() {
  const persona = usePersona();
  const { value } = useFlags();
  const access = sanitizePersonaAccess(value("access.personaNav"));
  const [status, setStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/access-requests")
      .then((r) => (r.ok ? r.json() : { requests: [] }))
      .then((d: { requests?: { navId: string; status: string }[] }) => {
        const m: Record<string, string> = {};
        for (const req of d.requests ?? []) m[req.navId] = req.status;
        setStatus(m);
      })
      .catch(() => {});
  }, []);

  const hidden = GRANTABLE.filter((i) => !navVisibleTo(persona, i.id, access));
  if (hidden.length === 0) return null;

  const request = async (navId: string) => {
    setStatus((s) => ({ ...s, [navId]: "pending" }));
    await fetch("/api/access-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ navId }),
    }).catch(() => {});
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>Request a feature</Mono>
      <Mono s={{ fontSize: 13, display: "block", marginTop: 6, marginBottom: 12 }} c={CHALK}>
        Want a tool you don&apos;t see? Ask an admin to unlock it for your account.
      </Mono>
      <div style={{ display: "grid", gap: 6 }}>
        {hidden.map((item) => {
          const pending = status[item.id] === "pending";
          return (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "6px 0", borderBottom: `1px solid ${LINE}` }}>
              <Mono s={{ fontSize: 13 }} c={CHALK}>{item.icon} {item.label}</Mono>
              {pending ? (
                <Mono s={{ fontSize: 12 }} c={ASH}>Requested · pending</Mono>
              ) : (
                <button
                  onClick={() => request(item.id)}
                  style={{ ...mono, fontSize: 12, fontWeight: 700, color: txt(LIME), background: `${LIME}1a`, border: `1px solid ${LIME}`, borderRadius: 9, padding: "6px 14px", cursor: "pointer" }}
                >
                  Request
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
