"use client";

import { useEffect, useState } from "react";

type Conn = { id: string; provider: string; status: string; lastSyncAt: string | null };
type Provider = { id: string; label: string; auth: string; provides: string[]; configured: boolean };

/** AURORA Connections (web) — same /api/connections + /api/connect/:id flow as
 *  the classic, in the rounded Aurora style. */
export default function AuroraConnections() {
  const [connections, setConnections] = useState<Conn[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const C = (v: string) => `var(--color-${v})`;

  const refresh = async () => {
    const res = await fetch("/api/connections");
    if (res.ok) {
      const d = (await res.json()) as { connections: Conn[]; providers: Provider[] };
      setConnections(d.connections);
      setProviders(d.providers);
    }
  };
  useEffect(() => { refresh(); }, []);

  const connected = (id: string) => connections.find((c) => c.provider === id);
  const sync = async (id: string) => {
    setBusy(id);
    await fetch(`/api/connect/${id}/sync`, { method: "POST" });
    await refresh();
    setBusy(null);
  };

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 20 } as const;
  const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: 10 }}>{label}</span>;
  const pill = (border: string, fill: boolean): React.CSSProperties => ({ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, background: fill ? C("lime") : "transparent", color: fill ? C("ink") : C("chalk"), border: `1px solid ${border}`, borderRadius: 999, padding: "10px 18px", cursor: "pointer", display: "inline-block", textDecoration: "none" });

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: 26, margin: 0 }}>Connections</h1>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: C("ash"), marginTop: 8 }}>Every device writes into one Signal stream — the engines never learn a vendor exists. Connect a wearable and your readiness, HPI and injury risk update automatically.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginTop: 16 }}>
        {providers.map((p) => {
          const c = connected(p.id);
          return (
            <div key={p.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{p.label}</div>
                {c ? chip(c.status === "active" ? C("lime") : C("amber"), c.status) : p.configured ? chip(C("ash"), "not connected") : chip(C("amber"), "setup pending")}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 6 }}>{p.provides.join(" · ")}</div>
              <div style={{ marginTop: 14 }}>
                {p.auth === "native" ? (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash") }}>Connect Apple Health from the mobile app.</span>
                ) : p.auth === "team" ? (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash") }}>Provisioned by an admin (team feed).</span>
                ) : !p.configured ? (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("amber") }}>Awaiting API credentials on this deployment.</span>
                ) : c ? (
                  <button onClick={() => sync(p.id)} disabled={busy === p.id} style={pill(C("lime"), false)}>
                    {busy === p.id ? "Syncing…" : c.lastSyncAt ? `Sync · last ${new Date(c.lastSyncAt).toLocaleDateString()}` : "Sync now"}
                  </button>
                ) : (
                  <a href={`/api/connect/${p.id}`} style={pill(C("lime"), true)}>Connect →</a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
