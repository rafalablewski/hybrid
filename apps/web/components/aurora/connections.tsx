"use client";

import { useEffect, useState } from "react";
import { fs } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import AuroraConnectionPage from "./connection-page";

type Conn = { id: string; provider: string; status: string; lastSyncAt: string | null };
type Provider = { id: string; label: string; auth: string; provides: string[]; configured: boolean };

/** AURORA Connections (web) — the provider DIRECTORY. Each provider opens its
 *  own page (connection-page.tsx, the same focus-page pattern as the exercise
 *  page; mobile parity: /connections/[provider]). The hub only lists status at
 *  a glance — connect/sync actions and recent data live on the provider page. */
export default function AuroraConnections() {
  const { t } = useLang();
  const [connections, setConnections] = useState<Conn[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
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

  if (focus) return <AuroraConnectionPage id={focus} onBack={() => { setFocus(null); refresh(); }} />;

  const connected = (id: string) => connections.find((c) => c.provider === id && c.status !== "revoked");

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20, cursor: "pointer", textAlign: "left" as const, color: "inherit", fontFamily: "inherit" };
  const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.nano }}>{label}</span>;

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{t("w.account.connections.title")}</h1>
      <p style={{ fontSize: fs.bodyLg, lineHeight: 1.5, color: C("ash"), marginTop: 8 }}>{t("w.account.connections.intro")}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 14, marginTop: 16 }}>
        {providers.map((p) => {
          const c = connected(p.id);
          return (
            <button key={p.id} onClick={() => setFocus(p.id)} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 800, fontSize: fs.title }}>{p.label}</div>
                {c ? chip(c.status === "active" ? C("lime") : C("amber"), t(`w.account.connections.status-${c.status}`)) : p.configured ? chip(C("ash"), t("w.account.connections.not-connected")) : chip(C("amber"), t("w.account.connections.setup-pending"))}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 6 }}>{p.provides.join(" – ")}</div>
              <div style={{ fontWeight: 700, fontSize: fs.caption, marginTop: 14 }}>{t("w.account.connections.open")} →</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
