"use client";

import { useEffect, useState } from "react";
import { LIME, CHALK, ASH, AMBER, BLUE, disp, Mono, Card, Chip } from "@/lib/ui";

type Conn = { id: string; provider: string; status: string; lastSyncAt: string | null };
type Provider = { id: string; label: string; auth: string; provides: string[]; configured: boolean };

// The Connections hub — every wearable/sensor flows into the Signal ontology.
// OAuth providers connect in-browser; Apple Health connects from the mobile app;
// team feeds (Catapult) are provisioned by an admin.
export default function Connections() {
  const [connections, setConnections] = useState<Conn[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/connections");
    if (res.ok) {
      const d = (await res.json()) as { connections: Conn[]; providers: Provider[] };
      setConnections(d.connections);
      setProviders(d.providers);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const connected = (id: string) => connections.find((c) => c.provider === id);

  const sync = async (id: string) => {
    setBusy(id);
    await fetch(`/api/connect/${id}/sync`, { method: "POST" });
    await refresh();
    setBusy(null);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card style={{ borderLeft: `3px solid ${BLUE}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>
          Connections · ingestion layer
        </Mono>
        <Mono s={{ fontSize: 13, display: "block", marginTop: 6, lineHeight: 1.5 }} c={CHALK}>
          Every device writes into one Signal stream — the engines never learn a vendor exists.
          Connect a wearable and your readiness, HPI, and injury risk update automatically.
        </Mono>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {providers.map((p) => {
          const c = connected(p.id);
          return (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ ...disp, fontWeight: 800, fontSize: 18, color: CHALK }}>{p.label}</div>
                {c ? (
                  <Chip c={c.status === "active" ? LIME : AMBER}>{c.status}</Chip>
                ) : p.configured ? (
                  <Chip c={ASH}>not connected</Chip>
                ) : (
                  <Chip c={AMBER}>setup pending</Chip>
                )}
              </div>
              <Mono s={{ fontSize: 11, display: "block", marginTop: 6 }} c={ASH}>
                {p.provides.join(" · ")}
              </Mono>

              <div style={{ marginTop: 14 }}>
                {p.auth === "native" ? (
                  <Mono s={{ fontSize: 12 }}>Connect Apple Health from the mobile app.</Mono>
                ) : p.auth === "team" ? (
                  <Mono s={{ fontSize: 12 }}>Provisioned by an admin (team feed).</Mono>
                ) : !p.configured ? (
                  <Mono s={{ fontSize: 12 }} c={AMBER}>Awaiting API credentials on this deployment.</Mono>
                ) : c ? (
                  <button
                    onClick={() => sync(p.id)}
                    disabled={busy === p.id}
                    style={btn(LIME)}
                  >
                    {busy === p.id ? "Syncing…" : c.lastSyncAt ? `Sync · last ${new Date(c.lastSyncAt).toLocaleDateString()}` : "Sync now"}
                  </button>
                ) : (
                  <a href={`/api/connect/${p.id}`} style={{ ...btn(LIME), display: "inline-block", textDecoration: "none" }}>
                    Connect →
                  </a>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return {
    fontFamily: "'Archivo', sans-serif",
    fontWeight: 800,
    fontSize: 13,
    background: bg,
    color: "#0c0d0c",
    border: "none",
    borderRadius: 10,
    padding: "9px 16px",
    cursor: "pointer",
  };
}
