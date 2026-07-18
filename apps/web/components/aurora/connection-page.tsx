"use client";

import { useCallback, useEffect, useState } from "react";
import { fs } from "@hybrid/core";
import { useLang } from "@/lib/i18n";

type Conn = { id: string; provider: string; status: string; lastSyncAt: string | null };
type Provider = { id: string; label: string; auth: string; provides: string[]; configured: boolean };
type SignalRow = { kind: string; value: number; unit: string; source: string; ts: string };

/** AURORA Connection detail (web) — ONE provider's own page (the same focus-
 *  page pattern as the exercise page; mobile parity: /connections/[provider]).
 *  Status + connect/sync actions + the latest Signal rows this source wrote.
 *  Apple is native-only, so here it explains the phone flow and still shows the
 *  relayed data. */
export default function AuroraConnectionPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useLang();
  const [connections, setConnections] = useState<Conn[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [busy, setBusy] = useState(false);
  const C = (v: string) => `var(--color-${v})`;

  const refresh = useCallback(async () => {
    const [cRes, sRes] = await Promise.all([fetch("/api/connections"), fetch("/api/signals")]);
    if (cRes.ok) {
      const d = (await cRes.json()) as { connections: Conn[]; providers: Provider[] };
      setConnections(d.connections);
      setProviders(d.providers);
    }
    if (sRes.ok) {
      const d = (await sRes.json()) as { signals?: SignalRow[] };
      setSignals((d.signals ?? []).filter((s) => s.source === id));
    }
  }, [id]);
  useEffect(() => { refresh(); }, [refresh]);

  const p = providers.find((x) => x.id === id);
  const conn = connections.find((c) => c.provider === id && c.status !== "revoked");

  const sync = async () => {
    setBusy(true);
    await fetch(`/api/connect/${id}/sync`, { method: "POST" });
    await refresh();
    setBusy(false);
  };

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;
  const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.nano }}>{label}</span>;
  const pill = (border: string, fill: boolean): React.CSSProperties => ({ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, background: fill ? C("lime") : "transparent", color: fill ? C("ink") : C("chalk"), border: `1px solid ${border}`, borderRadius: 999, padding: "10px 18px", cursor: "pointer", display: "inline-block", textDecoration: "none" });

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: C("ash"), fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, cursor: "pointer", padding: 0 }}>
        ← {t("w.account.connections.title")}
      </button>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: "10px 0 0" }}>{p?.label ?? id}</h1>

      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontWeight: 800, fontSize: fs.title }}>{t("w.account.connections.title")}</div>
          {conn ? chip(conn.status === "active" ? C("lime") : C("amber"), t(`w.account.connections.status-${conn.status}`)) : p?.configured ? chip(C("ash"), t("w.account.connections.not-connected")) : p ? chip(C("amber"), t("w.account.connections.setup-pending")) : null}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 6 }}>{(p?.provides ?? []).join(" – ")}</div>
        {conn?.lastSyncAt ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 4 }}>
            {t("w.account.connections.sync-last")} {new Date(conn.lastSyncAt).toLocaleString()}
          </div>
        ) : null}
        <div style={{ marginTop: 14 }}>
          {p?.auth === "native" ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.account.connections.native")}</span>
          ) : p?.auth === "team" ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.account.connections.team")}</span>
          ) : p && !p.configured ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("amber") }}>{t("w.account.connections.awaiting-creds")}</span>
          ) : p && conn ? (
            <button onClick={sync} disabled={busy} style={pill(C("lime"), false)}>
              {busy ? t("w.account.connections.syncing") : t("w.account.connections.sync-now")}
            </button>
          ) : p ? (
            <a href={`/api/connect/${p.id}`} style={pill(C("lime"), true)}>{t("w.account.connections.connect")} →</a>
          ) : null}
        </div>
      </div>

      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ fontWeight: 800, fontSize: fs.title }}>{t("w.account.connections.recent")}</div>
        {signals.length === 0 ? (
          <div style={{ fontSize: fs.caption, color: C("ash"), marginTop: 10 }}>{t("w.account.connections.recent-empty")}</div>
        ) : (
          signals.slice(0, 10).map((s, i) => (
            <div key={`${s.kind}-${s.ts}-${i}`} style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontFamily: "var(--font-mono)", fontSize: fs.micro }}>
              <span style={{ color: C("ash") }}>{s.kind}</span>
              <span>{s.value} {s.unit} – {new Date(s.ts).toLocaleDateString()}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
